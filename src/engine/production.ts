/**
 * What a facility makes in a turn.
 *
 * The last piece of the base worksheet. A passive facility makes a number; a
 * staffed one makes its staff's Skill Score in the skill the book names, halved
 * — rounding up — where a missing utility halves it rather than switching it off
 * (pg. 54, 72–73).
 *
 * **Staffing arrives as an argument and is never stored.** Assigning a survivor
 * to a facility is Planning Step 1, and Phase 3 owns it along with the rule that
 * a survivor takes exactly one task. What this phase can honestly offer is a
 * preview: pick someone, see what the facility would make. Storing that pick
 * would be building the Planning Phase a phase early, without the rules that
 * make it correct.
 *
 * Whether an entry produces at all is `working` in `base.ts` — the same filter
 * that decides whether it stores or sleeps anyone, because an unmet requirement
 * means no effect at all and that is one rule, not three.
 */

import type { Produced, Utility } from '../data/facilities';
import type { Stat } from '../data/skills';
import { siegeThreatReduction, watchSkills, working, type Occupant } from './base';
import type { Survivor } from './campaign';
import { skillScore } from './survivor';

/** Everything a base sheet has a row for, including the one that is a reduction. */
export type ProducedOutput = Produced | 'siege-threat';

/**
 * No hunger penalty, for the callers that genuinely have none to apply.
 *
 * Named rather than a bare zero so that "this community is not hungry" and
 * "this question is not about hunger at all" read differently at the call site.
 */
export const NO_PENALTY = 0;

/**
 * One thing a facility makes this turn.
 *
 * `outputs` is a list because the Utility Station makes its Score as Power
 * **and/or** Water, split however the player likes (pg. 72) — one amount across
 * two outputs, which a row per output would double.
 */
export interface ProductionLine {
  readonly outputs: readonly ProducedOutput[];
  readonly amount: number;
  /** Halved for want of a utility, rounding up. */
  readonly halved: boolean;
  /** Whether this line needs someone assigned to it. */
  readonly staffed: boolean;
  /** XP that may only be spent on skills governed by this stat (pg. 73). */
  readonly restrictedToStat: Stat | undefined;
  /**
   * Set when the line is staffed by someone without the skill it asks for.
   *
   * A Skill Score is a stat plus a level, and a survivor who has never learnt
   * Rationing has no Rationing Score — not a zero one. The distinction is worth
   * keeping: "nobody assigned" and "the wrong person assigned" are different
   * problems and a player can only fix the one they can see.
   */
  readonly missingSkill: boolean;
}

/** The staff's combined Score in a skill, and whether any of them have it. */
function combinedScore(
  staff: readonly Survivor[],
  skill: Parameters<typeof skillScore>[1],
  penalty: number,
): { readonly score: number; readonly anyHasSkill: boolean } {
  const scores = staff.map((survivor) => skillScore(survivor, skill, penalty));
  const known = scores.filter((score): score is number => score !== null);

  return {
    score: known.reduce((total, score) => total + score, 0),
    anyHasSkill: known.length > 0,
  };
}

/** Halved rounds up (pg. 72): a Score of 3 without Water is still 2. */
function halve(score: number): number {
  return Math.ceil(score / 2);
}

/**
 * Everything this facility makes this turn, given who is working it.
 *
 * Pass an empty roster for the unstaffed answer, which is a real one: upgrades
 * that produce do so whether or not the facility is worked (pg. 54), so a
 * Workshop with an Auto Shop still makes its Fuel with nobody in it.
 *
 * `penalty` is the community's hunger penalty (pg. 22) and has no default, for
 * the reason `skillScore` has none: a caller that ought to pass it and forgets
 * would quietly report a starving base's output as though nobody were hungry.
 * Staffing this module's own defaults away is what made the typechecker list
 * every screen that reads production.
 */
export function facilityProduction(
  occupant: Occupant,
  staff: readonly Survivor[],
  penalty: number,
): readonly ProductionLine[] {
  const lines: ProductionLine[] = [];
  const supplied = (utility: Utility) => occupant[utility];

  /*
   * The layout's own flat output, which belongs to the *slot* rather than to
   * the facility in it — the Distillery's Utility Station makes 2 Water with
   * nobody in it ([R4](../../docs/rulings.md)), and a Utility Station's own
   * production is skill-named rather than flat.
   *
   * `flatUtilitiesGenerated` has always counted this, so the base sheet showed
   * the 2 Water while the slot card said the facility produced nothing: two
   * screens, two answers, from the same data. First because it is a property of
   * the slot standing there, before anything the facility or its upgrades do.
   */
  if (occupant.flatOutput !== undefined) {
    lines.push({
      outputs: [occupant.flatOutput.output],
      amount: occupant.flatOutput.amount,
      halved: false,
      staffed: false,
      restrictedToStat: undefined,
      missingSkill: false,
    });
  }

  for (const entry of working(occupant)) {
    for (const production of entry.effects.production ?? []) {
      if (production.kind === 'flat') {
        const boosted =
          production.withUtility !== undefined && supplied(production.withUtility.utility)
            ? production.withUtility.amount
            : production.amount;

        lines.push({
          outputs: [production.output],
          amount: boosted,
          halved: false,
          staffed: false,
          restrictedToStat: production.restrictedToStat,
          missingSkill: false,
        });
        continue;
      }

      const { score, anyHasSkill } = combinedScore(staff, production.skill, penalty);
      const missingSkill = staff.length > 0 && !anyHasSkill;

      if (production.kind === 'staffed-split') {
        // The Utility Station, which is never halved: its Score is the split
        // itself. Handled apart from the staffed case rather than folded into
        // one condition, so "which kind is this" is asked once and `halved`
        // cannot be computed for a shape that has no `halvedWithout` to read.
        lines.push({
          outputs: production.outputs,
          amount: score,
          halved: false,
          staffed: true,
          restrictedToStat: undefined,
          missingSkill,
        });
        continue;
      }

      // Every staffed entry in the table names a utility it halves without, so
      // the guard is unexercised by data rather than unnecessary — a facility
      // that halves for nothing is a shape the type allows.
      const halved = production.halvedWithout !== undefined && !supplied(production.halvedWithout);

      lines.push({
        outputs: [production.output],
        amount: halved ? halve(score) : score,
        halved,
        staffed: true,
        restrictedToStat: undefined,
        missingSkill,
      });
    }

    // Siege Threat reads as production on the sheet because it is the same
    // question — what does this facility do this turn — even though the number
    // comes off a total rather than into a store.
    const siege = entry.effects.siegeThreat;
    if (siege === undefined) continue;

    if (siege.perTurn !== undefined) {
      lines.push({
        outputs: ['siege-threat'],
        amount: siege.perTurn,
        halved: false,
        staffed: false,
        restrictedToStat: undefined,
        missingSkill: false,
      });
    }
  }

  /*
   * One line for the whole slot, and the same function the horde check totals.
   *
   * The rule is one lookout watching with whatever they are best at (pg. 73):
   * the best single Score across the staff, not the sum of theirs. This said
   * as much in a comment and then routed the four skills through
   * `combinedScore`, which adds across staff — right about best-of-four-skills
   * and wrong about the people. Latent until #100 let two lookouts share a
   * tower, and then the card read −11 against the total's −6 (#142).
   *
   * Per slot rather than per entry for the same reason: two towers give both
   * reductions and two lookouts in one tower give the better of them, which is
   * a fact about the tower and not about each upgrade on it.
   */
  const watches = watchSkills(occupant);

  if (watches.length > 0) {
    lines.push({
      outputs: ['siege-threat'],
      amount: -siegeThreatReduction(occupant, staff, penalty),
      halved: false,
      staffed: true,
      restrictedToStat: undefined,
      missingSkill:
        staff.length > 0 &&
        !staff.some((survivor) =>
          watches.some((skill) => skillScore(survivor, skill, penalty) !== null),
        ),
    });
  }

  return lines;
}

/**
 * Whether anything in this slot would produce more with someone in it.
 *
 * Asked with no staff and no penalty, and neither is a shortcut: whether a
 * facility *wants* somebody is a fact about the catalogue, and a starving
 * community still has the same facilities.
 */
export function wantsStaff(occupant: Occupant): boolean {
  return facilityProduction(occupant, [], NO_PENALTY).some((line) => line.staffed);
}
