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
 * ## What is *not* here: Labor spent, and Labor whose turn has passed
 *
 * `laborPool` is what the project team generates, and it is neither of the two
 * numbers a screen asking "can this be ordered" wants. It is not reduced by
 * what this turn has already ordered — `laborCommitted` in `projects.ts` is
 * that — and it does not ask whose turn the team belongs to, which
 * `laborThisTurn` beside it does.
 *
 * Both live there because both are questions about the *queue*, and this
 * module knows only about tasks. The second one is worth naming because it is
 * not obvious: `assignments` holds last turn's tasks right up until the top of
 * the next Planning Phase clears them (pg. 20), so for two whole phases the
 * team on the campaign is the one that was paid for a turn ago. Reading
 * `laborPool` in those phases and calling it this turn's budget was issue #97.
 */

import { BASES } from '../data/bases';
import { occupants, staffCapacity, type Occupant } from './base';
import { exhaustion, planningPenalty } from './feeding';
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

  // The same for a mission team: team 2 is not team 1's task (pg. 21). Every
  // assignment was team 1 until Z4-2 let Planning split them, so this changed
  // nothing that had already been written. Its `other.task` check survives
  // mutation for the staffing line's reason: only a mission carries a team, and
  // the narrowing is what lets `other.team` be read at all.
  if (one.task === 'mission') return other.task === 'mission' && one.team === other.team;

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
 *
 * **Takes the occupant rather than looking one up, and that is the fix for
 * #153 and #170.** A Med Lab widens a Clinic only while it is supplied — pg. 67
 * gives an entry whose requirements are unmet no effect at all, and widening
 * the staffing *is* the Med Lab's effect — so the answer depends on which
 * occupant is asked. This looked one up raw, which is supply-blind: right
 * whenever a facility is genuinely unsupplied, and wrong whenever supply
 * arrives by a route not stored on the slot. On a Hydroelectric Dam at combined
 * Utilities 10, where the base special supplies everything, the staffing
 * control said "Takes 2" off the resolved occupant and Heal Wounds pooled one
 * medic's Medicine off the raw one.
 *
 * #153 called resolving it circular, and the cycle was real as written:
 * `suppliedOccupants → backedPoints → utilitiesScore → staffOf →
 * staffCapacity → working`. It carried no information, though. Only three
 * upgrades widen a facility — the Med Lab, the Study Room and the Watch Post —
 * and **none of them sits on a facility that generates utilities**, so every
 * Station's capacity is 1 whether supplied or not and the pool can be computed
 * from supply-blind staffing without losing anything. `rules.test.ts` holds
 * that, so an upgrade that put an `extraStaff` on a Utility Station would fail
 * rather than quietly restoring the loop.
 *
 * Asking the caller closes it for good: every consumer already iterates
 * `suppliedOccupants` and had the resolved occupant in hand while this went and
 * fetched the raw one. The two that must not resolve — the pool itself, and the
 * staffed-facility count, where capacity cannot change a `length > 0` — now say
 * so where they call it.
 */
export function staffOf(campaign: Campaign, occupant: Occupant): readonly Survivor[] {
  // Through `sameTask` rather than matching the tag and the slot again here.
  // Two places answering "is this the same job" is one place too many, and the
  // copy was the one a mutant could survive in.
  const assigned = survivorsDoing(campaign, (assignment) =>
    sameTask(assignment, { task: 'staff', slot: occupant.slotId }),
  );

  return assigned.slice(0, staffCapacity(occupant));
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
 * Every team, not one: since Z4-2 the Planning Phase splits the mission
 * survivors between teams (pg. 21), and this is all of them together.
 * `missionTeams` in `missions.ts` keeps them apart, and `deployed` there is
 * who actually went.
 */
export function missionTeam(campaign: Campaign): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === 'mission');
}

/**
 * What the base is adding to the Labor pool right now, for a caption to name.
 *
 * `laborPool` reads the same number through `baseLabor`; this is the half a
 * screen has to say out loud, because both captions read "the summed Tier
 * levels of the project team" beside a 5 for a team whose Tiers sum to 3
 * (#143). Same class as #113: a number with a term the sentence beside it does
 * not mention.
 */
export function baseLaborBonus(campaign: Campaign): number {
  return baseLabor(campaign, projectTeam(campaign).length > 0);
}

/**
 * What a clean Siege Defense last turn is adding to the Labor pool right now,
 * for a caption to name (pg. 86).
 *
 * `baseLaborBonus`'s sibling, for the same reason (#143): the captions say "the
 * summed Tier levels of the project team", and a pool carrying a point per head
 * on top of that is a number the sentence beside it has to account for.
 */
export function siegeLaborBonus(campaign: Campaign): number {
  return siegeReward(campaign, projectTeam(campaign), campaign.turn);
}

/**
 * The Labor the project team on the campaign generates (pg. 20).
 *
 * The sum of their Tier levels, plus whatever the base adds, plus a point each
 * on the turn after a clean siege. Two things it is deliberately not, both in
 * `projects.ts` and both for the reason in this module's note above: it is not
 * reduced by what has been ordered (`laborAvailable` subtracts), and it does
 * not ask which turn assigned this team (`laborThisTurn` does). A caller
 * pricing an order wants that one.
 */
export function laborPool(campaign: Campaign): number {
  return laborOf(campaign, projectTeam(campaign), campaign.turn);
}

/**
 * The Labor a given project team generates on a given turn.
 *
 * `laborPool` is this for the team on the campaign and the turn it is on. The
 * turn is a parameter because one caller asks about a team that is *not* this
 * turn's: a Siege Defense reaches back to the team the previous Planning Phase
 * assigned, whose Labor paid for the orders this turn's Advancement Phase
 * finishes, and that team's pool is the one its own turn generated — a clean
 * siege two turns ago included (`siegeLaborShortfall` in `projects.ts`).
 */
export function laborOf(campaign: Campaign, team: readonly Survivor[], turn: number): number {
  const generated = team.reduce((total, survivor) => total + labor(survivor), 0);

  return generated + siegeReward(campaign, team, turn) + baseLabor(campaign, team.length > 0);
}

/**
 * The reward for a Siege Defense that left no zombie standing: +1 Labor for
 * each survivor on the project team, the campaign turn after it (pg. 86).
 *
 * **The turn after, and through that turn's Planning Phase.** The siege is
 * fought in turn N's Mission Phase and its outcome recorded there; the book
 * puts the Labor in the *next* campaign turn, which is turn N + 1, and a turn's
 * Labor exists only once its Planning Phase has assigned the team that
 * generates it (`laborThisTurn`, #97). So the point lands on the team turn
 * N + 1 assigns, is spendable in that Planning Phase, and is still on the pool
 * in that turn's Management Phase — where a departing project-team member
 * takes their point off with their Tier, because the point is theirs rather
 * than the pool's (pg. 23). Turn N's own Planning Phase gets nothing: it is
 * the same campaign turn as the siege, not the next one.
 *
 * **Derived from the log, like the counter the same outcome resets.** The
 * condition is the one `siegeCounterChange` calls a reset — no zombie left on
 * the mission area — and nothing is stored beside the entry. Read here rather
 * than through `siege.ts` because that module imports this one: the siege rule
 * that *changes* the pool has to be answerable where the pool is summed.
 *
 * Per head rather than a flat bonus, so it is zero for an empty team without
 * saying so: "+1 for each survivor on the project team" with nobody on it is
 * nothing, which the Catwalks have to spell out and this does not.
 */
function siegeReward(campaign: Campaign, team: readonly Survivor[], turn: number): number {
  const clean = campaign.log.some(
    (entry) =>
      entry.turn === turn - 1 &&
      entry.event.kind === 'siege-defense-resolved' &&
      entry.event.zombiesLeft === 0,
  );

  return clean ? team.length : 0;
}

/**
 * What the base itself adds to the Labor pool.
 *
 * The Hydroelectric Dam's Catwalks: +2 a turn, and only while somebody is on
 * the project team (pg. 61) — which is why `working` is a parameter rather
 * than something this reads for itself. Nothing consumed the special until the
 * September playtest found the Dam's pool reading 3 where the book says 5.
 */
function baseLabor(campaign: Campaign, working: boolean): number {
  const base = campaign.base;
  if (base === null) return 0;

  return BASES[base.id].specials.reduce(
    (total, special) =>
      special.id === 'catwalks' && (working || !special.needsProjectTeam)
        ? total + special.labor
        : total,
    0,
  );
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

  // Raw, and it cannot matter: this asks whether anybody is working the slot,
  // and every facility seats at least one whatever its utilities are doing. A
  // resolved list here would be `suppliedOccupants`, which is the cycle.
  return occupants(base).filter((occupant) => staffOf(campaign, occupant).length > 0).length;
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

  // The penalty as it stood at Planning Step 1, not as it stands now. The
  // points on the board were generated and assigned there and last until the
  // next Planning Phase (pg. 20, 67); a penalty applied four steps later in the
  // same turn lowered this Score under them, and the base sheet then read
  // "POWER ASSIGNED 4 / 2 — Over what the base generates" while `backedPoints`
  // silently dropped points in layout order (#169). The next turn's generation
  // is reduced, which is the consequence the rule does have — `hungerPenalty`
  // is what Planning Step 1 will ask then.
  const penalty = planningPenalty(campaign);
  let total = 0;

  for (const occupant of occupants(base)) {
    // Raw on purpose: this *is* the supply calculation, so it cannot ask what
    // supply resolved to. Sound because no facility that generates a utility
    // has an upgrade that widens it — `rules.test.ts` is the guard.
    for (const line of facilityProduction(occupant, staffOf(campaign, occupant), penalty)) {
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

/**
 * Whether Exhaustion takes somebody off the mission team this turn (pg. 23).
 *
 * Exhaustion above the team's size takes one survivor off it — **above**, so a
 * team of two against two Exhaustion goes out whole. An empty team has nobody
 * to lose and is never owed the penalty, however many are sleeping on the
 * floor. And once one has come off, the answer is no for the rest of the turn:
 * `missionTeamReduced` is the record, for the reason its own note gives.
 *
 * **The question lived in the screen until #181**, as
 * `short > team.length && team.length > 0` beside a separate check of the log,
 * so the engine could not say whether the turn owed a removal and nothing
 * outside Assign Beds could apply the rule. Worse, the reducer asked only half
 * of it: it refused a second removal and a survivor who was not on the team,
 * but took somebody off a team the Exhaustion did not reach whenever the action
 * arrived — the screen's condition was the only thing standing between the
 * action and an edit the rule never called for. Both ask here now.
 *
 * **The team is the one in `assignments`, as it stands**, not
 * `beforePlanning`'s rewind. The Management Phase runs after the Planning
 * Phase's clear, and the team a tired community is short of is the one going
 * out next — which is the one Planning just assigned, and the one the reducer
 * takes the survivor off. Rewinding would weigh the Exhaustion against a team
 * that has already played and that no edit here could touch.
 *
 * **A yes or no rather than the team affected**, because that is all any
 * caller is asking. The people come from `missionTeam` either way — every
 * survivor on it is a candidate, and *which* one is the player's choice — and
 * both callers already hold that list for reasons of their own: the screen to
 * name the candidates, the reducer to check the one it was handed. Returning
 * the team would make "nothing owed" an empty list, and each caller would then
 * re-derive the answer as `length > 0`, which is the copy this replaced.
 *
 * **Every team together** (R23). Since Z4-2 Planning can split the mission
 * survivors between teams (pg. 21), and pg. 23's "the mission team" is read as
 * all of them — the whole group pg. 21 names before it splits — so this counts
 * them together, as it always has, and the survivor taken off may come from
 * any team.
 */
export function overworked(campaign: Campaign): boolean {
  if (missionTeamReduced(campaign)) return false;

  const team = missionTeam(campaign).length;

  return team > 0 && exhaustion(campaign) > team;
}

/**
 * The assignments, minus one survivor's.
 *
 * Here rather than in the reducer since #179, because two of the forms that
 * take somebody off a task — Exhaustion's removal from the mission team and a
 * survivor leaving the roster — moved into the engine, and the reducer's own
 * `assignment/cleared` asks for the same thing.
 *
 * A fresh copy with the key deleted, so nothing a caller holds is written to.
 * Written out rather than rest-destructured because the idiom for a computed
 * key leaves an unused binding behind, which is the same call
 * `survivor/skillRemoved` makes.
 *
 * Deleting a key the record does not have is a no-op, so there is no guard for
 * that case. There was one — an early return that kept the record's identity
 * when nothing changed — and a mutation run showed it surviving every test,
 * because nothing anywhere observes whether this particular record kept its
 * reference.
 */
export function withoutAssignment(
  assignments: Readonly<Record<string, Assignment>>,
  survivor: string,
): Readonly<Record<string, Assignment>> {
  const remaining = { ...assignments };
  delete remaining[survivor];

  return remaining;
}
