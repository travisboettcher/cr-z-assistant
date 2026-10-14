import { describe, expect, it } from 'vitest';
import type { BaseId } from '../data/bases';
import { queued } from '../test/queued';
import { submitBaseMove } from './advancementForms';
import { createNewCampaign, type Campaign } from './campaign';
import { submitBaseClaim } from './campaignForms';
import { chosenWeapons, turnoutGear, weaponsProblem } from './handover';
import type { CampaignEvent, LogEntry } from './log';
import { completeProjects, dueProjects, weaponsOwed } from './projects';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-14T09:00:00.000Z';

function accepted(result: ReturnType<typeof submitBaseClaim>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const fresh = (): Campaign => createNewCampaign('Cedar Hollow', FIXED);

describe('Turnout Gear (pg. 66; R46)', () => {
  it('is six standard reinforced clothing at a Regional Firehouse, and nothing anywhere else', () => {
    const gear = turnoutGear(fresh(), 'regional-firehouse');

    expect(gear).toHaveLength(6);
    expect(new Set(gear.map((item) => `${item.grade} ${item.item}`))).toEqual(
      new Set(['standard reinforced-clothing']),
    );
    expect(new Set(gear.map((item) => item.id)).size).toBe(6);
    expect(turnoutGear(fresh(), 'hobby-farm')).toEqual([]);
  });

  it('arrives with a first claim of the Firehouse, after the stocking', () => {
    const after = accepted(submitBaseClaim(fresh(), 'regional-firehouse', AT));

    expect(after.inventory).toHaveLength(6);
    expect(after.log.map((entry) => entry.event.kind)).toEqual([
      'base-claimed',
      'base-stocked',
      'equipment-handed-over',
    ]);
    expect(after.log.at(-1)?.event).toMatchObject({
      kind: 'equipment-handed-over',
      base: 'regional-firehouse',
      items: after.inventory,
    });
    expect(accepted(submitBaseClaim(fresh(), 'hobby-farm', AT)).inventory).toEqual([]);
  });

  it('arrives with a move into one, on top of what the Inventory held', () => {
    const mission = (event: CampaignEvent): LogEntry => ({
      turn: 4,
      phase: 'mission',
      at: AT,
      event,
    });
    const moving: Campaign = {
      ...fresh(),
      turn: 4,
      step: 'add-facilities-and-upgrades',
      base: { id: 'hobby-farm', slots: {} },
      inventory: [{ id: 'bow', item: 'bow', grade: 'standard' }],
      log: [
        mission({
          kind: 'mission-selected',
          team: 1,
          mission: 'claim-a-new-base',
          names: [],
          base: 'regional-firehouse',
        }),
        mission({
          kind: 'claim-a-new-base-resolved',
          team: 1,
          endCondition: 1,
          strangers: [],
          vehiclesOnArea: 0,
        }),
      ],
    };
    const after = accepted(submitBaseMove(moving, [], AT));

    expect(after.base?.id).toBe('regional-firehouse');
    expect(after.inventory).toHaveLength(7);
    expect(after.log.map((entry) => entry.event.kind).slice(-2)).toEqual([
      'base-moved',
      'equipment-handed-over',
    ]);
  });
});

describe('the Outdoor Sports Shop’s weapons (pg. 62; R45)', () => {
  /** Turn 4, its Inventory slot cleared on turn 3's order and due now. */
  const due = (): Campaign => ({
    ...fresh(),
    turn: 4,
    step: 'add-facilities-and-upgrades',
    base: { id: 'outdoor-sports-shop' as BaseId, slots: {} },
    projects: [queued({ kind: 'clearing', slot: 'inventory', orderedOnTurn: 3 })],
  });

  it('asks for four core weapons, repeats allowed', () => {
    expect(weaponsOwed(due())).toEqual({ slot: 'inventory', count: 4 });
    expect(weaponsOwed(fresh())).toBeNull();
    expect(weaponsProblem(['bow', 'bow', 'rifle', 'blunt'], 4)).toBeNull();
    expect(weaponsProblem(['bow'], 4)).toBe('Clearing it hands over 4 standard weapons: choose 4.');
    expect(weaponsProblem(['bow', 'bow', 'rifle', 'riot-shield'], 4)).toBe(
      'They are standard weapons of the nine core kinds.',
    );
  });

  it('waits, still due, until they are chosen', () => {
    const { campaign, completed, handedOver } = completeProjects(due());

    expect(completed).toEqual([]);
    expect(handedOver).toBeNull();
    expect(dueProjects(campaign)).toHaveLength(1);
  });

  it('clears the slot and hands them over once chosen', () => {
    const weapons = ['bow', 'bow', 'rifle', 'blunt'] as const;
    const { campaign, completed, handedOver } = completeProjects(due(), weapons);

    expect(completed).toHaveLength(1);
    expect(campaign.base?.slots.inventory?.cleared).toBe(true);
    expect(dueProjects(campaign)).toEqual([]);
    expect(handedOver).toEqual({ slot: 'inventory', items: chosenWeapons(due(), weapons) });
    expect(handedOver?.items.map((item) => [item.item, item.grade])).toEqual([
      ['bow', 'standard'],
      ['bow', 'standard'],
      ['rifle', 'standard'],
      ['blunt', 'standard'],
    ]);
  });
});
