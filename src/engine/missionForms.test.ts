import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import type { MissionOutcome } from './missions';
import {
  submitMissionOutcome,
  submitMissionSelection,
  submitMissionSkip,
  submitStandIn,
} from './missionForms';
import { expectAccepted, expectRefused } from '../test/forms';

/**
 * The Mission Phase's forms on their own, without the store (#179). Who may
 * stand in and which outcome may be recorded are `standInProblem`'s and
 * `missionOutcomeProblem`'s, tested beside them; this is the composition — the
 * entry written when they say yes, and their own reason when they say no.
 */

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-11T09:00:00.000Z';
const LATER = '2026-10-11T09:05:00.000Z';

describe('submitMissionSelection', () => {
  /** Turn 4 at Select Mission: Earl on team 1, Ruby and Carla on team 2 (pg. 21). */
  const selecting = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'select-mission',
    survivors: [
      createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
      createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
      createSurvivor('Carla Proust', 2, { id: 'carla' }),
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      ruby: { task: 'mission', team: 2 },
      carla: { task: 'mission', team: 2 },
    },
  });

  it('records the team’s mission with the names on that team, and nothing else', () => {
    const before = selecting();
    const after = expectAccepted(
      submitMissionSelection(
        before,
        { team: 2, mission: 'gather-materials', material: 'fuel' },
        LATER,
      ),
    );

    expect(after.log.at(-1)).toStrictEqual({
      turn: 4,
      phase: 'mission',
      at: LATER,
      event: {
        kind: 'mission-selected',
        team: 2,
        mission: 'gather-materials',
        names: ['Ruby Vance', 'Carla Proust'],
        material: 'fuel',
      },
    });
    expect({ ...after, log: before.log }).toEqual(before);
  });

  it('writes no material for a mission that asks for none', () => {
    const after = expectAccepted(
      submitMissionSelection(selecting(), { team: 1, mission: 'thin-the-herd' }, LATER),
    );

    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'mission-selected',
      team: 1,
      mission: 'thin-the-herd',
      names: ['Earl Rhodes'],
    });
  });

  it('refuses with the engine’s own reason — here, a team nobody is on', () => {
    expect(
      expectRefused(
        submitMissionSelection(selecting(), { team: 3, mission: 'thin-the-herd' }, LATER),
      ),
    ).toBe('Only a mission team with somebody on it chooses a mission.');
  });
});

describe('submitMissionSkip', () => {
  const ordinary = (turn: number): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn,
    step: 'select-mission',
  });

  it('records that the community opted out (pg. 17)', () => {
    const after = expectAccepted(submitMissionSkip(ordinary(4), LATER));

    expect(after.log.at(-1)?.event).toStrictEqual({ kind: 'mission-skipped' });
  });

  it('refuses with the engine’s own reason — here, turn 1', () => {
    expect(expectRefused(submitMissionSkip(ordinary(1), LATER))).toBe(
      'Turn 1’s First Mission cannot be skipped.',
    );
  });
});

describe('submitMissionOutcome', () => {
  /** Turn 4, standing on Play the Mission, with the siege turn 3 called. */
  const besieged = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    log: [
      {
        turn: 3,
        phase: 'management',
        at: AT,
        event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
      },
      // The whole community chose the Siege Defense at Select Mission (Z4-2).
      {
        turn: 4,
        phase: 'mission',
        at: AT,
        event: { kind: 'mission-selected', team: 1, mission: 'siege-defense', names: [] },
      },
    ],
  });

  const defended = (zombiesLeft: number): MissionOutcome => ({
    kind: 'siege-defense-resolved',
    zombiesLeft,
    survivorsExited: 1,
  });

  it('writes the outcome as it was counted, and nothing else', () => {
    const before = besieged();
    const after = expectAccepted(submitMissionOutcome(before, defended(0), LATER));

    expect(after.log.at(-1)).toEqual({
      turn: 4,
      phase: 'mission',
      at: LATER,
      event: { kind: 'siege-defense-resolved', zombiesLeft: 0, survivorsExited: 1 },
    });
    expect({ ...after, log: before.log }).toEqual(before);
  });

  it('refuses with the engine’s own reason — here, a second outcome', () => {
    const once = expectAccepted(submitMissionOutcome(besieged(), defended(2), AT));

    expect(expectRefused(submitMissionOutcome(once, defended(0), LATER))).toBe(
      'Mission team 1’s outcome is already recorded.',
    );
  });
});

describe('submitStandIn', () => {
  /** Turn 4's siege recorded, with Earl off the Kitchen at 0 Health and Ruby on the mission team. */
  const besieged = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors: [
      { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), currentHp: 0 },
      createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
    ],
    assignments: {
      earl: { task: 'staff', slot: 'kitchen' },
      ruby: { task: 'mission', team: 1 },
    },
    base: { id: 'small-town-home', slots: {} },
    log: [
      {
        turn: 4,
        phase: 'mission',
        at: AT,
        event: { kind: 'siege-defense-resolved', zombiesLeft: 1, survivorsExited: 0 },
      },
    ],
  });

  it('records both names, and leaves the assignments alone', () => {
    const before = besieged();
    const after = expectAccepted(submitStandIn(before, { survivor: 'earl', by: 'ruby' }, LATER));

    expect(after.log.at(-1)?.event).toEqual({
      kind: 'stood-in',
      survivor: 'earl',
      name: 'Earl Rhodes',
      by: 'ruby',
      byName: 'Ruby Vance',
    });
    expect(after.assignments).toEqual(before.assignments);
  });

  it('can leave the place empty again, naming only the casualty', () => {
    const chosen = expectAccepted(submitStandIn(besieged(), { survivor: 'earl', by: 'ruby' }, AT));
    const after = expectAccepted(submitStandIn(chosen, { survivor: 'earl', by: null }, LATER));

    expect(after.log.at(-1)?.event).toEqual({
      kind: 'stood-in',
      survivor: 'earl',
      name: 'Earl Rhodes',
    });
  });

  it('refuses with the engine’s own reason', () => {
    expect(expectRefused(submitStandIn(besieged(), { survivor: 'earl', by: null }, AT))).toBe(
      'Nobody is standing in already.',
    );
  });
});
