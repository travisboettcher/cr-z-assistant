import { describe, expect, it } from 'vitest';
import { STATS } from '../data/skills';
import { TIER_RULES } from '../data/tiers';
import {
  commonSkillPurchase,
  skillLevelPurchase,
  tierPurchase,
  withCommonSkillBought,
  withSkillLevelBought,
  withTierBought,
} from './advancement';
import type { Survivor } from './campaign';
import { maxHp } from './survivor';
import { survivorViolations } from './legality';

/** pg. 50. Tier 3, stats 3/2/1/0, three skills — and a pile of XP to spend. */
const CARLA = {
  id: 'd2c93a75-1e48-4f60-b8d7-5a3e0c96f41b',
  name: 'Carla Proust',
  tier: 3,
  stats: { strength: 1, dexterity: 3, intelligence: 2, cooperation: 0 },
  skills: { archery: 0, enter: 0, stealth: 0 },
  move: 6,
  defense: 6,
  currentHp: 3,
  xp: 20,
} satisfies Survivor;

/** A Tier 2 Citizen with the 2 deliberately not in the first stat. */
const MARCUS = {
  id: '9f2a1c47-6b83-4e05-a71d-2c8e05b3947f',
  name: 'Marcus Webb',
  tier: 2,
  stats: { strength: 0, dexterity: 0, intelligence: 2, cooperation: 1 },
  skills: { scavenge: 0, medicine: 0 },
  move: 6,
  defense: 6,
  currentHp: 2,
  xp: 20,
} satisfies Survivor;

/**
 * The whole reason this module has two cost functions instead of one. pg. 30
 * is a single sentence covering both, and the two quantities it produces differ
 * by six — so they are asserted **from the same survivor in the same test**,
 * because a wrong reading is only visible in the contrast.
 */
describe('the two costs pg. 30 quotes', () => {
  it('charges a skill its new level and a common skill its new score', () => {
    expect(skillLevelPurchase(CARLA, 'archery').cost).toBe(1);
    expect(commonSkillPurchase(CARLA, 'move').cost).toBe(7);
  });

  it('charges the level going up, not a flat rate', () => {
    const trained = { ...CARLA, skills: { ...CARLA.skills, archery: 2 } } satisfies Survivor;

    expect(skillLevelPurchase(trained, 'archery').cost).toBe(3);
  });

  it('charges the score going up, so the second point of move costs eight', () => {
    expect(commonSkillPurchase({ ...CARLA, move: 7 }, 'move').cost).toBe(8);
  });
});

describe('skillLevelPurchase', () => {
  it('is unblocked for a skill the survivor has and can afford', () => {
    expect(skillLevelPurchase(CARLA, 'archery')).toEqual({ cost: 1, blocked: null });
  });

  /**
   * Taking a skill is a slot decision and costs nothing; buying is only ever
   * the step after it. The distinction is why `SkillLevels` is partial.
   */
  it('blocks a skill the survivor has not taken', () => {
    expect(skillLevelPurchase(CARLA, 'tactics').blocked).toBe('skill-not-taken');
  });

  it('blocks a skill already at the tier maximum (pg. 41)', () => {
    const capped = { ...CARLA, skills: { ...CARLA.skills, archery: 3 } } satisfies Survivor;

    expect(TIER_RULES[3].maxSkillLevel).toBe(3);
    expect(skillLevelPurchase(capped, 'archery').blocked).toBe('at-tier-maximum');
  });

  it('blocks a purchase the survivor cannot pay for, and still quotes the price', () => {
    const trained = { ...CARLA, skills: { ...CARLA.skills, archery: 2 }, xp: 2 } satisfies Survivor;

    expect(skillLevelPurchase(trained, 'archery')).toEqual({ cost: 3, blocked: 'not-enough-xp' });
  });

  it('lets a survivor spend their last point exactly', () => {
    expect(skillLevelPurchase({ ...CARLA, xp: 1 }, 'archery').blocked).toBeNull();
  });
});

describe('commonSkillPurchase', () => {
  it('stops at a score of eight (pg. 30)', () => {
    expect(commonSkillPurchase({ ...CARLA, defense: 8 }, 'defense').blocked).toBe(
      'at-score-maximum',
    );
    expect(commonSkillPurchase({ ...CARLA, defense: 7 }, 'defense').blocked).toBeNull();
  });

  it('blocks a survivor who cannot afford the score', () => {
    // Six XP is a lot, and still not the seven a first point of Move costs.
    expect(commonSkillPurchase({ ...CARLA, xp: 6 }, 'move').blocked).toBe('not-enough-xp');
  });
});

describe('tierPurchase', () => {
  it('costs twice the new tier', () => {
    expect(tierPurchase(MARCUS)).toEqual({ cost: 6, blocked: null });
    expect(tierPurchase({ ...MARCUS, tier: 1 }).cost).toBe(4);
  });

  /** Tier 4 is the top of the table (pg. 38–39). */
  it('blocks a hero, who has nowhere to go', () => {
    expect(tierPurchase({ ...CARLA, tier: 4 }).blocked).toBe('already-a-hero');
  });

  it('blocks a survivor who cannot afford it', () => {
    expect(tierPurchase({ ...MARCUS, xp: 5 }).blocked).toBe('not-enough-xp');
  });
});

describe('withSkillLevelBought', () => {
  it('raises the level by one and takes the price out of the balance', () => {
    const bought = withSkillLevelBought(CARLA, 'archery');

    expect(bought.skills.archery).toBe(1);
    expect(bought.xp).toBe(19);
  });

  it('changes nothing at all when the purchase is blocked', () => {
    const capped = { ...CARLA, skills: { ...CARLA.skills, archery: 3 } } satisfies Survivor;

    expect(withSkillLevelBought(capped, 'archery')).toEqual(capped);
    expect(withSkillLevelBought(CARLA, 'tactics')).toEqual(CARLA);
    expect(withSkillLevelBought({ ...CARLA, xp: 0 }, 'archery').skills.archery).toBe(0);
  });

  /**
   * The claim the +1-only design makes, asserted rather than assumed: the only
   * way to Archery 3 is through 1 and 2, because no operation sets a level.
   * A skipped level would have to come from a hand-edited file, where
   * `skill-above-tier` is the rule that catches it.
   */
  it('walks a skill up one level at a time, charging each one', () => {
    const levels: number[] = [];
    const spent: number[] = [];
    let survivor: Survivor = CARLA;

    for (let step = 0; step < 3; step += 1) {
      const before = survivor.xp;
      survivor = withSkillLevelBought(survivor, 'archery');
      levels.push(survivor.skills.archery ?? -1);
      spent.push(before - survivor.xp);
    }

    expect(levels).toEqual([1, 2, 3]);
    expect(spent).toEqual([1, 2, 3]);
    // A Leader's cap, so the fourth purchase is refused rather than charged.
    expect(withSkillLevelBought(survivor, 'archery')).toEqual(survivor);
  });

  it('leaves every other skill alone', () => {
    expect(Object.keys(withSkillLevelBought(CARLA, 'archery').skills)).toEqual([
      'archery',
      'enter',
      'stealth',
    ]);
  });
});

describe('withCommonSkillBought', () => {
  it('raises the score by one and charges the score, not a level', () => {
    const bought = withCommonSkillBought(CARLA, 'move');

    expect(bought.move).toBe(7);
    expect(bought.xp).toBe(13);
    // The other common skill is a separate track.
    expect(bought.defense).toBe(6);
  });

  it('refuses to go past eight', () => {
    const capped = { ...CARLA, move: 8 } satisfies Survivor;

    expect(withCommonSkillBought(capped, 'move')).toEqual(capped);
  });
});

describe('withTierBought', () => {
  const promoted = withTierBought(MARCUS);

  it('moves the survivor up a tier and charges twice the new one', () => {
    expect(promoted.tier).toBe(3);
    expect(promoted.xp).toBe(14);
  });

  /**
   * The new Tier's array, handed out in the player's own order: Marcus had his
   * 2 in Intelligence, so his 3 is in Intelligence. A promotion that rebuilt
   * him highest-in-Strength would hand back a different character.
   */
  it('rebuilds the stat array keeping the survivor’s own ranking', () => {
    expect(promoted.stats).toEqual({
      intelligence: 3,
      cooperation: 2,
      strength: 1,
      dexterity: 0,
    });
  });

  it('ends up with exactly the values the new tier hands out', () => {
    expect(Object.values(promoted.stats).sort()).toEqual([...TIER_RULES[3].statArray].sort());
  });

  /** Two zeros, and only one of them can become the 1. Ties fall to STATS order. */
  it('breaks a tie by stat order rather than arbitrarily', () => {
    expect(STATS.indexOf('strength')).toBeLessThan(STATS.indexOf('dexterity'));
    expect(promoted.stats.strength).toBe(1);
    expect(promoted.stats.dexterity).toBe(0);
  });

  /**
   * A slot, not a skill. Choosing is the player's, exactly as at creation, and
   * the sheet already reports the gap and offers the control.
   */
  it('grants a skill slot and leaves the choosing to the player', () => {
    expect(Object.keys(promoted.skills)).toEqual(['scavenge', 'medicine']);
    expect(survivorViolations(promoted).map((violation) => violation.code)).toEqual([
      'not-enough-skills',
    ]);
  });

  /**
   * Max HP is derived from the Tier, so it rises on its own. `currentHp` is a
   * stored fact and the promotion has nothing to say about it — a promotion
   * that healed a wounded survivor would be inventing a rule.
   */
  it('raises max health without touching current health', () => {
    expect(maxHp(promoted)).toBe(3);
    expect(promoted.currentHp).toBe(MARCUS.currentHp);
  });

  it('changes nothing for a hero or for a survivor who cannot pay', () => {
    const hero = { ...CARLA, tier: 4 } satisfies Survivor;

    expect(withTierBought(hero)).toEqual(hero);
    expect(withTierBought({ ...MARCUS, xp: 5 })).toEqual({ ...MARCUS, xp: 5 });
  });

  it('carries a survivor all the way to hero, and stops there', () => {
    let survivor: Survivor = { ...MARCUS, tier: 1, stats: { ...MARCUS.stats }, xp: 20 };
    survivor = {
      ...survivor,
      stats: { strength: 0, dexterity: 1, intelligence: 0, cooperation: 0 },
    };

    survivor = withTierBought(survivor);
    expect(survivor.tier).toBe(2);
    survivor = withTierBought(survivor);
    expect(survivor.tier).toBe(3);
    survivor = withTierBought(survivor);
    expect(survivor.tier).toBe(4);
    // 4 + 6 + 8 out of 20.
    expect(survivor.xp).toBe(2);
    // Dexterity held the only point at tier 1 and holds the top value still.
    expect(survivor.stats.dexterity).toBe(4);

    expect(withTierBought(survivor).tier).toBe(4);
  });
});
