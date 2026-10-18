/**
 * What this turn still owes, for the one press that cannot be taken back.
 *
 * ## Why a step "not done" is a thing the campaign knows
 *
 * The walk's progress list ticked a step when the **cursor had moved past it**,
 * which is not the same fact and reads as the stronger one. A skipped Add
 * Materials showed ✓, End turn said nothing, and seven entered rolls worth 8
 * Food went with the turn boundary (#149). Several steps already record that
 * they ran — that is how a walk back over one refuses to hand out its haul
 * twice — so the campaign has always known which of them had not happened, and
 * nothing asked it.
 *
 * ## What counts as owed
 *
 * A step is owed when there is something at it to resolve *and* nothing
 * recording that it was. Both halves matter: Check Storage with nothing over
 * the cap is not an omission, and warning about it every turn would teach a
 * player to press through the warning that matters.
 *
 * The Labor shortfall is not a step and is here anyway: it is the same
 * question — something outstanding that the turn boundary would quietly
 * forgive, and it forgave it by completing every over-ordered project in the
 * next Advancement Phase (#147).
 *
 * Steps that hand out nothing and record nothing are deliberately absent.
 * Character Advancement is not owed for having XP left in a pool: the book's
 * word is *may*, and a community banking its discretionary point has made a
 * decision rather than skipped a step.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { TurnStepId } from '../data/turn';
import { firstBaseOwed } from './base';
import type { Campaign } from './campaign';
import { moveOwed } from './claim';
import { survivorsFed } from './feeding';
import { containmentDraws, healthAwards, woundsHealed } from './healing';
import { madnessAwards, madnessRecovered } from './lounge';
import { lostRollsDue, rescuesDue } from './lostRoll';
import { materialsAdded } from './materials';
import { firstMissionFailed, missionsChosen, unresolvedTeams } from './missions';
import {
  dueProjects,
  laborShortfall,
  laborThisTurn,
  projectTeamIdle,
  siegeLaborShortfall,
} from './projects';
import { continuationOpen, overrunChoiceOwed } from './overrun';
import { infectionStillToCheck, mustCheck, rotCheckResolved } from './rot';
import { inoculationsDue, rotResistanceDue } from './inoculation';
import { hordeChecked } from './siege';
import { anythingOverCap, storageChecked } from './storage';
import { goingLost, someoneDeparted, someoneIsLeaving } from './departures';
import { broughtHomeOwed } from './missionVehicles';
import { spentOwed } from './spent';
import { advance, positionOf, type AdvanceBy } from './turn';
import { dueTrades } from './trading';
import { returnedWaiting, strangersWaiting } from './strangers';

/** Why a step is outstanding, in the words the walk shows the player. */
export interface Outstanding {
  readonly step: TurnStepId;
  readonly says: string;
}

/**
 * Whether every project due this turn has landed.
 *
 * Read off the queue rather than off the log: completion takes what it
 * finished out, so a queue still holding something due is a step that has not
 * run. That also makes it right after a walk back — the step is idempotent, and
 * nothing due means nothing owed.
 */
function projectsOutstanding(campaign: Campaign): boolean {
  return dueProjects(campaign).length > 0;
}

/** Whether somebody at 0 Health still has this turn's check to make (pg. 22). */
function rotOutstanding(campaign: Campaign): boolean {
  return mustCheck(campaign).some((survivor) => !rotCheckResolved(campaign, survivor.id));
}

/**
 * Everything this turn would leave undone, in the order the walk runs them.
 *
 * Ordered so the dialog reads as a walk backwards through what was missed
 * rather than as an unsorted list of complaints.
 */
export function outstanding(campaign: Campaign): readonly Outstanding[] {
  const owed: Outstanding[] = [];

  // Every team the Planning Phase sent needs a mission, unless the community
  // opted out (pg. 17; Z4-2). A turn with nobody on a team owes nothing.
  if (!missionsChosen(campaign)) {
    owed.push({ step: 'select-mission', says: 'A mission team has no mission chosen.' });
  }

  // The Lost roll, before the first mission (R108; Z7-8).
  if (lostRollsDue(campaign).length > 0) {
    owed.push({ step: 'select-mission', says: 'A Lost survivor hasn’t made the Lost roll.' });
  }

  // Every team that chose a mission owes its outcome (Z4-3): what it counted
  // is what its rewards, the turns since the last siege among them, are read
  // from. Before Z4-3 only a siege was owed, because only a siege was known to
  // have been played.
  for (const team of unresolvedTeams(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: `Mission team ${String(team)}’s outcome isn’t recorded.`,
    });
  }

  // Gear that lasts one mission goes after it whatever happened (pp. 40, 45,
  // 47; Z5-5). Owed until the team records what its mission used, so it does
  // not go out again next turn.
  for (const team of spentOwed(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: `Mission team ${String(team)} carries gear that lasts one mission, and what it used isn’t recorded.`,
    });
  }

  // A Lost survivor placed on a mission is rescued or not (R109; Z7-8).
  if (rescuesDue(campaign).length > 0) {
    owed.push({
      step: 'tactical-mission',
      says: 'A Lost survivor was on a mission, and whether they were rescued isn’t recorded.',
    });
  }

  // A vehicle not driven off is lost (R70; Z5-12): owed until the team says
  // which of its vehicles came home, so none stays in the community unrecorded.
  for (const team of broughtHomeOwed(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: `Mission team ${String(team)} took vehicles, and which came home isn’t recorded.`,
    });
  }

  // An overrun base owes how the community goes on, straight after the siege
  // and again after a way on that failed (pg. 86; R27, R28; Z4-9).
  if (overrunChoiceOwed(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: 'The base is overrun, and how the community goes on isn’t chosen.',
    });
  }

  // A community that left its survivors behind owes its new community's First
  // Mission once it is built (R31; Z4-11). The other ways on choose their
  // mission with the way on, so are never left here.
  if (continuationOpen(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: 'The new community’s First Mission isn’t chosen.',
    });
  }

  // A community's first base is what Start a New Community, turn 1's First
  // Mission, claims (pp. 54, 76–77). A turn ending without one warns rather
  // than refuses (R33).
  if (firstBaseOwed(campaign)) {
    owed.push({ step: 'tactical-mission', says: 'No base has been claimed.' });
  }

  // A First Mission that met no end condition is played again in turn 1 (R21).
  if (firstMissionFailed(campaign)) {
    owed.push({
      step: 'select-mission',
      says: 'The First Mission failed and has to be played again.',
    });
  }

  // Rot Resistant works at the start of the Advancement Phase (R96; Z7-5).
  if (rotResistanceDue(campaign).length > 0) {
    owed.push({
      step: 'character-advancement',
      says: 'Rot Resistant hasn’t taken this turn’s Infection off.',
    });
  }

  // Every stranger this turn's outcomes counted joins at Advancement Step 2
  // (pg. 19; Z4-5), and one nobody has added is gone with the turn: the step
  // offers this turn's rescues only.
  const waiting = strangersWaiting(campaign).length;
  if (waiting > 0) {
    owed.push({
      step: 'create-new-survivors',
      says:
        waiting === 1
          ? 'A rescued stranger hasn’t joined the community.'
          : `${String(waiting)} rescued strangers haven’t joined the community.`,
    });
  }

  // Somebody set aside whom a Rescue Strangers mission brought back rejoins at
  // the same step (R31; Z4-11).
  const returning = returnedWaiting(campaign).length;
  if (returning > 0) {
    owed.push({
      step: 'create-new-survivors',
      says:
        returning === 1
          ? 'A survivor brought back hasn’t rejoined the community.'
          : `${String(returning)} survivors brought back haven’t rejoined the community.`,
    });
  }

  if (projectsOutstanding(campaign)) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: 'Projects ordered last turn are due and haven’t been finished.',
    });
  }

  // A trade lands at the same step (pg. 19; R53; Z5-9), and is owed until it
  // has: read off the orders, as the projects are off the queue.
  if (dueTrades(campaign).length > 0) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: 'Items traded for last turn haven’t arrived.',
    });
  }

  // Before the projects can land at all, and the same question as this turn's
  // own shortfall below: Labor the turn no longer has, which ending it would
  // otherwise forgive (#183).
  if (siegeLaborShortfall(campaign) > 0) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: `Last turn’s orders are ${String(siegeLaborShortfall(campaign))} Labor short after the siege, and a project has to go unfinished.`,
    });
  }

  // After the projects, which are built into the old base first (R25; Z4-8).
  if (moveOwed(campaign)) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: 'The community hasn’t moved into the base its claim won.',
    });
  }

  if (!materialsAdded(campaign)) {
    owed.push({
      step: 'add-materials-to-storage',
      says: 'This turn’s haul hasn’t gone into storage.',
    });
  }

  // Containment's draw is owed with the Health, even when there is none (R103).
  const awards = healthAwards(campaign);
  if (
    !woundsHealed(campaign) &&
    (awards.length > 0 || containmentDraws(campaign, awards).length > 0)
  ) {
    owed.push({ step: 'heal-wounds', says: 'This turn’s Health hasn’t been handed out.' });
  }

  // The Lounge's Madness Recovery, beside the Health (R110; Z7-7).
  if (!madnessRecovered(campaign) && madnessAwards(campaign).length > 0) {
    owed.push({
      step: 'heal-wounds',
      says: 'The Lounge’s Madness Recovery hasn’t been handed out.',
    });
  }

  // An Inoculation chosen last Planning Phase is given here (R97; Z7-5).
  if (inoculationsDue(campaign).length > 0) {
    owed.push({ step: 'heal-wounds', says: 'An Inoculation hasn’t been given.' });
  }

  // A project team with Labor and nothing ordered from it, owed at the step
  // that assigned it (#235). Any order or build this Planning Phase clears it.
  if (projectTeamIdle(campaign)) {
    owed.push({
      step: 'assign-project-team',
      says: `${String(laborThisTurn(campaign))} Labor with nothing ordered. It is lost at the end of the turn.`,
    });
  }

  if (rotOutstanding(campaign)) {
    owed.push({ step: 'check-for-rot', says: 'Somebody at 0 Health hasn’t made a Rot check.' });
  }

  // Under the Viral origin, everybody carrying Infection checks too (pg. 123; R99).
  if (infectionStillToCheck(campaign).length > 0) {
    owed.push({
      step: 'check-for-rot',
      says: 'Somebody carrying Infection hasn’t made an Infection check.',
    });
  }

  if (!survivorsFed(campaign)) {
    owed.push({ step: 'feed-your-survivors', says: 'The community hasn’t eaten.' });
  }

  if (!storageChecked(campaign) && anythingOverCap(campaign)) {
    owed.push({ step: 'check-storage', says: 'Something is over its storage cap.' });
  }

  if (!hordeChecked(campaign)) {
    owed.push({ step: 'check-the-horde', says: 'The horde hasn’t been checked.' });
  }

  // The Lost first, then the Unrest check (R106; Z7-7).
  if (goingLost(campaign).length > 0) {
    owed.push({ step: 'departures', says: 'Somebody at 13 or more Madness hasn’t gone Lost.' });
  }

  if (someoneIsLeaving(campaign) && !someoneDeparted(campaign)) {
    owed.push({ step: 'departures', says: 'Somebody is leaving and hasn’t gone.' });
  }

  if (laborShortfall(campaign) > 0) {
    owed.push({
      step: 'departures',
      says: `This turn is ${String(laborShortfall(campaign))} Labor short of what it ordered, and a project has to go unfinished.`,
    });
  }

  return owed;
}

/**
 * What moving on would leave owed behind: everything owed from this step up to
 * the one the move lands on, that one not included.
 *
 * Next passes this step only; skipping to the next phase passes the rest of
 * this one. Both ask first when this is not empty (#234), from the same
 * `outstanding` the End-turn dialog reads, so a step that is not owed there
 * is never asked about here. Owed steps already behind are not asked about
 * again: the progress list marks them, and End turn names them.
 *
 * Empty when the move ends the turn, because the End-turn dialog asks about
 * the whole turn instead. That needs no test of its own: a move that ends the
 * turn lands on its first step, so nothing is at or after here and before it.
 */
export function owedOnLeaving(campaign: Campaign, by: AdvanceBy): readonly Outstanding[] {
  const from = positionOf(campaign.step);
  const to = positionOf(advance(campaign.step, by).step);
  return outstanding(campaign).filter((entry) => {
    const at = positionOf(entry.step);
    return at >= from && at < to;
  });
}
