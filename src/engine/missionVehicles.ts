/**
 * Vehicles on a mission (pp. 18, 32, 49, 52, 71, 79; R64–R66, R70; Z5-12).
 *
 * ## Going out
 *
 * At Equip Mission Team a team takes vehicles the community holds, each
 * burning its Tier in Fuel from storage there and then (R65); one the base
 * cannot fuel is not taken. An electric conversion burns none, and goes only
 * while a working Auto Shop stands on a powered slot (pg. 49). A vehicle taken
 * by mistake is left home again at the same step, and its Fuel comes back.
 * What the upgrades change is `vehicleSlots`' and `fuelFor`'s (R82, R83).
 *
 * What is taken is read off this turn's log, so nothing about it is stored on
 * the vehicle. Nor is which ones break down: the base's Auto Shops are counted,
 * the owner picks that many to go protected, and the rest arrive broken (R66),
 * which is the table's to play.
 *
 * ## Coming home
 *
 * Once a team's mission is played it records which of its vehicles were driven
 * off. The rest are lost with their upgrades, and their Fuel is not refunded
 * (R65, R70); what they held is recorded lost through the items-spent record,
 * like any other gear. A won Claim a New Base keeps every vehicle on the
 * mission area (R64), so that team owes no record.
 *
 * Pure, like the rest of `src/engine`.
 */

import { VEHICLE_FUEL_PER_TIER } from '../data/equipment';
import { working } from './base';
import type { Campaign, Vehicle } from './campaign';
import { rulesOf } from './equipment';
import { deployed, missionTeams, teamOutcomes, turnMissions } from './missions';
import { phaseOf } from './turn';
import { suppliedOccupants } from './utilities';

/** A vehicle taken this turn: by which team, and the Fuel it burned. */
export interface TakenVehicle {
  readonly team: number;
  readonly vehicle: string;
  readonly label: string;
  readonly fuel: number;
}

/** The Fuel a vehicle burns going out: its Tier, or none on an electric conversion (pp. 49, 52). */
export function fuelFor(vehicle: Vehicle): number {
  const upgrade = vehicle.upgrade === undefined ? undefined : rulesOf(vehicle.upgrade).onVehicle;

  return upgrade?.noFuel === true ? 0 : vehicle.tier * VEHICLE_FUEL_PER_TIER;
}

/** Whether a vehicle goes out only with a powered Auto Shop: an electric conversion (pg. 49). */
export function needsPoweredAutoShop(vehicle: Vehicle): boolean {
  return (
    vehicle.upgrade !== undefined &&
    rulesOf(vehicle.upgrade).onVehicle?.needsPoweredAutoShop === true
  );
}

/** How many vehicles the base's working Auto Shops protect (pg. 71; R66). */
export function autoShops(campaign: Campaign): number {
  return suppliedOccupants(campaign).reduce(
    (total, occupant) =>
      working(occupant).reduce((sum, entry) => sum + (entry.effects.protectsVehicles ?? 0), total),
    0,
  );
}

/**
 * Whether a working Auto Shop stands on a slot with Power (pg. 49): one is
 * enough for any number of electric conversions, until R83 is settled.
 */
export function poweredAutoShop(campaign: Campaign): boolean {
  return suppliedOccupants(campaign).some(
    (occupant) =>
      occupant.power &&
      working(occupant).some((entry) => (entry.effects.protectsVehicles ?? 0) > 0),
  );
}

/** The vehicles taken this turn and not left home again, in the order they were taken. */
export function vehiclesTaken(campaign: Campaign): readonly TakenVehicle[] {
  let taken: TakenVehicle[] = [];

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'vehicle-taken') {
      taken.push({
        team: event.team,
        vehicle: event.vehicle,
        label: event.label,
        fuel: event.fuel,
      });
    } else if (event.kind === 'vehicle-left-home') {
      taken = taken.filter((one) => one.vehicle !== event.vehicle);
    }
  }

  return taken;
}

/** The vehicles this team took this turn. */
export function teamVehicles(campaign: Campaign, team: number): readonly TakenVehicle[] {
  return vehiclesTaken(campaign).filter((taken) => taken.team === team);
}

/** Whether this team has recorded which of its vehicles came home this turn. */
function broughtHome(campaign: Campaign, team: number): boolean {
  return campaign.log.some(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'vehicles-brought-home' &&
      entry.event.team === team,
  );
}

/** Whether this team's mission won a Claim a New Base, which keeps its vehicles (R64). */
function claimKeeps(campaign: Campaign, team: number): boolean {
  const outcome = teamOutcomes(campaign).get(team);

  return outcome?.kind === 'claim-a-new-base-resolved' && outcome.endCondition !== null;
}

/** Whether this team goes out this turn: it has somebody on it who is deployed. */
function going(campaign: Campaign, team: number): boolean {
  const out = new Set(deployed(campaign).map((survivor) => survivor.id));

  return missionTeams(campaign).some(
    (candidate) =>
      candidate.team === team && candidate.members.some((survivor) => out.has(survivor.id)),
  );
}

/** Why this team cannot take this vehicle now, or `null` (pp. 18, 49, 52; R65). */
export function takeProblem(campaign: Campaign, team: number, id: string): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Take vehicles at Equip the Mission Team, in the Mission Phase.';
  }
  if (!going(campaign, team)) return 'Only a team going out this turn takes a vehicle.';
  if (broughtHome(campaign, team)) {
    return `Mission team ${String(team)}’s vehicles are recorded home already.`;
  }

  const vehicle = campaign.vehicles.find((held) => held.id === id);
  if (vehicle === undefined) return 'Only a vehicle the community holds can be taken.';

  const taken = vehiclesTaken(campaign).find((one) => one.vehicle === id);
  if (taken !== undefined) {
    return `${vehicle.label} is taken already, by mission team ${String(taken.team)}.`;
  }
  if (needsPoweredAutoShop(vehicle) && !poweredAutoShop(campaign)) {
    return `${vehicle.label} runs on an electric conversion, which goes out only with a powered Auto Shop (pg. 49).`;
  }

  const fuel = fuelFor(vehicle);
  if (fuel > campaign.materials.fuel) {
    return `${vehicle.label} burns ${String(fuel)} Fuel, but the base has ${String(campaign.materials.fuel)} (R65).`;
  }

  return null;
}

/** The campaign with a vehicle's Fuel burned from storage. Assumes the check passed. */
export function withVehicleTaken(campaign: Campaign, vehicle: Vehicle): Campaign {
  return {
    ...campaign,
    materials: { ...campaign.materials, fuel: campaign.materials.fuel - fuelFor(vehicle) },
  };
}

/** Why this vehicle cannot be left home again now, or `null`. */
export function leaveProblem(campaign: Campaign, id: string): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Leave vehicles home at Equip the Mission Team, in the Mission Phase.';
  }

  const taken = vehiclesTaken(campaign).find((one) => one.vehicle === id);
  if (taken === undefined) return 'That vehicle isn’t taken this turn.';
  if (broughtHome(campaign, taken.team)) {
    return `Mission team ${String(taken.team)}’s vehicles are recorded home already.`;
  }

  return null;
}

/** The campaign with a taken vehicle's Fuel back in storage. Assumes the check passed. */
export function withVehicleLeftHome(campaign: Campaign, taken: TakenVehicle): Campaign {
  return {
    ...campaign,
    materials: { ...campaign.materials, fuel: campaign.materials.fuel + taken.fuel },
  };
}

/**
 * Why this team's record of which vehicles it drove off is refused, or `null`.
 * After its outcome, because a won claim keeps them all (R64).
 */
export function broughtHomeProblem(
  campaign: Campaign,
  team: number,
  drivenOff: readonly string[],
): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Record which vehicles came home in the Mission Phase.';
  }

  const taken = teamVehicles(campaign, team);
  if (taken.length === 0) return `Mission team ${String(team)} took no vehicles.`;
  if (broughtHome(campaign, team)) {
    return `Mission team ${String(team)}’s vehicles are recorded home already.`;
  }
  if (!teamOutcomes(campaign).has(team)) {
    return `Record mission team ${String(team)}’s outcome first.`;
  }
  if (claimKeeps(campaign, team)) {
    return 'A won Claim a New Base keeps every vehicle on the mission area (R64).';
  }
  if (!drivenOff.every((id) => taken.some((one) => one.vehicle === id))) {
    return `Only a vehicle mission team ${String(team)} took is driven home.`;
  }

  return null;
}

/** The vehicles a record would lose: those the team took, still held, and not driven off (R70). */
export function vehiclesLost(
  campaign: Campaign,
  team: number,
  drivenOff: readonly string[],
): readonly Vehicle[] {
  const lost = new Set(
    teamVehicles(campaign, team)
      .map((taken) => taken.vehicle)
      .filter((id) => !drivenOff.includes(id)),
  );

  return campaign.vehicles.filter((vehicle) => lost.has(vehicle.id));
}

/** The campaign without these vehicles, their upgrades with them (R70). */
export function withVehiclesLost(campaign: Campaign, lost: readonly Vehicle[]): Campaign {
  const gone = new Set(lost.map((vehicle) => vehicle.id));

  return { ...campaign, vehicles: campaign.vehicles.filter((vehicle) => !gone.has(vehicle.id)) };
}

/**
 * The teams that went out with vehicles and have not said which came home:
 * owed, so a vehicle left on the map does not stay in the community. A won
 * claim keeps its vehicles (R64), and owes nothing.
 */
export function broughtHomeOwed(campaign: Campaign): readonly number[] {
  const { choices } = turnMissions(campaign);
  const teams = [...new Set(vehiclesTaken(campaign).map((taken) => taken.team))].sort(
    (one, other) => one - other,
  );

  return teams.filter(
    (team) =>
      choices.some((choice) => choice.team === team) &&
      !broughtHome(campaign, team) &&
      !claimKeeps(campaign, team),
  );
}
