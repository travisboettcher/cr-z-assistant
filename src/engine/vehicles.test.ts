import { describe, expect, it } from 'vitest';
import { D10_RESULTS } from '../data/dice';
import { withPlanningBegun } from '../test/campaigns';
import { createNewCampaign, type Campaign, type Item } from './campaign';
import {
  submitVehicleAdded,
  submitVehicleRemoved,
  submitVehicleUpgradeFitted,
} from './campaignForms';
import { allItems } from './equipment';
import type { FormResult } from './forms';
import type { RetrievedVehicle } from './log';
import { submitMissionOutcome, submitMissionSelection } from './missionForms';
import { outcomeOf, woundsAsTheyStand } from './missions';
import { createSurvivor } from './survivor';
import { fitProblem } from './vehicleUpgrades';
import {
  atTier,
  retrievedProblem,
  tierRolled,
  vehicleProblem,
  vehicleSlots,
  type NewVehicle,
} from './vehicles';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-15T09:00:00.000Z';

const pickup: NewVehicle = { id: 'pickup', tier: 2, label: 'Red pickup', water: false };
const bus: NewVehicle = {
  id: 'bus',
  tier: 4,
  label: 'School bus',
  water: false,
  inventorySlots: 12,
};
const rack: Item = { id: 'rack', item: 'car-roof-rack', grade: 'standard' };

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, ...overrides };
}

function accepted(result: FormResult): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('a vehicle (pp. 52–53; R62)', () => {
  it('has the slots its Tier gives, and Tier 4 the split its owner chose', () => {
    expect(vehicleSlots({ ...pickup, tier: 1 })).toEqual({ inventory: 2, passengers: 2 });
    expect(vehicleSlots(pickup)).toEqual({ inventory: 6, passengers: 4 });
    expect(vehicleSlots({ ...pickup, tier: 3 })).toEqual({ inventory: 10, passengers: 6 });
    expect(vehicleSlots(bus)).toEqual({ inventory: 12, passengers: 8 });
  });

  it('needs a fresh id, a name, and a split only at Tier 4', () => {
    const holding = campaign({ vehicles: [pickup] });

    expect(vehicleProblem(holding, bus)).toBeNull();
    expect(vehicleProblem(holding, { ...bus, id: '' })).toBe('A vehicle needs an id.');
    expect(vehicleProblem(holding, { ...bus, id: 'pickup' })).toBe(
      'A vehicle already has that id.',
    );
    expect(vehicleProblem(holding, bus, [bus])).toBe('A vehicle already has that id.');
    expect(vehicleProblem(holding, { ...pickup, id: 'b', tier: 5 as 4 })).toBe(
      'A vehicle is Tier 1 to 4.',
    );
    expect(vehicleProblem(holding, { ...bus, label: '  ' })).toBe('Give the vehicle a name.');
    expect(vehicleProblem(holding, { ...pickup, id: 'b', inventorySlots: 3 })).toBe(
      'Only a Tier 4 vehicle splits its slots.',
    );
    for (const inventorySlots of [undefined, -1, 21, 2.5]) {
      const { inventorySlots: _, ...rest } = bus;
      void _;
      expect(
        vehicleProblem(holding, inventorySlots === undefined ? rest : { ...rest, inventorySlots }),
      ).toBe('A Tier 4 vehicle splits its 20 slots. Enter how many are Inventory Slots.');
    }
    expect(vehicleProblem(holding, { ...bus, inventorySlots: 0 })).toBeNull();
    expect(vehicleProblem(holding, { ...bus, inventorySlots: 20 })).toBeNull();
  });

  it('gains or loses Tier 4’s split as its Tier changes', () => {
    expect(atTier({ tier: 2, label: 'A', water: false }, 4)).toEqual({
      tier: 4,
      label: 'A',
      water: false,
      inventorySlots: 10,
    });
    expect(atTier({ tier: 4, label: 'A', water: false, inventorySlots: 3 }, 4)).toMatchObject({
      inventorySlots: 3,
    });
    expect(atTier({ tier: 4, label: 'A', water: true, inventorySlots: 3 }, 1)).toEqual({
      tier: 1,
      label: 'A',
      water: true,
    });
  });
});

describe('Retrieve New Vehicles (pg. 82; R63)', () => {
  it('rolls a Tier on a d10: 1–3, 4–7, 8–9 and 10', () => {
    expect(D10_RESULTS.map(tierRolled)).toEqual([1, 1, 1, 2, 2, 2, 2, 3, 3, 4]);
  });

  const retrieved = (overrides: Partial<RetrievedVehicle> = {}): RetrievedVehicle => ({
    ...pickup,
    roll: 5,
    ...overrides,
  });

  it('asks what each vehicle driven off was, at no higher a Tier than it rolled', () => {
    const here = campaign();

    expect(retrievedProblem(here, 1, [])).toBe('Enter the vehicle that was driven off.');
    expect(retrievedProblem(here, 2, [retrieved()])).toBe(
      'Enter each of the 2 vehicles driven off.',
    );
    expect(retrievedProblem(here, 1, [retrieved({ roll: 3 })])).toBe(
      'A vehicle may be taken at a lower Tier than it rolled, never a higher one (R63).',
    );
    expect(retrievedProblem(here, 1, [retrieved({ roll: 3, tier: 1 })])).toBeNull();
    expect(retrievedProblem(here, 2, [retrieved(), retrieved()])).toBe(
      'A vehicle already has that id.',
    );
    expect(retrievedProblem(here, 0, [])).toBeNull();
  });

  /** The acceptance: two driven off, rolled 5 and 10, join as a Tier 2 and a Tier 4, or lower. */
  it('adds the vehicles driven off when the outcome is recorded', () => {
    const team = campaign({
      turn: 4,
      step: 'tactical-mission',
      survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
      assignments: { earl: { task: 'mission', team: 1 } },
    });
    const chosen = accepted(
      submitMissionSelection(team, { team: 1, mission: 'retrieve-new-vehicles' }, AT),
    );
    const record = (vehicles: readonly RetrievedVehicle[]) =>
      submitMissionOutcome(
        chosen,
        outcomeOf(
          { team: 1, mission: 'retrieve-new-vehicles' },
          {
            endCondition: null,
            strangers: [],
            vehiclesOnArea: 0,
            materialsCarriedOut: 0,
            startingZombies: 0,
            zombiesLeft: 0,
            survivorsExited: 0,
            allIncapacitated: false,
            vehiclesDrivenOff: 2,
            retrieved: vehicles,
            wounds: woundsAsTheyStand(chosen, 1),
          },
        ),
        AT,
      );

    const after = accepted(record([retrieved({ roll: 5 }), { ...bus, roll: 10 }]));
    expect(after.vehicles).toEqual([pickup, bus]);

    const lowered = accepted(
      record([retrieved({ roll: 5, tier: 1 }), atTier({ ...bus, roll: 10 }, 3)]),
    );
    expect(lowered.vehicles.map((vehicle) => vehicle.tier)).toEqual([1, 3]);

    const refused = record([retrieved({ roll: 5 })]);
    expect(refused.ok ? null : refused.problem).toBe('Enter each of the 2 vehicles driven off.');
  });
});

describe('vehicles by hand (Z5-11)', () => {
  it('adds a vehicle, and refuses one that cannot join', () => {
    const after = accepted(submitVehicleAdded(campaign(), pickup, AT));

    expect(after.vehicles).toEqual([pickup]);
    expect(after.log.at(-1)?.event).toEqual({ kind: 'vehicle-added', vehicle: pickup });
    expect(submitVehicleAdded(after, pickup, AT).ok).toBe(false);
  });

  it('takes one out, and its upgrade with it', () => {
    const holding = campaign({ vehicles: [{ ...pickup, upgrade: rack }, bus] });
    const after = accepted(submitVehicleRemoved(holding, 'pickup', AT));

    expect(after.vehicles).toEqual([bus]);
    expect(allItems(after)).toEqual([]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'vehicle-removed',
      id: 'pickup',
      label: 'Red pickup',
      tier: 2,
    });
    expect(submitVehicleRemoved(holding, 'nothing', AT).ok).toBe(false);
  });
});

describe('fitting a vehicle upgrade (pg. 49; R67)', () => {
  const planning = (overrides: Partial<Campaign> = {}) =>
    withPlanningBegun(
      campaign({
        step: 'assign-project-team',
        inventory: [rack, { id: 'pistol', item: 'pistol', grade: 'standard' }],
        vehicles: [pickup],
        ...overrides,
      }),
    );

  it('is refused outside Planning, for anything but a vehicle upgrade, or twice', () => {
    expect(fitProblem(planning({ step: 'heal-wounds' }), 'rack', 'pickup')).toBe(
      'Fit vehicle upgrades in the Planning Phase (R67).',
    );
    expect(fitProblem(planning(), 'nothing', 'pickup')).toBe(
      'Only an item in the base’s Inventory can be fitted.',
    );
    expect(fitProblem(planning(), 'pistol', 'pickup')).toBe(
      'Only a vehicle upgrade is fitted to a vehicle.',
    );
    expect(fitProblem(planning(), 'rack', 'nothing')).toBe(
      'Only a vehicle the community holds takes an upgrade.',
    );
    expect(
      fitProblem(
        planning({ vehicles: [{ ...pickup, upgrade: { ...rack, id: 'old' } }] }),
        'rack',
        'pickup',
      ),
    ).toBe('A vehicle takes one upgrade, for good (pg. 49).');
    expect(fitProblem(planning(), 'rack', 'pickup')).toBeNull();
  });

  it('moves the item from the Inventory onto the vehicle, for nothing', () => {
    const before = planning({ vehicles: [pickup, bus] });
    const after = accepted(submitVehicleUpgradeFitted(before, 'rack', 'pickup', AT));

    expect(after.inventory.map((item) => item.id)).toEqual(['pistol']);
    expect(after.vehicles).toEqual([{ ...pickup, upgrade: rack }, bus]);
    expect(after.materials).toEqual(before.materials);
    expect(allItems(after).map((item) => item.id)).toEqual(['pistol', 'rack']);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'vehicle-upgrade-fitted',
      vehicle: 'pickup',
      label: 'Red pickup',
      item: rack,
    });
    expect(submitVehicleUpgradeFitted(after, 'rack', 'bus', AT).ok).toBe(false);
  });
});

describe('a Retrieve New Vehicles outcome, checked as any other', () => {
  const chosen = () =>
    accepted(
      submitMissionSelection(
        campaign({
          turn: 4,
          step: 'tactical-mission',
          survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
          assignments: { earl: { task: 'mission', team: 1 } },
        }),
        { team: 1, mission: 'retrieve-new-vehicles' },
        AT,
      ),
    );
  const outcome = (wounds: ReturnType<typeof woundsAsTheyStand>) => ({
    kind: 'retrieve-new-vehicles-resolved' as const,
    team: 1,
    vehiclesDrivenOff: 0,
    strangers: [],
    wounds,
  });

  it('adds nothing from an entry that names no vehicles', () => {
    const after = accepted(
      submitMissionOutcome(chosen(), outcome(woundsAsTheyStand(chosen(), 1)), AT),
    );

    expect(after.vehicles).toEqual([]);
  });

  it('still reads the team’s wounds', () => {
    expect(submitMissionOutcome(chosen(), outcome([]), AT).ok).toBe(false);
  });
});
