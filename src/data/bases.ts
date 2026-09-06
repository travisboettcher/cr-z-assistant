/**
 * Bases and their Facility Slots — rules as data (pg. 54–71).
 *
 * Transcribed from the base roster and slot layouts of the Modiphius edition
 * (see `docs/rulebook-edition.md`) on 2026-09-06, alongside the facility table
 * in `facilities.ts`.
 *
 * **The printed storage column is not here.** Every number in it is
 * `Tier + 3` plus the base's built-in facilities — the Greasy Spoon's 6/6/6 is
 * a Tier 1 base with a built-in Storage Area, not a special case. Storing it
 * would be storing a derived value, and a wrong one the moment a facility is
 * built. `rules.test.ts` re-derives the whole column and asserts it matches the
 * printed roster, which is what turns that table into a check on this
 * transcription instead of a second copy of it.
 *
 * Display names are not here either — `small-town-home` is an identifier, and
 * naming it for a screen is the UI's job. Slot ids are unique within their
 * base, and repeated slots are numbered in the order the book lists them.
 *
 * **Page numbers.** The chapter runs pg. 54–74 and the facility table is
 * pg. 72–73; the per-base pages inside that range were not captured in the
 * transcription and are cited as the chapter. Narrow them next time the book is
 * open — a citation that sends a reader to the wrong page is the failure the
 * edition retrofit existed to remove.
 */

import type { FacilityId, SiegeThreatEffect, SlotKind, UpgradeId } from './facilities';
import type { Materials } from './materials';
import type { Skill } from './skills';

/** Bases fall into three Tiers (pg. 54). Survivor Tiers run to four; these do not. */
export const BASE_TIERS = [1, 2, 3] as const;

export type BaseTier = (typeof BASE_TIERS)[number];

/**
 * How many Hero-Tier survivors a community may hold (pg. 54).
 *
 * A function rather than a column of the base table because the book states the
 * identity outright — the cap *is* the Tier — where the survivor Tier table's
 * five coinciding columns are five separate rules that happen to agree. Moving
 * into a lower-Tier base over the cap sends a Hero of the player's choice off
 * to start their own community, which is a roster consequence and Phase 3's.
 */
export function maxHeroes(tier: BaseTier): number {
  return tier;
}

/** What clearing a slot's rubble gives back, where the book gives anything. */
export interface ClearingYield {
  readonly materials?: Partial<Materials>;
  /**
   * Equipment added to the base Inventory. Phase 5 owns the item catalogue, so
   * this records the row's shape — a count and a quality — and not an item id
   * that does not exist yet.
   */
  readonly equipment?: {
    readonly count: number;
    readonly quality: 'standard';
    readonly category: 'weapon';
  };
}

/**
 * One Facility Slot.
 *
 * The slot is the entity, not the facility: it has a kind that never changes,
 * and a state that a build or a clearing project moves through. A built-in
 * facility is permanent and cannot be destroyed (pg. 54).
 */
export type BaseSlot = {
  /** Unique within its base. */
  readonly id: string;
  readonly kind: SlotKind;
} & (
  | { readonly state: 'empty' }
  | {
      readonly state: 'built-in';
      readonly facility: FacilityId;
      /** Pre-installed upgrades, which may repeat — the Firehouse's bunk rooms. */
      readonly upgrades: readonly UpgradeId[];
      /**
       * Whether further upgrades may be built.
       *
       * **Stored, not derived.** The book's rule — a built-in that already has
       * an upgrade cannot be upgraded further (pg. 54) — explains every row but
       * the Distillery's Utility Station, which is locked while carrying no
       * upgrade. That row is a real exception and not a misprint: pg. 61
       * describes the section as producing about what a Utility Station with
       * two Rain Collectors would, but a Rain Collector requires an Outdoor
       * slot and this one is Indoor, so naming the upgrades would have printed
       * an illegal build. The designer wrote the output down directly instead —
       * see `flatOutput`. So "locked" and "carries an upgrade" are two facts,
       * not one, and this field records the first of them.
       */
      readonly upgradable: boolean;
      /**
       * Output a built-in produces flat, where its facility is normally staffed
       * — the Distillery's Utility Station and its 2 Water (pg. 61).
       *
       * A parenthesised number in the book's Effect column is production per
       * turn, so this arrives **unstaffed**.
       *
       * **Ruled, because the text does not say:** the facility is still a
       * Utility Station, so it may also be staffed for the usual Utilities
       * Score worth of Power and Water, and that output adds to this rather
       * than replacing it. Nothing in the text settles it either way; this is
       * the permissive reading, recorded here so a later phase implements the
       * ruling rather than re-deciding it.
       */
      readonly flatOutput?: { readonly output: 'power' | 'water'; readonly amount: number };
    }
  | {
      /** Rubble or junk, cleared by a Labor project (pg. 54). */
      readonly state: 'clearing-project';
      readonly labor: number;
      readonly yields?: ClearingYield;
    }
);

/**
 * A Tier 3 base's special ability (pg. 54–71).
 *
 * A union keyed by id rather than a generic effect bag: the seven abilities
 * reach into six different systems — the Labor pool, Siege Threat, build costs,
 * utility supply, bed counts and starting Inventory — and a shape general
 * enough to hold all of them would describe none of them. Each carries exactly
 * the fields its rule needs, and the phase that owns that system matches on the
 * id. Nothing in Phase 2 reads any but `curtain-wall` and `white-noise`.
 */
export type BaseSpecial =
  | {
      /** Halves the Labor cost of building these weapon types. Phase 5. */
      readonly id: 'blacksmithing-tools';
      readonly halvesLaborForWeaponSkills: readonly Skill[];
    }
  | { readonly id: 'curtain-wall'; readonly siegeThreat: SiegeThreatEffect }
  | {
      /** At this combined community Utilities Score, every facility is supplied. Phase 3. */
      readonly id: 'dam-utilities';
      readonly suppliesAllAtCombinedUtilities: number;
    }
  | { readonly id: 'white-noise'; readonly bedsPerIndoorBunkRoom: number }
  | {
      /** Added to the Labor pool, if anyone is on the project team. Phase 3. */
      readonly id: 'catwalks';
      readonly labor: number;
      readonly needsProjectTeam: true;
    }
  | {
      /** Calls a Siege Defense for the next Mission Phase. Phases 3 and 4. */
      readonly id: 'ring-the-bell';
      readonly triggersSiegeDefense: true;
    }
  | {
      /** Equipment the community starts with. Phase 5 owns the item catalogue. */
      readonly id: 'turnout-gear';
      readonly startingEquipment: {
        readonly count: number;
        readonly quality: 'standard';
        readonly item: 'reinforced-clothing';
      };
    };

export interface BaseRules {
  readonly id: BaseId;
  readonly tier: BaseTier;
  /** The base a new community starts in (pg. 54). */
  readonly starter?: true;
  readonly slots: readonly BaseSlot[];
  readonly specials: readonly BaseSpecial[];
}

/**
 * A community's first base starts with maximum storage of every capped
 * material; a later one starts with only what was carried over (pg. 54).
 *
 * Recorded here because it is a base rule; nothing reads it until a campaign
 * can claim a base with materials already in hand, which is Phase 4's Claim a
 * New Base.
 */
export const FIRST_BASE_STARTS_AT_MAX_STORAGE = true;

/** The base roster (pg. 54–71), keyed by id. */
export const BASES = {
  'small-town-home': {
    id: 'small-town-home',
    tier: 1,
    starter: true,
    specials: [],
    slots: [
      {
        id: 'bunk-room-1',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'bunk-room-2',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: [],
        upgradable: true,
      },
      { id: 'garage', kind: 'indoor', state: 'empty' },
      { id: 'front-yard', kind: 'outdoor', state: 'empty' },
    ],
  },

  'summer-camp': {
    id: 'summer-camp',
    tier: 1,
    specials: [],
    slots: [
      {
        id: 'bunk-room-1',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: ['extra-bed', 'extra-bed'],
        upgradable: false,
      },
      {
        id: 'bunk-room-2',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: ['extra-bed', 'extra-bed'],
        upgradable: false,
      },
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'workshop',
        kind: 'indoor',
        state: 'built-in',
        facility: 'workshop',
        upgrades: ['auto-shop'],
        upgradable: false,
      },
      { id: 'stable', kind: 'indoor', state: 'empty' },
      { id: 'sports-field', kind: 'outdoor', state: 'empty' },
      { id: 'theater-arts-field', kind: 'outdoor', state: 'empty' },
    ],
  },

  'rural-church': {
    id: 'rural-church',
    tier: 1,
    specials: [],
    slots: [
      {
        id: 'watchtower',
        kind: 'outdoor',
        state: 'built-in',
        facility: 'watchtower',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'training-room',
        kind: 'indoor',
        state: 'built-in',
        facility: 'training-room',
        upgrades: ['classroom'],
        upgradable: false,
      },
      {
        id: 'pews-1',
        kind: 'indoor',
        state: 'clearing-project',
        labor: 2,
        yields: { materials: { hardware: 2 } },
      },
      {
        id: 'pews-2',
        kind: 'indoor',
        state: 'clearing-project',
        labor: 2,
        yields: { materials: { hardware: 2 } },
      },
      { id: 'parking-lot', kind: 'outdoor', state: 'empty' },
      { id: 'overflow-parking', kind: 'outdoor', state: 'empty' },
      { id: 'yard', kind: 'outdoor', state: 'empty' },
    ],
  },

  'greasy-spoon': {
    id: 'greasy-spoon',
    tier: 1,
    specials: [],
    slots: [
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: ['gas-range'],
        upgradable: false,
      },
      {
        id: 'storage-area',
        kind: 'indoor',
        state: 'built-in',
        facility: 'storage-area',
        upgrades: ['refrigeration'],
        upgradable: false,
      },
      {
        id: 'bunk-room',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: ['extra-bed'],
        upgradable: false,
      },
      { id: 'dining-room', kind: 'indoor', state: 'empty' },
      { id: 'parking-lot-1', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-2', kind: 'outdoor', state: 'empty' },
      { id: 'rooftop', kind: 'outdoor', state: 'empty' },
    ],
  },

  'hobby-farm': {
    id: 'hobby-farm',
    tier: 2,
    specials: [],
    slots: [
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'bunk-room-1',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'bunk-room-2',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'storage-area',
        kind: 'indoor',
        state: 'built-in',
        facility: 'storage-area',
        upgrades: ['shelving'],
        upgradable: false,
      },
      {
        id: 'garden',
        kind: 'outdoor',
        state: 'built-in',
        facility: 'garden',
        upgrades: ['fence'],
        upgradable: false,
      },
      {
        id: 'utility-station',
        kind: 'outdoor',
        state: 'built-in',
        facility: 'utility-station',
        upgrades: ['well-pump'],
        upgradable: false,
      },
      {
        id: 'ruined-chicken-coop',
        kind: 'outdoor',
        state: 'clearing-project',
        labor: 2,
        yields: { materials: { hardware: 2 } },
      },
      { id: 'front-yard', kind: 'outdoor', state: 'empty' },
      { id: 'back-yard', kind: 'outdoor', state: 'empty' },
    ],
  },

  distillery: {
    id: 'distillery',
    tier: 2,
    specials: [],
    slots: [
      {
        id: 'storage-area',
        kind: 'indoor',
        state: 'built-in',
        facility: 'storage-area',
        upgrades: ['fuel-tank'],
        upgradable: false,
      },
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: ['biofuel-lab'],
        upgradable: false,
      },
      {
        id: 'utility-station',
        kind: 'indoor',
        state: 'built-in',
        facility: 'utility-station',
        upgrades: [],
        upgradable: false,
        flatOutput: { output: 'water', amount: 2 },
      },
      { id: 'tasting-room', kind: 'indoor', state: 'empty' },
      { id: 'loading-dock', kind: 'indoor', state: 'empty' },
      { id: 'break-room', kind: 'indoor', state: 'empty' },
      { id: 'rooftop', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-1', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-2', kind: 'outdoor', state: 'empty' },
    ],
  },

  'outdoor-sports-shop': {
    id: 'outdoor-sports-shop',
    tier: 2,
    specials: [],
    slots: [
      {
        id: 'inventory',
        kind: 'indoor',
        state: 'clearing-project',
        labor: 2,
        yields: { equipment: { count: 4, quality: 'standard', category: 'weapon' } },
      },
      {
        id: 'workshop',
        kind: 'indoor',
        state: 'built-in',
        facility: 'workshop',
        upgrades: ['gunsmith'],
        upgradable: false,
      },
      {
        id: 'training-room',
        kind: 'indoor',
        state: 'built-in',
        facility: 'training-room',
        upgrades: ['ropes-course'],
        upgradable: false,
      },
      { id: 'sales-floor-1', kind: 'indoor', state: 'empty' },
      { id: 'sales-floor-2', kind: 'indoor', state: 'empty' },
      { id: 'sales-floor-3', kind: 'indoor', state: 'empty' },
      { id: 'parking-lot-1', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-2', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-3', kind: 'outdoor', state: 'empty' },
    ],
  },

  'renaissance-festival': {
    id: 'renaissance-festival',
    tier: 3,
    specials: [
      {
        id: 'blacksmithing-tools',
        halvesLaborForWeaponSkills: ['blade-weapon', 'blunt-weapon', 'heavy-weapon', 'archery'],
      },
      { id: 'curtain-wall', siegeThreat: { perTurn: -3 } },
    ],
    slots: [
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'workshop',
        kind: 'indoor',
        state: 'built-in',
        facility: 'workshop',
        upgrades: ['metal-shop'],
        upgradable: false,
      },
      {
        id: 'training-room',
        kind: 'outdoor',
        state: 'built-in',
        facility: 'training-room',
        upgrades: ['weight-room'],
        upgradable: false,
      },
      { id: 'kings-pavilion', kind: 'indoor', state: 'empty' },
      { id: 'camping-area-1', kind: 'outdoor', state: 'empty' },
      { id: 'camping-area-2', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-1', kind: 'outdoor', state: 'empty' },
      { id: 'parking-lot-2', kind: 'outdoor', state: 'empty' },
    ],
  },

  'hydroelectric-dam': {
    id: 'hydroelectric-dam',
    tier: 3,
    specials: [
      { id: 'dam-utilities', suppliesAllAtCombinedUtilities: 6 },
      { id: 'white-noise', bedsPerIndoorBunkRoom: 1 },
      { id: 'catwalks', labor: 2, needsProjectTeam: true },
    ],
    slots: [
      {
        id: 'storage-area',
        kind: 'indoor',
        state: 'built-in',
        facility: 'storage-area',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'workshop',
        kind: 'indoor',
        state: 'built-in',
        facility: 'workshop',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'watchtower',
        kind: 'outdoor',
        state: 'built-in',
        facility: 'watchtower',
        upgrades: ['watch-post', 'watch-post'],
        upgradable: false,
      },
      { id: 'turbine-room-1', kind: 'indoor', state: 'empty' },
      { id: 'turbine-room-2', kind: 'indoor', state: 'empty' },
      { id: 'office', kind: 'indoor', state: 'empty' },
      { id: 'parking-lot', kind: 'outdoor', state: 'empty' },
    ],
  },

  'regional-firehouse': {
    id: 'regional-firehouse',
    tier: 3,
    specials: [
      { id: 'ring-the-bell', triggersSiegeDefense: true },
      {
        id: 'turnout-gear',
        startingEquipment: { count: 6, quality: 'standard', item: 'reinforced-clothing' },
      },
    ],
    slots: [
      {
        id: 'bunk-room-1',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: ['extra-bed', 'extra-bed'],
        upgradable: false,
      },
      {
        id: 'bunk-room-2',
        kind: 'indoor',
        state: 'built-in',
        facility: 'bunk-room',
        upgrades: ['extra-bed', 'extra-bed'],
        upgradable: false,
      },
      {
        id: 'training-room',
        kind: 'indoor',
        state: 'built-in',
        facility: 'training-room',
        upgrades: ['weight-room'],
        upgradable: false,
      },
      {
        id: 'kitchen',
        kind: 'indoor',
        state: 'built-in',
        facility: 'kitchen',
        upgrades: [],
        upgradable: true,
      },
      {
        id: 'workshop',
        kind: 'indoor',
        state: 'built-in',
        facility: 'workshop',
        upgrades: ['auto-shop'],
        upgradable: false,
      },
      {
        id: 'medical-clinic',
        kind: 'indoor',
        state: 'built-in',
        facility: 'medical-clinic',
        upgrades: [],
        upgradable: true,
      },
      { id: 'garage-1', kind: 'indoor', state: 'empty' },
      { id: 'garage-2', kind: 'indoor', state: 'empty' },
    ],
  },
} as const satisfies Record<string, Omit<BaseRules, 'id'> & { id: string }>;

export type BaseId = keyof typeof BASES;

export const BASE_IDS = Object.keys(BASES) as readonly BaseId[];
