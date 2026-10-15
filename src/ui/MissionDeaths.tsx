/**
 * A survivor who died on a mission (pp. 31, 34; R71; Z5-13).
 *
 * Folded away under each team whose outcome is in, because most missions
 * lose nobody. Open, it asks who died and, for each item they carried,
 * whether it stayed on the map or somebody else on the team took it home.
 * Who may die and who may take what are `missionDeaths.ts`'s answers: this
 * screen renders them.
 */

import { useState } from 'react';
import type { Campaign } from '../engine/campaign';
import { deathProblem, wentOut } from '../engine/missionDeaths';
import { teamOutcomes } from '../engine/missions';
import { useCampaign } from '../state/useCampaign';
import { describeItem } from './equipmentLabels';
import { describeEvent } from './logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

/** The value a lost item's picker holds. */
const LOST = '';

export function MissionDeaths({ campaign }: { readonly campaign: Campaign }) {
  const recorded = campaign.log.filter(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'survivor-left' &&
      entry.event.cause === 'killed',
  );
  const teams = [...teamOutcomes(campaign).keys()]
    .sort((one, other) => one - other)
    .filter((team) => wentOut(campaign, team).length > 0);

  if (teams.length === 0 && recorded.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {teams.map((team) => (
        <TeamDeath key={team} campaign={campaign} team={team} />
      ))}
    </div>
  );
}

function TeamDeath({ campaign, team }: { readonly campaign: Campaign; readonly team: number }) {
  const { dispatch } = useCampaign();
  const members = wentOut(campaign, team);
  const [chosen, setChosen] = useState('');
  const [taken, setTaken] = useState<Readonly<Record<string, string>>>({});
  const dead = members.find((survivor) => survivor.id === chosen) ?? members[0];
  const id = `died-${String(team)}`;

  // Present: the list only renders a team somebody went out with.
  if (dead === undefined) return null;

  const others = members.filter((survivor) => survivor.id !== dead.id);
  const takenFrom = Object.fromEntries(
    dead.items.flatMap((item) => {
      const taker = taken[item.id];

      return taker === undefined || taker === LOST ? [] : [[item.id, taker]];
    }),
  );
  const death = { team, survivor: dead.id, taken: takenFrom };
  const problem = deathProblem(campaign, death);

  return (
    <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <summary className={`${FOCUS_RING} cursor-pointer text-sm font-semibold`}>
        Somebody died on mission team {team}’s mission
      </summary>

      <div className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={id}>
            Who died
          </label>
          <select
            id={id}
            className={SELECT}
            value={dead.id}
            onChange={(changed) => {
              setChosen(changed.target.value);
              setTaken({});
            }}
          >
            {members.map((survivor) => (
              <option key={survivor.id} value={survivor.id}>
                {survivor.name}
              </option>
            ))}
          </select>
        </div>

        {dead.items.length === 0 ? (
          <p className={HINT}>{dead.name} carried nothing.</p>
        ) : (
          <>
            <p className={HINT}>
              What nobody took stays on the map, and is lost <PageRef pages="31, 34" />
            </p>
            <ul className="flex flex-col gap-1">
              {dead.items.map((item) => {
                const pickerId = `${id}-${item.id}`;

                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <label className="text-sm" htmlFor={pickerId}>
                      {describeItem(item)}
                    </label>
                    <select
                      id={pickerId}
                      className={SELECT}
                      value={taken[item.id] ?? LOST}
                      onChange={(changed) => {
                        setTaken({ ...taken, [item.id]: changed.target.value });
                      }}
                    >
                      <option value={LOST}>Lost on the map</option>
                      {others.map((survivor) => (
                        <option key={survivor.id} value={survivor.id}>
                          Taken by {survivor.name}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {problem !== null && <p className={HINT}>{problem}</p>}

        <div>
          <button
            type="button"
            className={BUTTON}
            disabled={problem !== null}
            onClick={() => {
              dispatch({ type: 'mission/survivorKilled', death, at: new Date().toISOString() });
              setChosen('');
              setTaken({});
            }}
          >
            Record {dead.name}’s death
          </button>
        </div>
      </div>
    </details>
  );
}
