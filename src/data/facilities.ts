/**
 * Facilities and their upgrades — rules as data (pg. 72–73).
 *
 * Transcribed from the facility and upgrade table of the Modiphius edition
 * (see `docs/rulebook-edition.md`) on 2026-09-06. Every entry is a cost, a
 * requirement or a structured effect; **no rule prose ships** — what a facility
 * *is* stays in the book, and the app cites the page.
 *
 * Display names are not here, for the same reason `skillLabels.ts` lives in
 * `src/ui`: naming a thing for a screen is the UI's job, and this directory
 * stays structural. `bunk-room` is an identifier.
 *
 * Three rules hold across the whole table and are therefore constants and
 * comments rather than a repeated field:
 *
 * - **Upgrades never require their own staff**, even when their facility does
 *   (pg. 54). `extraStaff` widens a facility's staffing; it never demands any.
 * - **Upgrades that produce materials produce them even when the facility is
 *   unstaffed** (pg. 54). So a flat `production` entry on an upgrade does not
 *   depend on the facility being worked.
 * - **A facility or upgrade whose requirements are unmet produces no effect at
 *   all** (pg. 54) — not a reduced one. Halving is a separate, per-entry rule
 *   and is spelled `halvedWithout`; the two are not the same rule and must not
 *   be collapsed into one field.
 */

import type { Material, StoredMaterial } from './materials';
import type { CampaignOrigin } from './origins';
import type { Skill, Stat } from './skills';

/** A Facility Slot is Indoor or Outdoor, and so is a requirement for one (pg. 54). */
export const SLOT_KINDS = ['indoor', 'outdoor'] as const;

export type SlotKind = (typeof SLOT_KINDS)[number];

/** Power and Water are tracked as separate pools (pg. 20, 67). */
export const UTILITIES = ['power', 'water'] as const;

export type Utility = (typeof UTILITIES)[number];

/** What a facility or upgrade costs to build (pg. 72–73). */
export interface Cost {
  readonly hardware: number;
  readonly labor: number;
}

/**
 * What a facility or upgrade needs.
 *
 * Build-time conditions (the slot) and operating conditions (the utilities) sit
 * in one shape because the book states them in one column, and because the
 * consequence of an unmet requirement is the same either way: no effect at all.
 */
export interface Requirements {
  /** The slot this must be built in. Absent means either kind will do. */
  readonly slot?: SlotKind;
  /** Utilities that must be supplied this turn for any effect to apply. */
  readonly utilities?: readonly Utility[];
  /** Only available to a campaign running this origin (pg. 122–133). */
  readonly origin?: CampaignOrigin;
  /** Unlocked by a mission rather than bought outright — Phase 4 owns which. */
  readonly mission?: true;
}

/** Anything a facility can generate in a turn. */
export type Produced = Material | 'health' | 'xp' | Utility;

/**
 * How much of something a facility or upgrade generates per campaign turn.
 *
 * A number in the book's Effect column is flat; a skill name means the facility
 * must be staffed and produces the staff's Score in that skill (pg. 54).
 */
export type Production =
  | {
      readonly kind: 'flat';
      readonly output: Produced;
      /** Negative where an upgrade costs its facility output — the Herb Plot. */
      readonly amount: number;
      /** A different amount when this utility is supplied — the Garden. */
      readonly withUtility?: { readonly utility: Utility; readonly amount: number };
      /** XP that may only be spent on skills governed by this stat. */
      readonly restrictedToStat?: Stat;
    }
  | {
      readonly kind: 'staffed';
      readonly output: Produced;
      readonly skill: Skill;
      /** Output halves, rounding up, without this utility (pg. 72–73). */
      readonly halvedWithout?: Utility;
    }
  | {
      /** The Utility Station: the staff's Utilities Score, split across these however the player likes. */
      readonly kind: 'staffed-split';
      readonly outputs: readonly Utility[];
      readonly skill: Skill;
    };

/** Materials traded for other materials at the player's option (pg. 72–73). */
export interface Exchange {
  readonly spend: Partial<Record<Material, number>>;
  readonly gain: Partial<Record<Produced, number>>;
  /** Cap per campaign turn, where the book states one. */
  readonly maxPerTurn?: number;
}

/** How a facility or upgrade changes Siege Threat (pg. 73). */
export interface SiegeThreatEffect {
  /** Flat change each turn. Negative reduces it. */
  readonly perTurn?: number;
  /** Reduced by the staff's best Score among these skills — the Watchtower. */
  readonly reducedByBestOf?: readonly Skill[];
}

/**
 * What an entry does, as structured fields.
 *
 * Every field is optional and every field is a number, an id or a small record.
 * If something here needs a sentence to express, it is rule text and belongs in
 * the book — the entry gets a page citation instead.
 *
 * Fields marked with a later phase are recorded now because the table states
 * them and re-reading the table later is the expensive part. Nothing in Phase 2
 * reads them.
 */
export interface Effects {
  /** Beds, which the Assign Beds step counts (pg. 23). */
  readonly beds?: number;
  /** Added to the base's maximum storage, per material (pg. 54). */
  readonly storage?: Partial<Record<StoredMaterial, number>>;
  readonly siegeThreat?: SiegeThreatEffect;
  readonly production?: readonly Production[];
  readonly exchange?: readonly Exchange[];
  /** Extra staff this facility may take, whose Scores are summed (pg. 73). */
  readonly extraStaff?: number;
  /** Health restored per turn regardless of staffing — the Recovery Room. */
  readonly worksUnstaffed?: true;
  /** Required to manufacture some equipment. Phase 5 owns which. */
  readonly gatesEquipment?: true;
  /** Vehicles kept from breaking down on a mission, per copy (pg. 73). Phase 5. */
  readonly protectsVehicles?: number;
  /** Turned survivors kept from biting, per copy (pg. 73). Phase 7. */
  readonly preventsBiting?: number;
  /** Madness removed in Rest and Healing, with and without Power (pg. 72). Phase 7. */
  readonly madnessRecovery?: { readonly base: number; readonly withPower: number };
  /** Per zombie held in Containment (pg. 72). Phase 7. */
  readonly perHeldZombie?: {
    readonly infectionRemoved: number;
    readonly siegeThreat: number;
  };
  /** Learning a spell: the XP it costs and the Humanity it requires (pg. 72). Phase 7. */
  readonly spellLearning?: { readonly xpCost: number; readonly maxHumanity: number };
  /** The Garden keeps producing in cold weather — the Greenhouse (pg. 72). Phase 8. */
  readonly ignoresColdWeather?: true;
}

/** Limits on how many of an upgrade a facility may hold, beyond the cap of three. */
export interface UpgradeConstraints {
  /** At most this many on one facility — the Fence and the Greenhouse. */
  readonly maxPerFacility?: number;
  /** Cannot coexist with these upgrades on the same facility. */
  readonly excludes?: readonly UpgradeId[];
  /** Hardware taken off the cost when it replaces an upgrade it excludes. */
  readonly replacementDiscount?: number;
}

export interface Upgrade {
  readonly id: UpgradeId;
  readonly cost: Cost;
  readonly requires?: Requirements;
  readonly effects: Effects;
  readonly constraints?: UpgradeConstraints;
  /**
   * Rare base upgrades do not count against the three-upgrade cap (pg. 49).
   *
   * Every upgrade in this table is an ordinary one; the flag exists because the
   * cap is computed by filtering it, and a filter over a field nothing sets is
   * still the correct shape for the rule. Rare upgrades arrive with the Rare
   * Item Table in Phase 5.
   */
  readonly rare?: true;
}

export interface Facility {
  readonly id: FacilityId;
  readonly cost: Cost;
  readonly requires?: Requirements;
  /** Whether a survivor may be assigned to work it (pg. 54). */
  readonly staffed: boolean;
  readonly effects: Effects;
  readonly upgrades: readonly Upgrade[];
}

/**
 * At most three upgrades on one facility at a time (pg. 54).
 *
 * Repeats count: three Extra Beds is three upgrades. Rare base upgrades are
 * exempt (pg. 49), which is why the count filters rather than taking a length.
 */
export const MAX_UPGRADES_PER_FACILITY = 3;

/**
 * The facility table (pg. 72–73), keyed by id, upgrades nested under their
 * facility.
 *
 * Nested rather than a flat list with a parent id, so "an upgrade with no
 * facility" is unrepresentable rather than merely invalid — the same reasoning
 * that makes `SKILL_STATS` the single source for both the skill list and its
 * governing stat.
 */
export const FACILITIES = {
  'bunk-room': {
    id: 'bunk-room',
    cost: { hardware: 3, labor: 2 },
    requires: { slot: 'indoor' },
    staffed: false,
    effects: { beds: 2 },
    upgrades: [
      {
        id: 'extra-bed',
        cost: { hardware: 2, labor: 1 },
        effects: { beds: 1 },
      },
      {
        id: 'loft',
        cost: { hardware: 2, labor: 1 },
        effects: { storage: { hardware: 1 } },
      },
      {
        id: 'lounge',
        cost: { hardware: 2, labor: 1 },
        requires: { origin: 'cosmic-horror' },
        effects: { madnessRecovery: { base: 2, withPower: 4 } },
      },
    ],
  },

  garden: {
    id: 'garden',
    cost: { hardware: 1, labor: 2 },
    requires: { slot: 'outdoor' },
    staffed: false,
    effects: {
      production: [
        {
          kind: 'flat',
          output: 'food',
          amount: 1,
          withUtility: { utility: 'water', amount: 3 },
        },
      ],
    },
    upgrades: [
      {
        id: 'fence',
        cost: { hardware: 1, labor: 2 },
        effects: { production: [{ kind: 'flat', output: 'food', amount: 1 }] },
        constraints: { maxPerFacility: 1 },
      },
      {
        // Costs the Garden a Food to restore a Health, so the two entries are
        // one upgrade's effect and not a net number — the Garden's own output
        // may already be zero for want of Water.
        //
        // **Confirm against the book:** the table states "max 1 per Garden" for
        // the Fence and the Greenhouse and not for this one, so no constraint
        // is recorded here. A summary of the same chapter lists all three as
        // one-per-Garden. Following the table, which is the more specific of
        // the two, and flagging rather than deciding it silently.
        id: 'herb-plot',
        cost: { hardware: 1, labor: 2 },
        effects: {
          production: [
            { kind: 'flat', output: 'health', amount: 1 },
            { kind: 'flat', output: 'food', amount: -1 },
          ],
        },
      },
      {
        id: 'greenhouse',
        cost: { hardware: 4, labor: 4 },
        effects: {
          production: [{ kind: 'flat', output: 'food', amount: 2 }],
          ignoresColdWeather: true,
        },
        constraints: { maxPerFacility: 1, excludes: ['fence'], replacementDiscount: 1 },
      },
    ],
  },

  kitchen: {
    id: 'kitchen',
    cost: { hardware: 3, labor: 2 },
    staffed: true,
    effects: {
      production: [{ kind: 'staffed', output: 'food', skill: 'rationing', halvedWithout: 'water' }],
    },
    upgrades: [
      {
        id: 'refrigerator',
        cost: { hardware: 2, labor: 2 },
        requires: { utilities: ['power'] },
        effects: {
          production: [{ kind: 'flat', output: 'food', amount: 1 }],
          storage: { food: 1 },
        },
      },
      {
        id: 'gas-range',
        cost: { hardware: 2, labor: 1 },
        effects: {
          production: [{ kind: 'flat', output: 'food', amount: 1 }],
          exchange: [{ spend: { fuel: 2 }, gain: { food: 1 } }],
        },
      },
      {
        id: 'biofuel-lab',
        cost: { hardware: 3, labor: 3 },
        requires: { utilities: ['power', 'water'] },
        effects: {
          production: [{ kind: 'flat', output: 'fuel', amount: 1 }],
          exchange: [{ spend: { food: 2 }, gain: { fuel: 1 } }],
        },
      },
    ],
  },

  'medical-clinic': {
    id: 'medical-clinic',
    cost: { hardware: 3, labor: 2 },
    staffed: true,
    effects: {
      // Health generated here is distributed equally among the survivors
      // assigned to healing (pg. 19) — an allocation rule, and Phase 3's.
      production: [
        { kind: 'staffed', output: 'health', skill: 'medicine', halvedWithout: 'water' },
      ],
    },
    upgrades: [
      {
        id: 'restraints',
        cost: { hardware: 1, labor: 1 },
        effects: { preventsBiting: 1 },
      },
      {
        id: 'med-lab',
        cost: { hardware: 2, labor: 2 },
        requires: { utilities: ['power', 'water'] },
        effects: { extraStaff: 1 },
      },
      {
        id: 'recovery-room',
        cost: { hardware: 2, labor: 2 },
        requires: { slot: 'indoor' },
        effects: {
          production: [{ kind: 'flat', output: 'health', amount: 2 }],
          worksUnstaffed: true,
        },
      },
      {
        id: 'containment',
        cost: { hardware: 4, labor: 2 },
        requires: { origin: 'viral', mission: true },
        effects: { perHeldZombie: { infectionRemoved: 1, siegeThreat: 1 } },
      },
    ],
  },

  'mystic-library': {
    id: 'mystic-library',
    cost: { hardware: 3, labor: 2 },
    requires: { origin: 'magic', slot: 'indoor', mission: true },
    staffed: true,
    effects: { spellLearning: { xpCost: 6, maxHumanity: 3 } },
    upgrades: [
      {
        // **Confirm against the book:** the facility table lists the Study Room
        // under the Mystic Library, adding a staff member to it. The project
        // note's summary of the new-edition facilities describes it as adding a
        // Training Room staff member instead. Recorded where the table puts it;
        // the two readings differ in which facility it belongs to, not in what
        // it does, so moving it later is a one-line edit either way.
        id: 'study-room',
        cost: { hardware: 2, labor: 1 },
        effects: { extraStaff: 1 },
      },
    ],
  },

  'storage-area': {
    id: 'storage-area',
    cost: { hardware: 2, labor: 2 },
    staffed: false,
    effects: { storage: { hardware: 2, food: 2, fuel: 2 } },
    upgrades: [
      {
        id: 'refrigeration',
        cost: { hardware: 2, labor: 1 },
        requires: { slot: 'indoor', utilities: ['power'] },
        effects: { storage: { food: 2 } },
      },
      {
        id: 'fuel-tank',
        cost: { hardware: 2, labor: 1 },
        effects: { storage: { fuel: 2 } },
      },
      {
        id: 'shelving',
        cost: { hardware: 2, labor: 1 },
        requires: { slot: 'indoor' },
        effects: { storage: { hardware: 2 } },
      },
    ],
  },

  'training-room': {
    id: 'training-room',
    cost: { hardware: 3, labor: 2 },
    staffed: true,
    effects: {
      // XP goes only to survivors who are not on the mission team, and no
      // survivor may be given more than two (pg. 12). Both are award rules and
      // belong to Phase 3; recorded here as citations, enforced there.
      production: [{ kind: 'staffed', output: 'xp', skill: 'teaching', halvedWithout: 'power' }],
    },
    upgrades: [
      {
        id: 'weight-room',
        cost: { hardware: 2, labor: 2 },
        effects: {
          production: [{ kind: 'flat', output: 'xp', amount: 2, restrictedToStat: 'strength' }],
        },
      },
      {
        id: 'ropes-course',
        cost: { hardware: 3, labor: 2 },
        effects: {
          production: [{ kind: 'flat', output: 'xp', amount: 2, restrictedToStat: 'dexterity' }],
        },
      },
      {
        id: 'classroom',
        cost: { hardware: 1, labor: 2 },
        effects: {
          production: [{ kind: 'flat', output: 'xp', amount: 2, restrictedToStat: 'intelligence' }],
        },
      },
    ],
  },

  'utility-station': {
    id: 'utility-station',
    cost: { hardware: 3, labor: 3 },
    staffed: true,
    effects: {
      production: [{ kind: 'staffed-split', outputs: ['power', 'water'], skill: 'utilities' }],
    },
    upgrades: [
      {
        id: 'generator',
        cost: { hardware: 3, labor: 2 },
        effects: { exchange: [{ spend: { fuel: 1 }, gain: { power: 1 }, maxPerTurn: 3 }] },
      },
      {
        id: 'well-pump',
        cost: { hardware: 2, labor: 3 },
        effects: { exchange: [{ spend: { fuel: 1 }, gain: { water: 1 }, maxPerTurn: 3 }] },
      },
      {
        id: 'solar-panel',
        cost: { hardware: 3, labor: 2 },
        requires: { slot: 'outdoor' },
        effects: { production: [{ kind: 'flat', output: 'power', amount: 1 }] },
      },
      {
        id: 'rain-collector',
        cost: { hardware: 3, labor: 3 },
        requires: { slot: 'outdoor' },
        effects: { production: [{ kind: 'flat', output: 'water', amount: 1 }] },
      },
    ],
  },

  watchtower: {
    id: 'watchtower',
    cost: { hardware: 3, labor: 2 },
    requires: { slot: 'outdoor' },
    staffed: true,
    effects: {
      siegeThreat: { reducedByBestOf: ['long-guns', 'handguns', 'archery', 'traps'] },
    },
    upgrades: [
      {
        id: 'watch-post',
        cost: { hardware: 3, labor: 2 },
        effects: { extraStaff: 1 },
      },
      {
        id: 'spotlight',
        cost: { hardware: 1, labor: 1 },
        requires: { utilities: ['power'] },
        effects: { siegeThreat: { perTurn: -1 } },
      },
    ],
  },

  workshop: {
    id: 'workshop',
    cost: { hardware: 3, labor: 2 },
    staffed: true,
    effects: {
      production: [
        { kind: 'staffed', output: 'hardware', skill: 'mechanics', halvedWithout: 'power' },
      ],
      gatesEquipment: true,
    },
    upgrades: [
      {
        id: 'metal-shop',
        cost: { hardware: 3, labor: 3 },
        requires: { utilities: ['power'] },
        effects: {
          production: [{ kind: 'flat', output: 'hardware', amount: 1 }],
          gatesEquipment: true,
        },
      },
      {
        // Under the optional Tools of the Trade rules this produces Ammunition
        // instead of Hardware (pg. 169–176). Those rules are out of the
        // delivery plan, so the entry records the core rule only.
        id: 'gunsmith',
        cost: { hardware: 2, labor: 1 },
        requires: { slot: 'indoor' },
        effects: {
          production: [{ kind: 'flat', output: 'hardware', amount: 1 }],
          gatesEquipment: true,
        },
      },
      {
        id: 'auto-shop',
        cost: { hardware: 3, labor: 3 },
        effects: {
          production: [{ kind: 'flat', output: 'fuel', amount: 1 }],
          protectsVehicles: 1,
        },
      },
    ],
  },
} as const satisfies Record<string, Omit<Facility, 'id'> & { id: string }>;

export type FacilityId = keyof typeof FACILITIES;

export const FACILITY_IDS = Object.keys(FACILITIES) as readonly FacilityId[];

/** Every upgrade id in the table, as a union — an upgrade cannot be invented. */
export type UpgradeId =
  | 'extra-bed'
  | 'loft'
  | 'lounge'
  | 'fence'
  | 'herb-plot'
  | 'greenhouse'
  | 'refrigerator'
  | 'gas-range'
  | 'biofuel-lab'
  | 'restraints'
  | 'med-lab'
  | 'recovery-room'
  | 'containment'
  | 'study-room'
  | 'refrigeration'
  | 'fuel-tank'
  | 'shelving'
  | 'weight-room'
  | 'ropes-course'
  | 'classroom'
  | 'generator'
  | 'well-pump'
  | 'solar-panel'
  | 'rain-collector'
  | 'watch-post'
  | 'spotlight'
  | 'metal-shop'
  | 'gunsmith'
  | 'auto-shop';

/** The facility an upgrade belongs to, or undefined if it belongs to none. */
export function facilityOfUpgrade(upgrade: UpgradeId): Facility | undefined {
  return FACILITY_IDS.map((id) => FACILITIES[id] as Facility).find((facility) =>
    facility.upgrades.some((candidate) => candidate.id === upgrade),
  );
}

/** One upgrade of one facility, or undefined if that facility does not have it. */
export function upgradeOf(facility: FacilityId, upgrade: UpgradeId): Upgrade | undefined {
  return (FACILITIES[facility] as Facility).upgrades.find((candidate) => candidate.id === upgrade);
}
