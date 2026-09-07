/**
 * The build form — the first verb on a slot card.
 *
 * The picker and the dispatch; `SlotAction` renders the rest of the four parts.
 * It holds no rule: the facility list, the cost, and everything wrong with the
 * build come from `src/engine/build.ts`.
 */

import { useId, useState } from 'react';
import { FACILITIES, type FacilityId } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { buildableFacilities, checkBuild } from '../engine/build';
import { useCampaign } from '../state/useCampaign';
import { FACILITY_LABELS } from './baseLabels';
import { SlotAction } from './SlotAction';
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
  const check = checkBuild(campaign, { slot, facility: choice, labor });

  /**
   * Tied to the facility it was granted for, so an override cannot be carried
   * over to a different build. It is never stored — Z1-7's rule, and the reason
   * a base keeps reporting a violation for as long as it stands.
   */
  const [overriddenFor, setOverriddenFor] = useState<FacilityId | null>(null);

  return (
    <SlotAction
      cost={facility.cost}
      check={check}
      overridden={overriddenFor === choice}
      onOverride={(overridden) => {
        setOverriddenFor(overridden ? choice : null);
      }}
      label="Build here"
      overrideLabel="Build it anyway"
      onCommit={() => {
        dispatch({ type: 'facility/built', slot, facility: choice, labor });
        onBuilt();
      }}
    >
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
    </SlotAction>
  );
}
