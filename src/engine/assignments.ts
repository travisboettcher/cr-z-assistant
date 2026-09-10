/**
 * What the turn's assignments make computable.
 *
 * Three numbers Phase 2 had to ask the player for — the Labor pool, the
 * Utilities Score, and who is working a facility — are arithmetic over
 * `Campaign.assignments` and the roster. This is where they stop being typed
 * in.
 *
 * **Every one of them is derived on read.** Not one is stored, for the reason
 * the whole architecture gives: the hunger penalty (Z3-9) drops every stat
 * until the next Management Phase, which changes every Skill Score, which
 * changes what a staffed facility makes and how much Utilities a Station
 * generates. A cached pool would be wrong for a whole turn and look right the
 * entire time.
 *
 * ## What is *not* here: Labor spent
 *
 * `laborPool` is what the project team generates. It is not reduced by what has
 * already been built this turn, and Phase 2's hand-entered number was not
 * either — so this story changes where the number comes from without changing
 * what is tracked.
 *
 * Spending it down needs something this app does not have yet. Facilities
 * record the turn they went up, but upgrades and cleared slots record nothing,
 * so "what has this turn's Labor already paid for" is not recoverable. The book
 * has the real shape: projects are *ordered* during the Planning Phase and
 * complete in the next Advancement Phase (pg. 20, 19), which is a queue rather
 * than a running total — and it belongs to
 * [Z3-7](../../docs/phase-3-stories.md#z3-7--the-advancement-phase), which owns
 * that step. Adding a turn stamp to every upgrade now, to replace it there,
 * would be churn.
 */

import type { Utility } from '../data/facilities';
import { occupants } from './base';
import type { Assignment, Campaign, Survivor } from './campaign';
import { facilityProduction, type ProductionLine } from './production';
import { labor } from './survivor';

/**
 * Whether two assignments are the same job.
 *
 * Staffing compares the slot as well, because working the Kitchen and working
 * the Garden are different tasks that share a name. Everything else is settled
 * by the tag: two survivors on the project team are doing the same thing, and a
 * mission team number is which team rather than which job.
 */
export function sameTask(one: Assignment, other: Assignment): boolean {
  if (one.task !== other.task) return false;
  if (one.task === 'staff' && other.task === 'staff') return one.slot === other.slot;

  return true;
}

/** Which task a survivor has been given, or `undefined` for none. */
export function taskOf(campaign: Campaign, survivor: string): Assignment | undefined {
  return campaign.assignments[survivor];
}

/**
 * The survivors doing a given task, in roster order.
 *
 * Roster order rather than assignment order, because every screen that shows
 * these shows them beside the roster and a list that reshuffles as tasks change
 * is a list nobody can scan.
 */
export function survivorsDoing(
  campaign: Campaign,
  matches: (assignment: Assignment) => boolean,
): readonly Survivor[] {
  return campaign.survivors.filter((survivor) => {
    const assignment = campaign.assignments[survivor.id];

    return assignment !== undefined && matches(assignment);
  });
}

/** Whoever is working this slot's facility (pg. 20). */
export function staffOf(campaign: Campaign, slot: string): readonly Survivor[] {
  return survivorsDoing(
    campaign,
    (assignment) => assignment.task === 'staff' && assignment.slot === slot,
  );
}

/** Everyone on the project team (pg. 20). */
export function projectTeam(campaign: Campaign): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === 'project');
}

/**
 * The Labor the project team generates this turn (pg. 20).
 *
 * The sum of their Tier levels, and nothing else — the pool is not reduced by
 * what has been built, for the reason in this module's own note above.
 */
export function laborPool(campaign: Campaign): number {
  return projectTeam(campaign).reduce((total, survivor) => total + labor(survivor), 0);
}

/**
 * How many of the base's facilities have somebody working them.
 *
 * One of the four terms of Siege Threat (pg. 23), which is Z3-10's to add up.
 * Counted by *slot* rather than by survivor: two survivors on one Med Lab is
 * one staffed facility, and the term is a count of facilities.
 *
 * A slot with nothing built in it does not count however many people are
 * assigned to it. That is a house-ruled state rather than an impossible one —
 * `saveFile.ts` accepts an assignment to an empty slot on purpose, because it
 * is a rule Z3-6 reports rather than a damaged file — and a Siege Threat that
 * counted it would be charging a community for a facility it does not have.
 */
export function staffedFacilityCount(campaign: Campaign): number {
  const base = campaign.base;
  if (base === null) return 0;

  return occupants(base).filter((occupant) => staffOf(campaign, occupant.slotId).length > 0).length;
}

/**
 * Whether a production line is one amount the player splits across the two
 * utility pools — which is the Utility Station's, and only its (pg. 72).
 *
 * Asked of the line rather than of the facility, because `facilityProduction`
 * has already done the work of deciding what an occupant makes and with whom.
 * Both halves are needed: a staffed line with one output goes to one place, and
 * a flat multi-output line is not a thing the table has but is a shape the type
 * allows.
 */
function splitsAcrossPools(line: ProductionLine): boolean {
  const isUtility = (output: ProductionLine['outputs'][number]): output is Utility =>
    output === 'power' || output === 'water';

  return line.staffed && line.outputs.length > 1 && line.outputs.every(isUtility);
}

/**
 * The Utilities Score this base's staff generate, to be split across Power and
 * Water however the player likes (pg. 20, 72).
 *
 * The other half of the pool. `flatUtilitiesGenerated` in `base.ts` has the
 * part that arrives whether or not anyone works for it — Solar Panels, Rain
 * Collectors, the Distillery's built-in Station — and this is the part that was
 * typed in until now.
 *
 * Zero with nobody assigned, which is a real answer rather than a missing one:
 * a Utility Station with no one in it generates nothing, and nine of the ten
 * bases can then assign nothing at all.
 */
export function utilitiesScore(campaign: Campaign): number {
  const base = campaign.base;
  if (base === null) return 0;

  let total = 0;

  for (const occupant of occupants(base)) {
    for (const line of facilityProduction(occupant, staffOf(campaign, occupant.slotId))) {
      if (splitsAcrossPools(line)) total += line.amount;
    }
  }

  return total;
}
