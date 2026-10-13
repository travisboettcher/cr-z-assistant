import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import type { MissionWound } from './log';
import type { MissionOutcome } from './missions';
import {
  submitMissionOutcome,
  submitMissionSelection,
  submitMissionSkip,
  submitOverrunContinuation,
  submitStandIn,
} from './missionForms';
import { continued, overrun, wentOn } from '../test/overrun';
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

  it('writes the base a Claim a New Base team is claiming (pg. 78; Z4-7)', () => {
    const after = expectAccepted(
      submitMissionSelection(
        selecting(),
        { team: 1, mission: 'claim-a-new-base', base: 'distillery' },
        LATER,
      ),
    );

    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'mission-selected',
      team: 1,
      mission: 'claim-a-new-base',
      names: ['Earl Rhodes'],
      base: 'distillery',
    });
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
  /**
   * Turn 4, standing on Play the Mission, with the siege turn 3 called: the
   * whole community — Earl, Tier 3, and Ruby, Tier 2 — is team 1 (pg. 85).
   */
  const besieged = (overrides: Partial<Campaign> = {}): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors: [
      createSurvivor('Earl Rhodes', 3, { id: 'earl' }),
      { ...createSurvivor('Ruby Vance', 2, { id: 'ruby' }), currentHp: 1 },
    ],
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
        event: {
          kind: 'mission-selected',
          team: 1,
          mission: 'siege-defense',
          names: ['Earl Rhodes', 'Ruby Vance'],
        },
      },
    ],
    ...overrides,
  });

  const defended = (
    zombiesLeft: number,
    wounds: readonly MissionWound[] = [
      { survivor: 'earl', name: 'Earl Rhodes', health: 0 },
      { survivor: 'ruby', name: 'Ruby Vance', health: 2 },
    ],
  ): MissionOutcome => ({
    kind: 'siege-defense-resolved',
    zombiesLeft,
    survivorsExited: 1,
    wounds,
  });

  it('writes the outcome as it was counted, with the team’s Health at the end', () => {
    const after = expectAccepted(submitMissionOutcome(besieged(), defended(0), LATER));

    expect(after.log.at(-1)).toStrictEqual({
      turn: 4,
      phase: 'mission',
      at: LATER,
      event: {
        kind: 'siege-defense-resolved',
        zombiesLeft: 0,
        survivorsExited: 1,
        wounds: [
          { survivor: 'earl', name: 'Earl Rhodes', health: 0 },
          { survivor: 'ruby', name: 'Ruby Vance', health: 2 },
        ],
      },
    });
  });

  it('sets the roster to the Health recorded, and changes nothing else (Z4-4)', () => {
    const before = besieged();
    const after = expectAccepted(submitMissionOutcome(before, defended(0), LATER));

    expect(after.survivors.map((survivor) => survivor.currentHp)).toEqual([0, 2]);
    expect({ ...after, log: before.log, survivors: before.survivors }).toStrictEqual(before);
  });

  it('writes the wounds in team order, under the names the roster has now', () => {
    const after = expectAccepted(
      submitMissionOutcome(
        besieged(),
        defended(0, [
          { survivor: 'ruby', name: 'somebody', health: 1 },
          { survivor: 'earl', name: '', health: 3 },
        ]),
        LATER,
      ),
    );

    expect(after.log.at(-1)?.event).toMatchObject({
      wounds: [
        { survivor: 'earl', name: 'Earl Rhodes', health: 3 },
        { survivor: 'ruby', name: 'Ruby Vance', health: 1 },
      ],
    });
  });

  it('records and sets Infection in a Viral campaign (pg. 123)', () => {
    const viral = besieged({ origin: 'viral' });
    const after = expectAccepted(
      submitMissionOutcome(
        viral,
        defended(0, [
          { survivor: 'earl', name: 'Earl Rhodes', health: 3, infection: 10 },
          { survivor: 'ruby', name: 'Ruby Vance', health: 2, infection: 0 },
        ]),
        LATER,
      ),
    );

    expect(after.survivors.map((survivor) => survivor.infection)).toEqual([10, 0]);
    expect(after.log.at(-1)?.event).toMatchObject({
      wounds: [
        { survivor: 'earl', name: 'Earl Rhodes', health: 3, infection: 10 },
        { survivor: 'ruby', name: 'Ruby Vance', health: 2, infection: 0 },
      ],
    });
  });

  it('writes no Infection where the campaign has none', () => {
    const after = expectAccepted(submitMissionOutcome(besieged(), defended(0), LATER));

    expect(after.log.at(-1)?.event).toMatchObject({
      wounds: [{ survivor: 'earl', health: 0 }, { survivor: 'ruby' }],
    });
    for (const wound of (after.log.at(-1)?.event as MissionOutcome).wounds ?? []) {
      expect(wound).not.toHaveProperty('infection');
    }
  });

  it('refuses with the engine’s own reason — here, a second outcome', () => {
    const once = expectAccepted(submitMissionOutcome(besieged(), defended(2), AT));

    expect(expectRefused(submitMissionOutcome(once, defended(0), LATER))).toBe(
      'Mission team 1’s outcome is already recorded.',
    );
  });

  it('refuses Health above a survivor’s maximum, and changes nothing', () => {
    expect(
      expectRefused(
        submitMissionOutcome(
          besieged(),
          defended(0, [
            { survivor: 'earl', name: 'Earl Rhodes', health: 3 },
            { survivor: 'ruby', name: 'Ruby Vance', health: 3 },
          ]),
          LATER,
        ),
      ),
    ).toBe('Ruby Vance’s Health is a whole number from 0 to 2.');
  });

  it('refuses Infection in a campaign that is not Viral', () => {
    expect(
      expectRefused(
        submitMissionOutcome(
          besieged(),
          defended(0, [
            { survivor: 'earl', name: 'Earl Rhodes', health: 3, infection: 1 },
            { survivor: 'ruby', name: 'Ruby Vance', health: 1 },
          ]),
          LATER,
        ),
      ),
    ).toBe('Only a Viral campaign records Infection.');
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

/** How a community goes on from an overrun base (pg. 86; R27, R28; Z4-9). */
describe('submitOverrunContinuation', () => {
  it('records the way on, and team 1’s mission with the base it claims', () => {
    const after = expectAccepted(
      submitOverrunContinuation(overrun(), 'claim', 'distillery', LATER),
    );

    expect(after.log.slice(-2).map((entry) => entry.event)).toStrictEqual([
      { kind: 'overrun-continued', option: 'claim' },
      {
        kind: 'mission-selected',
        team: 1,
        mission: 'claim-a-new-base',
        names: ['Earl Rhodes', 'Ruby Vance'],
        base: 'distillery',
      },
    ]);
  });

  it('plays the First Mission to start over', () => {
    const after = expectAccepted(
      submitOverrunContinuation(overrun(), 'start-over', 'summer-camp', LATER),
    );

    expect(after.log.at(-1)?.event).toMatchObject({
      mission: 'first-mission',
      base: 'summer-camp',
    });
  });

  it('may be chosen again after a way on fails, the other way or the same (R28)', () => {
    const failed = overrun([...wentOn('claim', 'distillery'), continued('claim', false)]);

    expect(submitOverrunContinuation(failed, 'start-over', 'summer-camp', LATER).ok).toBe(true);
    expect(submitOverrunContinuation(failed, 'claim', 'rural-church', LATER).ok).toBe(true);
  });

  it('refuses with the engine’s reason, and writes nothing', () => {
    expect(
      expectRefused(
        submitOverrunContinuation(overrun([], { log: [] }), 'claim', 'distillery', LATER),
      ),
    ).toMatch(/overran this turn/);
    // The selection's own refusal, after the way on would have been accepted.
    expect(
      expectRefused(submitOverrunContinuation(overrun(), 'claim', 'castle' as 'distillery', LATER)),
    ).toMatch(/no such base/);
  });
});
