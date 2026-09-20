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
import { checkUpgrade, upgradeOrder, upgradesFor } from '../engine/upgrade';
import { useCampaign } from '../state/useCampaign';
import { UPGRADE_LABELS } from './baseLabels';
import { PageRef } from './PageRef';
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

  const check = checkUpgrade(campaign, { slot, upgrade: chosen });

  // Priced against the slot rather than off the catalogue: a Greenhouse
  // ordered onto a Fence costs a Hardware less than one ordered onto a bare
  // Garden (pp. 72–73), and the number here is the number the order will spend.
  const { cost, replaces } = upgradeOrder(campaign, { slot, upgrade: chosen });

  return (
    <SlotAction
      campaign={campaign}
      cost={cost}
      check={check}
      overridden={overriddenFor === chosen}
      onOverride={(overridden) => {
        setOverriddenFor(overridden ? chosen : null);
      }}
      label="Order the upgrade"
      overrideLabel="Order it anyway"
      onCommit={() => {
        dispatch({
          type: 'project/ordered',
          project: { kind: 'upgrade', slot, upgrade: chosen },
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

        {/*
         * Said before the order, not discovered after it. This is the only
         * thing in the app that takes something off the base as a side effect
         * of putting something on it, and a Fence that vanished a turn later
         * without warning would be the app doing what it never said.
         */}
        {replaces.length > 0 && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Replaces the {replaces.map((installed) => UPGRADE_LABELS[installed]).join(', the ')},
            which comes off when the work is done <PageRef pages="72–73" />
          </p>
        )}
      </div>
    </SlotAction>
  );
}
