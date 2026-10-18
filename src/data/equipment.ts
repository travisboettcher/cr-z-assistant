/**
 * The equipment catalogue — rules as data (pp. 37–53).
 *
 * Transcribed from the Equipment chapter of the Modiphius edition (see
 * `docs/rulebook-edition.md`) on 2026-10-13, from the batch-16 rulings extract.
 * Printed page numbers.
 *
 * Phase 5, part 1 (`docs/phase-5-stories.md`, Z5-1). **What the campaign reads,
 * and nothing a mission plays.** An item here says what it is, what it costs and
 * where it can be built, how many Inventory Slots it takes, which skill it is
 * used with or needs, and what it adds to a Score or a slot count between
 * missions. Range, Noise, damage and every rule that happens on the table stay
 * in the book, cited by page; the tracker does not play missions.
 *
 * Display names are not here, for the reason the base roster has none: naming
 * an item for a screen is the UI's job.
 *
 * ## Grades
 *
 * Shoddy, standard and quality: −1, 0 and +1 to the Score of the skill an item
 * is used with (pp. 8, 14, 37). A weapon's grade is its whole contribution, and
 * the engine reads it from `GRADE_MODIFIER`. An item that is not a weapon
 * carries its grade's effect in `adds` instead, because its grades differ in
 * other ways than ±1 (pg. 45) — reinforced clothing, for one, loses its Move
 * penalty at quality.
 *
 * ## Slots
 *
 * One per weapon whatever its hands (pg. 38); most other carried items one
 * (pg. 44), the breaching tool two; worn protective gear, the tool belt, traps,
 * attachments and the resistance charm none (pp. 44–46, 50). A backpack takes
 * one, which its +1 to Carry gives back (pg. 44; R36), and the ultralight
 * backpack one, for a net +1 (R50). `null` where the book does not say: a
 * handful of origin and rare items, settled when they are first carried.
 */

import type { D10Result } from './dice';
import type { FacilityId, Utility, UpgradeId } from './facilities';
import type { CampaignOrigin } from './origins';
import type { CommonSkill, Skill } from './skills';

/** The three grades, worst first (pg. 37). */
export const GRADES = ['shoddy', 'standard', 'quality'] as const;

export type Grade = (typeof GRADES)[number];

/** What a weapon's grade adds to the Score of the skill it is used with (pg. 37). */
export const GRADE_MODIFIER = {
  shoddy: -1,
  standard: 0,
  quality: 1,
} as const satisfies Record<Grade, number>;

/** The grades that cost something; shoddy gear is free (pg. 37). */
export type PricedGrade = Exclude<Grade, 'shoddy'>;

/** A price per grade, for the grades the table prints one for. */
export type GradePrices = Partial<Record<PricedGrade, number>>;

/**
 * What kind of thing an item is, as the chapter divides them (pp. 37–53).
 *
 * - `weapon` — used with a weapon skill (pp. 38–40).
 * - `ammunition` — an origin's shells, arrows or rounds (pg. 40).
 * - `equipment` — tools and gear that add to a Score or are needed for a skill
 *   (pg. 44).
 * - `protective` — worn, taking no slot (pg. 45).
 * - `disposable` — used up when used (pp. 46–48).
 * - `rare-equipment`, `rare-weapon` — found or traded, never built (pp. 50–51).
 * - `rare-upgrade` — installed in a facility (pg. 49).
 * - `vehicle-upgrade` — fitted to one vehicle, for good (pg. 49).
 */
export type ItemKind =
  | 'weapon'
  | 'ammunition'
  | 'equipment'
  | 'protective'
  | 'disposable'
  | 'rare-equipment'
  | 'rare-weapon'
  | 'rare-upgrade'
  | 'vehicle-upgrade';

/**
 * What must stand at the base before an item can be built (pp. 41–42): every
 * facility and Workshop upgrade named, and the Utilities named supplied this
 * turn. The Metal Shop and Gunsmith are Workshop upgrades (pp. 71–72).
 */
export interface BuildRequirement {
  readonly facilities?: readonly FacilityId[];
  readonly upgrades?: readonly UpgradeId[];
  readonly utilities?: readonly Utility[];
}

/**
 * What it costs to build an item (pp. 20, 41–42): Hardware per grade and one
 * Labor for all of them, the table having a single Labor column (R34).
 */
export interface PricedBuild {
  readonly kind: 'priced';
  readonly hardware: GradePrices;
  readonly labor: number;
  readonly requires: BuildRequirement;
}

/**
 * Built at the cost of the standard weapon it enchants (pg. 40): the enchanted
 * melee weapon, whose table row says only "Special".
 */
export interface BuildAsBaseWeapon {
  readonly kind: 'as-base-weapon';
  readonly requires: BuildRequirement;
}

export type Build = PricedBuild | BuildAsBaseWeapon;

/** What an item adds between missions: to Scores, and to Inventory Slots. */
export interface Bonus {
  readonly scores?: Partial<Record<Skill | CommonSkill, number>>;
  readonly inventorySlots?: number;
}

/**
 * How long an item lasts once it has gone on a mission (pp. 40, 45–48; R37).
 *
 * - `kept` — until lost.
 * - `used-up` — gone when used: thrown, set, drunk or worn through.
 * - `one-mission` — gone after the mission it was taken on, used or not.
 */
export type ItemLife = 'kept' | 'used-up' | 'one-mission';

/** One item in the catalogue. */
export interface ItemRules {
  readonly kind: ItemKind;

  /** For `PageRef`. */
  readonly pages: number | string;

  /** The grades it exists in. Shoddy only where a skill hands one out free (pp. 9–11, 37). */
  readonly grades: readonly Grade[];

  /** Inventory Slots it takes, or `null` where the book does not say. */
  readonly slots: number | null;

  /**
   * The skills it is used with, whose Score its grade changes — one for most,
   * the choice of three for an enchanted weapon or a Halligan tool (pp. 40, 50).
   */
  readonly uses?: readonly Skill[];

  /** A weapon that can attack in melee: the melee weapons, and a pistol or revolver (pp. 38–39). */
  readonly melee?: true;

  /** A weapon that attacks at range (pp. 38–40). */
  readonly ranged?: true;

  /** How many hands, where the book says (pp. 9, 38–39). */
  readonly hands?: 1 | 2;

  /** The skill a survivor must have to equip it (pp. 11, 44). */
  readonly needs?: Skill;

  /** What it adds between missions, per grade (pp. 44–45, 50–51; R39). */
  readonly adds?: Partial<Record<Grade, Bonus>>;

  /** The Score bonuses in `adds` count only with that skill: the Halligan tool's (pg. 50). */
  readonly bonusesNeedTheSkill?: true;

  /** Scores it caps while carried: the tool belt holds Stealth at 3 (pg. 44). */
  readonly caps?: Partial<Record<Skill, number>>;

  /**
   * The weapons it fits onto, taking no slot of its own (pg. 50). Item ids,
   * typed as strings only because the catalogue is what defines them; the rules
   * test holds each to an entry here.
   */
  readonly attachesTo?: readonly string[];

  /** Weapons it carries without a slot, and how many (pg. 51). Item ids, as above. */
  readonly holdsWithoutSlot?: { readonly items: readonly string[]; readonly count: number };

  readonly life: ItemLife;

  /** How it is built, where it can be (pp. 20, 41–42). Absent: found or traded only. */
  readonly build?: Build;

  /** Its trade price in Food and Fuel, any mix (pp. 21, 37, 41–43). */
  readonly trade?: GradePrices;

  /** Usable only in a campaign running this origin (pg. 37). */
  readonly origin?: CampaignOrigin;

  /**
   * A rare upgrade's facility, and the upgrade it counts as
   * (pg. 49). Outside the facility's three-upgrade cap.
   */
  readonly installs?: {
    readonly facility: FacilityId;
    /** The upgrade it stands on the facility as (pg. 49; R47). */
    readonly countsAs: UpgradeId;
    /** Works without the Utility that upgrade needs: the battery spotlight. */
    readonly unpowered?: true;
  };

  /** What a vehicle upgrade does to the vehicle it is fitted to (pg. 49; R82). */
  readonly onVehicle?: {
    /** Inventory Slots it adds, or takes away (R82). */
    readonly inventorySlots: number;
    /** The vehicle burns no Fuel. */
    readonly noFuel?: true;
    /** The vehicle deploys only while the base has a powered Auto Shop. */
    readonly needsPoweredAutoShop?: true;
  };
}

const WORKSHOP = { facilities: ['workshop'] } as const;
const METAL_SHOP = { upgrades: ['metal-shop'] } as const;
const GUNSMITH = { upgrades: ['gunsmith'] } as const;
const CLINIC = { facilities: ['medical-clinic'] } as const;
const LIBRARY = { facilities: ['mystic-library'] } as const;
const NOTHING = {} as const;

const ALL_GRADES = ['shoddy', 'standard', 'quality'] as const;
const STANDARD = ['standard'] as const;
const STANDARD_AND_QUALITY = ['standard', 'quality'] as const;
const QUALITY = ['quality'] as const;

const MELEE_SKILLS = ['blade-weapon', 'blunt-weapon', 'heavy-weapon'] as const;

/** A quality-only item that adds one to the Score it needs (pg. 44; R39). */
const plusOne = (skill: Skill) => ({ quality: { scores: { [skill]: 1 } } });

/**
 * Every item in the book's core equipment chapter, in the order its tables
 * print them (pp. 41–43, 49–51).
 */
export const EQUIPMENT = {
  // Ranged weapons (pp. 38, 41).
  pistol: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['handguns'],
    ranged: true,
    melee: true,
    hands: 1,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 3, quality: 6 }, labor: 2, requires: GUNSMITH },
    trade: { standard: 6 },
  },
  revolver: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['handguns'],
    ranged: true,
    melee: true,
    hands: 1,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 3, quality: 6 }, labor: 2, requires: GUNSMITH },
    trade: { standard: 6 },
  },
  rifle: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['long-guns'],
    ranged: true,
    hands: 2,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 4, quality: 7 }, labor: 3, requires: GUNSMITH },
    trade: { standard: 7 },
  },
  shotgun: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['long-guns'],
    ranged: true,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 4, quality: 7 }, labor: 3, requires: GUNSMITH },
    trade: { standard: 7 },
  },
  bow: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['archery'],
    ranged: true,
    hands: 2,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 2, quality: 5 }, labor: 2, requires: WORKSHOP },
    trade: { standard: 5 },
  },
  crossbow: {
    kind: 'weapon',
    pages: '38, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['archery'],
    ranged: true,
    hands: 2,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 3, quality: 6 }, labor: 3, requires: WORKSHOP },
    trade: { standard: 6 },
  },

  // Melee weapons (pp. 39, 41).
  blunt: {
    kind: 'weapon',
    pages: '39, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['blunt-weapon'],
    melee: true,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 1, quality: 4 }, labor: 1, requires: WORKSHOP },
    trade: { standard: 4 },
  },
  bladed: {
    kind: 'weapon',
    pages: '39, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['blade-weapon'],
    melee: true,
    life: 'kept',
    build: {
      kind: 'priced',
      hardware: { standard: 2, quality: 5 },
      labor: 2,
      requires: METAL_SHOP,
    },
    trade: { standard: 5 },
  },
  heavy: {
    kind: 'weapon',
    pages: '9, 39, 41',
    grades: ALL_GRADES,
    slots: 1,
    uses: ['heavy-weapon'],
    melee: true,
    hands: 2,
    life: 'kept',
    build: {
      kind: 'priced',
      hardware: { standard: 2, quality: 5 },
      labor: 2,
      requires: METAL_SHOP,
    },
    trade: { standard: 5 },
  },

  // Cosmic Horror weapons and ammunition (pp. 40, 41).
  flamethrower: {
    kind: 'weapon',
    pages: '40, 41',
    grades: STANDARD,
    slots: 1,
    uses: ['tinker'],
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 2 }, labor: 2, requires: METAL_SHOP },
    trade: { standard: 4 },
    origin: 'cosmic-horror',
  },
  'harpoon-gun': {
    kind: 'weapon',
    pages: '40, 41',
    grades: STANDARD,
    slots: 1,
    uses: ['long-guns'],
    ranged: true,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 3 }, labor: 3, requires: WORKSHOP },
    trade: { standard: 6 },
    origin: 'cosmic-horror',
  },
  'incendiary-shells': {
    kind: 'ammunition',
    pages: '40, 41',
    grades: STANDARD,
    slots: null,
    life: 'one-mission',
    build: { kind: 'priced', hardware: { standard: 1 }, labor: 2, requires: GUNSMITH },
    trade: { standard: 4 },
    origin: 'cosmic-horror',
  },
  'flaming-arrows': {
    kind: 'ammunition',
    pages: '40, 41',
    grades: STANDARD,
    slots: null,
    life: 'one-mission',
    build: { kind: 'priced', hardware: { standard: 1 }, labor: 2, requires: WORKSHOP },
    trade: { standard: 4 },
    origin: 'cosmic-horror',
  },

  // Magic weapons and ammunition (pp. 40, 41).
  'silver-ammunition': {
    kind: 'ammunition',
    pages: '40, 41',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 1 }, labor: 1, requires: METAL_SHOP },
    origin: 'magic',
  },
  'enchanted-melee-weapon': {
    kind: 'weapon',
    pages: '40, 41',
    grades: STANDARD,
    slots: 1,
    uses: MELEE_SKILLS,
    melee: true,
    life: 'kept',
    build: { kind: 'as-base-weapon', requires: LIBRARY },
    origin: 'magic',
  },

  // Equipment (pp. 41, 44).
  'tool-belt': {
    kind: 'equipment',
    pages: '11, 41, 44',
    grades: ALL_GRADES,
    slots: 0,
    uses: ['tinker'],
    caps: { stealth: 3 },
    life: 'kept',
    build: {
      kind: 'priced',
      hardware: { standard: 3, quality: 5 },
      labor: 1,
      requires: METAL_SHOP,
    },
    trade: { standard: 6, quality: 8 },
  },
  backpack: {
    kind: 'equipment',
    pages: '10, 41, 44',
    grades: QUALITY,
    slots: 1,
    needs: 'carry',
    adds: plusOne('carry'),
    life: 'kept',
    build: { kind: 'priced', hardware: { quality: 5 }, labor: 2, requires: WORKSHOP },
    trade: { quality: 8 },
  },
  'breaching-tool': {
    kind: 'equipment',
    pages: '41, 44',
    grades: QUALITY,
    slots: 2,
    needs: 'break',
    adds: plusOne('break'),
    life: 'kept',
    build: { kind: 'priced', hardware: { quality: 6 }, labor: 2, requires: METAL_SHOP },
    trade: { quality: 9 },
  },
  'burglar-tools': {
    kind: 'equipment',
    pages: '41, 44',
    grades: QUALITY,
    slots: 1,
    needs: 'enter',
    adds: plusOne('enter'),
    life: 'kept',
    build: { kind: 'priced', hardware: { quality: 6 }, labor: 2, requires: METAL_SHOP },
    trade: { quality: 9 },
  },
  'walkie-talkie': {
    kind: 'equipment',
    pages: '41, 44',
    grades: QUALITY,
    slots: 1,
    needs: 'tactics',
    adds: plusOne('tactics'),
    life: 'kept',
    build: {
      kind: 'priced',
      hardware: { quality: 6 },
      labor: 3,
      requires: { ...WORKSHOP, utilities: ['power'] },
    },
    trade: { quality: 9 },
  },
  binoculars: {
    kind: 'equipment',
    pages: '41, 44',
    grades: QUALITY,
    slots: 1,
    needs: 'scout',
    adds: plusOne('scout'),
    life: 'kept',
    build: { kind: 'priced', hardware: { quality: 6 }, labor: 2, requires: WORKSHOP },
    trade: { quality: 9 },
  },
  'resistance-charm': {
    kind: 'equipment',
    pages: '42, 44',
    grades: STANDARD,
    slots: 0,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 1 }, labor: 1, requires: LIBRARY },
    origin: 'magic',
  },

  // Protective, worn and taking no slot (pp. 42, 45).
  'improvised-armor': {
    kind: 'protective',
    pages: '42, 45',
    grades: STANDARD_AND_QUALITY,
    slots: 0,
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 2, quality: 5 }, labor: 2, requires: NOTHING },
    trade: { standard: 6, quality: 8 },
  },
  'improvised-shield': {
    kind: 'protective',
    pages: '42, 45',
    grades: STANDARD_AND_QUALITY,
    slots: 0,
    adds: { standard: { scores: { move: -1 } } },
    life: 'one-mission',
    build: { kind: 'priced', hardware: { standard: 2, quality: 4 }, labor: 2, requires: NOTHING },
    trade: { standard: 4, quality: 8 },
  },
  'reinforced-clothing': {
    kind: 'protective',
    pages: '42, 45',
    grades: STANDARD_AND_QUALITY,
    slots: 0,
    adds: {
      standard: { scores: { defense: 1, move: -1 } },
      quality: { scores: { defense: 1 } },
    },
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 4, quality: 7 }, labor: 2, requires: NOTHING },
    trade: { standard: 7, quality: 9 },
  },
  'knee-pads': {
    kind: 'protective',
    pages: '42, 45',
    grades: STANDARD_AND_QUALITY,
    slots: 0,
    life: 'kept',
    build: { kind: 'priced', hardware: { standard: 1, quality: 4 }, labor: 1, requires: NOTHING },
    trade: { standard: 4, quality: 7 },
  },

  // Disposable, one slot each and used up when used (pp. 42, 46–47).
  'adrenaline-shot': {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 4 },
      labor: 3,
      requires: { ...CLINIC, utilities: ['water', 'power'] },
    },
    trade: { standard: 7 },
  },
  bandages: {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 2 }, labor: 1, requires: CLINIC },
    trade: { standard: 4 },
  },
  'fireworks-bundle': {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 3 }, labor: 1, requires: GUNSMITH },
    trade: { standard: 6 },
  },
  grenade: {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD_AND_QUALITY,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 4, quality: 6 },
      labor: 2,
      requires: { facilities: ['kitchen'], upgrades: ['gunsmith'], utilities: ['water'] },
    },
    trade: { standard: 6, quality: 8 },
  },
  'molotov-cocktail': {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD_AND_QUALITY,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 2, quality: 3 },
      labor: 1,
      requires: { facilities: ['kitchen', 'workshop'], utilities: ['water'] },
    },
    trade: { standard: 5, quality: 7 },
  },
  'rope-ladder': {
    kind: 'disposable',
    pages: '42, 46',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 2 }, labor: 2, requires: WORKSHOP },
    trade: { standard: 4 },
  },
  'throwing-axe': {
    kind: 'disposable',
    pages: '42, 47',
    grades: STANDARD,
    slots: 1,
    uses: ['blade-weapon'],
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 3 }, labor: 2, requires: METAL_SHOP },
    trade: { standard: 6 },
  },

  // Traps, taking no slot and set by the Traps skill (pp. 11, 42, 46–47).
  trap: {
    kind: 'disposable',
    pages: '11, 42, 47',
    grades: ['shoddy', 'standard'],
    slots: 0,
    needs: 'traps',
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 1 }, labor: 1, requires: WORKSHOP },
    trade: { standard: 2 },
  },
  'persistent-trap': {
    kind: 'disposable',
    pages: '42, 47',
    grades: STANDARD,
    slots: 0,
    needs: 'traps',
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 2 }, labor: 2, requires: METAL_SHOP },
    trade: { standard: 4 },
  },
  'lure-trap': {
    kind: 'disposable',
    pages: '42, 47',
    grades: STANDARD,
    slots: 0,
    needs: 'traps',
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 3 },
      labor: 3,
      requires: { ...WORKSHOP, utilities: ['power'] },
    },
    trade: { standard: 6 },
  },
  'persistent-lure-trap': {
    kind: 'disposable',
    pages: '42, 47',
    grades: STANDARD,
    slots: 0,
    needs: 'traps',
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 4 },
      labor: 4,
      requires: { ...METAL_SHOP, utilities: ['power'] },
    },
    trade: { standard: 8 },
  },

  // Viral and Magic disposables (pp. 42, 48).
  'antiviral-grenade': {
    kind: 'disposable',
    pages: '42, 48',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 3 },
      labor: 2,
      requires: { ...CLINIC, utilities: ['water', 'power'] },
    },
    trade: { standard: 6 },
    origin: 'viral',
  },
  disinfectant: {
    kind: 'disposable',
    pages: '42, 48',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 2 },
      labor: 2,
      requires: { ...CLINIC, utilities: ['water'] },
    },
    trade: { standard: 4 },
    origin: 'viral',
  },
  'medicated-wrap': {
    kind: 'disposable',
    pages: '42, 48',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 3 },
      labor: 2,
      requires: { ...CLINIC, utilities: ['water'] },
    },
    trade: { standard: 6 },
    origin: 'viral',
  },
  inoculation: {
    kind: 'disposable',
    pages: '42, 48',
    grades: STANDARD,
    slots: 1,
    life: 'used-up',
    build: {
      kind: 'priced',
      hardware: { standard: 3 },
      labor: 5,
      requires: { ...CLINIC, utilities: ['water'] },
    },
    origin: 'viral',
  },
  'warding-stones': {
    kind: 'disposable',
    pages: '42, 48',
    grades: STANDARD,
    slots: null,
    life: 'used-up',
    build: { kind: 'priced', hardware: { standard: 2 }, labor: 2, requires: LIBRARY },
    origin: 'magic',
  },

  // Rare base upgrades, installed in a facility (pp. 43, 49).
  'gas-grill': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 8 },
    installs: { facility: 'kitchen', countsAs: 'gas-range' },
  },
  fertilizer: {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 6 },
    installs: { facility: 'garden', countsAs: 'fertilizer' },
  },
  'battery-spotlight': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 4 },
    // Battery-powered: the Spotlight it counts as, without the Power (pg. 49).
    installs: { facility: 'watchtower', countsAs: 'spotlight', unpowered: true },
  },
  'flat-pack-shelves': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 6 },
    installs: { facility: 'storage-area', countsAs: 'shelving' },
  },
  'video-game-console': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 8 },
    installs: { facility: 'bunk-room', countsAs: 'video-game-console' },
  },
  'sleeping-bags': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 5 },
    installs: { facility: 'bunk-room', countsAs: 'extra-bed' },
  },
  'resistance-bands': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 6 },
    installs: { facility: 'training-room', countsAs: 'weight-room' },
  },
  'portable-generator': {
    kind: 'rare-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 8 },
    installs: { facility: 'utility-station', countsAs: 'generator' },
  },

  // Vehicle upgrades, fitted to one vehicle for good (pp. 43, 49).
  'electric-car-conversion': {
    kind: 'vehicle-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 8 },
    onVehicle: { inventorySlots: -2, noFuel: true, needsPoweredAutoShop: true },
  },
  'car-roof-rack': {
    kind: 'vehicle-upgrade',
    pages: '43, 49',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 6 },
    onVehicle: { inventorySlots: 4 },
  },

  // Rare equipment (pp. 43, 51).
  'riot-shield': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 0,
    life: 'kept',
    trade: { standard: 10 },
  },
  'ultralight-backpack': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    adds: { standard: { inventorySlots: 2 } },
    life: 'kept',
    trade: { standard: 6 },
  },
  'tactical-holster': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 0,
    holdsWithoutSlot: { items: ['pistol', 'revolver'], count: 1 },
    life: 'kept',
    trade: { standard: 6 },
  },
  'night-vision-goggles': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    adds: { standard: { scores: { scout: 1 } } },
    life: 'kept',
    trade: { standard: 8 },
  },
  'paramedic-kit': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    life: 'kept',
    trade: { standard: 8 },
  },
  'scent-masker': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    life: 'kept',
    trade: { standard: 6 },
  },
  'tactical-armor': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 0,
    adds: { standard: { scores: { defense: 1 }, inventorySlots: 1 } },
    life: 'kept',
    trade: { standard: 10 },
  },
  'smoke-grenade': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    life: 'kept',
    trade: { standard: 6 },
  },
  'door-spikes': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    life: 'kept',
    trade: { standard: 6 },
  },
  'grappling-hook': {
    kind: 'rare-equipment',
    pages: '43, 51',
    grades: STANDARD,
    slots: 1,
    life: 'kept',
    trade: { standard: 6 },
  },

  // Rare weapons, standard grade (pp. 43, 50).
  'fully-automatic-rifle': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['long-guns'],
    ranged: true,
    life: 'kept',
    trade: { standard: 11 },
  },
  'pistol-suppressor': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 0,
    attachesTo: ['pistol'],
    life: 'kept',
    trade: { standard: 8 },
  },
  'sawed-off-shotgun': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['long-guns'],
    ranged: true,
    melee: true,
    life: 'kept',
    trade: { standard: 6 },
  },
  'giant-revolver': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['handguns'],
    ranged: true,
    life: 'kept',
    trade: { standard: 8 },
  },
  'halligan-tool': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: MELEE_SKILLS,
    melee: true,
    adds: { standard: { scores: { break: 1 } } },
    bonusesNeedTheSkill: true,
    life: 'kept',
    trade: { standard: 6 },
  },
  'historical-katana': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['blade-weapon'],
    melee: true,
    life: 'kept',
    trade: { standard: 7 },
  },
  bayonet: {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 0,
    attachesTo: ['rifle'],
    life: 'kept',
    trade: { standard: 6 },
  },
  'quick-quiver': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: null,
    life: 'kept',
    trade: { standard: 8 },
  },
  'ultralight-spear': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['heavy-weapon'],
    melee: true,
    life: 'kept',
    trade: { standard: 8 },
  },
  'repeating-crossbow': {
    kind: 'rare-weapon',
    pages: '43, 50',
    grades: STANDARD,
    slots: 1,
    uses: ['archery'],
    ranged: true,
    life: 'kept',
    trade: { standard: 11 },
  },
} as const satisfies Record<string, ItemRules>;

export type ItemId = keyof typeof EQUIPMENT;

export const ITEM_IDS = Object.keys(EQUIPMENT) as readonly ItemId[];

/** The nine weapons every weapon skill hands out a shoddy one of (pp. 9–10, 38–39). */
export const CORE_WEAPONS = [
  'pistol',
  'revolver',
  'rifle',
  'shotgun',
  'bow',
  'crossbow',
  'blunt',
  'bladed',
  'heavy',
] as const satisfies readonly ItemId[];

/**
 * The Rare Item Table (pg. 43): a d10 for the subtable, then a d10 on it. Each
 * entry is an item and its grade, and the price a trader asks for it, which for
 * a Quality Item is its own and not the equipment table's (pp. 21, 43).
 */
export const RARE_ITEM_CATEGORIES = [
  { rolls: [1, 2], subtable: 'rare-upgrade' },
  { rolls: [3, 4, 5], subtable: 'rare-equipment' },
  { rolls: [6, 7], subtable: 'rare-weapon' },
  { rolls: [8, 9, 10], subtable: 'quality-item' },
] as const;

export type RareSubtable = (typeof RARE_ITEM_CATEGORIES)[number]['subtable'];

export interface RareItemEntry {
  readonly item: ItemId;
  readonly grade: PricedGrade;
  readonly price: number;
}

const rare = (item: ItemId, price: number): RareItemEntry => ({ item, grade: 'standard', price });
const quality = (item: ItemId, price: number): RareItemEntry => ({ item, grade: 'quality', price });

/** Each subtable, its entries in d10 order from 1 to 10 (pg. 43). */
export const RARE_ITEM_TABLE = {
  'rare-upgrade': [
    rare('gas-grill', 8),
    rare('fertilizer', 6),
    rare('battery-spotlight', 4),
    rare('flat-pack-shelves', 6),
    rare('video-game-console', 8),
    rare('sleeping-bags', 5),
    rare('resistance-bands', 6),
    rare('portable-generator', 8),
    rare('electric-car-conversion', 8),
    rare('car-roof-rack', 6),
  ],
  'rare-equipment': [
    rare('riot-shield', 10),
    rare('ultralight-backpack', 6),
    rare('tactical-holster', 6),
    rare('night-vision-goggles', 8),
    rare('paramedic-kit', 8),
    rare('scent-masker', 6),
    rare('tactical-armor', 10),
    rare('smoke-grenade', 6),
    rare('door-spikes', 6),
    rare('grappling-hook', 6),
  ],
  'rare-weapon': [
    rare('fully-automatic-rifle', 11),
    rare('pistol-suppressor', 8),
    rare('sawed-off-shotgun', 6),
    rare('giant-revolver', 8),
    rare('halligan-tool', 6),
    rare('historical-katana', 7),
    rare('bayonet', 6),
    rare('quick-quiver', 8),
    rare('ultralight-spear', 8),
    rare('repeating-crossbow', 11),
  ],
  'quality-item': [
    quality('bladed', 7),
    quality('blunt', 6),
    quality('heavy', 8),
    quality('pistol', 8),
    quality('revolver', 8),
    quality('rifle', 9),
    quality('shotgun', 9),
    quality('bow', 7),
    quality('crossbow', 8),
    quality('tool-belt', 6),
  ],
} as const satisfies Record<RareSubtable, readonly RareItemEntry[]>;

/** What two d10s find on the Rare Item Table (pg. 43): the subtable, then the entry. */
export function rareItemFor(subtable: D10Result, entry: D10Result): RareItemEntry {
  // Every d10 result is in one category: `rules.test` holds the table to it.
  const category = RARE_ITEM_CATEGORIES.find((candidate) =>
    (candidate.rolls as readonly number[]).includes(subtable),
  ) as (typeof RARE_ITEM_CATEGORIES)[number];

  return RARE_ITEM_TABLE[category.subtable][entry - 1] as RareItemEntry;
}

/** What a rare item sells back for: its price less two (pp. 21, 37). */
export const RARE_SALE_DISCOUNT = 2;

/** A vehicle's Tier (pg. 53). */
export const VEHICLE_TIERS = [1, 2, 3, 4] as const;

export type VehicleTier = (typeof VEHICLE_TIERS)[number];

/**
 * Each vehicle Tier's slots (pg. 53): Inventory Slots and Passenger Slots, or
 * for Tier 4 a total the owner splits between the two as they choose.
 */
export const VEHICLE_SLOTS = {
  1: { inventory: 2, passengers: 2 },
  2: { inventory: 6, passengers: 4 },
  3: { inventory: 10, passengers: 6 },
  4: { total: 20 },
} as const satisfies Record<
  VehicleTier,
  { readonly inventory: number; readonly passengers: number } | { readonly total: number }
>;

/** The Tier a d10 rolled at Retrieve New Vehicles' setup gives a vehicle (pg. 82). */
export const VEHICLE_TIER_BY_ROLL = {
  1: 1,
  2: 1,
  3: 1,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
  8: 3,
  9: 3,
  10: 4,
} as const satisfies Record<D10Result, VehicleTier>;

/** Fuel a deployed vehicle burns per mission, per Tier (pg. 52). */
export const VEHICLE_FUEL_PER_TIER = 1;

/**
 * The builds a Medical Supply token pays 1 Labor of (pg. 107; R131; Z7-6):
 * bandages, disinfectant, medicated wraps and inoculations.
 */
export const MEDICAL_SUPPLY_BUILDS = [
  'bandages',
  'disinfectant',
  'medicated-wrap',
  'inoculation',
] as const satisfies readonly ItemId[];
