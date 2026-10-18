import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import type { MissionWound } from './log';
import { submitMissionEnded } from './missionForms';
import { foundCheckOwed, madnessAfter, woundsProblem } from './missions';
import { createSurvivor, tierCheckPasses } from './survivor';

const AT = '2026-10-18T09:00:00.000Z';

/** June, Tier 2 and Found, at 5 Madness. */
const june = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('June Park', 2, { id: 'june' }),
  found: true,
  madness: 5,
  ...overrides,
});

/** Turn 4's Play the Mission in a Cosmic Horror campaign, June on team 1 playing Rescue Strangers. */
const playing = (survivor: Survivor): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  step: 'tactical-mission',
  origin: 'cosmic-horror',
  survivors: [survivor],
  assignments: { june: { task: 'mission', team: 1 } },
  log: [
    {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
    },
  ],
});

const wound = (madness: number, foundCheck?: MissionWound['foundCheck']): MissionWound => ({
  survivor: 'june',
  name: 'June Park',
  health: 2,
  madness,
  ...(foundCheck === undefined ? {} : { foundCheck }),
});

const recorded = (survivor: Survivor, one: MissionWound) => {
  const result = submitMissionEnded(
    playing(survivor),
    { kind: 'rescue-strangers-resolved', team: 1, strangers: [], wounds: [one] },
    [],
    AT,
  );
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
};

describe('a Tier check (pg. 8)', () => {
  it('is the d10 and the Tier against the target, with its natural results', () => {
    const tier2 = june();

    expect(tierCheckPasses(tier2, 6, 8)).toBe(true);
    expect(tierCheckPasses(tier2, 5, 8)).toBe(false);
    expect(tierCheckPasses(tier2, 10, 20)).toBe(true);
    expect(tierCheckPasses({ ...tier2, tier: 4 }, 1, 2)).toBe(false);
  });
});

describe('the Found check at the next Madness gain (pg. 130; R111)', () => {
  it('is owed by a Found survivor whose Madness went up, until it is passed', () => {
    expect(foundCheckOwed(june(), 6)).toBe(true);
    expect(foundCheckOwed(june(), 5)).toBe(false);
    expect(foundCheckOwed(june(), 3)).toBe(false);
    expect(foundCheckOwed(june(), undefined)).toBe(false);
    expect(foundCheckOwed(june({ found: false }), 9)).toBe(false);
    expect(foundCheckOwed(june({ foundCheckPassed: true }), 9)).toBe(false);
  });

  it('is asked on the outcome, and refused where it isn’t owed', () => {
    const problem = (survivor: Survivor, one: MissionWound) =>
      woundsProblem(playing(survivor), {
        kind: 'rescue-strangers-resolved',
        team: 1,
        strangers: [],
        wounds: [one],
      });

    expect(problem(june(), wound(8))).toBe(
      'June Park is Found and their Madness went up: enter the d10 for their Tier check against 8.',
    );
    expect(problem(june(), wound(8, 6))).toBeNull();
    expect(problem(june(), wound(5, 6))).toBe(
      'Only a Found survivor whose Madness went up makes the Tier check against 8.',
    );
    expect(problem(june(), wound(8, 11 as MissionWound['foundCheck']))).toBe(
      'The Tier check is a d10, from 1 to 10.',
    );
  });

  it('caps their Madness at 6 for good when passed, and logs the capped count', () => {
    const after = recorded(june(), wound(9, 6));
    const back = after.survivors[0] as Survivor;

    expect([back.madness, back.foundCheckPassed]).toEqual([6, true]);
    expect(after.log.at(-1)?.event).toMatchObject({ wounds: [wound(6, 6)] });

    const later = recorded({ ...back, madness: 4 }, wound(11));
    expect(later.survivors[0]?.madness).toBe(6);
  });

  it('caps nothing when failed, and is asked again at the next gain (R111)', () => {
    const after = recorded(june(), wound(9, 2));
    const back = after.survivors[0] as Survivor;

    expect([back.madness, back.foundCheckPassed]).toEqual([9, false]);
    expect(foundCheckOwed(back, 10)).toBe(true);
  });

  it('leaves Madness as recorded for anybody not Found', () => {
    expect(madnessAfter(june({ found: false }), wound(12))).toEqual({
      madness: 12,
      foundCheckPassed: false,
    });
  });
});
