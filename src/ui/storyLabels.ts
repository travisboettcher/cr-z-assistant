/**
 * How a story's endings read (pp. 89–102; Z7-3).
 *
 * Presentation only: what each ending gives is `STORY_RESULTS` in `src/data`.
 * A full record per story, so an ending added to the data fails the typecheck
 * here rather than rendering `undefined`. No rule text: an ending is named by
 * what the table saw, and what it gives is said in this app's words.
 */

import type { StoryMissionId } from '../data/missions';
import type { StoryResultId } from '../data/stories';
import type { StoryBuild, StoryRecord } from '../engine/log';
import { withArticle } from './articles';
import { describeItem } from './equipmentLabels';
import { SKILL_LABELS } from './skillLabels';
import { STORY_TRAIT_LABELS } from './traitLabels';

export const STORY_RESULT_LABELS: {
  [Story in StoryMissionId]: Record<StoryResultId<Story>, string>;
} = {
  'left-behind-1': {
    rescued: 'The loved one was rescued',
    'not-rescued': 'The loved one was not rescued',
  },
  'left-behind-2a': {
    'family-rescued': 'The family member was rescued',
    'stranger-rescued': 'A stranger was rescued, not the family member',
    'nobody-rescued': 'Nobody was rescued',
  },
  'left-behind-2b': {
    'fire-lit': 'The fire was lit',
    'body-brought-home': 'The fire was not lit, and the body was brought home',
    'body-left': 'The fire was not lit, and the body was left',
  },
  'preppers-stash-1': {
    'duffel-recovered': 'The Prepper’s Duffel was recovered',
    'duffel-not-recovered': 'The Prepper’s Duffel was not recovered',
  },
  'preppers-stash-2': {
    'trap-door-opened': 'The trap door was opened',
    'trap-door-not-opened': 'The trap door was not opened',
  },
  'sentimental-value': {
    'heirloom-recovered': 'The heirloom was recovered',
    'heirloom-not-recovered': 'The heirloom was not recovered',
  },
  'neighbors-rifle': {
    'seating-passed': 'The Seating check passed',
    'seating-failed': 'The Seating check failed or was not made',
  },
  'crashed-convoy': {
    'search-passed': 'The search check passed',
    'search-failed': 'The search check failed or was not made',
  },
  warehouse: { played: 'Played' },
};

/** One ending's label, or the id itself for one the labels do not know. */
export function storyResultLabel(story: StoryMissionId, result: string): string {
  const labels: Readonly<Record<string, string>> = STORY_RESULT_LABELS[story];

  return labels[result] ?? result;
}

/**
 * What a story's ending gives, a sentence each, with the stories named by
 * `title`: XP, a trait, the story kept or done, the next part, who joins, and
 * the things it gave.
 */
export function storyConsequences(
  story: StoryMissionId,
  record: StoryRecord,
  title: (mission: StoryMissionId) => string,
): readonly string[] {
  const { name } = record;
  const again = record.stays === true || record.attached?.mission === story;

  return [
    ...(record.xp === undefined ? [] : [`${name} gains ${String(record.xp)} XP.`]),
    ...(record.trait === undefined
      ? []
      : [
          `${name} is now ${STORY_TRAIT_LABELS[record.trait]}${
            record.bondGroup === undefined ? '' : ` (bond group ${String(record.bondGroup)})`
          }, in place of any other Story Trait.`,
        ]),
    ...(record.stays === true ? [`${title(story)} stays attached to ${name}, to try again.`] : []),
    ...(again ? [] : [`${title(story)} is done.`]),
    ...(record.attached === undefined
      ? []
      : [`${title(record.attached.mission)} is attached to ${record.attached.name}.`]),
    ...(record.joins === undefined
      ? []
      : [
          `A Tier ${String(record.joins.tier)} survivor joins at Create New Survivors${
            record.joins.bondGroup === undefined
              ? ''
              : `, Bonded in bond group ${String(record.joins.bondGroup)}`
          }${record.joins.xp === undefined ? '' : `, with ${String(record.joins.xp)} XP`}${
            record.joins.build === undefined ? '' : `, ${describeBuild(record.joins.build)}`
          }.`,
        ]),
    ...extrasConsequences(record, title),
  ];
}

/** What a story gives a new survivor's build, as a phrase: "with Long Guns, Dexterity 3 and a quality rifle". */
export function describeBuild(build: StoryBuild): string {
  return `with ${SKILL_LABELS[build.skill]}, Dexterity ${String(build.stat.dexterity)} and ${withArticle(describeItem(build.item))}`;
}

/** The things an ending gave (Z7-4), a sentence each. */
function extrasConsequences(
  record: StoryRecord,
  title: (mission: StoryMissionId) => string,
): readonly string[] {
  return [
    ...(record.items ?? []).map((item) =>
      item.name === undefined
        ? `${capitalised(withArticle(describeItem(item)))} goes into the base’s Inventory.`
        : `${item.name} takes ${withArticle(describeItem(item))}.`,
    ),
    ...(record.food === undefined ? [] : [`${String(record.food)} Food goes into storage.`]),
    ...(record.vehicle === undefined
      ? []
      : [
          `${record.vehicle.label}, a Tier ${String(record.vehicle.tier)} ${
            record.vehicle.water ? 'boat' : 'vehicle'
          }, joins the community.`,
        ]),
    ...(record.jaded === undefined
      ? []
      : [`${record.jaded.name} is now Jaded, in place of any other Story Trait.`]),
    ...(record.resources === undefined
      ? []
      : [`${String(record.resources)} resource and material tokens came home.`]),
    ...(record.alsoAttached ?? []).map(
      (one) => `${title(one.mission)} is attached to ${one.name}.`,
    ),
  ];
}

const capitalised = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
