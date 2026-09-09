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
 * The shape grows a phase at a time. `survivors` became real in Phase 1, `base`
 * in Phase 2 and `log` in Phase 3 — each through the migration chain in
 * `src/persistence`, which exists precisely to make those changes survivable
 * for a campaign already in progress.
 */

import type { BaseId } from '../data/bases';
import type { FacilityId, UpgradeId } from '../data/facilities';
import type { Materials } from '../data/materials';
import type { CampaignOrigin } from '../data/origins';
import type { Skill, Stat } from '../data/skills';
import type { Tier } from '../data/tiers';
import type { CampaignPhase } from '../data/turn';
import type { LogEntry } from './log';

/**
 * Bumped whenever the persisted shape of `Campaign` changes. Lives here rather
 * than in `src/persistence` because the field lives on this type and
 * persistence may import from the engine, never the reverse.
 *
 * Bumping this without adding a matching migration step and fixture fails the
 * guard test in `src/persistence`.
 */
export const CURRENT_SCHEMA_VERSION = 6;

/** A survivor's four stat values (pg. 8). */
export type Stats = Record<Stat, number>;

/**
 * The skills a survivor has, and at what level.
 *
 * **Partial on purpose.** A Rookie has one skill, not twenty of which nineteen
 * are absent — how many skills a survivor holds is itself a rule (skill slots =
 * Tier, pg. 7), and counting the entries of this record is how that rule is
 * checked. A full record of twenty zeroes would make "has the skill at level 0"
 * and "does not have the skill" the same state, and they are not.
 */
export type SkillLevels = Partial<Record<Skill, number>>;

/**
 * One survivor.
 *
 * **Primitive facts only.** Skill Score, max HP, Inventory Slots and labor are all
 * computable from what is here plus the tables in `src/data`, so none of them
 * appear — the hunger penalty in Phase 3 changes every Skill Score for a turn,
 * and a stored one would be wrong the moment it did.
 *
 * Equipment, traits and assignments are absent for a different reason: their
 * rules are Phases 5, 7 and 3. Adding fields for them now would be designing
 * shapes before the rules that constrain them exist.
 */
export interface Survivor {
  id: string;

  name: string;

  tier: Tier;

  stats: Stats;

  skills: SkillLevels;

  /** Score, not level — Move has no governing stat (pg. 9). */
  move: number;

  /** Score, not level, for the same reason. */
  defense: number;

  /** Max HP is the Tier and is derived; this is the survivor's current health. */
  currentHp: number;

  xp: number;
}

/**
 * A facility the player has built into a slot.
 *
 * Built-in facilities are **not** recorded here — they are in the base's own
 * layout in `src/data/bases.ts`, and copying one into the save would give the
 * same fact two homes that could disagree.
 */
export interface BuiltFacility {
  readonly facility: FacilityId;

  /**
   * The campaign turn it went up on.
   *
   * A primitive fact — *when this happened* — and the only way the rule that an
   * upgrade may not be built the same turn as its facility (pg. 54) survives a
   * reload. Nothing else in a campaign records it.
   */
  readonly builtOnTurn: number;
}

/**
 * What the player has done to one Facility Slot.
 *
 * Everything permanent about a slot — its Indoor/Outdoor kind, whether it
 * starts empty, built-in or full of rubble — belongs to the base layout and is
 * read from there. This holds only what a player changed, so a slot nobody has
 * touched has no entry at all.
 *
 * Every field is optional and absent means the same as false, which is the one
 * spelling this shape allows: `power: false` and no `power` key would otherwise
 * be the same state written two ways, and the exporter would have to pick one
 * anyway.
 */
export interface SlotState {
  /** Set once a clearing project has been paid for (pg. 54). */
  readonly cleared?: true;

  /** A facility built into this slot. Absent where the base ships a built-in. */
  readonly built?: BuiltFacility;

  /**
   * Upgrades the player has added, in the order they were built, on top of
   * whatever the base layout already ships in this slot.
   *
   * A list rather than a set: repeats are legal and count separately against
   * the cap of three, so two Extra Beds are two upgrades and not one.
   */
  readonly upgrades?: readonly UpgradeId[];

  /**
   * Power and Water assigned to this slot's facility for the turn (pg. 20, 67).
   *
   * Stored, unlike the pool they come out of: how much a base generates is
   * arithmetic over its facilities and gets recomputed, but *where the player
   * put it* is a decision. One point covers the facility and all its upgrades,
   * so this is a flag and not a count. Clearing them each Planning Phase is
   * Phase 3's job; until then an assignment simply stands.
   */
  readonly power?: true;
  readonly water?: true;
}

/**
 * The community's base.
 *
 * **Primitive facts only**, and thin on purpose: the slot list, each slot's
 * kind, the built-in facilities and the clearing projects are all rules, and
 * they live in `src/data/bases.ts`. What persists is which base was claimed and
 * what the player has since done to it. Storage caps, bed counts, utility pools
 * and production are all computed from the two together.
 */
export interface Base {
  /**
   * Which base from the roster in `src/data/bases.ts`.
   *
   * A catalogue id, not a generated one — the type says which. It is a field
   * rather than a fixed part of the campaign because Claim a New Base (Phase 4)
   * replaces it, and nothing anywhere may cache a value derived from it.
   */
  readonly id: BaseId;

  /**
   * Slot id to what the player has done to it, for the slots they have touched.
   *
   * **Partial on purpose**, exactly as `SkillLevels` is. An untouched slot is
   * absent rather than present-and-empty, so "nothing has happened here" has
   * one spelling; and a slot id that is not in the base's layout is a damaged
   * save rather than a slot.
   */
  readonly slots: Readonly<Record<string, SlotState>>;
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

  /**
   * The campaign's origin, or absent for one not using an origin.
   *
   * The only optional field on the persisted shape, and the reason
   * `migrations.test.ts` knows which keys may legitimately be missing.
   */
  origin?: CampaignOrigin;

  materials: Materials;

  survivors: readonly Survivor[];

  /**
   * Whether the player has finished assembling their starting community.
   *
   * A starting community is built from ten Tier levels (pg. 13), and that rule
   * stops applying once play begins — field recruits push a community past ten
   * perfectly legally. Nothing else in a campaign says when the building is
   * over, so the player says it, and this records the answer.
   *
   * A decision, not a derived value: it cannot be worked out from the roster,
   * the turn or the phase, which is why it is stored rather than computed.
   */
  startingCommunityBuilt: boolean;

  /**
   * The community's base, or `null` for a campaign that has not claimed one.
   *
   * Null is a real answer, not a missing value: a campaign before its first
   * base is the state the Start a New Community and Claim a New Base missions
   * resolve. A base with no slots would be a different thing entirely.
   */
  base: Base | null;

  /**
   * Everything that has happened, oldest first.
   *
   * **Append-only.** Nothing in the app removes or edits an entry, and the
   * store has no action that could; a log that can be rewritten records what
   * someone last decided had happened rather than what did. See
   * [`log.ts`](./log.ts) for what earns an entry and what deliberately does
   * not.
   */
  log: readonly LogEntry[];
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
