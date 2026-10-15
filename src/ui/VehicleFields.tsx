/**
 * What a table says about a vehicle as it joins (pp. 52–53; R62; Z5-11): its
 * Tier, a name to know it by, whether it is a boat, and for a Tier 4 how its
 * 20 slots split. Shared by the Retrieve New Vehicles outcome and the
 * Inventory's add-by-hand form, so the two ask the same questions.
 *
 * Controlled: the form that holds it owns the draft and says which Tiers are
 * on offer, which for a retrieved vehicle is no higher than its d10 rolled.
 */

import { useId } from 'react';
import { VEHICLE_TIERS, type VehicleTier } from '../data/equipment';
import { atTier, EVEN_SPLIT, TIER_FOUR_SLOTS, type NewVehicle } from '../engine/vehicles';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const SELECT = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`;
const INPUT = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`;

/** A vehicle as the fields hold it, before it has an id. */
export type VehicleDraft = Omit<NewVehicle, 'id'>;

export function VehicleFields({
  name,
  draft,
  onChange,
  highest = 4,
}: {
  /** What the fields are for, as each field's label begins: "Vehicle 1". */
  readonly name: string;
  readonly draft: VehicleDraft;
  readonly onChange: (draft: VehicleDraft) => void;
  readonly highest?: VehicleTier;
}) {
  const tierId = useId();
  const labelId = useId();
  const splitId = useId();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={tierId} className="text-sm">
          {name}: Tier
        </label>
        <select
          id={tierId}
          className={SELECT}
          value={draft.tier}
          onChange={(changed) => {
            onChange(atTier(draft, Number(changed.target.value) as VehicleTier));
          }}
        >
          {VEHICLE_TIERS.filter((tier) => tier <= highest).map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={labelId} className="text-sm">
          {name}: name
        </label>
        <input
          id={labelId}
          className={INPUT}
          value={draft.label}
          onChange={(changed) => {
            onChange({ ...draft, label: changed.target.value });
          }}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={FOCUS_RING}
          checked={draft.water}
          onChange={(changed) => {
            onChange({ ...draft, water: changed.target.checked });
          }}
        />
        {name} is a boat
      </label>

      {draft.tier === 4 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={splitId} className="text-sm">
            {name}: Inventory Slots of {TIER_FOUR_SLOTS}
          </label>
          <select
            id={splitId}
            className={SELECT}
            value={draft.inventorySlots ?? EVEN_SPLIT}
            onChange={(changed) => {
              onChange({ ...draft, inventorySlots: Number(changed.target.value) });
            }}
          >
            {Array.from({ length: TIER_FOUR_SLOTS + 1 }, (_, slots) => (
              <option key={slots} value={slots}>
                {slots}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
