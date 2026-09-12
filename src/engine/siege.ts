/**
 * Check the Horde — the sixth step of the Management Phase (pg. 23).
 *
 * ## Siege Threat, at last totalled
 *
 * Z2-3 could only compute the base's own flat contribution and said so rather
 * than pretending to be a total. The other three terms all needed the Planning
 * Phase's assignments, which have existed since Z3-4:
 *
 * - **staffed facilities** — one per slot with somebody in it (Z3-5);
 * - **the project team** — its head count, not its Labor;
 * - **base features** — the flat term, which is the one that can be negative;
 * - **turns since the last siege** — the community's luck running out.
 *
 * Four terms and no weighting. They are listed in `src/data/turn.ts` rather
 * than left implicit in whatever adds them up, because the screen shows a
 * player *where* their Siege Threat came from.
 *
 * ## Nothing here is cached, and that is load-bearing
 *
 * Departures runs *after* this step and can remove a survivor, which
 * retroactively unstaffs a facility and shrinks the project team — so the
 * Siege Threat that step 6 computed is not the Siege Threat step 7 must use.
 * Every function here reads the campaign as it is at the moment it is asked.
 * The order of the steps is the order the steps run, not permission for a
 * number computed in one to survive into the next.
 *
 * Pure, like the rest of `src/engine`.
 */

import { SIEGE_THREAT_TERMS, SIEGE_TRIGGER, type SiegeThreatTerm } from '../data/turn';
import type { D10Result } from '../data/dice';
import { projectTeam, staffedFacilityCount } from './assignments';
import { siegeThreatFromBase } from './base';
import type { Campaign } from './campaign';

/**
 * The turn a campaign that has never been besieged counts from.
 *
 * A save from before v9 records no siege, and neither does a campaign in its
 * first turn — so "turns since" counts from the beginning of play. Named rather
 * than written as a bare 1, because it is an answer to a question the book does
 * not ask and a reader should be able to find it.
 */
export const FIRST_TURN = 1;

/**
 * How long the horde has left this community alone (pg. 23).
 *
 * Never negative. Between the check that triggers a siege and the turn it is
 * fought on, `lastSiegeTurn` is in the future — and "minus one turns since"
 * would *reduce* the Siege Threat that the Departures step two steps later
 * reads. Zero is the truthful answer for a community with a siege already
 * coming.
 */
export function turnsSinceLastSiege(campaign: Campaign): number {
  return Math.max(0, campaign.turn - (campaign.lastSiegeTurn ?? FIRST_TURN));
}

/** Each term of Siege Threat on its own, for the screen that shows the sum. */
export function siegeThreatTerms(campaign: Campaign): Record<SiegeThreatTerm, number> {
  const base = campaign.base;

  return {
    'staffed-facilities': staffedFacilityCount(campaign),
    'project-team': projectTeam(campaign).length,
    'base-features': base === null ? 0 : siegeThreatFromBase(base),
    'turns-since-last-siege': turnsSinceLastSiege(campaign),
  };
}

/**
 * The whole of it (pg. 23).
 *
 * Can be negative: the Renaissance Festival's Curtain Wall is −3 a turn and a
 * Spotlight −1, and a quiet community that has built for defence and staffed
 * nothing is genuinely safer than one that has not. Not clamped, because the
 * roll it feeds is a sum and clamping would invent a floor the book has not
 * printed.
 */
export function siegeThreat(campaign: Campaign): number {
  const terms = siegeThreatTerms(campaign);

  return SIEGE_THREAT_TERMS.reduce((total, term) => total + terms[term], 0);
}

/** Whether `d10 + Siege Threat` forces a Siege Defense next turn (pg. 23). */
export function siegeTriggered(roll: D10Result, threat: number): boolean {
  return roll + threat >= SIEGE_TRIGGER;
}

/** Whether this turn's mission is the siege the horde called (pg. 23). */
export function siegeDue(campaign: Campaign): boolean {
  return campaign.lastSiegeTurn === campaign.turn;
}

/** Whether this turn's Check the Horde has already been rolled. */
export function hordeChecked(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'horde-checked',
  );
}

/**
 * Whether this turn's roll brought the horde.
 *
 * Read off the entry rather than from `siegeDue`, which answers a different
 * question and answers it `false` here: the siege called by this turn's check
 * is fought *next* turn, so on the turn of the check nothing is due. A screen
 * reporting what just happened has to read the record of what happened.
 */
export function hordeCame(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) =>
      entry.turn === campaign.turn && entry.event.kind === 'horde-checked' && entry.event.siege,
  );
}

/**
 * The campaign with next turn's mission locked to Siege Defense.
 *
 * The turn **after** the check, because that is when the siege is fought — and
 * it is the same field `turnsSinceLastSiege` counts from, so one number
 * answers both questions the rule asks. A boolean would have needed somebody
 * to clear it; a turn number simply stops being this turn.
 */
export function withSiegeCalled(campaign: Campaign): Campaign {
  return { ...campaign, lastSiegeTurn: campaign.turn + 1 };
}
