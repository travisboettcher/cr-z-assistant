/**
 * The vehicles a community holds (pp. 49, 52–53, 81–82; R62–R64, R67, R68;
 * Z5-11).
 *
 * A vehicle is a Tier, which fixes its Inventory and Passenger Slots (Tier 4
 * splits its 20 as its owner chooses), a label, and whether it is a boat (R62).
 * An upgrade changes its Inventory Slots (R82).
 * Retrieve New Vehicles adds the ones driven off the map, each at the Tier its
 * setup d10 rolled or a lower one the player chose (R63); a table bringing a
 * campaign in part-way adds them by hand. No cap, and Check Storage never
 * counts them (R68).
 *
 * A vehicle upgrade is fitted in the Planning Phase from the Inventory, one to
 * a vehicle, for nothing, and stays with it (R67): `vehicleUpgrades.ts`, which
 * reads the phase, kept apart so this module stays below `missions.ts`.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { D10Result } from '../data/dice';
import {
  VEHICLE_SLOTS,
  VEHICLE_TIER_BY_ROLL,
  VEHICLE_TIERS,
  type VehicleTier,
} from '../data/equipment';
import type { Campaign, Vehicle } from './campaign';
import { rulesOf } from './equipment';
import type { RetrievedVehicle } from './log';

/** A vehicle as it arrives: no upgrade yet. */
export type NewVehicle = Omit<Vehicle, 'upgrade'>;

/** Tier 4's slots, which its owner splits (pg. 53). */
export const TIER_FOUR_SLOTS = VEHICLE_SLOTS[4].total;

/** Tier 4's split before its owner chooses: half each. */
export const EVEN_SPLIT = TIER_FOUR_SLOTS / 2;

/**
 * A vehicle at another Tier, with Tier 4's split added, or taken away, to suit
 * it: what a form does when the Tier is changed.
 */
export function atTier<Draft extends Omit<NewVehicle, 'id'>>(
  draft: Draft,
  tier: VehicleTier,
): Draft {
  const { inventorySlots, ...rest } = draft;

  return (
    tier === 4 ? { ...rest, tier, inventorySlots: inventorySlots ?? EVEN_SPLIT } : { ...rest, tier }
  ) as Draft;
}

/** The Tier a setup d10 gives a vehicle at Retrieve New Vehicles (pg. 82). */
export function tierRolled(roll: D10Result): VehicleTier {
  return VEHICLE_TIER_BY_ROLL[roll];
}

/**
 * A vehicle's Inventory and Passenger Slots, by its Tier and Tier 4's split
 * (pg. 53), and then its upgrade: the roof rack's four more Inventory Slots,
 * the electric conversion's two fewer (pg. 49; R82), never below none.
 */
export function vehicleSlots(vehicle: Vehicle): {
  readonly inventory: number;
  readonly passengers: number;
} {
  // Present: `vehicleProblem` refuses a Tier 4 with no split.
  const { inventory, passengers } =
    vehicle.tier === 4
      ? {
          inventory: vehicle.inventorySlots as number,
          passengers: TIER_FOUR_SLOTS - (vehicle.inventorySlots as number),
        }
      : VEHICLE_SLOTS[vehicle.tier];
  const change =
    vehicle.upgrade === undefined ? 0 : (rulesOf(vehicle.upgrade).onVehicle?.inventorySlots ?? 0);

  return { inventory: Math.max(0, inventory + change), passengers };
}

/**
 * Why this vehicle cannot join the community, or `null`: a fresh id, a real
 * Tier, a label, and a split of 20 for a Tier 4 alone. `alongside` are the
 * ones joining with it, which take their ids too.
 */
export function vehicleProblem(
  campaign: Campaign,
  vehicle: NewVehicle,
  alongside: readonly NewVehicle[] = [],
): string | null {
  if (vehicle.id === '') return 'A vehicle needs an id.';
  if ([...campaign.vehicles, ...alongside].some((held) => held.id === vehicle.id)) {
    return 'A vehicle already has that id.';
  }
  if (!VEHICLE_TIERS.includes(vehicle.tier)) return 'A vehicle is Tier 1 to 4.';
  if (vehicle.label.trim() === '') return 'Give the vehicle a name.';

  const split = vehicle.inventorySlots;
  if (vehicle.tier !== 4) {
    return split === undefined ? null : 'Only a Tier 4 vehicle splits its slots.';
  }
  if (!(
    Number.isInteger(split) &&
    (split as number) >= 0 &&
    (split as number) <= TIER_FOUR_SLOTS
  )) {
    return `A Tier 4 vehicle splits its ${String(TIER_FOUR_SLOTS)} slots. Enter how many are Inventory Slots.`;
  }

  return null;
}

/**
 * Why these vehicles do not answer a Retrieve New Vehicles outcome's count, or
 * `null`: one for each vehicle driven off, at no higher a Tier than its d10
 * rolled (R63), and each one a vehicle that can join.
 */
export function retrievedProblem(
  campaign: Campaign,
  drivenOff: number,
  retrieved: readonly RetrievedVehicle[],
): string | null {
  if (retrieved.length !== drivenOff) {
    return drivenOff === 1
      ? 'Enter the vehicle that was driven off.'
      : `Enter each of the ${String(drivenOff)} vehicles driven off.`;
  }

  for (const [at, vehicle] of retrieved.entries()) {
    if (vehicle.tier > tierRolled(vehicle.roll)) {
      return 'A vehicle may be taken at a lower Tier than it rolled, never a higher one (R63).';
    }

    const problem = vehicleProblem(campaign, withoutRoll(vehicle), retrieved.slice(0, at));
    if (problem !== null) return problem;
  }

  return null;
}

/** A retrieved vehicle as the community holds it, without the roll that found it. */
export function withoutRoll(retrieved: RetrievedVehicle): NewVehicle {
  const { roll, ...vehicle } = retrieved;
  void roll;

  return vehicle;
}

/** The campaign with these vehicles joined. */
export function withVehiclesAdded(campaign: Campaign, vehicles: readonly NewVehicle[]): Campaign {
  return { ...campaign, vehicles: [...campaign.vehicles, ...vehicles] };
}

/** The campaign without this vehicle, and its upgrade with it (R67). */
export function withVehicleRemoved(campaign: Campaign, id: string): Campaign {
  return { ...campaign, vehicles: campaign.vehicles.filter((vehicle) => vehicle.id !== id) };
}
