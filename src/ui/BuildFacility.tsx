/**
 * The build form — the first verb on a slot card.
 *
 * Laid out in the four parts every verb on this card uses, in order: what you
 * are choosing, what it costs, what is wrong with it, then the button and its
 * override. Z2-6, Z2-7 and Z2-8 fill in the same four for their own verbs. See
 * `docs/base-slot-interaction.md`.
 *
 * It holds no rule. The facility list, the cost, and everything wrong with the
 * build come from `src/engine/build.ts`; this decides where they sit.
 */

import { useId, useState } from 'react';
import type { FacilityId } from '../data/facilities';
import { FACILITIES } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { buildableFacilities, checkBuild } from '../engine/build';
import { useCampaign } from '../state/useCampaign';
import { FACILITY_LABELS } from './baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface BuildFacilityProps {
  readonly campaign: Campaign;
  readonly slot: string;
  /** Labor available this turn, entered above the map and passed down. */
  readonly labor: number;
  readonly onBuilt: () => void;
}

export function BuildFacility({ campaign, slot, labor, onBuilt }: BuildFacilityProps) {
  const { dispatch } = useCampaign();
  const chooserId = useId();

  const offered = buildableFacilities(campaign);
  const [choice, setChoice] = useState<FacilityId>(offered[0]?.id ?? 'bunk-room');

  const facility = FACILITIES[choice];
  const { blockers, warnings } = checkBuild(campaign, { slot, facility: choice, labor });

  /**
   * Reset whenever the chosen facility changes, so an override granted for one
   * build cannot be spent on another. It is never stored — Z1-7's rule, and the
   * reason a base keeps reporting a violation for as long as it stands.
   */
  const [overridden, setOverridden] = useState(false);
  const [overriddenFor, setOverriddenFor] = useState<FacilityId>(choice);
  const override = overridden && overriddenFor === choice;

  const refused = blockers.length > 0;
  const held = warnings.length > 0 && !override;

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      <div className="flex flex-col gap-2">
        <label htmlFor={chooserId} className="text-sm font-medium">
          Facility
        </label>
        <select
          id={chooserId}
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value as FacilityId);
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`}
        >
          {offered.map((option) => (
            <option key={option.id} value={option.id}>
              {FACILITY_LABELS[option.id]}
            </option>
          ))}
        </select>
      </div>

      {/* Before the button, not after it. */}
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        {facility.cost.hardware} Hardware · {facility.cost.labor} Labor <PageRef pages="72–73" />
      </p>

      {[...blockers, ...warnings].length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {[...blockers, ...warnings].map((violation) => (
            <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={refused || held}
          onClick={() => {
            dispatch({ type: 'facility/built', slot, facility: choice, labor });
            onBuilt();
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
        >
          Build here
        </button>

        {/*
         * Offered only for a rule the player may break, and only when nothing
         * else refuses the build. There is no override for arithmetic: spending
         * Hardware the community does not have is not a house rule, and the fix
         * for a wrong count is to correct the count.
         */}
        {warnings.length > 0 && !refused && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(event) => {
                setOverridden(event.target.checked);
                setOverriddenFor(choice);
              }}
              className={FOCUS_RING}
            />
            Build it anyway
          </label>
        )}
      </div>
    </div>
  );
}
