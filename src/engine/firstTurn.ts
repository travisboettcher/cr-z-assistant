/**
 * The three things a new campaign's first turn needs, and which one is next.
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
import type { Campaign } from './campaign';
import { FIRST_TURN } from './siege';

/** One of the checklist's three items, in the order it lists them. */
export type FirstTurnItem = 'community' | 'team' | 'base';

export interface FirstTurnChecklist {
  /** The starting community is marked built (pg. 48). */
  readonly community: boolean;
  /** The First Mission has a team (pg. 75). */
  readonly team: boolean;
  /** A first base is claimed (pp. 54, 76–77). */
  readonly base: boolean;
  /** The first item not done: the one to do now. */
  readonly next: FirstTurnItem;
}

/**
 * Turn 1's checklist, or `null` once it is not shown: after turn 1, or once
 * all three are done.
 */
export function firstTurnChecklist(campaign: Campaign): FirstTurnChecklist | null {
  if (campaign.turn !== FIRST_TURN) return null;

  const community = campaign.startingCommunityBuilt;
  const team = missionTeam(beforePlanning(campaign)).length > 0;
  const base = !firstBaseOwed(campaign);

  if (community && team && base) return null;

  return {
    community,
    team,
    base,
    next: !community ? 'community' : !team ? 'team' : 'base',
  };
}
