/**
 * The upgrade form — the second verb, in the same four parts as the first.
 *
 * Every upgrade the facility offers is listed, including ones already
 * installed: repeats are legal and count separately against the cap of three,
 * so hiding the second Extra Bed would hide a legal build.
 */

import { useId, useState } from 'react';
import type { UpgradeId } from '../data/facilities';
import type { Campaign } from '../engine/campaign';
import { checkUpgrade, upgradesFor } from '../engine/upgrade';
import { useCampaign } from '../state/useCampaign';
import { UPGRADE_LABELS } from './baseLabels';
import { SlotAction } from './SlotAction';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface UpgradeFacilityProps {
  readonly campaign: Campaign;
  readonly slot: string;
  readonly onUpgraded: () => void;
}

export function UpgradeFacility({ campaign, slot, onUpgraded }: UpgradeFacilityProps) {
  const { dispatch } = useCampaign();
  const chooserId = useId();

  const offered = upgradesFor(campaign, slot);
  const [choice, setChoice] = useState<UpgradeId | null>(null);
  const chosen = choice ?? offered[0]?.id;

  const [overriddenFor, setOverriddenFor] = useState<UpgradeId | null>(null);

  // A facility with no upgrades at all — none in the catalogue today, but the
  // shape allows it and rendering a picker with nothing in it would be worse
  // than saying so.
  if (chosen === undefined) {
    return (
      <p className="mt-3 border-t border-stone-200 pt-3 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
        This facility has no upgrades.
      </p>
    );
  }

  const upgrade = offered.find((candidate) => candidate.id === chosen);
  const check = checkUpgrade(campaign, { slot, upgrade: chosen });

  return (
    <SlotAction
      cost={upgrade?.cost ?? { hardware: 0, labor: 0 }}
      check={check}
      overridden={overriddenFor === chosen}
      onOverride={(overridden) => {
        setOverriddenFor(overridden ? chosen : null);
      }}
      label="Add upgrade"
      overrideLabel="Add it anyway"
      onCommit={() => {
        dispatch({
          type: 'upgrade/built',
          slot,
          upgrade: chosen,
          at: new Date().toISOString(),
        });
        onUpgraded();
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={chooserId} className="text-sm font-medium">
          Upgrade
        </label>
        <select
          id={chooserId}
          value={chosen}
          onChange={(event) => {
            setChoice(event.target.value as UpgradeId);
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`}
        >
          {offered.map((option) => (
            <option key={option.id} value={option.id}>
              {UPGRADE_LABELS[option.id]}
            </option>
          ))}
        </select>
      </div>
    </SlotAction>
  );
}
