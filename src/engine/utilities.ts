/**
 * Power and Water — two pools with identical mechanics and entirely separate
 * accounting (pg. 20, 67).
 *
 * A point of a utility is assigned to **one facility**, and covers that facility
 * *and all of its upgrades*. So a Watchtower with two Watch Posts and a
 * Spotlight is one point of Power, not four — which is why the assignment is a
 * flag on the slot rather than a count.
 *
 * ## Where the pool comes from, in two halves
 *
 * Some of it is flat: Solar Panels, Rain Collectors, and the Distillery's
 * built-in Utility Station. `flatUtilitiesGenerated` in `base.ts` has that half.
 *
 * The rest is a staffed Utility Station, which produces its staff's Utilities
 * Score **split across the two however the player likes**. That half was typed
 * in until Z3-5, because staffing is the Planning Phase's — it is
 * `utilitiesScore` in `assignments.ts` now, and nobody types anything.
 *
 * **The split is what makes over-assignment interesting.** Flat Power cannot
 * become Water, but a staffed point can be either, so the pools are only
 * separable down to the flat part. A campaign is within its means when the
 * shortfall each pool runs against its own flat generation, added together,
 * fits inside the staffed Score.
 */

import type { Utility } from '../data/facilities';
import { flatUtilitiesGenerated, layoutOf, occupants } from './base';
import { utilitiesScore } from './assignments';
import type { Base, Campaign } from './campaign';
import type { Check, Violation } from './checks';

export type UtilityViolationCode =
  'no-base' | 'no-such-slot' | 'nothing-to-supply' | 'pool-exhausted' | 'not-needed';

export type UtilityViolation = Violation<UtilityViolationCode>;

export type UtilityCheck = Check<UtilityViolationCode>;

export interface UtilityRequest {
  readonly slot: string;
  readonly utility: Utility;
}

/** How many slots currently hold a point of this utility. */
export function assignedCount(base: Base, utility: Utility): number {
  return Object.values(base.slots).filter((state) => state[utility] === true).length;
}

/**
 * How far a pool's assignments exceed what it generates on its own.
 *
 * Zero when the flat generation covers it. Anything above that has to come out
 * of the staffed Score, which both pools draw on.
 */
export function shortfall(base: Base, utility: Utility): number {
  return Math.max(0, assignedCount(base, utility) - flatUtilitiesGenerated(base)[utility]);
}

/**
 * The staffed Score this base's assignments are already spending.
 *
 * The two shortfalls added together, because a staffed point can go to either
 * pool but only to one of them.
 */
export function staffedSpent(base: Base): number {
  return shortfall(base, 'power') + shortfall(base, 'water');
}

/** Everything wrong with putting a point of this utility on this slot. */
export function checkUtility(campaign: Campaign, request: UtilityRequest): UtilityCheck {
  const base = campaign.base;

  if (base === null) {
    return {
      blockers: [{ code: 'no-base', message: 'This community has no base yet.', pages: 54 }],
      warnings: [],
    };
  }

  const slot = layoutOf(base).find((candidate) => candidate.id === request.slot);

  if (slot === undefined) {
    return {
      blockers: [
        { code: 'no-such-slot', message: 'This base has no such Facility Slot.', pages: 54 },
      ],
      warnings: [],
    };
  }

  const occupant = occupants(base).find((candidate) => candidate.slotId === request.slot);

  if (occupant === undefined) {
    return {
      blockers: [
        {
          code: 'nothing-to-supply',
          message: 'Nothing is built in this slot to supply.',
          pages: 67,
        },
      ],
      warnings: [],
    };
  }

  const blockers: UtilityViolation[] = [];
  const warnings: UtilityViolation[] = [];

  // What assigning one more would spend, against what the staff generate.
  const wouldSpend = staffedSpent(withUtility(base, request.slot, request.utility, true));
  const generated = utilitiesScore(campaign);

  if (wouldSpend > generated) {
    blockers.push({
      code: 'pool-exhausted',
      message: `Needs ${String(wouldSpend - generated)} more than this base generates.`,
      pages: 67,
    });
  }

  /*
   * The facility and its upgrades together, because a point covers all of them:
   * a Storage Area wants nothing, but its Refrigeration wants Power.
   *
   * **Three ways to want a utility, not one.** An entry can *require* it and
   * produce nothing at all without it; a production line can be *halved*
   * without it; and a flat line can produce *more* with it. Reading only the
   * first told a player the point "would do no work" on a Kitchen — three lines
   * above that same screen saying "halved for want of a utility" — and on a
   * Garden, where Water takes it from 1 Food to 3.
   *
   * The distinction between requiring and halving is real and stays real
   * (`facilities.ts` insists on it): an unmet *requirement* produces nothing,
   * halving produces less. What they have in common is only that the point is
   * worth spending, which is the one question this warning asks.
   *
   * "Needs nothing" is checked outright rather than smoothed into an empty
   * array: a `?? []` here would be swallowed by `includes`, which answers false
   * for whatever it is handed, leaving nothing able to tell the fallback from a
   * list of junk.
   */
  const wanted = [occupant.facility, ...occupant.upgrades].some((entry) => {
    const needs = entry.requires?.utilities;
    if (needs !== undefined && needs.includes(request.utility)) return true;

    // Narrowed by kind rather than probed for a field: `staffed-split` is the
    // Utility Station, which has neither — its Score *is* the split, so it is
    // never halved and never doubled.
    return (entry.effects.production ?? []).some((line) => {
      if (line.kind === 'flat') return line.withUtility?.utility === request.utility;
      if (line.kind === 'staffed') return line.halvedWithout === request.utility;

      return false;
    });
  });

  if (!wanted) {
    warnings.push({
      code: 'not-needed',
      message: 'Nothing here uses it, so the point would do no work.',
      pages: 67,
    });
  }

  return { blockers, warnings };
}

/** A base with one slot's utility flag set or cleared. */
function withUtility(base: Base, slot: string, utility: Utility, on: boolean): Base {
  const state = { ...base.slots[slot] };

  if (on) {
    state[utility] = true;
  } else {
    delete state[utility];
  }

  return { ...base, slots: { ...base.slots, [slot]: state } };
}

/**
 * The campaign with a point of the utility put on the slot, or taken off it.
 *
 * **Taking one off is never refused.** Every blocker here is a reason not to
 * *spend* a point, and giving one back spends nothing — a check that refused it
 * would strand a base that had somehow over-assigned itself, which is exactly
 * the state a save from a house-ruled campaign can be in.
 *
 * Nothing is deducted anywhere, because a pool is not stored: it is recomputed
 * from the facilities and whoever is staffing them every time it is read.
 * Clearing the assignments each Planning Phase is Z3-6's.
 */
export function withUtilityToggled(campaign: Campaign, request: UtilityRequest): Campaign {
  const base = campaign.base;
  if (base === null) return campaign;

  const on = base.slots[request.slot]?.[request.utility] === true;

  if (on) {
    return { ...campaign, base: withUtility(base, request.slot, request.utility, false) };
  }

  if (checkUtility(campaign, request).blockers.length > 0) return campaign;

  return { ...campaign, base: withUtility(base, request.slot, request.utility, true) };
}
