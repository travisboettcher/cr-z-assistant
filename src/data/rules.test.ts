import { describe, expect, it } from 'vitest';
import { commonSkillScoreCost, skillLevelCost, tierCost } from './advancement';
import {
  D10_RESULTS,
  FIELD_RECRUITABLE_TIERS,
  PLAYERS_CHOICE,
  RECRUIT_SKILL_TABLE,
  TIERS_WITH_ROLLED_SKILL,
} from './recruitTable';
import {
  COMMON_SKILLS,
  COMMON_SKILL_MAX_SCORE,
  COMMON_SKILL_START_SCORE,
  SKILLS,
  SKILL_STATS,
  STATS,
  type Stat,
} from './skills';
import { STARTING_COMMUNITY_TIER_LEVELS, TIERS, TIER_RULES, type Tier } from './tiers';

describe('stats and skills', () => {
  it('has four stats and twenty governed skills', () => {
    expect(STATS).toHaveLength(4);
    expect(SKILLS).toHaveLength(20);
  });

  it('governs exactly five skills with each stat', () => {
    const counts = new Map<Stat, number>(STATS.map((stat) => [stat, 0]));

    for (const skill of SKILLS) {
      const stat = SKILL_STATS[skill];
      counts.set(stat, (counts.get(stat) ?? 0) + 1);
    }

    expect([...counts.values()]).toEqual([5, 5, 5, 5]);
  });

  it('lists no skill twice', () => {
    expect(new Set(SKILLS).size).toBe(SKILLS.length);
  });

  it('keeps the common skills separate from the governed ones, with no stat', () => {
    expect(COMMON_SKILLS).toEqual(['move', 'defense']);
    expect(COMMON_SKILL_START_SCORE).toBe(6);
    expect(COMMON_SKILL_MAX_SCORE).toBe(8);

    // A common skill is not a governed skill, so it cannot be looked up in the
    // stat table. This is the shape doing its job: there is no such thing as
    // the governing stat of Move.
    for (const common of COMMON_SKILLS) {
      expect(SKILLS).not.toContain(common);
    }
  });
});

describe('tier table', () => {
  it('has four tiers', () => {
    expect(TIERS).toEqual([1, 2, 3, 4]);
  });

  it('gives each tier its stat array', () => {
    expect(TIER_RULES[1].statArray).toEqual([1, 0, 0, 0]);
    expect(TIER_RULES[2].statArray).toEqual([2, 1, 0, 0]);
    expect(TIER_RULES[3].statArray).toEqual([3, 2, 1, 0]);
    expect(TIER_RULES[4].statArray).toEqual([4, 3, 2, 1]);
  });

  it('gives every tier a stat array of exactly four values', () => {
    for (const tier of TIERS) {
      expect(TIER_RULES[tier].statArray).toHaveLength(4);
    }
  });

  it('sets skill slots, max skill level, max HP, labor and base item slots to the tier number', () => {
    // These five coincide today but are five separate rules from four pages.
    // Asserted per column rather than in a loop over a derived value, so a
    // rules change to one of them fails here instead of quietly agreeing with
    // itself.
    for (const tier of TIERS) {
      const rules = TIER_RULES[tier];
      expect(rules.skillSlots).toBe(tier);
      expect(rules.maxSkillLevel).toBe(tier);
      expect(rules.maxHp).toBe(tier);
      expect(rules.labor).toBe(tier);
      expect(rules.baseItemSlots).toBe(tier);
    }
  });

  it('builds a starting community from ten tier levels', () => {
    expect(STARTING_COMMUNITY_TIER_LEVELS).toBe(10);

    // The rulebook's recommended opening — one Hero and two Leaders — spends
    // the budget exactly, which is presumably why it is the recommendation.
    // Anything else trades those three for a wider community.
    const recommended: readonly Tier[] = [4, 3, 3];
    const spread: readonly Tier[] = [4, 2, 2, 1, 1];

    expect(recommended.reduce((total, tier) => total + tier, 0)).toBe(
      STARTING_COMMUNITY_TIER_LEVELS,
    );
    expect(spread.reduce((total, tier) => total + tier, 0)).toBe(STARTING_COMMUNITY_TIER_LEVELS);
  });
});

describe('advancement costs', () => {
  it('charges a governed skill its new level', () => {
    expect(skillLevelCost(1)).toBe(1);
    expect(skillLevelCost(2)).toBe(2);
    expect(skillLevelCost(4)).toBe(4);
  });

  it('charges a common skill its new score, which is not the same quantity', () => {
    expect(commonSkillScoreCost(7)).toBe(7);
    expect(commonSkillScoreCost(COMMON_SKILL_MAX_SCORE)).toBe(8);

    // The bug this guards: reading pg. 30 once and charging Move as though it
    // had a level. Raising Move from its starting 6 is the seventh step, and
    // costs 7 — not 1.
    expect(commonSkillScoreCost(COMMON_SKILL_START_SCORE + 1)).not.toBe(skillLevelCost(1));
  });

  it('charges a tier twice the new tier', () => {
    expect(tierCost(2)).toBe(4);
    expect(tierCost(3)).toBe(6);
    expect(tierCost(4)).toBe(8);
  });
});

describe('recruit table', () => {
  it('covers all ten d10 results', () => {
    expect(D10_RESULTS).toHaveLength(10);

    for (const result of D10_RESULTS) {
      expect(RECRUIT_SKILL_TABLE[result]).toBeDefined();
    }
  });

  it('rolls nine distinct skills and one player choice', () => {
    const rolled = D10_RESULTS.map((result) => RECRUIT_SKILL_TABLE[result]);
    const skills = rolled.filter((entry) => entry !== PLAYERS_CHOICE);

    expect(skills).toHaveLength(9);
    expect(new Set(skills).size).toBe(9);
    expect(rolled.filter((entry) => entry === PLAYERS_CHOICE)).toHaveLength(1);
  });

  it('rolls only skills that exist', () => {
    for (const result of D10_RESULTS) {
      const entry = RECRUIT_SKILL_TABLE[result];
      if (entry === PLAYERS_CHOICE) continue;

      expect(SKILLS).toContain(entry);
    }
  });

  it('never recruits a hero in the field, and never rolls a rookie a skill', () => {
    expect(FIELD_RECRUITABLE_TIERS).not.toContain(4);
    expect(TIERS_WITH_ROLLED_SKILL).not.toContain(1);

    // Every tier that rolls must be a tier that can be recruited at all.
    for (const tier of TIERS_WITH_ROLLED_SKILL) {
      expect(FIELD_RECRUITABLE_TIERS).toContain(tier);
    }
  });
});
