/**
 * Power and Water for the whole base, in one place (#258).
 *
 * Power and Water have identical mechanics and separate accounting, so they are
 * one toggle rendered twice rather than two components that would drift.
 *
 * **One editor, above the slot map.** The toggles lived inside each slot's
 * card, beside its upgrades, so seeing which facilities had Power meant opening
 * them one after another. The pools are the base's, as Labor is, and what they
 * are spent on reads best as one list. The panel says which facilities have
 * each; its one button opens the list of every facility with both toggles. A
 * slot card keeps a line saying what that facility is supplied with and a
 * button that opens this panel at its row, so there is one place that edits.
 *
 * **This verb does not use `SlotAction`**, and that is the sketch working
 * rather than failing. The other three commit something that costs Hardware or
 * Labor, so they need a cost line, a violation list and a commit button. A
 * utility costs nothing, is free to take back, and is a state rather than a
 * purchase — a checkbox with its reason beside it says that, where a button
 * labelled "Assign" beside a cost of "0 Hardware · 0 Labor" would say the
 * opposite.
 */

import { useEffect } from 'react';
import { UTILITIES, type Utility } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { checkUtility, suppliedOccupants } from '../engine/utilities';
import { useCampaign } from '../state/useCampaign';
import { FACILITY_LABELS, UTILITY_LABELS, slotLabel } from '../labels/baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

/** The id of a slot's first toggle, which a card's button moves focus to. */
function utilityToggleId(slot: string): string {
  return `utility-${slot}-${UTILITIES[0]}`;
}

function UtilityToggle({
  campaign,
  slot,
  utility,
}: {
  readonly campaign: Campaign;
  readonly slot: string;
  readonly utility: Utility;
}) {
  const { dispatch } = useCampaign();

  const on = campaign.base?.slots[slot]?.[utility] === true;
  const check = checkUtility(campaign, { slot, utility });

  /**
   * Only a **blocker** disables the box, and only when turning one on: giving a
   * point back always works.
   *
   * A warning here is advice rather than something to override, which is the
   * one place this verb departs from the other three — and it departs because
   * the action does. Building and upgrading spend materials and cannot be
   * undone, so an explicit override is worth the ceremony; a utility costs
   * nothing and unticks again, so the checkbox is its own confirmation. Making
   * "nothing here uses it" disable the box would turn a note into a refusal.
   */
  const refused = !on && check.blockers.length > 0;
  const reason = [...check.blockers, ...check.warnings][0];

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          id={`utility-${slot}-${utility}`}
          type="checkbox"
          checked={on}
          disabled={refused}
          onChange={() => {
            dispatch({ type: 'utility/toggled', slot, utility });
          }}
          className={`${FOCUS_RING} ${TOUCH_TARGET}`}
        />
        {UTILITY_LABELS[utility]}
        {/* The slot, for a list of rows that each have a Power and a Water. */}
        {/* Outside the span: an accessible name drops a span's leading space. */}{' '}
        <span className="sr-only">in {slotLabel(slot)}</span>
      </label>
      {!on && reason !== undefined && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {reason.message} <PageRef pages={reason.pages} />
        </p>
      )}
    </div>
  );
}

export interface UtilitiesPanelProps {
  readonly campaign: Campaign;
  /** Whether the list of toggles is showing: UI state, held by the slot map. */
  readonly open: boolean;
  readonly onToggle: () => void;
  /** A slot whose card asked for this panel, whose first toggle takes focus once. */
  readonly focusSlot: string | null;
  readonly onFocused: () => void;
}

export function UtilitiesPanel({
  campaign,
  open,
  onToggle,
  focusSlot,
  onFocused,
}: UtilitiesPanelProps) {
  const occupants = suppliedOccupants(campaign);

  // A card's button opens the panel at its row: focus moves there once the row
  // is drawn, so a keyboard or a screen reader lands where the press pointed.
  useEffect(() => {
    if (!open || focusSlot === null) return;

    const toggle = document.getElementById(utilityToggleId(focusSlot));
    toggle?.focus();
    toggle?.scrollIntoView?.({ block: 'center' });
    onFocused();
  }, [open, focusSlot, onFocused]);

  return (
    <section
      aria-label="Power and Water"
      className="mt-4 rounded-lg border border-stone-200 p-4 dark:border-stone-800"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-sm font-medium">
          Power and Water <PageRef pages="20, 67" />
        </h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-3 text-sm font-medium dark:border-stone-700`}
        >
          {open ? 'Close Power and Water' : 'Assign Power and Water'}
        </button>
      </div>

      {UTILITIES.map((utility) => {
        const supplied = occupants.filter((occupant) => occupant[utility]);

        return (
          <p key={utility} className={`mt-1 ${HINT}`}>
            <span className="font-medium">{UTILITY_LABELS[utility]}:</span>{' '}
            {supplied.length === 0
              ? 'nothing'
              : supplied.map((occupant) => FACILITY_LABELS[occupant.facility.id]).join(', ')}
          </p>
        );
      })}

      {open && (
        <>
          <p className={`mt-3 ${HINT}`}>
            One point covers a facility and every upgrade on it. The pools are on the base sheet
            above.
          </p>
          {occupants.length === 0 ? (
            <p className={`mt-2 ${HINT}`}>Nothing is built yet.</p>
          ) : (
            <ul aria-label="Facilities" className="mt-2 flex flex-col gap-3">
              {occupants.map((occupant) => (
                <li key={occupant.slotId}>
                  <fieldset className="flex flex-col gap-1">
                    <legend className="text-sm font-medium">
                      {FACILITY_LABELS[occupant.facility.id]}{' '}
                      <span className="font-normal text-stone-600 dark:text-stone-400">
                        · {slotLabel(occupant.slotId)}
                      </span>
                    </legend>
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {UTILITIES.map((utility) => (
                        <UtilityToggle
                          key={utility}
                          campaign={campaign}
                          slot={occupant.slotId}
                          utility={utility}
                        />
                      ))}
                    </div>
                  </fieldset>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
