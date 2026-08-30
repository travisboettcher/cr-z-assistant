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
 * The shape is deliberately thin. Phase 0 ships no game rules, so survivors,
 * bases and the campaign log are present as empty placeholders and get their
 * real types in later phases — through the migration chain in `src/persistence`,
 * which exists precisely to make that change survivable for a campaign already
 * in progress.
 */

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
export const CURRENT_SCHEMA_VERSION = 1;

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

  /**
   * Placeholder — Phase 1 (#roster) gives this a real element type. Typed as
   * empty rather than `unknown[]` because Phase 0 genuinely cannot hold a
   * survivor, and a type that admits one would let the shape drift silently.
   */
  survivors: readonly never[];

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
    base: null,
    log: [],
  };
}
