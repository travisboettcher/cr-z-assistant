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
import { newItemProblem } from '../engine/equipment';
import { useCampaign } from '../state/useCampaign';
import { GRADE_LABELS, ITEM_KIND_LABELS, ITEM_LABELS } from './equipmentLabels';
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

      <AddItem campaign={campaign} />
    </div>
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
          className={PRIMARY}
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
