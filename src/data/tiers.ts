/**
 * Survivor Tiers — rules as data (pg. 7).
 *
 * Tier 1 Rookie, 2 Citizen, 3 Leader, 4 Hero. The names are labels and live in
 * the UI; what a Tier *means* mechanically is here.
 */

export const TIERS = [1, 2, 3, 4] as const;

export type Tier = (typeof TIERS)[number];

/**
 * The Tier that counts as a Hero (pg. 7).
 *
 * Named because two rules turn on it and neither should spell it `4`: a base
 * caps how many a community may hold, and only one may go on any single
 * mission.
 */
export const HERO_TIER: Tier = 4;

/**
 * The stat values a survivor of this Tier receives, highest first. An *ordered
 * list of values to assign*, not a record keyed by stat: the player chooses
 * which stat gets which value (pg. 7).
 */
export type StatArray = readonly [number, number, number, number];

export interface TierRules {
  readonly statArray: StatArray;
  /** How many skills a survivor of this Tier may hold (pg. 7). */
  readonly skillSlots: number;
  /** No skill may exceed this level (pg. 7). */
  readonly maxSkillLevel: number;
  /** Health points (pg. 7). */
  readonly maxHp: number;
  /** Labor contributed to a project team (pg. 7). */
  readonly labor: number;
  /**
   * Inventory Slots before the Carry skill is counted (pg. 7). A survivor with
   * the Carry skill adds their Carry *Score* on top of this (pg. 14).
   */
  readonly baseInventorySlots: number;
}

/**
 * The Tier table.
 *
 * Five of the six columns equal the Tier number for every row, so this looks
 * like five copies of its own key. It is not: they are **five separate rules
 * that happen to coincide**, printed as five separate columns of the Tier
 * table. Collapsing them into `maxHp = tier` would mean a later rules change to
 * any one of them silently changing the other four. `statArray` is the column
 * that actually differs.
 */
export const TIER_RULES: Record<Tier, TierRules> = {
  1: {
    statArray: [1, 0, 0, 0],
    skillSlots: 1,
    maxSkillLevel: 1,
    maxHp: 1,
    labor: 1,
    baseInventorySlots: 1,
  },
  2: {
    statArray: [2, 1, 0, 0],
    skillSlots: 2,
    maxSkillLevel: 2,
    maxHp: 2,
    labor: 2,
    baseInventorySlots: 2,
  },
  3: {
    statArray: [3, 2, 1, 0],
    skillSlots: 3,
    maxSkillLevel: 3,
    maxHp: 3,
    labor: 3,
    baseInventorySlots: 3,
  },
  4: {
    statArray: [4, 3, 2, 1],
    skillSlots: 4,
    maxSkillLevel: 4,
    maxHp: 4,
    labor: 4,
    baseInventorySlots: 4,
  },
};

/**
 * A starting community is built from ten total Tier levels (pg. 13). One Hero
 * and two Leaders is the rulebook's recommendation, not a constraint, so it is
 * not encoded here.
 */
export const STARTING_COMMUNITY_TIER_LEVELS = 10;
