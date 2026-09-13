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

import { occupantAt, occupants, staffCapacity } from './base';
import { hungerPenalty } from './feeding';
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
  // Staffing asked first, so the tag comparison below is the whole answer for
  // everything else. An earlier draft matched tags first and then re-checked
  // *both* sides for staffing, which needed the second check only to satisfy
  // the typechecker — and left four mutants alive, because by then the two tags
  // were known equal and every way of breaking that line agreed with it.
  //
  // One survives here and is equivalent: `other.task === 'staff'` replaced by
  // `true`. Only a Staff assignment carries a slot, so for any other `other`
  // the comparison that follows is `'kitchen' === undefined`, which is already
  // false. The check is there for the typechecker — `one.slot` is not readable
  // without it — and it is the narrowing rather than the test that earns it.
  if (one.task === 'staff') return other.task === 'staff' && one.slot === other.slot;

  return one.task === other.task;
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

/**
 * Whoever is working this slot's facility, up to what it takes (pg. 20, 54).
 *
 * **Capped here rather than at each consumer**, so production, the Rot check's
 * Medicine total and the Watchtower's reduction all get the limit without
 * asking for it. A facility takes one survivor unless an upgrade widens it, and
 * nothing enforced that until the September playtest put three on a bare
 * Medical Clinic and got +5 Health out of it.
 *
 * The excess is **ignored rather than refused**, which is this app's usual
 * shape: the Planning screen warns, and a save that arrived over capacity opens
 * and is described rather than rejected. Roster order decides who counts, which
 * is arbitrary but stable — and the screen names whoever is doing nothing, so
 * the answer is visible rather than merely consistent.
 */
export function staffOf(campaign: Campaign, slot: string): readonly Survivor[] {
  // Through `sameTask` rather than matching the tag and the slot again here.
  // Two places answering "is this the same job" is one place too many, and the
  // copy was the one a mutant could survive in.
  const assigned = survivorsDoing(campaign, (assignment) =>
    sameTask(assignment, { task: 'staff', slot }),
  );

  const occupant = occupantAt(campaign, slot);

  return occupant === undefined ? [] : assigned.slice(0, staffCapacity(occupant));
}

/** Whoever is assigned to this slot, over capacity or not — for a screen to report. */
export function assignedTo(campaign: Campaign, slot: string): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => sameTask(assignment, { task: 'staff', slot }));
}

/** Everyone on the project team (pg. 20). */
export function projectTeam(campaign: Campaign): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === 'project');
}

/**
 * The campaign as the Advancement Phase is entitled to read it.
 *
 * **Two questions share one field, and this is the one that separates them.**
 * `assignments` answers "who is doing what" — but the Advancement Phase asks
 * "who did what on the turn that just played", and the Planning Phase of the
 * same turn overwrites the answer. Ordinarily that is fine, because Advancement
 * runs first. It stopped being fine the moment the walk let a player skip
 * forward to Planning from an unfinished Advancement step and then come back:
 * the clear had happened, and the steps behind them showed a turn where nobody
 * went on a mission, nobody staffed a Kitchen and nobody was resting — with the
 * Health those steps owed gone for good (issue #95).
 *
 * So the `planning-began` entry records what it cleared, and this rewinds to
 * it. Derived from the log rather than kept in a second field, like everything
 * else here: the entry is the record of the clearing, and the assignments it
 * carries are what the clearing was *of*.
 *
 * A turn whose Planning has not begun is already showing the right answer and
 * comes back untouched — which includes turn 1, where the Mission Phase records
 * who played the First Mission (pg. 75) and no Planning Phase has ever run.
 * Applying this twice changes nothing, so a caller that has already rewound
 * costs only the work.
 */
export function beforePlanning(campaign: Campaign): Campaign {
  const cleared = campaign.log
    .flatMap((entry) =>
      entry.turn === campaign.turn && entry.event.kind === 'planning-began'
        ? [entry.event.cleared]
        : [],
    )
    .at(0);

  // `undefined` twice over, and both mean "nothing to rewind to": no clearing
  // this turn, or one logged by a build from before the entry carried it.
  return cleared === undefined ? campaign : { ...campaign, assignments: cleared };
}

/**
 * Everybody on a mission team (pg. 21).
 *
 * **Read in the Advancement Phase, written in the Planning one, and that is the
 * point.** The Planning Phase of a turn assigns *next* turn's team (pg. 21), and
 * the reset that clears assignments runs at the top of the Planning Phase — so
 * when the Advancement Phase asks who was on the mission that just played, the
 * answer is still sitting in `assignments` — or, once that clear has happened,
 * in the entry that recorded it. Callers in the Advancement Phase reach this
 * through `beforePlanning` for that reason; callers in the Management Phase,
 * which runs *after* the clear and means the team going out next, do not.
 *
 * Every team, not one: the assignment carries a team number the app does not
 * yet write anything but 1 into, and "who went on the mission" is the question
 * every caller in Phase 3 is asking.
 */
export function missionTeam(campaign: Campaign): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === 'mission');
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
 * has already decided what an occupant makes and with whom.
 *
 * **More than one output is the whole test**, and that is a claim about the
 * data rather than a shortcut: the Utility Station is the only entry in the
 * book whose production names two outputs, because it is the only one whose
 * amount the player divides. `rules.test.ts` asserts that over the whole
 * catalogue, so this stays true by a test rather than by memory.
 *
 * An earlier draft also checked that both outputs *were* utilities. Nothing
 * could make that check fire — there is no other multi-output line to catch —
 * and it survived every mutation for exactly that reason. A filter that cannot
 * discriminate is a filter that is not doing anything.
 */
function splitsAcrossPools(line: ProductionLine): boolean {
  return line.staffed && line.outputs.length > 1;
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

  const penalty = hungerPenalty(campaign);
  let total = 0;

  for (const occupant of occupants(base)) {
    for (const line of facilityProduction(occupant, staffOf(campaign, occupant.slotId), penalty)) {
      if (splitsAcrossPools(line)) total += line.amount;
    }
  }

  return total;
}

/**
 * Whether Exhaustion has already taken somebody off the mission team this turn
 * (pg. 23).
 *
 * The rule removes **one**, and removing them does not lower the Exhaustion
 * that called for it — population against beds is unchanged by who is on which
 * team. So nothing in the campaign distinguishes "the penalty has been applied"
 * from "the penalty is still owed", and the log is what does.
 */
export function missionTeamReduced(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'mission-team-reduced',
  );
}
