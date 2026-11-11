import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { submitBaseClaim } from './campaignForms';
import {
  settingUp,
  submitCommonSkillSet,
  submitSettingUpFinished,
  submitSkillLevelSet,
} from './continued';
import type { LogEntry } from './log';
import { outstanding } from './outstanding';
import { dueProjects } from './projects';
import {
  submitFacilityPlaced,
  submitOrderCarried,
  submitSlotEmptied,
  submitUpgradePlaced,
} from './settingUp';
import { createSurvivor } from './survivor';

const AT = '2026-11-11T09:00:00.000Z';

const picked: LogEntry = {
  turn: 5,
  phase: 'mission',
  at: AT,
  event: { kind: 'campaign-continued', turnsSinceSiege: 1 },
};

/** A campaign picked up at turn 5 and still being set up, Earl a Leader with Archery. */
const settingUpCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 5,
  step: 'select-mission',
  startingCommunityBuilt: true,
  survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), skills: { archery: 0 } }],
  base: { id: 'hobby-farm', slots: {} },
  log: [picked],
  ...overrides,
});

const done = (campaign: Campaign): Campaign => ({
  ...campaign,
  log: [...campaign.log, { ...picked, event: { kind: 'setting-up-finished' } }],
});

const after = (result: ReturnType<typeof submitFacilityPlaced>): Campaign => {
  if (!result.ok) throw new Error(result.problem);
  return result.campaign;
};

describe('setting up a campaign picked up partway (#210)', () => {
  it('lasts from its entry until it’s finished, and never for a campaign from turn 1', () => {
    expect(settingUp(settingUpCampaign())).toBe(true);
    expect(settingUp(done(settingUpCampaign()))).toBe(false);
    expect(settingUp(createNewCampaign('Cedar Hollow'))).toBe(false);
  });

  it('is owed before anything else, until it’s finished', () => {
    expect(outstanding(settingUpCampaign())[0]).toEqual({
      step: 'select-mission',
      says: 'Setting up isn’t finished.',
    });
    expect(outstanding(done(settingUpCampaign()))).not.toContainEqual(
      expect.objectContaining({ says: 'Setting up isn’t finished.' }),
    );
  });

  it('is finished once, with its entry', () => {
    const finished = after(submitSettingUpFinished(settingUpCampaign(), AT));

    expect(finished.log.at(-1)?.event).toEqual({ kind: 'setting-up-finished' });
    expect(submitSettingUpFinished(finished, AT)).toEqual({
      ok: false,
      problem: 'Only a campaign picked up partway is set up.',
    });
  });
});

describe('skill levels while setting up', () => {
  it('sets a skill they have from 0 to their Tier’s most, without XP', () => {
    const set = after(submitSkillLevelSet(settingUpCampaign(), 'earl', 'archery', 3));

    expect(set.survivors[0]?.skills).toEqual({ archery: 3 });
    expect(set.survivors[0]?.xp).toBe(0);
    expect(after(submitSkillLevelSet(set, 'earl', 'archery', 0)).survivors[0]?.skills).toEqual({
      archery: 0,
    });
  });

  it('refuses a level past the most, a skill they don’t have, and anybody missing', () => {
    expect(submitSkillLevelSet(settingUpCampaign(), 'earl', 'archery', 4)).toEqual({
      ok: false,
      problem: 'Earl Rhodes’s level is a whole number from 0 to 3.',
    });
    expect(submitSkillLevelSet(settingUpCampaign(), 'earl', 'archery', -1).ok).toBe(false);
    expect(submitSkillLevelSet(settingUpCampaign(), 'earl', 'archery', 1.5).ok).toBe(false);
    expect(submitSkillLevelSet(settingUpCampaign(), 'earl', 'scout', 1)).toEqual({
      ok: false,
      problem: 'Earl Rhodes doesn’t have that skill.',
    });
    expect(submitSkillLevelSet(settingUpCampaign(), 'nell', 'archery', 1)).toEqual({
      ok: false,
      problem: 'Only somebody in the community is set up.',
    });
  });

  it('sets a common skill’s Score from 6 to 8', () => {
    expect(
      after(submitCommonSkillSet(settingUpCampaign(), 'earl', 'move', 8)).survivors[0]?.move,
    ).toBe(8);
    expect(submitCommonSkillSet(settingUpCampaign(), 'earl', 'move', 9)).toEqual({
      ok: false,
      problem: 'Earl Rhodes’s Score is a whole number from 6 to 8.',
    });
    expect(submitCommonSkillSet(settingUpCampaign(), 'earl', 'defense', 5).ok).toBe(false);
  });

  it('is refused once setting up is finished', () => {
    expect(submitSkillLevelSet(done(settingUpCampaign()), 'earl', 'archery', 1)).toEqual({
      ok: false,
      problem: 'Levels are set like this only while a campaign picked up partway is set up.',
    });
    expect(submitCommonSkillSet(done(settingUpCampaign()), 'earl', 'move', 7).ok).toBe(false);
  });
});

describe('the base while setting up', () => {
  it('is claimed without a first base’s stock', () => {
    const claimed = after(
      submitBaseClaim(
        settingUpCampaign({ base: null, materials: { food: 2, fuel: 1, hardware: 3 } }),
        'small-town-home',
        AT,
      ),
    );

    expect(claimed.base).toEqual({ id: 'small-town-home', slots: {} });
    expect(claimed.materials).toEqual({ food: 2, fuel: 1, hardware: 3 });
    expect(claimed.log.map(({ event }) => event.kind)).toEqual([
      'campaign-continued',
      'base-claimed',
    ]);
  });

  it('places a facility free, built last turn, and an upgrade on it', () => {
    const placed = after(submitFacilityPlaced(settingUpCampaign(), 'front-yard', 'watchtower'));

    expect(placed.base?.slots['front-yard']).toEqual({
      cleared: true,
      built: { facility: 'watchtower', builtOnTurn: 4 },
    });
    expect(placed.materials.hardware).toBe(0);
    expect(
      after(submitUpgradePlaced(settingUpCampaign(), 'bunk-room-1', 'extra-bed')).base?.slots[
        'bunk-room-1'
      ],
    ).toEqual({ upgrades: ['extra-bed'] });
  });

  it('refuses what a build refuses, other than what it costs', () => {
    const placed = after(submitFacilityPlaced(settingUpCampaign(), 'front-yard', 'watchtower'));

    expect(submitFacilityPlaced(placed, 'front-yard', 'kitchen').ok).toBe(false);
    expect(submitFacilityPlaced(settingUpCampaign(), 'no-such-slot', 'kitchen').ok).toBe(false);
    expect(submitUpgradePlaced(settingUpCampaign(), 'front-yard', 'extra-bed').ok).toBe(false);
    expect(submitFacilityPlaced(done(settingUpCampaign()), 'front-yard', 'watchtower')).toEqual({
      ok: false,
      problem: 'The base is placed like this only while a campaign picked up partway is set up.',
    });
    expect(submitUpgradePlaced(done(settingUpCampaign()), 'bunk-room-1', 'extra-bed').ok).toBe(
      false,
    );
  });

  it('empties a slot of what was placed, and nothing else', () => {
    const placed = after(submitFacilityPlaced(settingUpCampaign(), 'front-yard', 'watchtower'));

    expect(after(submitSlotEmptied(placed, 'front-yard')).base?.slots).toEqual({});
    expect(submitSlotEmptied(settingUpCampaign(), 'front-yard')).toEqual({
      ok: false,
      problem: 'Nothing is placed in that slot.',
    });
    expect(submitSlotEmptied(done(placed), 'front-yard').ok).toBe(false);
  });
});

describe('last turn’s orders while setting up', () => {
  it('go on the queue paid and ordered last turn, so this turn finishes them', () => {
    const carried = after(
      submitOrderCarried(settingUpCampaign(), {
        kind: 'facility',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
    );

    expect(carried.projects).toEqual([
      {
        kind: 'facility',
        slot: 'front-yard',
        facility: 'watchtower',
        orderedOnTurn: 4,
        charged: { hardware: 0, labor: 0 },
      },
    ]);
    expect(dueProjects(carried)).toHaveLength(1);
    expect(carried.materials.hardware).toBe(0);
  });

  it('refuses what an order refuses, other than its cost and its phase', () => {
    const carried = after(
      submitOrderCarried(settingUpCampaign(), {
        kind: 'facility',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
    );

    expect(
      submitOrderCarried(carried, { kind: 'facility', slot: 'front-yard', facility: 'kitchen' }).ok,
    ).toBe(false);
    expect(
      submitOrderCarried(done(settingUpCampaign()), {
        kind: 'facility',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
    ).toEqual({
      ok: false,
      problem: 'Last turn’s orders are entered only while a campaign picked up partway is set up.',
    });
  });
});
