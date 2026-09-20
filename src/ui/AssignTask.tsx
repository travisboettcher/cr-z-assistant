/**
 * Give this task to some of the community, and see what everyone else is doing.
 *
 * Used twice, for the two things Z3-5 made derivable: who works a facility, and
 * who is on the project team. Both are the same question asked of the same
 * roster, so they are one control rather than two that drift.
 *
 * **Checkboxes rather than a picker**, because more than one survivor can hold
 * the same task — a Med Lab sums its staff's Medicine (pg. 73) and the project
 * team is a team. A select would have quietly capped both at one.
 *
 * Each row says what that survivor is doing *instead*, when it is something
 * else. That is the one-task rule (pg. 20) made visible rather than explained:
 * ticking somebody here takes them off whatever they were doing, and the screen
 * says so before the click rather than after it.
 *
 * **A warned row is never disabled.** Resting at full Health or sending an
 * injured survivor on a mission are rules a table may play differently, and
 * `checkAssignment` returns them as warnings with no blockers at all. Z2-8
 * learned this the hard way: it reached for `permitted()` on a free, reversible
 * action and turned advice into refusal. A tick that can be unticked needs no
 * override — it needs to say what it is about to do.
 */

import { useId } from 'react';
import type { Assignment, Campaign } from '../engine/campaign';
import { sameTask } from '../engine/assignments';
import { checkAssignment } from '../engine/planning';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { taskLabel } from './taskLabels';
import { FOCUS_RING } from './styles';

export interface AssignTaskProps {
  readonly campaign: Campaign;
  /** The task a ticked box gives. */
  readonly task: Assignment;
  readonly legend: string;
  readonly pages: number | string;
}

export function AssignTask({ campaign, task, legend, pages }: AssignTaskProps) {
  const { dispatch } = useCampaign();
  const groupId = useId();

  return (
    <fieldset className="mt-3">
      <legend id={groupId} className="text-sm font-medium">
        {legend} <PageRef pages={pages} />
      </legend>

      {campaign.survivors.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Nobody in the community yet.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {campaign.survivors.map((survivor) => {
            const current = campaign.assignments[survivor.id];
            const here = current !== undefined && sameTask(current, task);
            const elsewhere = current !== undefined && !here ? taskLabel(current) : null;
            const { warnings } = checkAssignment(campaign, survivor.id, task);

            return (
              <li key={survivor.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={here}
                    onChange={() => {
                      dispatch(
                        here
                          ? { type: 'assignment/cleared', survivor: survivor.id }
                          : { type: 'assignment/set', survivor: survivor.id, assignment: task },
                      );
                    }}
                    className={`${FOCUS_RING} size-5 rounded border-stone-300 dark:border-stone-600`}
                  />
                  <span>{survivor.name}</span>
                  {elsewhere !== null && (
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      currently {elsewhere}
                    </span>
                  )}
                </label>

                {/*
                 * Under the row rather than beside it: a warning is a sentence,
                 * and a sentence on the end of a name is a name nobody can
                 * scan. Shown whether or not the box is ticked, because the
                 * useful moment is before the click.
                 */}
                {warnings.map((warning) => (
                  <p
                    key={warning.code}
                    className="mt-0.5 ml-7 text-xs text-amber-700 dark:text-amber-300"
                  >
                    {warning.message} <PageRef pages={warning.pages} />
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
