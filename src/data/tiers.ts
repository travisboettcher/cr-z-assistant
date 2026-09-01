/**
 * Survivor Tiers — rules as data (pg. 38–39, 41, 49, 32).
 *
 * Tier 1 Rookie, 2 Citizen, 3 Leader, 4 Hero. The names are labels and live in
 * the UI; what a Tier *means* mechanically is here.
 */

export const TIERS = [1, 2, 3, 4] as const;

export type Tier = (typeof TIERS)[number];

/**
 * The stat values a survivor of this Tier receives, highest first. An *ordered
 * list of values to assign*, not a record keyed by stat: the player chooses
 * which stat gets which value (pg. 38–39).
 */
export type StatArray = readonly [number, number, number, number];

export interface TierRules {
  readonly statArray: StatArray;
  /** How many skills a survivor of this Tier may hold (pg. 38–39). */
  readonly skillSlots: number;
  /** No skill may exceed this level (pg. 41). */
  readonly maxSkillLevel: number;
  /** Health points (pg. 49). */
  readonly maxHp: number;
  /** Labor contributed to a project team (pg. 32). */
  readonly labor: number;
  /**
   * Item slots before the Carry skill is counted (pg. 49). A survivor with the
   * Carry skill adds their Carry *Score* on top of this.
   */
  readonly baseItemSlots: number;
}

/**
 * The Tier table.
 *
 * Five of the six columns equal the Tier number for every row, so this looks
 * like five copies of its own key. It is not: they are **five separate rules
 * that happen to coincide**, drawn from four different pages. Collapsing them
 * into `maxHp = tier` would mean a later rules change to any one of them
 * silently changing the other four. `statArray` is the column that actually
 * differs.
 */
export const TIER_RULES: Record<Tier, TierRules> = {
  1: {
    statArray: [1, 0, 0, 0],
    skillSlots: 1,
    maxSkillLevel: 1,
    maxHp: 1,
    labor: 1,
    baseItemSlots: 1,
  },
  2: {
    statArray: [2, 1, 0, 0],
    skillSlots: 2,
    maxSkillLevel: 2,
    maxHp: 2,
    labor: 2,
    baseItemSlots: 2,
  },
  3: {
    statArray: [3, 2, 1, 0],
    skillSlots: 3,
    maxSkillLevel: 3,
    maxHp: 3,
    labor: 3,
    baseItemSlots: 3,
  },
  4: {
    statArray: [4, 3, 2, 1],
    skillSlots: 4,
    maxSkillLevel: 4,
    maxHp: 4,
    labor: 4,
    baseItemSlots: 4,
  },
};

/**
 * A starting community is built from ten total Tier levels (pg. 48). One Hero
 * and two Leaders is the rulebook's recommendation, not a constraint, so it is
 * not encoded here.
 */
export const STARTING_COMMUNITY_TIER_LEVELS = 10;
