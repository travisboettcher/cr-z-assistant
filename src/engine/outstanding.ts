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
import { survivorsFed } from './feeding';
import { healthAwards, woundsHealed } from './healing';
import { materialsAdded } from './materials';
import { dueProjects, laborShortfall } from './projects';
import { mustCheck, rotCheckResolved } from './rot';
import { hordeChecked } from './siege';
import { anythingOverCap, storageChecked } from './storage';
import { someoneDeparted, someoneIsLeaving } from './departures';

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

  if (projectsOutstanding(campaign)) {
    owed.push({
      step: 'add-facilities-and-upgrades',
      says: 'Projects ordered last turn are due and have not been finished.',
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
