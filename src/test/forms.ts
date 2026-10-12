/**
 * Reading a form's result in a test (#179).
 *
 * Both narrow by throwing, so a test that expected a refusal and got a campaign
 * fails on the line that says so rather than on a property read three lines
 * later. Here rather than copied into each form suite because four suites share
 * it, and `src/test` is outside the mutation config.
 */

import type { Campaign } from '../engine/campaign';
import type { FormResult } from '../engine/forms';

/** The campaign the form produced, or a failure naming the refusal. */
export function expectAccepted(result: FormResult): Campaign {
  if (!result.ok) throw new Error(`expected the form to go through, but: ${result.problem}`);

  return result.campaign;
}

/** Why the form was refused, or a failure if it went through. */
export function expectRefused(result: FormResult): string {
  if (result.ok) throw new Error('expected the form to be refused, but it went through');

  return result.problem;
}
