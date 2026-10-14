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
import type { Campaign } from '../engine/campaign';
import { D10_RESULTS, type D10Result } from '../data/dice';
import { permitted } from '../engine/checks';
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
import { useCampaign } from '../state/useCampaign';
import { describeItem, GRADE_LABELS, ITEM_KIND_LABELS, ITEM_LABELS } from './equipmentLabels';
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
      </section>

      <BuildItem campaign={campaign} />
      <RollRareItem />
      <AddItem campaign={campaign} />
    </div>
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

/**
 * A roll on the Rare Item Table by hand (pg. 43; Z5-7), for the story and
 * origin rewards that roll on it. A haul's 10s are rolled at Add Materials to
 * Storage instead, where they are owed.
 */
function RollRareItem() {
  const { dispatch } = useCampaign();
  const firstId = useId();
  const secondId = useId();
  const [subtable, setSubtable] = useState<D10Result | undefined>(undefined);
  const [entry, setEntry] = useState<D10Result | undefined>(undefined);

  const die = (
    id: string,
    label: string,
    value: D10Result | undefined,
    set: (d: D10Result) => void,
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <select
        id={id}
        className={SELECT}
        value={value ?? ''}
        onChange={(changed) => {
          set(Number(changed.target.value) as D10Result);
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

  return (
    <fieldset className="border-t border-stone-200 pt-4 dark:border-stone-800">
      <legend className="font-medium">Roll on the Rare Item Table</legend>
      <p className={`mt-1 ${HINT}`}>
        For a reward that rolls on it. A material roll of 10 is rolled with the haul{' '}
        <PageRef pages={43} />
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {die(firstId, 'First d10', subtable, setSubtable)}
        {die(secondId, 'Second d10', entry, setEntry)}
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
