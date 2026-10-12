/**
 * How each team's mission ended (pp. 77–86; Z4-3).
 *
 * The mission is still played on the table, and this is what the app needs
 * back from it: the counts each mission's rewards read. One form per team that
 * chose a mission at Select Mission, built from what that mission records in
 * the catalogue (`MISSIONS[…].counts`), so a Gather Materials team is asked
 * what it carried off and a Siege Defense what was left standing. A story,
 * origin or Road Trip mission records only that it was played.
 *
 * The form records counts and nothing it works out from them. What they do —
 * the counter reset or halved, the base overrun, the next horde roll made
 * certain, the First Mission played again — is shown under the fields before
 * the press, from the same engine functions that will read the entry back, so
 * the line on screen is the line the log keeps.
 */

import { useState } from 'react';
import { MISSIONS, type MissionId, type OutcomeCount } from '../data/missions';
import { TIERS, type Tier } from '../data/tiers';
import type { Campaign } from '../engine/campaign';
import {
  missionOutcomeProblem,
  outcomeOf,
  strangerWarning,
  teamOutcomes,
  turnMissions,
  type MissionChoice,
} from '../engine/missions';
import { useCampaign } from '../state/useCampaign';
import {
  COUNT_LABELS,
  describeOutcome,
  MISSION_LABELS,
  outcomeConsequences,
  outcomePages,
} from './missionLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const WARNING = 'text-sm font-medium text-amber-800 dark:text-amber-300';

const FIELD = `${FOCUS_RING} w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-800`;

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

const SECONDARY = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

/** An empty field is no count at all, rather than the 0 `Number('')` makes it. */
const count = (typed: string): number => (typed.trim() === '' ? Number.NaN : Number(typed));

/** The counts a mission's form asks for: the catalogue's, or none for a mission it lists only. */
function countsFor(mission: MissionId): readonly OutcomeCount[] {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return entry.family === 'standard' ? entry.counts : [];
}

/** How many numbered end conditions a mission has (pp. 77, 79). */
function endConditionsOf(mission: MissionId): number {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return 'endConditions' in entry ? entry.endConditions : 0;
}

/** What the form says above its fields, for the two missions that move the siege counter. */
const HINTS: Partial<Record<MissionId, string>> = {
  'siege-defense':
    'Count what was on the mission area when it ended, and who got out over the map edge. Whether the turns since the last siege go back to 0 depends on it.',
  'thin-the-herd':
    'Count what was on the mission area at the start and at the end, and who got out over the map edge. It can reset or halve the turns since the last siege.',
};

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

function TeamOutcome({
  campaign,
  choice,
  named,
}: {
  readonly campaign: Campaign;
  readonly choice: MissionChoice;
  /** Whether to name the team, which only matters when there is more than one. */
  readonly named: boolean;
}) {
  const { dispatch } = useCampaign();
  const [numbers, setNumbers] = useState<Partial<Record<OutcomeCount, string>>>({});
  const [endCondition, setEndCondition] = useState('');
  const [strangers, setStrangers] = useState<readonly Tier[]>([]);
  const [nextStranger, setNextStranger] = useState<Tier>(1);
  const [allDown, setAllDown] = useState(false);

  const asked = countsFor(choice.mission);
  const number = (of: OutcomeCount) => count(numbers[of] ?? '');
  const outcome = outcomeOf(choice, {
    endCondition: endCondition === 'none' ? null : count(endCondition),
    strangers,
    vehiclesOnArea: number('vehicles-on-area'),
    materialsCarriedOut: number('materials-carried-out'),
    startingZombies: number('starting-zombies'),
    zombiesLeft: number('zombies-left'),
    survivorsExited: number('survivors-exited'),
    allIncapacitated: allDown,
    vehiclesDrivenOff: number('vehicles-driven-off'),
  });
  const problem = missionOutcomeProblem(campaign, outcome);
  const warning = problem === null ? strangerWarning(campaign, outcome) : null;
  const label = MISSION_LABELS[choice.mission];
  const prefix = `mission-${String(choice.team)}`;
  const hint =
    HINTS[choice.mission] ??
    (asked.length === 0
      ? 'Its rewards are not tracked yet. Recording it marks the mission played.'
      : 'Record what the table counted when the mission ended.');

  return (
    <fieldset className="mt-4 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">
        {named ? `Mission team ${String(choice.team)}: how ${label} ended` : `How ${label} ended`}{' '}
        <PageRef pages={MISSIONS[choice.mission].pages} />
      </legend>

      <p className={HINT}>{hint}</p>

      {asked.map((of) => {
        switch (of) {
          case 'end-condition':
            return (
              <div key={of} className="flex flex-wrap items-center gap-2">
                <label className="text-sm" htmlFor={`${prefix}-end`}>
                  {COUNT_LABELS[of]}
                </label>
                <select
                  id={`${prefix}-end`}
                  className={SELECT}
                  value={endCondition}
                  onChange={(changed) => {
                    setEndCondition(changed.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {Array.from({ length: endConditionsOf(choice.mission) }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      {index + 1}
                    </option>
                  ))}
                  <option value="none">None</option>
                </select>
              </div>
            );

          case 'strangers-rescued':
            return (
              <div key={of} className="flex flex-col gap-2">
                <p className="text-sm">
                  {COUNT_LABELS[of]}:{' '}
                  {strangers.length === 0
                    ? 'none'
                    : strangers.map((tier) => `Tier ${String(tier)}`).join(', ')}{' '}
                  <PageRef pages={31} />
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm" htmlFor={`${prefix}-stranger`}>
                    Stranger’s Tier
                  </label>
                  <select
                    id={`${prefix}-stranger`}
                    className={SELECT}
                    value={nextStranger}
                    onChange={(changed) => {
                      setNextStranger(Number(changed.target.value) as Tier);
                    }}
                  >
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => {
                      setStrangers([...strangers, nextStranger]);
                    }}
                  >
                    Add a stranger
                  </button>
                  {strangers.length > 0 && (
                    <button
                      type="button"
                      className={SECONDARY}
                      onClick={() => {
                        setStrangers(strangers.slice(0, -1));
                      }}
                    >
                      Remove the last
                    </button>
                  )}
                </div>
              </div>
            );

          case 'all-incapacitated':
            return (
              <label key={of} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={FOCUS_RING}
                  checked={allDown}
                  onChange={(changed) => {
                    setAllDown(changed.target.checked);
                  }}
                />
                {COUNT_LABELS[of]}
              </label>
            );

          default:
            return (
              <CountField
                key={of}
                id={`${prefix}-${of}`}
                label={COUNT_LABELS[of]}
                value={numbers[of] ?? ''}
                onChange={(value) => {
                  setNumbers({ ...numbers, [of]: value });
                }}
              />
            );
        }
      })}

      {warning !== null && <p className={WARNING}>{warning}</p>}
      <p className={HINT}>{problem ?? outcomeConsequences(outcome).join(' ')}</p>

      <button
        type="button"
        className={PRIMARY}
        disabled={problem !== null}
        onClick={() => {
          dispatch({ type: 'mission/resolved', outcome, at: new Date().toISOString() });
        }}
      >
        Record {label}
      </button>
    </fieldset>
  );
}

/** How many times a team has chosen a mission this turn — a key, not a rule. */
function timesChosen(campaign: Campaign, team: number): number {
  return campaign.log.filter(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'mission-selected' &&
      entry.event.team === team,
  ).length;
}

export function MissionOutcome({ campaign }: { readonly campaign: Campaign }) {
  const { choices } = turnMissions(campaign);
  const outcomes = teamOutcomes(campaign);
  const named = choices.length > 1;

  return (
    <>
      {choices.map((choice) => {
        const recorded = outcomes.get(choice.team);

        return recorded === undefined ? (
          // Keyed by how many times the team has chosen, so a First Mission
          // chosen again after a failure (R21) starts its form empty, and
          // another team's entry landing does not clear this one's fields.
          <TeamOutcome
            key={`${String(campaign.turn)}-${String(choice.team)}-${String(timesChosen(campaign, choice.team))}`}
            campaign={campaign}
            choice={choice}
            named={named}
          />
        ) : (
          <p key={choice.team} className="mt-4 text-sm font-medium">
            {describeOutcome(recorded)} <PageRef pages={outcomePages(recorded)} />
          </p>
        );
      })}
    </>
  );
}
