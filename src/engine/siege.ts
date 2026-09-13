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
 * The turns a Siege Defense has actually been played on, oldest first.
 *
 * A siege called by turn N's Check the Horde is fought in turn N + 1's Mission
 * Phase (pg. 23), so each `siege: true` roll names a turn one later than its
 * own — and a call that has not come round yet names a turn in the future,
 * which is why the readers below filter rather than take the last.
 */
function siegeTurns(campaign: Campaign): readonly number[] {
  return campaign.log.flatMap((entry) =>
    entry.event.kind === 'horde-checked' && entry.event.siege ? [entry.turn + 1] : [],
  );
}

/**
 * How long the horde has left this community alone (pg. 23).
 *
 * **Counts only sieges already fought.** This is the term the September
 * playtest caught: it read a stored `lastSiegeTurn` that the check wrote
 * forward-dated to the turn the siege *would* be fought on, so calling a siege
 * at step 6 took the term to 0 for the rest of that phase — and Departures at
 * step 7 tested a pressure lower than the one the horde had just been rolled
 * against. Observed falling 12 → 8 within the phase, which saved a survivor
 * from leaving.
 *
 * The clamp that used to be here was reasoned about as *preventing* exactly
 * that, and did the opposite: it stopped the term going to −1 and let it go
 * to 0, which was the whole of the damage.
 *
 * Derived rather than stored, which is what makes it possible at all. One field
 * cannot hold both "when the last siege was fought" and "when the next one is",
 * and writing the second over the first is how the history was lost.
 */
export function turnsSinceLastSiege(campaign: Campaign): number {
  const fought = siegeTurns(campaign).filter((turn) => turn <= campaign.turn);

  return campaign.turn - (fought.at(-1) ?? FIRST_TURN);
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
  return siegeTurns(campaign).includes(campaign.turn);
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
 * The other reading of the same field: `siegeDue` asks whether a siege is
 * fought *this* turn, and this asks whether one has been called for the next.
 * They are both false in between, which is the whole reason both exist — a
 * screen reporting the outcome of the check it just ran cannot use `siegeDue`,
 * because on the turn of the check nothing is yet due.
 *
 * An earlier draft read the log for the entry the check wrote, which needed a
 * `kind` guard the typechecker wanted and nothing could reach: no other event
 * carries a `siege` field, so the guard could never be the reason the answer
 * came out false.
 */
export function hordeCame(campaign: Campaign): boolean {
  return siegeTurns(campaign).includes(campaign.turn + 1);
}

/**
 * Nothing to write.
 *
 * The check logs a `horde-checked` entry carrying its own turn and whether it
 * triggered, and that entry is the record — a siege called on turn N is fought
 * on turn N + 1, which is arithmetic over a fact already written down. The
 * campaign carried a `lastSiegeTurn` beside it until the September playtest
 * found what a single forward-dated field costs: setting it destroyed the
 * previous siege's turn, so "turns since" collapsed to 0 the moment a new one
 * was called.
 *
 * Left as a named absence rather than deleted silently, because "the siege is
 * recorded by the log entry the caller is already writing" is the thing a
 * reader of `management/hordeChecked` needs to know.
 */
