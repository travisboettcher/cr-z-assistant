/**
 * The Story Traits (pp. 87–88; Phase 7, Z7-1).
 *
 * Six traits a survivor gains from story missions: five a survivor holds one
 * of at a time, and Veteran, which a Tier 3 gains on becoming a Hero and keeps
 * beside any of the others (pg. 88; R85). Only what they change between
 * missions is here, as numbers. What they do on the map (an extra Attack, a
 * die bonus, Damage dealt back) stays in the book, cited by page.
 *
 * The Toolkit's Advantages (pg. 139) are below, behind the campaign's switch
 * (R84, R158); its Permanent Injuries and origin traits (pp. 137–140) are
 * Z7-11's and Z7-12's.
 */

import type { CampaignOrigin } from './origins';

/** The five Story Traits a survivor holds one of at a time (pg. 88). Veteran is apart. */
export const STORY_TRAITS = ['bonded', 'jaded', 'berserk', 'lone-wolf', 'driven'] as const;

export type StoryTrait = (typeof STORY_TRAITS)[number];

/** What a Story Trait changes between missions (pg. 88). */
export interface StoryTraitRules {
  readonly pages: number;

  /** Labor on the project team multiplied, by R89's fourth step. */
  readonly laborMultiplier?: number;

  /** Bonded's: the multiplier needs a bondmate of the same group on the team (R134). */
  readonly laborNeedsBondmate?: true;

  /** Lone Wolf's: no Labor with anybody else on the team, this multiplier alone (pg. 88). */
  readonly laborAlone?: number;

  /** At most this much Health a campaign turn, from every source together (R90). */
  readonly healthPerTurn?: number;

  /** May join a mission team while wounded, R12's one exception (R93). */
  readonly missionWhileWounded?: true;

  /** Added to maximum Health while the trait is held (R133). */
  readonly maxHealth?: number;

  /**
   * The only tasks the survivor may be given (R93). Task names, typed as
   * strings only because the engine's `Assignment` is what defines them; the
   * rules test holds each to one.
   */
  readonly onlyTasks?: readonly string[];

  /** Added to every stat but the highest, ties at the top all staying (R135). */
  readonly belowHighestStats?: number;
}

export const STORY_TRAIT_RULES = {
  bonded: { pages: 88, laborMultiplier: 2, laborNeedsBondmate: true },
  jaded: { pages: 88, laborMultiplier: 0.5, healthPerTurn: 1, missionWhileWounded: true },
  berserk: { pages: 88, maxHealth: 1, onlyTasks: ['rest', 'healing', 'mission'] },
  'lone-wolf': { pages: 88, laborAlone: 2 },
  driven: { pages: 88, belowHighestStats: 1 },
} as const satisfies Record<StoryTrait, StoryTraitRules>;

/** Veteran's page: gained on promotion to Hero, and kept beside any story trait (pp. 87–88). */
export const VETERAN_PAGES = '87–88';

/**
 * What a Veteran spends in the Planning Phase, and what it gives: 1 XP of
 * theirs for 1 Health to a survivor at 0 Health (pg. 88; R91).
 */
export const VETERAN_HEALING = { xp: 1, health: 1 } as const;

/**
 * The Toolkit's eight Advantages common to every origin (pg. 139; Z7-10). The
 * three origin ones on pg. 140, Rot Resistant, Calloused Psyche and
 * Resistance, are Z7-12's. Taken only at creation (pg. 139; R158, R166), any
 * number of them (R160), each adding its debt.
 */
export const ADVANTAGES = [
  'powerhouse',
  'light-eater',
  'forager',
  'outdoor-enthusiast',
  'quiet',
  'ambidextrous',
  'parkour-practitioner',
  'natural-leader',
] as const;

export type Advantage = (typeof ADVANTAGES)[number];

/**
 * What an Advantage costs and changes between missions (pg. 139). Only the
 * numbers: what one does on the map stays in the book, cited by page.
 */
export interface AdvantageRules {
  readonly pages: number;

  /** The experience debt it adds at creation (pg. 137; R94). */
  readonly debt: number;

  /** Added to the survivor's Inventory Slots (Powerhouse). */
  readonly inventorySlots?: number;

  /** The Food they eat a Management Phase, whatever their Tier (Light Eater; pg. 22). */
  readonly foodEaten?: number;

  /** Food added at the next Add Materials to Storage for each mission they go on (Forager; R164). */
  readonly foodPerMission?: number;

  /** Takes no bed at Assign Beds (Outdoor Enthusiast; pg. 23). */
  readonly needsNoBed?: true;

  /**
   * A Skill Score of this much without the skill, or this much more with it,
   * not counted against skill-level maximums (Quiet's Stealth, Natural
   * Leader's Tactics; R92).
   */
  readonly score?: { readonly skill: 'stealth' | 'tactics'; readonly amount: number };

  /** Labor added to every other survivor on the project team (Natural Leader; R89). */
  readonly laborToOthers?: number;
}

export const ADVANTAGE_RULES = {
  powerhouse: { pages: 139, debt: 5, inventorySlots: 1 },
  'light-eater': { pages: 139, debt: 4, foodEaten: 1 },
  forager: { pages: 139, debt: 3, foodPerMission: 1 },
  'outdoor-enthusiast': { pages: 139, debt: 2, needsNoBed: true },
  quiet: { pages: 139, debt: 5, score: { skill: 'stealth', amount: 1 } },
  ambidextrous: { pages: 139, debt: 6 },
  'parkour-practitioner': { pages: 139, debt: 4 },
  'natural-leader': {
    pages: 139,
    debt: 4,
    score: { skill: 'tactics', amount: 1 },
    laborToOthers: 1,
  },
} as const satisfies Record<Advantage, AdvantageRules>;

/**
 * The Toolkit's Permanent Injuries (pp. 137–138, 140; Z7-11): the nine of the
 * d10 table, and the three origin injuries its result 4 gives, one for each
 * origin (pg. 140; Z7-12 gives those their effects). A survivor holds a count
 * of each (R84).
 */
export const INJURIES = [
  'wheelchair-bound',
  'one-handed',
  'one-eyed',
  'bad-knee',
  'bad-shoulder',
  'blind',
  'deaf',
  'twice-shy',
  'sickly',
  'psychic-scars',
  'touched',
] as const;

export type Injury = (typeof INJURIES)[number];

/** The origin injury result 4 gives under each origin (pg. 140). */
export const ORIGIN_INJURIES = {
  viral: 'sickly',
  'cosmic-horror': 'psychic-scars',
  magic: 'touched',
} as const satisfies Record<CampaignOrigin, Injury>;

/**
 * The d10 table on pg. 138, by result. 4 is the origin's injury, rolled again
 * with no origin; 10 is the player's choice of any of them.
 */
export const INJURY_TABLE = {
  1: 'wheelchair-bound',
  2: 'one-handed',
  3: 'one-eyed',
  4: 'origin',
  5: 'bad-knee',
  6: 'bad-shoulder',
  7: 'blind',
  8: 'deaf',
  9: 'twice-shy',
  10: 'choice',
} as const;

/**
 * What a Permanent Injury is worth and changes between missions (pp. 137–138).
 * Only the numbers: what one does on the map stays in the book.
 */
export interface InjuryRules {
  readonly pages: number | string;

  /** The XP it gives when taken at creation; none when gained in play (pg. 137). */
  readonly xp: number;

  /**
   * How many of it a survivor can hold. One more than this turns them as
   * normal (pg. 137; R87, R161), unless `becomes` or `killsAt` says otherwise.
   */
  readonly most: number;

  /** What the second one becomes instead (One-eyed twice is Blind; pg. 138). */
  readonly becomes?: Injury;

  /** The count that kills rather than turns (One-handed three times; pg. 138). */
  readonly killsAt?: number;

  /** Added to Inventory Slots (Wheelchair-bound). */
  readonly inventorySlots?: number;

  /**
   * Labor on the project team, by R89's steps: `set` replaces the Tier's from
   * this count on, and `add` is added at the adding step.
   */
  readonly labor?: {
    readonly add?: number;
    readonly set?: { readonly from: number; readonly to: number };
  };

  /** Skill Scores that are 0 (Blind's Scout and Scavenge). */
  readonly scoresZero?: readonly ('scout' | 'scavenge')[];

  /** Skill-level maximums lowered from this count on (Bad shoulder twice). */
  readonly skillMaximum?: {
    readonly from: number;
    readonly skills: readonly ('long-guns' | 'heavy-weapon')[];
    readonly less: number;
  };

  /** Never on a mission team (Blind; R93). */
  readonly noMissionTeam?: true;

  /** On a mission team only with at least this many others (Twice shy; R93). */
  readonly missionTeamOthers?: number;

  /** Facilities they can't staff (Twice shy's Watchtower; R93). */
  readonly cannotStaff?: readonly string[];

  /** The Advantage it removes, and can't be held with (One-handed and Ambidextrous; pg. 138). */
  readonly removes?: Advantage;
}

export const INJURY_RULES = {
  'wheelchair-bound': { pages: 138, xp: 3, most: 1, inventorySlots: 1 },
  'one-handed': {
    pages: 138,
    xp: 4,
    most: 2,
    killsAt: 3,
    labor: { add: -1, set: { from: 2, to: 0 } },
    removes: 'ambidextrous',
  },
  'one-eyed': { pages: 138, xp: 3, most: 1, becomes: 'blind' },
  'bad-knee': { pages: 138, xp: 2, most: 2 },
  'bad-shoulder': {
    pages: 138,
    xp: 3,
    most: 2,
    skillMaximum: { from: 2, skills: ['long-guns', 'heavy-weapon'], less: 2 },
  },
  blind: {
    pages: 138,
    xp: 4,
    most: 1,
    labor: { set: { from: 1, to: 1 } },
    scoresZero: ['scout', 'scavenge'],
    noMissionTeam: true,
  },
  deaf: { pages: 138, xp: 2, most: 1 },
  'twice-shy': {
    pages: 138,
    xp: 1,
    most: 1,
    missionTeamOthers: 3,
    cannotStaff: ['watchtower'],
  },
  sickly: { pages: 140, xp: 1, most: 1 },
  'psychic-scars': { pages: 140, xp: 2, most: 1 },
  touched: { pages: 140, xp: 2, most: 1 },
} as const satisfies Record<Injury, InjuryRules>;
