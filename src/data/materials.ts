/**
 * The materials a community stores — rules as data (pg. 54).
 *
 * Moved here from `src/engine/campaign.ts` in Phase 2. Which materials exist is
 * a rule, and the facility catalogue has to name them: a facility's storage
 * modifier and its production are both keyed by material. Leaving the list in
 * the engine would have made `src/data` import from `src/engine`, which is the
 * layering upside down — the engine is a set of functions over the rules, not
 * the place the rules live.
 */

/** The four stored material types. */
export const MATERIALS = ['food', 'fuel', 'hardware', 'rare'] as const;

export type Material = (typeof MATERIALS)[number];

export type Materials = Record<Material, number>;

/**
 * The materials a base has a storage cap for, in the order the rulebook's base
 * roster prints them (pg. 54).
 *
 * **Rare is deliberately absent.** The cap is stated for Food, Fuel and
 * Hardware, and Rare has none — so a cap for it would be this app inventing a
 * rule, not recording one. `STORED_MATERIALS` is therefore narrower than
 * `MATERIALS`, and the type keeps the two from being used interchangeably.
 */
export const STORED_MATERIALS = ['hardware', 'food', 'fuel'] as const;

export type StoredMaterial = (typeof STORED_MATERIALS)[number];

/**
 * A base stores its Tier + 3 of each capped material before any facility
 * raises it (pg. 54).
 *
 * The base roster prints a storage column per base, and every printed number is
 * this formula plus the base's built-in facilities — the Greasy Spoon's 6/6/6
 * is a Tier 1 base with a built-in Storage Area, not a special case. So the
 * printed numbers are **derived and never stored**; `rules.test.ts` asserts the
 * derivation reproduces every row of the roster, which is what makes that
 * table a check on this transcription rather than a second copy of it.
 */
export const STORAGE_ABOVE_TIER = 3;
