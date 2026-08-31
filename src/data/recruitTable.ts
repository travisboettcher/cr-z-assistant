/**
 * Field recruits — rules as data (pg. 38–39, 50).
 *
 * A survivor recruited on a mission arrives with a history, so one of their
 * skills is rolled rather than chosen.
 */

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

export const D10_RESULTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type D10Result = (typeof D10_RESULTS)[number];

/** The starting skill of a field recruit, by d10 result (pg. 50). */
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
 * Heroes are never recruited in the field (pg. 38) — a Tier 4 survivor only
 * ever arrives through creation or promotion.
 */
export const FIELD_RECRUITABLE_TIERS: readonly Tier[] = [1, 2, 3];

/**
 * Tier 2 and above roll for one of their skills; a Rookie's single skill is
 * never randomly generated (pg. 38–39).
 */
export const TIERS_WITH_ROLLED_SKILL: readonly Tier[] = [2, 3];
