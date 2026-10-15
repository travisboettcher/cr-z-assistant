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
 * **It reads Health, and says which.** Since Z4-4 the outcome records the
 * Health everybody ended the siege on, and the panel follows that; a siege
 * recorded before then carries none, and the panel follows the roster. Either
 * way it tells the player which, rather than letting a casualty appear or
 * vanish without a reason on screen (`siegeHealthRecorded`).
 *
 * Shown twice: in the Mission Phase where the siege is recorded, and above the
 * Advancement Phase whose production, healing and projects it changes — a
 * number that drops between one step and the next needs its reason beside it
 * (#143), not three screens back.
 *
 * **Stand-ins are chosen here, in the Mission Phase only.** Nobody went out on
 * an ordinary mission, so the mission team's fit survivors may take a
 * casualty's place (pg. 23, the FAQ). One select per casualty rather than a
 * checkbox list per post, because the rule pairs them: a substitute takes one
 * casualty's place, and "who fills Nell's place in the Kitchen" is the
 * question the table is answering. Outside the Mission Phase the choice is a
 * record, the way `FirstMission` turns into one — the Advancement Phase is
 * already settling the work it changes.
 */

import type { TurnStepId } from '../data/turn';
import type { Assignment, Campaign, Survivor } from '../engine/campaign';
import { beforePlanning, taskOf } from '../engine/assignments';
import { siegeLaborShortfall } from '../engine/projects';
import {
  fellInTheSiege,
  siegeDefended,
  siegeHealthRecorded,
  standInCandidates,
  standInProblem,
  standIns,
} from '../engine/siegeWork';
import { phaseOf } from '../engine/turn';
import { useCampaign } from '../state/useCampaign';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { FOCUS_RING } from './styles';
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
  const standing = standIns(campaign);
  const choosing = phaseOf(campaign.step) === 'mission';
  const candidates = standInCandidates(campaign);

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
        Health works nothing this turn — no Labor and no skills.{' '}
        {siegeHealthRecorded(campaign) ? (
          'This follows the Health recorded with the siege’s outcome.'
        ) : (
          <>
            This follows the Health on the <OpenPanel panel="survivors">roster</OpenPanel>.
          </>
        )}
      </p>

      {fallen.length === 0 ? (
        <p className={`mt-2 ${HINT}`}>
          The siege left nobody working a facility or on the project team at 0 Health, so the
          base&rsquo;s work goes on as assigned.
        </p>
      ) : (
        <>
          {choosing && (
            <p className={`mt-1 ${HINT}`}>
              {candidates.length === 0
                ? 'Nobody on the mission team is fit to stand in for them.'
                : 'Nobody went out on a mission, so somebody from the mission team who isn’t at 0 Health may take a casualty’s place — with their own Labor, or their own skills.'}
            </p>
          )}

          <ul className="mt-2 flex flex-col gap-2">
            {fallen.map((survivor) => {
              // Present by construction: `fellInTheSiege` lists only survivors
              // the same rewound campaign has working. The assertion is the
              // typechecker's price for a lookup that cannot miss.
              const task = taskOf(work, survivor.id) as Assignment;
              const standIn = standing.get(survivor.id);

              return (
                <li key={survivor.id} className="text-sm">
                  <span className="font-medium">{survivor.name}</span>{' '}
                  <span className="text-stone-600 dark:text-stone-400">
                    was {taskLabel(task)},{' '}
                    {standIn === undefined
                      ? 'and works nothing this turn.'
                      : `and ${standIn.name} stands in.`}
                  </span>
                  {choosing && candidates.length > 0 && (
                    <StandInChoice
                      campaign={campaign}
                      fallen={survivor}
                      candidates={candidates}
                      standing={standing}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {short > 0 && (
        <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          Last turn&rsquo;s orders are <span className="tabular-nums">{short}</span> Labor short of
          what the project team can still pay. A project goes unfinished, and the choice is in{' '}
          {STEP_LABELS[FINISH_STEP]} <PageRef pages={23} />
        </p>
      )}
    </section>
  );
}

/**
 * Who fills one casualty's place.
 *
 * A select, because the answer is one survivor or nobody. A candidate already
 * filling another place is shown and disabled with where they are, rather
 * than left out: a name that vanishes from a list reads as a bug, and the
 * reason is one the player can act on by choosing again there.
 */
function StandInChoice({
  campaign,
  fallen,
  candidates,
  standing,
}: {
  readonly campaign: Campaign;
  readonly fallen: Survivor;
  readonly candidates: readonly Survivor[];
  readonly standing: ReadonlyMap<string, Survivor>;
}) {
  const { dispatch } = useCampaign();
  const id = `stand-in-${fallen.id}`;

  /** Whose place each candidate is filling, if not this one. */
  const elsewhere = new Map(
    [...standing.entries()]
      .filter(([place]) => place !== fallen.id)
      .map(([place, standIn]) => [standIn.id, place]),
  );
  const nameOf = (survivorId: string) =>
    campaign.survivors.find((survivor) => survivor.id === survivorId)?.name ?? '';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm">
        Standing in for {fallen.name}
      </label>
      <select
        id={id}
        className={`${FOCUS_RING} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`}
        value={standing.get(fallen.id)?.id ?? ''}
        onChange={(changed) => {
          const by = changed.target.value === '' ? null : changed.target.value;

          // The engine's check, so a choice the select should not have
          // offered writes nothing — the store would refuse it anyway.
          if (standInProblem(campaign, fallen.id, by ?? undefined) !== null) return;

          dispatch({
            type: 'mission/stoodIn',
            survivor: fallen.id,
            by,
            at: new Date().toISOString(),
          });
        }}
      >
        <option value="">Nobody</option>
        {candidates.map((candidate) => {
          const place = elsewhere.get(candidate.id);

          return (
            <option key={candidate.id} value={candidate.id} disabled={place !== undefined}>
              {place === undefined
                ? candidate.name
                : `${candidate.name} (standing in for ${nameOf(place)})`}
            </option>
          );
        })}
      </select>
    </div>
  );
}
