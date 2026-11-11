/**
 * A slot card's verb while a campaign picked up partway is set up (#210;
 * `docs/continue-campaign.md`).
 *
 * The base is entered as it stands, so there are two presses where an order
 * has one: it is already there (built, upgraded or cleared before tracking
 * began), or it was ordered last turn and finishes at this turn's
 * Advancement. Both are free, since what it cost was spent at the table.
 * Everything else a build is checked for still applies, from the same checks
 * the forms in `src/engine/settingUp.ts` ask.
 *
 * Warnings are shown and need no override: the table has done it already, and
 * the form takes it.
 */

import type { ReactNode } from 'react';
import type { Check } from '../engine/checks';
import { PageRef } from './PageRef';
import { FOCUS_RING, PRIMARY_FILL, TOUCH_TARGET } from './styles';

export interface SetUpSlotActionProps {
  /** The picker, or nothing where the verb has nothing to choose. */
  readonly children?: ReactNode;
  /** Whether it can be entered as already there. */
  readonly placeCheck: Check<string>;
  /** Whether it can be entered as ordered last turn. */
  readonly carryCheck: Check<string>;
  /** "Already built", "Already upgraded", "Already cleared". */
  readonly placeLabel: string;
  readonly onPlace: () => void;
  readonly onCarry: () => void;
}

const SECONDARY = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium disabled:cursor-not-allowed disabled:text-stone-500 dark:border-stone-700 dark:disabled:text-stone-400`;

export function SetUpSlotAction({
  children,
  placeCheck,
  carryCheck,
  placeLabel,
  onPlace,
  onCarry,
}: SetUpSlotActionProps) {
  // Each reason once, whichever press it stands in the way of.
  const reasons = new Map(
    [
      ...placeCheck.blockers,
      ...placeCheck.warnings,
      ...carryCheck.blockers,
      ...carryCheck.warnings,
    ].map((violation) => [violation.message, violation]),
  );

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      {children}

      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        Free while setting up: what it cost was spent at the table.
      </p>

      {reasons.size > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {[...reasons.values()].map((violation) => (
            <li key={violation.message} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={placeCheck.blockers.length > 0}
          onClick={onPlace}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg ${PRIMARY_FILL} px-4 font-semibold disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
        >
          {placeLabel}
        </button>
        <button
          type="button"
          disabled={carryCheck.blockers.length > 0}
          onClick={onCarry}
          className={SECONDARY}
        >
          Ordered last turn
        </button>
      </div>
    </div>
  );
}
