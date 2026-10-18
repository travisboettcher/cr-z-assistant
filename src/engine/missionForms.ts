/**
 * The Mission Phase's forms, each guard, change and entry in one place (#179).
 *
 * The mission itself is played on the table and the tracker does not run it.
 * What it records is which mission each team chose (pg. 17; Z4-2), how each
 * team's mission ended (pp. 77–86; Z4-3) and the Health it came home with
 * (Z4-4), and who stands in for somebody the siege took off their work
 * (pg. 23, the FAQ's "Siege Defense and Labor"; #183). The wounds are the one
 * thing here that changes the campaign beyond its log — they set the roster's
 * Health. Everything else — who went out, what they do to the turns since the
 * last siege, and to the Labor of the orders the siege interrupted — is read
 * back from the entries by `missions.ts`, `siege.ts` and `siegeWork.ts`.
 *
 * Moved out of `campaignStore.ts` without changing what either accepts or
 * refuses. The shape of what they return is `forms.ts`'s.
 */

import type { BaseId } from '../data/bases';
import type { OverrunOption, StoryMissionId, ViralMissionId } from '../data/missions';
import type { Campaign, Survivor, Vehicle } from './campaign';
import { equipCheck, withEquipMove, type EquipMove } from './equip';
import { accepted, blockedBy, refused, type FormResult } from './forms';
import { logged, type MissionWound, type StoryRecord } from './log';
import {
  membersOf,
  missionOutcomeProblem,
  missionTeams,
  outcomeTeam,
  selectionProblem,
  skipProblem,
  withWounds,
  woundsAsTheyStand,
  type MissionChoice,
  type MissionOutcome,
  type MissionTeam,
} from './missions';
import {
  continuationMission,
  OVERRUN_TEAM,
  overrunChoiceProblem,
  withCommunityAbandoned,
} from './overrun';
import { rareTradeBinds, withRareTradeLost, withRareTradeSettled } from './rareTrade';
import { standInProblem } from './siegeWork';
import { withoutRoll, withVehiclesAdded } from './vehicles';
import {
  broughtHomeProblem,
  leaveProblem,
  takeProblem,
  vehiclesLost,
  vehiclesTaken,
  withVehicleLeftHome,
  withVehiclesLost,
  withVehicleTaken,
  type TakenVehicle,
} from './missionVehicles';
import { spentItems, spentProblem, withItemsSpent } from './spent';
import { isStory, partNow, storyHolder, storyRecord, withStoryRecorded } from './storyMissions';
import { extrasOf } from './storyRewards';
import { viralRecord, withViralRecorded } from './viralMissions';
import { deathProblem, deathsProblem, withMissionDeath, type MissionDeath } from './missionDeaths';

/**
 * A team's mission, chosen at Select Mission (pg. 17; Z4-2).
 *
 * Refused for whatever `selectionProblem` says. The entry names the team's
 * survivors as they are now, for the history; who the team *is* stays the
 * Planning Phase's assignment, read back by `missionTeams`.
 */
export function submitMissionSelection(
  campaign: Campaign,
  choice: MissionChoice,
  at: string,
): FormResult {
  const problem = selectionProblem(campaign, choice);
  if (problem !== null) return refused(problem);

  // Present by now: `selectionProblem` refuses a team nobody is on.
  const team = missionTeams(campaign).find(
    (candidate) => candidate.team === choice.team,
  ) as MissionTeam;

  const selected = logged(campaign, at, {
    kind: 'mission-selected',
    team: choice.team,
    mission: choice.mission,
    names: team.members.map((survivor) => survivor.name),
    ...(choice.material === undefined ? {} : { material: choice.material }),
    ...(choice.base === undefined ? {} : { base: choice.base }),
  });

  // A Rare Items trade binds the first mission chosen (R60): another loses it.
  return accepted(
    rareTradeBinds(campaign) && choice.mission !== 'rare-goods-trader'
      ? withRareTradeLost(selected, at, 'other-mission')
      : selected,
  );
}

/**
 * How the community goes on from a base this turn's Siege Defense overran, and
 * the base that way on will claim (pg. 86; R27, R28; Z4-9).
 *
 * Two entries, because two things are decided: the way on, and team 1's next
 * mission — the whole community's, as the siege was. Leaving the survivors
 * behind is the exception: it sets every one of them aside and opens the
 * starting community again, and the new community's First Mission is chosen
 * once it exists (R31; Z4-11). Refused for whatever
 * `overrunChoiceProblem` says, and then for whatever `selectionProblem` says of
 * the mission, against the campaign the choice leaves, so nothing is written
 * unless both stand.
 */
export function submitOverrunContinuation(
  campaign: Campaign,
  option: OverrunOption,
  base: BaseId | undefined,
  at: string,
): FormResult {
  const problem = overrunChoiceProblem(campaign, option);
  if (problem !== null) return refused(problem);

  // Leaving the survivors behind: the new community is not built yet, so its
  // First Mission is chosen once it is, through `submitMissionSelection` (R31).
  if (option === 'abandon') {
    const chosen = logged(campaign, at, { kind: 'overrun-continued', option });

    return accepted(
      logged(withCommunityAbandoned(chosen), at, {
        kind: 'community-abandoned',
        setAside: campaign.survivors.map((survivor) => ({
          survivor: survivor.id,
          name: survivor.name,
        })),
      }),
    );
  }

  return submitMissionSelection(
    logged(campaign, at, { kind: 'overrun-continued', option }),
    {
      team: OVERRUN_TEAM,
      mission: continuationMission(option),
      // Only leaving the survivors behind, which has returned above, names no
      // base; a way on that should and does not is refused by the selection.
      ...(base === undefined ? {} : { base }),
    },
    at,
  );
}

/** The community opts out of this turn's mission (pg. 17). */
export function submitMissionSkip(campaign: Campaign, at: string): FormResult {
  const problem = skipProblem(campaign);

  if (problem !== null) return refused(problem);

  // Sitting the mission out declines the trade that forced one (R60).
  const skipped = logged(campaign, at, { kind: 'mission-skipped' });

  return accepted(
    rareTradeBinds(campaign) ? withRareTradeLost(skipped, at, 'no-mission') : skipped,
  );
}

/**
 * Record how a team's mission ended (pp. 77–86; Z4-3), and the Health it came
 * home with (Z4-4).
 *
 * The counts the table made at the end of the mission, and nothing worked out
 * from them; the outcome is its own entry. Refused for whatever
 * `missionOutcomeProblem` says — outside the Mission Phase, a second time for
 * the team, for a mission the team did not choose, for a count that is not a
 * whole number, and for wounds that are not the whole team's or are out of
 * range (`woundsProblem`).
 *
 * **The only change it makes is the wounds** (`withWounds`): each member's
 * Health, and Infection in a Viral campaign, set to what the table counted at
 * the end; for a story, what its ending gave (`withStoryRecorded`; Z7-3); and
 * for a Viral mission, a held zombie or Medical Supply tokens
 * (`withViralRecorded`; Z7-6). The roster's own Health correction stays as it was, unlogged, for
 * fixing a mistake. The entry's wounds are written in team order with each
 * survivor's name as the roster has it now, whatever the screen sent, so the
 * history names them the way every other entry about a person does.
 */
export function submitMissionOutcome(
  campaign: Campaign,
  outcome: MissionOutcome,
  at: string,
): FormResult {
  return submitMissionEnded(campaign, outcome, [], at);
}

/**
 * Record how a team's mission ended together with whoever died on it, as one
 * press (#236, R3): the outcome as `submitMissionOutcome` records it, then
 * each death as `submitMissionDeath` does. Everything about one outcome is one
 * form, so it is all recorded or none of it is.
 *
 * Refused for whatever `missionOutcomeProblem` refuses, or `deathsProblem`.
 * The outcome's wounds name only who came home: the screen still sends a wound
 * for everybody, which `woundsProblem` asks for, and the dead's are dropped
 * from the entry so it does not say they came back with any Health at all.
 */
export function submitMissionEnded(
  campaign: Campaign,
  outcome: MissionOutcome,
  deaths: readonly MissionDeath[],
  at: string,
): FormResult {
  const problem =
    missionOutcomeProblem(campaign, outcome) ??
    deathsProblem(campaign, outcomeTeam(outcome), deaths);
  if (problem !== null) return refused(problem);

  const dead = new Set(deaths.map((death) => death.survivor));

  // Every wound names a team member exactly once by now: `woundsProblem`
  // refuses anything else, so this reorders and renames and never drops one
  // but the dead's.
  const wounds = woundsAsTheyStand(campaign, outcomeTeam(outcome))
    .filter((member) => !dead.has(member.survivor))
    .map((member) => {
      const { health, infection } = (outcome.wounds as readonly MissionWound[]).find(
        (wound) => wound.survivor === member.survivor,
      ) as MissionWound;

      return {
        survivor: member.survivor,
        name: member.name,
        health,
        ...(infection === undefined ? {} : { infection }),
      };
    });

  // A story's ending, rebuilt from the result and who takes the next part, so
  // the entry says what the rules gave whatever the screen sent (Z7-3).
  const rebuilt = withViralRebuilt(campaign, withStoryRebuilt(campaign, outcome));
  const story = storyEnded(rebuilt);
  const viral = rebuilt.kind === 'mission-played' ? rebuilt.viral : undefined;
  const wounded = withWounds(campaign, wounds);
  const storied =
    story === undefined ? wounded : withStoryRecorded(wounded, story.mission, story.record);
  const recorded = logged(viral === undefined ? storied : withViralRecorded(storied, viral), at, {
    ...rebuilt,
    wounds,
  });

  const rewarded =
    // The vehicles driven off join the community at once (pg. 82; R63; Z5-11).
    outcome.kind === 'retrieve-new-vehicles-resolved'
      ? withVehiclesAdded(recorded, (outcome.retrieved ?? []).map(withoutRoll))
      : // The Rare Goods Trader settles the trade it was forced for (pg. 84; R61).
        outcome.kind === 'rare-goods-trader-resolved' && outcome.itemsTraded !== undefined
        ? withRareTradeSettled(recorded, outcome.itemsTraded, outcome.survivorsExited, at)
        : recorded;
  const ended = deaths.reduce((current, death) => withMissionDeath(current, death, at), rewarded);

  return accepted(
    story === undefined ? ended : withPartNow(ended, outcomeTeam(outcome), story, at),
  );
}

/** A story outcome's mission and record, or `undefined` for any other outcome. */
function storyEnded(
  outcome: MissionOutcome,
): { readonly mission: StoryMissionId; readonly record: StoryRecord } | undefined {
  return outcome.kind === 'mission-played' &&
    outcome.story !== undefined &&
    isStory(outcome.mission)
    ? { mission: outcome.mission, record: outcome.story }
    : undefined;
}

/** The outcome with its story's record as `storyRecord` builds it, from the team before its wounds. */
function withStoryRebuilt(campaign: Campaign, outcome: MissionOutcome): MissionOutcome {
  const story = storyEnded(outcome);
  if (outcome.kind !== 'mission-played' || story === undefined) return outcome;

  const members = membersOf(campaign, outcome.team);

  return {
    ...outcome,
    story: storyRecord(campaign, members, story.mission, {
      result: story.record.result,
      ...(story.record.attached === undefined ? {} : { to: story.record.attached.survivor }),
      extras: extrasOf(story.record),
    }),
  };
}

/** The outcome with its Viral record as `viralRecord` builds it, from the base as it stands (Z7-6). */
function withViralRebuilt(campaign: Campaign, outcome: MissionOutcome): MissionOutcome {
  if (outcome.kind !== 'mission-played' || outcome.viral === undefined) return outcome;

  // A Viral mission's by now: `viralProblem` refuses a record on any other.
  const mission = outcome.mission as ViralMissionId;

  return { ...outcome, viral: viralRecord(campaign, mission, outcome.viral) };
}

/**
 * The campaign with the next part chosen for the same team at once, where the
 * ending says it is played in this Mission Phase (pg. 92; R119): Left Behind
 * Part 2b after Part 1's loved one is lost. Nothing for any other ending, or
 * when the survivor it went to died on the mission and took it with them
 * (R116). The choice is the book's, so it is written as Select Mission writes
 * one, naming whoever is on the team now.
 */
function withPartNow(
  campaign: Campaign,
  team: number,
  story: { readonly mission: StoryMissionId; readonly record: StoryRecord },
  at: string,
): Campaign {
  const now = partNow(story.mission, story.record);
  const members = membersOf(campaign, team);

  if (now === undefined || storyHolder(members, now) === undefined) return campaign;

  return logged(campaign, at, {
    kind: 'mission-selected',
    team,
    mission: now,
    names: members.map((member) => member.name),
  });
}

/** A place the siege emptied, and who fills it. */
export interface StandInForm {
  /** The casualty whose place it is — the place is the subject. */
  readonly survivor: string;

  /** Who stands in, or `null` to leave the place empty again. */
  readonly by: string | null;
}

/**
 * Fill a place this turn's siege emptied with a fit mission-team survivor, or
 * leave it empty again (pg. 23; #183).
 *
 * Checked against `standInProblem` rather than trusted from the screen. The
 * entry names both, as they were at the time; a place left empty again names
 * only the casualty.
 */
export function submitStandIn(campaign: Campaign, form: StandInForm, at: string): FormResult {
  const by = form.by ?? undefined;
  const problem = standInProblem(campaign, form.survivor, by);
  if (problem !== null) return refused(problem);

  // Both present by now: `standInProblem` has found the casualty among the
  // fallen and the stand-in among the candidates, both of which are read off
  // this roster.
  const named = (id: string) =>
    (campaign.survivors.find((survivor) => survivor.id === id) as Survivor).name;
  const standIn = by === undefined ? {} : { by, byName: named(by) };

  return accepted(
    logged(campaign, at, {
      kind: 'stood-in',
      survivor: form.survivor,
      name: named(form.survivor),
      ...standIn,
    }),
  );
}

/**
 * Move an item at Equip Mission Team, or take up or set down shoddy gear
 * (pg. 18; R35, R38; Z5-4).
 *
 * Refused for `equipCheck`'s blockers. Its warnings were on the screen, and
 * the press is the override. The item moves on its holders, and the entry
 * names both ends as they were.
 */
export function submitEquipMove(campaign: Campaign, move: EquipMove, at: string): FormResult {
  const problem = blockedBy(equipCheck(campaign, move));
  if (problem !== null) return refused(problem);

  const moved = withEquipMove(campaign, move);

  return accepted(
    logged(moved.campaign, at, {
      kind: 'item-moved',
      id: moved.item.id,
      item: moved.item.item,
      grade: moved.item.grade,
      from: moved.from,
      to: moved.to,
    }),
  );
}

/**
 * What a team's mission used up or lost (pp. 40, 45–48; R37; Z5-5): the items
 * ticked, and one-mission gear whether ticked or not. Each leaves its survivor.
 */
export function submitItemsSpent(
  campaign: Campaign,
  team: number,
  ticked: readonly string[],
  at: string,
): FormResult {
  const problem = spentProblem(campaign, team, ticked);
  if (problem !== null) return refused(problem);

  const items = spentItems(campaign, team, ticked);

  return accepted(
    logged(withItemsSpent(campaign, items), at, { kind: 'items-spent', team, items }),
  );
}

/**
 * A vehicle a team takes at Equip Mission Team, its Fuel burned from storage
 * (pp. 18, 49, 52; R65; Z5-12). Refused for whatever `takeProblem` says.
 */
export function submitVehicleTaken(
  campaign: Campaign,
  team: number,
  id: string,
  at: string,
): FormResult {
  const problem = takeProblem(campaign, team, id);
  if (problem !== null) return refused(problem);

  // Present by now: `takeProblem` refuses a vehicle the community does not hold.
  const vehicle = campaign.vehicles.find((held) => held.id === id) as Vehicle;
  const taken = withVehicleTaken(campaign, vehicle);

  return accepted(
    logged(taken, at, {
      kind: 'vehicle-taken',
      team,
      vehicle: id,
      label: vehicle.label,
      tier: vehicle.tier,
      fuel: campaign.materials.fuel - taken.materials.fuel,
    }),
  );
}

/** A vehicle taken this turn left home again, its Fuel back in storage (Z5-12). */
export function submitVehicleLeftHome(campaign: Campaign, id: string, at: string): FormResult {
  const problem = leaveProblem(campaign, id);
  if (problem !== null) return refused(problem);

  // Present by now: `leaveProblem` refuses a vehicle not taken this turn.
  const taken = vehiclesTaken(campaign).find((one) => one.vehicle === id) as TakenVehicle;

  return accepted(
    logged(withVehicleLeftHome(campaign, taken), at, {
      kind: 'vehicle-left-home',
      team: taken.team,
      vehicle: id,
      label: taken.label,
      fuel: taken.fuel,
    }),
  );
}

/**
 * Which of the vehicles a team took it drove off, once its mission is played
 * (pg. 32; R64, R70; Z5-12): the rest are lost, with their upgrades.
 */
export function submitVehiclesBroughtHome(
  campaign: Campaign,
  team: number,
  drivenOff: readonly string[],
  at: string,
): FormResult {
  const problem = broughtHomeProblem(campaign, team, drivenOff);
  if (problem !== null) return refused(problem);

  const lost = vehiclesLost(campaign, team, drivenOff);

  return accepted(
    logged(withVehiclesLost(campaign, lost), at, { kind: 'vehicles-brought-home', team, lost }),
  );
}

/**
 * A survivor who died on a team's mission (pp. 31, 34; R71; Z5-13): what
 * somebody else on the team took goes home with them, the rest is lost on the
 * map, and they leave the roster.
 */
export function submitMissionDeath(
  campaign: Campaign,
  death: MissionDeath,
  at: string,
): FormResult {
  const problem = deathProblem(campaign, death);
  if (problem !== null) return refused(problem);

  return accepted(withMissionDeath(campaign, death, at));
}
