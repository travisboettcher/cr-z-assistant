/**
 * What the community owns and what its survivors carry (pp. 14, 18, 37–53;
 * #177, Z5-2).
 *
 * The catalogue is `src/data/equipment.ts`; this is what an item in the
 * campaign comes to — how many Inventory Slots a survivor has filled, what
 * their carried items add to their slots, and what may be added to the base's
 * Inventory by hand. Equipping a mission team is Z5-4's and the Skill Score's
 * item term Z5-3's; both read what is here.
 *
 * Pure, like the rest of `src/engine`.
 */

import { EQUIPMENT, GRADES, type Grade, type ItemId, type ItemRules } from '../data/equipment';
import type { Campaign, Item, Survivor } from './campaign';

/** An item's catalogue entry. */
export function rulesOf(item: Item): ItemRules {
  return EQUIPMENT[item.item];
}

/**
 * The slots one item takes. An item the book gives no slot count is counted as
 * none here: none of them can be carried yet, which Z5-4's guard keeps true.
 */
function slotsOf(item: Item): number {
  return rulesOf(item).slots ?? 0;
}

/**
 * How many of a survivor's Inventory Slots their items fill (pp. 14, 38, 44).
 *
 * A tactical holster carries one pistol or revolver without a slot (pg. 51), so
 * the first such weapon is not counted while one is carried.
 */
export function slotsInUse(survivor: Survivor): number {
  const holsters = survivor.items.filter((item) => item.item === 'tactical-holster').length;
  let holstered = 0;

  return survivor.items.reduce((total, item) => {
    if (holstered < holsters && (item.item === 'pistol' || item.item === 'revolver')) {
      holstered += 1;
      return total;
    }

    return total + slotsOf(item);
  }, 0);
}

/**
 * What a survivor's carried items add to their Inventory Slots: the ultralight
 * backpack's two and tactical armor's one (pg. 51). A backpack adds through the
 * Carry Score instead (pp. 10, 44), which is the Score's item term (Z5-3).
 */
export function itemInventorySlots(survivor: Survivor): number {
  return survivor.items.reduce(
    (total, item) => total + (rulesOf(item).adds?.[item.grade]?.inventorySlots ?? 0),
    0,
  );
}

/** Whether this item comes in this grade (pg. 37). */
function comesIn(item: ItemId, grade: Grade): boolean {
  const grades: readonly Grade[] = EQUIPMENT[item].grades;

  return grades.includes(grade);
}

/** The item and grade a hand-added item is, and the fresh id the caller made for it. */
export interface NewItem {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
}

/**
 * Why this item cannot be added to the base's Inventory by hand, or `null` if it
 * can (Z5-2).
 *
 * For a table bringing a campaign in part-way through, or correcting the count,
 * as the materials editor is. An item the catalogue has, in a grade it comes in
 * — never shoddy, which nobody owns (R35) — usable in this campaign's origin
 * (pg. 37), with an id nothing else holds.
 */
export function newItemProblem(campaign: Campaign, item: NewItem): string | null {
  if (!Object.hasOwn(EQUIPMENT, item.item)) return 'There is no such item.';
  if (!GRADES.includes(item.grade)) return 'There is no such grade.';
  if (item.grade === 'shoddy') return 'Shoddy gear is free, and the Inventory holds none (R35).';
  if (!comesIn(item.item, item.grade)) return 'That item does not come in that grade.';

  const origin = rulesOf(item).origin;
  if (origin !== undefined && origin !== campaign.origin) {
    return 'That item belongs to another Origin of the Rot.';
  }

  if (allItems(campaign).some((held) => held.id === item.id)) {
    return 'An item already has that id.';
  }

  return null;
}

/** Every item the campaign holds: the base's, the roster's and the set-aside's. */
export function allItems(campaign: Campaign): readonly Item[] {
  return [
    ...campaign.inventory,
    ...[...campaign.survivors, ...campaign.setAside].flatMap((survivor) => survivor.items),
  ];
}

/** Why this item cannot be taken out of the base's Inventory by hand, or `null`. */
export function removalProblem(campaign: Campaign, id: string): string | null {
  return campaign.inventory.some((item) => item.id === id)
    ? null
    : 'Only an item in the base’s Inventory can be taken out of it here.';
}
