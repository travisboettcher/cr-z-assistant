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
import { PROMOTION_STORIES, type StoryMissionId } from '../data/missions';
import { SPELLS } from '../data/origins';
import { type Assignment, type Campaign, keptSurvivors, type Survivor } from './campaign';

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

/**
 * A survivor's Story Trait, Veteran, bond group, attached stories, Rot
 * Resistant, the Found marks and the spells they know together, as the sheet
 * sets them (R84, R97, R109, R111, R112, R116). The last four are optional
 * here: the stories and traits a story sets leave them as they are.
 */
export type SurvivorTraits = Pick<Survivor, 'storyTrait' | 'veteran' | 'bondGroup' | 'stories'> &
  Partial<Pick<Survivor, 'rotResistant' | 'found' | 'foundCheckPassed' | 'spells'>>;

/**
 * Why these traits cannot be a survivor's, or `null`: each spell known once
 * (R155), and a bond group, counted from 1, on a Bonded survivor and nobody
 * else (R84).
 */
export function traitsProblem(traits: SurvivorTraits): string | null {
  const spells = traits.spells ?? [];
  if (spells.some((spell, at) => !SPELLS.includes(spell) || spells.indexOf(spell) !== at)) {
    return 'Each spell is known once.';
  }
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

/** Promoting from below this Tier attaches a story; from it, makes a Veteran (pg. 87). */
const STORY_TIERS_BELOW = 3;

/** Every story attached to somebody, in the community, set aside or Lost (R136). */
export function storiesHeld(campaign: Campaign): ReadonlySet<StoryMissionId> {
  return new Set(
    keptSurvivors(campaign).flatMap((survivor) => survivor.stories.map((story) => story.mission)),
  );
}

/**
 * Every story the campaign has finished (R116, R121, R139): played to a result
 * that neither kept it attached nor attached it again, as Prepper's Stash Part
 * 2 does when its trap door stays shut.
 */
export function storiesDone(campaign: Campaign): ReadonlySet<StoryMissionId> {
  return new Set(
    campaign.log.flatMap(({ event }) =>
      event.kind === 'mission-played' &&
      event.story !== undefined &&
      event.story.stays !== true &&
      event.story.attached?.mission !== event.mission
        ? [event.mission as StoryMissionId]
        : [],
    ),
  );
}

/**
 * The stories promoting this survivor attaches one of (pg. 87; R117, R136,
 * R139): the five, for a survivor leaving Tier 1 or 2, less any attached to
 * somebody already or done. None for anybody else: Tier 3 becomes a Veteran
 * instead.
 */
export function storiesOnOffer(campaign: Campaign, survivor: Survivor): readonly StoryMissionId[] {
  if (survivor.tier >= STORY_TIERS_BELOW) return [];

  const held = storiesHeld(campaign);
  const done = storiesDone(campaign);

  return PROMOTION_STORIES.filter((story) => !held.has(story) && !done.has(story));
}

/** Whether promoting this survivor makes them a Veteran: a Tier 3 becoming a Hero (pg. 87). */
export function becomesVeteran(survivor: Survivor): boolean {
  return survivor.tier === STORY_TIERS_BELOW;
}
