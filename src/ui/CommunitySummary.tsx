/**
 * The community at a glance, beside the turn: who is in it, where they live,
 * what is in storage, and what it owns. Each card opens the modal that edits
 * it.
 *
 * A summary, never a second editor (see `docs/ux-principles.md`). Every number
 * here is read from the engine or straight off the campaign, the same answer
 * the modal it opens gives; a card that worked something out for itself would
 * be a second answer waiting to disagree with the first.
 *
 * A card with nothing in it is the one that needs doing, so it says so: an
 * empty roster or an unclaimed base is drawn as a call to act rather than as a
 * zero.
 */

import { EQUIPMENT } from '../data/equipment';
import { MATERIALS } from '../data/materials';
import { BASES } from '../data/bases';
import type { Campaign } from '../engine/campaign';
import { firstBaseOwed, layoutOf } from '../engine/base';
import { communityTierLevels, maxHp } from '../engine/survivor';
import { emptySlotCount } from '../engine/utilities';
import { BASE_LABELS, MATERIAL_LABELS } from './baseLabels';
import { ITEM_KIND_LABELS } from './equipmentLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

/** What a card opens. */
export type CommunityPanel = 'survivors' | 'base' | 'materials' | 'inventory';

export interface CommunitySummaryProps {
  readonly campaign: Campaign;
  readonly onOpen: (panel: CommunityPanel) => void;
}

/** How many survivors the card names before it counts the rest. */
const NAMED = 6;

const CARD = 'rounded-xl border bg-white p-4 dark:bg-stone-900';
const QUIET = 'border-stone-200 dark:border-stone-800';
const NEEDED = 'border-2 border-dashed border-amber-500 dark:border-amber-400';

const OPEN = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-3 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;
const PRIMARY = `${TOUCH_TARGET} ${FOCUS_RING} w-full rounded-lg bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

export function CommunitySummary({ campaign, onOpen }: CommunitySummaryProps) {
  return (
    <aside
      aria-label="Community summary"
      className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-1"
    >
      <Survivors campaign={campaign} onOpen={() => onOpen('survivors')} />
      <BaseCard campaign={campaign} onOpen={() => onOpen('base')} />
      <Materials campaign={campaign} onOpen={() => onOpen('materials')} />
      <InventoryCard campaign={campaign} onOpen={() => onOpen('inventory')} />
    </aside>
  );
}

function Survivors({
  campaign,
  onOpen,
}: {
  readonly campaign: Campaign;
  readonly onOpen: () => void;
}) {
  const { survivors } = campaign;
  const empty = survivors.length === 0;

  return (
    <section aria-labelledby="summary-survivors" className={`${CARD} ${empty ? NEEDED : QUIET}`}>
      <div className="flex items-center gap-2">
        <h2 id="summary-survivors" className="grow text-base font-semibold">
          Survivors
        </h2>
        {!empty && (
          <button type="button" onClick={onOpen} className={OPEN}>
            Manage
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        <span className="tabular-nums">{survivors.length}</span> survivor
        {survivors.length === 1 ? '' : 's'} ·{' '}
        <span className="tabular-nums">{communityTierLevels(survivors)}</span> tier levels
      </p>

      {empty ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">No survivors yet.</p>
          <button type="button" onClick={onOpen} className={PRIMARY}>
            Add survivors
          </button>
        </div>
      ) : (
        /*
         * Names only from a landscape tablet up. In portrait the four cards
         * sit in a row above the turn, and a list in each would push the turn
         * — the thing the screen is for — off the bottom.
         */
        <ul className="mt-2 hidden flex-col text-sm lg:flex">
          {survivors.slice(0, NAMED).map((survivor) => {
            const hurt = survivor.currentHp < maxHp(survivor);
            return (
              <li
                key={survivor.id}
                className="flex gap-2 border-b border-stone-100 py-1.5 last:border-b-0 dark:border-stone-800"
              >
                <span className="grow truncate">{survivor.name}</span>
                <span
                  className={`shrink-0 tabular-nums ${hurt ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-stone-600 dark:text-stone-400'}`}
                >
                  T{survivor.tier} · {survivor.currentHp}/{maxHp(survivor)}
                </span>
              </li>
            );
          })}
          {survivors.length > NAMED && (
            <li className="py-1.5 text-stone-600 dark:text-stone-400">
              and {survivors.length - NAMED} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function BaseCard({
  campaign,
  onOpen,
}: {
  readonly campaign: Campaign;
  readonly onOpen: () => void;
}) {
  const base = campaign.base;
  const owed = firstBaseOwed(campaign);

  return (
    <section aria-labelledby="summary-base" className={`${CARD} ${owed ? NEEDED : QUIET}`}>
      <div className="flex items-center gap-2">
        <h2 id="summary-base" className="grow text-base font-semibold">
          Base
        </h2>
        {base !== null && (
          <button type="button" onClick={onOpen} className={OPEN}>
            Open
          </button>
        )}
      </div>

      {base === null ? (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-sm text-stone-600 dark:text-stone-400">No base claimed yet.</p>
          <button type="button" onClick={onOpen} className={PRIMARY}>
            Claim a base
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm">{BASE_LABELS[base.id]}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Tier {BASES[base.id].tier} ·{' '}
            <span className="tabular-nums">{layoutOf(base).length}</span> slots,{' '}
            <span className="tabular-nums">{emptySlotCount(campaign)}</span> empty
          </p>
        </>
      )}
    </section>
  );
}

function Materials({
  campaign,
  onOpen,
}: {
  readonly campaign: Campaign;
  readonly onOpen: () => void;
}) {
  return (
    <section aria-labelledby="summary-materials" className={`${CARD} ${QUIET}`}>
      <div className="flex items-center gap-2">
        <h2 id="summary-materials" className="grow text-base font-semibold">
          Materials
        </h2>
        <button type="button" onClick={onOpen} className={OPEN}>
          Edit
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-1.5">
        {MATERIALS.map((material) => (
          <div
            key={material}
            className="rounded-lg bg-stone-100 px-1 py-1.5 text-center dark:bg-stone-800"
          >
            <dt className="truncate text-xs text-stone-600 dark:text-stone-400">
              {MATERIAL_LABELS[material]}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{campaign.materials[material]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * The base's Inventory at a glance: how many items, and of which kinds
 * (Z5-2). Empty is quiet rather than a call to act — a community needs no
 * items to play a turn, and its shoddy gear is free (pg. 37).
 */
function InventoryCard({
  campaign,
  onOpen,
}: {
  readonly campaign: Campaign;
  readonly onOpen: () => void;
}) {
  const { inventory } = campaign;
  const kinds = [...new Set(inventory.map((item) => EQUIPMENT[item.item].kind))];

  return (
    <section aria-labelledby="summary-inventory" className={`${CARD} ${QUIET}`}>
      <div className="flex items-center gap-2">
        <h2 id="summary-inventory" className="grow text-base font-semibold">
          Inventory
        </h2>
        <button type="button" onClick={onOpen} className={OPEN}>
          Open
        </button>
      </div>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {inventory.length === 0 ? (
          'Nothing stored yet.'
        ) : (
          <>
            <span className="tabular-nums">{inventory.length}</span> item
            {inventory.length === 1 ? '' : 's'}
          </>
        )}
      </p>
      {/* Vehicles are the base's Inventory too (pp. 79, 82; Z5-11). */}
      {campaign.vehicles.length > 0 && (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <span className="tabular-nums">{campaign.vehicles.length}</span> vehicle
          {campaign.vehicles.length === 1 ? '' : 's'}
        </p>
      )}
      {kinds.length > 0 && (
        <ul className="mt-1 hidden text-sm lg:block">
          {kinds.map((kind) => (
            <li key={kind} className="flex gap-2">
              <span className="grow">{ITEM_KIND_LABELS[kind]}</span>
              <span className="tabular-nums text-stone-600 dark:text-stone-400">
                {inventory.filter((item) => EQUIPMENT[item.item].kind === kind).length}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
