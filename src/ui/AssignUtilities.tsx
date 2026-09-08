/**
 * The two utility toggles — the fourth verb, and the only one that appears
 * twice on the same card.
 *
 * Power and Water have identical mechanics and separate accounting, so they are
 * one component rendered twice rather than two components that would drift.
 *
 * **This verb does not use `SlotAction`**, and that is the sketch working
 * rather than failing. The other three commit something that costs Hardware or
 * Labor, so they need a cost line, a violation list and a commit button. A
 * utility costs nothing, is free to take back, and is a state rather than a
 * purchase — a checkbox with its reason beside it says that, where a button
 * labelled "Assign" beside a cost of "0 Hardware · 0 Labor" would say the
 * opposite.
 */

import { UTILITIES, type Utility } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { checkUtility } from '../engine/utilities';
import { useCampaign } from '../state/useCampaign';
import { UTILITY_LABELS } from './baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING } from './styles';

export interface AssignUtilitiesProps {
  readonly campaign: Campaign;
  readonly slot: string;
  /** The staffed Utilities Score, entered above the map and passed down. */
  readonly staffed: number;
}

function UtilityToggle({
  campaign,
  slot,
  utility,
  staffed,
}: AssignUtilitiesProps & { readonly utility: Utility }) {
  const { dispatch } = useCampaign();

  const on = campaign.base?.slots[slot]?.[utility] === true;
  const check = checkUtility(campaign, { slot, utility, staffed });

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
          type="checkbox"
          checked={on}
          disabled={refused}
          onChange={() => {
            dispatch({ type: 'utility/toggled', slot, utility, staffed });
          }}
          className={FOCUS_RING}
        />
        {UTILITY_LABELS[utility]}
      </label>
      {!on && reason !== undefined && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          {reason.message} <PageRef pages={reason.pages} />
        </p>
      )}
    </div>
  );
}

export function AssignUtilities({ campaign, slot, staffed }: AssignUtilitiesProps) {
  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      <p className="text-sm font-medium">Utilities</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        One point covers this facility and every upgrade on it <PageRef pages="20, 67" />
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {UTILITIES.map((utility) => (
          <UtilityToggle
            key={utility}
            campaign={campaign}
            slot={slot}
            utility={utility}
            staffed={staffed}
          />
        ))}
      </div>
    </div>
  );
}
