/**
 * What a turn form comes back with: the next campaign, or why not (#179).
 *
 * ## Why the forms are here and not in the reducer
 *
 * Every step of the turn had its **check** in the engine (`checkXpAward`,
 * `missionOutcomeProblem`, `rotCheckResolved`) and its **change** in the engine
 * (`withXpAwarded`, `withRotApplied`), but the *composition* — ask the guard,
 * make the change, write the entry — lived in `src/state/campaignStore.ts`. The
 * reducer was the only complete caller, so anything that drove a campaign
 * without the React store (a test harness, a headless replay, a standalone
 * core) had to write each composition again and then prove it agreed with the
 * reducer's.
 *
 * Each form is one function now, in the module for the phase it belongs to —
 * `missionForms.ts`, `advancementForms.ts`, `managementForms.ts` — or in
 * `campaignForms.ts` for the ones that belong to no single phase: the turn walk,
 * claiming the first base, and the roster. Each takes the campaign and the
 * form's input and returns a `FormResult`, **with its log entries built here**.
 * The reducer case is a call to it and nothing else.
 *
 * In modules of their own rather than beside each rule (`rot.ts`,
 * `departures.ts`, …) for two reasons. A form reads several rules at once — the
 * turn walk reads `turn.ts`, `planning.ts` and `siege.ts`, and `log.ts` itself
 * imports `turn.ts` — so beside any one of them it would close an import cycle
 * or pull a rule module up into knowing about the log. And a rule module answers
 * questions a screen asks before anything is pressed, while a form is the press:
 * keeping the two apart is what lets a screen import the questions without the
 * history.
 *
 * ## One shape for every form
 *
 * `{ ok: true, campaign }` or `{ ok: false, problem }`, discriminated on `ok`.
 *
 * - **Accepted** carries the whole next campaign — the change and its entries
 *   together, because a change without its entry is a step the next guard
 *   cannot see was taken (`materialsAdded`, `survivorsFed` and the rest read
 *   the log).
 * - **Refused** carries a sentence for a person at a table, the posture of
 *   `missionOutcomeProblem` and `standInProblem` and of a `Violation`'s
 *   `message`: say what stands in the way, cite nothing, restate no rule. Where
 *   a refusal comes from a `Check`, it is the first blocker's own message
 *   rather than a second wording of it.
 *
 * Not a `Check`, because a form is not asking whether something *may* go
 * ahead — it went ahead or it did not, and there is no warning a form can
 * return that the press has not already overridden. And not "the same campaign
 * back means refused", which is how the three purchases and the reducer used to
 * signal it: an identity test is one refactor from a spread that copies the
 * campaign and turns every refusal into a silent success.
 *
 * A form that cannot be refused — the turn walk, adding a survivor — returns
 * `Accepted` alone, which is still a `FormResult`: a caller holding any form's
 * result treats it the same way, and a caller holding one of these does not have
 * to pretend it might not have a campaign.
 *
 * ## The clock arrives from outside
 *
 * Every form that writes an entry takes `at`, the ISO 8601 time the player
 * pressed the button, as its last argument. The engine has no clock, so the
 * reducer's action carries it in from the click exactly as it always has; the
 * same input always gives the same campaign. Entries carry no id of their own —
 * a log entry is its turn, its phase, its time and its event (`logged`).
 *
 * **Nothing about a refusal is recorded.** A log of attempts is not a log of a
 * campaign, which was the reducer's rule before this and is still the reducer's
 * to keep: it drops `problem` and returns the campaign it was given.
 */

import type { Campaign } from './campaign';

/** The form went through, and this is the campaign afterwards. */
export interface Accepted {
  readonly ok: true;
  readonly campaign: Campaign;
}

/** The form was refused, and this is why — for a person, not a program. */
export interface Refused {
  readonly ok: false;
  readonly problem: string;
}

export type FormResult = Accepted | Refused;

export function accepted(campaign: Campaign): Accepted {
  return { ok: true, campaign };
}

export function refused(problem: string): Refused {
  return { ok: false, problem };
}

/**
 * The first blocker's message, or `null` when nothing blocks.
 *
 * Only blockers: a form is the press, so a warning the screen showed has
 * already been seen and overridden, or the button would not have been pressed.
 */
export function blockedBy(check: {
  readonly blockers: readonly { readonly message: string }[];
}): string | null {
  return check.blockers[0]?.message ?? null;
}
