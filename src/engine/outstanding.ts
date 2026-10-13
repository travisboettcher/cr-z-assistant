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
import type { Campaign } from './campaign';
import { moveOwed } from './claim';
import { survivorsFed } from './feeding';
import { healthAwards, woundsHealed } from './healing';
import { materialsAdded } from './materials';
import { firstMissionFailed, missionsChosen, unresolvedTeams } from './missions';
import { dueProjects, laborShortfall, siegeLaborShortfall } from './projects';
import { continuationOpen, overrunChoiceOwed } from './overrun';
import { mustCheck, rotCheckResolved } from './rot';
import { hordeChecked } from './siege';
import { anythingOverCap, storageChecked } from './storage';
import { someoneDeparted, someoneIsLeaving } from './departures';
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

  // Every team that chose a mission owes its outcome (Z4-3): what it counted
  // is what its rewards, the turns since the last siege among them, are read
  // from. Before Z4-3 only a siege was owed, because only a siege was known to
  // have been played.
  for (const team of unresolvedTeams(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: `Mission team ${String(team)}’s outcome is not recorded.`,
    });
  }

  // An overrun base owes how the community goes on, straight after the siege
  // and again after a way on that failed (pg. 86; R27, R28; Z4-9).
  if (overrunChoiceOwed(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: 'The base is overrun, and how the community goes on is not chosen.',
    });
  }

  // A community that left its survivors behind owes its new community's First
  // Mission once it is built (R31; Z4-11). The other ways on choose their
  // mission with the way on, so are never left here.
  if (continuationOpen(campaign)) {
    owed.push({
      step: 'tactical-mission',
      says: 'The new community’s First Mission is not chosen.',
    });
  }

  // A First Mission that met no end condition is played again in turn 1 (R21).
  if (firstMissionFailed(campaign)) {
    owed.push({ step: 'select-mission', says: 'The First Mission failed, and is played again.' });
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
          ? 'A rescued stranger has not joined the community.'
          : `${String(waiting)} rescued strangers have not joined the community.`,
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
          ? 'A survivor brought back has not rejoined the community.'
          : `${String(returning)} survivors brought back have not rejoined the community.`,
    });
  }

  if (projectsOutstanding(campaign)) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: 'Projects ordered last turn are due and have not been finished.',
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
      says: 'The community has not moved into the base its claim won.',
    });
  }

  if (!materialsAdded(campaign)) {
    owed.push({
      step: 'add-materials-to-storage',
      says: 'This turn’s haul has not gone into storage.',
    });
  }

  if (!woundsHealed(campaign) && healthAwards(campaign).length > 0) {
    owed.push({ step: 'heal-wounds', says: 'Health this turn makes has not been handed out.' });
  }

  if (rotOutstanding(campaign)) {
    owed.push({ step: 'check-for-rot', says: 'Somebody at 0 Health has not checked for Rot.' });
  }

  if (!survivorsFed(campaign)) {
    owed.push({ step: 'feed-your-survivors', says: 'The community has not eaten.' });
  }

  if (!storageChecked(campaign) && anythingOverCap(campaign)) {
    owed.push({ step: 'check-storage', says: 'Something is over its storage cap.' });
  }

  if (!hordeChecked(campaign)) {
    owed.push({ step: 'check-the-horde', says: 'The horde has not been checked for.' });
  }

  if (someoneIsLeaving(campaign) && !someoneDeparted(campaign)) {
    owed.push({ step: 'departures', says: 'Somebody is leaving and has not gone.' });
  }

  if (laborShortfall(campaign) > 0) {
    owed.push({
      step: 'departures',
      says: `This turn is ${String(laborShortfall(campaign))} Labor short of what it ordered, and a project has to go unfinished.`,
    });
  }

  return owed;
}
