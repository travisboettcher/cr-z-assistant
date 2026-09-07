/**
 * Adding an upgrade to a facility — three rules that interact.
 *
 * A cap of three per facility, an exemption for rare base upgrades, and a
 * timing constraint: an upgrade may not be built the same turn as its facility
 * (pg. 54, 49). This is the only place in Phase 2 where the turn number is
 * load-bearing, and the reason `builtOnTurn` is stored at all.
 *
 * Blockers and warnings mean what `checks.ts` says. The split here is worth
 * stating because most of it lands on one side:
 *
 * - **Blockers** are the cases where the app has nothing to do — no facility in
 *   the slot, an upgrade that belongs to a different facility, a cost the
 *   community cannot pay. An upgrade filed against the wrong facility is not a
 *   house rule the app can honour: `occupants` drops it, so it would sit in the
 *   save contributing nothing.
 * - **Warnings** are the three rules themselves — the cap, the same-turn
 *   constraint, and a built-in the base locks. Each is a rule a player may
 *   decide their table plays differently, and each keeps reporting for as long
 *   as it stands.
 */

import { MAX_UPGRADES_PER_FACILITY, type Upgrade, type UpgradeId } from '../data/facilities';
import { occupants, upgradesRemaining, upgradesUsed, type Occupant } from './base';
import type { Check, Violation } from './checks';
import type { Campaign } from './campaign';

export type UpgradeViolationCode =
  | 'no-base'
  | 'nothing-to-upgrade'
  | 'not-this-facility'
  | 'not-enough-hardware'
  | 'not-enough-labor'
  | 'facility-locked'
  | 'built-this-turn'
  | 'cap-reached'
  | 'one-per-facility'
  | 'excluded-by-another';

export type UpgradeViolation = Violation<UpgradeViolationCode>;

export type UpgradeCheck = Check<UpgradeViolationCode>;

export interface UpgradeRequest {
  readonly slot: string;
  readonly upgrade: UpgradeId;
  /** Labor available this turn, entered by hand — see `build.ts`. */
  readonly labor: number;
}

/** The occupant of a slot, or undefined when nothing stands there. */
function occupantAt(campaign: Campaign, slot: string): Occupant | undefined {
  if (campaign.base === null) return undefined;

  return occupants(campaign.base).find((occupant) => occupant.slotId === slot);
}

/**
 * The upgrades this slot's facility offers, or an empty list.
 *
 * Every one of them, including those already installed: repeats are legal and
 * count separately against the cap, so three Extra Beds are three upgrades and
 * the picker has no business hiding the second one.
 */
export function upgradesFor(campaign: Campaign, slot: string): readonly Upgrade[] {
  return occupantAt(campaign, slot)?.facility.upgrades ?? [];
}

/** Everything wrong with adding this upgrade, or two empty lists. */
export function checkUpgrade(campaign: Campaign, request: UpgradeRequest): UpgradeCheck {
  const blockers: UpgradeViolation[] = [];
  const warnings: UpgradeViolation[] = [];

  if (campaign.base === null) {
    return {
      blockers: [{ code: 'no-base', message: 'This community has no base yet.', pages: 54 }],
      warnings: [],
    };
  }

  const occupant = occupantAt(campaign, request.slot);

  if (occupant === undefined) {
    return {
      blockers: [
        {
          code: 'nothing-to-upgrade',
          message: 'Nothing is built in this slot to upgrade.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  const upgrade = occupant.facility.upgrades.find((candidate) => candidate.id === request.upgrade);

  if (upgrade === undefined) {
    return {
      blockers: [
        {
          code: 'not-this-facility',
          message: 'This upgrade belongs to a different facility.',
          pages: '72–73',
        },
      ],
      warnings: [],
    };
  }

  if (campaign.materials.hardware < upgrade.cost.hardware) {
    blockers.push({
      code: 'not-enough-hardware',
      message: `Costs ${String(upgrade.cost.hardware)} Hardware and the community has ${String(campaign.materials.hardware)}.`,
      pages: '72–73',
    });
  }

  if (request.labor < upgrade.cost.labor) {
    blockers.push({
      code: 'not-enough-labor',
      message: `Costs ${String(upgrade.cost.labor)} Labor and ${String(request.labor)} is available.`,
      pages: '72–73',
    });
  }

  if (!occupant.upgradable) {
    warnings.push({
      code: 'facility-locked',
      message: 'This facility came with the base and takes no further upgrades.',
      pages: 54,
    });
  } else if (upgrade.rare !== true && upgradesRemaining(occupant) === 0) {
    // Checked only when the base has not locked the facility outright, so a
    // locked built-in reports the reason it is locked rather than a cap it was
    // never going to reach.
    warnings.push({
      code: 'cap-reached',
      message: `Already has ${String(upgradesUsed(occupant))} of its ${String(MAX_UPGRADES_PER_FACILITY)} upgrades. Rare upgrades do not count.`,
      pages: '49, 54',
    });
  }

  if (occupant.builtOnTurn === campaign.turn) {
    warnings.push({
      code: 'built-this-turn',
      message: 'This facility went up this turn, and an upgrade waits for the next one.',
      pages: 54,
    });
  }

  const already = occupant.upgrades.filter((installed) => installed.id === upgrade.id).length;
  // No limit is an unreachable one rather than a missing one, so there is no
  // `!== undefined` guard standing in front of a comparison that would be false
  // against `undefined` anyway.
  const limit = upgrade.constraints?.maxPerFacility ?? Number.POSITIVE_INFINITY;

  if (already >= limit) {
    warnings.push({
      code: 'one-per-facility',
      message: `A facility takes at most ${String(limit)} of this upgrade.`,
      pages: '72–73',
    });
  }

  const excludes = upgrade.constraints?.excludes;
  const excluded =
    excludes === undefined
      ? []
      : excludes.filter((other) => occupant.upgrades.some((installed) => installed.id === other));

  if (excluded.length > 0) {
    warnings.push({
      code: 'excluded-by-another',
      message: 'This upgrade cannot sit alongside one the facility already has.',
      pages: '72–73',
    });
  }

  return { blockers, warnings };
}

/**
 * The campaign with the upgrade added and its Hardware spent.
 *
 * Appended to the slot's own list rather than replacing anything: repeats are
 * legal, and the base's shipped upgrades live in the layout and are not the
 * player's to edit. Returns the campaign unchanged when anything blocks it,
 * the same way `withFacilityBuilt` and the advancement purchases do.
 */
export function withUpgradeBuilt(campaign: Campaign, request: UpgradeRequest): Campaign {
  // Redundant with `checkUpgrade`, and kept because it is what narrows `base`
  // for the spread below. A mutant that removes it survives for that reason: a
  // type guard in front of a check that already rejects the value, which is the
  // equivalent-mutant shape the README describes. `build.ts` has the same one.
  const base = campaign.base;
  if (base === null) return campaign;

  // Resolved before the blockers are consulted rather than after, so this is
  // the only lookup and the only narrowing. Doing it the other way round left
  // an unreachable second copy of three of `checkUpgrade`'s own refusals.
  const occupant = occupantAt(campaign, request.slot);
  const upgrade = occupant?.facility.upgrades.find((candidate) => candidate.id === request.upgrade);
  // Narrowing again, and equivalent again: `checkUpgrade` blocks every case
  // that lands here — an empty slot, an upgrade of another facility — so
  // removing this changes no answer. It stays because `upgrade.cost` below
  // needs it, and the reorder above is what made the *lookup* itself testable.
  if (upgrade === undefined) return campaign;

  if (checkUpgrade(campaign, request).blockers.length > 0) return campaign;

  const state = base.slots[request.slot];

  return {
    ...campaign,
    materials: {
      ...campaign.materials,
      hardware: campaign.materials.hardware - upgrade.cost.hardware,
    },
    base: {
      ...base,
      slots: {
        ...base.slots,
        [request.slot]: {
          ...state,
          upgrades: [...(state?.upgrades ?? []), request.upgrade],
        },
      },
    },
  };
}
