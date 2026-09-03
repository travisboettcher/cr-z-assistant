/**
 * Spending experience points (pg. 30).
 *
 * Two halves, on purpose. A `*Purchase` function answers *what would this cost
 * and why can't I* — the UI needs both before anything is committed, because a
 * button that is greyed out without saying why is worse than no button. A
 * `with*Bought` function returns the survivor afterwards, and re-runs its own
 * purchase check rather than trusting the caller to have asked. One source of
 * truth: a reducer cannot forget to check, because it is not the one checking.
 *
 * **The only skill purchase that exists is +1.** pg. 30 says levels cannot be
 * gained out of order, and rather than validating that after the fact there is
 * no operation here that *sets* a level — so a survivor at Archery 3 got there
 * through 1 and 2, and there is no out-of-order state to reject. Same move as
 * `FieldRecruitTier` making a Hero recruit a compile error.
 *
 * Pure, like the rest of `src/engine`: no React, no DOM, no clock.
 */

import { commonSkillScoreCost, skillLevelCost, tierCost } from '../data/advancement';
import {
  COMMON_SKILL_MAX_SCORE,
  STATS,
  type CommonSkill,
  type Skill,
  type Stat,
} from '../data/skills';
import { TIER_RULES, type StatArray, type Tier } from '../data/tiers';
import type { Stats, Survivor } from './campaign';

/** Why a purchase cannot be made. */
export type PurchaseBlock =
  'not-enough-xp' | 'at-tier-maximum' | 'at-score-maximum' | 'skill-not-taken' | 'already-a-hero';

export interface Purchase {
  /**
   * What it would cost, whether or not it is blocked.
   *
   * A price is worth showing on a control the player cannot press yet: it is
   * what tells them how much XP to go and earn.
   */
  readonly cost: number;

  readonly blocked: PurchaseBlock | null;
}

/**
 * Raising a governed skill by one level.
 *
 * The cost is the **new level** — level 1 costs 1, level 4 costs 4. Compare
 * `commonSkillPurchase`, which reads the same sentence of pg. 30 and gets a
 * completely different number.
 *
 * A skill the survivor has not taken is blocked rather than bought: taking a
 * skill is a slot decision (`survivor/skillAdded`), costs nothing, and lands the
 * skill at level 0. Buying is only ever the step after that.
 */
export function skillLevelPurchase(survivor: Survivor, skill: Skill): Purchase {
  const level = survivor.skills[skill];
  // The level being asked about, so an untaken skill still quotes the 1 XP its
  // first level will cost once it is taken.
  const newLevel = (level ?? 0) + 1;
  const cost = skillLevelCost(newLevel);

  if (level === undefined) return { cost, blocked: 'skill-not-taken' };

  if (newLevel > TIER_RULES[survivor.tier].maxSkillLevel) {
    return { cost, blocked: 'at-tier-maximum' };
  }

  return { cost, blocked: affordable(survivor, cost) };
}

/**
 * Raising Move or Defense by one.
 *
 * The cost is the new **Score** — 7, then 8 — because these have no level, only
 * a Score. This is the trap `src/data/skills.ts` shapes `COMMON_SKILLS`
 * separately to avoid: read pg. 30 once and apply it to both, and Move costs
 * 1 XP instead of 7.
 */
export function commonSkillPurchase(survivor: Survivor, skill: CommonSkill): Purchase {
  const newScore = survivor[skill] + 1;
  const cost = commonSkillScoreCost(newScore);

  if (newScore > COMMON_SKILL_MAX_SCORE) return { cost, blocked: 'at-score-maximum' };

  return { cost, blocked: affordable(survivor, cost) };
}

/** Promotion to the next Tier, at twice the new Tier in XP. */
export function tierPurchase(survivor: Survivor): Purchase {
  const newTier = survivor.tier + 1;

  // Tier 4 is the top of the table, so there is no price to quote at all.
  if (!isTier(newTier)) return { cost: 0, blocked: 'already-a-hero' };

  const cost = tierCost(newTier);

  return { cost, blocked: affordable(survivor, cost) };
}

/**
 * The survivor one level further up in `skill`, or the same survivor when the
 * purchase is blocked.
 *
 * Unchanged rather than thrown, for the reason the store ignores actions
 * against a closed campaign: a blocked purchase reaching here is a UI bug, and a
 * throw out of a reducer takes the render tree down mid-campaign.
 */
export function withSkillLevelBought(survivor: Survivor, skill: Skill): Survivor {
  const { cost, blocked } = skillLevelPurchase(survivor, skill);
  const level = survivor.skills[skill];

  if (blocked !== null || level === undefined) return survivor;

  return {
    ...survivor,
    skills: { ...survivor.skills, [skill]: level + 1 },
    xp: survivor.xp - cost,
  };
}

/** The survivor with Move or Defense one higher, or unchanged when blocked. */
export function withCommonSkillBought(survivor: Survivor, skill: CommonSkill): Survivor {
  const { cost, blocked } = commonSkillPurchase(survivor, skill);

  if (blocked !== null) return survivor;

  return { ...survivor, [skill]: survivor[skill] + 1, xp: survivor.xp - cost };
}

/**
 * The survivor one Tier higher, or unchanged when blocked.
 *
 * Promotion moves three things and deliberately leaves a fourth alone:
 *
 * - **Stats** are rebuilt to the new Tier's array, keeping the player's
 *   ordering — see `assignByRank`.
 * - **A skill slot** is granted, not a skill. The survivor is then one short,
 *   `not-enough-skills` says so, and the sheet already offers the control to
 *   finish them. Choosing is the player's, exactly as at creation.
 * - **XP** pays the price.
 * - **Health is not touched.** Max HP is the Tier and is derived, so it rises on
 *   its own; `currentHp` is a separate stored fact, and a promotion that quietly
 *   healed a wounded survivor — or quietly wounded a healthy one — would be this
 *   module inventing a rule. Healing is the Management Phase's job, and until it
 *   lands the sheet's Set control is how a player says what their health is.
 */
export function withTierBought(survivor: Survivor): Survivor {
  const { cost, blocked } = tierPurchase(survivor);
  const newTier = survivor.tier + 1;

  if (blocked !== null || !isTier(newTier)) return survivor;

  return {
    ...survivor,
    tier: newTier,
    stats: assignByRank(survivor.stats, TIER_RULES[newTier].statArray),
    xp: survivor.xp - cost,
  };
}

/**
 * The new Tier's values handed out in the survivor's own order of preference:
 * whichever stat held their highest value keeps the highest.
 *
 * A promoted survivor ends up with the canonical array for their Tier, and this
 * is how they get there without being reshuffled into somebody else. Where the
 * rules leave a real choice — a Citizen has two zeros and only one of them
 * becomes the Leader's 1 — the sheet's stat control already lets the player move
 * it afterwards, so there is no promotion dialog to build.
 *
 * Ties fall to `STATS` order, because `Array.prototype.sort` has been required
 * to be stable since ES2019 and this relies on that rather than on luck.
 */
function assignByRank(stats: Stats, statArray: StatArray): Stats {
  // Asserted as a four-tuple so it can be taken apart alongside the Tier's
  // array. The four stats are what `Stats` *is* — a fifth would not typecheck
  // anywhere else in the app — so this is a statement of fact, not a hope.
  const ranked = ([...STATS] as [Stat, Stat, Stat, Stat]).sort((a, b) => stats[b] - stats[a]);
  const [first, second, third, fourth] = ranked;
  const [highest, high, low, lowest] = statArray;

  // Spread first so the result is a full `Stats`; all four keys are then
  // overwritten, because the ranking is a permutation of every stat.
  return { ...stats, [first]: highest, [second]: high, [third]: low, [fourth]: lowest };
}

function affordable(survivor: Survivor, cost: number): PurchaseBlock | null {
  return survivor.xp >= cost ? null : 'not-enough-xp';
}

function isTier(tier: number): tier is Tier {
  return tier in TIER_RULES;
}
