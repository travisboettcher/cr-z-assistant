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
 *
 * ## Why three functions here take an occupant list
 *
 * `beds`, `storageCaps` and `siegeThreatFromBase` are gated by utilities, and
 * whether a slot *has* a utility is not a fact about the base: a point with no
 * generator behind it does not count, and the Hydroelectric Dam supplies
 * everything once the community's combined Utilities Score is high enough. Both
 * need the roster, so both live in `utilities.ts` — which imports this module,
 * so this one cannot ask.
 *
 * So they take the resolved list rather than reading it. `suppliedOccupants` is
 * what every campaign-level caller should pass; `occupants(base)` alone answers
 * the narrower question of what is standing where, which is all the build and
 * layout checks need.
 */

import { BASES, maxHeroes as maxHeroesForTier, type BaseSlot } from '../data/bases';
import {
  FACILITIES,
  MAX_UPGRADES_PER_FACILITY,
  type Cost,
  type Facility,
  type SlotKind,
  type Upgrade,
  type Utility,
} from '../data/facilities';
import { STORAGE_ABOVE_TIER, STORED_MATERIALS, type StoredMaterial } from '../data/materials';
import type { Base, Campaign, Survivor } from './campaign';
import type { Skill } from '../data/skills';
import { skillScore } from './survivor';

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
 * each gets a test or a written reason. Ten survive, in two families.
 *
 * **Five are a fed filter.** An empty-array fallback (`?? []`, and the
 * non-built-in branch's `shipped`) replaced by an array holding one junk
 * string, or the `kind !== 'flat'` guard removed. Three filters downstream
 * already reject exactly what the mutant injects: `resolveUpgrades` drops any
 * id that is not one of the facility's own upgrades, `flatUtilitiesGenerated`
 * drops any production that is not a flat Power or Water, and `replacedBy`
 * keeps only installed upgrades whose id the exclusion list actually names. A
 * junk upgrade id and a non-flat production are precisely the values those
 * filters exist to discard, so injecting one changes no answer.
 *
 * Those filters are load-bearing rather than defensive: a save may
 * legitimately hold an upgrade recorded against the wrong facility, because
 * the parser accepts that on purpose. Removing one to win a mutant would trade
 * a real behaviour for a number.
 *
 * **Four are one early return that cannot change an answer** —
 * `siegeThreatReduction`'s `best.length === 0 || staff.length === 0`. Take the
 * guard away in any of its four forms and the `flatMap` below produces no
 * scores, which `Math.max(...scores, 0)` already answers with the same zero.
 * It stays because reading "nothing reduces it, or nobody is working it" at
 * the top is worth more than the four mutants, and because the alternative —
 * deleting it — would leave the zero looking like arithmetic rather than a
 * rule.
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

/**
 * The facility and its upgrades, minus everything an unmet utility switches off.
 *
 * Exported because production reads it too: what a facility makes and what it
 * stores are switched off by the same rule, and two copies of that rule would
 * be two places for it to drift.
 */
/**
 * What clearing this slot costs and gives, or `undefined` where there is no
 * rubble in it.
 *
 * Lived in `clearing.ts` until Z3-11, which needed the cost of a *queued*
 * clearing project from a module `clearing.ts` itself imports. Here, it is what
 * it always was — a question about the base's layout — and the cycle does not
 * arise.
 */
export function clearingProject(campaign: Campaign, slot: string) {
  if (campaign.base === null) return undefined;

  const found = layoutOf(campaign.base).find((candidate) => candidate.id === slot);

  return found?.state === 'clearing-project' ? found : undefined;
}

/**
 * Whatever is built in one slot, or `undefined` for an empty or blocked one.
 *
 * Lived in `upgrade.ts` until Z3-11 needed the same lookup to decide whether a
 * queued project still has somewhere to land. One "what is in this slot" rather
 * than two.
 */
export function occupantAt(campaign: Campaign, slot: string): Occupant | undefined {
  if (campaign.base === null) return undefined;

  return occupants(campaign.base).find((occupant) => occupant.slotId === slot);
}

export function working(occupant: Occupant): readonly (Facility | Upgrade)[] {
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
export function storageCaps(
  base: Base,
  standing: readonly Occupant[],
): Record<StoredMaterial, number> {
  const caps = Object.fromEntries(
    STORED_MATERIALS.map((material) => [material, BASES[base.id].tier + STORAGE_ABOVE_TIER]),
  ) as Record<StoredMaterial, number>;

  for (const occupant of standing) {
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
export function beds(base: Base, standing: readonly Occupant[]): number {
  const whiteNoise = BASES[base.id].specials.find((special) => special.id === 'white-noise');

  let total = 0;

  for (const occupant of standing) {
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
 * How many survivors this facility takes (pg. 54, 72–73).
 *
 * One, unless an upgrade widens it — the Med Lab, the Study Room and the Watch
 * Post each add one, which is what `extraStaff` was transcribed for. **Zero for
 * a facility that takes no staff at all**: a Bunk Room's two beds are a flat
 * effect with no skill named, so a survivor put in one is an assignment the
 * rules do not contemplate.
 *
 * Read by `staffOf`, so every consumer of a slot's staff gets the cap without
 * asking for it. Nothing read `extraStaff` at all until the September playtest
 * found three survivors on a bare Medical Clinic making +5 Health, and two
 * Medicine-8 staff driving a Rot check target to −4.
 */
export function staffCapacity(occupant: Occupant): number {
  if (!occupant.facility.staffed) return 0;

  // Through `working` rather than `upgrades`, because an upgrade whose
  // requirements are unmet produces no effect at all (pg. 54) — and widening
  // the staffing *is* the Med Lab's effect. A Med Lab without Power and Water
  // is a room nobody can work in, not a second seat.
  return working(occupant).reduce((room, entry) => room + (entry.effects.extraStaff ?? 0), 1);
}

/**
 * What a staffed Watchtower takes off Siege Threat (pg. 73).
 *
 * The best of Long Guns, Handguns, Archery and Traps across its staff — the
 * best *one* Score, not the sum, which is what `reducedByBestOf` spells and why
 * it is a list of skills rather than a number. Zero for an empty slot, which is
 * why the whole facility is worth building and staffing rather than building.
 *
 * Separate from `siegeThreatFromBase` because it needs the Planning Phase's
 * assignments, and that function takes a `Base`. The comment there always said
 * Phase 3 would sum this with the rest; it shipped without doing it, so a
 * staffed Watchtower *raised* Siege Threat by one through the staffed-facility
 * count and subtracted nothing.
 */
export function siegeThreatReduction(
  occupant: Occupant,
  staff: readonly Survivor[],
  penalty: number,
): number {
  const best = watchSkills(occupant);
  if (best.length === 0 || staff.length === 0) return 0;

  const scores = staff.flatMap((survivor) =>
    best.map((skill) => skillScore(survivor, skill, penalty) ?? 0),
  );

  return Math.max(...scores, 0);
}

/**
 * The skills a slot watches with, across everything working in it (pg. 73).
 *
 * Exported because the slot card needs the same list to say whether the person
 * standing in the tower has any of them, and a second copy of "which effects
 * name skills" is how the card and the total came to disagree in the first
 * place (#142).
 */
export function watchSkills(occupant: Occupant): readonly Skill[] {
  return working(occupant).flatMap((entry) => entry.effects.siegeThreat?.reducedByBestOf ?? []);
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
export function siegeThreatFromBase(base: Base, standing: readonly Occupant[]): number {
  let total = 0;

  for (const special of BASES[base.id].specials) {
    if (special.id === 'curtain-wall') total += special.siegeThreat.perTurn ?? 0;
  }

  for (const occupant of standing) {
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
 * The upgrades already on this facility that a new one would replace (pp. 72–73).
 *
 * `excludes` says two upgrades cannot sit on one facility together, and the
 * Greenhouse — the only one that has it — excludes the Fence. That is not a
 * refusal: the book prices *replacing* a Fence with a Greenhouse a Hardware
 * cheaper, which is a rule about what happens when you order one onto the
 * other, not a rule against it. So an order that excludes something installed
 * takes it off, and `upgradeCost` below is the other half of the same
 * sentence.
 *
 * A list rather than one, because the exclusion is a list and nothing caps how
 * many of the excluded upgrade a facility holds — `maxPerFacility` is a
 * warning a table may play past.
 */
export function replacedBy(occupant: Occupant, upgrade: Upgrade): readonly Upgrade[] {
  const excludes = upgrade.constraints?.excludes ?? [];

  return occupant.upgrades.filter((installed) => excludes.includes(installed.id));
}

/**
 * What an upgrade costs on this particular facility (pp. 72–73).
 *
 * The catalogue price, less the replacement discount for each upgrade it takes
 * off — the Greenhouse's one Hardware for the Fence it stands in for. Never
 * below nothing: a discount larger than the price would be the stores paying a
 * community to build, which no rule says and no screen should show.
 *
 * Labor is untouched. The book discounts the materials, not the work.
 */
export function upgradeCost(occupant: Occupant, upgrade: Upgrade): Cost {
  const discount = upgrade.constraints?.replacementDiscount ?? 0;
  const replaced = replacedBy(occupant, upgrade).length;

  return {
    hardware: Math.max(0, upgrade.cost.hardware - discount * replaced),
    labor: upgrade.cost.labor,
  };
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
