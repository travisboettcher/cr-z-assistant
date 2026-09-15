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
import { clearingProject, layoutOf } from './base';
import { laborRefusal } from './projects';
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

  const labor = laborRefusal(campaign, slot.labor, 54);

  if (labor !== undefined) return { blockers: [labor], warnings: [] };

  return { blockers: [], warnings: [] };
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
