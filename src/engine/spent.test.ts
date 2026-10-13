import { describe, expect, it } from 'vitest';
import type { Grade, ItemId } from '../data/equipment';
import { createNewCampaign, type Assignment, type Campaign, type Item } from './campaign';
import { submitRemoval } from './campaignForms';
import type { LogEntry } from './log';
import { submitItemsSpent } from './missionForms';
import { outstanding } from './outstanding';
import {
  alwaysSpent,
  offeredAsUsed,
  spentItems,
  spentOwed,
  spentProblem,
  teamCarries,
  withItemsLeftBehind,
} from './spent';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';

const item = (id: string, kind: ItemId, grade: Grade = 'standard'): Item => ({
  id,
  item: kind,
  grade,
});

const grenade = item('grenade-1', 'grenade');
const shield = item('shield-1', 'improvised-shield');
const riot = item('riot-1', 'riot-shield');
const pistol = item('pistol-1', 'pistol', 'shoddy');

const earl = { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), items: [grenade, riot] };
const carla = { ...createSurvivor('Carla Proust', 3, { id: 'carla' }), items: [shield] };
const nell = { ...createSurvivor('Nell Haig', 2, { id: 'nell' }), items: [item('bow-1', 'bow')] };

const onTeam = (team: number): Assignment => ({ task: 'mission', team });

/** Turn 4 at Play the Mission: Earl and Carla on team 1, Nell at home. */
function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors: [earl, carla, nell],
    assignments: { earl: onTeam(1), carla: onTeam(1) },
    ...overrides,
  };
}

/** The campaign after a record the test expects to go through. */
function after(campaign: Campaign, team: number, ticked: readonly string[]): Campaign {
  const result = submitItemsSpent(campaign, team, ticked, AT);
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const carried = (campaign: Campaign, id: string) =>
  campaign.survivors.find((survivor) => survivor.id === id)?.items.map((held) => held.id);

describe('what each kind of item does after a mission (pp. 40, 45–48)', () => {
  it('takes one-mission gear whatever happens, and offers disposables as used', () => {
    expect(alwaysSpent(shield)).toBe(true);
    expect(alwaysSpent(grenade)).toBe(false);
    expect(alwaysSpent(riot)).toBe(false);
    expect(offeredAsUsed(grenade)).toBe(true);
    expect(offeredAsUsed(riot)).toBe(false);
    // Used up only when worn through (pg. 45), so not offered as used.
    expect(offeredAsUsed(item('armor', 'improvised-armor'))).toBe(false);
  });
});

describe('recording what a mission used (Z5-5)', () => {
  it('lists what the team going out carries, and nothing of anybody at home', () => {
    expect(
      teamCarries(playing(), 1).map(({ survivor, item: held }) => [survivor.id, held.id]),
    ).toEqual([
      ['earl', 'grenade-1'],
      ['earl', 'riot-1'],
      ['carla', 'shield-1'],
    ]);
    expect(teamCarries(playing(), 2)).toEqual([]);
  });

  it('takes a thrown grenade, and leaves a riot shield (pg. 51)', () => {
    const spent = after(playing(), 1, ['grenade-1']);

    expect(carried(spent, 'earl')).toEqual(['riot-1']);
    // The improvised shield goes with it, unticked (pg. 45).
    expect(carried(spent, 'carla')).toEqual([]);
    expect(spent.log.at(-1)?.event).toEqual({
      kind: 'items-spent',
      team: 1,
      items: [
        {
          id: 'grenade-1',
          item: 'grenade',
          grade: 'standard',
          survivor: 'earl',
          name: 'Earl Rhodes',
        },
        {
          id: 'shield-1',
          item: 'improvised-shield',
          grade: 'standard',
          survivor: 'carla',
          name: 'Carla Proust',
        },
      ],
    });
  });

  it('records lost gear the table ticks, and only what the team carries', () => {
    expect(spentItems(playing(), 1, ['riot-1']).map((one) => one.id)).toEqual([
      'riot-1',
      'shield-1',
    ]);
    expect(spentProblem(playing(), 1, ['bow-1'])).toBe(
      'Only what mission team 1 carries can be used up on its mission.',
    );
  });

  it('refuses a record with nothing in it, or for a team carrying nothing', () => {
    const unshielded = playing({ survivors: [{ ...carla, items: [] }, earl, nell] });

    expect(spentProblem(unshielded, 1, [])).toBe('Nothing is ticked as used up or lost.');
    expect(spentProblem(playing(), 2, [])).toBe('Mission team 2 carries nothing to use up.');
    // One-mission gear alone is something to record.
    expect(spentProblem(playing(), 1, [])).toBeNull();
  });

  it('is recorded in the Mission Phase', () => {
    expect(spentProblem(playing({ step: 'heal-wounds' }), 1, ['grenade-1'])).toBe(
      'What a mission used is recorded in the Mission Phase.',
    );
    expect(submitItemsSpent(playing({ step: 'heal-wounds' }), 1, [], AT).ok).toBe(false);
  });
});

describe('one-mission gear the turn still owes (pp. 40, 45, 47)', () => {
  it('is owed by a team carrying it, until the team records', () => {
    expect(spentOwed(playing())).toEqual([1]);
    expect(outstanding(playing())).toContainEqual({
      step: 'tactical-mission',
      says: 'Mission team 1 carries gear that lasts one mission, and what it used is not recorded.',
    });
    expect(spentOwed(after(playing(), 1, []))).toEqual([]);
  });

  it('is not owed for a team carrying only what lasts', () => {
    expect(spentOwed(playing({ survivors: [earl, { ...carla, items: [] }, nell] }))).toEqual([]);
  });

  it('is not owed by somebody at home with such gear', () => {
    const home = playing({ survivors: [{ ...nell, items: [shield] }], assignments: {} });

    expect(spentOwed(home)).toEqual([]);
  });

  it('is not owed when the community opted out', () => {
    const skipped: LogEntry = {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-skipped' },
    };

    expect(spentOwed(playing({ log: [skipped] }))).toEqual([]);
  });
});

describe('what a survivor leaving the roster carried', () => {
  it('goes into the base’s Inventory, an entry for each, and shoddy gear back to the supply', () => {
    const leaving = { ...nell, items: [item('bow-1', 'bow'), pistol] };
    const left = withItemsLeftBehind(playing({ survivors: [earl, carla] }), [leaving], AT);

    expect(left.inventory).toEqual([item('bow-1', 'bow')]);
    expect(left.log.map((entry) => entry.event)).toEqual([
      {
        kind: 'item-moved',
        id: 'bow-1',
        item: 'bow',
        grade: 'standard',
        from: { survivor: 'nell', name: 'Nell Haig' },
        to: 'base',
      },
      {
        kind: 'item-moved',
        id: 'pistol-1',
        item: 'pistol',
        grade: 'shoddy',
        from: { survivor: 'nell', name: 'Nell Haig' },
        to: 'free',
      },
    ]);
  });

  it('is left behind by somebody taken off the roster', () => {
    const result = submitRemoval(playing(), 'nell', AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.inventory).toEqual([item('bow-1', 'bow')]);
    expect(result.campaign.log.map((entry) => entry.event.kind)).toEqual([
      'survivor-left',
      'item-moved',
    ]);
  });
});
