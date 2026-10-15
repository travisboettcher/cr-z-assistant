/**
 * The base's Inventory: every item the community owns that nobody carries
 * (pp. 18, 37–53; Z5-2).
 *
 * Opened from the Inventory card beside the turn. Items arrive by the rules in
 * later stories — built at Planning, found, traded — and are handed out at
 * Equip Mission Team; this is where a table sees them, and where it adds or
 * takes one out by hand to bring a campaign in part-way through or correct
 * it, as the materials editor does for materials.
 */

import { useId, useState } from 'react';
import {
  EQUIPMENT,
  ITEM_IDS,
  type Grade,
  type ItemId,
  type ItemKind,
  type ItemRules,
} from '../data/equipment';
import type { Campaign, Item } from '../engine/campaign';
import { D10_RESULTS, type D10Result } from '../data/dice';
import { permitted } from '../engine/checks';
import { installProblem, installTargets } from '../engine/install';
import { rareItemFor } from '../engine/finding';
import { newItemProblem } from '../engine/equipment';
import {
  buildableItems,
  buildCheck,
  buildCost,
  buildGrades,
  ENCHANTABLE,
  type Enchantable,
} from '../engine/making';
import { laborAvailable } from '../engine/projects';
import {
  pickPrice,
  rareTradeCheck,
  rareTradeRolls,
  setAside,
  tradeItemFor,
  type RareTradePick,
} from '../engine/rareTrade';
import {
  saleableItems,
  saleCheck,
  salePrice,
  tradeableItems,
  tradeCheck,
  tradeGrades,
  tradePrice,
} from '../engine/trading';
import { useCampaign } from '../state/useCampaign';
import { describeItem, GRADE_LABELS, ITEM_KIND_LABELS, ITEM_LABELS } from './equipmentLabels';
import { slotLabel } from './baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';
const SELECT = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`;
const SECONDARY = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-3 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;
const PRIMARY = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`;

/** The groups in the order the chapter prints them. */
const KINDS: readonly ItemKind[] = [
  'weapon',
  'ammunition',
  'equipment',
  'protective',
  'disposable',
  'rare-equipment',
  'rare-weapon',
  'rare-upgrade',
  'vehicle-upgrade',
];

/** The grades an item can be owned in: never shoddy, which nobody owns (R35). */
function ownedGrades(item: ItemId): readonly Grade[] {
  const grades: readonly Grade[] = EQUIPMENT[item].grades;

  return grades.filter((grade) => grade !== 'shoddy');
}

export function InventoryPanel({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="In the Inventory">
        <p className={HINT}>
          Everything the community owns that nobody is carrying. Shoddy gear is free and is not kept
          here <PageRef pages="18, 37" />
        </p>

        {campaign.inventory.length === 0 ? (
          <p className={`mt-3 ${HINT}`}>Nothing in the Inventory yet.</p>
        ) : (
          KINDS.map((kind) => {
            const items = campaign.inventory.filter((item) => EQUIPMENT[item.item].kind === kind);
            if (items.length === 0) return null;

            return (
              <div key={kind} className="mt-4">
                <h3 className="text-sm font-semibold">{ITEM_KIND_LABELS[kind]}</h3>
                <ul className="mt-1 flex flex-col">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2 border-b border-stone-100 py-1.5 last:border-b-0 dark:border-stone-800"
                    >
                      <span className="grow text-sm">
                        {ITEM_LABELS[item.item]}{' '}
                        <span className="text-stone-600 dark:text-stone-400">
                          · {GRADE_LABELS[item.grade]}
                        </span>{' '}
                        <PageRef pages={EQUIPMENT[item.item].pages} />
                      </span>
                      {EQUIPMENT[item.item].kind === 'rare-upgrade' && (
                        <InstallRareUpgrade campaign={campaign} item={item} />
                      )}
                      <button
                        type="button"
                        className={SECONDARY}
                        aria-label={`Take ${ITEM_LABELS[item.item]} out`}
                        onClick={() => {
                          dispatch({
                            type: 'inventory/itemRemoved',
                            id: item.id,
                            at: new Date().toISOString(),
                          });
                        }}
                      >
                        Take out
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}

        {/* What a trade has paid for, arriving next Advancement (R53; Z5-9). */}
        {campaign.trades.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">On order</h3>
            <ul className="mt-1 flex flex-col">
              {campaign.trades.map((trade) => (
                <li
                  key={trade.id}
                  className="border-b border-stone-100 py-1.5 text-sm last:border-b-0 dark:border-stone-800"
                >
                  {ITEM_LABELS[trade.item]}{' '}
                  <span className="text-stone-600 dark:text-stone-400">
                    · {GRADE_LABELS[trade.grade]} · arrives at the next Add Facilities and Upgrades
                  </span>{' '}
                  <PageRef pages={19} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <BuildItem campaign={campaign} />
      <TradeForItem campaign={campaign} />
      {saleableItems(campaign).length > 0 && <SellRareItem campaign={campaign} />}
      <RareItemsTrade campaign={campaign} />
      <RollRareItem />
      <AddItem campaign={campaign} />
    </div>
  );
}

/**
 * Installing a rare upgrade in a standing facility of its kind, at Add
 * Facilities and Upgrades (pg. 49; R47; Z5-8). Which facilities, and why not,
 * are `install.ts`'s answers.
 */
function InstallRareUpgrade({
  campaign,
  item,
}: {
  readonly campaign: Campaign;
  readonly item: Item;
}) {
  const { dispatch } = useCampaign();
  const targets = installTargets(campaign, item);
  const [chosen, setChosen] = useState('');
  const slot = targets.some((occupant) => occupant.slotId === chosen)
    ? chosen
    : (targets[0]?.slotId ?? '');
  const problem = installProblem(campaign, item.id, slot);

  return (
    <span className="flex flex-wrap items-center gap-2">
      {targets.length > 1 && (
        <select
          aria-label={`Install ${ITEM_LABELS[item.item]} in`}
          className={SELECT}
          value={slot}
          onChange={(changed) => {
            setChosen(changed.target.value);
          }}
        >
          {targets.map((occupant) => (
            <option key={occupant.slotId} value={occupant.slotId}>
              {slotLabel(occupant.slotId)}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className={SECONDARY}
        disabled={problem !== null}
        onClick={() => {
          dispatch({
            type: 'advancement/rareUpgradeInstalled',
            id: item.id,
            slot,
            at: new Date().toISOString(),
          });
        }}
      >
        {/* Where it goes is on the button when there is one place, beside it in the picker otherwise. */}
        Install <span className="sr-only">{ITEM_LABELS[item.item]}</span>
        {targets.length === 1 && ` in the ${slotLabel(slot)}`}
      </button>
      {/* Said, not left to a tooltip a thumb never finds. */}
      {problem !== null && (
        <span className="text-xs text-stone-600 dark:text-stone-400">{problem}</span>
      )}
    </span>
  );
}

/**
 * Building an item at Planning Step 2 (pp. 20–21, 41–42; Z5-6): the items the
 * tables price, in the grades they price, at the cost `buildCost` quotes, and
 * refused for whatever `buildCheck` says. It is in the Inventory the moment it
 * is paid for.
 */
function BuildItem({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const itemId = useId();
  const gradeId = useId();
  const weaponId = useId();

  const offered = buildableItems(campaign);
  const [chosenItem, setItem] = useState<ItemId>('blunt');
  const item = offered.includes(chosenItem) ? chosenItem : (offered[0] ?? 'blunt');
  const grades = buildGrades(item);
  const [chosenGrade, setGrade] = useState<Grade>('standard');
  const grade = grades.includes(chosenGrade) ? chosenGrade : (grades[0] ?? 'standard');
  const [enchants, setEnchants] = useState<Enchantable>('bladed');
  const [fresh, setFresh] = useState(() => crypto.randomUUID());

  const rules: ItemRules = EQUIPMENT[item];
  const onWeapon = rules.build?.kind === 'as-base-weapon';
  const order = { id: fresh, item, grade, ...(onWeapon ? { enchants } : {}) };
  const check = buildCheck(campaign, order);
  const cost = buildCost(campaign, order);

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Build an item</legend>
      <p className={`mt-1 ${HINT}`}>
        The project team builds it in the Planning Phase, and it is here the moment it is paid for{' '}
        <PageRef pages="20–21" />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={itemId} className="text-sm">
            Item to build
          </label>
          <select
            id={itemId}
            className={SELECT}
            value={item}
            onChange={(changed) => {
              setItem(changed.target.value as ItemId);
            }}
          >
            {KINDS.map((kind) => {
              const ofKind = offered.filter((id) => EQUIPMENT[id].kind === kind);

              return ofKind.length === 0 ? null : (
                <optgroup key={kind} label={ITEM_KIND_LABELS[kind]}>
                  {ofKind.map((id) => (
                    <option key={id} value={id}>
                      {ITEM_LABELS[id]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={gradeId} className="text-sm">
            Grade to build
          </label>
          <select
            id={gradeId}
            className={SELECT}
            value={grade}
            onChange={(changed) => {
              setGrade(changed.target.value as Grade);
            }}
          >
            {grades.map((option) => (
              <option key={option} value={option}>
                {GRADE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        {onWeapon && (
          <div className="flex flex-col gap-1">
            <label htmlFor={weaponId} className="text-sm">
              Built on
            </label>
            <select
              id={weaponId}
              className={SELECT}
              value={enchants}
              onChange={(changed) => {
                setEnchants(changed.target.value as Enchantable);
              }}
            >
              {ENCHANTABLE.map((weapon) => (
                <option key={weapon} value={weapon}>
                  {ITEM_LABELS[weapon]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {cost !== undefined && (
        <p className={`mt-2 ${HINT}`}>
          {cost.hardware} Hardware · {cost.labor} Labor, of {Math.max(0, laborAvailable(campaign))}{' '}
          available <PageRef pages={rules.pages} />
        </p>
      )}

      {check.blockers.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {check.blockers.map((violation) => (
            <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`mt-3 ${PRIMARY}`}
        disabled={!permitted(check, false)}
        onClick={() => {
          dispatch({ type: 'planning/itemBuilt', order, at: new Date().toISOString() });
          setFresh(crypto.randomUUID());
        }}
      >
        Build
      </button>
    </fieldset>
  );
}

/** How much of a price is paid in Food, the rest in Fuel (pg. 21): a picker from none to all. */
function FoodShare({
  price,
  food,
  onChange,
  label,
}: {
  readonly price: number;
  readonly food: number;
  readonly onChange: (food: number) => void;
  readonly label: string;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          className={SELECT}
          value={food}
          onChange={(changed) => {
            onChange(Number(changed.target.value));
          }}
        >
          {Array.from({ length: price + 1 }, (_, amount) => (
            <option key={amount} value={amount}>
              {amount} Food
            </option>
          ))}
        </select>
        <span className="text-sm">and {price - food} Fuel</span>
      </div>
    </div>
  );
}

/**
 * Trading for an item at Planning Step 2 (pp. 19, 21; R51–R53; Z5-9): what the
 * equipment tables price for trade, paid in any mix of Food and Fuel, and on
 * order until the next Add Facilities and Upgrades. `trading.ts` says what may
 * be bought and why not.
 */
function TradeForItem({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const itemId = useId();
  const gradeId = useId();

  const offered = tradeableItems(campaign);
  const [chosenItem, setItem] = useState<ItemId>('pistol');
  const item = offered.includes(chosenItem) ? chosenItem : (offered[0] ?? 'pistol');
  const grades = tradeGrades(item);
  const [chosenGrade, setGrade] = useState<Grade>('standard');
  const grade = (grades as readonly Grade[]).includes(chosenGrade)
    ? chosenGrade
    : (grades[0] ?? 'standard');
  const price = tradePrice(item, grade) ?? 0;
  const [chosenFood, setFood] = useState<number | null>(null);
  const food = Math.min(price, chosenFood ?? Math.min(price, campaign.materials.food));
  const [fresh, setFresh] = useState(() => crypto.randomUUID());

  const request = { id: fresh, item, grade, food, fuel: price - food };
  const check = tradeCheck(campaign, request);

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Trade for an item</legend>
      <p className={`mt-1 ${HINT}`}>
        Paid now in Food and Fuel, any mix, with no Labor, and here at the next Add Facilities and
        Upgrades <PageRef pages="19, 21" />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={itemId} className="text-sm">
            Item to trade for
          </label>
          <select
            id={itemId}
            className={SELECT}
            value={item}
            onChange={(changed) => {
              setItem(changed.target.value as ItemId);
              setFood(null);
            }}
          >
            {KINDS.map((kind) => {
              const ofKind = offered.filter((id) => EQUIPMENT[id].kind === kind);

              return ofKind.length === 0 ? null : (
                <optgroup key={kind} label={ITEM_KIND_LABELS[kind]}>
                  {ofKind.map((id) => (
                    <option key={id} value={id}>
                      {ITEM_LABELS[id]}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={gradeId} className="text-sm">
            Grade to trade for
          </label>
          <select
            id={gradeId}
            className={SELECT}
            value={grade}
            onChange={(changed) => {
              setGrade(changed.target.value as Grade);
              setFood(null);
            }}
          >
            {grades.map((option) => (
              <option key={option} value={option}>
                {GRADE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <FoodShare price={price} food={food} onChange={setFood} label="Paid with" />
      </div>

      <p className={`mt-2 ${HINT}`}>
        Costs {price} <PageRef pages={EQUIPMENT[item].pages} />
      </p>

      {check.blockers.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {check.blockers.map((violation) => (
            <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`mt-3 ${SECONDARY}`}
        disabled={check.blockers.length > 0}
        onClick={() => {
          dispatch({ type: 'planning/tradeOrdered', request, at: new Date().toISOString() });
          setFresh(crypto.randomUUID());
          setFood(null);
        }}
      >
        Trade for it
      </button>
    </fieldset>
  );
}

/**
 * Selling a rare item in the Planning Phase (pp. 21, 37; R54, R56; Z5-9): its
 * Rare Item Table price less two, in any mix of Food and Fuel. Going over a cap
 * is said, not refused: Check Storage takes the excess.
 */
function SellRareItem({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const itemId = useId();

  const offered = saleableItems(campaign);
  const [chosen, setChosen] = useState('');
  const item = offered.find((held) => held.id === chosen) ?? (offered[0] as Item);
  const price = salePrice(item) ?? 0;
  const [chosenFood, setFood] = useState(0);
  const food = Math.min(price, chosenFood);
  const payment = { food, fuel: price - food };
  const check = saleCheck(campaign, item.id, payment);

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Sell a rare item</legend>
      <p className={`mt-1 ${HINT}`}>
        At its price less two, in Food and Fuel, with no trader needed <PageRef pages="21, 37" />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={itemId} className="text-sm">
            Rare item to sell
          </label>
          <select
            id={itemId}
            className={SELECT}
            value={item.id}
            onChange={(changed) => {
              setChosen(changed.target.value);
            }}
          >
            {offered.map((held) => (
              <option key={held.id} value={held.id}>
                {ITEM_LABELS[held.item]} · {GRADE_LABELS[held.grade]}
              </option>
            ))}
          </select>
        </div>

        <FoodShare price={price} food={food} onChange={setFood} label="Taken as" />
      </div>

      <p className={`mt-2 ${HINT}`}>
        Sells for {price} <PageRef pages={43} />
      </p>

      {[...check.blockers, ...check.warnings].length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {[...check.blockers, ...check.warnings].map((violation) => (
            <li key={violation.message} className="text-sm text-amber-800 dark:text-amber-300">
              {violation.message} <PageRef pages={violation.pages} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`mt-3 ${SECONDARY}`}
        disabled={check.blockers.length > 0}
        onClick={() => {
          dispatch({
            type: 'planning/itemSold',
            id: item.id,
            payment,
            at: new Date().toISOString(),
          });
        }}
      >
        Sell
      </button>
    </fieldset>
  );
}

/**
 * A roll on the Rare Item Table by hand (pg. 43; Z5-7), for the story and
 * origin rewards that roll on it. A haul's 10s are rolled at Add Materials to
 * Storage instead, where they are owed.
 */
/** One d10 as rolled, for the Rare Item Table's two (pg. 43). */
function Die({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: D10Result | undefined;
  readonly onChange: (rolled: D10Result) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <select
        id={id}
        className={SELECT}
        value={value ?? ''}
        onChange={(changed) => {
          onChange(Number(changed.target.value) as D10Result);
        }}
      >
        <option value="" disabled>
          Rolled…
        </option>
        {D10_RESULTS.map((result) => (
          <option key={result} value={result}>
            {result}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A Rare Items trade (pp. 21, 43, 83–84; R57–R60; Z5-10): the rolls from the
 * trader's list the player wants, in priority order, each with the Food and
 * Fuel set aside for it. While one is under way, what it is for and what it
 * holds back, and that the next turn's first mission is the Rare Goods Trader.
 */
function RareItemsTrade({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [picks, setPicks] = useState<readonly RareTradePick[]>([]);
  const [subtable, setSubtable] = useState<D10Result | undefined>(undefined);
  const [entry, setEntry] = useState<D10Result | undefined>(undefined);
  const [chosenFood, setFood] = useState(0);

  const trade = campaign.rareTrade;
  if (trade !== null) {
    return (
      <section
        aria-label="Rare Items trade under way"
        className="border-t border-stone-200 pt-4 dark:border-stone-800"
      >
        <h3 className="font-medium">Rare Items trade under way</h3>
        <p className={`mt-1 ${HINT}`}>
          {paidFor(setAside(trade.items))} set aside, outside storage. The next turn’s first mission
          must be the Rare Goods Trader <PageRef pages="21, 83–84" />
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm">
          {trade.items.map((item) => (
            <li key={item.id}>{describeItem(item)}</li>
          ))}
        </ol>
      </section>
    );
  }

  const rolls = rareTradeRolls(campaign);
  const rolled = subtable !== undefined && entry !== undefined ? { subtable, entry } : null;
  const price = rolled === null ? 0 : pickPrice(rolled);
  const food = Math.min(price, chosenFood);
  const check = rareTradeCheck(campaign, picks);

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Trade with the Rare Goods Trader</legend>
      <p className={`mt-1 ${HINT}`}>
        The trader’s list has {rolls} rolls on the Rare Item Table, every survivor’s Scout Score
        plus Cooperation. Enter the ones to buy, first in priority first: their price is set aside
        until the next turn’s mission, which must be the Rare Goods Trader{' '}
        <PageRef pages="21, 43, 83–84" />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Die label="Trader’s list, first d10" value={subtable} onChange={setSubtable} />
        <Die label="Trader’s list, second d10" value={entry} onChange={setEntry} />
        {rolled !== null && (
          <>
            <p className="text-sm font-medium">
              {describeItem(rareItemFor(rolled.subtable, rolled.entry))}, {price}
            </p>
            <FoodShare price={price} food={food} onChange={setFood} label="Set aside" />
          </>
        )}
      </div>

      <button
        type="button"
        className={`mt-3 ${SECONDARY}`}
        disabled={rolled === null || picks.length >= rolls}
        onClick={() => {
          if (rolled === null) return;
          setPicks([...picks, { id: crypto.randomUUID(), ...rolled, food, fuel: price - food }]);
          setSubtable(undefined);
          setEntry(undefined);
          setFood(0);
        }}
      >
        Add to the list
      </button>

      {picks.length > 0 && (
        <>
          <ol aria-label="Items to trade for" className="mt-3 flex flex-col">
            {picks.map((pick, at) => (
              <li
                key={pick.id}
                className="flex items-center gap-2 border-b border-stone-100 py-1.5 last:border-b-0 dark:border-stone-800"
              >
                <span className="grow text-sm">
                  {at + 1}. {describeItem(tradeItemFor(pick))} · {paidFor(pick)}
                </span>
                <button
                  type="button"
                  className={SECONDARY}
                  aria-label={`Take ${describeItem(tradeItemFor(pick))} off the list`}
                  onClick={() => {
                    setPicks(picks.filter((other) => other.id !== pick.id));
                  }}
                >
                  Take off
                </button>
              </li>
            ))}
          </ol>

          {check.blockers.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {check.blockers.map((violation) => (
                <li key={violation.code} className="text-sm text-amber-800 dark:text-amber-300">
                  {violation.message} <PageRef pages={violation.pages} />
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className={`mt-3 ${SECONDARY}`}
            disabled={check.blockers.length > 0}
            onClick={() => {
              dispatch({ type: 'planning/rareTradeMade', picks, at: new Date().toISOString() });
              setPicks([]);
            }}
          >
            Make the trade
          </button>
        </>
      )}
    </fieldset>
  );
}

/** Food and Fuel as the trade forms say them: "4 Food and 6 Fuel". */
function paidFor({ food, fuel }: { readonly food: number; readonly fuel: number }): string {
  return `${String(food)} Food and ${String(fuel)} Fuel`;
}

function RollRareItem() {
  const { dispatch } = useCampaign();
  const [subtable, setSubtable] = useState<D10Result | undefined>(undefined);
  const [entry, setEntry] = useState<D10Result | undefined>(undefined);

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Roll on the Rare Item Table</legend>
      <p className={`mt-1 ${HINT}`}>
        For a reward that rolls on it. A material roll of 10 is rolled with the haul{' '}
        <PageRef pages={43} />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Die label="First d10" value={subtable} onChange={setSubtable} />
        <Die label="Second d10" value={entry} onChange={setEntry} />
        {subtable !== undefined && entry !== undefined && (
          <p className="text-sm font-medium">{describeItem(rareItemFor(subtable, entry))}</p>
        )}
      </div>

      <button
        type="button"
        className={`mt-3 ${SECONDARY}`}
        disabled={subtable === undefined || entry === undefined}
        onClick={() => {
          if (subtable === undefined || entry === undefined) return;
          dispatch({
            type: 'inventory/rareItemRolled',
            roll: { id: crypto.randomUUID(), subtable, entry },
            at: new Date().toISOString(),
          });
          setSubtable(undefined);
          setEntry(undefined);
        }}
      >
        Add what it finds
      </button>
    </fieldset>
  );
}

/**
 * Adding an item by hand: for a correction, or a campaign brought in part-way
 * through. The item list offers only what this campaign's origin allows
 * (pg. 37), and the grades only those the item comes in.
 */
function AddItem({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const itemId = useId();
  const gradeId = useId();

  const offered = ITEM_IDS.filter((id) => {
    const rules: ItemRules = EQUIPMENT[id];
    return rules.origin === undefined || rules.origin === campaign.origin;
  });
  const [item, setItem] = useState<ItemId>('pistol');
  const grades = ownedGrades(item);
  const [chosenGrade, setGrade] = useState<Grade>('standard');
  const grade = grades.includes(chosenGrade) ? chosenGrade : (grades[0] ?? 'standard');
  const problem = newItemProblem(campaign, { id: 'new', item, grade });

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Add an item by hand</legend>
      <p className={`mt-1 ${HINT}`}>
        For corrections, or a campaign brought in part-way through. Items that are built, found or
        traded arrive on their own.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={itemId} className="text-sm">
            Item
          </label>
          <select
            id={itemId}
            className={SELECT}
            value={item}
            onChange={(changed) => {
              setItem(changed.target.value as ItemId);
            }}
          >
            {KINDS.map((kind) => (
              <optgroup key={kind} label={ITEM_KIND_LABELS[kind]}>
                {offered
                  .filter((id) => EQUIPMENT[id].kind === kind)
                  .map((id) => (
                    <option key={id} value={id}>
                      {ITEM_LABELS[id]}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={gradeId} className="text-sm">
            Grade
          </label>
          <select
            id={gradeId}
            className={SELECT}
            value={grade}
            onChange={(changed) => {
              setGrade(changed.target.value as Grade);
            }}
          >
            {grades.map((option) => (
              <option key={option} value={option}>
                {GRADE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={SECONDARY}
          disabled={problem !== null}
          onClick={() => {
            dispatch({
              type: 'inventory/itemAdded',
              id: crypto.randomUUID(),
              item,
              grade,
              at: new Date().toISOString(),
            });
          }}
        >
          Add to the Inventory
        </button>
      </div>

      {problem !== null && <p className={`mt-2 ${HINT}`}>{problem}</p>}
    </fieldset>
  );
}
