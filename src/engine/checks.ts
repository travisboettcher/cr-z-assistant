/**
 * What is wrong with an action on a slot, split by whether the player may
 * proceed anyway.
 *
 * Four stories put a verb on the slot card — build, upgrade, clear, assign a
 * utility — and every one of them answers the same two questions, so the shape
 * of the answer lives here rather than being written out four times. See
 * `docs/base-slot-interaction.md`.
 *
 * **Generic over the code union on purpose.** Each verb keeps its own closed
 * set of codes, so a build violation cannot be returned from an upgrade check
 * and the typecheck says so; what they share is the three fields and the split,
 * which is the part worth having in one place.
 *
 * `legality.ts` has its own non-generic `Violation` for survivors. It predates
 * this and is left alone: converging them is a refactor of Phase 1 code with
 * nothing to gain today beyond tidiness.
 */

export interface Violation<Code extends string> {
  readonly code: Code;

  /** A sentence for a person at a table, not a rule restated. */
  readonly message: string;

  /** For `PageRef`, so the reader can check the rule itself. */
  readonly pages: number | string;
}

/**
 * The two lists, kept apart because the screen treats them completely
 * differently — one disables the button, the other unlocks an override — and a
 * caller that has to filter before it can render is a caller that can forget to.
 *
 * - A **blocker** stops the action: the slot is taken, the rubble is still
 *   there, the Hardware or Labor is not there to spend, the thing being asked
 *   for does not exist.
 * - A **warning** is a rule the player may break on purpose. The override is
 *   Z1-7's and is never stored: it gates the action once, and the base keeps
 *   reporting the violation for as long as it stands.
 *
 * **Affordability is always a blocker.** Overriding it would spend materials the
 * community does not have, and the honest fix for a wrong count is to correct
 * the count. Nothing in the book says what a base with −2 Hardware means, and
 * this app should not be the first to say it.
 */
export interface Check<Code extends string> {
  readonly blockers: readonly Violation<Code>[];
  readonly warnings: readonly Violation<Code>[];
}

/** Whether an action may go ahead, given whether its warnings were overridden. */
export function permitted<Code extends string>(check: Check<Code>, overridden: boolean): boolean {
  return check.blockers.length === 0 && (check.warnings.length === 0 || overridden);
}
