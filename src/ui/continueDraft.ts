/**
 * The answers to "continue a campaign already under way" as the form holds
 * them, and what they come to (#210). Apart from the form so the form's file
 * exports only components.
 */

import type { StoryMissionId } from '../data/missions';
import type { CampaignOrigin, SpellId } from '../data/origins';
import { continuedProblem, type ContinuedStart } from '../engine/continued';
import type { ContinuedHistory } from '../engine/log';

/** The answers as typed: numbers as the strings their fields hold. */
export interface ContinueDraft {
  readonly turn: string;
  readonly turnsSinceSiege: string;
  readonly siegeCalled: boolean;
  readonly siegeCalledAt: string;
  readonly hordeForced: boolean;
  readonly siegeCleared: boolean;
  readonly wentShort: boolean;
  readonly hunger: string;
  readonly population: string;
  readonly storiesDone: readonly StoryMissionId[];
  readonly spellsSeen: readonly SpellId[];
  readonly graveyardDone: boolean;
  readonly necromancerWins: string;
  readonly necromancerKilled: boolean;
  readonly discountsUsed: string;
  readonly containment: boolean;
  readonly containmentHardware: string;
}

/** The answers before any are given: turn 2, a turn since the last siege, nothing else. */
export const CONTINUE_DRAFT: ContinueDraft = {
  turn: '2',
  turnsSinceSiege: '1',
  siegeCalled: false,
  siegeCalledAt: '',
  hordeForced: false,
  siegeCleared: false,
  wentShort: false,
  hunger: '',
  population: '',
  storiesDone: [],
  spellsSeen: [],
  graveyardDone: false,
  necromancerWins: '0',
  necromancerKilled: false,
  discountsUsed: '0',
  containment: false,
  containmentHardware: '',
};

/** A typed number, or `NaN` for a blank so the check refuses it. */
function typed(value: string): number {
  return value.trim() === '' ? Number.NaN : Number(value);
}

/** What the answers come to, each only where it applies: the origin's, and the ticked ones. */
export function startFromDraft(
  draft: ContinueDraft,
  origin: CampaignOrigin | undefined,
): ContinuedStart {
  const history: ContinuedHistory = {
    turnsSinceSiege: typed(draft.turnsSinceSiege),
    ...(draft.siegeCalled ? { siegeCalledAt: typed(draft.siegeCalledAt) } : {}),
    ...(draft.hordeForced ? { hordeForced: true } : {}),
    ...(draft.siegeCleared ? { siegeCleared: true } : {}),
    ...(draft.wentShort
      ? { fed: { hunger: typed(draft.hunger), population: typed(draft.population) } }
      : {}),
    ...(draft.storiesDone.length === 0 ? {} : { storiesDone: draft.storiesDone }),
    ...(origin === 'magic'
      ? {
          ...(draft.spellsSeen.length === 0 ? {} : { spellsSeen: draft.spellsSeen }),
          ...(draft.graveyardDone ? { graveyardDone: true } : {}),
          ...(typed(draft.necromancerWins) === 0
            ? {}
            : { necromancerWins: typed(draft.necromancerWins) }),
          ...(draft.necromancerKilled ? { necromancerKilled: true } : {}),
          ...(typed(draft.discountsUsed) === 0
            ? {}
            : { discountsUsed: typed(draft.discountsUsed) }),
        }
      : {}),
    ...(origin === 'viral' && draft.containment
      ? { containmentHardware: typed(draft.containmentHardware) }
      : {}),
  };

  return { turn: typed(draft.turn), history };
}

/** Why the answers can't start a campaign, or `null`. */
export function draftProblem(
  draft: ContinueDraft,
  origin: CampaignOrigin | undefined,
): string | null {
  return continuedProblem(startFromDraft(draft, origin), origin);
}
