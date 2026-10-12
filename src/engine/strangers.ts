/**
 * Strangers rescued on this turn's missions, and which of them have joined
 * the community (pp. 19, 77, 79, 83; Z4-5).
 *
 * ## Read off the outcomes, answered in the log
 *
 * Six outcome kinds count strangers, each with a Tier: every standard
 * mission's but the two fought over the siege counter (pp. 76–84; Z4-3). Advancement Step 2 (pg. 19)
 * is where they join, so what the step offers is every stranger the turn's
 * outcomes counted — `teamOutcomes`, so a team that chose again (R21) offers
 * only its latest outcome's — less every one a `stranger-joined` entry has
 * already answered. Nothing is stored about a rescue: an outcome says who was
 * brought out, and an entry says who joined.
 *
 * A stranger is named by the team whose outcome counted them and their
 * position in that outcome's list, from 0. Two Tier 2 strangers on one team
 * are two strangers, so position rather than Tier is what tells them apart,
 * and the outcome cannot be edited, so a position always means the same one.
 *
 * ## This turn's, in this turn's Advancement Phase
 *
 * `teamOutcomes` reads the campaign's own turn, so the strangers of turn N are
 * offered in turn N's Advancement Phase — the one that follows the missions
 * that rescued them — and nowhere else. A stranger nobody added by the end of
 * the turn is named in the End-turn dialog like any other step left undone
 * (`outstanding`), and is not offered again: the turn that rescued them is
 * over. There is no entry for turning one away, because the book has none: a
 * rescued stranger is added to the community (pg. 19), and a community without
 * the beds for them pays in Exhaustion (pg. 23), not by refusing them.
 *
 * ## Built the way the roster builds one
 *
 * A Rookie, Citizen or Leader joins as a field recruit — the stat array of
 * their Tier and, from Tier 2, one skill off the d10 table (pp. 7, 15) — which
 * is exactly `survivor/recruited`'s survivor (pp. 13, 15, 19, 31). A Hero is
 * never recruited in the field (pg. 7), and the outcome guard refuses a Tier 4
 * stranger, so every stranger is one of those three (R24).
 */

import type { D10Result } from '../data/dice';
import { rollsForSkill, type FieldRecruitTier } from '../data/recruitTable';
import type { Campaign, Survivor } from './campaign';
import { isMissionOutcome, outcomeTeam, teamOutcomes } from './missions';
import { recruitSurvivor, type NewSurvivorOptions } from './survivor';
import { phaseOf } from './turn';

/** One stranger an outcome this turn counted. */
export interface RescuedStranger {
  /** The mission team whose outcome counted them. */
  readonly team: number;

  /** Their position in that outcome's `strangers`, from 0. */
  readonly stranger: number;

  readonly tier: FieldRecruitTier;
}

/** What Advancement Step 2 is told about a stranger joining. */
export interface StrangerForm {
  readonly team: number;
  readonly stranger: number;
  readonly name: string;

  /**
   * The d10 for their first skill (pg. 15), or absent: a Rookie and a Hero
   * never roll (pg. 7), and a Citizen or Leader joined without one is a skill
   * short, the state `recruitSurvivor` already leaves a roll of 10 in.
   */
  readonly roll?: D10Result | undefined;
}

/**
 * Every stranger this turn's outcomes counted, in team order and then in the
 * order each outcome lists them.
 */
export function rescuedStrangers(campaign: Campaign): readonly RescuedStranger[] {
  return [...teamOutcomes(campaign).values()]
    .sort((one, other) => outcomeTeam(one) - outcomeTeam(other))
    .flatMap((outcome) =>
      'strangers' in outcome
        ? outcome.strangers.map((tier, stranger) => ({
            team: outcomeTeam(outcome),
            stranger,
            tier,
          }))
        : [],
    );
}

/**
 * Which of each team's strangers have joined since that team's latest
 * outcome, read off this turn's log.
 *
 * Since the latest outcome rather than over the whole turn, because a failed
 * First Mission is played again in turn 1 (R21) and its second outcome is a
 * new list: somebody who joined from the first attempt's list is not the
 * second attempt's stranger in the same position.
 *
 * Not narrowed to this turn, and it needs no narrowing: every stranger on
 * offer comes from an outcome recorded this turn, which resets its team's
 * answers after anything an earlier turn wrote.
 */
function joined(campaign: Campaign): ReadonlyMap<number, ReadonlySet<number>> {
  const answered = new Map<number, Set<number>>();

  for (const { event } of campaign.log) {
    if (event.kind === 'stranger-joined') answered.get(event.team)?.add(event.stranger);
    else if (isMissionOutcome(event)) answered.set(outcomeTeam(event), new Set());
  }

  return answered;
}

/** Nobody joined, for a team whose outcome has no answers yet. */
const NOBODY: ReadonlySet<number> = new Set();

/** The strangers this turn rescued who have not joined the community yet. */
export function strangersWaiting(campaign: Campaign): readonly RescuedStranger[] {
  const answered = joined(campaign);

  return rescuedStrangers(campaign).filter(
    (rescued) => !(answered.get(rescued.team) ?? NOBODY).has(rescued.stranger),
  );
}

/**
 * Why this stranger cannot join now, or `null` if they can.
 *
 * In the Advancement Phase; a stranger this turn's outcomes counted, who has
 * not joined already; with a name; and with a roll only at a Tier that rolls
 * for a skill (pg. 7) — an entry that recorded one at any other Tier would
 * say a die chose a skill the survivor does not have.
 */
export function strangerProblem(campaign: Campaign, form: StrangerForm): string | null {
  if (phaseOf(campaign.step) !== 'advancement') {
    return 'A rescued stranger joins in the Advancement Phase.';
  }

  const rescued = rescuedStrangers(campaign).find(
    (candidate) => candidate.team === form.team && candidate.stranger === form.stranger,
  );

  if (rescued === undefined) return 'No such stranger was rescued this turn.';

  if (
    !strangersWaiting(campaign).some(
      (waiting) => waiting.team === form.team && waiting.stranger === form.stranger,
    )
  ) {
    return 'That stranger has already joined the community.';
  }

  if (form.name.trim() === '') return 'A new survivor needs a name.';

  if (form.roll !== undefined && !rollsForSkill(rescued.tier)) {
    return `A Tier ${String(rescued.tier)} stranger does not roll for a skill.`;
  }

  return null;
}

/** The survivor a stranger becomes: a field recruit at their Tier (pp. 15, 19). */
export function strangerSurvivor(
  name: string,
  tier: FieldRecruitTier,
  roll: D10Result | undefined,
  options: NewSurvivorOptions,
): Survivor {
  return recruitSurvivor(name, tier, roll, options);
}
