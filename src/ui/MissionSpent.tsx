/**
 * What each team's mission used up or lost (pp. 40, 45–48; R37; Z5-5).
 *
 * A block per team still carrying something, a checkbox per item. One-mission
 * gear is ticked and fixed, because it goes whatever happened; a disposable
 * starts ticked, because carrying one out and back is the exception; anything
 * else starts clear, and ticking it says it was lost. What may be recorded is
 * `spent.ts`'s answer: this screen renders it.
 *
 * A form until recorded, then a record (`docs/step-records.md`, R3; #236):
 * once for each mission a team plays, and offered once its outcome is in,
 * because a death recorded with the outcome takes the dead's gear first.
 * Nothing ticked is an answer, recorded the same way.
 */

import { useState } from 'react';
import type { Campaign } from '../engine/campaign';
import { missionTeams, teamOutcomes } from '../engine/missions';
import {
  alwaysSpent,
  spentItems,
  spentProblem,
  spentRecorded,
  teamCarries,
  offeredAsUsed,
  type Carried,
} from '../engine/spent';
import { useCampaign } from '../state/useCampaign';
import { describeItem } from '../labels/equipmentLabels';
import { describeEvent } from '../labels/logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

export function MissionSpent({ campaign }: { readonly campaign: Campaign }) {
  const recorded = campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'items-spent',
  );
  const outcomes = teamOutcomes(campaign);
  const teams = missionTeams(campaign)
    .filter((team) => outcomes.has(team.team) && !spentRecorded(campaign, team.team))
    .map((team) => ({ team: team.team, carried: teamCarries(campaign, team.team) }))
    .filter(({ carried }) => carried.length > 0);

  if (teams.length === 0 && recorded.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {teams.map(({ team, carried }) => (
        <TeamSpent key={team} campaign={campaign} team={team} carried={carried} />
      ))}
    </div>
  );
}

function TeamSpent({
  campaign,
  team,
  carried,
}: {
  readonly campaign: Campaign;
  readonly team: number;
  readonly carried: readonly Carried[];
}) {
  const { dispatch } = useCampaign();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(carried.filter(({ item }) => offeredAsUsed(item)).map(({ item }) => item.id)),
  );
  const chosen = carried.map(({ item }) => item.id).filter((id) => ticked.has(id));
  const problem = spentProblem(campaign, team, chosen);
  const nothing = spentItems(campaign, team, chosen).length === 0;

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">What mission team {team} used</legend>
      <p className={HINT}>
        Tick what was used up or lost. It leaves whoever carried it, and anything left clear stays
        with them <PageRef pages="40, 45–48" />
      </p>

      <ul className="flex flex-col gap-1">
        {carried.map(({ survivor, item }) => {
          const fixed = alwaysSpent(item);

          return (
            <li key={item.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={FOCUS_RING}
                  checked={fixed || ticked.has(item.id)}
                  disabled={fixed}
                  onChange={(changed) => {
                    const next = new Set(ticked);
                    if (changed.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    setTicked(next);
                  }}
                />
                {survivor.name}: {describeItem(item)}{' '}
                {fixed && <span className={HINT}>(lasts one mission)</span>}
              </label>
            </li>
          );
        })}
      </ul>

      {problem !== null && <p className={HINT}>{problem}</p>}

      <div>
        <button
          type="button"
          className={BUTTON}
          disabled={problem !== null}
          onClick={() => {
            dispatch({
              type: 'mission/itemsSpent',
              team,
              items: chosen,
              at: new Date().toISOString(),
            });
          }}
        >
          {nothing ? `Team ${String(team)} used nothing` : `Record what team ${String(team)} used`}
        </button>
      </div>
    </fieldset>
  );
}
