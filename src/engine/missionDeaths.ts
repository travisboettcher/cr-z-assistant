/**
 * A survivor who dies on a mission (pp. 31, 34; R71; Z5-13).
 *
 * The tracker does not play the mission, so a death is the table's to record,
 * with the team's outcome (#236, R3), because it is part of how the mission
 * ended: `deathsProblem` asks it of the outcome form before anything is
 * recorded. One recorded later, once the outcome is in, is `deathProblem`'s. What the survivor carried stays on the map
 * with them, and is lost, unless somebody else on the team took it before the
 * map was left: then that survivor carries it home (R71). The survivor leaves
 * the roster with a cause of their own, beside a Rot death's and a removal's
 * (#201), and their task goes with them.
 *
 * Pure, like the rest of `src/engine`.
 */

import { withoutAssignment } from './assignments';
import type { Campaign, Survivor } from './campaign';
import { logged } from './log';
import { deployed, missionTeams, teamOutcomes } from './missions';
import { phaseOf } from './turn';

/** Who died on which team's mission, and who took each item taken from them, by item id. */
export interface MissionDeath {
  readonly team: number;
  readonly survivor: string;
  readonly taken: Readonly<Record<string, string>>;
}

/** Who went out on this team's mission, in roster order. */
export function wentOut(campaign: Campaign, team: number): readonly Survivor[] {
  const out = new Set(deployed(campaign).map((survivor) => survivor.id));

  return (
    missionTeams(campaign).find((candidate) => candidate.team === team)?.members ?? []
  ).filter((survivor) => out.has(survivor.id));
}

/** Why this death cannot be recorded, or `null`. */
export function deathProblem(campaign: Campaign, death: MissionDeath): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Record deaths on a mission in the Mission Phase.';
  }
  if (!teamOutcomes(campaign).has(death.team))
    return `Record mission team ${String(death.team)}’s outcome first.`;

  return memberProblem(campaign, death);
}

/**
 * Why these deaths cannot be recorded with this team's outcome, or `null`
 * (#236, R3): asked before the outcome is in, because one press records both.
 *
 * Each is a death `deathProblem` would take once the outcome is recorded, and
 * between them nobody dies twice and nothing is taken home by somebody who
 * did not come home. That last is what lets them be recorded one after
 * another in any order: no death moves an item to a survivor a later one
 * takes off the roster.
 */
export function deathsProblem(
  campaign: Campaign,
  team: number,
  deaths: readonly MissionDeath[],
): string | null {
  const dead = new Set(deaths.map((death) => death.survivor));

  if (deaths.some((death) => death.team !== team)) {
    return `Only somebody who went out with mission team ${String(team)} dies on its mission.`;
  }
  if (dead.size !== deaths.length) return 'Each survivor dies once.';

  for (const death of deaths) {
    const problem = memberProblem(campaign, death);
    if (problem !== null) return problem;

    if (Object.values(death.taken).some((taker) => dead.has(taker))) {
      // Present: `memberProblem` found them on the team.
      const name = (
        campaign.survivors.find((survivor) => survivor.id === death.survivor) as Survivor
      ).name;

      return `Only somebody who came home takes an item from ${name}.`;
    }
  }

  return null;
}

/** Why this death is not one of the team's, or takes what is not theirs to take, or `null`. */
function memberProblem(campaign: Campaign, death: MissionDeath): string | null {
  const team = String(death.team);
  const members = wentOut(campaign, death.team);
  const dead = members.find((survivor) => survivor.id === death.survivor);
  if (dead === undefined)
    return `Only somebody who went out with mission team ${team} dies on its mission.`;

  for (const [item, taker] of Object.entries(death.taken)) {
    if (!dead.items.some((held) => held.id === item)) {
      return `Only what ${dead.name} carried can be taken from them.`;
    }
    if (taker === dead.id || !members.some((survivor) => survivor.id === taker)) {
      return `Only somebody else on mission team ${team} takes an item from ${dead.name}.`;
    }
  }

  return null;
}

/**
 * The campaign with the death recorded: each item taken moved to its taker,
 * the survivor off the roster, and the rest of what they carried lost. Assumes
 * the check passed.
 */
export function withMissionDeath(campaign: Campaign, death: MissionDeath, at: string): Campaign {
  // Present: `deathProblem` found them on the team.
  const dead = campaign.survivors.find((survivor) => survivor.id === death.survivor) as Survivor;
  const named = (id: string) =>
    (campaign.survivors.find((survivor) => survivor.id === id) as Survivor).name;
  const taken = dead.items.filter((item) => Object.hasOwn(death.taken, item.id));
  const lost = dead.items.filter((item) => !Object.hasOwn(death.taken, item.id));

  const handed = taken.reduce(
    (current, item) =>
      logged(
        {
          ...current,
          survivors: current.survivors.map((survivor) =>
            survivor.id === death.taken[item.id]
              ? { ...survivor, items: [...survivor.items, item] }
              : survivor,
          ),
        },
        at,
        {
          kind: 'item-moved',
          id: item.id,
          item: item.item,
          grade: item.grade,
          from: { survivor: dead.id, name: dead.name },
          to: {
            survivor: death.taken[item.id] as string,
            name: named(death.taken[item.id] as string),
          },
        },
      ),
    campaign,
  );

  return logged(
    {
      ...handed,
      survivors: handed.survivors.filter((survivor) => survivor.id !== dead.id),
      assignments: withoutAssignment(handed.assignments, dead.id),
    },
    at,
    {
      kind: 'survivor-left',
      survivor: dead.id,
      name: dead.name,
      tier: dead.tier,
      cause: 'killed',
      team: death.team,
      ...(lost.length === 0 ? {} : { lost }),
    },
  );
}
