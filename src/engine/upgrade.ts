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
 * it does instead, and `upgradeOrder` below is what a screen says about it.
 */

import {
  MAX_UPGRADES_PER_FACILITY,
  type Cost,
  type Upgrade,
  type UpgradeId,
} from '../data/facilities';
import { occupantAt, replacedBy, upgradeCost, upgradesRemaining, upgradesUsed } from './base';
import { laborRefusal, occupantAwaiting, queuedUpgradesFor } from './projects';
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
  | 'wrong-slot-kind'
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

/**
 * The clause that says how much of a count is not built yet.
 *
 * Empty when nothing is on order, so the message a player has always seen is
 * the message they still see — the queue is named only when the queue is why
 * they are reading it.
 */
function counting(onOrder: readonly UpgradeId[]): string {
  return onOrder.length === 0 ? '' : ` (${String(onOrder.length)} on order)`;
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

  // The slot as the queue will leave it, not as it stands: an upgrade ordered
  // this Planning Phase is one of the three, takes its `maxPerFacility` place,
  // and spends whatever it replaces. Everything below that counts what is on
  // the facility asks this one (#140).
  const occupant = occupantAwaiting(campaign, request.slot);

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
  const onOrder = queuedUpgradesFor(campaign, request.slot);

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
      message: `Already has ${String(upgradesUsed(occupant))}${counting(onOrder)} of its ${String(MAX_UPGRADES_PER_FACILITY)} upgrades. Rare upgrades do not count.`,
      pages: '49, 54',
    });
  }

  /*
   * The same rule `build.ts` has always checked for facilities, on the same
   * screen, in the same words — and `checkUpgrade` did not read `requires` at
   * all (#146). A Recovery Room went onto an outdoor Medical Clinic and made
   * its 2 Health; Solar Panels and Rain Collectors worked indoors; Shelving
   * raised the Hardware cap outdoors.
   *
   * A warning rather than a refusal, like its counterpart: Z3-6 guides and
   * offers an override, and `working` deliberately gates on utilities alone —
   * silently zeroing a facility a player chose to build would be this app
   * inventing a consequence the book does not print.
   */
  if (upgrade.requires?.slot !== undefined && upgrade.requires.slot !== occupant.kind) {
    warnings.push({
      code: 'wrong-slot-kind',
      message: `Needs an ${upgrade.requires.slot} slot, and this one is ${occupant.kind}.`,
      pages: '72–73',
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
      message: `A facility takes at most ${String(limit)} of this upgrade${counting(onOrder.filter((queued) => queued === upgrade.id))}.`,
      pages: '72–73',
    });
  }

  return { blockers, warnings };
}

/**
 * What ordering this upgrade would cost, and what it would take off
 * (pp. 72–73).
 *
 * The pair together rather than a function each, because they are one
 * question: a Greenhouse a Hardware cheaper than the catalogue says is
 * cheaper *for* the Fence it replaces, and a screen showing one number without
 * the other sentence would be the app taking something off the base without
 * saying so.
 *
 * Nothing on both counts for a slot that holds no such facility or no such
 * upgrade, which a queue outliving a rebuilt slot can ask about.
 *
 * Asked of the slot *the queue will leave*, like `checkUpgrade`: there is one
 * Fence, so the second Greenhouse ordered onto one Garden replaces nothing and
 * costs the catalogue price. It was quoted "3 Hardware · Replaces the Fence"
 * beside the first one saying the same, and charged 6 for two 4-Hardware
 * upgrades (#140).
 */
export function upgradeOrder(
  campaign: Campaign,
  request: UpgradeRequest,
): { readonly cost: Cost; readonly replaces: readonly UpgradeId[] } {
  const occupant = occupantAwaiting(campaign, request.slot);
  if (occupant === undefined) return NOTHING_ORDERED;

  const upgrade = occupant.facility.upgrades.find((candidate) => candidate.id === request.upgrade);
  if (upgrade === undefined) return NOTHING_ORDERED;

  return {
    cost: upgradeCost(occupant, upgrade),
    replaces: replacedBy(occupant, upgrade).map((installed) => installed.id),
  };
}

const NOTHING_ORDERED = { cost: { hardware: 0, labor: 0 }, replaces: [] } as const;
