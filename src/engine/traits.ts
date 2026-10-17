/**
 * What a survivor's Story Trait changes between missions (pg. 88; R84–R93,
 * R133–R135; Z7-1).
 *
 * Each effect is applied where its number is worked out, so nothing a screen
 * shows can disagree with what the turn does: Labor in `laborOf`, healing in
 * `need`, maximum Health in `maxHp`, stats in `statValue`, and assignments in
 * `checkAssignment`. This module answers the per-survivor questions those ask.
 *
 * Reads only the data and the survivor, so `survivor.ts`, which everything
 * else imports, can import it without a loop.
 *
 * Pure, like the rest of `src/engine`.
 */

import { STATS, type Stat } from '../data/skills';
import { STORY_TRAIT_RULES, type StoryTrait, type StoryTraitRules } from '../data/traits';
import { TIER_RULES } from '../data/tiers';
import type { Assignment, Survivor } from './campaign';

/** The rules of the Story Trait a survivor holds, or `undefined` for none. */
export function storyTraitRules(survivor: Survivor): StoryTraitRules | undefined {
  return survivor.storyTrait === null ? undefined : STORY_TRAIT_RULES[survivor.storyTrait];
}

/** Whether the survivor holds this Story Trait. */
export function holds(survivor: Survivor, trait: StoryTrait): boolean {
  return survivor.storyTrait === trait;
}

/** Maximum Health a trait adds: Berserk's 1 while it is held (R133). */
export function traitMaxHealth(survivor: Survivor): number {
  return storyTraitRules(survivor)?.maxHealth ?? 0;
}

/**
 * What a trait adds to one stat: Driven's 1 to every stat but the highest,
 * every stat tied for the highest staying (R135).
 */
export function traitStatBonus(survivor: Survivor, stat: Stat): number {
  const bonus = storyTraitRules(survivor)?.belowHighestStats ?? 0;
  const highest = Math.max(...STATS.map((each) => survivor.stats[each]));

  return survivor.stats[stat] < highest ? bonus : 0;
}

/**
 * The most Health a survivor may take in one campaign turn, from every source
 * together, or `undefined` for no cap: Jaded's 1 (R90).
 */
export function healthPerTurn(survivor: Survivor): number | undefined {
  return storyTraitRules(survivor)?.healthPerTurn;
}

/**
 * The Labor one survivor gives the project team they are on (pp. 7, 20, 88), in
 * R89's order: their Tier; anything that sets it (Lone Wolf with company, 0);
 * then the multipliers (Bonded ×2 with a bondmate on the team, R134; Lone Wolf
 * alone ×2; Jaded ×½), rounded up; never below 0.
 *
 * `team` is everybody on the project team, the survivor included, because two
 * of the rules are about who else is there.
 */
export function survivorLabor(survivor: Survivor, team: readonly Survivor[]): number {
  const rules = storyTraitRules(survivor);
  const others = team.filter((member) => member.id !== survivor.id);
  const base = TIER_RULES[survivor.tier].labor;

  if (rules?.laborAlone !== undefined && others.length > 0) return 0;

  const bonded =
    rules?.laborNeedsBondmate !== true || others.some((other) => bondmates(survivor, other));
  const multiplier = (rules?.laborAlone ?? 1) * (bonded ? (rules?.laborMultiplier ?? 1) : 1);

  return Math.max(0, Math.ceil(base * multiplier));
}

/** Whether two Bonded survivors share a bond group (R84, R134). */
export function bondmates(one: Survivor, other: Survivor): boolean {
  return (
    holds(one, 'bonded') &&
    holds(other, 'bonded') &&
    one.bondGroup !== null &&
    one.bondGroup === other.bondGroup
  );
}

/**
 * The task a survivor's trait forbids, or `undefined` if it may be given:
 * Berserk only rests, heals or joins a mission team (R93).
 */
export function forbiddenBy(survivor: Survivor, task: Assignment['task']): StoryTrait | undefined {
  const rules = storyTraitRules(survivor);

  return rules?.onlyTasks === undefined || rules.onlyTasks.includes(task)
    ? undefined
    : (survivor.storyTrait ?? undefined);
}

/** Whether the survivor may join a mission team while wounded: Jaded, R12's one exception (R93). */
export function missionWhileWounded(survivor: Survivor): boolean {
  return storyTraitRules(survivor)?.missionWhileWounded === true;
}

/** A survivor's Story Trait, Veteran and bond group together, as the sheet sets them (R84). */
export type SurvivorTraits = Pick<Survivor, 'storyTrait' | 'veteran' | 'bondGroup'>;

/**
 * Why these traits cannot be a survivor's, or `null`: a bond group, counted
 * from 1, on a Bonded survivor and nobody else (R84).
 */
export function traitsProblem(traits: SurvivorTraits): string | null {
  if (traits.storyTrait === 'bonded') {
    return Number.isInteger(traits.bondGroup) && (traits.bondGroup as number) >= 1
      ? null
      : 'A Bonded survivor needs a bond group.';
  }

  return traits.bondGroup === null ? null : 'Only a Bonded survivor has a bond group.';
}

/**
 * The survivor with these traits. Assumes the check passed. A trait that took
 * maximum Health with it drops Health above the new maximum to it (R133); one
 * already above for any other reason is left alone, as an override is.
 */
export function withTraits(survivor: Survivor, traits: SurvivorTraits): Survivor {
  const changed = { ...survivor, ...traits };
  const lost = traitMaxHealth(survivor) - traitMaxHealth(changed);
  const maximum = TIER_RULES[changed.tier].maxHp + traitMaxHealth(changed);

  return lost > 0 && changed.currentHp > maximum ? { ...changed, currentHp: maximum } : changed;
}
