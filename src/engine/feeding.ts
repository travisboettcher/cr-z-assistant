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
 * `max(0, Hunger − population)`, floored at zero and applied to stats rather
 * than to Skill Scores. This is [ruling 1](../../docs/phase-3-stories.md) and
 * it is the literal reading of pg. 22: the printed arithmetic computes
 * `population − Hunger` and tests it for negativity, which is the shape of a
 * threshold. A community of Tier 1–2 survivors can empty its stores completely
 * and never reach it — an accepted consequence, not a bug, and they are not
 * spared either way because Unrest counts the Hunger directly.
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
 * reads the most *recent* entry wherever it sits, which is what makes it last
 * "until the next Management Phase" — through the Mission, Advancement and
 * Planning Phases that follow it.
 *
 * One function served both until the September playtest, and it answered the
 * penalty's question. So a turn that skipped Feed fed the *previous* turn's
 * shortfall into Unrest, Departures and the threshold that sends somebody
 * away — observed as 9 Hunger on turn 7, carried from turn 6.
 *
 * Pure, like the rest of `src/engine`.
 */

import { FOOD_EATEN_PER_TURN } from '../data/turn';
import { beds } from './base';
import type { Campaign } from './campaign';

/** How much Food this community eats in a Management Phase (pg. 22). */
export function foodRequired(campaign: Campaign): number {
  return campaign.survivors.reduce(
    (total, survivor) => total + FOOD_EATEN_PER_TURN[survivor.tier],
    0,
  );
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
 * The Feed entries this campaign has written, oldest first.
 *
 * Collected and indexed from the end rather than walked backwards. An earlier
 * draft did the latter, which needed an optional chain on a subscript that
 * could not miss and hung the test runner under every mutant that reversed the
 * walk.
 */
function feedings(campaign: Campaign, thisTurnOnly: boolean) {
  return campaign.log.flatMap((entry) =>
    entry.event.kind === 'survivors-fed' && (!thisTurnOnly || entry.turn === campaign.turn)
      ? [entry.event]
      : [],
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
  return feedings(campaign, true).at(-1)?.hunger ?? 0;
}

/**
 * How much every stat in the community is reduced by (pg. 22, ruling 1).
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
 */
export function hungerPenalty(campaign: Campaign): number {
  // The most recent entry from anywhere in the log, unlike `hunger` — that is
  // what carries the penalty through the three phases after the one that set
  // it, which is what "until the next Management Phase" means.
  const fed = feedings(campaign, false).at(-1);
  if (fed === undefined) return 0;

  // `population` is absent from entries written before it was recorded. The
  // live head count is the only number available for those, and is what they
  // were read with anyway — so an old save behaves exactly as it did rather
  // than acquiring a new answer on load.
  return penaltyFor(fed.hunger, fed.population ?? campaign.survivors.length);
}

/**
 * The threshold itself, over two plain numbers.
 *
 * Separate from `hungerPenalty` because the Feed step has to show what a
 * shortfall *would* cost before it costs it, and that preview works from
 * `hungerIfFedNow` rather than from the log. A screen doing the subtraction
 * itself would be a second copy of ruling 1 waiting to disagree with this one.
 */
export function penaltyFor(shortfall: number, population: number): number {
  return Math.max(0, shortfall - population);
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
  const sleeping = base === null ? 0 : beds(base);

  return Math.max(0, campaign.survivors.length - sleeping);
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
  return hunger(campaign) + exhaustion(campaign);
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
