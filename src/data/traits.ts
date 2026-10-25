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
