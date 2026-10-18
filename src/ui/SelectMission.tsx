/**
 * Select Mission: the mission each team plays this turn (pg. 17; Z4-2).
 *
 * The teams are the Planning Phase's — pg. 21 splits the mission survivors
 * between any number of them — so this step asks only what each team plays,
 * and, for Gather Materials, the type it takes the rest in (pg. 80), and for
 * Claim a New Base, the base it claims (pg. 78; Z4-7). On a siege
 * turn the whole community is one team and its mission is the Siege Defense;
 * on turn 1 it is the First Mission. What is on offer, and why a choice is
 * refused, are `missions.ts`'s answers: this screen renders them.
 *
 * A team's choice is a form until it is recorded, then a record
 * (`docs/step-records.md`, R1; #236): the sentence its entry wrote, with the
 * names it was recorded with rather than whoever is on the team now, and a
 * Change button that reopens the form while `selectionProblem` would still
 * take a new choice. Choosing again appends an entry and the latest wins, so
 * Change is the same press made again on purpose, not an undo. The community
 * may opt out instead, which is when a scavenger goes out (pg. 17).
 */

import { useState } from 'react';
import { BASE_IDS, BASES, type BaseId } from '../data/bases';
import type { Material } from '../data/materials';
import { GATHERED_MATERIALS, MISSIONS, type MissionFamily, type MissionId } from '../data/missions';
import type { Campaign } from '../engine/campaign';
import {
  asksForBase,
  asksForMaterial,
  missionsOnOffer,
  missionTeams,
  selectionProblem,
  skipProblem,
  turnMissions,
  type MissionTeam,
} from '../engine/missions';
import { rareTradeBinds } from '../engine/rareTrade';
import { claimWarning } from '../engine/claim';
import { FIRST_TURN } from '../engine/siege';
import { useCampaign } from '../state/useCampaign';
import { BASE_LABELS, MATERIAL_LABELS } from './baseLabels';
import { describeSelection, MISSION_LABELS } from './missionLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, PRIMARY_FILL, SECONDARY_FILL, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const WARNING = 'text-sm font-medium text-amber-800 dark:text-amber-300';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`;
const CHOSEN = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${SECONDARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`;

const QUIET = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg px-4 py-2 font-medium text-stone-600 enabled:hover:bg-stone-100 dark:text-stone-400 dark:enabled:hover:bg-stone-800`;

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

/** One team's choice of mission: a form until it is recorded, then a record. */
function TeamChoice({
  campaign,
  team,
}: {
  readonly campaign: Campaign;
  readonly team: MissionTeam;
}) {
  const { dispatch } = useCampaign();
  const offered = missionsOnOffer(campaign, team.team);
  const current = turnMissions(campaign).choices.find((choice) => choice.team === team.team);

  const [mission, setMission] = useState<MissionId>(
    current?.mission ?? offered[0] ?? 'thin-the-herd',
  );
  const [material, setMaterial] = useState<Material>(current?.material ?? 'food');
  const [base, setBase] = useState<BaseId>(current?.base ?? 'small-town-home');
  const [changing, setChanging] = useState(false);

  const choice = {
    team: team.team,
    mission,
    ...(asksForMaterial(mission) ? { material } : {}),
    ...(asksForBase(campaign, mission) ? { base } : {}),
  };
  const problem = selectionProblem(campaign, choice);
  const warning =
    problem === null && asksForBase(campaign, mission) ? claimWarning(campaign, base) : null;
  const families = [...new Set(offered.map((id) => MISSIONS[id].family))];
  const missionId = `mission-team-${String(team.team)}`;
  const materialId = `mission-material-${String(team.team)}`;
  const baseId = `mission-base-${String(team.team)}`;

  const members = team.members.map((survivor) => survivor.name);

  if (current !== undefined && !changing) {
    // The engine's answer to "would a new choice be taken": refused once the
    // team's outcome is recorded, except where a retry or a way on reopens it.
    const changeable = selectionProblem(campaign, current) === null;
    const moved =
      members.length !== current.names.length ||
      members.some((name) => !current.names.includes(name));

    return (
      <fieldset className="mt-3 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
        <legend className="px-1 text-sm font-semibold">Mission team {team.team}</legend>

        <p className="text-sm font-medium">
          {describeSelection(current)} <PageRef pages={MISSIONS[current.mission].pages} />
        </p>

        {moved && <p className={HINT}>The team is now {members.join(', ')}.</p>}

        {changeable && (
          <div>
            <button
              type="button"
              className={CHOSEN}
              onClick={() => {
                // From what was recorded, not from a draft left over before it.
                setMission(current.mission);
                setMaterial(current.material ?? 'food');
                setBase(current.base ?? 'small-town-home');
                setChanging(true);
              }}
            >
              Change team {team.team}’s mission
            </button>
          </div>
        )}
      </fieldset>
    );
  }

  return (
    <fieldset className="mt-3 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">Mission team {team.team}</legend>

      <p className="text-sm">{members.join(', ')}</p>

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

      {asksForBase(campaign, mission) && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={baseId}>
            Base to claim
          </label>
          <select
            id={baseId}
            className={SELECT}
            value={base}
            onChange={(changed) => {
              setBase(changed.target.value as BaseId);
            }}
          >
            {BASE_IDS.map((id) => (
              <option key={id} value={id}>
                {BASE_LABELS[id]} (Tier {BASES[id].tier})
              </option>
            ))}
          </select>
          <PageRef pages={78} />
        </div>
      )}

      {problem !== null && <p className={HINT}>{problem}</p>}

      {warning !== null && (
        <p className={WARNING}>
          {warning} <PageRef pages={54} />
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {/*
         * Primary until the team has a mission on the record. After that,
         * choosing again is there for a table that changes its mind, and is
         * not the thing to do now (#231).
         */}
        <button
          type="button"
          className={current === undefined ? PRIMARY : CHOSEN}
          disabled={problem !== null}
          onClick={() => {
            dispatch({ type: 'mission/selected', ...choice, at: new Date().toISOString() });
            setChanging(false);
          }}
        >
          {current === undefined
            ? `Choose for team ${String(team.team)}`
            : `Choose again for team ${String(team.team)}`}
        </button>
        {current !== undefined && (
          <button
            type="button"
            className={QUIET}
            onClick={() => {
              setChanging(false);
            }}
          >
            Keep {MISSION_LABELS[current.mission]}
          </button>
        )}
      </div>
    </fieldset>
  );
}

export function SelectMission({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  /*
   * Turn 1 plays the First Mission and nothing else, so there is nothing to
   * choose (`turnMissions`; #237): this draws neither the team, which is on
   * the First Mission's board, nor the sentence about the Planning Phase that
   * assigned it, which on turn 1 has not happened (#238).
   */
  const firstTurn = campaign.turn === FIRST_TURN;
  const teams = firstTurn ? [] : missionTeams(campaign);
  const { skipped } = turnMissions(campaign);
  const canSkip = skipProblem(campaign) === null;

  return (
    <section aria-label="Select Mission" className="mt-4">
      {!firstTurn && (
        <p className={HINT}>
          Each mission team plays its own mission this turn. The teams are the ones the Planning
          Phase assigned <PageRef pages="17, 21" />
        </p>
      )}

      {/* The trade made last turn binds this turn's first choice (R60; Z5-10). */}
      {rareTradeBinds(campaign) && (
        <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-300">
          A Rare Items trade is under way: the first mission chosen must be the Rare Goods Trader.
          Another, or skipping, loses what was set aside for it <PageRef pages={21} />
        </p>
      )}

      {skipped && (
        <p className="mt-3 text-sm font-medium">
          The community skipped this turn’s mission. Choosing one for a team takes that back{' '}
          <PageRef pages={17} />
        </p>
      )}

      {firstTurn ? null : teams.length === 0 ? (
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

      {canSkip && missionTeams(campaign).length > 0 && (
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
