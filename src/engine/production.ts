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
import { working, type Occupant } from './base';
import type { Survivor } from './campaign';
import { skillScore } from './survivor';

/** Everything a base sheet has a row for, including the one that is a reduction. */
export type ProducedOutput = Produced | 'siege-threat';

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
): { readonly score: number; readonly anyHasSkill: boolean } {
  const scores = staff.map((survivor) => skillScore(survivor, skill));
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
 */
export function facilityProduction(
  occupant: Occupant,
  staff: readonly Survivor[] = [],
): readonly ProductionLine[] {
  const lines: ProductionLine[] = [];
  const supplied = (utility: Utility) => occupant[utility];

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

      const { score, anyHasSkill } = combinedScore(staff, production.skill);
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

    if (siege.reducedByBestOf !== undefined) {
      // The staff's *best* of the four, not their total: one lookout watching
      // with whatever they are best at (pg. 73). Scored once and read twice,
      // rather than recomputed for the amount and again for the skill check.
      const scores = siege.reducedByBestOf.map((candidate) => combinedScore(staff, candidate));

      lines.push({
        outputs: ['siege-threat'],
        amount: -Math.max(0, ...scores.map((scored) => scored.score)),
        halved: false,
        staffed: true,
        restrictedToStat: undefined,
        missingSkill: staff.length > 0 && !scores.some((scored) => scored.anyHasSkill),
      });
    }
  }

  return lines;
}

/** Whether anything in this slot would produce more with someone in it. */
export function wantsStaff(occupant: Occupant): boolean {
  return facilityProduction(occupant, []).some((line) => line.staffed);
}
