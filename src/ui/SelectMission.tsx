/**
 * Select Mission: the mission each team plays this turn (pg. 17; Z4-2).
 *
 * The teams are the Planning Phase's — pg. 21 splits the mission survivors
 * between any number of them — so this step asks only what each team plays,
 * and, for Gather Materials, the type it takes the rest in (pg. 80). On a siege
 * turn the whole community is one team and its mission is the Siege Defense;
 * on turn 1 it is the First Mission. What is on offer, and why a choice is
 * refused, are `missions.ts`'s answers: this screen renders them.
 *
 * A choice can be made again, which is how one is corrected, and the
 * community may opt out instead, which is when a scavenger goes out (pg. 17).
 */

import { useState } from 'react';
import type { Material } from '../data/materials';
import { GATHERED_MATERIALS, MISSIONS, type MissionFamily, type MissionId } from '../data/missions';
import type { Campaign } from '../engine/campaign';
import {
  asksForMaterial,
  missionsOnOffer,
  missionTeams,
  selectionProblem,
  skipProblem,
  turnMissions,
  type MissionTeam,
} from '../engine/missions';
import { useCampaign } from '../state/useCampaign';
import { MATERIAL_LABELS } from './baseLabels';
import { describeSelection, MISSION_LABELS } from './missionLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

const SECONDARY = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

/** The chapters the catalogue's families come from, for grouping the list. */
const FAMILY_LABELS: Record<MissionFamily, string> = {
  standard: 'Standard missions',
  story: 'Story missions',
  origin: 'Zombie Origin missions',
  'road-trip': 'Road Trip missions',
};

/** A label that opens a list entry rather than sitting inside a sentence. */
const listed = (mission: MissionId): string => {
  const label = MISSION_LABELS[mission];

  return label.charAt(0).toUpperCase() + label.slice(1);
};

function TeamChoice({
  campaign,
  team,
}: {
  readonly campaign: Campaign;
  readonly team: MissionTeam;
}) {
  const { dispatch } = useCampaign();
  const offered = missionsOnOffer(campaign);
  const current = turnMissions(campaign).choices.find((choice) => choice.team === team.team);

  const [mission, setMission] = useState<MissionId>(
    current?.mission ?? offered[0] ?? 'thin-the-herd',
  );
  const [material, setMaterial] = useState<Material>(current?.material ?? 'food');

  const choice = {
    team: team.team,
    mission,
    ...(asksForMaterial(mission) ? { material } : {}),
  };
  const problem = selectionProblem(campaign, choice);
  const families = [...new Set(offered.map((id) => MISSIONS[id].family))];
  const missionId = `mission-team-${String(team.team)}`;
  const materialId = `mission-material-${String(team.team)}`;

  return (
    <fieldset className="mt-3 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">Mission team {team.team}</legend>

      <p className="text-sm">{team.members.map((survivor) => survivor.name).join(', ')}</p>

      {current !== undefined && (
        <p className="text-sm font-medium">
          {describeSelection({
            ...current,
            names: team.members.map((survivor) => survivor.name),
          })}{' '}
          <PageRef pages={MISSIONS[current.mission].pages} />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor={missionId}>
          Mission
        </label>
        <select
          id={missionId}
          className={SELECT}
          value={mission}
          onChange={(changed) => {
            setMission(changed.target.value as MissionId);
          }}
        >
          {families.map((family) => (
            <optgroup key={family} label={FAMILY_LABELS[family]}>
              {offered
                .filter((id) => MISSIONS[id].family === family)
                .map((id) => (
                  <option key={id} value={id}>
                    {listed(id)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <PageRef pages={MISSIONS[mission].pages} />
      </div>

      {asksForMaterial(mission) && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={materialId}>
            The rest in
          </label>
          <select
            id={materialId}
            className={SELECT}
            value={material}
            onChange={(changed) => {
              setMaterial(changed.target.value as Material);
            }}
          >
            {GATHERED_MATERIALS.map((type) => (
              <option key={type} value={type}>
                {MATERIAL_LABELS[type]}
              </option>
            ))}
          </select>
          <PageRef pages={80} />
        </div>
      )}

      {problem !== null && <p className={HINT}>{problem}</p>}

      <div>
        <button
          type="button"
          className={PRIMARY}
          disabled={problem !== null}
          onClick={() => {
            dispatch({ type: 'mission/selected', ...choice, at: new Date().toISOString() });
          }}
        >
          {current === undefined
            ? `Choose for team ${String(team.team)}`
            : `Choose again for team ${String(team.team)}`}
        </button>
      </div>
    </fieldset>
  );
}

export function SelectMission({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const teams = missionTeams(campaign);
  const { skipped } = turnMissions(campaign);
  const canSkip = skipProblem(campaign) === null;

  return (
    <section aria-label="Select Mission" className="mt-4">
      <p className={HINT}>
        Each mission team plays its own mission this turn. The teams are the ones the Planning Phase
        assigned <PageRef pages="17, 21" />
      </p>

      {skipped && (
        <p className="mt-3 text-sm font-medium">
          The community skipped this turn’s mission. Choosing one for a team takes that back{' '}
          <PageRef pages={17} />
        </p>
      )}

      {teams.length === 0 ? (
        <p className={`mt-3 ${HINT}`}>Nobody is on a mission team this turn.</p>
      ) : (
        teams.map((team) => (
          // Keyed by turn as well, so a form left open across the turn boundary
          // starts again from the new turn's offer rather than last turn's pick.
          <TeamChoice
            key={`${String(campaign.turn)}-${String(team.team)}`}
            campaign={campaign}
            team={team}
          />
        ))
      )}

      {canSkip && teams.length > 0 && (
        <button
          type="button"
          className={`mt-3 ${SECONDARY}`}
          onClick={() => {
            dispatch({ type: 'mission/skipped', at: new Date().toISOString() });
          }}
        >
          Skip this turn’s mission
        </button>
      )}
    </section>
  );
}
