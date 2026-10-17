/**
 * The Story Traits (pp. 87–88; Phase 7, Z7-1).
 *
 * Six traits a survivor gains from story missions: five a survivor holds one
 * of at a time, and Veteran, which a Tier 3 gains on becoming a Hero and keeps
 * beside any of the others (pg. 88; R85). Only what they change between
 * missions is here, as numbers. What they do on the map (an extra Attack, a
 * die bonus, Damage dealt back) stays in the book, cited by page.
 *
 * The Toolkit's Permanent Injuries and Advantages (pp. 137–140) are Z7-10's
 * and Z7-11's, and live beside these when they come.
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
