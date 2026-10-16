import { describe, expect, it } from 'vitest';
import type { ItemId } from '../data/equipment';
import { generatingUtilities, withPlanningBegun } from '../test/campaigns';
import { submitRareUpgradeInstalled } from './advancementForms';
import { occupantAt, siegeThreatFromBase, upgradesRemaining, type Occupant } from './base';
import { createNewCampaign, type Base, type Campaign, type Item } from './campaign';
import { allItems } from './equipment';
import { unrest, unrestFromBase } from './feeding';
import { installProblem, installTargets } from './install';
import { baseProduction } from './materials';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-14T09:00:00.000Z';

const item = (id: string, kind: ItemId): Item => ({ id, item: kind, grade: 'standard' });

/** The Hobby Farm at Add Facilities and Upgrades: a Kitchen, two Bunk Rooms, a Storage Area. */
function installing(inventory: readonly Item[], slots: Base['slots'] = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'add-facilities-and-upgrades',
    base: { id: 'hobby-farm', slots },
    inventory,
  };
}

function installed(campaign: Campaign, id: string, slot: string): Campaign {
  const result = submitRareUpgradeInstalled(campaign, id, slot, AT);
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('where a rare upgrade goes (pg. 49; R47)', () => {
  it('offers the standing facilities of the kind it names', () => {
    const campaign = installing([item('g', 'gas-grill'), item('b', 'sleeping-bags')]);

    expect(installTargets(campaign, item('g', 'gas-grill')).map((one) => one.slotId)).toEqual([
      'kitchen',
    ]);
    expect(installTargets(campaign, item('b', 'sleeping-bags')).map((one) => one.slotId)).toEqual([
      'bunk-room-1',
      'bunk-room-2',
    ]);
    // The farm's own Garden, and no facility at all for a vehicle upgrade.
    expect(installTargets(campaign, item('f', 'fertilizer')).map((one) => one.slotId)).toEqual([
      'garden',
    ]);
    expect(installTargets(campaign, item('r', 'car-roof-rack'))).toEqual([]);
  });

  it('is refused away from Add Facilities and Upgrades, and for anything else', () => {
    const campaign = installing([item('g', 'gas-grill'), item('p', 'pistol')]);

    expect(installProblem({ ...campaign, step: 'heal-wounds' }, 'g', 'kitchen')).toBe(
      'Install rare upgrades at Add Facilities and Upgrades.',
    );
    expect(installProblem(campaign, 'nothing', 'kitchen')).toBe(
      'Only an item in the base’s Inventory can be installed.',
    );
    expect(installProblem(campaign, 'p', 'kitchen')).toBe(
      'Only a rare base upgrade is installed in a facility.',
    );
    expect(installProblem(campaign, 'g', 'bunk-room-1')).toBe(
      'Install it in a standing facility of the kind it names.',
    );
    expect(installProblem(campaign, 'g', 'kitchen')).toBeNull();
    expect(submitRareUpgradeInstalled(campaign, 'g', 'bunk-room-1', AT)).toEqual({
      ok: false,
      problem: 'Install it in a standing facility of the kind it names.',
    });
  });

  it('may go in any of the facilities of its kind', () => {
    const campaign = installing([item('b', 'sleeping-bags')]);

    expect(installProblem(campaign, 'b', 'bunk-room-2')).toBeNull();
  });
});

describe('a rare upgrade installed', () => {
  it('leaves the Inventory, stands on the facility, and is written down', () => {
    const after = installed(
      installing([item('g', 'gas-grill'), item('p', 'pistol')]),
      'g',
      'kitchen',
    );

    expect(after.inventory).toEqual([item('p', 'pistol')]);
    expect(after.base?.slots.kitchen?.installed).toEqual([item('g', 'gas-grill')]);
    expect(allItems(after).map((one) => one.id)).toEqual(['p', 'g']);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'rare-upgrade-installed',
      id: 'g',
      item: 'gas-grill',
      grade: 'standard',
      slot: 'kitchen',
    });
  });

  /** The acceptance: a gas grill is the Kitchen's Gas Range, and the cap is untouched. */
  it('counts as its upgrade, outside the cap of three', () => {
    const after = installed(installing([item('g', 'gas-grill')]), 'g', 'kitchen');
    const kitchen = occupantAt(after, 'kitchen');

    expect(kitchen?.upgrades.map((upgrade) => [upgrade.id, upgrade.rare])).toEqual([
      ['gas-range', true],
    ]);
    expect(upgradesRemaining(kitchen as NonNullable<typeof kitchen>)).toBe(3);
    // A Gas Range makes a Food (pg. 72).
    expect(baseProduction(after).food).toBe(baseProduction(installing([])).food + 1);
  });

  it('works without the Power its upgrade needs, for the battery spotlight', () => {
    const tower: Base['slots'] = {
      'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } },
    };
    const after = installed(installing([item('s', 'battery-spotlight')], tower), 's', 'front-yard');
    const base = after.base as Base;

    // The Spotlight takes one off Siege Threat (pg. 73), with no Power there.
    const standing = (campaign: Campaign): Occupant[] => [
      { ...(occupantAt(campaign, 'front-yard') as Occupant), power: false, water: false },
    ];

    expect(standing(after)[0]?.upgrades.map((upgrade) => upgrade.rare)).toEqual([true]);
    expect(siegeThreatFromBase(base, standing(after))).toBe(
      siegeThreatFromBase(base, standing(installing([], tower))) - 1,
    );
  });

  it('keeps the Power its upgrade needs for anything else', () => {
    const bunks: Base['slots'] = {
      'bunk-room-1': { installed: [item('c', 'video-game-console')] },
    };

    expect(occupantAt(installing([], bunks), 'bunk-room-1')?.upgrades[0]?.requires).toEqual({
      utilities: ['power'],
    });
  });

  it('stands as nothing in a facility of another kind, or when it is no upgrade at all', () => {
    // Only a hand-edited save could put them there: the form refuses both.
    const misplaced = installing([], {
      kitchen: { installed: [item('b', 'sleeping-bags'), item('p', 'pistol')] },
    });

    expect(occupantAt(misplaced, 'kitchen')?.upgrades).toEqual([]);
  });

  it('is an item the campaign holds only where one is installed', () => {
    const built: Base['slots'] = {
      garage: { built: { facility: 'workshop', builtOnTurn: 1 } },
    };

    expect(allItems(installing([item('p', 'pistol')], built))).toEqual([item('p', 'pistol')]);
  });
});

describe('the video game console (pg. 49)', () => {
  /** Ten survivors and two Bunk Rooms' four beds: six Exhaustion. */
  const crowded = (slots: Base['slots']): Campaign =>
    generatingUtilities(
      withPlanningBegun({
        ...installing([], slots),
        survivors: Array.from({ length: 10 }, (_, at) =>
          createSurvivor(`S${String(at)}`, 1, { id: `s${String(at)}` }),
        ),
      }),
      4,
    );
  const console_ = { installed: [item('c', 'video-game-console')] };

  it('takes three off Unrest while it has Power, and adds one to Siege Threat', () => {
    const powered = crowded({ 'bunk-room-1': { ...console_, power: true } });

    expect(unrestFromBase(powered)).toBe(-3);
    expect(unrest(powered)).toBe(unrest(crowded({})) - 3);
  });

  it('does nothing without Power', () => {
    expect(unrestFromBase(crowded({ 'bunk-room-1': console_ }))).toBe(0);
  });

  it('never takes Unrest below zero', () => {
    const calm = generatingUtilities(
      withPlanningBegun(installing([], { 'bunk-room-1': { ...console_, power: true } })),
      4,
    );

    expect(unrestFromBase(calm)).toBe(-3);
    expect(unrest(calm)).toBe(0);
  });
});
