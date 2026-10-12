/**
 * How this turn's Siege Defense or Thin the Herd ended (pp. 81, 86).
 *
 * The Mission Phase is still played on the table, and this is the one thing
 * the app needs back from it: the counts the turns since the last siege are
 * moved by. Each is asked for when a team chose it at Select Mission (Z4-2):
 * a siege turn's whole community chooses the Siege Defense, and any other
 * turn's team may choose Thin the Herd.
 *
 * The form records counts and nothing it works out from them. What they do —
 * the counter reset or halved, the base overrun, the next horde roll made
 * certain — is shown under the fields before the press, from the same engine
 * functions that will read the entry back, so the line on screen is the line
 * the log keeps.
 */

import { useState } from 'react';
import type { Campaign } from '../engine/campaign';
import { missionOutcomeProblem, turnMissions } from '../engine/missions';
import type { MissionOutcome as Outcome } from '../engine/siege';
import { useCampaign } from '../state/useCampaign';
import { describeOutcome, MISSION_PAGES, outcomeConsequences } from './missionLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const FIELD = `${FOCUS_RING} w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-800`;

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

/** An empty field is no count at all, rather than the 0 `Number('')` makes it. */
const count = (typed: string): number => (typed.trim() === '' ? Number.NaN : Number(typed));

function recordedThisTurn(campaign: Campaign): Outcome | undefined {
  return campaign.log
    .filter((entry) => entry.turn === campaign.turn)
    .map((entry) => entry.event)
    .find(
      (event): event is Outcome =>
        event.kind === 'siege-defense-resolved' || event.kind === 'thin-the-herd-resolved',
    );
}

function CountField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        className={FIELD}
        onChange={(changed) => {
          onChange(changed.target.value);
        }}
      />
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

export function MissionOutcome({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [starting, setStarting] = useState('');
  const [left, setLeft] = useState('');
  const [exited, setExited] = useState('');
  const [allDown, setAllDown] = useState(false);

  const recorded = recordedThisTurn(campaign);

  if (recorded !== undefined) {
    return (
      <p className="mt-4 text-sm font-medium">
        {describeOutcome(recorded)} <PageRef pages={MISSION_PAGES[recorded.kind]} />
      </p>
    );
  }

  // Asked for the mission a team chose at Select Mission, and only those two
  // until Z4-3 gives every mission an outcome: a siege turn's one team plays
  // the Siege Defense, and a Thin the Herd is recorded when a team chose it.
  const chosen = turnMissions(campaign).choices.map((choice) => choice.mission);
  const siege = chosen.includes('siege-defense');

  if (!siege && !chosen.includes('thin-the-herd')) return null;

  const outcome: Outcome = siege
    ? { kind: 'siege-defense-resolved', zombiesLeft: count(left), survivorsExited: count(exited) }
    : {
        kind: 'thin-the-herd-resolved',
        startingZombies: count(starting),
        zombiesLeft: count(left),
        survivorsExited: count(exited),
        allIncapacitated: allDown,
      };
  const problem = missionOutcomeProblem(campaign, outcome);

  return (
    <fieldset className="mt-4 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">
        {siege ? 'How the Siege Defense ended' : 'How the Thin the Herd ended'}{' '}
        <PageRef pages={MISSION_PAGES[outcome.kind]} />
      </legend>

      <p className={HINT}>
        {siege
          ? 'Count what was on the mission area when it ended, and who got out over the map edge. Whether the turns since the last siege go back to 0 depends on it.'
          : 'Count what was on the mission area at the start and at the end, and who got out over the map edge. It can reset or halve the turns since the last siege.'}
      </p>

      {!siege && (
        <CountField
          id="mission-starting-zombies"
          label="zombies at the start"
          value={starting}
          onChange={setStarting}
        />
      )}
      <CountField
        id="mission-zombies-left"
        label="zombies left on the mission area"
        value={left}
        onChange={setLeft}
      />
      <CountField
        id="mission-survivors-exited"
        label="survivors out over the map edge"
        value={exited}
        onChange={setExited}
      />
      {!siege && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={FOCUS_RING}
            checked={allDown}
            onChange={(changed) => {
              setAllDown(changed.target.checked);
            }}
          />
          Every survivor on it was incapacitated
        </label>
      )}

      <p className={HINT}>{problem ?? outcomeConsequences(outcome).join(' ')}</p>

      <button
        type="button"
        className={PRIMARY}
        disabled={problem !== null}
        onClick={() => {
          dispatch({ type: 'mission/resolved', outcome, at: new Date().toISOString() });
        }}
      >
        {siege ? 'Record the Siege Defense' : 'Record the Thin the Herd'}
      </button>
    </fieldset>
  );
}
