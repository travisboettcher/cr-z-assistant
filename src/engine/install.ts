/**
 * Installing a rare upgrade in a facility (pg. 49; R47; Z5-8).
 *
 * A rare upgrade found on the Rare Item Table waits in the base's Inventory
 * until it is installed. Installing costs nothing and happens at Add
 * Facilities and Upgrades, where upgrades land, into a standing facility of
 * the kind the item names (R47). The item leaves the Inventory and stays with
 * that facility as the upgrade it counts as, outside the cap of three
 * (`occupants`); it goes if the facility goes.
 *
 * Pure, like the rest of `src/engine`.
 */

import { EQUIPMENT, type ItemRules } from '../data/equipment';
import { PROJECT_STEP } from '../data/turn';
import type { Occupant } from './base';
import type { Campaign, Item } from './campaign';
import { suppliedOccupants } from './utilities';

/** The standing facilities this item can be installed in, in layout order. */
export function installTargets(campaign: Campaign, item: Item): readonly Occupant[] {
  // Only a rare base upgrade names a facility to be installed in.
  const installs = (EQUIPMENT[item.item] as ItemRules).installs;
  if (installs === undefined) return [];

  return suppliedOccupants(campaign).filter(
    (occupant) => occupant.facility.id === installs.facility,
  );
}

/** Why this item cannot be installed in this slot now, or `null`. */
export function installProblem(campaign: Campaign, id: string, slot: string): string | null {
  if (campaign.step !== PROJECT_STEP) {
    return 'A rare upgrade is installed at Add Facilities and Upgrades (R47).';
  }

  const item = campaign.inventory.find((held) => held.id === id);
  if (item === undefined) return 'Only an item in the base’s Inventory can be installed.';

  if (EQUIPMENT[item.item].kind !== 'rare-upgrade') {
    return 'Only a rare base upgrade is installed in a facility.';
  }

  if (!installTargets(campaign, item).some((occupant) => occupant.slotId === slot)) {
    return 'It is installed in a standing facility of the kind it names.';
  }

  return null;
}

/**
 * The campaign with the item out of the Inventory and installed in the slot.
 * Assumes `installProblem` passed, so the base and the item are there.
 */
export function withRareUpgradeInstalled(campaign: Campaign, id: string, slot: string): Campaign {
  const item = campaign.inventory.find((held) => held.id === id) as Item;
  const base = campaign.base as NonNullable<Campaign['base']>;
  const state = base.slots[slot] ?? {};

  return {
    ...campaign,
    inventory: campaign.inventory.filter((held) => held.id !== id),
    base: {
      ...base,
      slots: { ...base.slots, [slot]: { ...state, installed: [...(state.installed ?? []), item] } },
    },
  };
}
