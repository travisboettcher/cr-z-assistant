/**
 * What each story mission gives when it ends (pp. 87–102; R116–R121; Z7-3).
 *
 * A story ends in one of a few results, each named by a short term for what
 * happened, and each result gives the attached survivor XP or a Story Trait,
 * attaches the next part to somebody, keeps the story attached to be tried
 * again, or brings a survivor to the next Create New Survivors. Only those
 * are here, as structure. What the map holds (an item, a vehicle, a roll on a
 * table) is Z7-4's, and how a mission is played stays in the book, by page.
 */

import type { StoryMissionId } from './missions';
import type { Tier } from './tiers';
import type { StoryTrait } from './traits';

/** Who the next part is attached to (pp. 90, 94, 96, 99, 101). */
export type StoryRecipient =
  /** The survivor the story was attached to. */
  | 'attached'
  /** Anybody in the community, the player's choice. */
  | 'anyone'
  /** A Tier 2 or 3 survivor who went out with the team. */
  | 'team-tier-2-or-3';

/** A survivor a story brings to the next Create New Survivors (R120). */
export interface StoryJoiner {
  /** At the attached survivor's Tier, or at this one. */
  readonly tier: 'attached' | Tier;
  /**
   * Bonded with the attached survivor alone, a new pair; or into the attached
   * survivor's own group, when they still hold Bonded (R138).
   */
  readonly bond?: 'pair' | 'attached-group';
  /** XP they arrive with. */
  readonly xp?: number;
  /** Only when the attached survivor is this Tier. */
  readonly onlyIfAttachedTier?: Tier;
}

/** One way a story can end, and what it gives. */
export interface StoryResult {
  readonly id: string;
  readonly pages: number | string;
  /** XP the attached survivor gains (pp. 89–102). */
  readonly xp?: number;
  /** The Story Trait the attached survivor takes, replacing theirs (R85). */
  readonly trait?: StoryTrait;
  /** The story stays attached, to be played again (R121). */
  readonly stays?: true;
  /** The part this attaches, and to whom. `now`: played in this Mission Phase (R119). */
  readonly next?: {
    readonly story: StoryMissionId;
    readonly to: StoryRecipient;
    readonly now?: true;
  };
  /** A survivor who joins at the next Create New Survivors (R120). */
  readonly joins?: StoryJoiner;
}

export const STORY_RESULTS = {
  'left-behind-1': [
    {
      id: 'rescued',
      pages: 90,
      xp: 1,
      next: { story: 'left-behind-2a', to: 'attached' },
      joins: { tier: 'attached', bond: 'pair', xp: 1 },
    },
    {
      id: 'not-rescued',
      pages: 90,
      trait: 'berserk',
      next: { story: 'left-behind-2b', to: 'attached', now: true },
    },
  ],
  'left-behind-2a': [
    { id: 'family-rescued', pages: 91, joins: { tier: 'attached', bond: 'attached-group' } },
    { id: 'stranger-rescued', pages: 91, joins: { tier: 2 } },
    { id: 'nobody-rescued', pages: 91 },
  ],
  'left-behind-2b': [
    { id: 'fire-lit', pages: 93, xp: 2, trait: 'lone-wolf' },
    { id: 'body-brought-home', pages: 93, trait: 'jaded' },
    { id: 'body-left', pages: 93 },
  ],
  'preppers-stash-1': [
    {
      id: 'duffel-recovered',
      pages: 94,
      xp: 1,
      next: { story: 'preppers-stash-2', to: 'anyone' },
    },
    { id: 'duffel-not-recovered', pages: 94, xp: 1 },
  ],
  'preppers-stash-2': [
    { id: 'trap-door-opened', pages: 96, xp: 1 },
    {
      id: 'trap-door-not-opened',
      pages: 96,
      xp: 1,
      next: { story: 'preppers-stash-2', to: 'anyone' },
    },
  ],
  'sentimental-value': [
    { id: 'heirloom-recovered', pages: 97, trait: 'driven' },
    { id: 'heirloom-not-recovered', pages: 97, trait: 'jaded', stays: true },
  ],
  'neighbors-rifle': [
    {
      id: 'seating-passed',
      pages: 99,
      xp: 1,
      next: { story: 'warehouse', to: 'team-tier-2-or-3' },
      joins: { tier: 3, onlyIfAttachedTier: 3 },
    },
    { id: 'seating-failed', pages: 99, xp: 1, joins: { tier: 3, onlyIfAttachedTier: 3 } },
  ],
  'crashed-convoy': [
    {
      id: 'search-passed',
      pages: 101,
      xp: 1,
      next: { story: 'warehouse', to: 'team-tier-2-or-3' },
    },
    { id: 'search-failed', pages: 101, xp: 1 },
  ],
  warehouse: [{ id: 'played', pages: 102, xp: 1 }],
} as const satisfies Record<StoryMissionId, readonly StoryResult[]>;

export type StoryResultId<Story extends StoryMissionId = StoryMissionId> =
  (typeof STORY_RESULTS)[Story][number]['id'];

/** One story's result by id, or `undefined` for one it does not have. */
export function storyResult(story: StoryMissionId, id: string): StoryResult | undefined {
  const results: readonly StoryResult[] = STORY_RESULTS[story];

  return results.find((result) => result.id === id);
}

/**
 * Left Behind's time windows (pp. 118, 121; R118): the most turns since the
 * story was attached that still count as inside, 3 included. Part 2a is
 * attached the turn Part 1 ends, so both count from the attaching turn.
 */
export const STORY_WINDOWS = {
  'left-behind-1': { within: 3, pages: 118 },
  'left-behind-2a': { within: 3, pages: 121 },
} as const satisfies Partial<
  Record<StoryMissionId, { readonly within: number; readonly pages: number }>
>;
