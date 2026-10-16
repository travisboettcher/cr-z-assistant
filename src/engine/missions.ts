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

import { BASES, type BaseId } from '../data/bases';
import { MATERIALS, type Material } from '../data/materials';
import {
  GATHERED_MATERIALS,
  MISSIONS,
  type MissionId,
  type SelectionChoice,
  type StandardMissionId,
} from '../data/missions';
import { FIELD_RECRUITABLE_TIERS, type FieldRecruitTier } from '../data/recruitTable';
import { beforePlanning } from './assignments';
import { continuationMission, continuationOpen, overrunChoice, overrunClaim } from './overrun';
import type { Campaign, RareTrade, Survivor } from './campaign';
import type { CampaignEvent, MissionWound, RetrievedVehicle } from './log';
import { FIRST_TURN, siegeDue } from './siege';
import { maxHp } from './survivor';
import { phaseOf } from './turn';
import { retrievedProblem } from './vehicles';

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

  /** The base a Claim a New Base team is claiming (pg. 78; Z4-7). */
  readonly base?: BaseId;
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
        ...(event.base === undefined ? {} : { base: event.base }),
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
  if (siegeDue(campaign)) {
    // After an overrun, the way on the player chose (R27).
    const option = overrunChoice(campaign);

    return [option === null ? 'siege-defense' : continuationMission(option)];
  }

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

/** Whether a mission asks Select Mission for this (`SelectionChoice`). */
function asksFor(mission: MissionId, choice: SelectionChoice): boolean {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return entry.family === 'standard' && (entry.asks as readonly string[]).includes(choice);
}

/** Whether a mission asks Select Mission for a material type (pg. 80). */
export function asksForMaterial(mission: MissionId): boolean {
  return asksFor(mission, 'material');
}

/**
 * Whether Select Mission asks for the base this mission claims: Claim a New
 * Base always (pg. 78; Z4-7), and the First Mission when it is a community
 * starting over after an overrun, which will claim a base of its own (pg. 86;
 * R30, Z4-9). Not the campaign's own turn-1 First Mission, whose base is
 * claimed on the base sheet.
 */
export function asksForBase(campaign: Campaign, mission: MissionId): boolean {
  return (
    asksFor(mission, 'base') ||
    // A way on is only ever chosen on a siege turn, after the siege overran.
    (mission === 'first-mission' && overrunChoice(campaign) !== null)
  );
}

/**
 * Why this team cannot choose this mission now, or `null` if it can.
 *
 * In the Mission Phase; for a team that exists this turn; for a mission on
 * offer (`missionsOnOffer`); not a second Claim a New Base beside another
 * team's (R20); and with a material type, or a base, exactly when the mission
 * asks for one. Any base on the roster may be claimed, the one already held and
 * a lower Tier among them (pg. 78; R26): what a lower Tier costs is a warning
 * (`claimWarning` in `claim.ts`), not this.
 * Choosing again for a team that already chose is allowed — it is how a choice
 * is corrected — until the team's outcome is recorded: a mission that has been
 * played is not chosen again, except a failed First Mission (R21).
 */
export function selectionProblem(campaign: Campaign, choice: MissionChoice): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'Choose missions in the Mission Phase.';

  if (!Object.hasOwn(MISSIONS, choice.mission)) return 'There is no such mission.';

  if (!missionTeams(campaign).some((team) => team.team === choice.team)) {
    return 'Only a mission team with somebody on it chooses a mission.';
  }

  // A team's outcome closes its choice, but for a failed First Mission (R21)
  // and an overrun's continuation (R27, R28). The continuation is team 1's
  // without asking which team: a siege turn has no other (pg. 85), and the
  // check above has already refused one.
  if (
    teamOutcomes(campaign).has(choice.team) &&
    !retryOwed(campaign, choice.team) &&
    !continuationOpen(campaign)
  ) {
    return `Mission team ${String(choice.team)} has already played its mission.`;
  }

  if (!missionsOnOffer(campaign).includes(choice.mission)) {
    if (campaign.turn === FIRST_TURN) return 'Turn 1’s mission is the First Mission.';
    if (siegeDue(campaign) && overrunChoice(campaign) !== null) {
      return 'After the overrun, the community plays the mission it chose to go on with.';
    }
    if (siegeDue(campaign)) return 'This turn’s mission is the Siege Defense the horde called.';
    if (choice.mission === 'siege-defense')
      return 'A Siege Defense is only played when the horde calls one.';
    if (choice.mission === 'first-mission') return 'The First Mission is only played on turn 1.';

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
      return 'Choose the material type Gather Materials takes the rest in.';
    }
    if (!MATERIALS.includes(choice.material)) return 'There is no such material.';
    if (!(GATHERED_MATERIALS as readonly string[]).includes(choice.material)) {
      return 'Gather Materials takes the rest in Food, Fuel or Hardware.';
    }
  } else if (choice.material !== undefined) {
    return 'Only Gather Materials takes a material type.';
  }

  if (asksForBase(campaign, choice.mission)) {
    if (choice.base === undefined) return 'Choose the base this mission claims.';
    if (!Object.hasOwn(BASES, choice.base)) return 'There is no such base.';
  } else if (choice.base !== undefined) {
    return 'Only Claim a New Base, or starting over after an overrun, claims a base.';
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
  if (phaseOf(campaign.step) !== 'mission') return 'Skip missions in the Mission Phase.';
  if (campaign.turn === FIRST_TURN) return 'Turn 1’s First Mission can’t be skipped.';
  if (siegeDue(campaign)) return 'A siege the horde called can’t be skipped.';
  if (turnMissions(campaign).skipped) return 'This turn’s mission is already skipped.';
  if (teamOutcomes(campaign).size > 0) return 'A mission already played can’t be skipped.';

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
 *
 * Every kind, `mission-played` included, also carries the team's wounds since
 * Z4-4: each member's Health at the end, and Infection in a Viral campaign
 * (`MissionWound`). Recording the outcome applies them (`withWounds`); an
 * entry written before Z4-4 has none, and its readers fall back to the roster.
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
 * played again later is the overrun base's second continuation (pg. 86), whose
 * failure reopens the choice of how to go on instead (R28; `overrun.ts`).
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
  readonly strangers: readonly FieldRecruitTier[];
  readonly vehiclesOnArea: number;
  readonly materialsCarriedOut: number;
  readonly startingZombies: number;
  readonly zombiesLeft: number;
  readonly survivorsExited: number;
  readonly allIncapacitated: boolean;
  readonly vehiclesDrivenOff: number;

  /**
   * Whether a claim after an overrun, of the overrun base's own type, was
   * played on the same map (pg. 86; R29). Asked of that claim only.
   */
  readonly sameMap?: boolean;

  /**
   * Set-aside survivors a Rescue Strangers team brought back, by id (R31;
   * Z4-11). Asked of that mission only.
   */
  readonly returned?: readonly string[];

  /**
   * How many of a Rare Items trade's items the trader handed over, first in
   * priority first (pg. 84; Z5-10). Asked of the Rare Goods Trader while a
   * trade is under way.
   */
  readonly itemsTraded?: number;

  /**
   * What each vehicle a Retrieve New Vehicles team drove off was (R63;
   * Z5-11). Asked of that mission only.
   */
  readonly retrieved?: readonly RetrievedVehicle[];

  /**
   * Each team member's Health at the end, and their Infection in a Viral
   * campaign (Z4-4). Every mission records them, so unlike the counts above
   * they go on every kind; `woundsAsTheyStand` is where a form starts them.
   */
  readonly wounds: readonly MissionWound[];
}

/**
 * An end condition as the outcome records it: the printed failure's number is
 * no condition met (pp. 77, 79; #205), so a table copying it off the page
 * records the failure it is.
 */
function recordedEnd(mission: MissionId, endCondition: number | null): number | null {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return 'failedOn' in entry && endCondition === entry.failedOn ? null : endCondition;
}

/**
 * The outcome entry for a team's choice, from the counts its form gathered —
 * only the counts that mission records (`MISSIONS[…].counts`), under its own
 * kind, and `mission-played` for a mission that is not one of the standard
 * eight — and on every one of them the team's wounds (Z4-4). Checked by
 * `missionOutcomeProblem` like any other.
 */
export function outcomeOf(choice: MissionChoice, counts: OutcomeCounts): MissionOutcome {
  const { team } = choice;
  const { wounds } = counts;
  const endCondition = recordedEnd(choice.mission, counts.endCondition);

  switch (choice.mission) {
    case 'first-mission':
      return {
        kind: 'first-mission-resolved',
        team,
        endCondition,
        strangers: counts.strangers,
        wounds,
      };
    case 'claim-a-new-base':
      return {
        kind: 'claim-a-new-base-resolved',
        team,
        endCondition,
        strangers: counts.strangers,
        vehiclesOnArea: counts.vehiclesOnArea,
        ...(counts.sameMap === undefined ? {} : { sameMap: counts.sameMap }),
        wounds,
      };
    case 'gather-materials':
      return {
        kind: 'gather-materials-resolved',
        team,
        materialsCarriedOut: counts.materialsCarriedOut,
        strangers: counts.strangers,
        wounds,
      };
    case 'thin-the-herd':
      return {
        kind: 'thin-the-herd-resolved',
        team,
        startingZombies: counts.startingZombies,
        zombiesLeft: counts.zombiesLeft,
        survivorsExited: counts.survivorsExited,
        allIncapacitated: counts.allIncapacitated,
        wounds,
      };
    case 'retrieve-new-vehicles':
      return {
        kind: 'retrieve-new-vehicles-resolved',
        team,
        vehiclesDrivenOff: counts.vehiclesDrivenOff,
        retrieved: counts.retrieved ?? [],
        strangers: counts.strangers,
        wounds,
      };
    case 'rescue-strangers':
      return {
        kind: 'rescue-strangers-resolved',
        team,
        strangers: counts.strangers,
        ...(counts.returned === undefined || counts.returned.length === 0
          ? {}
          : { returned: counts.returned }),
        wounds,
      };
    case 'rare-goods-trader':
      return {
        kind: 'rare-goods-trader-resolved',
        team,
        survivorsExited: counts.survivorsExited,
        ...(counts.itemsTraded === undefined ? {} : { itemsTraded: counts.itemsTraded }),
        strangers: counts.strangers,
        wounds,
      };
    case 'siege-defense':
      return {
        kind: 'siege-defense-resolved',
        team,
        zombiesLeft: counts.zombiesLeft,
        survivorsExited: counts.survivorsExited,
        wounds,
      };
    default:
      return { kind: 'mission-played', team, mission: choice.mission, wounds };
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
      return [outcome.survivorsExited, outcome.itemsTraded ?? 0];
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
 * Tier for each stranger; and the team's wounds as `woundsProblem` reads them
 * (Z4-4). Nothing else is checked against anything: the counts are what the
 * table counted, and the book gives no rule that two of them must agree — so a
 * Thin the Herd's "every survivor incapacitated" is not compared with the
 * Health its wounds record either. Whether a rescuer could carry a stranger is
 * a warning, not this (`strangerWarning`).
 */
export function missionOutcomeProblem(campaign: Campaign, outcome: MissionOutcome): string | null {
  if (phaseOf(campaign.step) !== 'mission') return 'Record missions in the Mission Phase.';

  const team = outcomeTeam(outcome);
  const choice = turnMissions(campaign).choices.find((candidate) => candidate.team === team);

  if (choice === undefined) {
    return `Mission team ${String(team)} hasn’t chosen a mission this turn.`;
  }
  if (outcomeMission(outcome) !== choice.mission) {
    return `That isn’t the mission team ${String(team)} chose.`;
  }
  if (teamOutcomes(campaign).has(team)) {
    return `Mission team ${String(team)}’s outcome is already recorded.`;
  }

  if (!countsOf(outcome).every((count) => Number.isSafeInteger(count) && count >= 0)) {
    return 'Each count must be a whole number, 0 or more.';
  }

  if ('endCondition' in outcome && outcome.endCondition !== null) {
    const mission: (typeof MISSIONS)[MissionId] = MISSIONS[choice.mission];
    const conditions = 'endConditions' in mission ? mission.endConditions : 0;

    if (
      !Number.isSafeInteger(outcome.endCondition) ||
      outcome.endCondition < 1 ||
      outcome.endCondition > conditions
    ) {
      return `Choose an end condition from 1 to ${String(conditions)}, or none.`;
    }
  }

  // A Hero is never recruited in the field, and no mission's setup places one
  // (pg. 7; R24): a stranger is a Rookie, a Citizen or a Leader.
  if (
    'strangers' in outcome &&
    !outcome.strangers.every((tier) => FIELD_RECRUITABLE_TIERS.includes(tier))
  ) {
    return 'Every stranger is Tier 1 to 3. A Hero is never rescued (R24).';
  }

  // The kind is checked for the typechecker's sake: while an overrun's claim is
  // being played, team 1 chose that claim, and the check above refused any
  // other outcome for it — so treating every outcome this way changes nothing.
  if (outcome.kind === 'claim-a-new-base-resolved') {
    const continuing = overrunClaim(campaign);

    // The claim an overrun goes on with places none (pg. 86).
    if (continuing && outcome.strangers.length > 0) {
      return 'A claim after an overrun has no strangers to rescue.';
    }

    if (asksSameMap(campaign, choice) !== (outcome.sameMap !== undefined)) {
      return asksSameMap(campaign, choice)
        ? 'Choose whether the claim was played on the overrun base’s own map.'
        : 'Only a claim of the overrun base’s own type asks about its map.';
    }
  }

  // Every vehicle driven off joins, so each says what it is (R63; Z5-11).
  if (outcome.kind === 'retrieve-new-vehicles-resolved') {
    const problem = retrievedProblem(campaign, outcome.vehiclesDrivenOff, outcome.retrieved ?? []);
    if (problem !== null) return problem;
  }

  // A Rare Items trade made on an earlier turn is what this mission settles
  // (R57): it says how many of its items were handed over, and no more than it
  // holds. Without one, it says nothing about items.
  if (outcome.kind === 'rare-goods-trader-resolved') {
    const items = rareTradeDue(campaign) ? (campaign.rareTrade as RareTrade).items.length : null;

    if (items === null) {
      if (outcome.itemsTraded !== undefined) {
        return 'No Rare Items trade is under way, so no items were traded.';
      }
    } else if (outcome.itemsTraded === undefined) {
      return 'Enter how many of the trade’s items the trader handed over.';
    } else if (outcome.itemsTraded > items) {
      return `The trade was for ${String(items)} items.`;
    }
  }

  // Survivors set aside — a Hero sent away over the cap, or a community left
  // behind — come back through Rescue Strangers as themselves (R31). Only that
  // outcome carries `returned`; the kind is checked for the typechecker.
  if (outcome.kind === 'rescue-strangers-resolved' && outcome.returned !== undefined) {
    if (new Set(outcome.returned).size !== outcome.returned.length) {
      return 'Each survivor set aside comes back once.';
    }
    if (!outcome.returned.every((id) => campaign.setAside.some((gone) => gone.id === id))) {
      return 'Only a survivor set aside can be brought back.';
    }
  }

  return woundsProblem(campaign, outcome);
}

/**
 * Whether a Rare Goods Trader outcome this turn settles a Rare Items trade:
 * one made on an earlier turn (R57; Z5-10). Here rather than in `rareTrade.ts`
 * because the outcome check asks it, and that module already reads this one.
 */
export function rareTradeDue(campaign: Campaign): boolean {
  return campaign.rareTrade !== null && campaign.rareTrade.madeOnTurn < campaign.turn;
}

/**
 * Whether a Claim a New Base outcome asks if it was played on the same map:
 * the claim an overrun goes on with, of the overrun base's own type (pg. 86;
 * R29). Any other claim is a new building on a new map.
 */
export function asksSameMap(campaign: Campaign, choice: MissionChoice): boolean {
  return (
    choice.mission === 'claim-a-new-base' &&
    overrunClaim(campaign) &&
    choice.base !== undefined &&
    choice.base === campaign.base?.id
  );
}

/** Who is on a team this turn, or nobody for a team that does not exist. */
function membersOf(campaign: Campaign, team: number): readonly Survivor[] {
  return missionTeams(campaign).find((candidate) => candidate.team === team)?.members ?? [];
}

/**
 * Each member of a team as they stand now, written as the wounds a form
 * starts from (Z4-4): their current Health, and their Infection in a Viral
 * campaign. In team order, which is roster order.
 *
 * So recording everybody is the natural thing to do — a member who came back
 * unhurt needs nothing typed — and a correction already made on the roster
 * carries into the outcome instead of being undone by it.
 */
export function woundsAsTheyStand(campaign: Campaign, team: number): readonly MissionWound[] {
  const viral = campaign.origin === 'viral';

  return membersOf(campaign, team).map((survivor) => ({
    survivor: survivor.id,
    name: survivor.name,
    health: survivor.currentHp,
    ...(viral ? { infection: survivor.infection } : {}),
  }));
}

/**
 * Why an outcome's wounds cannot be recorded, or `null` if they can (Z4-4).
 *
 * **Everybody on the team, once each, and nobody else.** Every member is
 * listed because the entry is the record of how the team came home, and a
 * member left out would leave the roster's Health standing as if it were the
 * end value with nothing in the history to say whether it was; the form starts
 * every member at their current Health (`woundsAsTheyStand`), so listing them
 * all costs nothing. Nobody else, because a survivor who did not go has no
 * Health from this mission to record.
 *
 * **Health a whole number from 0 to the survivor's maximum** (`maxHp`), the
 * range the roster's own Health holds. **Infection in a Viral campaign only,
 * and on every wound there**, because only that origin has it (pg. 123);
 * a whole number from 0 with no ceiling, the same range the survivor sheet and
 * the save file give it — at 10 the survivor is down rather than gone, and
 * what is above it is the table's count, not a mistake (#176).
 *
 * An outcome with no wounds at all is refused like one that leaves somebody
 * out: only entries written before Z4-4 lack them, and those are read, never
 * submitted.
 */
export function woundsProblem(campaign: Campaign, outcome: MissionOutcome): string | null {
  const team = outcomeTeam(outcome);
  const members = membersOf(campaign, team);
  const viral = campaign.origin === 'viral';
  const recorded = new Set<string>();

  for (const wound of outcome.wounds ?? []) {
    const survivor = members.find((member) => member.id === wound.survivor);

    if (survivor === undefined) {
      return `Only somebody on mission team ${String(team)} has Health to record from its mission.`;
    }
    if (recorded.has(survivor.id)) return `${survivor.name}’s Health is recorded once.`;
    recorded.add(survivor.id);

    const most = maxHp(survivor);
    if (!Number.isSafeInteger(wound.health) || wound.health < 0 || wound.health > most) {
      return `${survivor.name}’s Health must be a whole number from 0 to ${String(most)}.`;
    }

    // One mutant survives below and is equivalent: `wound.infection ===
    // undefined` replaced by `false`. `Number.isSafeInteger(undefined)` is
    // already false, so a missing Infection is refused by the next test either
    // way; the first is there for the typechecker, which cannot compare a
    // possibly-absent number with 0, and it is the narrowing that earns it.
    if (!viral) {
      if (wound.infection !== undefined) return 'Only a Viral campaign records Infection.';
    } else if (
      wound.infection === undefined ||
      !Number.isSafeInteger(wound.infection) ||
      wound.infection < 0
    ) {
      return `${survivor.name}’s Infection must be a whole number, 0 or more.`;
    }
  }

  return recorded.size === members.length
    ? null
    : `Record the end-of-mission Health of everybody on mission team ${String(team)}.`;
}

/**
 * The roster as an outcome's wounds leave it: each survivor named at the
 * Health recorded, and at the Infection recorded where there is one (Z4-4).
 *
 * The same change the roster's own correction makes, which stays the way to
 * fix a mistake — this is the one that happened, and its entry says so.
 */
export function withWounds(campaign: Campaign, wounds: readonly MissionWound[]): Campaign {
  return {
    ...campaign,
    survivors: campaign.survivors.map((survivor) => {
      const wound = wounds.find((candidate) => candidate.survivor === survivor.id);

      return wound === undefined
        ? survivor
        : {
            ...survivor,
            currentHp: wound.health,
            ...(wound.infection === undefined ? {} : { infection: wound.infection }),
          };
    }),
  };
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
  const members = membersOf(campaign, team);
  const highest = Math.max(0, ...members.map((survivor) => survivor.tier));
  // A set-aside survivor brought back is rescued like any stranger, at their
  // own Tier — a Hero only by a Hero (pg. 31; R31). The kind and the defaults
  // are for the typechecker, as in `returnedWaiting`.
  const returning = (outcome.kind === 'rescue-strangers-resolved' ? (outcome.returned ?? []) : [])
    .flatMap((id) => campaign.setAside.filter((gone) => gone.id === id))
    .map((gone) => gone.tier);
  const beyond = [...outcome.strangers, ...returning].filter((tier) => tier > highest);

  return beyond.length === 0
    ? null
    : `Nobody on mission team ${String(team)} is Tier ${String(Math.max(...beyond))} or higher, and a stranger is rescued by somebody of at least their Tier.`;
}
