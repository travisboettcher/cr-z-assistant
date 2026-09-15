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
import { HERO_TIER } from '../data/tiers';
import { occupants } from './base';
import { suppliedOccupants } from './utilities';
import type { Facility, Upgrade } from '../data/facilities';
import type { Assignment, Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { survivorsDoing } from './assignments';
import { maxHp } from './survivor';

export type PlanningViolationCode =
  | 'nothing-in-slot'
  | 'utility-unmet'
  | 'upgrade-utility-unmet'
  | 'already-at-full-health'
  | 'someone-else-resting'
  | 'no-medical-clinic'
  | 'injured-on-a-mission'
  | 'a-second-hero-on-one-mission'
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

  if (survivor === undefined) return { blockers: [], warnings: [] };

  return { blockers: [], warnings: warningsFor(campaign, survivor, assignment) };
}

/**
 * The rules each task has, one function each.
 *
 * A switch that returns rather than one that pushes into a shared array and
 * breaks, because the `break` under `case 'project'` was a statement that did
 * nothing — no test could tell it from its own absence. Returning makes the
 * empty case say `return []`, which is a claim a test can hold the code to, and
 * makes the typechecker insist every task is answered: a switch of returns in a
 * function that promises an array is only well-typed if it is exhaustive.
 */
function warningsFor(
  campaign: Campaign,
  survivor: Survivor,
  assignment: Assignment,
): readonly PlanningViolation[] {
  switch (assignment.task) {
    case 'staff':
      return staffingWarnings(campaign, assignment.slot);
    case 'rest':
      return restWarnings(campaign, survivor);
    case 'healing':
      return healingWarnings(campaign, survivor);
    case 'mission':
      return missionWarnings(campaign, survivor, assignment.team);
    case 'scavenging':
      return scavengingWarnings(campaign, survivor);
    // Anybody may be on the project team: it is the task with no eligibility
    // rule of its own (pg. 20).
    case 'project':
      return [];
  }
}

/**
 * What is wrong with working this slot.
 *
 * **Two sentences about utilities, not one.** `working` in `base.ts` filters
 * the facility and its upgrades one at a time, so an unmet requirement on the
 * facility stops everything in the slot and an unmet one on an upgrade stops
 * only that upgrade (pg. 54, 67). Saying "it produces nothing this turn" about
 * the second was the app contradicting itself a phase later: the playtest read
 * it about a Kitchen whose Refrigeration wanted Power, and then watched the
 * Kitchen make its 2 Food in the next Advancement Phase.
 *
 * Read off `suppliedOccupants` rather than the stored flags, so a point with
 * nothing generating it does not silence the warning — the same falsehood the
 * other way round, and the rule Z3-10 added the resolver for.
 */
function staffingWarnings(campaign: Campaign, slot: string): readonly PlanningViolation[] {
  const occupant = suppliedOccupants(campaign).find((candidate) => candidate.slotId === slot);

  if (occupant === undefined) {
    return [
      { code: 'nothing-in-slot', message: 'Nothing is built in this slot to work.', pages: 54 },
    ];
  }

  const unmet = (entry: Facility | Upgrade) =>
    (entry.requires?.utilities ?? []).some((utility) => !occupant[utility]);

  /*
   * **No facility in the catalogue requires a utility today** — every
   * `requires.utilities` in `facilities.ts` is on an upgrade — so this branch
   * is unreachable from the data and its mutants survive. It stays for the
   * reason `Upgrade.rare` stays: the rule is real (pg. 54 stops an entry whose
   * requirements are unmet, and `working` applies that to facilities too), the
   * shape is the correct one for it, and the alternative is a silence that
   * turns into a wrong screen the first time such a facility is transcribed.
   */
  if (unmet(occupant.facility)) {
    return [
      {
        code: 'utility-unmet',
        message: 'Needs a utility it does not have, so it produces nothing this turn.',
        pages: 67,
      },
    ];
  }

  if (occupant.upgrades.some(unmet)) {
    return [
      {
        code: 'upgrade-utility-unmet',
        message:
          'An upgrade here needs a utility it does not have, so that upgrade does nothing this turn. The facility itself still works.',
        pages: 67,
      },
    ];
  }

  return [];
}

function restWarnings(campaign: Campaign, survivor: Survivor): readonly PlanningViolation[] {
  const warnings: PlanningViolation[] = [];

  if (!isInjured(survivor)) {
    warnings.push({
      code: 'already-at-full-health',
      message: 'Already at full Health, so resting would do nothing.',
      pages: 21,
    });
  }

  // Destructured rather than indexed behind a length check, so there is no
  // unreachable "or somebody" to fall back to: whoever is here has a name.
  const [resting] = othersDoing(campaign, survivor.id, 'rest');

  if (resting !== undefined) {
    warnings.push({
      code: 'someone-else-resting',
      message: `Only one survivor may rest a turn, and ${resting.name} is.`,
      pages: 21,
    });
  }

  return warnings;
}

function healingWarnings(campaign: Campaign, survivor: Survivor): readonly PlanningViolation[] {
  const warnings: PlanningViolation[] = [];

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

  return warnings;
}

function missionWarnings(
  campaign: Campaign,
  survivor: Survivor,
  team: number,
): readonly PlanningViolation[] {
  const warnings: PlanningViolation[] = [];

  if (isInjured(survivor)) {
    warnings.push({
      code: 'injured-on-a-mission',
      message: 'Injured survivors cannot be sent on a mission.',
      pages: 21,
    });
  }

  /*
   * Only one Hero may be on any single mission (pg. 7). **Per team, not per
   * community** — the base's Hero cap is a different rule and is enforced
   * elsewhere — so two Heroes split across two mission teams is legal and this
   * says nothing about it.
   *
   * It will be load-bearing beyond legality once Phase 4 computes mission
   * setup: team Tier points scale the zombie count for every mission, so a
   * two-Hero team is a materially different setup as well as an illegal one.
   *
   * A warning rather than a refusal, like everything else in this phase.
   */
  const hero = othersOnTeam(campaign, survivor.id, team).find(
    (candidate) => candidate.tier === HERO_TIER,
  );

  if (survivor.tier === HERO_TIER && hero !== undefined) {
    warnings.push({
      code: 'a-second-hero-on-one-mission',
      message: `Only one Hero may go on a mission, and ${hero.name} is.`,
      pages: 7,
    });
  }

  return warnings;
}

/** Everybody else already on this mission team. */
function othersOnTeam(campaign: Campaign, survivor: string, team: number): readonly Survivor[] {
  return survivorsDoing(
    campaign,
    (assignment) => assignment.task === 'mission' && assignment.team === team,
  ).filter((candidate) => candidate.id !== survivor);
}

function scavengingWarnings(campaign: Campaign, survivor: Survivor): readonly PlanningViolation[] {
  const warnings: PlanningViolation[] = [];

  const [scavenging] = othersDoing(campaign, survivor.id, 'scavenging');

  if (scavenging !== undefined) {
    warnings.push({
      code: 'someone-else-scavenging',
      message: `Only one survivor may scavenge, and ${scavenging.name} is.`,
      pages: 17,
    });
  }

  // Always, because this app does not model opting out of a mission — that is
  // the Mission Phase, and Phase 4's. Said rather than assumed, so a player
  // scavenging on a turn they fought is told which rule they are playing past.
  warnings.push({
    code: 'scavenging-needs-the-mission-skipped',
    message: 'Only when the community skips this turn\u2019s mission.',
    pages: 17,
  });

  return warnings;
}
