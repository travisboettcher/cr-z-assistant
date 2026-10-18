import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import type { LogEntry } from './log';
import {
  lostRescueProblem,
  lostRollPasses,
  lostRollProblem,
  lostRollsDue,
  placedLost,
  rescuesDue,
} from './lostRoll';
import { submitLostRescued, submitLostRolled } from './missionForms';
import { outstanding } from './outstanding';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const june = (xpSpent: number, overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('June Park', 2, { id: 'june' }),
  xp: 3,
  xpSpent,
  ...overrides,
});
const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const carla = createSurvivor('Carla Proust', 3, { id: 'carla' });

/** Turn 4's Select Mission in a Cosmic Horror campaign: Earl on team 1, Carla on team 2, June Lost. */
function selecting(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'select-mission',
    origin: 'cosmic-horror',
    survivors: [earl, carla],
    lost: [june(10)],
    assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 2 } },
    ...overrides,
  };
}

const entry = (event: LogEntry['event'], turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

function accepted(result: ReturnType<typeof submitLostRolled>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('the roll (pp. 25, 124; R108)', () => {
  it('is the d10 and the XP spent against 18, a check with its natural results', () => {
    expect(lostRollPasses(june(10), 8)).toBe(true);
    expect(lostRollPasses(june(10), 7)).toBe(false);
    expect(lostRollPasses(june(30), 1)).toBe(false);
    expect(lostRollPasses(june(0), 10)).toBe(true);
    expect(lostRollPasses(june(16), 2)).toBe(true);
  });
});

describe('who rolls (R108, R150)', () => {
  it('is everybody Lost, once a turn, in the Mission Phase before any outcome', () => {
    expect(lostRollsDue(selecting()).map((one) => one.id)).toEqual(['june']);
    expect(lostRollsDue(selecting({ step: 'tactical-mission' })).map((one) => one.id)).toEqual([
      'june',
    ]);
    expect(lostRollsDue(selecting({ step: 'heal-wounds' }))).toEqual([]);

    const rolled = accepted(submitLostRolled(selecting(), 'june', 3, null, AT));
    expect(lostRollsDue(rolled)).toEqual([]);
    expect(lostRollsDue({ ...rolled, turn: 5 }).map((one) => one.id)).toEqual(['june']);
  });

  it('is nobody on a turn with no mission, skipped or with no team (R150)', () => {
    expect(lostRollsDue(selecting({ log: [entry({ kind: 'mission-skipped' })] }))).toEqual([]);
    expect(lostRollsDue(selecting({ assignments: {} }))).toEqual([]);
  });

  it('is nobody once a mission’s outcome is recorded', () => {
    const played = selecting({
      log: [
        entry({ kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] }),
        entry({
          kind: 'rescue-strangers-resolved',
          team: 1,
          strangers: [],
          wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2, madness: 0 }],
        }),
      ],
    });

    expect(lostRollsDue(played)).toEqual([]);
  });

  it('is owed at Select Mission', () => {
    expect(outstanding(selecting()).map((one) => one.says)).toContain(
      'A Lost survivor hasn’t made the Lost roll.',
    );
  });
});

describe('recording it (R108)', () => {
  it('gives 1 XP on a fail, and logs the roll', () => {
    const after = accepted(submitLostRolled(selecting(), 'june', 3, null, AT));

    expect(after.lost.map((one) => one.xp)).toEqual([4]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'lost-rolled',
      survivor: 'june',
      name: 'June Park',
      roll: 3,
      xpSpent: 10,
    });
    expect(placedLost(after, 1)).toEqual([]);
  });

  it('places them with the team chosen on a pass, with no XP', () => {
    const after = accepted(submitLostRolled(selecting(), 'june', 9, 2, AT));

    expect(after.lost.map((one) => one.xp)).toEqual([3]);
    expect(after.log.at(-1)?.event).toMatchObject({ roll: 9, team: 2 });
    expect(placedLost(after, 2).map((one) => one.id)).toEqual(['june']);
    expect(placedLost(after, 1)).toEqual([]);
    expect(placedLost({ ...after, turn: 5 }, 2)).toEqual([]);
  });

  it('refuses nobody owed, a fail with a team, a pass without one, or a team not playing', () => {
    expect(lostRollProblem(selecting(), 'earl', 3, null)).toBe('Nobody Lost is owed a roll now.');
    expect(lostRollProblem(selecting(), 'june', 3, 1)).toBe(
      'A roll under 18 places them on no mission.',
    );
    expect(lostRollProblem(selecting(), 'june', 9, null)).toBe(
      'Choose the mission team they join.',
    );
    expect(lostRollProblem(selecting(), 'june', 9, 3)).toBe(
      'They join a mission team playing this turn.',
    );
    expect(submitLostRolled(selecting(), 'june', 9, null, AT)).toEqual({
      ok: false,
      problem: 'Choose the mission team they join.',
    });
  });
});

describe('a placed Lost survivor’s rescue (pg. 124; R109)', () => {
  const AXE = { id: 'axe', item: 'bladed', grade: 'standard' } as const;
  /** June placed on team 2 at Play the Mission, hurt, Infected, mad and carrying an axe. */
  const placed = (): Campaign =>
    accepted(
      submitLostRolled(
        selecting({
          lost: [june(10, { currentHp: 1, infection: 3, madness: 14, items: [AXE] })],
        }),
        'june',
        9,
        2,
        AT,
      ),
    );
  const rescued = (result: 'found' | 'exiled' | 'not-rescued') => {
    const result_ = submitLostRescued(
      { ...placed(), step: 'tactical-mission' },
      'june',
      result,
      AT,
    );
    if (!result_.ok) throw new Error(result_.problem);

    return result_.campaign;
  };

  it('is owed once placed, until recorded', () => {
    expect(rescuesDue(selecting())).toEqual([]);
    expect(rescuesDue(placed()).map((one) => one.id)).toEqual(['june']);
    expect(outstanding(placed()).map((one) => one.says)).toContain(
      'A Lost survivor was on a mission, and whether they were rescued isn’t recorded.',
    );
    expect(rescuesDue(rescued('not-rescued'))).toEqual([]);
    expect(lostRescueProblem(rescued('found'), 'june')).toBe(
      'Nobody placed on a mission this turn is waiting to be rescued.',
    );
    expect(rescuesDue({ ...placed(), step: 'heal-wounds' })).toEqual([]);
  });

  it('brings a Found survivor back as themselves, whole, with their items', () => {
    const after = rescued('found');
    const back = after.survivors.find((one) => one.id === 'june');

    expect(after.lost).toEqual([]);
    expect(back).toMatchObject({
      currentHp: 2,
      infection: 0,
      madness: 0,
      found: true,
      xpSpent: 10,
      items: [AXE],
    });
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'lost-rescued',
      survivor: 'june',
      name: 'June Park',
      team: 2,
      result: 'found',
    });
  });

  it('exiles one back to the Lost, their items left to the base (R75)', () => {
    const after = rescued('exiled');

    expect(after.survivors.map((one) => one.id)).toEqual(['earl', 'carla']);
    expect(after.lost).toMatchObject([{ id: 'june', items: [], madness: 0, currentHp: 2 }]);
    expect(after.inventory).toEqual([AXE]);
    expect(after.log.at(-1)?.event).toMatchObject({ result: 'exiled', items: [AXE] });
  });

  it('keeps one not rescued on the list as they were (R109)', () => {
    const after = rescued('not-rescued');

    expect(after.lost).toEqual(placed().lost);
    expect(after.log.at(-1)?.event).toMatchObject({ result: 'not-rescued' });
    expect(after.log.at(-1)?.event).not.toHaveProperty('items');
  });
});

describe('two Lost, over two turns', () => {
  const ruby = createSurvivor('Ruby Vance', 2, { id: 'ruby' });
  const two = (log: readonly LogEntry[] = []) => selecting({ lost: [june(10), ruby], log });
  const rolledEntry = (who: Survivor, team: number | undefined, turn = 4): LogEntry =>
    entry(
      {
        kind: 'lost-rolled',
        survivor: who.id,
        name: who.name,
        roll: 9,
        xpSpent: who.xpSpent,
        ...(team === undefined ? {} : { team }),
      },
      turn,
    );
  const rescuedEntry = (who: Survivor, team: number, turn = 4): LogEntry =>
    entry(
      { kind: 'lost-rescued', survivor: who.id, name: who.name, team, result: 'not-rescued' },
      turn,
    );
  const ids = (survivors: readonly Survivor[]) => survivors.map((one) => one.id);

  it('rolls each once, gives only the one who failed the XP, and reads only this turn', () => {
    const after = accepted(submitLostRolled(two(), 'june', 3, null, AT));

    expect(after.lost.map((one) => one.xp)).toEqual([4, 0]);
    expect(ids(lostRollsDue(after))).toEqual(['ruby']);
    // Another entry this turn, or last turn's outcome, is not this turn's outcome.
    expect(
      ids(
        lostRollsDue(
          two([
            entry({ kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] }),
          ]),
        ),
      ),
    ).toEqual(['june', 'ruby']);
    expect(
      ids(
        lostRollsDue(
          two([entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [] }, 3)]),
        ),
      ),
    ).toEqual(['june', 'ruby']);
    // A rescue entry is not a roll.
    expect(ids(lostRollsDue(two([rescuedEntry(june(10), 1)])))).toEqual(['june', 'ruby']);
  });

  it('counts only this turn’s placements, by roll, as placed and owed a rescue', () => {
    expect(placedLost(two([rescuedEntry(june(10), 2)]), 2)).toEqual([]);
    expect(rescuesDue(two([rolledEntry(june(10), 1, 3)]))).toEqual([]);
    expect(rescuesDue(two([rolledEntry(june(10), undefined)]))).toEqual([]);

    const both = two([rolledEntry(june(10), 1), rolledEntry(ruby, 2)]);
    expect(ids(rescuesDue(both))).toEqual(['june', 'ruby']);

    const juneDone = {
      ...both,
      step: 'tactical-mission' as const,
      log: [...both.log, rescuedEntry(june(10), 1)],
    };
    expect(ids(rescuesDue(juneDone))).toEqual(['ruby']);
    expect(lostRescueProblem(juneDone, 'june')).not.toBeNull();
    expect(lostRescueProblem(juneDone, 'ruby')).toBeNull();
    expect(ids(rescuesDue({ ...both, log: [rescuedEntry(june(10), 1, 3), ...both.log] }))).toEqual([
      'june',
      'ruby',
    ]);
  });

  it('keeps the other Lost on the list when one is Found, and refuses one not owed', () => {
    const both = two([rolledEntry(june(10), 1), rolledEntry(ruby, 2)]);
    const found = submitLostRescued(both, 'june', 'found', AT);
    if (!found.ok) throw new Error(found.problem);

    expect(ids(found.campaign.lost)).toEqual(['ruby']);
    expect(submitLostRescued(found.campaign, 'june', 'found', AT)).toEqual({
      ok: false,
      problem: 'Nobody placed on a mission this turn is waiting to be rescued.',
    });
  });

  it('writes no items for an exile who carried none', () => {
    const exiled = submitLostRescued(two([rolledEntry(ruby, 1)]), 'ruby', 'exiled', AT);
    if (!exiled.ok) throw new Error(exiled.problem);

    expect(exiled.campaign.log.at(-1)?.event).not.toHaveProperty('items');
  });
});
