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

import { COMMON_SKILL_START_SCORE, MIN_SKILL_LEVEL, SKILL_STATS, type Skill } from '../data/skills';
import {
  PLAYERS_CHOICE,
  RECRUIT_SKILL_TABLE,
  TIERS_WITH_ROLLED_SKILL,
  type D10Result,
  type FieldRecruitTier,
} from '../data/recruitTable';
import { TIER_RULES, type Tier } from '../data/tiers';
import type { Stats, Survivor } from './campaign';

/**
 * A skill's level added to its governing stat (pg. 8), or **null when the
 * survivor does not have the skill at all**.
 *
 * **Two of the book's three terms, deliberately.** pg. 8 prints the worked
 * column headers as `Skill / Lvl / Stat / Item / Total`: a Skill Score is level
 * plus stat plus the modifier from whatever the survivor is holding. Equipment
 * is Phase 5 and there is nothing to add yet, so this returns the first two
 * terms and says so rather than letting the formula quietly disagree with the
 * book. The item term lands here when equipment does.
 *
 * Null rather than zero, because *"Characters can only use the Skills that they
 * possess"* (pg. 8) and zero is a number a player could act on. A survivor
 * with Strength 3 and no Bladed Weapon skill is not a Bladed Weapon 3; they
 * cannot make the check. Returning null forces every screen to render the
 * difference instead of quietly showing a score nobody has.
 */
export function skillScore(survivor: Survivor, skill: Skill): number | null {
  const level = survivor.skills[skill];

  if (level === undefined) return null;

  return survivor.stats[SKILL_STATS[skill]] + level;
}

/** Health points (pg. 7). */
export function maxHp(survivor: Survivor): number {
  return TIER_RULES[survivor.tier].maxHp;
}

/** Labor contributed to a project team (pg. 7); the pool is its total (pg. 20). */
export function labor(survivor: Survivor): number {
  return TIER_RULES[survivor.tier].labor;
}

/**
 * How many items a survivor can carry (pg. 14): their Tier, plus their Carry
 * **Score** if they have the Carry skill.
 *
 * The Score, not the level — so a survivor who has Carry at level 0 still adds
 * their whole Strength, and a survivor without the skill adds nothing at all.
 * The rulebook's own example is exactly this case: a Tier 4 with Strength 3 and
 * Carry freshly taken at level 0 carries seven items, not four.
 */
export function inventorySlots(survivor: Survivor): number {
  const carry = skillScore(survivor, 'carry');

  return TIER_RULES[survivor.tier].baseInventorySlots + (carry ?? 0);
}

/**
 * The community's total Tier levels — what a starting community spends its ten
 * on (pg. 13), and what Z1-7 checks a roster against.
 */
export function communityTierLevels(survivors: readonly Survivor[]): number {
  return survivors.reduce((total, survivor) => total + survivor.tier, 0);
}

/**
 * A Tier's stat values laid out across the four stats.
 *
 * **This arrangement is a default, not a rule.** pg. 7 gives a Tier an
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
 * A survivor recruited on a mission rather than built at the start.
 *
 * They arrive with a history, so **one of their skills is rolled** off the d10
 * table (pg. 15) instead of chosen. Everything else about them is a created
 * survivor: the same stat array, the same starting Move and Defense, the same
 * empty slots waiting to be filled.
 *
 * **The roll is an argument, not something this function makes.** Rolling is
 * the impure part, exactly like the UUID, and taking the result keeps this pure
 * and its tests free of a stubbed random number. It also means a player who has
 * already rolled a physical d10 at the table types in what they got.
 *
 * `tier` is a `FieldRecruitTier`, not a `Tier`: Heroes are never recruited in
 * the field (pg. 7), so passing one is a compile error rather than a rule this
 * has to remember to enforce.
 *
 * A roll of 10 is the player's choice and adds **no** skill here. That is not a
 * gap: the recruit is then simply one skill short, which is the state every
 * newly created survivor is already in, and the sheet already reports it and
 * offers the control to finish them.
 */
export function recruitSurvivor(
  name: string,
  tier: FieldRecruitTier,
  roll: D10Result,
  options: NewSurvivorOptions = {},
): Survivor {
  const recruit = createSurvivor(name, tier, options);

  // A Rookie's single skill is never randomly generated (pg. 7).
  if (!TIERS_WITH_ROLLED_SKILL.some((rolls) => rolls === tier)) return recruit;

  const rolled = RECRUIT_SKILL_TABLE[roll];

  if (rolled === PLAYERS_CHOICE) return recruit;

  return { ...recruit, skills: { [rolled]: MIN_SKILL_LEVEL } };
}

/**
 * A survivor at the moment they join the community.
 *
 * **No skills.** Skill slots are the Tier (pg. 7), so a new survivor has
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
