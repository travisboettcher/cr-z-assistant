/**
 * The slot map — what the base worksheet mostly is.
 *
 * One card per Facility Slot, in the order the base's own layout lists them:
 * what kind of slot it is, what stands in it, and what it would take to use it.
 * Nothing here is stored — the layout comes from `src/data/bases.ts` and the
 * player's changes from the campaign, and `occupants` resolves the two.
 *
 * **Not the base sheet.** Beds, storage caps, production and the Siege Threat
 * contribution are Z2-9, which is where they can be shown next to the roster
 * and the materials they qualify. This is the picture of the building.
 */

import { useId, useState } from 'react';
import { BASES, type BaseSlot } from '../data/bases';
import type { Campaign } from '../engine/campaign';
import { layoutOf, occupants, upgradesRemaining, upgradesUsed } from '../engine/base';
import type { Occupant } from '../engine/base';
import { MATERIALS } from '../data/materials';
import {
  BASE_LABELS,
  FACILITY_LABELS,
  SLOT_KIND_LABELS,
  UPGRADE_LABELS,
  UTILITY_LABELS,
  slotLabel,
} from './baseLabels';
import { AssignUtilities } from './AssignUtilities';
import { BaseSheet } from './BaseSheet';
import { ProductionPreview } from './ProductionPreview';
import { BuildFacility } from './BuildFacility';
import { ClearSlot } from './ClearSlot';
import { UpgradeFacility } from './UpgradeFacility';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface BaseSlotMapProps {
  readonly campaign: Campaign;
}

/** What a clearing project gives back, as a phrase rather than a table. */
function clearingReward(slot: Extract<BaseSlot, { state: 'clearing-project' }>): string | null {
  const materials = MATERIALS.filter(
    (material) => (slot.yields?.materials?.[material] ?? 0) > 0,
  ).map((material) => `${String(slot.yields?.materials?.[material])} ${material}`);

  const equipment = slot.yields?.equipment;
  if (equipment !== undefined) {
    // Said here rather than promised and quietly dropped: Phase 5 owns the item
    // catalogue, so there is no Inventory to put four standard weapons into.
    materials.push(
      `${String(equipment.count)} standard ${equipment.category}s this version cannot track`,
    );
  }

  return materials.length === 0 ? null : materials.join(', ');
}

/** The upgrade line under a facility, or null where there is nothing to say. */
function upgradeSummary(occupant: Occupant): string | null {
  const names = occupant.upgrades.map((upgrade) => UPGRADE_LABELS[upgrade.id]);
  const remaining = upgradesRemaining(occupant);

  if (names.length === 0) {
    return remaining === 0 ? 'Takes no upgrades' : `Room for ${String(remaining)} upgrades`;
  }

  const used = upgradesUsed(occupant);
  const room = remaining === 0 ? 'no room for more' : `room for ${String(remaining)} more`;

  return `${names.join(', ')} — ${String(used)} of 3, ${room}`;
}

interface SlotCardProps {
  readonly campaign: Campaign;
  readonly slot: BaseSlot;
  readonly occupant?: Occupant;
  /** Whether a clearing project on this slot has been paid for. */
  readonly cleared: boolean;
  readonly labor: number;
  /** The staffed Utilities Score, entered above the map. */
  readonly staffed: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onCommitted: () => void;
}

function SlotCard({
  campaign,
  slot,
  occupant,
  cleared,
  labor,
  staffed,
  open,
  onToggle,
  onCommitted,
}: SlotCardProps) {
  /**
   * A cleared slot is an ordinary empty slot of its kind. Clearing changes what
   * the slot is *available* for and never what kind it is — an Outdoor slot
   * full of rubble is an Outdoor slot afterwards.
   */
  const buildable = occupant === undefined && (slot.state === 'empty' || cleared);
  const utilities =
    occupant === undefined
      ? []
      : ([occupant.power && 'power', occupant.water && 'water'] as const).filter(
          (utility): utility is 'power' | 'water' => utility !== false,
        );

  return (
    <li className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="font-medium">{slotLabel(slot.id)}</h4>
        <span className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
          {SLOT_KIND_LABELS[slot.kind]}
        </span>
      </div>

      {occupant !== undefined && (
        <>
          <p className="mt-2">{FACILITY_LABELS[occupant.facility.id]}</p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {upgradeSummary(occupant)}
          </p>
          {utilities.length > 0 && (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              {/*
               * "Supplied with" rather than "assigned", because the sheet above
               * says "Power assigned" about the whole base and these are
               * different facts — one slot's supply against the base's total.
               */}
              Supplied with {utilities.map((utility) => UTILITY_LABELS[utility]).join(' and ')}
            </p>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`${TOUCH_TARGET} ${FOCUS_RING} mt-2 rounded-lg border border-stone-300 px-3 text-sm font-medium dark:border-stone-700`}
          >
            {open ? 'Cancel' : `Upgrade ${slotLabel(slot.id)}`}
          </button>
          {open && (
            <>
              <UpgradeFacility
                campaign={campaign}
                slot={slot.id}
                labor={labor}
                onUpgraded={onCommitted}
              />
              {/*
               * Both verbs an occupied slot has, in one expanded region. They
               * sit together rather than behind separate toggles because a
               * player deciding what to do with a facility is choosing between
               * them, not navigating to one.
               */}
              <AssignUtilities campaign={campaign} slot={slot.id} staffed={staffed} />
              <ProductionPreview campaign={campaign} occupant={occupant} />
            </>
          )}
        </>
      )}

      {buildable && (
        <>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            {cleared ? 'Cleared — ready to build in' : 'Empty — ready to build in'}
          </p>
          {/*
           * The card's one action. A slot is in exactly one state and each
           * state has at most two verbs, which is what keeps this a card rather
           * than a control panel — see `docs/base-slot-interaction.md`.
           */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`${TOUCH_TARGET} ${FOCUS_RING} mt-2 rounded-lg border border-stone-300 px-3 text-sm font-medium dark:border-stone-700`}
          >
            {open ? 'Cancel' : `Build in ${slotLabel(slot.id)}`}
          </button>
          {open && (
            <BuildFacility campaign={campaign} slot={slot.id} labor={labor} onBuilt={onCommitted} />
          )}
        </>
      )}

      {occupant === undefined && slot.state === 'clearing-project' && !cleared && (
        <>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Blocked — {slot.labor} Labor to clear
            {clearingReward(slot) !== null && `, and yields ${String(clearingReward(slot))}`}
          </p>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`${TOUCH_TARGET} ${FOCUS_RING} mt-2 rounded-lg border border-stone-300 px-3 text-sm font-medium dark:border-stone-700`}
          >
            {open ? 'Cancel' : `Clear ${slotLabel(slot.id)}`}
          </button>
          {open && (
            <ClearSlot campaign={campaign} slot={slot.id} labor={labor} onCleared={onCommitted} />
          )}
        </>
      )}
    </li>
  );
}

export function BaseSlotMap({ campaign }: BaseSlotMapProps) {
  const laborId = useId();
  const staffedId = useId();

  /**
   * Which card is expanded, and how much Labor is to hand. Both are **UI state
   * and never campaign state**: one is where you happen to be looking, and the
   * other belongs to the Planning Phase's project team, which is Phase 3.
   *
   * One card at a time, so a nine-slot base does not double in height the
   * moment two are open — and matching how `App` holds `openSheetId`.
   */
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [labor, setLabor] = useState(0);
  const [staffed, setStaffed] = useState(0);

  const base = campaign.base;
  if (base === null) return null;

  const rules = BASES[base.id];
  const found = occupants(base);
  const slots = layoutOf(base);
  const empty = slots.filter((slot) => slot.state === 'empty').length;

  return (
    <section
      id="base"
      aria-labelledby="base-slot-map-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="base-slot-map-heading" className="text-xl font-semibold">
          {BASE_LABELS[base.id]}
        </h2>
        <p className="text-stone-600 dark:text-stone-400">
          {/* Base Tiers are numbered and unnamed — `tierLabels.ts` names the
           *survivor* Tiers, and a Tier 1 base is not a Rookie. */}
          Tier {rules.tier} base · {slots.length} slots, {empty} empty <PageRef pages={54} />
        </p>
      </div>

      {/*
       * Above the map, not per card. Labor is a pool spent across every project
       * in a turn — clearing one slot and building in another draw on the same
       * one — and a field per card would say the opposite.
       */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor={laborId} className="text-sm font-medium">
          Labor available
        </label>
        <input
          id={laborId}
          type="number"
          min={0}
          value={labor}
          onChange={(event) => {
            setLabor(Math.max(0, Number(event.target.value)));
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} w-24 rounded-lg border border-stone-300 bg-white px-3 tabular-nums dark:border-stone-700 dark:bg-stone-950`}
        />
        <span className="text-sm text-stone-600 dark:text-stone-400">
          From the project team, which the Planning Phase assigns <PageRef pages={20} />
        </span>
      </div>

      {/*
       * The other half of the utility pools, and the other thing the Planning
       * Phase will supply. A staffed Utility Station produces its staff's
       * Utilities Score split across Power and Water however the player likes,
       * so one number covers both. What it buys is read off the base sheet
       * below rather than repeated here — the sheet is where totals live.
       */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor={staffedId} className="text-sm font-medium">
          Utilities Score
        </label>
        <input
          id={staffedId}
          type="number"
          min={0}
          value={staffed}
          onChange={(event) => {
            setStaffed(Math.max(0, Number(event.target.value)));
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} w-24 rounded-lg border border-stone-300 bg-white px-3 tabular-nums dark:border-stone-700 dark:bg-stone-950`}
        />
      </div>

      {/*
       * Above the map: these are facts about the whole base, where the cards
       * below answer for one slot each. See `docs/base-slot-interaction.md`.
       */}
      <div className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
        <BaseSheet campaign={campaign} staffed={staffed} />
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const occupant = found.find((candidate) => candidate.slotId === slot.id);
          const shared = {
            campaign,
            slot,
            cleared: base.slots[slot.id]?.cleared === true,
            labor,
            staffed,
            open: openSlot === slot.id,
            onToggle: () => {
              setOpenSlot(openSlot === slot.id ? null : slot.id);
            },
            onCommitted: () => {
              setOpenSlot(null);
            },
          };

          // Two call sites rather than one optional prop, for the reason
          // `App.tsx` gives: under `exactOptionalPropertyTypes` a possibly
          // undefined prop is not the same as an omitted one.
          return occupant === undefined ? (
            <SlotCard key={slot.id} {...shared} />
          ) : (
            <SlotCard key={slot.id} {...shared} occupant={occupant} />
          );
        })}
      </ul>

      <p className="mt-5 text-sm text-stone-600 dark:text-stone-400">
        Staffing a facility is a Planning Phase assignment, so the production above is a preview and
        is never saved <PageRef pages={20} />
      </p>
    </section>
  );
}
