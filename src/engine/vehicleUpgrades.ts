/**
 * Fitting a vehicle upgrade (pp. 43, 49; R67; Z5-11).
 *
 * The car roof rack and the electric car conversion come from the Rare Item
 * Table's Rare Upgrade subtable into the Inventory, and are fitted to one
 * vehicle in the Planning Phase, for nothing, one to a vehicle and for good
 * (R67). The item leaves the Inventory and stays on the vehicle, so a vehicle
 * that is lost takes it along.
 *
 * Apart from `vehicles.ts` because it reads the phase, which `vehicles.ts`,
 * read by the mission outcome's check, cannot.
 *
 * Pure, like the rest of `src/engine`.
 */

import { EQUIPMENT } from '../data/equipment';
import type { Campaign, Item } from './campaign';
import { orderable } from './projects';

/** Why this item cannot be fitted to this vehicle now, or `null`. */
export function fitProblem(campaign: Campaign, itemId: string, vehicleId: string): string | null {
  if (!orderable(campaign)) return 'Fit vehicle upgrades in the Planning Phase.';

  const item = campaign.inventory.find((held) => held.id === itemId);
  if (item === undefined) return 'Only an item in the base’s Inventory can be fitted.';
  if (EQUIPMENT[item.item].kind !== 'vehicle-upgrade') {
    return 'Only a vehicle upgrade is fitted to a vehicle.';
  }

  const vehicle = campaign.vehicles.find((held) => held.id === vehicleId);
  if (vehicle === undefined) return 'Only a vehicle the community holds takes an upgrade.';
  if (vehicle.upgrade !== undefined) return 'A vehicle takes one upgrade, for good (pg. 49).';

  return null;
}

/** The campaign with the item out of the Inventory and on the vehicle. Assumes the check passed. */
export function withUpgradeFitted(campaign: Campaign, itemId: string, vehicleId: string): Campaign {
  const item = campaign.inventory.find((held) => held.id === itemId) as Item;

  return {
    ...campaign,
    inventory: campaign.inventory.filter((held) => held.id !== itemId),
    vehicles: campaign.vehicles.map((vehicle) =>
      vehicle.id === vehicleId ? { ...vehicle, upgrade: item } : vehicle,
    ),
  };
}
