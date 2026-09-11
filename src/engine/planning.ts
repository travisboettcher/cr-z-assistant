/**
 * The Planning Phase — one task each, and the reset that starts it (pg. 20–21).
 *
 * ## Every violation here is a warning, and none is a blocker
 *
 * A blocker is the app having nothing to do: a slot that does not exist, Labor
 * that is not there to spend. Nothing in this module is like that. Resting at
 * full Health, healing with no Clinic, sending an injured survivor on a
 * mission — every one of them is a *rule*, the app can record it perfectly
 * well, and a table may be playing it differently or may be part-way through
 * fixing it. So they go behind Z1-7's visible override, which is never stored:
 * the assignment keeps reporting the violation for exactly as long as it holds.
 *
 * ## Whether the reset has run is read off the log
 *
 * Entering the Planning Phase clears last turn's tasks and utility points. It
 * must not clear them *twice*, or stepping back into the Advancement Phase and
 * forward again would silently destroy the planning just done — and the walk
 * exists to let a table correct itself.
 *
 * That could have been a stored "the reset ran on turn N", and `builtOnTurn` is
 * the precedent for exactly that shape. It is not, because it does not need to
 * be: the log already records that this turn's planning began, and **derived is
 * never stored**. Reading it back is what an append-only record of what
 * happened is *for*.
 */

import { TURN_STEPS } from '../data/turn';
import { occupants } from './base';
import type { Assignment, Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { staffOf, survivorsDoing } from './assignments';
import { maxHp } from './survivor';

export type PlanningViolationCode =
  | 'nothing-in-slot'
  | 'utility-unmet'
  | 'already-at-full-health'
  | 'someone-else-resting'
  | 'no-medical-clinic'
  | 'injured-on-a-mission'
  | 'someone-else-scavenging'
  | 'scavenging-needs-the-mission-skipped';

export type PlanningViolation = Violation<PlanningViolationCode>;

export type PlanningCheck = Check<PlanningViolationCode>;

/** The step the Planning Phase opens on, where the reset happens (pg. 20). */
export const FIRST_PLANNING_STEP = TURN_STEPS.planning[0].id;

/**
 * Whether this turn's Planning Phase has already cleared last turn's work.
 *
 * Read off the log rather than a field — see the note above. The entry carries
 * the turn it was stamped in, so "this turn" is the whole question.
 */
export function planningHasBegun(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'planning-began',
  );
}

/**
 * The campaign with last turn's tasks and utility points cleared.
 *
 * Both, together, because the book expires them together: a survivor takes one
 * assignment per campaign turn (pg. 20), and Power and Water "last until the
 * next turn's Planning Phase" (pg. 20, 67). Z2-8 built the pools and left this
 * clearing to the phase that knows when a turn begins.
 *
 * Nothing else on the base is touched. A facility that went up stays up; only
 * the two things the rules say expire do.
 */
export function withPlanningReset(campaign: Campaign): Campaign {
  const base = campaign.base;

  if (base === null) return { ...campaign, assignments: {} };

  const slots: Record<string, (typeof base.slots)[string]> = {};

  for (const [id, state] of Object.entries(base.slots)) {
    const { power, water, ...kept } = state;
    void power;
    void water;

    // An untouched slot is absent rather than present-and-empty, so a slot
    // whose only record was a utility point goes away entirely.
    if (Object.keys(kept).length > 0) slots[id] = kept;
  }

  return { ...campaign, assignments: {}, base: { ...base, slots } };
}

/** How many survivors have been given nothing to do (pg. 20). */
export function unassigned(campaign: Campaign): readonly Survivor[] {
  return campaign.survivors.filter((survivor) => campaign.assignments[survivor.id] === undefined);
}

/** Whether the community has a Medical Clinic to be healed in (pg. 21, 69). */
function hasMedicalClinic(campaign: Campaign): boolean {
  const base = campaign.base;

  return base !== null && occupants(base).some(({ facility }) => facility.id === 'medical-clinic');
}

/** Whether this survivor has taken damage, which is what "injured" reads as. */
function isInjured(survivor: Survivor): boolean {
  return survivor.currentHp < maxHp(survivor);
}

/** Somebody other than this survivor already doing the task. */
function othersDoing(
  campaign: Campaign,
  survivor: string,
  task: Assignment['task'],
): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === task).filter(
    (candidate) => candidate.id !== survivor,
  );
}

/**
 * Everything wrong with giving this survivor this task, or two empty lists.
 *
 * Takes the survivor's id and the task rather than reading what they already
 * have, because the screen asks this *before* the click — the row that says
 * "currently on the project team" is answering the same question one step
 * earlier, and a check that could only see assignments already made would have
 * nothing to say until it was too late.
 */
export function checkAssignment(
  campaign: Campaign,
  survivorId: string,
  assignment: Assignment,
): PlanningCheck {
  const survivor = campaign.survivors.find((candidate) => candidate.id === survivorId);
  const warnings: PlanningViolation[] = [];

  if (survivor === undefined) return { blockers: [], warnings: [] };

  switch (assignment.task) {
    case 'staff': {
      const occupant =
        campaign.base === null
          ? undefined
          : occupants(campaign.base).find((candidate) => candidate.slotId === assignment.slot);

      if (occupant === undefined) {
        warnings.push({
          code: 'nothing-in-slot',
          message: 'Nothing is built in this slot to work.',
          pages: 54,
        });
        break;
      }

      // The facility and its upgrades together, because one point of a utility
      // covers all of them — the same reading `checkUtility` takes.
      const unmet = [occupant.facility, ...occupant.upgrades].some((entry) =>
        (entry.requires?.utilities ?? []).some((utility) => !occupant[utility]),
      );

      if (unmet) {
        warnings.push({
          code: 'utility-unmet',
          message: 'Needs a utility it does not have, so it produces nothing this turn.',
          pages: 67,
        });
      }

      break;
    }

    case 'rest': {
      if (!isInjured(survivor)) {
        warnings.push({
          code: 'already-at-full-health',
          message: 'Already at full Health, so resting would do nothing.',
          pages: 21,
        });
      }

      const resting = othersDoing(campaign, survivorId, 'rest');

      if (resting.length > 0) {
        warnings.push({
          code: 'someone-else-resting',
          message: `Only one survivor may rest a turn, and ${resting[0]?.name ?? 'somebody'} is.`,
          pages: 21,
        });
      }

      break;
    }

    case 'healing': {
      if (!isInjured(survivor)) {
        warnings.push({
          code: 'already-at-full-health',
          message: 'Already at full Health, so healing would do nothing.',
          pages: 21,
        });
      }

      if (!hasMedicalClinic(campaign)) {
        warnings.push({
          code: 'no-medical-clinic',
          message: 'Healing needs a Medical Clinic, and this base has none.',
          pages: 21,
        });
      }

      break;
    }

    case 'mission': {
      if (isInjured(survivor)) {
        warnings.push({
          code: 'injured-on-a-mission',
          message: 'Injured survivors cannot be sent on a mission.',
          pages: 21,
        });
      }

      break;
    }

    case 'scavenging': {
      const scavenging = othersDoing(campaign, survivorId, 'scavenging');

      if (scavenging.length > 0) {
        warnings.push({
          code: 'someone-else-scavenging',
          message: `Only one survivor may scavenge, and ${scavenging[0]?.name ?? 'somebody'} is.`,
          pages: 17,
        });
      }

      // Always, because this app does not model opting out of a mission —
      // that is the Mission Phase, and Phase 4's. Said rather than assumed, so
      // a player scavenging on a turn they fought is told which rule they are
      // playing past.
      warnings.push({
        code: 'scavenging-needs-the-mission-skipped',
        message: 'Only when the community skips this turn’s mission.',
        pages: 17,
      });

      break;
    }

    case 'project':
      break;
  }

  return { blockers: [], warnings };
}

/** Whether anything in this slot is worth working, for the staffing step. */
export function staffableSlots(campaign: Campaign): readonly string[] {
  const base = campaign.base;
  if (base === null) return [];

  return occupants(base).map((occupant) => occupant.slotId);
}

/** Whoever is working a slot, for the step that shows them all at once. */
export function staffedSlots(
  campaign: Campaign,
): readonly { slot: string; staff: readonly Survivor[] }[] {
  return staffableSlots(campaign).map((slot) => ({ slot, staff: staffOf(campaign, slot) }));
}
