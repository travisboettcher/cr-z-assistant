/**
 * Derived base values — the arithmetic the base worksheet makes you do by hand.
 *
 * Pure functions over a `Base` plus the rules in `src/data`. **Nothing here is
 * ever stored.** A campaign holds which base was claimed and what the player
 * has done to it; every number below is recomputed from those two, because a
 * cached storage cap is wrong the moment a facility is built or a utility moves.
 *
 * ## Where a slot's contents come from
 *
 * Two places, and deliberately not one: the base's own layout ships built-in
 * facilities, and the save records what the player built. `occupants` is the
 * single place those are resolved together, so every function below reads one
 * shape and no caller has to remember to consult both.
 *
 * ## Which requirements gate an effect, and which do not
 *
 * An entry whose requirements are unmet produces no effect at all (pg. 54).
 * Here that means **Power and Water only**.
 *
 * The book states the Indoor/Outdoor requirement in the same column, but in the
 * book that case cannot arise: an Outdoor facility simply may not be built
 * indoors, so the no-effect clause is about utilities in practice. The only way
 * to reach a mismatched slot in this app is a player deliberately overriding
 * the build (Z2-5), and the rulebook has no opinion on what their house rule
 * does. Silently zeroing a facility they chose to build would be this app
 * inventing a consequence; reporting it as illegal for exactly as long as it is
 * illegal, which is what `legality.ts` already does for survivors, is the
 * answer that stays inside what the rules actually say.
 *
 * Origin and mission requirements are gates on *building* the thing, not
 * conditions on operating it, so they do not appear here either.
 */

import { BASES, maxHeroes as maxHeroesForTier, type BaseSlot } from '../data/bases';
import {
  FACILITIES,
  MAX_UPGRADES_PER_FACILITY,
  type Facility,
  type SlotKind,
  type Upgrade,
  type Utility,
} from '../data/facilities';
import { STORAGE_ABOVE_TIER, STORED_MATERIALS, type StoredMaterial } from '../data/materials';
import type { Base } from './campaign';

/**
 * A facility standing in a slot, with everything needed to work out what it
 * contributes this turn.
 *
 * `builtOnTurn` is `null` for a facility the base came with. Built-ins were
 * never built, so the rule that an upgrade may not go up the same turn as its
 * facility (pg. 54) has nothing to compare against and never blocks one.
 */
export interface Occupant {
  readonly slotId: string;
  readonly kind: SlotKind;
  readonly facility: Facility;
  /** In build order: the base's own upgrades first, then the player's. */
  readonly upgrades: readonly Upgrade[];
  readonly builtOnTurn: number | null;
  /** Whether the base layout locks this slot against further upgrades. */
  readonly upgradable: boolean;
  readonly power: boolean;
  readonly water: boolean;
  /**
   * A flat utility output the layout gives this slot — the Distillery's.
   *
   * Written `| undefined` rather than left off, because this shape is built by
   * a function rather than by hand: under `exactOptionalPropertyTypes` an
   * absent key and an explicit `undefined` are different, and every occupant
   * answers this question even when the answer is "none".
   */
  readonly flatOutput: { readonly output: Utility; readonly amount: number } | undefined;
}

/** The base's slots, in the order its layout lists them. */
export function layoutOf(base: Base): readonly BaseSlot[] {
  return BASES[base.id].slots as readonly BaseSlot[];
}

/**
 * ## The mutants that survive here, and why
 *
 * Per the README: the deliverable is the surviving mutants, not the score, and
 * each gets a test or a written reason. Four survive, all of them for the same
 * reason and all in the same shape — an empty-array fallback (`?? []`, and the
 * non-built-in branch's `shipped`) replaced by an array holding one junk
 * string, or the `kind !== 'flat'` guard removed.
 *
 * They are equivalent because two filters downstream already reject exactly
 * what the mutant injects: `resolveUpgrades` drops any id that is not one of
 * the facility's own upgrades, and `flatUtilitiesGenerated` drops any
 * production that is not a flat Power or Water. A junk upgrade id and a
 * non-flat production are precisely the values those filters exist to discard,
 * so injecting one changes no answer.
 *
 * Both filters are load-bearing rather than defensive: a save may legitimately
 * hold an upgrade recorded against the wrong facility, because the parser
 * accepts that on purpose. Removing either to win three mutants would trade a
 * real behaviour for a number.
 */

/**
 * The upgrades of `facility` named by `ids`, in order, skipping any that
 * belong to a different facility.
 *
 * Skipping rather than throwing, because a save may legitimately hold one: the
 * parser checks that an upgrade *exists* and deliberately not that it belongs
 * where it was put, since Z2-6 lets a player override that. An upgrade on the
 * wrong facility contributes nothing and is reported as illegal; it does not
 * take a screen down mid-campaign.
 */
function resolveUpgrades(facility: Facility, ids: readonly string[]): readonly Upgrade[] {
  return ids
    .map((id) => facility.upgrades.find((upgrade) => upgrade.id === id))
    .filter((upgrade): upgrade is Upgrade => upgrade !== undefined);
}

/**
 * Every slot of the base that has a facility in it, built-in or built.
 *
 * A slot that is empty, or a clearing project nobody has built into yet, has no
 * occupant and no entry — the same reasoning that keeps `Base.slots` partial.
 */
export function occupants(base: Base): readonly Occupant[] {
  const found: Occupant[] = [];

  for (const slot of layoutOf(base)) {
    const state = base.slots[slot.id];
    const built = state?.built;

    // The layout and the save are asked which facility stands here exactly
    // once, and everything that differs between the two answers comes back
    // together. Deciding it field by field further down would mean re-deciding
    // it per field, and `slot.flatOutput` only exists on the built-in branch.
    const source =
      slot.state === 'built-in'
        ? {
            facility: slot.facility,
            shipped: slot.upgrades,
            builtOnTurn: null,
            upgradable: slot.upgradable,
            flatOutput: slot.flatOutput,
          }
        : built !== undefined
          ? {
              facility: built.facility,
              shipped: [],
              builtOnTurn: built.builtOnTurn,
              upgradable: true,
              flatOutput: undefined,
            }
          : undefined;

    if (source === undefined) continue;

    const facility = FACILITIES[source.facility] as Facility;

    found.push({
      slotId: slot.id,
      kind: slot.kind,
      facility,
      upgrades: resolveUpgrades(facility, [...source.shipped, ...(state?.upgrades ?? [])]),
      builtOnTurn: source.builtOnTurn,
      upgradable: source.upgradable,
      power: state?.power === true,
      water: state?.water === true,
      flatOutput: source.flatOutput,
    });
  }

  return found;
}

/**
 * Whether this entry's utility requirements are met where it stands.
 *
 * Indexed rather than branched on which utility it is: `Utility` and the
 * occupant's two flags are named the same thing on purpose, so there is nothing
 * here to get backwards.
 */
function supplied(entry: Facility | Upgrade, occupant: Occupant): boolean {
  return (entry.requires?.utilities ?? []).every((utility) => occupant[utility]);
}

/** The facility and its upgrades, minus everything an unmet utility switches off. */
function working(occupant: Occupant): readonly (Facility | Upgrade)[] {
  return [occupant.facility, ...occupant.upgrades].filter((entry) => supplied(entry, occupant));
}

/**
 * Maximum storage per capped material (pg. 54).
 *
 * `Tier + 3`, plus every facility and upgrade that raises it — and only those
 * whose utilities are supplied, which is why the Greasy Spoon's built-in
 * Refrigeration takes its Food cap from 6 to 8 only while the base has Power.
 * The book's own roster prints both numbers.
 */
export function storageCaps(base: Base): Record<StoredMaterial, number> {
  const caps = Object.fromEntries(
    STORED_MATERIALS.map((material) => [material, BASES[base.id].tier + STORAGE_ABOVE_TIER]),
  ) as Record<StoredMaterial, number>;

  for (const occupant of occupants(base)) {
    for (const entry of working(occupant)) {
      for (const material of STORED_MATERIALS) {
        caps[material] += entry.effects.storage?.[material] ?? 0;
      }
    }
  }

  return caps;
}

/**
 * Beds in the community, which the Assign Beds step counts (pg. 23).
 *
 * The Hydroelectric Dam's White Noise gives every **indoor Bunk Room** one
 * more, so the special is applied per occupant rather than as a lump: the Dam
 * ships no bunk rooms of its own, and which of its indoor slots hold one is
 * something the player decides later.
 */
export function beds(base: Base): number {
  const whiteNoise = BASES[base.id].specials.find((special) => special.id === 'white-noise');

  let total = 0;

  for (const occupant of occupants(base)) {
    for (const entry of working(occupant)) {
      total += entry.effects.beds ?? 0;
    }

    if (
      whiteNoise !== undefined &&
      occupant.kind === 'indoor' &&
      occupant.facility.id === 'bunk-room'
    ) {
      total += whiteNoise.bedsPerIndoorBunkRoom;
    }
  }

  return total;
}

/**
 * What the base itself adds to or takes off Siege Threat each turn (pg. 23).
 *
 * Negative reduces it. **Only the base's own flat contribution**: a staffed
 * Watchtower subtracts its staff's best Score, and the staffed facility count
 * adds, and both of those need the Planning Phase's assignments. Phase 3 sums
 * this with those; computing a "total" here would be a number that is wrong in
 * every campaign that has staffed anything.
 */
export function siegeThreatFromBase(base: Base): number {
  let total = 0;

  for (const special of BASES[base.id].specials) {
    if (special.id === 'curtain-wall') total += special.siegeThreat.perTurn ?? 0;
  }

  for (const occupant of occupants(base)) {
    for (const entry of working(occupant)) {
      total += entry.effects.siegeThreat?.perTurn ?? 0;
    }
  }

  return total;
}

/**
 * Power and Water the base generates without anyone working for it.
 *
 * Solar Panels, Rain Collectors, and the Distillery's built-in Utility Station,
 * which produces a flat 2 Water because it stands in an Indoor slot where the
 * Rain Collectors it represents could not legally be named (pg. 61).
 *
 * **Not the whole pool.** A staffed Utility Station adds its staff's Utilities
 * Score, split across the two however the player likes, and staffing is Phase
 * 3's. Z2-8 adds that half; this is the part that is knowable now, and it is
 * named for what it is rather than pretending to be a total.
 */
export function flatUtilitiesGenerated(base: Base): Record<Utility, number> {
  const generated: Record<Utility, number> = { power: 0, water: 0 };

  for (const occupant of occupants(base)) {
    if (occupant.flatOutput !== undefined) {
      generated[occupant.flatOutput.output] += occupant.flatOutput.amount;
    }

    for (const entry of working(occupant)) {
      for (const production of entry.effects.production ?? []) {
        if (production.kind !== 'flat') continue;
        if (production.output !== 'power' && production.output !== 'water') continue;

        generated[production.output] += production.amount;
      }
    }
  }

  return generated;
}

/**
 * How many of a facility's three upgrade slots are spoken for (pg. 54).
 *
 * Rare base upgrades are exempt (pg. 49), so this filters rather than taking a
 * length — the rule needs that shape whether or not any rare upgrade exists
 * yet to exercise it. Repeats count separately: three Extra Beds are three.
 */
export function upgradesUsed(occupant: Occupant): number {
  return occupant.upgrades.filter((upgrade) => upgrade.rare !== true).length;
}

/**
 * How many more upgrades a facility may take.
 *
 * Zero for a built-in the base locks, whatever the count says — the Summer
 * Camp's bunk rooms arrive with two Extra Beds and take nothing further.
 */
export function upgradesRemaining(occupant: Occupant): number {
  if (!occupant.upgradable) return 0;

  return Math.max(0, MAX_UPGRADES_PER_FACILITY - upgradesUsed(occupant));
}

/**
 * How many Hero-Tier survivors this base allows (pg. 54).
 *
 * A community over the cap after moving into a smaller base loses a Hero of the
 * player's choice, which is a roster consequence and Phase 3's; this is the
 * number Z2-5 reports a violation against.
 */
export function maxHeroes(base: Base): number {
  return maxHeroesForTier(BASES[base.id].tier);
}
