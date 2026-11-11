/**
 * The build form — the first verb on a slot card.
 *
 * The picker and the dispatch; `SlotAction` renders the rest of the four parts.
 * It holds no rule: the facility list, the cost, and everything wrong with the
 * build come from `src/engine/build.ts`.
 */

import { useId, useState } from 'react';
import type { FacilityId } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { buildableFacilities, checkBuild } from '../engine/build';
import { projectCost } from '../engine/projects';
import { freeRebuild } from '../engine/rebuild';
import { useCampaign } from '../state/useCampaign';
import { FACILITY_LABELS } from '../labels/baseLabels';
import { SlotAction } from './SlotAction';
import { SetUpSlotAction } from './SetUpSlotAction';
import { settingUp } from '../engine/continued';
import { checkFacilityPlaced, checkOrderCarried } from '../engine/settingUp';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface BuildFacilityProps {
  readonly campaign: Campaign;
  readonly slot: string;
  /** Labor available this turn, entered above the map and passed down. */
  readonly onBuilt: () => void;
}

export function BuildFacility({ campaign, slot, onBuilt }: BuildFacilityProps) {
  const { dispatch } = useCampaign();
  const chooserId = useId();

  const offered = buildableFacilities(campaign);
  const [choice, setChoice] = useState<FacilityId>(offered[0]?.id ?? 'bunk-room');

  const order = { kind: 'facility', slot, facility: choice } as const;
  const check = checkBuild(campaign, { slot, facility: choice });

  /**
   * Tied to the facility it was granted for, so an override cannot be carried
   * over to a different build. It is never stored — Z1-7's rule, and the reason
   * a base keeps reporting a violation for as long as it stands.
   */
  const [overriddenFor, setOverriddenFor] = useState<FacilityId | null>(null);

  const picker = (
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
  );

  // While a campaign picked up partway is set up, what is built is entered as
  // it stands (#210).
  if (settingUp(campaign)) {
    return (
      <SetUpSlotAction
        placeCheck={checkFacilityPlaced(campaign, slot, choice)}
        carryCheck={checkOrderCarried(campaign, order)}
        placeLabel="Already built"
        onPlace={() => {
          dispatch({ type: 'setup/facilityPlaced', slot, facility: choice });
          onBuilt();
        }}
        onCarry={() => {
          dispatch({ type: 'setup/orderCarried', project: order });
          onBuilt();
        }}
      >
        {picker}
      </SetUpSlotAction>
    );
  }

  return (
    <SlotAction
      campaign={campaign}
      cost={projectCost(campaign, order)}
      freeRebuild={freeRebuild(campaign, order)}
      check={check}
      overridden={overriddenFor === choice}
      onOverride={(overridden) => {
        setOverriddenFor(overridden ? choice : null);
      }}
      label="Order the build"
      overrideLabel="Order it anyway"
      onCommit={() => {
        dispatch({
          type: 'project/ordered',
          project: { kind: 'facility', slot, facility: choice },
          at: new Date().toISOString(),
        });
        onBuilt();
      }}
    >
      {picker}
    </SlotAction>
  );
}
