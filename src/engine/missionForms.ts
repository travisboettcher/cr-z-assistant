/**
 * The Mission Phase's forms, each guard, change and entry in one place (#179).
 *
 * The mission itself is played on the table and the tracker does not run it.
 * What it records is how a Siege Defense or a Thin the Herd ended (pp. 81, 86),
 * and who stands in for somebody the siege took off their work (pg. 23, the
 * FAQ's "Siege Defense and Labor"; #183). Neither changes anything on the
 * campaign but its log: what they do to the turns since the last siege, and to
 * the Labor of the orders the siege interrupted, is read back from the entries
 * by `siege.ts` and `siegeWork.ts`.
 *
 * Moved out of `campaignStore.ts` without changing what either accepts or
 * refuses. The shape of what they return is `forms.ts`'s.
 */

import type { Campaign, Survivor } from './campaign';
import { accepted, refused, type FormResult } from './forms';
import { logged } from './log';
import { missionOutcomeProblem, type MissionOutcome } from './siege';
import { standInProblem } from './siegeWork';

/**
 * Record how this turn's Siege Defense or Thin the Herd ended (pp. 81, 86).
 *
 * The counts the table made at the end of the mission, and nothing worked out
 * from them; the outcome is its own entry. Refused for whatever
 * `missionOutcomeProblem` says — outside the Mission Phase, a second time in a
 * turn, for a mission the turn is not playing, and for a count that is not a
 * whole number.
 */
export function submitMissionOutcome(
  campaign: Campaign,
  outcome: MissionOutcome,
  at: string,
): FormResult {
  const problem = missionOutcomeProblem(campaign, outcome);

  return problem === null ? accepted(logged(campaign, at, outcome)) : refused(problem);
}

/** A place the siege emptied, and who fills it. */
export interface StandInForm {
  /** The casualty whose place it is — the place is the subject. */
  readonly survivor: string;

  /** Who stands in, or `null` to leave the place empty again. */
  readonly by: string | null;
}

/**
 * Fill a place this turn's siege emptied with a fit mission-team survivor, or
 * leave it empty again (pg. 23; #183).
 *
 * Checked against `standInProblem` rather than trusted from the screen. The
 * entry names both, as they were at the time; a place left empty again names
 * only the casualty.
 */
export function submitStandIn(campaign: Campaign, form: StandInForm, at: string): FormResult {
  const by = form.by ?? undefined;
  const problem = standInProblem(campaign, form.survivor, by);
  if (problem !== null) return refused(problem);

  // Both present by now: `standInProblem` has found the casualty among the
  // fallen and the stand-in among the candidates, both of which are read off
  // this roster.
  const named = (id: string) =>
    (campaign.survivors.find((survivor) => survivor.id === id) as Survivor).name;
  const standIn = by === undefined ? {} : { by, byName: named(by) };

  return accepted(
    logged(campaign, at, {
      kind: 'stood-in',
      survivor: form.survivor,
      name: named(form.survivor),
      ...standIn,
    }),
  );
}
