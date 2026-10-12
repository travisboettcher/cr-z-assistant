/**
 * What this turn's missions are: the teams that go out, the mission each one
 * chose, and who that puts in the field (pp. 17, 21, 85; Z4-2).
 *
 * ## The teams are the Planning Phase's; the missions are Select Mission's
 *
 * Planning Step 4 assigns survivors to missions for next turn, and pg. 21 lets
 * them be split into any number of teams, each completing its own mission in
 * the same turn. Every `mission`
 * assignment has carried a team number since Phase 3 for exactly this. So a
 * team is formed where the book forms it, and Select Mission — the first step
 * of the turn it goes out on (pg. 17) — records the one thing left to decide:
 * which mission each team plays. A `mission-selected` entry names a team and a
 * mission, and nothing about the team is copied into it but the names, for the
 * history to read.
 *
 * Two turns are different. On a siege turn the whole community deploys
 * (pg. 85), whatever Planning assigned, so it is one team — team 1 — and its
 * mission is the Siege Defense. On turn 1 no Planning Phase has run, and the
 * First Mission's team is the one `FirstMission` assigned at the start of the
 * turn; its mission is the First Mission.
 *
 * ## Read back from the log, and the latest word wins
 *
 * A choice made in error is corrected by choosing again, which appends rather
 * than edits; opting out of the mission (pg. 17) clears every choice before
 * it, and choosing after it takes the opt-out back. A turn with none of these
 * entries is one played before Z4-2, or one whose teams have not chosen yet,
 * and reads as every team going out — which is what every turn read as before.
 *
 * Several missions in one turn are independent (R19): nothing here lets one
 * team's mission read another's.
 */

import { MATERIALS, type Material } from '../data/materials';
import { MISSIONS, type MissionId } from '../data/missions';
import { beforePlanning } from './assignments';
import type { Campaign, Survivor } from './campaign';
import { FIRST_TURN, missionResolved, siegeDue, type MissionOutcome } from './siege';
import { phaseOf } from './turn';

/** A mission team and who is on it. */
export interface MissionTeam {
  readonly team: number;
  readonly members: readonly Survivor[];
}

/** One team's choice at Select Mission. */
export interface MissionChoice {
  readonly team: number;
  readonly mission: MissionId;

  /** The type a Gather Materials team takes its remainder in (pg. 80). */
  readonly material?: Material;
}

/** What Select Mission has recorded this turn. */
export interface TurnMissions {
  /** Each team's latest choice, in team order. */
  readonly choices: readonly MissionChoice[];

  /** Whether the community opted out (pg. 17). */
  readonly skipped: boolean;

  /** Whether anything at all was recorded, which a turn before Z4-2 lacks. */
  readonly recorded: boolean;
}

/** The team the whole community forms when the horde calls a siege (pg. 85). */
const SIEGE_TEAM = 1;

/**
 * This turn's mission teams, in team order (pp. 21, 85).
 *
 * The teams Planning assigned, read through `beforePlanning` because this
 * turn's own Planning Phase clears them and the Advancement Phase still asks
 * who went (see `missionTeam`). On a siege turn, everybody, as one team. A team
 * nobody is on does not exist.
 */
export function missionTeams(campaign: Campaign): readonly MissionTeam[] {
  if (siegeDue(campaign)) {
    return campaign.survivors.length === 0
      ? []
      : [{ team: SIEGE_TEAM, members: campaign.survivors }];
  }

  const assigned = beforePlanning(campaign);
  const teamOf = (survivor: Survivor): number | undefined => {
    const assignment = assigned.assignments[survivor.id];

    return assignment?.task === 'mission' ? assignment.team : undefined;
  };
  const numbers = [
    ...new Set(
      campaign.survivors.flatMap((survivor) => {
        const team = teamOf(survivor);

        return team === undefined ? [] : [team];
      }),
    ),
  ].sort((one, other) => one - other);

  return numbers.map((team) => ({
    team,
    members: campaign.survivors.filter((survivor) => teamOf(survivor) === team),
  }));
}

/**
 * What Select Mission has recorded this turn: the latest choice for each team,
 * unless an opt-out came after it.
 */
export function turnMissions(campaign: Campaign): TurnMissions {
  let choices = new Map<number, MissionChoice>();
  let skipped = false;
  let recorded = false;

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'mission-selected') {
      choices.set(event.team, {
        team: event.team,
        mission: event.mission,
        ...(event.material === undefined ? {} : { material: event.material }),
      });
      skipped = false;
      recorded = true;
    } else if (event.kind === 'mission-skipped') {
      choices = new Map();
      skipped = true;
      recorded = true;
    }
  }

  return {
    choices: [...choices.values()].sort((one, other) => one.team - other.team),
    skipped,
    recorded,
  };
}

/**
 * Who went out on this turn's missions (pp. 18, 85).
 *
 * The survivors on every team that chose a mission; nobody on a turn the
 * community opted out of; and, on a turn Select Mission has recorded nothing
 * for, every team — which is how a turn played before Z4-2 reads, and how the
 * turn's first moments read before anybody has chosen.
 *
 * In roster order, like every list of survivors the screens show.
 *
 * Moved here from `siege.ts`, which answered it before there was a choice to
 * read: the whole community on a siege turn and the assigned team otherwise
 * (#167). `missionTeams` still gives that answer; this narrows it to the teams
 * that actually went.
 */
export function deployed(campaign: Campaign): readonly Survivor[] {
  const teams = missionTeams(campaign);
  // An opt-out empties the choices, so a skipped turn sends nobody without
  // asking about it separately.
  const { choices, recorded } = turnMissions(campaign);
  const went = recorded
    ? teams.filter((team) => choices.some((choice) => choice.team === team.team))
    : teams;
  const ids = new Set(went.flatMap((team) => team.members.map((survivor) => survivor.id)));

  return campaign.survivors.filter((survivor) => ids.has(survivor.id));
}

/** Whether every team has a mission, or the community opted out (pg. 17). */
export function missionsChosen(campaign: Campaign): boolean {
  const { choices, skipped } = turnMissions(campaign);

  return (
    skipped ||
    missionTeams(campaign).every((team) => choices.some((choice) => choice.team === team.team))
  );
}

/**
 * The missions a team may choose this turn, in the catalogue's order.
 *
 * The First Mission on turn 1 (pg. 76), the Siege Defense on a siege turn
 * (pg. 23), and otherwise every mission but those two — the standard ones,
 * which may be chosen on any turn (pg. 75), the story and Road Trip ones,
 * and the origin missions of the campaign's own Origin of the Rot. Their
 * prerequisites inside an origin or a story are Phase 7's.
 *
 * What it does not narrow is R20's: a second Claim a New Base is refused when
 * it is chosen, because which team may have it depends on who asks.
 */
export function missionsOnOffer(campaign: Campaign): readonly MissionId[] {
  if (campaign.turn === FIRST_TURN) return ['first-mission'];
  if (siegeDue(campaign)) return ['siege-defense'];

  return (Object.keys(MISSIONS) as MissionId[]).filter((id) => {
    const mission: (typeof MISSIONS)[MissionId] = MISSIONS[id];

    switch (mission.family) {
      case 'standard':
        return mission.availability === 'any-time';
      case 'origin':
        return mission.origin === campaign.origin;
      default:
        return true;
    }
  });
}

/** Whether a mission asks Select Mission for a material type (pg. 80). */
export function asksForMaterial(mission: MissionId): boolean {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return entry.family === 'standard' && (entry.asks as readonly string[]).includes('material');
}

/**
 * Why this team cannot choose this mission now, or `null` if it can.
 *
 * In the Mission Phase; for a team that exists this turn; for a mission on
 * offer (`missionsOnOffer`); not a second Claim a New Base beside another
 * team's (R20); and with a material type exactly when the mission asks for one.
 * Choosing again for a team that already chose is allowed — it is how a choice
 * is corrected.
 */
export function selectionProblem(campaign: Campaign, choice: MissionChoice): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is chosen in the Mission Phase.';

  if (!Object.hasOwn(MISSIONS, choice.mission)) return 'There is no such mission.';

  if (!missionTeams(campaign).some((team) => team.team === choice.team)) {
    return 'Only a mission team with somebody on it chooses a mission.';
  }

  if (!missionsOnOffer(campaign).includes(choice.mission)) {
    if (campaign.turn === FIRST_TURN) return 'Turn 1’s mission is the First Mission.';
    if (siegeDue(campaign)) return 'This turn’s mission is the Siege Defense the horde called.';
    if (choice.mission === 'siege-defense')
      return 'A Siege Defense is played when the horde calls one.';
    if (choice.mission === 'first-mission') return 'The First Mission is turn 1’s.';

    return 'That mission belongs to another Origin of the Rot.';
  }

  if (
    choice.mission === 'claim-a-new-base' &&
    turnMissions(campaign).choices.some(
      (other) => other.team !== choice.team && other.mission === 'claim-a-new-base',
    )
  ) {
    return 'Another team is already claiming a new base this turn.';
  }

  if (asksForMaterial(choice.mission)) {
    if (choice.material === undefined) {
      return 'Gather Materials needs the type it takes the rest in.';
    }
    if (!MATERIALS.includes(choice.material)) return 'There is no such material.';
  } else if (choice.material !== undefined) {
    return 'Only Gather Materials takes a material type.';
  }

  return null;
}

/**
 * Why the community cannot opt out of this turn's mission, or `null` if it can
 * (pg. 17).
 *
 * Not on turn 1, whose First Mission is how a community gets a base at all
 * (pg. 76); not on a siege turn, whose Siege Defense is the only choice (pg. 23);
 * and not twice.
 */
export function skipProblem(campaign: Campaign): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is skipped in the Mission Phase.';
  if (campaign.turn === FIRST_TURN) return 'Turn 1’s First Mission cannot be skipped.';
  if (siegeDue(campaign)) return 'A siege the horde called cannot be skipped.';
  if (turnMissions(campaign).skipped) return 'This turn’s mission is already skipped.';

  return null;
}

/** The mission each recorded outcome kind belongs to. */
const OUTCOME_MISSION: Record<MissionOutcome['kind'], MissionId> = {
  'siege-defense-resolved': 'siege-defense',
  'thin-the-herd-resolved': 'thin-the-herd',
};

/**
 * Why this outcome cannot be recorded now, or `null` if it can.
 *
 * In the Mission Phase, once a turn, and for a mission a team chose at Select
 * Mission — which is what stopped this guessing: before Z4-2 a turn with a
 * siege due was assumed to be playing the Siege Defense and any other turn but
 * the first was allowed a Thin the Herd. The counts are whole numbers from
 * zero, and nothing else is checked against anything: they are what the table
 * counted, and the book gives no rule that two of them must agree.
 *
 * Moved here from `siege.ts` with `deployed`, because it reads the choice and
 * `siege.ts` cannot import this module without a cycle.
 */
export function missionOutcomeProblem(campaign: Campaign, outcome: MissionOutcome): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is recorded in the Mission Phase.';
  if (missionResolved(campaign)) return 'This turn’s mission is already recorded.';

  const mission = OUTCOME_MISSION[outcome.kind];

  if (!turnMissions(campaign).choices.some((choice) => choice.mission === mission)) {
    return mission === 'siege-defense'
      ? 'Choose the Siege Defense at Select Mission first.'
      : 'No team chose Thin the Herd this turn.';
  }

  const counts =
    outcome.kind === 'siege-defense-resolved'
      ? [outcome.zombiesLeft, outcome.survivorsExited]
      : [outcome.startingZombies, outcome.zombiesLeft, outcome.survivorsExited];

  return counts.every((count) => Number.isSafeInteger(count) && count >= 0)
    ? null
    : 'Every count is a whole number, from zero.';
}
