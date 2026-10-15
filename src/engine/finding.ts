/**
 * The Rare Item Table: what a material roll of 10 finds (pp. 19, 43; R9, R49;
 * Z5-7).
 *
 * A 10 is a roll on the table instead of a material (pg. 19). The table throws
 * two more d10s — the first picks the subtable, the second the entry on it
 * (pg. 43) — and the item goes into the base's Inventory with the haul. The app
 * rolls nothing: the table's dice are entered as rolled, as the material rolls
 * are.
 *
 * A save from before v17 held Rare in storage instead; each one is a roll owed
 * at the next Add Materials to Storage step (R49), entered the same way.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { D10Result } from '../data/dice';
import { RARE_ITEM_CATEGORIES, RARE_ITEM_TABLE, type RareItemEntry } from '../data/equipment';
import type { Campaign } from './campaign';
import { idTaken } from './equipment';
import { logged } from './log';
import { rareItemRolls, type MaterialRoll } from './materials';

/** One roll on the Rare Item Table, with the id its item will have. */
export interface RareItemRoll {
  readonly id: string;
  /** The first d10: which subtable (pg. 43). */
  readonly subtable: D10Result;
  /** The second d10: which entry on it. */
  readonly entry: D10Result;
}

/** What two d10s find on the Rare Item Table (pg. 43). */
export function rareItemFor(subtable: D10Result, entry: D10Result): RareItemEntry {
  // Every d10 result is in one category: `rules.test` holds the table to it.
  const category = RARE_ITEM_CATEGORIES.find((candidate) =>
    (candidate.rolls as readonly number[]).includes(subtable),
  ) as (typeof RARE_ITEM_CATEGORIES)[number];

  return RARE_ITEM_TABLE[category.subtable][entry - 1] as RareItemEntry;
}

/**
 * How many Rare Item Table rolls this haul owes: one per unforced 10, and one
 * per Rare a save from before v17 held (R49).
 */
export function rareRollsDue(campaign: Campaign, rolls: readonly MaterialRoll[]): number {
  return rareItemRolls(rolls) + campaign.rareRollsOwed;
}

/** Why these Rare Item Table rolls do not answer the haul's, or `null`. */
export function rareRollsProblem(
  campaign: Campaign,
  rolls: readonly MaterialRoll[],
  rareItems: readonly RareItemRoll[],
): string | null {
  const due = rareRollsDue(campaign, rolls);

  if (rareItems.length !== due) {
    if (due === 0) return 'No roll on the Rare Item Table is owed.';

    return due === 1
      ? 'A 10 is a roll on the Rare Item Table: enter its two dice.'
      : `${String(due)} rolls on the Rare Item Table are owed: enter two dice for each.`;
  }

  const ids = rareItems.map((one) => one.id);
  if (ids.some((id, at) => idTaken(campaign, id) || ids.indexOf(id) !== at)) {
    return 'An item already has that id.';
  }

  return null;
}

/**
 * The campaign with what these rolls found in the base's Inventory, an
 * `item-found` entry for each, and no rolls owed. Assumes `rareRollsProblem`
 * passed.
 */
export function withItemsFound(
  campaign: Campaign,
  rareItems: readonly RareItemRoll[],
  at: string,
): Campaign {
  return rareItems.reduce(
    (current, roll) => {
      const found = rareItemFor(roll.subtable, roll.entry);
      const item = { id: roll.id, item: found.item, grade: found.grade };

      return logged({ ...current, inventory: [...current.inventory, item] }, at, {
        kind: 'item-found',
        ...item,
        subtable: roll.subtable,
        entry: roll.entry,
      });
    },
    { ...campaign, rareRollsOwed: 0 },
  );
}
