import { describe, expect, it } from 'vitest';
import type { TurnStepId } from '../data/turn';
import { createNewCampaign, type Campaign } from './campaign';
import type { CampaignEvent, LogEntry } from './log';
import {
  rescuedStrangers,
  strangerProblem,
  strangerSurvivor,
  strangersWaiting,
  type StrangerForm,
} from './strangers';
import { createSurvivor, recruitSurvivor } from './survivor';

/**
 * Advancement Step 2's question, asked of the record (pg. 19; Z4-5): which
 * strangers this turn's outcomes counted, and which of them have joined.
 */

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-12T09:00:00.000Z';

const entry = (event: CampaignEvent, turn = 3): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

const joinedAs = (team: number, stranger: number, turn = 3): LogEntry => ({
  turn,
  phase: 'advancement',
  at: AT,
  event: {
    kind: 'stranger-joined',
    survivor: `joined-${String(team)}-${String(stranger)}`,
    name: 'Somebody',
    tier: 2,
    team,
    stranger,
  },
});

/** Turn 3's Advancement Phase, with this turn's log. */
function after(log: readonly LogEntry[], step: TurnStepId = 'create-new-survivors'): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, step, log };
}

/** Team 1 rescued a Citizen and a Leader; team 2 claimed a base with a Rookie. */
const TWO_TEAMS: readonly LogEntry[] = [
  // Team 2's outcome first in the log, so the order below is the teams' and
  // not the table's.
  entry({
    kind: 'claim-a-new-base-resolved',
    team: 2,
    endCondition: 1,
    strangers: [1],
    vehiclesOnArea: 0,
  }),
  entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2, 3] }),
];

const form = (overrides: Partial<StrangerForm> = {}): StrangerForm => ({
  team: 1,
  stranger: 0,
  name: 'Carla Proust',
  ...overrides,
});

describe('rescuedStrangers', () => {
  it('is empty when no outcome this turn counted anybody', () => {
    expect(
      rescuedStrangers(
        after([entry({ kind: 'gather-materials-resolved', team: 1, materialsCarriedOut: 3 })]),
      ),
    ).toEqual([]);
  });

  it('lists every stranger, in team order and then in the order each outcome counted them', () => {
    expect(rescuedStrangers(after(TWO_TEAMS))).toEqual([
      { team: 1, stranger: 0, tier: 2 },
      { team: 1, stranger: 1, tier: 3 },
      { team: 2, stranger: 0, tier: 1 },
    ]);
  });

  it('reads the First Mission’s strangers as well', () => {
    expect(
      rescuedStrangers(
        after([
          entry({ kind: 'first-mission-resolved', team: 1, endCondition: 2, strangers: [4] }),
        ]),
      ),
    ).toEqual([{ team: 1, stranger: 0, tier: 4 }]);
  });

  /** Turn 2's rescues were turn 2's Advancement Phase's to offer. */
  it('offers nobody an earlier turn rescued', () => {
    expect(
      rescuedStrangers(
        after([entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2] }, 2)]),
      ),
    ).toEqual([]);
  });

  /** R21: choosing again clears the outcome, and the second attempt's list is the one. */
  it('reads a team’s latest outcome only', () => {
    expect(
      rescuedStrangers(
        after([
          entry({ kind: 'first-mission-resolved', team: 1, endCondition: null, strangers: [2] }),
          entry({ kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
          entry({ kind: 'first-mission-resolved', team: 1, endCondition: 1, strangers: [1, 1] }),
        ]),
      ),
    ).toEqual([
      { team: 1, stranger: 0, tier: 1 },
      { team: 1, stranger: 1, tier: 1 },
    ]);
  });
});

describe('strangersWaiting', () => {
  it('is everybody rescued while nobody has joined', () => {
    expect(strangersWaiting(after(TWO_TEAMS))).toEqual(rescuedStrangers(after(TWO_TEAMS)));
  });

  it('leaves out the stranger who joined, by team and position', () => {
    // Something else on the record after the join, which answers nothing.
    const later = { ...entry({ kind: 'phase-entered' }), phase: 'advancement' as const };

    expect(strangersWaiting(after([...TWO_TEAMS, joinedAs(1, 1), later]))).toEqual([
      { team: 1, stranger: 0, tier: 2 },
      { team: 2, stranger: 0, tier: 1 },
    ]);
  });

  /** The acceptance: a walk back over the step offers nobody twice. */
  it('is empty once every stranger has joined', () => {
    expect(
      strangersWaiting(after([...TWO_TEAMS, joinedAs(2, 0), joinedAs(1, 0), joinedAs(1, 1)])),
    ).toEqual([]);
  });

  it('does not count a join from another team’s rescue', () => {
    expect(strangersWaiting(after([...TWO_TEAMS, joinedAs(3, 0)]))).toHaveLength(3);
  });

  /** R21: somebody who joined from the failed attempt is not the retry's stranger. */
  it('answers nothing in a team’s latest outcome with a join from before it', () => {
    expect(
      strangersWaiting(
        after([
          entry({ kind: 'first-mission-resolved', team: 1, endCondition: null, strangers: [2] }),
          joinedAs(1, 0),
          entry({ kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
          entry({ kind: 'first-mission-resolved', team: 1, endCondition: 1, strangers: [3] }),
        ]),
      ),
    ).toEqual([{ team: 1, stranger: 0, tier: 3 }]);
  });

  it('is not answered by a join an earlier turn wrote', () => {
    expect(
      strangersWaiting(
        after([
          entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2] }, 2),
          joinedAs(1, 0, 2),
          entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [3] }),
        ]),
      ),
    ).toEqual([{ team: 1, stranger: 0, tier: 3 }]);
  });

  /** A damaged log, which is a reason to read on rather than to throw. */
  it('passes over a join for a team with no outcome before it', () => {
    expect(
      strangersWaiting(
        after([
          joinedAs(1, 0),
          entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2] }),
        ]),
      ),
    ).toEqual([{ team: 1, stranger: 0, tier: 2 }]);
  });
});

describe('strangerProblem', () => {
  it('is null for a stranger still waiting, with a name', () => {
    expect(strangerProblem(after(TWO_TEAMS), form())).toBeNull();
  });

  it('refuses outside the Advancement Phase', () => {
    expect(strangerProblem(after(TWO_TEAMS, 'tactical-mission'), form())).toMatch(/Advancement/);
    expect(strangerProblem(after(TWO_TEAMS, 'assign-facility-staff'), form())).toMatch(
      /Advancement/,
    );
  });

  it('accepts on any step of the Advancement Phase', () => {
    expect(strangerProblem(after(TWO_TEAMS, 'heal-wounds'), form())).toBeNull();
  });

  it('refuses a stranger nobody rescued', () => {
    expect(strangerProblem(after(TWO_TEAMS), form({ stranger: 2 }))).toMatch(/no such stranger/i);
    expect(strangerProblem(after(TWO_TEAMS), form({ team: 3 }))).toMatch(/no such stranger/i);
  });

  it('refuses a stranger who has already joined', () => {
    expect(strangerProblem(after([...TWO_TEAMS, joinedAs(1, 0)]), form())).toMatch(
      /already joined/,
    );
  });

  it('refuses a stranger with no name', () => {
    expect(strangerProblem(after(TWO_TEAMS), form({ name: '  ' }))).toMatch(/name/);
  });

  /** pg. 7: a Rookie never rolls, and nor does a Hero, who is no field recruit. */
  it('refuses a roll at a Tier that does not roll for a skill', () => {
    expect(strangerProblem(after(TWO_TEAMS), form({ team: 2, roll: 4 }))).toBe(
      'A Tier 1 stranger does not roll for a skill.',
    );
    expect(
      strangerProblem(
        after([entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [4] })]),
        form({ roll: 4 }),
      ),
    ).toBe('A Tier 4 stranger does not roll for a skill.');
  });

  it('takes a roll at a Tier that rolls, or none', () => {
    expect(strangerProblem(after(TWO_TEAMS), form({ roll: 6 }))).toBeNull();
    expect(strangerProblem(after(TWO_TEAMS), form({ stranger: 1, roll: 10 }))).toBeNull();
    expect(strangerProblem(after(TWO_TEAMS), form({ team: 2 }))).toBeNull();
  });
});

describe('strangerSurvivor', () => {
  /** pg. 15: a six on the recruit table is Archery. */
  it('builds a Citizen or a Leader as a field recruit, with the rolled skill', () => {
    expect(strangerSurvivor('Carla Proust', 3, 6, { id: 'carla' })).toEqual(
      recruitSurvivor('Carla Proust', 3, 6, { id: 'carla' }),
    );
    expect(strangerSurvivor('Carla Proust', 2, 6, { id: 'carla' }).skills).toEqual({ archery: 0 });
  });

  it('builds a Rookie with a slot to fill', () => {
    expect(strangerSurvivor('Pip', 1, undefined, { id: 'pip' })).toEqual(
      createSurvivor('Pip', 1, { id: 'pip' }),
    );
  });

  /** R24: a Hero is not a field recruit (pg. 7), so is added as the roster adds one. */
  it('builds a Hero the way the roster adds one', () => {
    expect(strangerSurvivor('Earl Rhodes', 4, undefined, { id: 'earl' })).toEqual(
      createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
    );
  });
});
