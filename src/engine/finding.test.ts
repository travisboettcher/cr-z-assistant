import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { submitHaul } from './advancementForms';
import { submitRareItemRolled } from './campaignForms';
import { rareItemFor, rareRollsDue, rareRollsProblem, withItemsFound } from './finding';
import { rareItemRolls, recovered } from './materials';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-14T09:00:00.000Z';

/** Turn 3 at Add Materials to Storage, with nobody on a mission and no base. */
function hauling(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'add-materials-to-storage',
    ...overrides,
  };
}

describe('the Rare Item Table (pg. 43)', () => {
  it('reads the subtable off the first d10 and the entry off the second', () => {
    // A boundary of each subtable, and each end of an entry list.
    expect(rareItemFor(1, 1).item).toBe('gas-grill');
    expect(rareItemFor(2, 10).item).toBe('car-roof-rack');
    expect(rareItemFor(3, 1).item).toBe('riot-shield');
    expect(rareItemFor(5, 10).item).toBe('grappling-hook');
    expect(rareItemFor(6, 1).item).toBe('fully-automatic-rifle');
    expect(rareItemFor(7, 10).item).toBe('repeating-crossbow');
    expect(rareItemFor(8, 1)).toEqual({ item: 'bladed', grade: 'quality', price: 7 });
    expect(rareItemFor(10, 10)).toEqual({ item: 'tool-belt', grade: 'quality', price: 6 });
  });
});

describe('the rolls a haul owes (pg. 19; R9, R49)', () => {
  it('recovers no material for a 10', () => {
    expect(recovered([{ roll: 10 }])).toEqual({ food: 0, fuel: 0, hardware: 0 });
    expect(rareItemRolls([{ roll: 10 }, { roll: 1 }])).toBe(1);
  });

  it('owes one per unforced 10, and one per Rare a save from before v17 held', () => {
    expect(rareRollsDue(hauling(), [{ roll: 10 }, { roll: 4 }, { roll: 10 }])).toBe(2);
    expect(rareRollsDue(hauling({ rareRollsOwed: 3 }), [{ roll: 10 }])).toBe(4);
    // A 10 forced to a material is that material (R9).
    expect(
      rareRollsDue(hauling(), [{ roll: 10, forced: { skill: 'utilities', material: 'fuel' } }]),
    ).toBe(0);
  });

  it('wants exactly one pair of dice for each, under ids nobody has', () => {
    const one = { id: 'a', subtable: 3, entry: 1 } as const;

    expect(rareRollsProblem(hauling(), [{ roll: 10 }], [one])).toBeNull();
    expect(rareRollsProblem(hauling(), [{ roll: 10 }], [])).toBe(
      'A 10 is a roll on the Rare Item Table: enter its two dice.',
    );
    expect(rareRollsProblem(hauling({ rareRollsOwed: 1 }), [{ roll: 10 }], [one])).toBe(
      '2 rolls on the Rare Item Table are owed: enter two dice for each.',
    );
    expect(rareRollsProblem(hauling(), [], [one])).toBe('No roll on the Rare Item Table is owed.');
    expect(rareRollsProblem(hauling({ rareRollsOwed: 1 }), [{ roll: 10 }], [one, { ...one }])).toBe(
      'An item already has that id.',
    );
    expect(
      rareRollsProblem(
        hauling({ inventory: [{ id: 'a', item: 'pistol', grade: 'standard' }] }),
        [{ roll: 10 }],
        [one],
      ),
    ).toBe('An item already has that id.');
  });
});

describe('what the rolls find', () => {
  it('goes into the Inventory, an entry each with both dice, and settles what was owed', () => {
    const found = withItemsFound(
      hauling({ rareRollsOwed: 1 }),
      [
        { id: 'a', subtable: 3, entry: 1 },
        { id: 'b', subtable: 9, entry: 4 },
      ],
      AT,
    );

    expect(found.inventory).toEqual([
      { id: 'a', item: 'riot-shield', grade: 'standard' },
      { id: 'b', item: 'pistol', grade: 'quality' },
    ]);
    expect(found.rareRollsOwed).toBe(0);
    expect(found.log.map((entry) => entry.event)).toEqual([
      {
        kind: 'item-found',
        id: 'a',
        item: 'riot-shield',
        grade: 'standard',
        subtable: 3,
        entry: 1,
      },
      { kind: 'item-found', id: 'b', item: 'pistol', grade: 'quality', subtable: 9, entry: 4 },
    ]);
  });

  it('is part of the haul, after the materials, and the haul is refused without it', () => {
    const result = submitHaul(
      hauling(),
      { rolls: [{ roll: 10 }, { roll: 4 }], rareItems: [{ id: 'a', subtable: 3, entry: 1 }] },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.materials).toEqual({ food: 1, fuel: 0, hardware: 0 });
    expect(result.campaign.log.map((entry) => entry.event.kind)).toEqual([
      'materials-added',
      'item-found',
    ]);
    expect(submitHaul(hauling(), { rolls: [{ roll: 10 }] }, AT)).toEqual({
      ok: false,
      problem: 'A 10 is a roll on the Rare Item Table: enter its two dice.',
    });
  });

  it('can be rolled by hand, for a reward that rolls on the table', () => {
    const result = submitRareItemRolled(hauling(), { id: 'a', subtable: 6, entry: 7 }, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.inventory).toEqual([{ id: 'a', item: 'bayonet', grade: 'standard' }]);
    // A roll by hand settles nothing a haul owes.
    expect(
      submitRareItemRolled(hauling({ rareRollsOwed: 2 }), { id: 'a', subtable: 6, entry: 7 }, AT),
    ).toMatchObject({ ok: true, campaign: { rareRollsOwed: 2 } });
    // Another item's id is no bar.
    expect(submitRareItemRolled(result.campaign, { id: 'b', subtable: 6, entry: 7 }, AT).ok).toBe(
      true,
    );
    expect(submitRareItemRolled(result.campaign, { id: 'a', subtable: 6, entry: 7 }, AT)).toEqual({
      ok: false,
      problem: 'An item already has that id.',
    });
  });
});
