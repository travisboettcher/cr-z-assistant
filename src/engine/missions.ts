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
import { MISSIONS, type MissionId, type StandardMissionId } from '../data/missions';
import { TIERS, type Tier } from '../data/tiers';
import { beforePlanning } from './assignments';
import type { Campaign, Survivor } from './campaign';
import type { CampaignEvent } from './log';
import { FIRST_TURN, siegeDue } from './siege';
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
 * is corrected — until the team's outcome is recorded: a mission that has been
 * played is not chosen again, except a failed First Mission (R21).
 */
export function selectionProblem(campaign: Campaign, choice: MissionChoice): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is chosen in the Mission Phase.';

  if (!Object.hasOwn(MISSIONS, choice.mission)) return 'There is no such mission.';

  if (!missionTeams(campaign).some((team) => team.team === choice.team)) {
    return 'Only a mission team with somebody on it chooses a mission.';
  }

  if (teamOutcomes(campaign).has(choice.team) && !retryOwed(campaign, choice.team)) {
    return `Mission team ${String(choice.team)}’s mission is played and its outcome recorded.`;
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
 * not once a team's mission has been played; and not twice.
 */
export function skipProblem(campaign: Campaign): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is skipped in the Mission Phase.';
  if (campaign.turn === FIRST_TURN) return 'Turn 1’s First Mission cannot be skipped.';
  if (siegeDue(campaign)) return 'A siege the horde called cannot be skipped.';
  if (turnMissions(campaign).skipped) return 'This turn’s mission is already skipped.';
  if (teamOutcomes(campaign).size > 0) return 'A mission already played cannot be skipped.';

  return null;
}

/** The outcome kinds, one per standard mission and one for every other (Z4-3). */
const OUTCOME_KINDS = [
  'first-mission-resolved',
  'claim-a-new-base-resolved',
  'gather-materials-resolved',
  'thin-the-herd-resolved',
  'retrieve-new-vehicles-resolved',
  'rescue-strangers-resolved',
  'rare-goods-trader-resolved',
  'siege-defense-resolved',
  'mission-played',
] as const;

/**
 * How a team's mission ended, as the table counted it (pp. 77–86; Z4-3).
 *
 * One entry kind per standard mission, shaped as #175 shaped the two that move
 * the siege counter: the counts its rewards read, and never a verdict. Success
 * and failure are read back from the counts — which is also why the missions
 * that name no failure at all need nothing here to say what one would be. A
 * story, origin or Road Trip mission records only that it was played
 * (`mission-played`); its rewards are Phase 7's.
 */
export type MissionOutcome = Extract<
  CampaignEvent,
  { readonly kind: (typeof OUTCOME_KINDS)[number] }
>;

/** The standard mission each standard outcome kind belongs to. */
const OUTCOME_MISSION: Record<
  Exclude<MissionOutcome['kind'], 'mission-played'>,
  StandardMissionId
> = {
  'first-mission-resolved': 'first-mission',
  'claim-a-new-base-resolved': 'claim-a-new-base',
  'gather-materials-resolved': 'gather-materials',
  'thin-the-herd-resolved': 'thin-the-herd',
  'retrieve-new-vehicles-resolved': 'retrieve-new-vehicles',
  'rescue-strangers-resolved': 'rescue-strangers',
  'rare-goods-trader-resolved': 'rare-goods-trader',
  'siege-defense-resolved': 'siege-defense',
};

/** Whether an entry is a mission's outcome. */
export function isMissionOutcome(event: CampaignEvent): event is MissionOutcome {
  return (OUTCOME_KINDS as readonly string[]).includes(event.kind);
}

/** The mission an outcome is the outcome of. */
export function outcomeMission(outcome: MissionOutcome): MissionId {
  return outcome.kind === 'mission-played' ? outcome.mission : OUTCOME_MISSION[outcome.kind];
}

/**
 * The team an outcome ends. A Siege Defense or a Thin the Herd recorded before
 * Z4-3 carries none, and was the turn's only team, which is team 1.
 */
export function outcomeTeam(outcome: MissionOutcome): number {
  return outcome.team ?? 1;
}

/**
 * This turn's recorded outcome for each team that has one, since that team's
 * latest choice.
 *
 * Read in the order things happened: an outcome is the team's until the team
 * chooses again — which only a failed First Mission may (R21) — and an opt-out
 * clears them all, though one cannot be made once anything is played.
 */
export function teamOutcomes(campaign: Campaign): ReadonlyMap<number, MissionOutcome> {
  const outcomes = new Map<number, MissionOutcome>();

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'mission-selected') outcomes.delete(event.team);
    else if (event.kind === 'mission-skipped') outcomes.clear();
    else if (isMissionOutcome(event)) outcomes.set(outcomeTeam(event), event);
  }

  return outcomes;
}

/**
 * The teams that chose a mission this turn and have no outcome recorded, in
 * team order.
 */
export function unresolvedTeams(campaign: Campaign): readonly number[] {
  const outcomes = teamOutcomes(campaign);

  return turnMissions(campaign)
    .choices.map((choice) => choice.team)
    .filter((team) => !outcomes.has(team));
}

/**
 * Whether this team's First Mission failed, so turn 1 plays it again (R21).
 *
 * Failed is no end condition met (pg. 77). Only on turn 1: the First Mission
 * played again later is the overrun base's second continuation (pg. 86), which
 * is #182's.
 */
export function retryOwed(campaign: Campaign, team: number): boolean {
  const outcome = teamOutcomes(campaign).get(team);

  return (
    campaign.turn === FIRST_TURN &&
    outcome?.kind === 'first-mission-resolved' &&
    outcome.endCondition === null
  );
}

/** Everything a Tactical Mission form may count, whichever mission it is for. */
export interface OutcomeCounts {
  readonly endCondition: number | null;
  readonly strangers: readonly Tier[];
  readonly vehiclesOnArea: number;
  readonly materialsCarriedOut: number;
  readonly startingZombies: number;
  readonly zombiesLeft: number;
  readonly survivorsExited: number;
  readonly allIncapacitated: boolean;
  readonly vehiclesDrivenOff: number;
}

/**
 * The outcome entry for a team's choice, from the counts its form gathered —
 * only the counts that mission records (`MISSIONS[…].counts`), under its own
 * kind, and `mission-played` for a mission that is not one of the standard
 * eight. Checked by `missionOutcomeProblem` like any other.
 */
export function outcomeOf(choice: MissionChoice, counts: OutcomeCounts): MissionOutcome {
  const { team } = choice;

  switch (choice.mission) {
    case 'first-mission':
      return {
        kind: 'first-mission-resolved',
        team,
        endCondition: counts.endCondition,
        strangers: counts.strangers,
      };
    case 'claim-a-new-base':
      return {
        kind: 'claim-a-new-base-resolved',
        team,
        endCondition: counts.endCondition,
        strangers: counts.strangers,
        vehiclesOnArea: counts.vehiclesOnArea,
      };
    case 'gather-materials':
      return {
        kind: 'gather-materials-resolved',
        team,
        materialsCarriedOut: counts.materialsCarriedOut,
      };
    case 'thin-the-herd':
      return {
        kind: 'thin-the-herd-resolved',
        team,
        startingZombies: counts.startingZombies,
        zombiesLeft: counts.zombiesLeft,
        survivorsExited: counts.survivorsExited,
        allIncapacitated: counts.allIncapacitated,
      };
    case 'retrieve-new-vehicles':
      return {
        kind: 'retrieve-new-vehicles-resolved',
        team,
        vehiclesDrivenOff: counts.vehiclesDrivenOff,
      };
    case 'rescue-strangers':
      return { kind: 'rescue-strangers-resolved', team, strangers: counts.strangers };
    case 'rare-goods-trader':
      return { kind: 'rare-goods-trader-resolved', team, survivorsExited: counts.survivorsExited };
    case 'siege-defense':
      return {
        kind: 'siege-defense-resolved',
        team,
        zombiesLeft: counts.zombiesLeft,
        survivorsExited: counts.survivorsExited,
      };
    default:
      return { kind: 'mission-played', team, mission: choice.mission };
  }
}

/** Whether any team's First Mission failed this turn, so it is owed again (R21). */
export function firstMissionFailed(campaign: Campaign): boolean {
  return [...teamOutcomes(campaign).keys()].some((team) => retryOwed(campaign, team));
}

/** The counts an outcome records, for the check that each is a whole number. */
function countsOf(outcome: MissionOutcome): readonly number[] {
  switch (outcome.kind) {
    case 'siege-defense-resolved':
      return [outcome.zombiesLeft, outcome.survivorsExited];
    case 'thin-the-herd-resolved':
      return [outcome.startingZombies, outcome.zombiesLeft, outcome.survivorsExited];
    case 'claim-a-new-base-resolved':
      return [outcome.vehiclesOnArea];
    case 'gather-materials-resolved':
      return [outcome.materialsCarriedOut];
    case 'retrieve-new-vehicles-resolved':
      return [outcome.vehiclesDrivenOff];
    case 'rare-goods-trader-resolved':
      return [outcome.survivorsExited];
    default:
      return [];
  }
}

/**
 * Why this outcome cannot be recorded now, or `null` if it can.
 *
 * In the Mission Phase; for a team that chose a mission this turn, and the
 * mission it chose — which is what stopped this guessing: before Z4-2 a turn
 * with a siege due was assumed to be playing the Siege Defense; once per team
 * since its choice, rather than once a turn; with every count a whole number
 * from zero, an end condition the mission has (pp. 77, 79) or none, and a real
 * Tier for each stranger. Nothing else is checked against anything: the counts
 * are what the table counted, and the book gives no rule that two of them must
 * agree. Whether a rescuer could carry a stranger is a warning, not this
 * (`strangerWarning`).
 */
export function missionOutcomeProblem(campaign: Campaign, outcome: MissionOutcome): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'A mission is recorded in the Mission Phase.';

  const team = outcomeTeam(outcome);
  const choice = turnMissions(campaign).choices.find((candidate) => candidate.team === team);

  if (choice === undefined) {
    return `Mission team ${String(team)} has not chosen a mission this turn.`;
  }
  if (outcomeMission(outcome) !== choice.mission) {
    return `That is not the mission team ${String(team)} chose.`;
  }
  if (teamOutcomes(campaign).has(team)) {
    return `Mission team ${String(team)}’s outcome is already recorded.`;
  }

  if (!countsOf(outcome).every((count) => Number.isSafeInteger(count) && count >= 0)) {
    return 'Every count is a whole number, from zero.';
  }

  if ('endCondition' in outcome && outcome.endCondition !== null) {
    const mission: (typeof MISSIONS)[MissionId] = MISSIONS[choice.mission];
    const conditions = 'endConditions' in mission ? mission.endConditions : 0;

    if (
      !Number.isSafeInteger(outcome.endCondition) ||
      outcome.endCondition < 1 ||
      outcome.endCondition > conditions
    ) {
      return `The end condition met is one of 1 to ${String(conditions)}, or none.`;
    }
  }

  if ('strangers' in outcome && !outcome.strangers.every((tier) => TIERS.includes(tier))) {
    return 'Every stranger has a Tier from 1 to 4.';
  }

  return null;
}

/**
 * A warning when a stranger outranks everybody who could have rescued them, or
 * `null` (pg. 31).
 *
 * A rescuer's Tier must be at least the stranger's. A warning rather than a
 * refusal, because the team's Tiers are read as they stand and the table may
 * have counted the rescue differently; the outcome is still what it counted.
 */
export function strangerWarning(campaign: Campaign, outcome: MissionOutcome): string | null {
  if (!('strangers' in outcome)) return null;

  const team = outcomeTeam(outcome);
  const members =
    missionTeams(campaign).find((candidate) => candidate.team === team)?.members ?? [];
  const highest = Math.max(0, ...members.map((survivor) => survivor.tier));
  const beyond = outcome.strangers.filter((tier: Tier) => tier > highest);

  return beyond.length === 0
    ? null
    : `Nobody on mission team ${String(team)} is Tier ${String(Math.max(...beyond))} or higher, and a stranger is rescued by somebody of at least their Tier.`;
}
