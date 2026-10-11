/**
 * Who still works on a siege turn (pg. 23, and the FAQ entry "Siege Defense
 * and Labor").
 *
 * Projects and staffed facilities keep running through a Siege Defense, and a
 * survivor it left at 0 Health works nothing that turn — see `siegeWork.ts`
 * for why that does not contradict pg. 85 deploying everybody. This is where
 * the player sees it happen, once the outcome is recorded: who fell from which
 * post, and what it costs the turn.
 *
 * **It reads Health, and says so.** The outcome does not record who went down,
 * and wounds are entered on the roster. So the panel tells the player that it
 * follows the roster, rather than letting a casualty appear or vanish without
 * a reason on screen.
 *
 * Shown twice: in the Mission Phase where the siege is recorded, and above the
 * Advancement Phase whose production, healing and projects it changes — a
 * number that drops between one step and the next needs its reason beside it
 * (#143), not three screens back.
 */

import type { TurnStepId } from '../data/turn';
import type { Assignment, Campaign } from '../engine/campaign';
import { beforePlanning, taskOf } from '../engine/assignments';
import { siegeLaborShortfall } from '../engine/projects';
import { fellInTheSiege, siegeDefended } from '../engine/siegeWork';
import { PageRef } from './PageRef';
import { taskLabel } from './taskLabels';
import { STEP_LABELS } from './turnLabels';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

/** Where the projects a siege left short are chosen between. */
const FINISH_STEP: TurnStepId = 'add-facilities-and-upgrades';

export function SiegeWork({ campaign }: { readonly campaign: Campaign }) {
  if (!siegeDefended(campaign)) return null;

  const fallen = fellInTheSiege(campaign);
  const work = beforePlanning(campaign);
  const short = siegeLaborShortfall(campaign);

  return (
    <section
      aria-labelledby="siege-work-heading"
      className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-700"
    >
      <h3 id="siege-work-heading" className="text-sm font-semibold">
        Who still works this turn <PageRef pages={23} />
      </h3>

      <p className={`mt-1 ${HINT}`}>
        Projects and staffed facilities keep running through a siege, but anybody it left at 0
        Health works nothing this turn — no Labor and no skills. This follows the Health on the
        roster below.
      </p>

      {fallen.length === 0 ? (
        <p className={`mt-2 ${HINT}`}>
          Nobody working a facility or on the project team is at 0 Health, so the base&rsquo;s work
          goes on as assigned.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {fallen.map((survivor) => {
            // Present by construction: `fellInTheSiege` lists only survivors
            // the same rewound campaign has working. The assertion is the
            // typechecker's price for a lookup that cannot miss.
            const task = taskOf(work, survivor.id) as Assignment;

            return (
              <li key={survivor.id} className="text-sm">
                <span className="font-medium">{survivor.name}</span>{' '}
                <span className="text-stone-600 dark:text-stone-400">
                  was {taskLabel(task)}, and works nothing this turn.
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {short > 0 && (
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          Last turn&rsquo;s orders are <span className="tabular-nums">{short}</span> Labor short
          without them. A project goes unfinished, and the choice is in {STEP_LABELS[FINISH_STEP]}{' '}
          <PageRef pages={23} />
        </p>
      )}
    </section>
  );
}
