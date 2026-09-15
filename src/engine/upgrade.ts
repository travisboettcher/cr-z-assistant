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
 *
 * ## One warning that was a wrong statement
 *
 * An upgrade excluding one already installed used to warn that it "cannot sit
 * alongside one the facility already has", which is not what the book says. It
 * prices *replacing* a Fence with a Greenhouse a Hardware cheaper (pp. 72–73), so
 * ordering one onto the other is the ordinary way to do it and not a rule the
 * table is playing past. `replacedBy` and `upgradeCost` in `base.ts` are what
 * it does instead, and `upgradesReplaced` below is what a screen says about it.
 */

import {
  MAX_UPGRADES_PER_FACILITY,
  type Cost,
  type Upgrade,
  type UpgradeId,
} from '../data/facilities';
import { occupantAt, replacedBy, upgradeCost, upgradesRemaining, upgradesUsed } from './base';
import { laborRefusal } from './projects';
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
  | 'one-per-facility';

export type UpgradeViolation = Violation<UpgradeViolationCode>;

export type UpgradeCheck = Check<UpgradeViolationCode>;

export interface UpgradeRequest {
  readonly slot: string;
  readonly upgrade: UpgradeId;
  /** Labor available this turn, entered by hand — see `build.ts`. */
}

/** The occupant of a slot, or undefined when nothing stands there. */
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

  // What it costs *here*, which is not always the catalogue price: an upgrade
  // that replaces one already installed is discounted for it (pp. 72–73).
  const cost = upgradeCost(occupant, upgrade);

  if (campaign.materials.hardware < cost.hardware) {
    blockers.push({
      code: 'not-enough-hardware',
      message: `Costs ${String(cost.hardware)} Hardware and the community has ${String(campaign.materials.hardware)}.`,
      pages: '72–73',
    });
  }

  const labor = laborRefusal(campaign, cost.labor, '72–73');
  if (labor !== undefined) blockers.push(labor);

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

  return { blockers, warnings };
}

/**
 * What ordering this upgrade would take off the facility (pp. 72–73).
 *
 * For the screen that shows the cost, because a Greenhouse a Hardware cheaper
 * than the catalogue says needs the sentence that explains it — and because a
 * Fence quietly disappearing a turn later would be the app doing something it
 * never said it would.
 */
export function upgradesReplaced(
  campaign: Campaign,
  request: UpgradeRequest,
): readonly UpgradeId[] {
  const occupant = occupantAt(campaign, request.slot);
  const upgrade = occupant?.facility.upgrades.find((candidate) => candidate.id === request.upgrade);

  if (occupant === undefined || upgrade === undefined) return [];

  return replacedBy(occupant, upgrade).map((installed) => installed.id);
}

/** What this upgrade costs on this slot, discount and all — for the same screen. */
export function costOfUpgrade(campaign: Campaign, request: UpgradeRequest): Cost {
  const occupant = occupantAt(campaign, request.slot);
  const upgrade = occupant?.facility.upgrades.find((candidate) => candidate.id === request.upgrade);

  if (occupant === undefined || upgrade === undefined) return { hardware: 0, labor: 0 };

  return upgradeCost(occupant, upgrade);
}
