/**
 * Dice conventions — rules as data (pg. 8).
 *
 * A check is `d10 + a modifier` against a target, and it succeeds by meeting or
 * beating it. The modifier is a Skill Score for a skill check and the
 * survivor's Tier for a Tier check; the two differ only in what gets added, so
 * there is one convention here rather than two.
 *
 * **A natural 1 always fails and a natural 10 always succeeds**, whatever the
 * modifier and the target say. That is why the Rot check's target having no
 * stated floor (pg. 22) is survivable rather than a hole: a Medical Clinic
 * good enough to drive the target below 2 still loses a survivor on a 1.
 *
 * The one stated exception is the Viral origin's Infection check, which
 * suspends both (pg. 22). It is Phase 7's, and it is the reason these are two
 * named constants rather than a single hard-coded `if` inside a check: an
 * origin that switches them off needs them to be a thing that can be switched.
 *
 * Moved out of `recruitTable.ts` when the material roll in the Advancement
 * Phase became a second caller. A d10 is not a recruit-table concept; it only
 * lived there because the recruit table was the first table to need one.
 */

export const D10_RESULTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type D10Result = (typeof D10_RESULTS)[number];

/** A roll of this fails however good the survivor is (pg. 8). */
export const NATURAL_FAILURE = 1;

/** A roll of this succeeds however bad the odds are (pg. 8). */
export const NATURAL_SUCCESS = 10;
