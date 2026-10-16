/**
 * Equipment a base hands over (pp. 62, 66; R45, R46; Z5-8).
 *
 * Two bases come with items. The Regional Firehouse's Turnout Gear is six
 * standard reinforced clothing, put in the Inventory each time the community
 * moves into one (R46). The Outdoor Sports Shop's Inventory slot is a
 * clearing project that adds four standard weapons when it finishes, and the
 * player chooses which: any four of the core weapons, repeats allowed (R45).
 *
 * The items' ids are made here rather than by the caller, unlike an item a
 * player adds: the rules hand them over in the same step as a claim, a move or
 * a project finishing, and those actions carry nothing about items. Each is
 * derived from the campaign, the log's length and its place in the hand-over,
 * which is pure, the same on a replay, and never repeated, since the log only
 * grows.
 *
 * Pure, like the rest of `src/engine`.
 */

import { BASES, type BaseId } from '../data/bases';
import { CORE_WEAPONS, type ItemId } from '../data/equipment';
import type { Campaign, Item } from './campaign';
import { logged } from './log';

/** The ids for `count` items handed over now. */
function handoverIds(campaign: Campaign, count: number): readonly string[] {
  return Array.from(
    { length: count },
    (_, at) => `${campaign.id}-handover-${String(campaign.log.length)}-${String(at + 1)}`,
  );
}

/** The items a base hands over when the community moves in: its Turnout Gear (R46). */
export function turnoutGear(campaign: Campaign, base: BaseId): readonly Item[] {
  const gear = BASES[base].specials.find((special) => special.id === 'turnout-gear');
  if (gear === undefined) return [];

  const { count, item, quality } = gear.startingEquipment;

  return handoverIds(campaign, count).map((id) => ({ id, item, grade: quality }));
}

/**
 * The campaign with these items in the Inventory and an `equipment-handed-over`
 * entry naming them, or unchanged when there are none.
 */
export function withEquipmentHandedOver(
  campaign: Campaign,
  base: BaseId,
  items: readonly Item[],
  at: string,
  slot?: string,
): Campaign {
  if (items.length === 0) return campaign;

  return logged({ ...campaign, inventory: [...campaign.inventory, ...items] }, at, {
    kind: 'equipment-handed-over',
    base,
    ...(slot === undefined ? {} : { slot }),
    items,
  });
}

/** Whether these are a choice the Sports Shop's clearing can hand over: `count` core weapons (R45). */
export function weaponsProblem(weapons: readonly ItemId[], count: number): string | null {
  if (weapons.length !== count) {
    return `Clearing it hands over ${String(count)} standard weapons: choose ${String(count)}.`;
  }

  if (!weapons.every((weapon) => (CORE_WEAPONS as readonly ItemId[]).includes(weapon))) {
    return 'Choose standard weapons of the nine core kinds.';
  }

  return null;
}

/** The items chosen weapons become, with ids made as every hand-over's are. */
export function chosenWeapons(campaign: Campaign, weapons: readonly ItemId[]): readonly Item[] {
  return handoverIds(campaign, weapons.length).map((id, at) => ({
    id,
    item: weapons[at] as ItemId,
    grade: 'standard',
  }));
}
