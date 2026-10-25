/**
 * How a story mission ends, and what its ending gives (pp. 87–102; R85,
 * R116–R121, R138, R139; Z7-3).
 *
 * A story is played by the team its survivor is on (`missionsOnOffer`), and its
 * outcome is a `mission-played` entry carrying a `StoryRecord`: the result the
 * table chose, and everything that result gave, written out. The record is
 * built here from the result and, where the next part goes to somebody the
 * player picks, who that is; the form rebuilds it from those two before it is
 * logged, so the history says what the rules gave, whatever the screen sent.
 *
 * What the map holds, an item, the boat, a roll on a table, is
 * `storyRewards.ts`'s (Z7-4). A survivor a story brings is built at Create New
 * Survivors (R120).
 *
 * Reads no mission module: `missions.ts` asks `storyProblem` as part of every
 * outcome check, so the team and its story are handed in.
 *
 * Pure, like the rest of `src/engine`.
 */

import { MISSIONS, type MissionId, type StoryMissionId } from '../data/missions';
import { storyResult, type StoryResult } from '../data/stories';
import type { Tier } from '../data/tiers';
import { type Campaign, keptSurvivors, type Survivor } from './campaign';
import type { StoryRecord } from './log';
import {
  extrasOf,
  extrasProblem,
  extrasRecord,
  withExtrasTaken,
  type StoryExtras,
} from './storyRewards';
import { holds, storiesDone, storiesHeld, withTraits } from './traits';
import { withXpGained } from './survivor';

/** Whether a mission is a story, played by the survivor it is attached to (pg. 87). */
export function isStory(mission: MissionId): mission is StoryMissionId {
  return MISSIONS[mission].family === 'story';
}

/** The survivor on the team the story is attached to, who plays it (R116, R136). */
export function storyHolder(
  members: readonly Survivor[],
  story: StoryMissionId,
): Survivor | undefined {
  return members.find((member) => member.stories.some((held) => held.mission === story));
}

/** The result's next part, or `undefined` when there is none or it cannot be attached. */
export function nextPart(
  campaign: Campaign,
  story: StoryMissionId,
  result: StoryResult,
): StoryResult['next'] {
  const next = result.next;
  if (next === undefined) return undefined;

  // The story being played is still attached until its record is taken, so a
  // part that attaches itself again (Prepper's Stash Part 2) is not held.
  const held = next.story !== story && storiesHeld(campaign).has(next.story);

  // A story already held, or done, is not attached again (pg. 90; R136, R139).
  return held || storiesDone(campaign).has(next.story) ? undefined : next;
}

/**
 * Who may be given the next part, when the player chooses (pp. 94, 96, 99,
 * 101): anybody in the community, or a Tier 2 or 3 survivor on the team. Empty
 * when the part goes to the survivor who played the story.
 */
export function storyRecipients(
  campaign: Campaign,
  members: readonly Survivor[],
  next: NonNullable<StoryResult['next']>,
): readonly Survivor[] {
  switch (next.to) {
    case 'anyone':
      return campaign.survivors;
    case 'team-tier-2-or-3':
      return members.filter((member) => member.tier === 2 || member.tier === 3);
    default:
      return [];
  }
}

/** What the table chose of a story's ending: the result, who takes the next part, and the rest. */
export interface StoryChoice {
  readonly result: string;
  /** The survivor given the next part, by id, where the player chooses (`storyRecipients`). */
  readonly to?: string;
  /** The things the ending gives, as the table entered them (Z7-4). */
  readonly extras?: StoryExtras;
}

/**
 * Why this story's ending cannot be recorded for this team, or `null` if it
 * can: a story played by a team with its survivor on it, one of the story's
 * own results, and somebody who may take the next part where the player
 * chooses. Any other mission records no story.
 */
export function storyProblem(
  campaign: Campaign,
  members: readonly Survivor[],
  mission: MissionId,
  record: StoryRecord | undefined,
): string | null {
  if (!isStory(mission)) {
    return record === undefined ? null : 'Only a story mission records a story’s ending.';
  }
  if (record === undefined) return 'Choose how the story ended.';

  const holder = storyHolder(members, mission);
  if (holder === undefined) return 'Nobody on the team has this story attached.';

  const result = storyResult(mission, record.result);
  if (result === undefined) return 'Choose one of the story’s endings.';

  const next = nextPart(campaign, mission, result);
  if (next !== undefined && next.to !== 'attached') {
    const to = record.attached?.survivor;
    if (to === undefined) return 'Choose who the next part is attached to.';

    if (!storyRecipients(campaign, members, next).some((survivor) => survivor.id === to)) {
      return next.to === 'anyone'
        ? 'The next part goes to somebody in the community.'
        : 'The next part goes to a Tier 2 or 3 survivor on the team.';
    }
  }

  return extrasProblem(campaign, members, holder, result, extrasOf(record));
}

/** The bond group a new pair of Bonded survivors takes: one more than any in use. */
function newBondGroup(campaign: Campaign): number {
  return Math.max(0, ...keptSurvivors(campaign).map((survivor) => survivor.bondGroup ?? 0)) + 1;
}

/**
 * The survivor a result brings, as the record says it (R120, R138): at the
 * Tier the result sets, bonded as it says. `undefined` for a result that
 * brings nobody, or whose survivor comes only to an attached survivor of
 * another Tier (pg. 99).
 */
function joinerFor(
  campaign: Campaign,
  holder: Survivor,
  result: StoryResult,
): { readonly joins?: NonNullable<StoryRecord['joins']>; readonly bondGroup?: number } {
  const joiner = result.joins;
  if (joiner === undefined) return {};
  if (joiner.onlyIfAttachedTier !== undefined && holder.tier !== joiner.onlyIfAttachedTier) {
    return {};
  }

  const tier: Tier = joiner.tier === 'attached' ? holder.tier : joiner.tier;
  const xp = {
    ...(joiner.xp === undefined ? {} : { xp: joiner.xp }),
    // What the page gives their build (pg. 99; R142).
    ...(joiner.build === undefined ? {} : { build: joiner.build }),
  };
  const bonded = holds(holder, 'bonded') ? holder.bondGroup : null;

  switch (joiner.bond) {
    case 'pair': {
      // A pair joins the holder's own group when they have one already, so the
      // bonds they hold stay; otherwise the two start a new one.
      if (bonded !== null) return { joins: { tier, bondGroup: bonded, ...xp } };

      const group = newBondGroup(campaign);
      return { joins: { tier, bondGroup: group, ...xp }, bondGroup: group };
    }
    case 'attached-group':
      // Into the holder's group, or unbonded if they no longer hold Bonded (R138).
      return { joins: { tier, ...(bonded === null ? {} : { bondGroup: bonded }), ...xp } };
    default:
      return { joins: { tier, ...xp } };
  }
}

/**
 * The record of a story's ending, from what the table chose. Assumes
 * `storyProblem` passed for the same choice.
 */
export function storyRecord(
  campaign: Campaign,
  members: readonly Survivor[],
  story: StoryMissionId,
  choice: StoryChoice,
): StoryRecord {
  const holder = storyHolder(members, story) as Survivor;
  const result = storyResult(story, choice.result) as StoryResult;
  const next = nextPart(campaign, story, result);
  const { joins, bondGroup } = joinerFor(campaign, holder, result);
  const recipient =
    next === undefined
      ? undefined
      : next.to === 'attached'
        ? holder
        : campaign.survivors.find((survivor) => survivor.id === choice.to);
  // A pair bond makes the holder Bonded, unless they are already (R85).
  const trait = bondGroup === undefined ? result.trait : 'bonded';

  return {
    survivor: holder.id,
    name: holder.name,
    result: result.id,
    ...(result.xp === undefined ? {} : { xp: result.xp }),
    ...(trait === undefined ? {} : { trait }),
    ...(bondGroup === undefined ? {} : { bondGroup }),
    ...(result.stays === true ? { stays: true as const } : {}),
    ...(next === undefined || recipient === undefined
      ? {}
      : { attached: { mission: next.story, survivor: recipient.id, name: recipient.name } }),
    ...(joins === undefined ? {} : { joins }),
    ...extrasRecord(campaign, members, result, choice.extras ?? {}),
  };
}

/**
 * The campaign with a story's ending taken (R85, R116, R121): the XP to the
 * survivor who played it, the trait replacing theirs, the story off them
 * unless it stays, and the next part on whoever it went to, from this turn;
 * then the things it gave (`withExtrasTaken`; Z7-4). Whoever joins is built
 * at Create New Survivors, from the record (R120).
 */
export function withStoryRecorded(
  campaign: Campaign,
  story: StoryMissionId,
  record: StoryRecord,
): Campaign {
  const rewarded = (survivor: Survivor): Survivor => {
    if (survivor.id !== record.survivor) return survivor;

    const storyTrait = record.trait ?? survivor.storyTrait;
    const bondGroup = record.bondGroup ?? (storyTrait === 'bonded' ? survivor.bondGroup : null);

    return withTraits(
      withXpGained(survivor, record.xp ?? 0),
      {
        storyTrait,
        veteran: survivor.veteran,
        bondGroup,
        stories:
          record.stays === true
            ? survivor.stories
            : survivor.stories.filter((held) => held.mission !== story),
      },
    );
  };
  const attached = (survivor: Survivor): Survivor =>
    record.attached?.survivor === survivor.id
      ? {
          ...survivor,
          stories: [
            ...survivor.stories,
            { mission: record.attached.mission, attachedOnTurn: campaign.turn },
          ],
        }
      : survivor;

  return withExtrasTaken(
    { ...campaign, survivors: campaign.survivors.map((survivor) => attached(rewarded(survivor))) },
    record,
  );
}

/**
 * The record a story's form shows and sends, or `undefined` until an ending is
 * chosen, or with nobody on the team to have played it. Who takes the next
 * part may still be missing, which `storyProblem` says.
 */
export function storyEnding(
  campaign: Campaign,
  members: readonly Survivor[],
  story: StoryMissionId,
  choice: StoryChoice,
): StoryRecord | undefined {
  return storyHolder(members, story) === undefined ||
    storyResult(story, choice.result) === undefined
    ? undefined
    : storyRecord(campaign, members, story, choice);
}

/**
 * The part this ending has the same team play straight away, in this Mission
 * Phase (pg. 92; R119), or `undefined`: Left Behind Part 2b, once Part 1's
 * record has attached it.
 */
export function partNow(story: StoryMissionId, record: StoryRecord): StoryMissionId | undefined {
  const next = storyResult(story, record.result)?.next;

  return next?.now === true && record.attached?.mission === next.story ? next.story : undefined;
}
