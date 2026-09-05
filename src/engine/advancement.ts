/**
 * Spending experience points (pg. 18).
 *
 * Two halves, on purpose. A `*Purchase` function answers *what would this cost
 * and why can't I* — the UI needs both before anything is committed, because a
 * button that is greyed out without saying why is worse than no button. A
 * `with*Bought` function returns the survivor afterwards, and re-runs its own
 * purchase check rather than trusting the caller to have asked. One source of
 * truth: a reducer cannot forget to check, because it is not the one checking.
 *
 * **The only skill purchase that exists is +1.** pg. 18 says levels cannot be
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
  | 'not-enough-xp'
  | 'at-tier-maximum'
  | 'at-score-maximum'
  | 'skill-not-taken'
  | 'already-a-hero'
  | 'stat-choice-required';

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
 * `commonSkillPurchase`, which reads the same sentence of pg. 18 and gets a
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
 * separately to avoid: read pg. 18 once and apply it to both, and Move costs
 * 1 XP instead of 7.
 */
export function commonSkillPurchase(survivor: Survivor, skill: CommonSkill): Purchase {
  const newScore = survivor[skill] + 1;
  const cost = commonSkillScoreCost(newScore);

  if (newScore > COMMON_SKILL_MAX_SCORE) return { cost, blocked: 'at-score-maximum' };

  return { cost, blocked: affordable(survivor, cost) };
}

/**
 * The stats a promotion could raise and the player has to choose between, or an
 * **empty list when the rules leave nothing to choose**.
 *
 * pg. 18: a promotion steps every stat up by one, *and if a survivor has more
 * than one stat at 0, the player chooses which one is raised*. A Rookie
 * promoting has three zeros and a Citizen two, so the choice is real for both.
 * A Leader has a single zero left and a Hero's array raises every stat, so
 * there is nothing to ask about — and a control offering a decision the rules
 * do not give is as wrong as one that hides a decision they do.
 */
export function promotionStatChoices(survivor: Survivor): readonly Stat[] {
  // Zero literally, not "the lowest value they have": the book's clause is
  // about a stat at 0, and a Leader's lowest is a 1 nobody chooses between.
  const zeroed = STATS.filter((stat) => survivor.stats[stat] === 0);

  return zeroed.length > 1 ? zeroed : [];
}

/**
 * Promotion to the next Tier, at twice the new Tier in XP.
 *
 * `raise` is the stat the player picked out of `promotionStatChoices`, or
 * `null` when they have not picked one — which is a *block*, not a default.
 * The old edition was vague enough that this module broke the tie itself, by
 * `STATS` declaration order; pg. 18 gives the choice to the player, and an app
 * that quietly answers it is wrong twice out of the three promotions.
 *
 * Checked before affordability, because it is the half of the purchase the
 * player can finish right now: picking a stat is a tap, and earning six XP is
 * the longer errand.
 */
export function tierPurchase(survivor: Survivor, raise: Stat | null): Purchase {
  const newTier = survivor.tier + 1;

  // Tier 4 is the top of the table, so there is no price to quote at all.
  if (!isTier(newTier)) return { cost: 0, blocked: 'already-a-hero' };

  const cost = tierCost(newTier);
  const choices = promotionStatChoices(survivor);

  if (choices.length > 0 && !choices.some((choice) => choice === raise)) {
    return { cost, blocked: 'stat-choice-required' };
  }

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
 *   ordering and raising the zero they picked — see `assignByRank`.
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
export function withTierBought(survivor: Survivor, raise: Stat | null): Survivor {
  const { cost, blocked } = tierPurchase(survivor, raise);
  const newTier = survivor.tier + 1;

  if (blocked !== null || !isTier(newTier)) return survivor;

  return {
    ...survivor,
    tier: newTier,
    stats: assignByRank(survivor.stats, TIER_RULES[newTier].statArray, raise),
    xp: survivor.xp - cost,
  };
}

/**
 * The new Tier's values handed out in the survivor's own order of preference:
 * whichever stat held their highest value keeps the highest.
 *
 * A promoted survivor ends up with the canonical array for their Tier, and this
 * is how they get there without being reshuffled into somebody else.
 *
 * Ranking is by current value, so the only stats that can tie are ones holding
 * the same number — and the tie that matters is between zeros, which is exactly
 * the one pg. 18 hands to the player. `raise` wins it. Any remaining tie falls
 * to `STATS` order, because `Array.prototype.sort` has been required to be
 * stable since ES2019 and this relies on that rather than on luck.
 */
function assignByRank(stats: Stats, statArray: StatArray, raise: Stat | null): Stats {
  // Asserted as a four-tuple so it can be taken apart alongside the Tier's
  // array. The four stats are what `Stats` *is* — a fifth would not typecheck
  // anywhere else in the app — so this is a statement of fact, not a hope.
  const ranked = ([...STATS] as [Stat, Stat, Stat, Stat]).sort(
    (a, b) => stats[b] - stats[a] || chosen(b, raise) - chosen(a, raise),
  );
  const [first, second, third, fourth] = ranked;
  const [highest, high, low, lowest] = statArray;

  // Spread first so the result is a full `Stats`; all four keys are then
  // overwritten, because the ranking is a permutation of every stat.
  return { ...stats, [first]: highest, [second]: high, [third]: low, [fourth]: lowest };
}

/**
 * A sort key putting the player's pick ahead of the stats it ties with — 1 for
 * the chosen stat, 0 for everyone else, subtracted the same way the values are.
 */
function chosen(stat: Stat, raise: Stat | null): number {
  return stat === raise ? 1 : 0;
}

function affordable(survivor: Survivor, cost: number): PurchaseBlock | null {
  return survivor.xp >= cost ? null : 'not-enough-xp';
}

function isTier(tier: number): tier is Tier {
  return tier in TIER_RULES;
}
