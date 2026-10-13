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
import type { OverrunOption } from '../data/missions';
import type { Campaign, Survivor } from './campaign';
import { accepted, refused, type FormResult } from './forms';
import { logged, type MissionWound } from './log';
import {
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
import { standInProblem } from './siegeWork';

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

  return accepted(
    logged(campaign, at, {
      kind: 'mission-selected',
      team: choice.team,
      mission: choice.mission,
      names: team.members.map((survivor) => survivor.name),
      ...(choice.material === undefined ? {} : { material: choice.material }),
      ...(choice.base === undefined ? {} : { base: choice.base }),
    }),
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

  return problem === null
    ? accepted(logged(campaign, at, { kind: 'mission-skipped' }))
    : refused(problem);
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
 * the end. The roster's own Health correction stays as it was, unlogged, for
 * fixing a mistake. The entry's wounds are written in team order with each
 * survivor's name as the roster has it now, whatever the screen sent, so the
 * history names them the way every other entry about a person does.
 */
export function submitMissionOutcome(
  campaign: Campaign,
  outcome: MissionOutcome,
  at: string,
): FormResult {
  const problem = missionOutcomeProblem(campaign, outcome);
  if (problem !== null) return refused(problem);

  // Every wound names a team member exactly once by now: `woundsProblem`
  // refuses anything else, so this reorders and renames and never drops one.
  const wounds = woundsAsTheyStand(campaign, outcomeTeam(outcome)).map((member) => {
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

  return accepted(logged(withWounds(campaign, wounds), at, { ...outcome, wounds }));
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
