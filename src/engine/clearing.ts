/**
 * Clearing the rubble out of a slot — the one verb with nothing to choose.
 *
 * A clearing project is a small Labor project that produces no facility: it
 * costs Labor, sometimes gives something back, and turns one slot state into
 * another (pg. 54). It is the third state a Facility Slot can be in, and the
 * only one the player can leave.
 *
 * **Clearing is recorded on the base.** "This slot has been cleared" cannot be
 * recovered from anything else in the campaign — no amount of arithmetic over
 * the roster, the materials or the turn says whether someone spent two Labor on
 * a chicken coop three turns ago — so it is a primitive fact and it persists.
 *
 * Blockers and warnings mean what `checks.ts` says. **This verb has no
 * warnings**, and that is a finding rather than an omission: every way a
 * clearing project can fail is the app having nothing to do — the slot holds no
 * rubble, the rubble is already gone, the Labor is not there. None of them is a
 * rule a table might play differently, so none of them is overridable.
 */

import { MATERIALS, type Material } from '../data/materials';
import { layoutOf } from './base';
import { laborPool } from './assignments';
import type { Check, Violation } from './checks';
import type { Campaign } from './campaign';

export type ClearingViolationCode =
  'no-base' | 'no-such-slot' | 'nothing-to-clear' | 'already-cleared' | 'not-enough-labor';

export type ClearingViolation = Violation<ClearingViolationCode>;

export type ClearingCheck = Check<ClearingViolationCode>;

export interface ClearingRequest {
  readonly slot: string;
  /** Labor available this turn, entered by hand — see `build.ts`. */
}

/** What clearing this slot costs and gives, or undefined where there is no project. */
export function clearingProject(campaign: Campaign, slot: string) {
  if (campaign.base === null) return undefined;

  const found = layoutOf(campaign.base).find((candidate) => candidate.id === slot);

  return found?.state === 'clearing-project' ? found : undefined;
}

/** Everything wrong with clearing this slot, or two empty lists. */
export function checkClearing(campaign: Campaign, request: ClearingRequest): ClearingCheck {
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

  if (slot.state !== 'clearing-project') {
    return {
      blockers: [
        {
          code: 'nothing-to-clear',
          message: 'This slot has nothing blocking it.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  if (base.slots[request.slot]?.cleared === true) {
    return {
      blockers: [
        { code: 'already-cleared', message: 'This slot has already been cleared.', pages: 54 },
      ],
      warnings: [],
    };
  }

  const available = laborPool(campaign);

  if (available < slot.labor) {
    return {
      blockers: [
        {
          code: 'not-enough-labor',
          message: `Costs ${String(slot.labor)} Labor and ${String(available)} is available.`,
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  return { blockers: [], warnings: [] };
}

/**
 * The campaign with the slot cleared and whatever the project gave back added.
 *
 * **The equipment a project yields is not added**, and the screen says so. The
 * Outdoor Sports Shop's Inventory slot gives four standard weapons, and Phase 5
 * owns the item catalogue — there is no Inventory to put them in, and inventing
 * an item id now would be designing that catalogue from the wrong end. The
 * materials it can honour, it honours.
 *
 * No storage cap is applied to what arrives, for the reason a hand-entered
 * material count is not capped either: Check Storage is a Management Phase step
 * (pg. 23) and over-storage has consequences this app does not model.
 */
export function withSlotCleared(campaign: Campaign, request: ClearingRequest): Campaign {
  // Two narrowings that `checkClearing` below already covers, kept because they
  // are what give `base` and `project` their types for the work that follows.
  // Mutants that remove either survive for that reason — type guards standing
  // in front of a check that already rejects the value, the equivalent-mutant
  // shape the README describes. `build.ts` and `upgrade.ts` have the same.
  const base = campaign.base;
  if (base === null) return campaign;

  const project = clearingProject(campaign, request.slot);
  if (project === undefined) return campaign;

  if (checkClearing(campaign, request).blockers.length > 0) return campaign;

  const gained = { ...campaign.materials };
  for (const material of MATERIALS) {
    // `yields` is optional on the type and present on all three projects the
    // roster has, so the guard is unexercised by data rather than unnecessary:
    // a project that gives nothing back is a shape the book allows.
    gained[material] += project.yields?.materials?.[material] ?? 0;
  }

  return {
    ...campaign,
    materials: gained,
    base: {
      ...base,
      slots: {
        ...base.slots,
        [request.slot]: { ...base.slots[request.slot], cleared: true },
      },
    },
  };
}

/** The materials a project gives back, as pairs, for a screen to render. */
export function clearingYield(
  campaign: Campaign,
  slot: string,
): readonly (readonly [Material, number])[] {
  const project = clearingProject(campaign, slot);
  if (project === undefined) return [];

  return MATERIALS.map(
    (material) => [material, project.yields?.materials?.[material] ?? 0] as const,
  ).filter(([, count]) => count > 0);
}
