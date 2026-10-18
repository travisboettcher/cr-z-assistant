/**
 * The missions — rules as data (pp. 75–115, 164–167).
 *
 * Transcribed from the Missions chapter (pg. 75) and the Story, Zombie Origin
 * and Road Trip chapters of the Modiphius edition (see
 * `docs/rulebook-edition.md`) on 2026-10-12, from the batch-12 rulings extract.
 * Printed page numbers, which the page footers and the book's own index agree
 * on.
 *
 * Phase 4, part 1 (`docs/phase-4-stories.md`, Z4-1). **A list, not a mission
 * engine.** Nothing here plays, sets up or scores a mission: what the table
 * counts at the end is named so the outcome entries can be shaped to it, and
 * what any mission *does* is the engine's, read back from those entries.
 *
 * ## Four families, and only one of them modelled
 *
 * The chapter splits missions into **standard** (pg. 75: any turn, but the
 * Siege Defense), **story** (tied to a survivor, pg. 87) and **origin**
 * (pg. 103); the optional **Road Trip** chapter has three more (pp. 164–167).
 * Nothing else in the book is called a mission — the Complications on
 * pp. 141–149 modify one, and the Travel Complications on pp. 162–163 are
 * encounters.
 *
 * The eight standard missions carry when they may be chosen, what Select
 * Mission asks for them, and what their outcome counts. The rest carry an id
 * and pages only: their prerequisites and rewards are traits, attached stories
 * and unlocked upgrades, which are Phase 7's, and writing a shape for them now
 * would be designing Phase 7 from one consumer's side.
 *
 * Display names are not here, for the reason the base roster has none:
 * `rescue-strangers` is an identifier, and naming it for a screen is the UI's
 * job.
 */

import { STORED_MATERIALS } from './materials';
import type { CampaignOrigin } from './origins';

/** The four families of mission (pp. 75, 87, 103, 158). */
export const MISSION_FAMILIES = ['standard', 'story', 'origin', 'road-trip'] as const;

export type MissionFamily = (typeof MISSION_FAMILIES)[number];

/**
 * When a standard mission may be chosen at Select Mission.
 *
 * - `first-turn` — every community's first mission, on turn 1 (pg. 76). It is
 *   played again only as the overrun base's second continuation (pg. 86;
 *   `OVERRUN_CONTINUATIONS`), and as a retry after a failed attempt (R21).
 * - `forced-by-siege` — only when the horde called a siege at Management Step
 *   6, and then it is the next Select Mission's only choice (pg. 23). Never
 *   chosen freely (pg. 75).
 * - `any-time` — the rest (pg. 75). Claim a New Base is one of them: nothing
 *   ties it to an overrun base (pp. 75, 86).
 *
 * The Rare Items trade's rule that the next mission "must be Rare Goods
 * Trader" (pg. 21) is not an availability: Rare Goods Trader is `any-time`,
 * and the trade that forces it arrives with equipment in Phase 5.
 */
export type MissionAvailability = 'first-turn' | 'forced-by-siege' | 'any-time';

/**
 * What Select Mission asks the table for, beyond the mission and its team.
 *
 * - `material` — the material type a Gather Materials team takes the
 *   remainder in (pg. 80).
 * - `base` — the base a Claim a New Base team is claiming. Its setup is built
 *   from that base (pg. 78), so it is known before the mission is played
 *   (Z4-7; derived, where Gather Materials' choice is literal).
 */
export type SelectionChoice = 'material' | 'base';

/**
 * What the table counts at the end of a standard mission — the facts its
 * outcome entry records and its rewards are read from (pp. 77–86).
 *
 * **Facts, never a verdict.** Several missions name no failure at all, and
 * the ones that do word it as a condition on these same counts. An outcome
 * that stores the counts is right whichever way success is worded.
 *
 * - `end-condition` — which of the numbered end conditions was met, or none
 *   (pp. 77, 79).
 * - `strangers-rescued` — each stranger brought out, with their Tier, which the
 *   mission's own setup decides (pp. 15, 76, 78, 79, 81, 82, 84). Only the
 *   Thin the Herd and the Siege Defense never have one.
 * - `vehicles-on-area` — working vehicles left on the mission area of a base
 *   claimed (pg. 79).
 * - `materials-carried-out` — materials an exiting character carried off the
 *   map (pg. 80).
 * - `starting-zombies` — the zombies the mission began with (pg. 81).
 * - `zombies-left` — zombies still on the area at the end (pp. 81, 86).
 * - `survivors-exited` — survivors who left by the map edge (pp. 81, 84, 86).
 * - `all-incapacitated` — whether every survivor on the mission went down
 *   (pg. 81).
 * - `vehicles-driven-off` — vehicles repaired and driven off (pg. 82).
 *
 * Every outcome also carries its team's wounds (Z4-4), which is why Health is
 * not a count here: it is recorded for every mission, of every family.
 */
export type OutcomeCount =
  | 'end-condition'
  | 'strangers-rescued'
  | 'vehicles-on-area'
  | 'materials-carried-out'
  | 'starting-zombies'
  | 'zombies-left'
  | 'survivors-exited'
  | 'all-incapacitated'
  | 'vehicles-driven-off';

/** One of the eight missions of pg. 75. */
export interface StandardMission {
  readonly family: 'standard';

  /** For `PageRef`, so a player can check the mission against the book. */
  readonly pages: number | string;

  readonly availability: MissionAvailability;

  /** What Select Mission asks for it; empty for most. */
  readonly asks: readonly SelectionChoice[];

  /** What its outcome records, in the order the book's end rules give them. */
  readonly counts: readonly OutcomeCount[];

  /**
   * How many numbered end conditions it has, for a mission whose outcome
   * records which one was met (`end-condition`; pp. 77, 79). Absent for the
   * rest.
   */
  readonly endConditions?: number;

  /**
   * The printed number of the end condition that is the mission's failure,
   * for a mission that numbers one (pp. 77, 79; #205). Entered as printed and
   * recorded as no condition met, which is what every reader of a failure
   * asks for.
   */
  readonly failedOn?: number;
}

/** A story or Road Trip mission: named and cited, not modelled (Phase 7). */
export interface ListedMission {
  readonly family: 'story' | 'road-trip';
  readonly pages: number | string;
}

/**
 * An origin mission, which belongs to one Origin of the Rot (pg. 103).
 *
 * The origin is the one fact about it the catalogue holds: a campaign that is
 * not Viral has no Viral missions to offer. Which of an origin's missions are
 * offered when is `missionsOnOffer`'s (R132, R145), and what the Viral ones
 * record is `viralMissions.ts`'s (Z7-6).
 */
export interface OriginMission {
  readonly family: 'origin';
  readonly pages: number | string;
  readonly origin: CampaignOrigin;
}

export type Mission = StandardMission | ListedMission | OriginMission;

/**
 * Every mission in the book, in the order the book prints them.
 *
 * Story missions in parts are an entry per part, because each part is played,
 * selected and recorded on its own (pp. 89–96). The origin missions keep the
 * order their chains are played in; Cosmic's are unconnected and may be
 * randomised (pg. 103), so their order is only the book's.
 */
export const MISSIONS = {
  // Standard (pg. 75).
  'first-mission': {
    family: 'standard',
    pages: '76–77',
    availability: 'first-turn',
    asks: [],
    counts: ['end-condition', 'strangers-rescued'],
    endConditions: 3,
    failedOn: 4,
  },
  'claim-a-new-base': {
    family: 'standard',
    pages: '78–79',
    availability: 'any-time',
    asks: ['base'],
    counts: ['end-condition', 'strangers-rescued', 'vehicles-on-area'],
    endConditions: 3,
    failedOn: 4,
  },
  'gather-materials': {
    family: 'standard',
    pages: '79–80',
    availability: 'any-time',
    asks: ['material'],
    counts: ['materials-carried-out', 'strangers-rescued'],
  },
  'thin-the-herd': {
    family: 'standard',
    pages: '80–81',
    availability: 'any-time',
    asks: [],
    counts: ['starting-zombies', 'zombies-left', 'survivors-exited', 'all-incapacitated'],
  },
  'retrieve-new-vehicles': {
    family: 'standard',
    pages: '81–82',
    availability: 'any-time',
    asks: [],
    counts: ['vehicles-driven-off', 'strangers-rescued'],
  },
  'rescue-strangers': {
    family: 'standard',
    pages: '82–83',
    availability: 'any-time',
    asks: [],
    counts: ['strangers-rescued'],
  },
  'rare-goods-trader': {
    family: 'standard',
    pages: '83–84',
    availability: 'any-time',
    asks: [],
    counts: ['survivors-exited', 'strangers-rescued'],
  },
  'siege-defense': {
    family: 'standard',
    pages: '85–86',
    availability: 'forced-by-siege',
    asks: [],
    counts: ['zombies-left', 'survivors-exited'],
  },

  // Story (pp. 87–102).
  'left-behind-1': { family: 'story', pages: '89–90' },
  'left-behind-2a': { family: 'story', pages: '90–91' },
  'left-behind-2b': { family: 'story', pages: '92–93' },
  'preppers-stash-1': { family: 'story', pages: '93–94' },
  'preppers-stash-2': { family: 'story', pages: '95–96' },
  'sentimental-value': { family: 'story', pages: '96–97' },
  'neighbors-rifle': { family: 'story', pages: '98–99' },
  'crashed-convoy': { family: 'story', pages: '100–101' },
  warehouse: { family: 'story', pages: '101–102' },

  // Zombie Origin (pp. 103–115).
  'experimental-data': { family: 'origin', pages: '103–104', origin: 'viral' },
  'bring-it-on-home': { family: 'origin', pages: '105–106', origin: 'viral' },
  'medical-salvage': { family: 'origin', pages: '106–107', origin: 'viral' },
  'invisible-light': { family: 'origin', pages: 108, origin: 'cosmic-horror' },
  'from-the-deep': { family: 'origin', pages: '109–110', origin: 'cosmic-horror' },
  'friend-or-foe': { family: 'origin', pages: '110–111', origin: 'cosmic-horror' },
  'the-graveyard': { family: 'origin', pages: '112–113', origin: 'magic' },
  'the-necromancer': { family: 'origin', pages: '113–114', origin: 'magic' },
  'the-dark': { family: 'origin', pages: 115, origin: 'magic' },

  // Road Trip (pp. 164–167), an optional chapter.
  'ford-the-river': { family: 'road-trip', pages: 164 },
  breakdown: { family: 'road-trip', pages: '165–166' },
  chased: { family: 'road-trip', pages: '166–167' },
} as const satisfies Record<string, Mission>;

export type MissionId = keyof typeof MISSIONS;

/** The eight missions of pg. 75, the only ones part 1 models. */
export type StandardMissionId = {
  [Id in MissionId]: (typeof MISSIONS)[Id]['family'] extends 'standard' ? Id : never;
}[MissionId];

/** The story missions (pp. 87–102), played only by the team of the survivor they are attached to. */
export type StoryMissionId = {
  [Id in MissionId]: (typeof MISSIONS)[Id]['family'] extends 'story' ? Id : never;
}[MissionId];

/** The Viral origin's three missions (pp. 103–107). */
export type ViralMissionId = {
  [Id in MissionId]: (typeof MISSIONS)[Id] extends { readonly origin: 'viral' } ? Id : never;
}[MissionId];

/** Every story mission, in the catalogue's order (pp. 89–102). */
export const STORY_MISSION_IDS = (Object.keys(MISSIONS) as MissionId[]).filter(
  (id): id is StoryMissionId => MISSIONS[id].family === 'story',
);

/**
 * The five stories a promotion from Tier 1 or 2 attaches one of (pg. 87; R117).
 * The rest of the nine are attached by other stories' rewards.
 */
export const PROMOTION_STORIES = [
  'left-behind-1',
  'preppers-stash-1',
  'sentimental-value',
  'neighbors-rifle',
  'crashed-convoy',
] as const satisfies readonly StoryMissionId[];

/**
 * The types a Gather Materials team takes one of each of, and may take its
 * remainder in (pg. 80; Z4-6): the three stored materials. Rare is not one of
 * them, so it is neither given nor offered as the chosen type. A team that
 * carries off fewer materials than this list is long gets no split at all, and
 * its materials are rolled on the Material Type table like any others.
 * Confirmed against the book 2026-10-12.
 */
export const GATHERED_MATERIALS = STORED_MATERIALS;

/**
 * The ways a community goes on from an overrun base, and the mission each one
 * plays (pg. 86; #182, Z4-9).
 *
 * Claiming a base again plays Claim a New Base, and starting over plays the
 * First Mission's setup. Leaving the survivors behind for a new community of
 * new characters plays the First Mission too, once that community is built
 * (R31; Z4-11). Each is played as a further mission in the same Mission Phase
 * as the Siege Defense (R27).
 */
export const OVERRUN_CONTINUATIONS = {
  claim: 'claim-a-new-base',
  'start-over': 'first-mission',
  abandon: 'first-mission',
} as const satisfies Record<string, StandardMissionId>;

export type OverrunOption = keyof typeof OVERRUN_CONTINUATIONS;

export const OVERRUN_OPTIONS = Object.keys(OVERRUN_CONTINUATIONS) as readonly OverrunOption[];
