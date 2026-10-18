import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import type { LogEntry } from './log';
import { lostRollPasses, lostRollProblem, lostRollsDue, placedLost } from './lostRoll';
import { submitLostRolled } from './missionForms';
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
