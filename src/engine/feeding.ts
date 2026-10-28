/**
 * Feed your Survivors and Assign Beds — Management Phase steps 2 and 3
 * (pp. 22–23).
 *
 * ## Two numbers that look like one rule and are not
 *
 * **Hunger** is a shortfall of Food, and it is one of the two terms of Unrest
 * (pg. 23). **The hunger penalty** is a separate consequence of the same
 * shortfall that reaches every stat in the community and every score derived
 * from one. A single function returning "Hunger" and calling it done gets
 * Unrest right and every Skill Score wrong.
 *
 * ## The penalty is a starvation threshold, not a tax
 *
 * Nothing while Hunger is no more than the population; past it, the whole
 * Hunger, applied to stats rather than to Skill Scores and floored at zero.
 * This is [R1](../../docs/rulings.md): pg. 22's arithmetic tests
 * `population − Hunger` for negativity, which is the shape of a threshold, and
 * FAQ "Hunger Penalty"'s worked example takes more off a stat than the
 * difference ever could (#215). A community of Tier 1–2 survivors can empty its
 * stores completely and never reach it — an accepted consequence, not a bug,
 * and they are not spared either way because Unrest counts the Hunger directly.
 *
 * ## Neither Hunger nor Exhaustion is ever stored
 *
 * Both are recomputed from scratch, which is what "not cumulative" means and
 * why the book says it twice. Exhaustion is easy: population against beds, both
 * live, so it is a function of the campaign and nothing else.
 *
 * Hunger cannot be a function of the campaign *alone*, because feeding is
 * destructive — once the Food is eaten, four stored against ten required and
 * nine stored against ten required look identical. So the Feed step writes a
 * `survivors-fed` entry carrying the shortfall, and `hunger` reads the most
 * recent one. That is the same move `materialsAdded` and `woundsHealed` make,
 * and it is not a stored derived value: what a community went short by on a
 * given turn is a fact about that turn, exactly like what went into storage.
 *
 * **Two readers, two different questions, and collapsing them was a bug.**
 * `hunger` is this turn's shortfall and is the term of Unrest (pg. 23): a turn
 * whose Feed step has not run has no Hunger, because Hunger is recalculated
 * each turn and is not cumulative. `hungerPenalty` is the stat penalty, and it
 * reads the most recent entry *that is still in force* — which is what makes it
 * last "until the next Management Phase", through the Mission, Advancement and
 * Planning Phases that follow it.
 *
 * One function served both until the September playtest, and it answered the
 * penalty's question. So a turn that skipped Feed fed the *previous* turn's
 * shortfall into Unrest, Departures and the threshold that sends somebody
 * away — observed as 9 Hunger on turn 7, carried from turn 6.
 *
 * ## The penalty expires on a clock, not on the next entry
 *
 * pg. 22 runs the penalty "until the next turn's Management Phase", and that is
 * a time, not an event. Reading the most recent entry and stopping there made
 * the expiry implicit in the next Feed step overwriting it — which holds only
 * while a Feed step always runs. Skipping one left the penalty in force for the
 * rest of the campaign, silently costing 2 Food a turn three Management Phases
 * later (#164).
 *
 * `penaltyInForce` is the clock the book describes, and it is the whole of the
 * fix: the penalty is gone when the next turn's Management Phase opens, whether
 * or not anybody ate in it. **Not** a turn filter of the kind `hunger` uses —
 * that would break the deliberate carry through the following turn's first
 * three phases, which is the thing the penalty is *for*.
 *
 * Pure, like the rest of `src/engine`.
 */

import { FOOD_EATEN_PER_TURN } from '../data/turn';
import { phaseOf } from './turn';
import { suppliedOccupants } from './utilities';
import { beds, working } from './base';
import { claimWon } from './claim';
import { warehouseQuiet } from './storyRewards';
import type { Campaign, Survivor } from './campaign';
import { advantagesOf } from './survivor';

/** How much Food this community eats in a Management Phase (pg. 22). */
export function foodRequired(campaign: Campaign): number {
  return campaign.survivors.reduce((total, survivor) => total + foodEaten(survivor), 0);
}

/** What one survivor eats: their Tier's, or Light Eater's 1 whatever the Tier (pg. 139). */
export function foodEaten(survivor: Survivor): number {
  const light = advantagesOf(survivor).find((rules) => rules.foodEaten !== undefined);

  return light?.foodEaten ?? FOOD_EATEN_PER_TURN[survivor.tier];
}

/**
 * What the community would go short by if it ate right now.
 *
 * The Feed step's preview, and only that. Once the step has run it is the wrong
 * number — the Food is gone, so this reports the whole requirement as a
 * shortfall. `hunger` is what everything else should ask.
 */
export function hungerIfFedNow(campaign: Campaign): number {
  return Math.max(0, foodRequired(campaign) - campaign.materials.food);
}

/**
 * The Feed entries this campaign has written **this turn**, oldest first.
 *
 * Collected and indexed from the end rather than walked backwards. An earlier
 * draft did the latter, which needed an optional chain on a subscript that
 * could not miss and hung the test runner under every mutant that reversed the
 * walk.
 *
 * This turn's only, with no switch for the other question: the penalty is the
 * one reader that looks past the turn it was written in, and it goes through
 * `penaltyInForce` because what it needs is not "every entry" but "the entry
 * whose clock is still running".
 */
function feedings(campaign: Campaign) {
  return campaign.log.flatMap((entry) =>
    entry.event.kind === 'survivors-fed' && entry.turn === campaign.turn ? [entry.event] : [],
  );
}

/**
 * What the community went short by when it ate **this turn** (pg. 22).
 *
 * Zero before this turn's Feed step has run, which is the honest answer twice
 * over: nobody has gone hungry yet, and Hunger is recalculated each turn rather
 * than carried — "not cumulative" is the rule in as many words.
 *
 * This is the term of Unrest, and the turn filter is the whole of the fix.
 * Without one it reported the previous turn's shortfall to a step that had not
 * eaten yet, and Unrest, Departures and the threshold that sends somebody away
 * all believed it.
 */
export function hunger(campaign: Campaign): number {
  return feedings(campaign).at(-1)?.hunger ?? 0;
}

/**
 * What the community was recorded as needing when it ate **this turn**.
 *
 * Falls back to the live requirement before the step has run, which is the same
 * number — nothing has been recorded yet, and `foodRequired` is what the step is
 * about to eat.
 *
 * It exists because the Feed screen was printing half a recorded fact beside
 * half a live one: "eats 6 Food… 8 Hunger", which is arithmetic no campaign can
 * produce. Anything that changes the roster after the step — a departure, a Rot
 * death, a recruit — moves the live requirement while the recorded shortfall
 * stays put, and the pair stops adding up. Both halves now come off the same
 * entry, the same fix `hungerPenalty` needed for the same reason.
 */
export function foodRequiredAsFed(campaign: Campaign): number {
  return feedings(campaign).at(-1)?.required ?? foodRequired(campaign);
}

/**
 * How much every stat in the community is reduced by (pg. 22, R1).
 *
 * Zero unless the shortfall is larger than the head count. Never negative, and
 * `statValue` floors the result at zero as well — the two clamps answer
 * different questions and both are load-bearing: this one is "is there a
 * penalty at all", and that one is "can a stat go below zero".
 *
 * **Both terms are the ones the Feed step saw.** pg. 22 takes the shortfall and
 * the head count together at Feed and holds the result until the next
 * Management Phase, so anything that changes the roster afterwards — a
 * departure, a Rot death, a recruit — must not re-price a penalty already in
 * force. Pairing a recorded shortfall with a live population did exactly that,
 * and in the wrong direction: losing a survivor made the same food shortage
 * hurt the people left *more*.
 *
 * **How long it holds is `penaltyInForce`**, and it is a clock rather than the
 * next entry arriving.
 */
export function hungerPenalty(campaign: Campaign): number {
  const fed = penaltyInForce(campaign);
  if (fed === undefined) return 0;

  return penaltyFor(fed.hunger, fedPopulation(campaign));
}

/**
 * The Feed entry whose penalty is still running, and nothing once it has
 * expired (pg. 22, [R1](../../docs/rulings.md)).
 *
 * The book's clock, in two lines. A penalty set by turn N's Feed step holds for
 * the rest of turn N — the four Management steps after Feed — and through turn
 * N + 1's Mission, Advancement and Planning Phases. It is gone the moment turn
 * N + 1's Management Phase opens, which is where "until the next turn's
 * Management Phase" puts it, and is therefore already gone at that phase's Rot
 * check rather than at its Feed step.
 *
 * Nothing needs to clear it, and a turn that ends with Feed unresolved needs no
 * special case: an entry that is out of date simply stops being in force. The
 * expiry used to be implicit in the next entry overwriting this one, which is a
 * different rule that agrees with this one only while every turn feeds.
 *
 * Stepping back into an earlier phase of the current turn puts the penalty back
 * in force, which is right — it is in force at that point in the turn.
 */
function penaltyInForce(campaign: Campaign) {
  const fed = campaign.log
    .flatMap((entry) =>
      entry.event.kind === 'survivors-fed' ? [{ turn: entry.turn, event: entry.event }] : [],
    )
    .at(-1);

  if (fed === undefined) return undefined;

  if (fed.turn === campaign.turn) return fed.event;

  return fed.turn === campaign.turn - 1 && phaseOf(campaign.step) !== 'management'
    ? fed.event
    : undefined;
}

/**
 * The penalty that was in force when **this turn's Planning Phase** ran.
 *
 * Utilities are generated and assigned at Planning Step 1 and last until the
 * next Planning Phase (pg. 20, 67). The hunger penalty lands at Management Step
 * 2, four steps later in the same turn, and lowers Cooperation — so the live
 * Utilities Score drops under an assignment that was legal when it was made.
 *
 * The book leaves no room for that to revoke anything. The Score *is* live —
 * pg. 22 says to adjust Skill Scores accordingly for the turn, and the penalty
 * duly reduces what the **next** turn's Planning Step 1 can generate — but the
 * points already on the board were generated by a community that could generate
 * them, and nothing in the rules takes an assigned point back before the next
 * Planning Phase expires it. So the assignment stands, and the pool that backs
 * it is the one the assignment was made from (#169).
 *
 * Which is this: the entry from the turn *before* this one, because R1's clock
 * holds a penalty through the following turn's first three phases and Planning
 * is the third of them. Once this turn's Feed writes its own entry,
 * `hungerPenalty` moves on to it and this deliberately does not.
 */
export function planningPenalty(campaign: Campaign): number {
  const fed = penaltyInForce(campaign);
  if (fed === undefined) return 0;

  // The one in force *now* is also the one that was in force at Planning, right
  // up until this turn's Feed step runs — and after that, the entry this turn
  // opened with is the previous turn's. `penaltyInForce` has already applied
  // the clock, so anything it returns from an earlier turn is still running.
  const atPlanning = campaign.log
    .flatMap((entry) =>
      entry.event.kind === 'survivors-fed' && entry.turn < campaign.turn ? [entry.event] : [],
    )
    .at(-1);

  const chosen = survivorsFed(campaign) ? atPlanning : fed;
  if (chosen === undefined) return 0;

  return penaltyFor(chosen.hunger, chosen.population ?? campaign.survivors.length);
}

/**
 * The head count the penalty in force was priced against (pg. 22, R1).
 *
 * Exported because the Feed step says the threshold out loud — "the penalty
 * starts once the shortfall passes the head count of 5" — and a screen reading
 * the live roster for that sentence prints a different rule from the one in
 * force, which is #102 again one layer up (#143).
 *
 * `population` is absent from entries written before it was recorded. The live
 * head count is the only number available for those, and is what they were read
 * with anyway — so an old save behaves exactly as it did rather than acquiring
 * a new answer on load.
 */
export function fedPopulation(campaign: Campaign): number {
  return penaltyInForce(campaign)?.population ?? campaign.survivors.length;
}

/**
 * The threshold itself, over two plain numbers: the whole shortfall once it
 * passes the head count, and nothing before (R1, #215).
 *
 * Separate from `hungerPenalty` because the Feed step has to show what a
 * shortfall *would* cost before it costs it, and that preview works from
 * `hungerIfFedNow` rather than from the log. A screen doing the subtraction
 * itself would be a second copy of R1 waiting to disagree with this one.
 */
export function penaltyFor(shortfall: number, population: number): number {
  return shortfall > population ? shortfall : 0;
}

/**
 * How many survivors have nowhere to sleep (pg. 23).
 *
 * Live, unlike Hunger: beds and population are both readable at any moment, so
 * Exhaustion needs no record and returns to zero the instant a Bunk Room goes
 * up. Nothing is destroyed by the Assign Beds step, which is why it has no
 * "already done" guard while the other two steps of this phase do.
 */
export function exhaustion(campaign: Campaign): number {
  const base = campaign.base;
  const sleeping = base === null ? 0 : beds(base, suppliedOccupants(campaign));

  // Outdoor Enthusiast takes no bed (pg. 139; Z7-10).
  const sleepers = campaign.survivors.filter(
    (survivor) => !advantagesOf(survivor).some((rules) => rules.needsNoBed === true),
  );

  return Math.max(0, sleepers.length - sleeping);
}

/**
 * The community's Unrest — Hunger plus Exhaustion (pg. 23).
 *
 * The whole of step 4, and one line because both terms already exist. Here
 * rather than in a module of its own because it is the *sum* of what this one
 * computes, and a `unrest.ts` holding one addition would be a file to open on
 * the way to the two numbers that matter.
 *
 * Never stored. Both terms are recomputed from scratch every Management Phase
 * — the book says so twice — and so is this.
 */
export function unrest(campaign: Campaign): number {
  if (unrestLocked(campaign)) return 0;

  return Math.max(0, hunger(campaign) + exhaustion(campaign) + unrestFromBase(campaign));
}

/**
 * What the base's working facilities add to Unrest (pg. 49; Z5-8): the video
 * game console's −3 while it has Power. Unrest is never below zero, so this
 * can only take away what Hunger and Exhaustion put there.
 */
export function unrestFromBase(campaign: Campaign): number {
  return suppliedOccupants(campaign).reduce(
    (total, occupant) =>
      working(occupant).reduce((sum, entry) => sum + (entry.effects.unrest ?? 0), total),
    0,
  );
}

/**
 * Whether Unrest is held at 0 for the rest of the turn, because a Claim a New
 * Base was won in it (pg. 79; Z4-8), or the Warehouse brought enough home
 * (pg. 102; R125; Z7-4).
 *
 * The lock is on the sum, not its terms: Hunger still costs the stats it costs
 * (R1) and Exhaustion still takes a survivor off the mission team (pg. 23).
 * Departures reads Unrest as it reads any, so with the lock it is left to
 * Siege Threat alone — the lock changes the number, not the rule. The next
 * turn counts Unrest afresh, as every turn does.
 */
export function unrestLocked(campaign: Campaign): boolean {
  return claimWon(campaign) || warehouseQuiet(campaign);
}

/** Whether this turn's Feed step has already run. */
export function survivorsFed(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'survivors-fed',
  );
}

/**
 * The campaign after the community has eaten.
 *
 * Takes what there is when there is not enough, rather than going negative:
 * stores cannot be less than empty, and the shortfall is recorded as Hunger
 * rather than as a debt.
 */
export function withSurvivorsFed(campaign: Campaign): Campaign {
  const eaten = Math.min(foodRequired(campaign), campaign.materials.food);

  return {
    ...campaign,
    materials: { ...campaign.materials, food: campaign.materials.food - eaten },
  };
}
