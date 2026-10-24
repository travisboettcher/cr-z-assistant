import { describe, expect, it } from 'vitest';
import { OTHER_MISSION_NAME_MAX } from '../data/missions';
import { createNewCampaign, type Campaign } from './campaign';
import type { LogEntry } from './log';
import { submitMissionEnded, submitMissionSelection } from './missionForms';
import {
  asksForName,
  missionOutcomeProblem,
  missionsOnOffer,
  outcomeOf,
  selectionProblem,
  turnMissions,
} from './missions';
import { rollsOwed } from './materials';
import { rescuedStrangers } from './strangers';
import { createSurvivor } from './survivor';

const AT = '2026-10-20T09:00:00.000Z';
const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });

/** Turn 4, at Select Mission: Earl on team 1. */
const selecting = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  step: 'select-mission',
  survivors: [earl],
  assignments: { earl: { task: 'mission', team: 1 } },
  ...overrides,
});

const chosen = (name = 'The Lighthouse'): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team: 1, mission: 'other', names: ['Earl Rhodes'], name },
});

/** The same turn's Play the Mission, the Lighthouse chosen. */
const playing = (): Campaign =>
  selecting({
    step: 'tactical-mission',
    base: { id: 'small-town-home', slots: {} },
    log: [chosen()],
  });

const counts = {
  endCondition: null,
  strangers: [2, 1] as const,
  vehiclesOnArea: 0,
  materialsCarriedOut: 0,
  startingZombies: 0,
  zombiesLeft: 0,
  survivorsExited: 0,
  allIncapacitated: false,
  vehiclesDrivenOff: 0,
  wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 1 }],
};

describe('an Other mission (#259; R157)', () => {
  it('is offered whenever the standard missions are, and never on turn 1 or a siege turn', () => {
    expect(missionsOnOffer(selecting(), 1)).toContain('other');
    expect(missionsOnOffer(selecting({ turn: 1 }), 1)).toEqual(['first-mission']);
    expect(
      missionsOnOffer(
        selecting({
          log: [
            {
              turn: 3,
              phase: 'management',
              at: AT,
              event: { kind: 'horde-checked', roll: 10, threat: 6, siege: true },
            },
          ],
        }),
        1,
      ),
    ).not.toContain('other');
  });

  it('asks for a name, and only it does', () => {
    const problem = (name: string | undefined, mission: 'other' | 'thin-the-herd' = 'other') =>
      selectionProblem(selecting(), {
        team: 1,
        mission,
        ...(name === undefined ? {} : { name }),
      });

    expect(asksForName('other')).toBe(true);
    expect(asksForName('rescue-strangers')).toBe(false);
    expect(problem('The Lighthouse')).toBeNull();
    expect(problem(undefined)).toBe('Name the mission.');
    expect(problem('   ')).toBe('Name the mission.');
    expect(problem('x'.repeat(OTHER_MISSION_NAME_MAX))).toBeNull();
    expect(problem('x'.repeat(OTHER_MISSION_NAME_MAX + 1))).toBe(
      `Keep the mission’s name to ${String(OTHER_MISSION_NAME_MAX)} characters.`,
    );
    expect(problem('The Lighthouse', 'thin-the-herd')).toBe('Only an Other mission takes a name.');
  });

  it('records the name, trimmed, with the choice', () => {
    const result = submitMissionSelection(
      selecting(),
      { team: 1, mission: 'other', name: '  The Lighthouse ' },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'mission-selected',
      team: 1,
      mission: 'other',
      names: ['Earl Rhodes'],
      name: 'The Lighthouse',
    });
    expect(turnMissions(result.campaign).choices[0]?.name).toBe('The Lighthouse');
  });

  it('ends with its name, the strangers rescued and the wounds', () => {
    const choice = turnMissions(playing()).choices[0];
    if (choice === undefined) throw new Error('no choice');
    const outcome = outcomeOf(choice, counts);

    expect(outcome).toEqual({
      kind: 'other-mission-resolved',
      team: 1,
      name: 'The Lighthouse',
      strangers: [2, 1],
      wounds: counts.wounds,
    });

    const result = submitMissionEnded(playing(), outcome, [], AT);
    if (!result.ok) throw new Error(result.problem);

    // The strangers join at Create New Survivors, as any mission's do.
    expect(rescuedStrangers(result.campaign).map((one) => one.tier)).toEqual([2, 1]);
    expect(result.campaign.survivors[0]?.currentHp).toBe(1);
    // Its materials are rolled at Add Materials to Storage.
    expect(rollsOwed(result.campaign)).toBe(true);
  });

  it('reads a name off an Other mission’s outcome only', () => {
    // A hand-edited save can name a standard mission's choice; only Other's is checked.
    const named = selecting({
      step: 'tactical-mission',
      log: [
        {
          turn: 4,
          phase: 'mission',
          at: AT,
          event: {
            kind: 'mission-selected',
            team: 1,
            mission: 'rescue-strangers',
            names: [],
            name: 'Stray',
          },
        },
      ],
    });

    expect(
      missionOutcomeProblem(named, {
        kind: 'rescue-strangers-resolved',
        team: 1,
        strangers: [],
        wounds: counts.wounds,
      }),
    ).toBeNull();
    expect(outcomeOf({ team: 1, mission: 'other' }, counts)).toMatchObject({ name: '' });
  });

  it('is refused under another name, or with a Hero rescued', () => {
    const outcome = {
      kind: 'other-mission-resolved',
      team: 1,
      name: 'The Lighthouse',
      strangers: [],
      wounds: counts.wounds,
    } as const;

    expect(missionOutcomeProblem(playing(), outcome)).toBeNull();
    expect(missionOutcomeProblem(playing(), { ...outcome, name: 'The Quarry' })).toBe(
      'That isn’t the mission team 1 chose.',
    );
    expect(missionOutcomeProblem(playing(), { ...outcome, strangers: [4 as 3] })).toBe(
      'Every stranger is Tier 1 to 3. A Hero is never rescued.',
    );
  });
});
