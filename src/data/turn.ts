/**
 * The campaign turn — rules as data (pg. 17–23).
 *
 * Transcribed from the Community Layer chapter of the Modiphius edition (see
 * `docs/rulebook-edition.md`) on 2026-09-08, together with the four skill
 * entries on pg. 12 that the turn's steps depend on.
 *
 * Four phases in a strict order, each a numbered list of steps, plus the
 * thresholds those steps check against. **Nothing here computes anything** —
 * how Hunger is worked out is `src/engine`'s, and which of these numbers a
 * screen shows is `src/ui`'s. This is the list of what the turn does and the
 * numbers it does it against.
 *
 * ## The phases moved down here from the engine
 *
 * `CAMPAIGN_PHASES` lived in `src/engine/campaign.ts` from Phase 0, because a
 * campaign has a `phase` field and that was the only thing that needed them.
 * The steps hang off the phases, so keeping the phases in the engine would have
 * meant this file importing from `src/engine` — the layering upside down, and
 * the same move `materials.ts` and `origins.ts` made in Phase 2. The engine is
 * a set of functions over the rules; it is not where they live. `eslint.config.js`
 * now enforces the direction rather than leaving it to memory.
 *
 * ## Two page citations that are ranges rather than pages
 *
 * The transcription narrowed each step to a page where the chapter made that
 * possible and cites the phase's spread where it did not. A range is honest
 * about what was confirmed; a wrong page is the failure the edition retrofit
 * (#48) existed to remove. Narrow the ranges next time the book is open.
 *
 * ## The book contradicts itself about the Planning Phase, and pg. 21 wins
 *
 * The turn summary on pg. 17 lists step 3 as the mission team and step 4 as
 * rest and healing. The Planning Phase section on pp. 20–21 numbers them the
 * other way round, and that is the order below. The section body carries the
 * rules text as well as the headings, where pg. 17 is a summary table.
 *
 * Nothing mechanical forces either order — one assignment per survivor holds
 * whichever way round they are — so this is a table ruling rather than a
 * derivable answer, and it is written down here so that a later reader checking
 * against pg. 17 does not "correct" it back.
 */

import type { D10Result } from './dice';
import { MATERIALS, type Material } from './materials';
import type { Tier } from './tiers';

/** The four campaign phases, in the strict order the turn runs them (pg. 17). */
export const CAMPAIGN_PHASES = ['mission', 'advancement', 'planning', 'management'] as const;

export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number];

/**
 * One numbered step of a phase.
 *
 * No label. What a step is called on a screen is presentation, and lives in
 * `src/ui` beside `PHASE_LABELS` for the same reason the base roster carries no
 * display names.
 */
export interface TurnStep {
  readonly id: string;

  /** For `PageRef`, so a player can check the step against the book. */
  readonly pages: number | string;
}

/**
 * Every step of every phase, in order (pg. 17–23).
 *
 * A record keyed by phase rather than one flat list, because every question
 * asked of it is asked about a phase: which steps are in this one, which step
 * follows this one, which step is first. Walking the whole turn is
 * `CAMPAIGN_PHASES.flatMap(...)`, and that belongs to the engine function that
 * needs it rather than to a second copy of the same data here.
 */
export const TURN_STEPS = {
  mission: [
    { id: 'select-mission', pages: 17 },
    { id: 'equip-mission-team', pages: 18 },
    { id: 'tactical-mission', pages: 18 },
  ],
  advancement: [
    { id: 'character-advancement', pages: 18 },
    { id: 'create-new-survivors', pages: '18–19' },
    { id: 'add-materials-to-storage', pages: '18–19' },
    { id: 'heal-wounds', pages: 19 },
    { id: 'add-facilities-and-upgrades', pages: 19 },
  ],
  planning: [
    { id: 'assign-facility-staff', pages: 20 },
    { id: 'assign-project-team', pages: 20 },
    { id: 'assign-rest-and-healing', pages: 21 },
    { id: 'assign-mission-team', pages: 21 },
  ],
  management: [
    { id: 'check-for-rot', pages: 22 },
    { id: 'feed-your-survivors', pages: 22 },
    { id: 'assign-beds', pages: 23 },
    { id: 'calculate-unrest', pages: 23 },
    { id: 'check-storage', pages: 23 },
    { id: 'check-the-horde', pages: 23 },
    { id: 'departures', pages: 23 },
  ],
} as const satisfies Record<CampaignPhase, readonly TurnStep[]>;

/** Every step id in the turn, so a step can be named in a type. */
export type TurnStepId = (typeof TURN_STEPS)[CampaignPhase][number]['id'];

/**
 * The step a project finishes in (pg. 19).
 *
 * Named here rather than typed out wherever the app mentions it, so the one
 * screen that builds and the one that says when to build cannot disagree.
 * Facilities, upgrades and cleared slots are all the same kind of thing to the
 * book — a project, ordered in the Planning Phase and completed here.
 */
export const PROJECT_STEP: TurnStepId = 'add-facilities-and-upgrades';

/**
 * XP every survivor who was on the mission gains (pg. 18).
 *
 * Awarded first, before the discretionary point and before a Training Room's
 * output, because the book lists them in that order and the Teaching cap below
 * counts against what has already been given.
 */
export const MISSION_XP = 1;

/**
 * The one further XP the player hands to a survivor of their choice after a
 * mission (pg. 18).
 *
 * No mechanical trigger — it is a gift, not a reward for anything. A Teacher on
 * the mission **replaces** it rather than adding to it (pg. 12).
 */
export const DISCRETIONARY_MISSION_XP = 1;

/**
 * The most XP one survivor may take from a staffed Training Room (pg. 70).
 *
 * Not the same rule as the one below, and the two are deliberately separate
 * exports that happen to hold the same number — the same reasoning that keeps
 * the Tier table's five coinciding columns apart. This one caps a *facility's*
 * output per survivor and applies to survivors who were not on the mission;
 * the other caps what a *Teacher on the mission* may hand out. A community can
 * hit both in one turn, and collapsing them into one constant would make a
 * later change to either silently change the other.
 */
export const TRAINING_ROOM_MAX_XP_PER_SURVIVOR = 2;

/** The most XP one survivor may take from a Teacher on the mission (pg. 12). */
export const MISSION_TEACHING_MAX_XP_PER_SURVIVOR = 2;

/**
 * Where a turn's XP comes from, in the order pg. 18 awards it.
 *
 * Four sources rather than one number, because each has its own pool, its own
 * eligibility and its own cap, and the book keeps them apart:
 *
 * - `mission` — one XP to every survivor who went (pg. 18).
 * - `discretionary` — one further XP to anybody, the player's choice (pg. 18).
 * - `mission-teaching` — a Teacher on the mission hands out one XP to as many
 *   survivors as the team's summed Teaching Score, max 2 each, and this
 *   **replaces** the discretionary point rather than adding to it (pg. 12).
 * - `training-room` — a staffed Training Room's output, to survivors who were
 *   **not** on the mission, max 2 each (pg. 70).
 *
 * The order is the order they are awarded in, and it matters: both caps count
 * against what a survivor has already been given this turn.
 */
/**
 * How much XP one award hands over.
 *
 * One, from every source. The book hands XP out a point at a time — a Teacher
 * "assigns 1 XP to as many survivors as" their Score (pg. 12) — and both 2-XP
 * caps are counted in these units, so an award of anything else would have to
 * be taken apart again to check them.
 */
export const XP_AWARD = 1;

export const XP_SOURCES = [
  'mission',
  'discretionary',
  'mission-teaching',
  'training-room',
] as const;

export type XpSource = (typeof XP_SOURCES)[number];

/**
 * The page each source's rule is printed on.
 *
 * A record rather than the ternaries an earlier draft reached for. Four sources
 * with three different pages is data, and `source === 'training-room' ? 70 : 12`
 * is that data written as a branch — one nothing could distinguish from its
 * opposite until every source had been asserted separately.
 */
export const XP_SOURCE_PAGES = {
  mission: 18,
  discretionary: 18,
  'mission-teaching': 12,
  'training-room': 70,
} as const satisfies Record<XpSource, number>;

/**
 * Which material a d10 generates, one roll per material recovered on the
 * mission (pg. 18–19).
 *
 * A 10 sends the player to the Rare Item Table (pg. 43), which is equipment and
 * therefore Phase 5. Until that table exists the result is recorded as a Rare
 * material, which is what the campaign already tracks; the mapping says `rare`
 * rather than naming a table this app cannot yet roll on.
 */
export const MATERIAL_ROLL_TABLE = {
  1: 'fuel',
  2: 'fuel',
  3: 'fuel',
  4: 'food',
  5: 'food',
  6: 'food',
  7: 'hardware',
  8: 'hardware',
  9: 'hardware',
  10: 'rare',
} as const satisfies Record<D10Result, Material>;

/**
 * The three skills that can force a material roll to a result, and what each
 * may force it to (pg. 12).
 *
 * **A substitution changes a roll, it does not add one.** The book gives each
 * of these skills uses equal to its summed Score across the mission team, and
 * each use overrides the result of a die already rolled. Adding a material is
 * the obvious wrong implementation, so the rule is written here as a mapping
 * from skill to *allowed results* rather than as an amount.
 *
 * Rationing is locked to Food and Mechanics to Hardware. **Utilities is written
 * as "a given material" and is transcribed as all four**, which is the literal
 * reading and includes forcing the Rare result a 10 would give. Whether that
 * asymmetry is deliberate is
 * [ruling 4](../../docs/phase-3-stories.md#rulings-the-book-leaves-open); the
 * broad reading is recorded here so a table that rules the other way edits one
 * line.
 */
export const MATERIAL_SUBSTITUTIONS = {
  rationing: ['food'],
  mechanics: ['hardware'],
  utilities: MATERIALS,
} as const satisfies Record<string, readonly Material[]>;

/** A skill that can override a material roll (pg. 12). */
export type SubstitutionSkill = keyof typeof MATERIAL_SUBSTITUTIONS;

export const SUBSTITUTION_SKILLS = Object.keys(
  MATERIAL_SUBSTITUTIONS,
) as readonly SubstitutionSkill[];

/**
 * Materials a survivor scavenges when the community opts out of the mission
 * (pg. 17).
 *
 * Flat, and deliberately not scaled by the Scavenge score: with the skill it is
 * one of *every* material type, without it one of a single type the player
 * picks. Two numbers rather than one because they count different things —
 * per material type, and in total.
 */
export const SCAVENGE_PER_MATERIAL_WITH_SKILL = 1;

export const SCAVENGE_TOTAL_WITHOUT_SKILL = 1;

/** Health a resting survivor generates, usable only by themselves (pg. 19, 21). */
export const REST_HEALTH = 1;

/**
 * Where a point of Health came from (pg. 19, 21).
 *
 * Two sources with one difference that matters: a facility's points are shared
 * out among everybody assigned to healing, and a resting survivor's point is
 * theirs alone. Kept apart in the record as well as in the rules, so a history
 * can say which one a survivor got.
 */
export const HEALTH_SOURCES = ['facility', 'rest'] as const;

export type HealthSource = (typeof HEALTH_SOURCES)[number];

/**
 * How many survivors may be assigned to rest in a turn (pg. 21).
 *
 * One. A cap rather than a boolean, because it is a number in the book and
 * because the Cosmic Horror origin lifts a comparable one for Madness Recovery
 * (pg. 68) — a rule that reads "any number" is easier to add beside a cap than
 * beside a flag.
 */
export const SURVIVORS_RESTING_PER_TURN = 1;

/**
 * Food a survivor of each Tier eats every Management Phase (pg. 22).
 *
 * Unlike the Tier table's columns this genuinely is a two-value rule rather
 * than four separate ones: the book prints it as a table of four rows, and
 * Tiers 1–2 and 3–4 pair up. Written as four rows anyway, so a Tier that later
 * eats differently is a data edit.
 */
export const FOOD_EATEN_PER_TURN = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
} as const satisfies Record<Tier, number>;

/**
 * The Rot check target before a Medical Clinic reduces it (pg. 22).
 *
 * Each point of Medicine across the Clinic's staff takes one off, and the book
 * states **no floor** — a well-staffed Clinic can drive the target to 2 or
 * below, where only a natural 1 still fails. That is left unclamped on purpose:
 * clamping it would be inventing a rule the book does not have, and the
 * natural-1 convention (pg. 8) already stops it from becoming a certainty.
 */
export const ROT_CHECK_TARGET = 12;

/**
 * Damage a turning survivor does to somebody being healed beside them (pg. 22).
 *
 * One, and a separate export from every other 1 in this file because it counts
 * a different thing — the same reasoning that keeps the two Teaching caps
 * apart.
 */
export const ROT_BITE_DAMAGE = 1;

/**
 * The four terms of Siege Threat, each a raw count with no weighting (pg. 23).
 *
 * Listed rather than left implicit in whatever function adds them up, because
 * the screen wants to show a player *where* their Siege Threat came from, and
 * because "there are exactly four of these" is a fact worth being able to
 * assert. Base features are the term that can be negative: the Renaissance
 * Festival's Curtain Wall is −3 a turn and a Spotlight −1.
 */
export const SIEGE_THREAT_TERMS = [
  'staffed-facilities',
  'project-team',
  'base-features',
  'turns-since-last-siege',
] as const;

export type SiegeThreatTerm = (typeof SIEGE_THREAT_TERMS)[number];

/**
 * `d10 + Siege Threat` at or above this forces Siege Defense as the next
 * mission (pg. 23).
 *
 * The published edition's phrasing. v1.25 said "higher than 15", which is the
 * same set of results and a different sentence.
 */
export const SIEGE_TRIGGER = 16;

/**
 * `Unrest + Siege Threat` at or above this sends a survivor away (pg. 23).
 *
 * The lowest-Tier survivor leaves; a tie is the player's choice, and a survivor
 * at 0 Health can neither leave nor be chosen.
 */
export const DEPARTURE_THRESHOLD = 10;
