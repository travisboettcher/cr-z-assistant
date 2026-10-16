/**
 * The four things a new campaign's first turn needs, in the order it needs
 * them, and which one is next: build the community, choose who plays the
 * First Mission, play it, and claim the base it wins (#238).
 *
 * Asked by the Getting started checklist above the turn and by the summary
 * cards beside it. The checklist holds turn 1's one primary action while it is
 * on screen, so the cards' empty states stand back rather than offering the
 * same press a second time in amber (#231). Two readers of one question is the
 * reason it lives here and not in either screen.
 *
 * Every tick is a question the rest of the engine already asks — the starting
 * community's own "built" flag, the First Mission's recorded team and
 * `firstBaseOwed` — so the checklist cannot disagree with the screens it
 * points to. It is guidance, never a gate (R33).
 *
 * Pure, like the rest of `src/engine`.
 */

import { beforePlanning, missionTeam } from './assignments';
import { firstBaseOwed } from './base';
import type { Campaign, Survivor } from './campaign';
import { survivorViolations } from './legality';
import { missionPlayed } from './missions';
import { FIRST_TURN } from './siege';

/** One of the checklist's four items, in the order it lists them. */
export type FirstTurnItem = 'community' | 'team' | 'mission' | 'base';

/** The First Mission is team 1's: turn 1 has no Planning Phase to split it. */
const FIRST_MISSION_TEAM = 1;

export interface FirstTurnChecklist {
  /**
   * The starting community is marked built (pg. 48) and nobody in it is still
   * being built. A community ticked built while every survivor still owed
   * their skills read as done (#238).
   */
  readonly community: boolean;
  /** Whoever is still being built: `survivorViolations` has something to say. */
  readonly unfinished: readonly Survivor[];
  /** The First Mission has a team (pg. 75). */
  readonly team: boolean;
  /** The First Mission is played: its outcome recorded, and not failed (R21). */
  readonly mission: boolean;
  /** A first base is claimed (pp. 54, 76–77). */
  readonly base: boolean;
  /** The first item not done: the one to do now. */
  readonly next: FirstTurnItem;
}

/**
 * Turn 1's checklist, or `null` once it is not shown: after turn 1, or once
 * all four are done.
 */
export function firstTurnChecklist(campaign: Campaign): FirstTurnChecklist | null {
  if (campaign.turn !== FIRST_TURN) return null;

  const unfinished = campaign.survivors.filter(
    (survivor) => survivorViolations(survivor).length > 0,
  );
  const community = campaign.startingCommunityBuilt && unfinished.length === 0;
  const team = missionTeam(beforePlanning(campaign)).length > 0;
  const mission = missionPlayed(campaign, FIRST_MISSION_TEAM);
  const base = !firstBaseOwed(campaign);

  if (community && team && mission && base) return null;

  return {
    community,
    unfinished,
    team,
    mission,
    base,
    next: !community ? 'community' : !team ? 'team' : !mission ? 'mission' : 'base',
  };
}
