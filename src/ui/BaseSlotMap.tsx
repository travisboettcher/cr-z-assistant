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

import { useState } from 'react';
import { BASES, type BaseSlot } from '../data/bases';
import type { Campaign } from '../engine/campaign';
import { layoutOf, upgradesRemaining, upgradesUsed } from '../engine/base';
import { suppliedOccupants } from '../engine/utilities';
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
import { FacilityWork } from './FacilityWork';
import { cancellable, laborAvailable, queuedFor } from '../engine/projects';
import { planningHasBegun } from '../engine/planning';
import { describeProject } from './projectLabels';
import { useCampaign } from '../state/useCampaign';
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

/**
 * What this slot has on order, and the way back out of it.
 *
 * Rendered on every card whatever state the slot is in, and above the verb
 * rather than below it: a slot with a Workshop on order still offers "Build in
 * Garage", because ordering twice is legal and the base is what says otherwise
 * a turn later. The line is what stops the second order being a surprise.
 */
function QueuedProjects({
  campaign,
  slot,
}: {
  readonly campaign: Campaign;
  readonly slot: string;
}) {
  const { dispatch } = useCampaign();
  const queued = queuedFor(campaign, slot);

  if (queued.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-col gap-1">
      {queued.map(({ at, project }) => (
        // Keyed by position in the queue, because two identical orders for one
        // slot are two orders and have no identity of their own.
        <li key={at} className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-stone-600 dark:text-stone-400">
            On order: {describeProject(project)}
          </span>
          {/*
           * Offered only where it can be taken — the Planning Phase of the turn
           * that placed it, which is what the ruling means by a decision taken
           * back within the phase that made it. The reducer refuses the rest,
           * and a button that does nothing is worse than no button (#148).
           *
           * Saying what comes back, because the one thing the screen never
           * mentioned was the Hardware: an order spends it when it is placed,
           * and a player cancelling has no way to know it is not simply gone.
           */}
          {cancellable(campaign, at) ? (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'project/cancelled', at, when: new Date().toISOString() });
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-3 text-sm font-medium dark:border-stone-700`}
            >
              Cancel {describeProject(project)} — its Hardware comes back
            </button>
          ) : (
            <span className="text-xs text-stone-500 dark:text-stone-400">
              Cancelled in the Planning Phase that ordered it <PageRef pages={20} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface SlotCardProps {
  readonly campaign: Campaign;
  readonly slot: BaseSlot;
  readonly occupant?: Occupant;
  /** Whether a clearing project on this slot has been paid for. */
  readonly cleared: boolean;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onCommitted: () => void;
}

function SlotCard({
  campaign,
  slot,
  occupant,
  cleared,
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

      <QueuedProjects campaign={campaign} slot={slot.id} />

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
              <UpgradeFacility campaign={campaign} slot={slot.id} onUpgraded={onCommitted} />
              {/*
               * Both verbs an occupied slot has, in one expanded region. They
               * sit together rather than behind separate toggles because a
               * player deciding what to do with a facility is choosing between
               * them, not navigating to one.
               */}
              <AssignUtilities campaign={campaign} slot={slot.id} />
              <FacilityWork campaign={campaign} occupant={occupant} />
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
          {open && <BuildFacility campaign={campaign} slot={slot.id} onBuilt={onCommitted} />}
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
          {open && <ClearSlot campaign={campaign} slot={slot.id} onCleared={onCommitted} />}
        </>
      )}
    </li>
  );
}

export function BaseSlotMap({ campaign }: BaseSlotMapProps) {
  /**
   * Which card is expanded, and nothing else. **UI state, never campaign
   * state**: where you happen to be looking is not a fact about the campaign.
   *
   * The two numbers that used to live here — Labor available and the Utilities
   * Score — were campaign facts being typed in because nothing recorded who was
   * doing what. Z3-5 made them derivable, so they are read rather than kept.
   *
   * One card at a time, so a nine-slot base does not double in height the
   * moment two are open — and matching how `App` holds `openSheetId`.
   */
  const [openSlot, setOpenSlot] = useState<string | null>(null);

  const base = campaign.base;
  if (base === null) return null;

  const rules = BASES[base.id];
  const found = suppliedOccupants(campaign);
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
       * one — and a control per card would say the opposite.
       *
       * The Utilities Score used to sit beside it as a second input. It is
       * derived now too, from whoever is staffing a Utility Station, and it is
       * read off the base sheet below rather than set here: the sheet is where
       * totals live.
       */}
      <div className="mt-4 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <p className="text-sm">
          <span className="font-medium">Labor available: </span>
          <span className="tabular-nums">{laborAvailable(campaign)}</span>
        </p>
        {/*
         * Two sentences for one number, because a zero has two reasons and a
         * player cannot act on the wrong one. A pool spent down is a turn's
         * decisions; a pool that is not this turn's yet is a step they have
         * not walked to — and last turn's team is still on the roster screen
         * while it says so, which is exactly when "0" reads as a bug.
         *
         * Read here, assigned in the Planning Phase. Z3-5 put the team's own
         * control here because nothing else could make the number move yet;
         * Z3-6 gave it the step the book puts it in, and two controls for one
         * decision on one page is worse than a walk to the right one.
         */}
        {planningHasBegun(campaign) ? (
          <>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              The summed Tier levels of the project team, less what this turn has already ordered.
              Whatever is left at the end of the turn is lost <PageRef pages={20} />
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Who is on it is Planning Step 2, above.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            None until this turn&rsquo;s Planning Phase assigns a project team. Last turn&rsquo;s
            was spent on last turn&rsquo;s work <PageRef pages={20} />
          </p>
        )}
      </div>

      {/*
       * Above the map: these are facts about the whole base, where the cards
       * below answer for one slot each. See `docs/base-slot-interaction.md`.
       */}
      <div className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
        <BaseSheet campaign={campaign} />
      </div>

      {/*
       * Named, because it is no longer the only list in this region: the
       * project team above is one too, and a test — or a screen reader — asking
       * for "the slots" should get the slots.
       */}
      <ul aria-label="Facility Slots" className="mt-5 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          const occupant = found.find((candidate) => candidate.slotId === slot.id);
          const shared = {
            campaign,
            slot,
            cleared: base.slots[slot.id]?.cleared === true,
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

      {/*
       * Left over from Phase 2 until Z3-8 noticed it. Staffing *was* a preview
       * that was never saved; Z3-5 made it a real assignment and this sentence
       * went on saying the opposite — the one kind of stale copy worth
       * treating as a bug, because a player who believes it will do the work
       * twice.
       */}
      <p className="mt-5 text-sm text-stone-600 dark:text-stone-400">
        Staffing a facility is Planning Step 1, and is the same assignment whether it is made here
        or on the turn walk above <PageRef pages={20} />
      </p>
    </section>
  );
}
