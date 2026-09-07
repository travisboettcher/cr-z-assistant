/**
 * Building a facility into a slot — what it costs, what is wrong with it, and
 * the build itself.
 *
 * The rules half of Z2-5. Everything here is a pure function over a `Campaign`;
 * the screen renders what these return and dispatches, and holds no rule of its
 * own. See `docs/base-slot-interaction.md` for the shape the screen puts around
 * them.
 *
 * **Blockers and warnings are different things**, and keeping them apart is
 * most of this module:
 *
 * - A **blocker** stops the build. The slot is taken, the rubble is still
 *   there, the Hardware or the Labor is not there to spend.
 * - A **warning** is a rule the player may break on purpose — a facility in the
 *   wrong kind of slot, or one gated behind an origin or a mission. Z1-7
 *   established that an override belongs to the player and is never stored, and
 *   this is the same override for the base.
 *
 * **Affordability is a blocker rather than a warning, deliberately.** Overriding
 * it would spend materials the community does not have, and the honest fix for
 * a wrong count is to correct the count. Nothing in the book says what a base
 * with −2 Hardware means and this app should not be the first to say it.
 */

import { FACILITIES, type Facility, type FacilityId } from '../data/facilities';
import type { Campaign } from './campaign';
import { layoutOf, occupants } from './base';

/**
 * Why a build is refused or questioned.
 *
 * The same three fields as `legality.ts`'s survivor `Violation` — a code for
 * logic, a message for a person, and the page so the reader can check the rule
 * rather than take this app's word for it — with its own closed set of codes.
 * Sharing one open union across both would let a survivor violation be returned
 * from here, and vice versa, which the typecheck should be catching rather than
 * permitting.
 */
export type BuildViolationCode =
  | 'no-base'
  | 'no-such-slot'
  | 'slot-occupied'
  | 'slot-not-cleared'
  | 'not-enough-hardware'
  | 'not-enough-labor'
  | 'wrong-slot-kind'
  | 'origin-locked'
  | 'mission-locked';

export interface Violation {
  readonly code: BuildViolationCode;

  /** A sentence for a person at a table, not a rule restated. */
  readonly message: string;

  /** For `PageRef`, so the reader can check the rule itself. */
  readonly pages: number | string;
}

/**
 * What is wrong with a build, split by whether the player may proceed anyway.
 *
 * Two lists rather than one list of flagged entries: the screen treats them
 * completely differently — one disables the button and the other unlocks an
 * override — and a caller that has to filter before it can render is a caller
 * that can forget to.
 */
export interface BuildCheck {
  readonly blockers: readonly Violation[];
  readonly warnings: readonly Violation[];
}

/** What a build needs, beyond a campaign: where, what, and the Labor to hand. */
export interface BuildRequest {
  readonly slot: string;
  readonly facility: FacilityId;
  /**
   * Labor available this turn, entered by hand.
   *
   * The pool comes from the project team (pg. 20) and that is Planning Phase
   * work, so there is nothing on `Campaign` to read it from yet — the same
   * reason Phase 1 let XP be typed in. The *rule* is still enforced: a build
   * that cannot be paid for in Labor is refused.
   */
  readonly labor: number;
}

/** Everything wrong with this build, or two empty lists. */
export function checkBuild(campaign: Campaign, request: BuildRequest): BuildCheck {
  const blockers: Violation[] = [];
  const warnings: Violation[] = [];

  const base = campaign.base;

  if (base === null) {
    return {
      blockers: [
        {
          code: 'no-base',
          message: 'This community has no base to build in yet.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  const slot = layoutOf(base).find((candidate) => candidate.id === request.slot);

  if (slot === undefined) {
    return {
      blockers: [
        {
          code: 'no-such-slot',
          message: 'This base has no such Facility Slot.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  const facility = FACILITIES[request.facility] as Facility;
  const state = base.slots[request.slot];

  if (occupants(base).some((occupant) => occupant.slotId === request.slot)) {
    blockers.push({
      code: 'slot-occupied',
      message: 'Something is already built in this slot, and a built facility is permanent.',
      pages: 54,
    });
  }

  // A clearing project has to be finished before the slot is a slot. Checked
  // against the save rather than the layout, because clearing is what changes.
  if (slot.state === 'clearing-project' && state?.cleared !== true) {
    blockers.push({
      code: 'slot-not-cleared',
      message: `This slot is blocked until a ${String(slot.labor)} Labor project clears it.`,
      pages: 54,
    });
  }

  if (campaign.materials.hardware < facility.cost.hardware) {
    blockers.push({
      code: 'not-enough-hardware',
      message: `Costs ${String(facility.cost.hardware)} Hardware and the community has ${String(campaign.materials.hardware)}.`,
      pages: '72–73',
    });
  }

  if (request.labor < facility.cost.labor) {
    blockers.push({
      code: 'not-enough-labor',
      message: `Costs ${String(facility.cost.labor)} Labor and ${String(request.labor)} is available.`,
      pages: '72–73',
    });
  }

  if (facility.requires?.slot !== undefined && facility.requires.slot !== slot.kind) {
    warnings.push({
      code: 'wrong-slot-kind',
      message: `Needs an ${facility.requires.slot} slot, and this one is ${slot.kind}.`,
      pages: '72–73',
    });
  }

  if (facility.requires?.origin !== undefined && facility.requires.origin !== campaign.origin) {
    warnings.push({
      code: 'origin-locked',
      message: 'Belongs to an apocalypse origin this campaign is not running.',
      pages: '122–133',
    });
  }

  if (facility.requires?.mission === true) {
    // Which mission unlocks it is Phase 4's, so this app cannot yet know
    // whether the player has earned it. Reported as something they may wave
    // through rather than as a refusal, because the app is the one missing
    // information here, not the player.
    warnings.push({
      code: 'mission-locked',
      message: 'Unlocked by a mission, which this version does not track yet.',
      pages: '72–73',
    });
  }

  return { blockers, warnings };
}

/**
 * The campaign with the facility built and its Hardware spent.
 *
 * Returns the campaign **unchanged** when anything blocks the build, the same
 * way the advancement purchases re-run their own price check rather than
 * trusting the caller. Warnings do not stop it: proceeding past one is the
 * player's decision, and by the time this is called they have made it.
 *
 * Labor is not deducted because there is nowhere to deduct it from — the pool
 * is Phase 3's. It is checked, which is the part that is a rule.
 */
export function withFacilityBuilt(campaign: Campaign, request: BuildRequest): Campaign {
  // Redundant with `checkBuild`, which blocks a campaign with no base — and
  // kept anyway, because it is what narrows `base` for the spread below. A
  // mutant that removes it survives for exactly that reason: it is a type guard
  // standing in front of a check that already rejects the value, which is the
  // equivalent-mutant shape the README describes.
  const base = campaign.base;
  if (base === null) return campaign;

  const { blockers } = checkBuild(campaign, request);
  if (blockers.length > 0) return campaign;

  const facility = FACILITIES[request.facility] as Facility;

  return {
    ...campaign,
    materials: {
      ...campaign.materials,
      hardware: campaign.materials.hardware - facility.cost.hardware,
    },
    base: {
      ...base,
      slots: {
        ...base.slots,
        [request.slot]: {
          ...base.slots[request.slot],
          built: { facility: request.facility, builtOnTurn: campaign.turn },
        },
      },
    },
  };
}

/**
 * The facilities worth offering in this campaign, in catalogue order.
 *
 * Origin-gated facilities are filtered out rather than listed and warned about:
 * a campaign not running Magic has no use for the Mystic Library, and an
 * override exists for the app modelling a rule wrong, not for browsing rules
 * from a different game. `checkBuild` still reports the gate, so a save that
 * arrived with one is described rather than silently accepted.
 */
export function buildableFacilities(campaign: Campaign): readonly Facility[] {
  return Object.values(FACILITIES).filter(
    (facility) =>
      (facility as Facility).requires?.origin === undefined ||
      (facility as Facility).requires?.origin === campaign.origin,
  ) as readonly Facility[];
}
