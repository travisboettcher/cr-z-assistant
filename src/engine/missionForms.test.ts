import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import type { MissionOutcome } from './siege';
import { submitMissionOutcome, submitStandIn } from './missionForms';
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
      'This turn’s mission is already recorded.',
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
