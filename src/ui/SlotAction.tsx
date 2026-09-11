/**
 * The shape every verb on a slot card wears.
 *
 * `docs/base-slot-interaction.md` says each of Z2-5 through Z2-8 reads the same
 * four parts in the same order — what you are choosing, what it costs, what is
 * wrong with it, then the button and its override. This is the last three of
 * those, so a verb only has to supply its own picker and say what it does.
 *
 * Extracted when the second verb arrived rather than the third: the parts below
 * were identical between building and upgrading down to the disabled styling,
 * and two copies of an override checkbox is two places to get the rule about
 * not storing it wrong.
 */

import type { ReactNode } from 'react';
import { PROJECT_STEP } from '../data/turn';
import type { Campaign } from '../engine/campaign';
import type { Check } from '../engine/checks';
import { permitted } from '../engine/checks';
import { PageRef } from './PageRef';
import { STEP_LABELS } from './turnLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface SlotActionProps<Code extends string> {
  /** The picker, or nothing where the verb has nothing to choose. */
  readonly children?: ReactNode;
  /** For the note about which step projects belong to (pg. 19). */
  readonly campaign: Campaign;
  readonly cost: { readonly hardware: number; readonly labor: number };
  readonly check: Check<Code>;
  /** Whether the player has waved the warnings through. */
  readonly overridden: boolean;
  readonly onOverride: (overridden: boolean) => void;
  readonly label: string;
  /** What the override checkbox says — "Build it anyway", "Add it anyway". */
  readonly overrideLabel: string;
  readonly onCommit: () => void;
}

export function SlotAction<Code extends string>({
  children,
  campaign,
  cost,
  check,
  overridden,
  onOverride,
  label,
  overrideLabel,
  onCommit,
}: SlotActionProps<Code>) {
  const refused = check.blockers.length > 0;
  const violations = [...check.blockers, ...check.warnings];

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      {children}

      {/* Before the button, not after it. */}
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        {cost.hardware} Hardware · {cost.labor} Labor <PageRef pages="72–73" />
      </p>

      {violations.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {violations.map((violation) => (
            <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      {/*
       * Projects are ordered in the Planning Phase and finish in the next
       * Advancement Phase (pg. 20, 19). Phase 2 shipped building as something
       * you could do at any moment, and taking that away now would break every
       * campaign mid-turn — so the app says which step this belongs to and
       * leaves the button alone. A note rather than a `Check` code, because it
       * is the same sentence for all three verbs and would otherwise be a
       * fourth member of three separate closed unions.
       */}
      {campaign.step !== PROJECT_STEP && (
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          Projects belong to {STEP_LABELS[PROJECT_STEP]}, and the turn is at{' '}
          {STEP_LABELS[campaign.step]}. <PageRef pages={19} />
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!permitted(check, overridden)}
          onClick={onCommit}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
        >
          {label}
        </button>

        {/*
         * Offered only for a rule the player may break, and only when nothing
         * else refuses the action. There is no override for arithmetic:
         * spending what the community does not have is not a house rule, and
         * the fix for a wrong count is to correct the count.
         */}
        {check.warnings.length > 0 && !refused && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overridden}
              onChange={(event) => {
                onOverride(event.target.checked);
              }}
              className={FOCUS_RING}
            />
            {overrideLabel}
          </label>
        )}
      </div>
    </div>
  );
}
