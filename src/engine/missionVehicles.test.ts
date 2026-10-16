import { describe, expect, it } from 'vitest';
import type { UpgradeId } from '../data/facilities';
import { generatingFlatUtility } from '../test/campaigns';
import { createNewCampaign, type Base, type Campaign, type Item, type Vehicle } from './campaign';
import type { FormResult } from './forms';
import {
  submitMissionOutcome,
  submitMissionSelection,
  submitVehicleLeftHome,
  submitVehiclesBroughtHome,
  submitVehicleTaken,
} from './missionForms';
import {
  autoShops,
  broughtHomeOwed,
  broughtHomeProblem,
  fuelFor,
  leaveProblem,
  poweredAutoShop,
  takeProblem,
  vehiclesTaken,
} from './missionVehicles';
import { outcomeOf, woundsAsTheyStand } from './missions';
import { outstanding } from './outstanding';
import { createSurvivor } from './survivor';
import { vehicleSlots } from './vehicles';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-15T09:00:00.000Z';

const rack: Item = { id: 'rack', item: 'car-roof-rack', grade: 'standard' };
const conversion: Item = { id: 'volts', item: 'electric-car-conversion', grade: 'standard' };

const pickup: Vehicle = { id: 'pickup', tier: 2, label: 'Red pickup', water: false };
const truck: Vehicle = { id: 'truck', tier: 3, label: 'Box truck', water: false };
const electric: Vehicle = { id: 'electric', tier: 2, label: 'Hatchback', water: false };

/** A Workshop in the Small Town Home's garage with these upgrades, and Power on it or not. */
function workshop(upgrades: readonly UpgradeId[], power: boolean): Base {
  return {
    id: 'small-town-home',
    slots: {
      garage: {
        built: { facility: 'workshop', builtOnTurn: 1 },
        upgrades,
        ...(power ? { power } : {}),
      },
    },
  };
}

/** Turn 4 at Equip Mission Team: Earl on team 1, Ada on team 2, both missions chosen. */
function equipping(overrides: Partial<Campaign> = {}): Campaign {
  const team: Campaign = {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'equip-mission-team',
    materials: { food: 0, fuel: 6, hardware: 0 },
    survivors: [
      createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
      createSurvivor('Ada Moss', 2, { id: 'ada' }),
    ],
    assignments: { earl: { task: 'mission', team: 1 }, ada: { task: 'mission', team: 2 } },
    vehicles: [pickup, truck],
    ...overrides,
  };
  const first = accepted(
    submitMissionSelection(team, { team: 1, mission: 'retrieve-new-vehicles' }, AT),
  );

  return accepted(submitMissionSelection(first, { team: 2, mission: 'thin-the-herd' }, AT));
}

function accepted(result: FormResult): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

function refusal(result: FormResult): string | null {
  return result.ok ? null : result.problem;
}

/** Team 1's outcome: a Retrieve New Vehicles that drove nothing new off. */
function played(campaign: Campaign, team = 1): Campaign {
  return accepted(
    submitMissionOutcome(
      { ...campaign, step: 'tactical-mission' },
      outcomeOf(
        { team, mission: team === 1 ? 'retrieve-new-vehicles' : 'thin-the-herd' },
        {
          endCondition: null,
          strangers: [],
          vehiclesOnArea: 0,
          materialsCarriedOut: 0,
          startingZombies: 0,
          zombiesLeft: 0,
          survivorsExited: 0,
          allIncapacitated: false,
          vehiclesDrivenOff: 0,
          wounds: woundsAsTheyStand(campaign, team),
        },
      ),
      AT,
    ),
  );
}

describe('what an upgrade does to a vehicle (pg. 49; R82)', () => {
  it('gives the roof rack four more Inventory Slots, and the conversion two fewer', () => {
    expect(vehicleSlots({ ...pickup, upgrade: rack })).toEqual({ inventory: 10, passengers: 4 });
    expect(vehicleSlots({ ...pickup, upgrade: conversion })).toEqual({
      inventory: 4,
      passengers: 4,
    });
  });

  it('never takes a vehicle below no Inventory Slots', () => {
    expect(vehicleSlots({ ...pickup, tier: 1, upgrade: conversion })).toEqual({
      inventory: 0,
      passengers: 2,
    });
    expect(vehicleSlots({ ...pickup, tier: 4, inventorySlots: 1, upgrade: conversion })).toEqual({
      inventory: 0,
      passengers: 19,
    });
  });

  it('burns the Tier in Fuel, and none on an electric conversion', () => {
    expect(fuelFor(truck)).toBe(3);
    expect(fuelFor({ ...truck, upgrade: rack })).toBe(3);
    expect(fuelFor({ ...truck, upgrade: conversion })).toBe(0);
  });
});

describe('the base’s Auto Shops (pp. 49, 71; R66)', () => {
  it('counts each working Auto Shop, and asks whether one has Power', () => {
    expect(autoShops(equipping())).toBe(0);
    expect(poweredAutoShop(equipping())).toBe(false);

    const unpowered = equipping({ base: workshop(['auto-shop'], false) });
    expect(autoShops(unpowered)).toBe(1);
    expect(poweredAutoShop(unpowered)).toBe(false);

    const powered = generatingFlatUtility(
      equipping({ base: workshop(['auto-shop'], true) }),
      'power',
    );
    expect(autoShops(powered)).toBe(1);
    expect(poweredAutoShop(powered)).toBe(true);

    const otherUpgrade = generatingFlatUtility(
      equipping({ base: workshop(['metal-shop'], true) }),
      'power',
    );
    expect(autoShops(otherUpgrade)).toBe(0);
    expect(poweredAutoShop(otherUpgrade)).toBe(false);
  });
});

describe('taking a vehicle at Equip Mission Team (pp. 18, 52; R65)', () => {
  /** The acceptance's first half: a Tier 3 taken costs 3 Fuel. */
  it('burns its Tier in Fuel from storage, and the log says so', () => {
    const after = accepted(submitVehicleTaken(equipping(), 1, 'truck', AT));

    expect(after.materials.fuel).toBe(3);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'vehicle-taken',
      team: 1,
      vehicle: 'truck',
      label: 'Box truck',
      tier: 3,
      fuel: 3,
    });
    expect(vehiclesTaken(after)).toEqual([
      { team: 1, vehicle: 'truck', label: 'Box truck', fuel: 3 },
    ]);
  });

  it('is refused when the base cannot fuel it', () => {
    expect(
      takeProblem(equipping({ materials: { food: 0, fuel: 2, hardware: 0 } }), 1, 'truck'),
    ).toBe('Box truck burns 3 Fuel, but the base has 2 (R65).');
    expect(
      takeProblem(equipping({ materials: { food: 0, fuel: 3, hardware: 0 } }), 1, 'truck'),
    ).toBeNull();
  });

  it('is refused outside the Mission Phase, off a team going out, or for a vehicle not held', () => {
    expect(takeProblem({ ...equipping(), step: 'heal-wounds' }, 1, 'truck')).toBe(
      'Take vehicles at Equip the Mission Team, in the Mission Phase.',
    );
    expect(takeProblem(equipping(), 3, 'truck')).toBe(
      'Only a team going out this turn takes a vehicle.',
    );
    expect(takeProblem(equipping(), 1, 'nothing')).toBe(
      'Only a vehicle the community holds can be taken.',
    );
  });

  it('is refused for a team that stays home', () => {
    const skipped = accepted(
      submitMissionSelection(
        {
          ...equipping(),
          log: equipping().log.filter((entry) => entry.event.kind !== 'mission-selected'),
        },
        { team: 1, mission: 'thin-the-herd' },
        AT,
      ),
    );

    expect(takeProblem(skipped, 2, 'truck')).toBe(
      'Only a team going out this turn takes a vehicle.',
    );
    expect(takeProblem(skipped, 1, 'truck')).toBeNull();
  });

  it('takes a vehicle once a turn', () => {
    const after = accepted(submitVehicleTaken(equipping(), 1, 'truck', AT));

    expect(refusal(submitVehicleTaken(after, 2, 'truck', AT))).toBe(
      'Box truck is taken already, by mission team 1.',
    );
    expect(takeProblem(after, 2, 'pickup')).toBeNull();
  });

  it('sends an electric conversion out only with a powered Auto Shop, burning nothing', () => {
    const converted = { ...electric, upgrade: conversion };
    const unpowered = equipping({
      vehicles: [converted],
      materials: { food: 0, fuel: 0, hardware: 0 },
      base: workshop(['auto-shop'], false),
    });

    expect(takeProblem(unpowered, 1, 'electric')).toBe(
      'Hatchback runs on an electric conversion, which goes out only with a powered Auto Shop (pg. 49).',
    );

    const powered = generatingFlatUtility(
      { ...unpowered, base: workshop(['auto-shop'], true) },
      'power',
    );
    const after = accepted(submitVehicleTaken(powered, 1, 'electric', AT));

    expect(after.materials.fuel).toBe(0);
    expect(after.log.at(-1)?.event).toMatchObject({ kind: 'vehicle-taken', fuel: 0 });
  });

  it('leaves a vehicle home again at the same step, its Fuel back', () => {
    const taken = accepted(submitVehicleTaken(equipping(), 1, 'truck', AT));
    const after = accepted(submitVehicleLeftHome(taken, 'truck', AT));

    expect(after.materials.fuel).toBe(6);
    expect(vehiclesTaken(after)).toEqual([]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'vehicle-left-home',
      team: 1,
      vehicle: 'truck',
      label: 'Box truck',
      fuel: 3,
    });
    expect(takeProblem(after, 2, 'truck')).toBeNull();
  });

  it('leaves home only the vehicle named, and reads nothing else as leaving', () => {
    const both = accepted(
      submitVehicleTaken(
        accepted(submitVehicleTaken(equipping(), 1, 'truck', AT)),
        2,
        'pickup',
        AT,
      ),
    );
    const after = accepted(submitVehicleLeftHome(both, 'truck', AT));

    expect(vehiclesTaken(after)).toEqual([
      { team: 2, vehicle: 'pickup', label: 'Red pickup', fuel: 2 },
    ]);

    // An entry that names the vehicle without leaving it home changes nothing.
    const fitted: Campaign = {
      ...both,
      log: [
        ...both.log,
        {
          turn: 4,
          phase: 'planning',
          at: AT,
          event: {
            kind: 'vehicle-upgrade-fitted',
            vehicle: 'truck',
            label: 'Box truck',
            item: rack,
          },
        },
      ],
    };
    expect(vehiclesTaken(fitted).map((one) => one.vehicle)).toEqual(['truck', 'pickup']);
  });

  it('leaves home only a vehicle taken this turn, in the Mission Phase', () => {
    const taken = accepted(submitVehicleTaken(equipping(), 1, 'truck', AT));

    expect(leaveProblem(taken, 'pickup')).toBe('That vehicle isn’t taken this turn.');
    expect(refusal(submitVehicleLeftHome({ ...taken, step: 'heal-wounds' }, 'truck', AT))).toBe(
      'Leave vehicles home at Equip the Mission Team, in the Mission Phase.',
    );
    expect(leaveProblem({ ...taken, turn: 5 }, 'truck')).toBe(
      'That vehicle isn’t taken this turn.',
    );
  });
});

describe('bringing vehicles home (pg. 32; R64, R65, R70)', () => {
  const twoTaken = () =>
    accepted(
      submitVehicleTaken(
        accepted(submitVehicleTaken(equipping(), 1, 'truck', AT)),
        1,
        'pickup',
        AT,
      ),
    );

  /** The acceptance's second half: not driven off, it is gone, and the log says so. */
  it('loses the vehicles not driven off, with their upgrades, and refunds no Fuel', () => {
    const fitted = accepted(
      submitVehicleTaken(
        equipping({ vehicles: [{ ...truck, upgrade: rack }, pickup] }),
        1,
        'truck',
        AT,
      ),
    );
    const taken = accepted(submitVehicleTaken(fitted, 1, 'pickup', AT));
    const after = accepted(submitVehiclesBroughtHome(played(taken), 1, ['pickup'], AT));

    expect(after.vehicles).toEqual([pickup]);
    expect(after.materials.fuel).toBe(1);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'vehicles-brought-home',
      team: 1,
      lost: [{ ...truck, upgrade: rack }],
    });
  });

  it('records a team that drove every vehicle home, losing nothing', () => {
    const after = accepted(
      submitVehiclesBroughtHome(played(twoTaken()), 1, ['truck', 'pickup'], AT),
    );

    expect(after.vehicles).toEqual([pickup, truck]);
    expect(after.log.at(-1)?.event).toEqual({ kind: 'vehicles-brought-home', team: 1, lost: [] });
  });

  it('is owed from a team that took vehicles until it is recorded', () => {
    const taken = twoTaken();
    const says = 'Mission team 1 took vehicles, and which came home isn’t recorded.';

    expect(broughtHomeOwed(equipping())).toEqual([]);
    expect(broughtHomeOwed(taken)).toEqual([1]);
    expect(outstanding(taken).map((owed) => owed.says)).toContain(says);

    const recorded = accepted(submitVehiclesBroughtHome(played(taken), 1, [], AT));
    expect(broughtHomeOwed(recorded)).toEqual([]);
    expect(outstanding(recorded).map((owed) => owed.says)).not.toContain(says);
  });

  it('asks for the outcome first, and takes no second record', () => {
    const taken = twoTaken();

    expect(broughtHomeProblem(taken, 1, [])).toBe('Record mission team 1’s outcome first.');
    expect(broughtHomeProblem(played(taken), 2, [])).toBe('Mission team 2 took no vehicles.');
    expect(broughtHomeProblem({ ...played(taken), step: 'heal-wounds' }, 1, [])).toBe(
      'Record which vehicles came home in the Mission Phase.',
    );
    expect(broughtHomeProblem(played(taken), 1, ['other'])).toBe(
      'Only a vehicle mission team 1 took is driven home.',
    );

    const recorded = accepted(submitVehiclesBroughtHome(played(taken), 1, [], AT));
    expect(refusal(submitVehiclesBroughtHome(recorded, 1, [], AT))).toBe(
      'Mission team 1’s vehicles are recorded home already.',
    );
    expect(takeProblem(recorded, 1, 'truck')).toBe(
      'Mission team 1’s vehicles are recorded home already.',
    );
  });

  it('keeps the vehicle once the team records it home, so a later take is refused', () => {
    const recorded = accepted(
      submitVehiclesBroughtHome(played(twoTaken()), 1, ['truck', 'pickup'], AT),
    );

    expect(leaveProblem(recorded, 'truck')).toBe(
      'Mission team 1’s vehicles are recorded home already.',
    );
  });

  it('owes each team in order, and reads only this turn’s record and the team’s own', () => {
    const second = accepted(submitVehicleTaken(equipping(), 2, 'pickup', AT));
    const both = accepted(submitVehicleTaken(second, 1, 'truck', AT));

    expect(broughtHomeOwed(both)).toEqual([1, 2]);

    const teamTwo = accepted(submitVehiclesBroughtHome(played(both, 2), 2, ['pickup'], AT));
    expect(broughtHomeOwed(teamTwo)).toEqual([1]);
    expect(takeProblem(teamTwo, 1, 'nothing')).toBe(
      'Only a vehicle the community holds can be taken.',
    );

    const lastTurn: Campaign = {
      ...both,
      log: [
        {
          turn: 3,
          phase: 'mission',
          at: AT,
          event: { kind: 'vehicles-brought-home', team: 1, lost: [] },
        },
        ...both.log,
      ],
    };
    expect(broughtHomeOwed(lastTurn)).toEqual([1, 2]);
  });

  it('owes nothing from a won Claim a New Base, which keeps them all (R64)', () => {
    const claiming = accepted(
      submitMissionSelection(
        {
          ...createNewCampaign('Cedar Hollow', FIXED),
          turn: 4,
          step: 'equip-mission-team',
          materials: { food: 0, fuel: 6, hardware: 0 },
          survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
          assignments: { earl: { task: 'mission', team: 1 } },
          base: { id: 'small-town-home', slots: {} },
          vehicles: [truck],
        },
        { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' },
        AT,
      ),
    );
    const taken = accepted(submitVehicleTaken(claiming, 1, 'truck', AT));
    const claim = (endCondition: number | null): Campaign =>
      accepted(
        submitMissionOutcome(
          { ...taken, step: 'tactical-mission' },
          outcomeOf(
            { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' },
            {
              endCondition,
              strangers: [],
              vehiclesOnArea: 0,
              materialsCarriedOut: 0,
              startingZombies: 0,
              zombiesLeft: 0,
              survivorsExited: 0,
              allIncapacitated: false,
              vehiclesDrivenOff: 0,
              wounds: woundsAsTheyStand(taken, 1),
            },
          ),
          AT,
        ),
      );

    const won = claim(1);
    expect(broughtHomeOwed(won)).toEqual([]);
    expect(broughtHomeProblem(won, 1, [])).toBe(
      'A won Claim a New Base keeps every vehicle on the mission area (R64).',
    );

    const lost = claim(null);
    expect(broughtHomeOwed(lost)).toEqual([1]);
    expect(accepted(submitVehiclesBroughtHome(lost, 1, [], AT)).vehicles).toEqual([]);
  });

  it('owes nothing from a team whose mission was not chosen after all', () => {
    const taken = twoTaken();
    const unchosen = {
      ...taken,
      log: taken.log.filter(
        (entry) => !(entry.event.kind === 'mission-selected' && entry.event.team === 1),
      ),
    };

    expect(broughtHomeOwed(unchosen)).toEqual([]);
  });

  it('loses only a vehicle still held', () => {
    const taken = twoTaken();
    const gone = { ...played(taken), vehicles: [pickup] };

    expect(accepted(submitVehiclesBroughtHome(gone, 1, [], AT)).log.at(-1)?.event).toEqual({
      kind: 'vehicles-brought-home',
      team: 1,
      lost: [pickup],
    });
  });
});
