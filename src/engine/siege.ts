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
import { suppliedOccupants } from './utilities';
import type { D10Result } from '../data/dice';
import { projectTeam, staffOf, staffedFacilityCount } from './assignments';
import { siegeThreatFromBase, siegeThreatReduction } from './base';
import { hungerPenalty } from './feeding';
import { facilityProduction } from './production';
import type { Campaign } from './campaign';
import type { CampaignEvent, LogEntry } from './log';

/**
 * The turn a campaign with no mission outcome behind it counts from.
 *
 * A save from before v12 records no outcome, and neither does a campaign in
 * its first turn — so "turns since" counts from the beginning of play. Named
 * rather than written as a bare 1, because it is an answer to a question the
 * book does not ask and a reader should be able to find it. It is also turn 1's
 * mission: the First Mission (pg. 75), which is why no Thin the Herd is
 * recorded on it.
 */
export const FIRST_TURN = 1;

/**
 * The turns a Siege Defense has been or will be played on, oldest first.
 *
 * A siege called by turn N's Check the Horde is fought in turn N + 1's Mission
 * Phase (pg. 23), so each `siege: true` roll names a turn one later than its
 * own. What the siege did to the counter is not here: that is its outcome's,
 * read by `turnsSinceLastSiege`.
 */
function siegeTurns(campaign: Campaign): readonly number[] {
  // A filter and a map rather than a `flatMap` returning `[]`: since only
  // `includes` reads this, a mutation run showed an empty array swapped for a
  // stray entry could not be told apart from the real thing.
  return campaign.log
    .filter((entry) => entry.event.kind === 'horde-checked' && entry.event.siege)
    .map((entry) => entry.turn + 1);
}

/**
 * A Siege Defense's or a Thin the Herd's outcome, as the player records it
 * (pp. 81, 86). The two missions whose rewards move the turns since the last
 * siege — two members of the wider `MissionOutcome` in `missions.ts`, which
 * every mission records since Z4-3.
 */
export type CounterOutcome = Extract<
  CampaignEvent,
  { readonly kind: 'siege-defense-resolved' | 'thin-the-herd-resolved' }
>;

/** What a recorded outcome does to the turns since the last siege. */
export type SiegeCounterChange = 'reset' | 'halved' | 'none';

function isOutcome(event: CampaignEvent): event is CounterOutcome {
  return event.kind === 'siege-defense-resolved' || event.kind === 'thin-the-herd-resolved';
}

/**
 * What one outcome does to the counter (pp. 81, 86).
 *
 * - **Reset** when no zombie was left on the mission area — both missions say
 *   so in their rewards.
 * - **Halved** for a Thin the Herd that left at least one zombie, but fewer
 *   than half the ones it started with, and got at least one survivor out over
 *   the map edge. "Fewer than half" is strict, so it is compared doubled rather
 *   than divided: 3 left of 6 is half, not fewer.
 * - **Nothing** otherwise. A Siege Defense fought with zombies still standing
 *   states no reset, and this app does not supply one.
 */
export function siegeCounterChange(outcome: CounterOutcome): SiegeCounterChange {
  // The cast is the correlated-union gap: TypeScript cannot see that the kind
  // picks the rule written for it. Looked up rather than branched on, so an
  // entry that is not an outcome has no rule at all instead of quietly
  // reading as "none".
  return (COUNTER_CHANGE[outcome.kind] as (of: CounterOutcome) => SiegeCounterChange)(outcome);
}

/** Each mission's own rule, read only off its own fields. */
const COUNTER_CHANGE: {
  readonly [Kind in CounterOutcome['kind']]: (
    outcome: Extract<CounterOutcome, { readonly kind: Kind }>,
  ) => SiegeCounterChange;
} = {
  'siege-defense-resolved': (outcome) => (outcome.zombiesLeft === 0 ? 'reset' : 'none'),
  'thin-the-herd-resolved': (outcome) => {
    if (outcome.zombiesLeft === 0) return 'reset';

    return outcome.survivorsExited > 0 && outcome.zombiesLeft * 2 < outcome.startingZombies
      ? 'halved'
      : 'none';
  },
};

/**
 * The counter after a change.
 *
 * **Halving rounds down.** The book does not say, and the counter is a whole
 * number of turns — it is added to a d10 and to Unrest, neither of which has a
 * half. Rounding down is the plain reading of halving a count (7 turns are
 * worth 3 whole turns after it, not 3½ and not 4), and it is the one that
 * never leaves the counter higher than half of what it was, which is the
 * smallest promise "halve" makes.
 */
const COUNTER_AFTER: Record<SiegeCounterChange, (count: number) => number> = {
  reset: () => 0,
  halved: (count) => Math.floor(count / 2),
  none: (count) => count,
};

/**
 * Whether a Siege Defense left the base overrun (pg. 86).
 *
 * At least one zombie still on the mission area and at least one survivor
 * gone over the map edge. The book then gives the player three ways to go on —
 * rebuilding through Claim a New Base, restarting through Start a New
 * Community, or abandoning the survivors — which `overrun.ts` follows (Z4-9).
 */
export function baseOverrun(outcome: CounterOutcome): boolean {
  return (
    outcome.kind === 'siege-defense-resolved' &&
    outcome.zombiesLeft > 0 &&
    outcome.survivorsExited > 0
  );
}

/**
 * How long the horde has left this community alone (pg. 23), as the outcomes
 * of Siege Defense and Thin the Herd have moved it (pp. 81, 86).
 *
 * **A siege being called or fought moves nothing; a mission outcome does.**
 * Until v12 this counted from the turn a siege was fought, which read the
 * reset into the siege itself. The book puts it in the missions' rewards
 * instead: a Siege Defense resets it only if it left no zombie on the area,
 * and a Thin the Herd can reset it or halve it. So the counter is folded over
 * the recorded outcomes, oldest first — each one sees the count as it stood on
 * its own turn, and every turn after adds one.
 *
 * **The September playtest stays fixed by construction.** It caught the term
 * falling inside one Management Phase: a stored, forward-dated siege turn
 * took it to 0 the moment Check the Horde called a siege, so Departures at
 * step 7 tested a pressure lower than the horde had just been rolled against
 * (observed 12 → 8, which saved a survivor from leaving). Nothing the
 * Management Phase writes is an outcome, so nothing between step 6 and step 7
 * can move this.
 *
 * Derived rather than stored, which is what makes the fold possible at all.
 */
export function turnsSinceLastSiege(campaign: Campaign): number {
  const last = campaign.log
    .filter((entry): entry is LogEntry & { readonly event: CounterOutcome } =>
      isOutcome(entry.event),
    )
    .reduce(
      (counter, entry) => ({
        turn: entry.turn,
        count: COUNTER_AFTER[siegeCounterChange(entry.event)](
          counter.count + entry.turn - counter.turn,
        ),
      }),
      { turn: FIRST_TURN, count: 0 },
    );

  return last.count + campaign.turn - last.turn;
}

/**
 * Whether the next Siege Threat roll succeeds on its own (pg. 81).
 *
 * A Thin the Herd on which every survivor was incapacitated says the next
 * mission is a Siege — which the book delivers by having the Siege Threat roll
 * succeed automatically the next time it is made. "Next time" is read off the
 * log: such an outcome recorded after the most recent Check the Horde. The
 * check itself still calls the siege through its own entry, so `siegeDue`
 * and `hordeCame` need nothing new.
 */
export function hordeForced(campaign: Campaign): boolean {
  const lastCheck = campaign.log.map((entry) => entry.event.kind).lastIndexOf('horde-checked');

  return campaign.log
    .slice(lastCheck + 1)
    .some((entry) => entry.event.kind === 'thin-the-herd-resolved' && entry.event.allIncapacitated);
}

/** Each term of Siege Threat on its own, for the screen that shows the sum. */
export function siegeThreatTerms(campaign: Campaign): Record<SiegeThreatTerm, number> {
  const base = campaign.base;

  return {
    'staffed-facilities': staffedFacilityCount(campaign),
    'project-team': projectTeam(campaign).length,
    'base-features': base === null ? 0 : siegeThreatFromBase(base, suppliedOccupants(campaign)),
    'turns-since-last-siege': turnsSinceLastSiege(campaign),
    'watched-from-above': watchedFromAbove(campaign),
  };
}

/**
 * What every staffed Watchtower on the base takes off the threat (pg. 71).
 *
 * Negative, because it is a term of a sum rather than a magnitude — the screen
 * names it as a reduction by showing the sign.
 *
 * Summed across slots and best-of within each, which is the distinction
 * `reducedByBestOf` spells: two lookouts in one tower give the better of their
 * Scores, two towers give both.
 *
 * The hunger penalty reaches it, like every other Score in the community — a
 * starving lookout watches worse.
 */
function watchedFromAbove(campaign: Campaign): number {
  // No base-less guard: `suppliedOccupants` returns nothing to reduce over.
  const penalty = hungerPenalty(campaign);
  const reduction = suppliedOccupants(campaign).reduce(
    (total, occupant) =>
      total + siegeThreatReduction(occupant, staffOf(campaign, occupant), penalty),
    0,
  );

  // Negated only when there is something to negate. `-0` is a distinct value
  // that serialises as `-0`, and the round-trip property test rejects one on
  // purpose — a term that is simply absent should read as plain zero.
  return reduction === 0 ? 0 : -reduction;
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

/**
 * The Siege Threat the siege due this turn was called at, or `null` when none
 * is due (pg. 85; #198).
 *
 * The book sizes a siege from it, and it is on the `horde-checked` entry that
 * called the siege, a turn before the siege is fought — the arithmetic
 * `siegeTurns` does, asked of the one call this turn answers.
 */
export function siegeCalledOn(campaign: Campaign): number | null {
  const call = campaign.log.find(
    (entry) => entry.turn + 1 === campaign.turn && entry.event.kind === 'horde-checked',
  )?.event;

  return call?.kind === 'horde-checked' && call.siege ? call.threat : null;
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

/**
 * Watchtowers with somebody in them who cannot watch (pg. 71).
 *
 * The slot ids, because a base can hold two towers and "one of them" is not an
 * answer a player can act on.
 *
 * `facilityProduction` has computed this per slot since Z3-6 — `missingSkill`
 * distinguishes "nobody assigned" from "the wrong person assigned", and its
 * comment says a player can only fix the problem they can see. Check the Horde
 * could not see it: the term read "+0 watched from a staffed Watchtower" with
 * no hint, which is the same 0 an empty tower gives (#143).
 */
export function towersWithoutTheSkill(campaign: Campaign): readonly string[] {
  // No base-less guard: `suppliedOccupants` returns nothing to look through.
  const penalty = hungerPenalty(campaign);

  return suppliedOccupants(campaign).flatMap((occupant) =>
    facilityProduction(occupant, staffOf(campaign, occupant), penalty).some(
      (line) => line.missingSkill && line.outputs.includes('siege-threat'),
    )
      ? [occupant.slotId]
      : [],
  );
}
