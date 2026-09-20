/**
 * What advancement costs in experience points (pg. 18).
 *
 * Costs are functions of the target rather than lookup tables, because that is
 * what the rules are: a price derived from what you are buying.
 *
 * These say only what something costs. Whether a survivor may buy it — enough
 * XP, the Tier cap on skill levels, no buying levels out of order — is
 * validation, and lives in the engine.
 */

import type { Tier } from './tiers';

/**
 * A governed skill costs its **new level**: level 1 costs 1, level 4 costs 4.
 */
export function skillLevelCost(newLevel: number): number {
  return newLevel;
}

/**
 * Move and Defense cost their **new Score** — 7, then 8 — because they have no
 * level, only a Score.
 *
 * This is the same sentence of pg. 18 as `skillLevelCost` and a different
 * quantity. Reading it once and applying it to both is how Move ends up costing
 * 1 XP, so the two are separate functions with names that say which is which.
 */
export function commonSkillScoreCost(newScore: number): number {
  return newScore;
}

/**
 * A Tier costs twice the new Tier. It also grants a new skill slot and a stat
 * increase, which are effects rather than costs and belong to the engine.
 */
export function tierCost(newTier: Tier): number {
  return newTier * 2;
}
