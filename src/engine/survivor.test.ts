import { describe, expect, it } from 'vitest';
import { D10_RESULTS } from '../data/dice';
import { SKILLS } from '../data/skills';
import type { Survivor } from './campaign';
import {
  communityTierLevels,
  createSurvivor,
  inventorySlots,
  labor,
  maxHp,
  recruitSurvivor,
  skillScore,
} from './survivor';

/**
 * The rulebook builds two characters completely on pg. 13–15 and states their
 * finished numbers. Using them instead of invented cases means these tests
 * check the rules as written rather than checking that the code agrees with
 * itself — if a reading of the Carry rule is wrong, their totals say so.
 */

/** pg. 13–14. Tier 4, stats 4/3/2/1, four skills, all freshly taken at level 0. */
const EARL = {
  id: 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53',
  name: 'Earl Rhodes',
  tier: 4,
  stats: { strength: 3, dexterity: 2, intelligence: 4, cooperation: 1 },
  skills: { 'heavy-weapon': 0, tactics: 0, carry: 0, scavenge: 0 },
  move: 6,
  defense: 6,
  currentHp: 4,
  xp: 0,
} satisfies Survivor;

/** pg. 15. Tier 3, stats 3/2/1/0, three skills — and no Carry. */
const CARLA = {
  id: 'd2c93a75-1e48-4f60-b8d7-5a3e0c96f41b',
  name: 'Carla Proust',
  tier: 3,
  stats: { strength: 1, dexterity: 3, intelligence: 2, cooperation: 0 },
  skills: { archery: 0, enter: 0, stealth: 0 },
  move: 6,
  defense: 6,
  currentHp: 3,
  xp: 0,
} satisfies Survivor;

describe('skillScore', () => {
  it('adds the skill level to its governing stat', () => {
    // Heavy Weapon is governed by Strength: 3 + 0.
    expect(skillScore(EARL, 'heavy-weapon')).toBe(3);
    // Tactics by Intelligence: 4 + 0.
    expect(skillScore(EARL, 'tactics')).toBe(4);
    // Archery by Dexterity: 3 + 0.
    expect(skillScore(CARLA, 'archery')).toBe(3);
  });

  it('counts the level as well as the stat', () => {
    const trained = { ...EARL, skills: { ...EARL.skills, tactics: 3 } } satisfies Survivor;

    expect(skillScore(trained, 'tactics')).toBe(7);
  });

  /**
   * The distinction the null return exists for. Earl has Strength 3, so a
   * Bladed Weapon score of 3 would look entirely plausible on a sheet — and he
   * cannot make a Bladed Weapon check at all, because he does not have the skill.
   */
  it('is null for a skill the survivor does not have, not zero and not the bare stat', () => {
    expect(skillScore(EARL, 'blade-weapon')).toBeNull();
    expect(skillScore(CARLA, 'carry')).toBeNull();
  });
});

describe('maxHp and labor', () => {
  it('are the survivor tier', () => {
    expect(maxHp(EARL)).toBe(4);
    expect(maxHp(CARLA)).toBe(3);
    expect(labor(EARL)).toBe(4);
    expect(labor(CARLA)).toBe(3);
  });
});

describe('inventorySlots', () => {
  /**
   * The rulebook's own arithmetic, and the reason this function is worth
   * having: Earl's four skills are all at level 0, so a "level" reading of the
   * Carry rule gives 4. The rule says *Score*, so his whole Strength counts and
   * the answer is 7 — which is the number pg. 14 prints.
   */
  it('adds the carry score, not the carry level', () => {
    expect(inventorySlots(EARL)).toBe(7);
  });

  it('is the bare tier for a survivor without the carry skill', () => {
    expect(inventorySlots(CARLA)).toBe(3);
  });

  it('grows with the carry level and with strength', () => {
    const trained = { ...EARL, skills: { ...EARL.skills, carry: 2 } } satisfies Survivor;
    const stronger = { ...trained, stats: { ...EARL.stats, strength: 4 } } satisfies Survivor;

    expect(inventorySlots(trained)).toBe(9);
    // Carrying capacity moves when Strength moves, which is the whole reason
    // the rule reads Score rather than level.
    expect(inventorySlots(stronger)).toBe(10);
  });
});

describe('createSurvivor', () => {
  const ID = '0f1e2d3c-4b5a-4968-8776-655443322110';

  it('gives a survivor the stat values their tier is built from', () => {
    const leader = createSurvivor('Carla Proust', 3, { id: ID });

    // The multiset is what the rules fix (pg. 7); which stat holds which
    // value is the player's to choose, so the arrangement is only a default.
    expect(Object.values(leader.stats).sort()).toEqual([0, 1, 2, 3]);
  });

  it('starts at full health with the common skills at six and no experience', () => {
    const leader = createSurvivor('Carla Proust', 3, { id: ID });

    expect(leader.currentHp).toBe(maxHp(leader));
    expect(leader.currentHp).toBe(3);
    expect(leader.move).toBe(6);
    expect(leader.defense).toBe(6);
    expect(leader.xp).toBe(0);
  });

  /**
   * Slots waiting rather than skills in them. Choosing skills is the creation
   * screen's job, and an empty list is what lets that screen report the build
   * as unfinished.
   */
  it('starts with no skills at all', () => {
    expect(createSurvivor('Ruby Vance', 1, { id: ID }).skills).toEqual({});
  });

  it('honours an injected id and generates a distinct one otherwise', () => {
    expect(createSurvivor('Ruby Vance', 1, { id: ID }).id).toBe(ID);
    expect(createSurvivor('Ruby Vance', 1).id).not.toBe(createSurvivor('Ruby Vance', 1).id);
  });

  it('produces a survivor the derived functions can read', () => {
    const hero = createSurvivor('Earl Rhodes', 4, { id: ID });

    expect(maxHp(hero)).toBe(4);
    // No Carry skill yet, so Inventory Slots are the bare tier.
    expect(inventorySlots(hero)).toBe(4);
  });
});

describe('communityTierLevels', () => {
  it('sums the tiers of the whole community', () => {
    expect(communityTierLevels([EARL, CARLA])).toBe(7);
  });

  it('is zero for an empty community', () => {
    expect(communityTierLevels([])).toBe(0);
  });
});

/**
 * A survivor found on a mission rather than built at the start (pg. 15).
 *
 * The rulebook works this one too: Carla Proust is a Tier 3 field recruit whose
 * roll came up a **six**, giving her **Archery**. If the d10 table is
 * transcribed wrong, or read off by one, that single assertion catches it.
 */
describe('recruitSurvivor', () => {
  const ID = '4d8f1b60-9a27-4c53-b1e6-70a5c93d2f48';

  it('gives a leader the skill the rulebook’s own example rolls', () => {
    const carla = recruitSurvivor('Carla Proust', 3, 6, { id: ID });

    expect(Object.keys(carla.skills)).toEqual(['archery']);
    expect(carla.skills.archery).toBe(0);
  });

  it('is otherwise an ordinary survivor of that tier', () => {
    const carla = recruitSurvivor('Carla Proust', 3, 6, { id: ID });

    expect(carla).toEqual({
      ...createSurvivor('Carla Proust', 3, { id: ID }),
      skills: { archery: 0 },
    });
  });

  /** A Rookie's single skill is never randomly generated (pg. 7). */
  it('rolls nothing for a rookie, whatever the die said', () => {
    for (const roll of D10_RESULTS) {
      expect(recruitSurvivor('Ruby Vance', 1, roll, { id: ID }).skills).toEqual({});
    }
  });

  /**
   * Result 10 is the player's choice, which is not a skill. The recruit arrives
   * one skill short — the same state a freshly created survivor is in — and the
   * sheet reports it and offers the control to finish them.
   */
  it('leaves a player’s-choice roll for the player', () => {
    expect(recruitSurvivor('Carla Proust', 3, 10, { id: ID }).skills).toEqual({});
  });

  it('rolls a real skill for every result but the last', () => {
    for (const roll of D10_RESULTS) {
      const skills = Object.keys(recruitSurvivor('Recruit', 2, roll, { id: ID }).skills);

      if (roll === 10) {
        expect(skills, 'result 10 is the player’s choice').toEqual([]);
        continue;
      }

      expect(skills, `roll ${roll}`).toHaveLength(1);
      expect(SKILLS, `roll ${roll}`).toContain(skills[0]);
    }
  });

  it('generates a distinct id when none is given', () => {
    expect(recruitSurvivor('Recruit', 2, 1).id).not.toBe(recruitSurvivor('Recruit', 2, 1).id);
  });
});
