/**
 * What each story mission gives when it ends (pp. 87–102; R116–R121; Z7-3).
 *
 * A story ends in one of a few results, each named by a short term for what
 * happened, and each result gives the attached survivor XP or a Story Trait,
 * attaches the next part to somebody, keeps the story attached to be tried
 * again, or brings a survivor to the next Create New Survivors. Only those
 * are here, as structure, with what else an ending asks the table for
 * because it gives a thing (`StoryAsk`; Z7-4): an item, a vehicle, a roll on
 * a table, a count. How a mission is played stays in the book, by page.
 */

import type { ItemId, PricedGrade, VehicleTier } from './equipment';
import type { StoryMissionId } from './missions';
import type { Skill } from './skills';
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
  /**
   * What their build is given (pg. 99; R142): a skill at its first level, a
   * stat at a value from their Tier's array, and an item they carry. The rest
   * of the build is the player's, on the sheet.
   */
  readonly build?: {
    readonly skill: Skill;
    readonly stat: { readonly dexterity: number };
    readonly item: { readonly item: ItemId; readonly grade: PricedGrade };
  };
}

/**
 * What else an ending asks the table, because it gives a thing (Z7-4). Each
 * is optional unless `required`: a Computer used twice, a safe that rolled 1
 * or a boat taken happened on some plays and not others.
 */
export type StoryAsk =
  /** A weapon of a skill the attached survivor has, at this grade, into their hands (pg. 90). */
  | {
      readonly kind: 'skilled-weapon';
      readonly grade: PricedGrade;
      readonly pages: number | string;
      readonly required: true;
    }
  /** This story attached to the team member who did what the page says (pp. 90, 120; R139, R141). */
  | { readonly kind: 'attaches'; readonly story: StoryMissionId; readonly pages: number | string }
  /** An item found on the map, for a team member (pp. 98–99). */
  | {
      readonly kind: 'found-item';
      readonly item: ItemId;
      readonly grade: PricedGrade;
      readonly pages: number | string;
    }
  /** A vehicle the community took home (pg. 93). */
  | {
      readonly kind: 'vehicle';
      readonly tier: VehicleTier;
      readonly water: boolean;
      readonly pages: number | string;
    }
  /** Another survivor on the mission becomes Jaded, the player's choice (pg. 93; R128). */
  | { readonly kind: 'jaded'; readonly pages: number | string }
  /** One roll on the Quality Items subtable, into the base's Inventory (pp. 43, 94). */
  | { readonly kind: 'quality-roll'; readonly pages: string; readonly required: true }
  /** Rolls on the Rare Item Table, or items picked from any of it (pp. 43, 96; R127). */
  | {
      readonly kind: 'rare-rolls-or-picks';
      readonly rolls: number;
      readonly picks: number;
      readonly pages: number | string;
      readonly required: true;
    }
  /** The resource and material tokens carried home, past which Unrest is 0 (pg. 102; R125). */
  | {
      readonly kind: 'resources';
      readonly over: number;
      readonly pages: number | string;
      readonly required: true;
    };

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
  /** Food added to storage, checked at Check Storage like any (pg. 96; R127). */
  readonly food?: number;
  /** What else the ending asks for (Z7-4). */
  readonly asks?: readonly StoryAsk[];
  /** Material rolls the player may make 10s at this turn's Add Materials to Storage (pg. 101; R126). */
  readonly tens?: number;
  /**
   * Advancement Step 1's one extra XP goes to the attached survivor and each
   * bondmate instead, 1 each, whoever went on the mission (pg. 91; R140).
   */
  readonly xpToBondmates?: true;
}

/** Left Behind Part 1's Computer, used twice, attaches Prepper's Stash Part 1 (pg. 90). */
const COMPUTER: StoryAsk = { kind: 'attaches', story: 'preppers-stash-1', pages: 90 };

/** Part 2a's Guard House safe, on a roll of 1, attaches Crashed Convoy (pg. 120; R141). */
const SAFE: StoryAsk = { kind: 'attaches', story: 'crashed-convoy', pages: 120 };

/** Part 2b's boat, if the team left in it, and who becomes Jaded if the survivor fell (pg. 93). */
const LEAVING_2B: readonly StoryAsk[] = [
  { kind: 'vehicle', tier: 2, water: true, pages: 93 },
  { kind: 'jaded', pages: 93 },
];

/** Neighbor's Rifle's search marker (pp. 98–99). */
const RIFLE: StoryAsk = { kind: 'found-item', item: 'rifle', grade: 'quality', pages: '98–99' };

/** Neighbor's Rifle's Tier 3, for a Tier 3 survivor (pg. 99; R142). */
const RIFLEMAN: StoryJoiner = {
  tier: 3,
  onlyIfAttachedTier: 3,
  build: { skill: 'long-guns', stat: { dexterity: 3 }, item: { item: 'rifle', grade: 'quality' } },
};

export const STORY_RESULTS = {
  'left-behind-1': [
    {
      id: 'rescued',
      pages: 90,
      xp: 1,
      next: { story: 'left-behind-2a', to: 'attached' },
      joins: { tier: 'attached', bond: 'pair', xp: 1 },
      asks: [COMPUTER],
    },
    {
      id: 'not-rescued',
      pages: 90,
      trait: 'berserk',
      next: { story: 'left-behind-2b', to: 'attached', now: true },
      asks: [{ kind: 'skilled-weapon', grade: 'quality', pages: 90, required: true }, COMPUTER],
    },
  ],
  'left-behind-2a': [
    {
      id: 'family-rescued',
      pages: 91,
      joins: { tier: 'attached', bond: 'attached-group' },
      asks: [SAFE],
      xpToBondmates: true,
    },
    { id: 'stranger-rescued', pages: 91, joins: { tier: 2 }, asks: [SAFE], xpToBondmates: true },
    { id: 'nobody-rescued', pages: 91, asks: [SAFE], xpToBondmates: true },
  ],
  'left-behind-2b': [
    { id: 'fire-lit', pages: 93, xp: 2, trait: 'lone-wolf', asks: LEAVING_2B },
    { id: 'body-brought-home', pages: 93, trait: 'jaded', asks: LEAVING_2B },
    { id: 'body-left', pages: 93, asks: LEAVING_2B },
  ],
  'preppers-stash-1': [
    {
      id: 'duffel-recovered',
      pages: 94,
      xp: 1,
      next: { story: 'preppers-stash-2', to: 'anyone' },
      asks: [{ kind: 'quality-roll', pages: '43, 94', required: true }],
    },
    { id: 'duffel-not-recovered', pages: 94, xp: 1 },
  ],
  'preppers-stash-2': [
    {
      id: 'trap-door-opened',
      pages: 96,
      xp: 1,
      food: 6,
      asks: [
        { kind: 'rare-rolls-or-picks', rolls: 6, picks: 3, pages: '43–49, 96', required: true },
      ],
    },
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
      joins: RIFLEMAN,
      asks: [RIFLE],
    },
    { id: 'seating-failed', pages: 99, xp: 1, joins: RIFLEMAN, asks: [RIFLE] },
  ],
  'crashed-convoy': [
    {
      id: 'search-passed',
      pages: 101,
      xp: 1,
      tens: 2,
      next: { story: 'warehouse', to: 'team-tier-2-or-3' },
    },
    { id: 'search-failed', pages: 101, xp: 1, tens: 2 },
  ],
  warehouse: [
    {
      id: 'played',
      pages: 102,
      xp: 1,
      asks: [{ kind: 'resources', over: 10, pages: 102, required: true }],
    },
  ],
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
