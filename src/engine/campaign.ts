/**
 * The `Campaign` — the single object the whole app reads and writes.
 *
 * **Derived values are never stored here.** Only primitive facts persist: turn
 * number, assignments, inventory, stats, skill levels. Hunger, Exhaustion,
 * Unrest, Siege Threat and every Skill Score are recomputed on demand, because
 * the hunger stat penalty retroactively changes Skill Scores for the turn and
 * makes any cached value wrong. If you are tempted to add a field that can be
 * calculated from other fields, write a function in this directory instead.
 *
 * The shape grows a phase at a time. `survivors` became real in Phase 1;
 * `base` and `log` are still empty placeholders and get their types in Phases 2
 * and 3 — through the migration chain in `src/persistence`, which exists
 * precisely to make that change survivable for a campaign already in progress.
 */

import type { Skill, Stat } from '../data/skills';
import type { Tier } from '../data/tiers';

/** The four campaign phases, in the strict order the turn runs them. */
export const CAMPAIGN_PHASES = ['mission', 'advancement', 'planning', 'management'] as const;

export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number];

/** The four stored material types. */
export const MATERIALS = ['food', 'fuel', 'hardware', 'rare'] as const;

export type Material = (typeof MATERIALS)[number];

export type Materials = Record<Material, number>;

/**
 * Bumped whenever the persisted shape of `Campaign` changes. Lives here rather
 * than in `src/persistence` because the field lives on this type and
 * persistence may import from the engine, never the reverse.
 *
 * Bumping this without adding a matching migration step and fixture fails the
 * guard test in `src/persistence`.
 */
export const CURRENT_SCHEMA_VERSION = 3;

/** A survivor's four stat values (pg. 40). */
export type Stats = Record<Stat, number>;

/**
 * The skills a survivor has, and at what level.
 *
 * **Partial on purpose.** A Rookie has one skill, not twenty of which nineteen
 * are absent — how many skills a survivor holds is itself a rule (skill slots =
 * Tier, pg. 38–39), and counting the entries of this record is how that rule is
 * checked. A full record of twenty zeroes would make "has the skill at level 0"
 * and "does not have the skill" the same state, and they are not.
 */
export type SkillLevels = Partial<Record<Skill, number>>;

/**
 * One survivor.
 *
 * **Primitive facts only.** Skill Score, max HP, item slots and labor are all
 * computable from what is here plus the tables in `src/data`, so none of them
 * appear — the hunger penalty in Phase 3 changes every Skill Score for a turn,
 * and a stored one would be wrong the moment it did.
 *
 * Equipment, keywords and assignments are absent for a different reason: their
 * rules are Phases 5, 7 and 3. Adding fields for them now would be designing
 * shapes before the rules that constrain them exist.
 */
export interface Survivor {
  id: string;

  name: string;

  tier: Tier;

  stats: Stats;

  skills: SkillLevels;

  /** Score, not level — Move has no governing stat (pg. 41). */
  move: number;

  /** Score, not level, for the same reason. */
  defense: number;

  /** Max HP is the Tier and is derived; this is the survivor's current health. */
  currentHp: number;

  xp: number;
}

export interface Campaign {
  /** Which version of the persisted shape this campaign was written in. */
  schemaVersion: number;

  id: string;

  name: string;

  /** ISO 8601. */
  createdAt: string;

  /** 1-based. The first campaign turn is turn 1, not turn 0. */
  turn: number;

  phase: CampaignPhase;

  materials: Materials;

  survivors: readonly Survivor[];

  /**
   * Whether the player has finished assembling their starting community.
   *
   * A starting community is built from ten Tier levels (pg. 48), and that rule
   * stops applying once play begins — field recruits push a community past ten
   * perfectly legally. Nothing else in a campaign says when the building is
   * over, so the player says it, and this records the answer.
   *
   * A decision, not a derived value: it cannot be worked out from the roster,
   * the turn or the phase, which is why it is stored rather than computed.
   */
  startingCommunityBuilt: boolean;

  /** Placeholder — Phase 2 (base building) replaces this with a `Base`. */
  base: null;

  /** Placeholder — Phase 3 (the turn engine) makes this an append-only log. */
  log: readonly never[];
}

/**
 * Values a caller may pin instead of letting the factory generate them.
 *
 * `crypto.randomUUID()` and the current time are the only impure things
 * creating a campaign needs. Taking them as arguments keeps this module honest
 * about the engine's purity rule and lets tests assert on exact values rather
 * than working around a moving clock.
 */
export interface NewCampaignOptions {
  id?: string;
  /** ISO 8601. */
  createdAt?: string;
}

/** An empty campaign, ready for its first Mission Phase. */
export function createNewCampaign(name: string, options: NewCampaignOptions = {}): Campaign {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: options.id ?? crypto.randomUUID(),
    name,
    createdAt: options.createdAt ?? new Date().toISOString(),
    turn: 1,
    phase: 'mission',
    // All zero. Starting material counts are a rule, and Phase 0 ships none.
    materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
    survivors: [],
    // False, so a new campaign gets the ten-tier-level check while it is being
    // built. The v2 → v3 migration deliberately answers `true` instead — see
    // the step in `src/persistence/migrations.ts` for why the two differ.
    startingCommunityBuilt: false,
    base: null,
    log: [],
  };
}
