/**
 * Field recruits — rules as data (pg. 7, 15).
 *
 * A survivor recruited on a mission arrives with a history, so one of their
 * skills is rolled rather than chosen.
 */

import type { D10Result } from './dice';
import type { Skill } from './skills';
import type { Tier } from './tiers';

/**
 * The tenth result on the recruit table is the player's choice of skill, which
 * is not a skill. It gets its own value rather than being smuggled in as one,
 * so every consumer of the table has to decide what to do about it instead of
 * silently treating it as a skill name.
 */
export const PLAYERS_CHOICE = 'players-choice';

export type PlayersChoice = typeof PLAYERS_CHOICE;

/** The starting skill of a field recruit, by d10 result (pg. 15). */
export const RECRUIT_SKILL_TABLE = {
  1: 'blunt-weapon',
  2: 'blade-weapon',
  3: 'heavy-weapon',
  4: 'handguns',
  5: 'long-guns',
  6: 'archery',
  7: 'tinker',
  8: 'traps',
  9: 'scout',
  10: PLAYERS_CHOICE,
} as const satisfies Record<D10Result, Skill | PlayersChoice>;

/**
 * Heroes are never recruited in the field (pg. 7) — a Tier 4 survivor only
 * ever arrives through creation or promotion.
 */
export const FIELD_RECRUITABLE_TIERS = [1, 2, 3] as const satisfies readonly Tier[];

/**
 * The Tiers a field recruit can arrive at.
 *
 * Derived from the list rather than written out again, and narrower than
 * `Tier`, so a function that recruits somebody cannot be handed a Hero at all
 * — a compile error rather than a check that has to remember to run.
 */
export type FieldRecruitTier = (typeof FIELD_RECRUITABLE_TIERS)[number];

/**
 * Tier 2 and above roll for one of their skills; a Rookie's single skill is
 * never randomly generated (pg. 7).
 */
export const TIERS_WITH_ROLLED_SKILL = [2, 3] as const satisfies readonly Tier[];

/**
 * Whether a recruit at this Tier takes a skill off the table at all.
 *
 * A predicate rather than the list, because three places now ask — the engine
 * that builds the recruit, the form that offers the die, and the entry that
 * records what happened — and the playtest found them disagreeing: the engine
 * ignored the roll for a Rookie while the screen asked for one and the log
 * wrote it down permanently, so a player who rolled a 1 was told they had been
 * given Blunt Weapon and then handed a survivor with no skills at all.
 */
export function rollsForSkill(tier: Tier): boolean {
  return TIERS_WITH_ROLLED_SKILL.some((rolls) => rolls === tier);
}
