import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { createSurvivor } from './survivor';
import { promotionStatChoices } from './advancement';
import {
  submitCommonSkill,
  submitConversion,
  submitHaul,
  submitHealing,
  submitNewSkill,
  submitPromotion,
  submitSkillLevel,
  submitXpAward,
} from './advancementForms';
import { expectAccepted, expectRefused } from '../test/forms';

/**
 * The Advancement Phase's forms on their own, without the store (#179).
 *
 * The reducer's suite still walks each of these through `campaignReducer`, and
 * is what says the move changed nothing. This one says what the engine answers
 * directly: a campaign with its entries when the form goes through, and a
 * reason when it does not.
 */

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-11T09:00:00.000Z';
const LATER = '2026-10-11T09:05:00.000Z';

const EARL = 'earl';
const CARLA = 'carla';

function community(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'character-advancement',
    ...overrides,
  };
}

/** Earl went on the mission; Carla stayed at the base. */
const afterAMission = () =>
  community({
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ],
    assignments: { [EARL]: { task: 'mission', team: 1 } },
  });

const events = (campaign: Campaign) => campaign.log.map((entry) => entry.event);

const earl = (campaign: Campaign): Survivor | undefined =>
  campaign.survivors.find((survivor) => survivor.id === EARL);

describe('submitHaul', () => {
  it('puts the rolls in storage and records the haul, stamped when it was given', () => {
    const after = expectAccepted(
      submitHaul(afterAMission(), { rolls: [{ roll: 4 }, { roll: 7 }] }, AT),
    );

    expect(after.materials).toEqual({ food: 1, fuel: 0, hardware: 1, rare: 0 });
    expect(after.log).toEqual([
      {
        turn: 3,
        phase: 'advancement',
        at: AT,
        event: { kind: 'materials-added', food: 1, fuel: 0, hardware: 1, rare: 0 },
      },
    ]);
  });

  it('records a scavenger’s find after the haul, with what they chose', () => {
    const after = expectAccepted(
      submitHaul(
        community({
          survivors: [createSurvivor('Earl Rhodes', 3, { id: EARL })],
          assignments: { [EARL]: { task: 'scavenging' } },
        }),
        { rolls: [], scavenged: 'rare' },
        AT,
      ),
    );

    expect(after.materials).toEqual({ food: 0, fuel: 0, hardware: 0, rare: 1 });
    expect(events(after)).toEqual([
      { kind: 'materials-added', food: 0, fuel: 0, hardware: 0, rare: 1 },
      {
        kind: 'materials-scavenged',
        survivor: EARL,
        name: 'Earl Rhodes',
        food: 0,
        fuel: 0,
        hardware: 0,
        rare: 1,
      },
    ]);
  });

  it('refuses a second haul in the same turn', () => {
    const once = expectAccepted(submitHaul(afterAMission(), { rolls: [{ roll: 4 }] }, AT));

    expect(expectRefused(submitHaul(once, { rolls: [{ roll: 4 }] }, LATER))).toMatch(/already/);
  });
});

describe('submitConversion', () => {
  /** A Gas Range in the Hobby Farm's built-in Kitchen, which trades two Fuel. */
  const kitchen = (fuel: number) =>
    community({
      materials: { food: 0, fuel, hardware: 0, rare: 0 },
      base: { id: 'hobby-farm', slots: { kitchen: { upgrades: ['gas-range'] } } },
    });

  it('trades the materials and records the exchange', () => {
    const after = expectAccepted(
      submitConversion(kitchen(2), { slot: 'kitchen', source: 'gas-range' }, AT),
    );

    expect(after.materials).toEqual({ food: 1, fuel: 0, hardware: 0, rare: 0 });
    expect(events(after)).toEqual([
      {
        kind: 'materials-converted',
        slot: 'kitchen',
        source: 'gas-range',
        spent: { fuel: 2 },
        gained: { food: 1 },
      },
    ]);
  });

  it('refuses with the check’s own reason when the materials are not there', () => {
    expect(
      expectRefused(submitConversion(kitchen(1), { slot: 'kitchen', source: 'gas-range' }, AT)),
    ).toBe('Not enough fuel in storage for this.');
  });

  it('refuses a conversion the base does not have', () => {
    expect(
      expectRefused(submitConversion(kitchen(2), { slot: 'garage', source: 'gas-range' }, AT)),
    ).toMatch(/converts/);
  });
});

describe('submitHealing', () => {
  /** A Hero at 1 of 4, so one point of rest leaves them wounded. */
  const hurt = (overrides: Partial<Survivor> = {}, origin?: Campaign['origin']) =>
    community({
      ...(origin === undefined ? {} : { origin }),
      survivors: [
        { ...createSurvivor('Marcus Webb', 4, { id: EARL }), currentHp: 1, ...overrides },
      ],
      assignments: { [EARL]: { task: 'rest' } },
    });

  it('shares out the Health and writes one entry per survivor', () => {
    const after = expectAccepted(submitHealing(hurt(), {}, AT));

    expect(earl(after)?.currentHp).toBe(2);
    expect(events(after)).toEqual([
      { kind: 'health-restored', survivor: EARL, name: 'Marcus Webb', health: 1, source: 'rest' },
    ]);
  });

  /** Viral (pp. 19, 123): the point the player put on Infection says so. */
  it('spends a point on Infection where the player chose, and records it', () => {
    const after = expectAccepted(
      submitHealing(hurt({ infection: 5 }, 'viral'), { [`rest:${EARL}`]: 1 }, AT),
    );

    expect(earl(after)).toMatchObject({ currentHp: 1, infection: 4 });
    expect(events(after)).toEqual([
      {
        kind: 'health-restored',
        survivor: EARL,
        name: 'Marcus Webb',
        health: 1,
        source: 'rest',
        infection: 1,
      },
    ]);
  });

  it('refuses to heal the same turn twice', () => {
    const once = expectAccepted(submitHealing(hurt(), {}, AT));

    expect(expectRefused(submitHealing(once, {}, LATER))).toMatch(/already/);
  });
});

describe('submitXpAward', () => {
  it('gives the survivor one XP and records where it came from', () => {
    const after = expectAccepted(
      submitXpAward(afterAMission(), { survivor: EARL, source: 'mission' }, AT),
    );

    expect(earl(after)?.xp).toBe(1);
    expect(events(after)).toEqual([
      { kind: 'xp-awarded', survivor: EARL, name: 'Earl Rhodes', amount: 1, source: 'mission' },
    ]);
  });

  /** Carla was not on the mission, so the mission's XP is not hers to take. */
  it('refuses with the check’s own reason', () => {
    const problem = expectRefused(
      submitXpAward(afterAMission(), { survivor: CARLA, source: 'mission' }, AT),
    );

    expect(problem).not.toBe('');
  });

  it('refuses somebody the community does not hold', () => {
    expect(
      expectRefused(
        submitXpAward(afterAMission(), { survivor: 'nobody', source: 'discretionary' }, AT),
      ),
    ).toMatch(/community/);
  });
});

describe('the three purchases', () => {
  /** A Citizen with Scavenge taken at level 0. */
  const citizen = (xp: number) =>
    community({
      survivors: [
        { ...createSurvivor('Marcus Webb', 2, { id: EARL }), skills: { scavenge: 0 }, xp },
      ],
    });

  describe('submitSkillLevel', () => {
    it('charges the new level and records the level reached', () => {
      const after = expectAccepted(
        submitSkillLevel(citizen(20), { survivor: EARL, skill: 'scavenge' }, AT),
      );

      expect(earl(after)).toMatchObject({ xp: 19, skills: { scavenge: 1 } });
      expect(events(after)).toEqual([
        {
          kind: 'skill-level-bought',
          survivor: EARL,
          name: 'Marcus Webb',
          skill: 'scavenge',
          level: 1,
        },
      ]);
    });

    it('refuses a level nobody can afford, and changes nothing', () => {
      expect(
        expectRefused(submitSkillLevel(citizen(0), { survivor: EARL, skill: 'scavenge' }, AT)),
      ).toMatch(/experience/);
    });

    it('refuses a skill that has not been taken', () => {
      expect(
        expectRefused(submitSkillLevel(citizen(20), { survivor: EARL, skill: 'archery' }, AT)),
      ).toMatch(/not taken/);
    });
  });

  describe('submitCommonSkill', () => {
    it('charges the new Score and records it', () => {
      const after = expectAccepted(
        submitCommonSkill(citizen(20), { survivor: EARL, skill: 'move' }, AT),
      );

      expect(earl(after)).toMatchObject({ xp: 13, move: 7 });
      expect(events(after)).toEqual([
        {
          kind: 'common-skill-bought',
          survivor: EARL,
          name: 'Marcus Webb',
          skill: 'move',
          score: 7,
        },
      ]);
    });

    it('refuses a Score nobody can afford', () => {
      expect(
        expectRefused(submitCommonSkill(citizen(0), { survivor: EARL, skill: 'defense' }, AT)),
      ).toMatch(/experience/);
    });
  });

  describe('submitPromotion', () => {
    it('promotes one Tier and records the Tier reached', () => {
      const before = citizen(20);
      const [raise = null] = promotionStatChoices(before.survivors[0] as Survivor);
      const after = expectAccepted(submitPromotion(before, { survivor: EARL, raise }, AT));

      expect(earl(after)?.tier).toBe(3);
      expect(events(after)).toEqual([
        { kind: 'survivor-promoted', survivor: EARL, name: 'Marcus Webb', tier: 3 },
      ]);
    });

    /** pg. 18 gives a Citizen's choice of stat to the player, not to the app. */
    it('refuses a promotion with a choice of stat left unmade', () => {
      expect(
        expectRefused(submitPromotion(citizen(20), { survivor: EARL, raise: null }, AT)),
      ).toMatch(/Choose/);
    });

    it('refuses somebody the community does not hold', () => {
      expect(
        expectRefused(submitPromotion(citizen(20), { survivor: 'nobody', raise: null }, AT)),
      ).toMatch(/community/);
    });
  });
});

describe('submitNewSkill', () => {
  it('takes the skill at level 0 and writes nothing in the log', () => {
    const after = expectAccepted(
      submitNewSkill(afterAMission(), { survivor: CARLA, skill: 'archery' }),
    );

    expect(after.survivors.find((survivor) => survivor.id === CARLA)?.skills).toEqual({
      archery: 0,
    });
    expect(after.log).toEqual([]);
  });

  it('refuses somebody the community does not hold', () => {
    expect(
      expectRefused(submitNewSkill(afterAMission(), { survivor: 'nobody', skill: 'archery' })),
    ).toMatch(/community/);
  });
});
