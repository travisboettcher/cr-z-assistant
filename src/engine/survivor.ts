/**
 * The arithmetic a paper character sheet makes you do by hand.
 *
 * Every value here is **computed on every read, never stored**. That is not
 * tidiness: the Phase 3 hunger penalty drops every stat until the next
 * Management Phase, which retroactively changes every Skill Score for the turn.
 * A cached score would be wrong for a whole turn and look right the entire time.
 *
 * Pure functions over a `Survivor` plus the tables in `src/data` — no DOM, no
 * React, enforced by `no-restricted-imports` in `eslint.config.js`.
 */

import { COMMON_SKILL_START_SCORE, SKILL_STATS, type Skill } from '../data/skills';
import { TIER_RULES, type Tier } from '../data/tiers';
import type { Stats, Survivor } from './campaign';

/**
 * A skill's level added to its governing stat (pg. 41), or **null when the
 * survivor does not have the skill at all**.
 *
 * Null rather than zero, because *"Characters can only use the Skills that they
 * possess"* (pg. 41) and zero is a number a player could act on. A survivor
 * with Strength 3 and no Blade Weapon skill is not a Blade Weapon 3; they
 * cannot make the check. Returning null forces every screen to render the
 * difference instead of quietly showing a score nobody has.
 */
export function skillScore(survivor: Survivor, skill: Skill): number | null {
  const level = survivor.skills[skill];

  if (level === undefined) return null;

  return survivor.stats[SKILL_STATS[skill]] + level;
}

/** Health points (pg. 49). */
export function maxHp(survivor: Survivor): number {
  return TIER_RULES[survivor.tier].maxHp;
}

/** Labor contributed to a project team (pg. 32). */
export function labor(survivor: Survivor): number {
  return TIER_RULES[survivor.tier].labor;
}

/**
 * How many items a survivor can carry (pg. 49): their Tier, plus their Carry
 * **Score** if they have the Carry skill.
 *
 * The Score, not the level — so a survivor who has Carry at level 0 still adds
 * their whole Strength, and a survivor without the skill adds nothing at all.
 * The rulebook's own example is exactly this case: a Tier 4 with Strength 3 and
 * Carry freshly taken at level 0 carries seven items, not four.
 */
export function itemSlots(survivor: Survivor): number {
  const carry = skillScore(survivor, 'carry');

  return TIER_RULES[survivor.tier].baseItemSlots + (carry ?? 0);
}

/**
 * The community's total Tier levels — what a starting community spends its ten
 * on (pg. 48), and what Z1-7 checks a roster against.
 */
export function communityTierLevels(survivors: readonly Survivor[]): number {
  return survivors.reduce((total, survivor) => total + survivor.tier, 0);
}

/**
 * A Tier's stat values laid out across the four stats.
 *
 * **This arrangement is a default, not a rule.** pg. 38–39 gives a Tier an
 * ordered list of values — a Hero gets 4, 3, 2 and 1 — and says *"These values
 * are assigned to whichever Stats you choose"*. Putting the highest in Strength
 * is this app's arbitrary starting point, not something the rulebook says.
 *
 * It is a safe default because the multiset is always the Tier's own, so a
 * survivor built this way is never *illegal*, only possibly not the character
 * the player had in mind. Rearranging them is the creation screen's job.
 */
function defaultStats(tier: Tier): Stats {
  const [highest, second, third, lowest] = TIER_RULES[tier].statArray;

  return { strength: highest, dexterity: second, intelligence: third, cooperation: lowest };
}

/** Values a caller may pin instead of letting the factory generate them. */
export interface NewSurvivorOptions {
  id?: string;
}

/**
 * A survivor at the moment they join the community.
 *
 * **No skills.** Skill slots are the Tier (pg. 38–39), so a new survivor has
 * slots waiting rather than skills in them; choosing skills is the creation
 * screen's job, and it is also what reports the build as incomplete until they
 * are filled.
 *
 * `id` is injectable for the same reason `createNewCampaign` takes one: a UUID
 * is the only impure thing this needs, and taking it as an argument keeps the
 * module honest about the engine's purity rule and its tests free of a moving
 * value.
 */
export function createSurvivor(
  name: string,
  tier: Tier,
  options: NewSurvivorOptions = {},
): Survivor {
  return {
    id: options.id ?? crypto.randomUUID(),
    name,
    tier,
    stats: defaultStats(tier),
    skills: {},
    move: COMMON_SKILL_START_SCORE,
    defense: COMMON_SKILL_START_SCORE,
    // Joining at full health. Wounds come from missions, which is Phase 4.
    currentHp: TIER_RULES[tier].maxHp,
    xp: 0,
  };
}
