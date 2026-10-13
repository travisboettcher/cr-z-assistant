/**
 * The overrun base, and how the community goes on from it (pp. 23, 26, 86;
 * #182, Z4-9).
 *
 * A Siege Defense that leaves a zombie on the area and gets a survivor out
 * over the map edge overruns the base (`baseOverrun`). The player then chooses
 * how the community goes on (`overrun-continued`), and the mission that choice
 * leads to is a further mission in the same Mission Phase, for the whole
 * community as team 1 (R27). One that meets no end condition leaves the choice
 * open again (R28).
 *
 * Read straight off this turn's log, in the order things happened, rather than
 * through `missions.ts`, which asks this module whether a continuation is open
 * and so cannot be asked back.
 *
 * Pure, like the rest of `src/engine`.
 */

import {
  OVERRUN_CONTINUATIONS,
  type OverrunOption,
  type StandardMissionId,
} from '../data/missions';
import type { Campaign } from './campaign';
import { baseOverrun } from './siege';
import { phaseOf } from './turn';

/** The team a siege fights as, and so the team that goes on from one (pg. 85). */
export const OVERRUN_TEAM = 1;

/**
 * Where this turn stands after an overrun.
 *
 * - `none` — nothing was overrun this turn.
 * - `choice` — the base is overrun, and how the community goes on is owed:
 *   straight after the siege, or after a continuation that failed (R28).
 * - `mission` — a choice is made and its mission is not yet chosen.
 * - `outcome` — the continuation is chosen and not yet played.
 * - `done` — a continuation met an end condition.
 */
type OverrunStage = 'none' | 'choice' | 'mission' | 'outcome' | 'done';

interface OverrunState {
  readonly stage: OverrunStage;
  /** The latest choice made, which a failed continuation does not clear. */
  readonly option: OverrunOption | null;
}

function overrunState(campaign: Campaign): OverrunState {
  let stage: OverrunStage = 'none';
  let option: OverrunOption | null = null;

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'siege-defense-resolved') {
      stage = baseOverrun(event) ? 'choice' : 'none';
    } else if (event.kind === 'overrun-continued' && stage !== 'none') {
      stage = 'mission';
      option = event.option;
    } else if (event.kind === 'mission-selected' && stage === 'mission') {
      stage = 'outcome';
    } else if (
      stage === 'outcome' &&
      (event.kind === 'claim-a-new-base-resolved' || event.kind === 'first-mission-resolved')
    ) {
      stage = event.endCondition === null ? 'choice' : 'done';
    }
  }

  return { stage, option };
}

/** Whether this turn's Siege Defense overran the base (pg. 86). */
export function overranThisTurn(campaign: Campaign): boolean {
  return overrunState(campaign).stage !== 'none';
}

/**
 * Whether the community owes the choice of how it goes on: straight after an
 * overrun, and again after a continuation that met no end condition (R28).
 */
export function overrunChoiceOwed(campaign: Campaign): boolean {
  return overrunState(campaign).stage === 'choice';
}

/** The latest way on this turn's overrun was given, or `null` (pg. 86). */
export function overrunChoice(campaign: Campaign): OverrunOption | null {
  return overrunState(campaign).option;
}

/**
 * Whether team 1 may choose its continuation now, although the siege — or a
 * failed continuation — is already its outcome (R27, R28).
 */
export function continuationOpen(campaign: Campaign): boolean {
  return overrunState(campaign).stage === 'mission';
}

/** The mission a way on is played as (pg. 86). */
export function continuationMission(option: OverrunOption): StandardMissionId {
  return OVERRUN_CONTINUATIONS[option];
}

/**
 * Whether this turn's Claim a New Base is the overrun's continuation, which
 * places no strangers and may recover the old base's stores (pg. 86; R29).
 */
export function overrunClaim(campaign: Campaign): boolean {
  // A choice is only followed after an overrun, so there is no stage to ask.
  return overrunState(campaign).option === 'claim';
}

/**
 * Whether the claim this turn's overrun went on with was played on the
 * overrun base's own map, as its outcome says (pg. 86; R29). False when it said
 * otherwise, was another type, or there was none.
 */
export function reclaimedOnSameMap(campaign: Campaign): boolean {
  // The kind is for the typechecker: no other entry carries `sameMap`.
  return campaign.log.some(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'claim-a-new-base-resolved' &&
      entry.event.endCondition !== null &&
      entry.event.sameMap === true,
  );
}

/**
 * Why the community cannot choose how it goes on now, or `null` if it can
 * (pg. 86; R27, R28).
 *
 * In the Mission Phase, after this turn's Siege Defense overran the base, and
 * while the choice is owed: straight after the siege, or after a continuation
 * that met no end condition. Not while a continuation is chosen and unplayed,
 * nor once one has won.
 */
export function overrunChoiceProblem(campaign: Campaign, option: OverrunOption): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'How the community goes on is chosen in the Mission Phase.';
  }
  if (!Object.hasOwn(OVERRUN_CONTINUATIONS, option)) return 'There is no such way on.';

  switch (overrunState(campaign).stage) {
    case 'none':
      return 'Only a base the Siege Defense overran this turn needs a way on.';
    case 'choice':
      return null;
    case 'done':
      return 'The community has already gone on from the overrun.';
    default:
      return 'The way on is chosen; play it, and choose again only if it fails.';
  }
}
