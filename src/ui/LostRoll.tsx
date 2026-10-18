/**
 * The Lost roll at Select Mission (pp. 25, 124; R108, R150; Z7-8): each Lost
 * survivor's d10 with their XP spent, and on 18 or more the mission team whose
 * area they are placed on as a stranger. Shown while a roll is owed or one was
 * made this turn; what each press may do is `lostRoll.ts`'s answer.
 */

import { useId, useState } from 'react';
import { D10_RESULTS, type D10Result } from '../data/dice';
import { LOST_ROLL_TARGET } from '../data/origins';
import type { Campaign, Survivor } from '../engine/campaign';
import { lostRollPasses, lostRollProblem, lostRollsDue } from '../engine/lostRoll';
import { missionTeams } from '../engine/missions';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from './logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

function LostRollRow({
  campaign,
  survivor,
}: {
  readonly campaign: Campaign;
  readonly survivor: Survivor;
}) {
  const { dispatch } = useCampaign();
  const rollId = useId();
  const teamId = useId();
  const [roll, setRoll] = useState<D10Result | null>(null);
  const teams = missionTeams(campaign);
  const [chosenTeam, setTeam] = useState<number | null>(null);
  const passes = roll !== null && lostRollPasses(survivor, roll);
  const team = passes ? (chosenTeam ?? teams[0]?.team ?? null) : null;
  const problem = roll === null ? null : lostRollProblem(campaign, survivor.id, roll, team);

  return (
    <li className="flex flex-wrap items-center gap-2">
      <label className="text-sm" htmlFor={rollId}>
        {survivor.name}’s d10, with {survivor.xpSpent} XP spent
      </label>
      <select
        id={rollId}
        className={SELECT}
        value={roll ?? ''}
        onChange={(changed) => {
          setRoll(Number(changed.target.value) as D10Result);
        }}
      >
        <option value="" disabled>
          Choose…
        </option>
        {D10_RESULTS.map((result) => (
          <option key={result} value={result}>
            {result}
          </option>
        ))}
      </select>
      {passes && (
        <>
          <label className="text-sm" htmlFor={teamId}>
            joins
          </label>
          <select
            id={teamId}
            className={SELECT}
            value={team ?? ''}
            onChange={(changed) => {
              setTeam(Number(changed.target.value));
            }}
          >
            {teams.map((one) => (
              <option key={one.team} value={one.team}>
                Mission team {one.team}
              </option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        className={BUTTON}
        disabled={roll === null || problem !== null}
        onClick={() => {
          if (roll === null) return;
          dispatch({
            type: 'mission/lostRolled',
            survivor: survivor.id,
            roll,
            team,
            at: new Date().toISOString(),
          });
        }}
      >
        Record {survivor.name}’s roll
      </button>
      {problem !== null && <span className={HINT}>{problem}</span>}
    </li>
  );
}

export function LostRolls({ campaign }: { readonly campaign: Campaign }) {
  const due = lostRollsDue(campaign);
  const rolled = campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'lost-rolled',
  );

  if (due.length === 0 && rolled.length === 0) return null;

  return (
    <section aria-label="The Lost roll" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        The Lost roll <PageRef pages="25, 124" />
      </h4>
      {rolled.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {due.length > 0 && (
        <>
          <p className={HINT}>
            Before the first mission, each Lost survivor rolls a d10 and adds the XP they have
            spent. At <span className="tabular-nums">{LOST_ROLL_TARGET}</span> or more they are on a
            mission area as a stranger, on the mission you choose; anything less gives them 1 XP.
          </p>
          <ul className="flex flex-col gap-2">
            {due.map((survivor) => (
              <LostRollRow key={survivor.id} campaign={campaign} survivor={survivor} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
