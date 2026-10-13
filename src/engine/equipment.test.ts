import { describe, expect, it } from 'vitest';
import type { Grade, ItemId } from '../data/equipment';
import { createNewCampaign, type Campaign, type Item, type Survivor } from './campaign';
import {
  allItems,
  itemInventorySlots,
  newItemProblem,
  removalProblem,
  slotsInUse,
} from './equipment';
import { createSurvivor, inventorySlots } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

let next = 0;
const item = (id: ItemId, grade: Grade = 'standard'): Item => {
  next += 1;
  return { id: `item-${String(next)}`, item: id, grade };
};

const carrying = (...items: readonly Item[]): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  items,
});

describe('slotsInUse (pp. 14, 38, 44)', () => {
  it('counts a slot a weapon, two the breaching tool, and none what is worn', () => {
    expect(slotsInUse(carrying())).toBe(0);
    expect(slotsInUse(carrying(item('pistol'), item('heavy', 'shoddy')))).toBe(2);
    expect(slotsInUse(carrying(item('breaching-tool', 'quality')))).toBe(2);
    expect(
      slotsInUse(
        carrying(item('reinforced-clothing'), item('tool-belt'), item('backpack', 'quality')),
      ),
    ).toBe(0);
  });

  it('carries one pistol or revolver free in a tactical holster, and only one (pg. 51)', () => {
    expect(slotsInUse(carrying(item('tactical-holster'), item('pistol')))).toBe(0);
    expect(slotsInUse(carrying(item('tactical-holster'), item('revolver')))).toBe(0);
    expect(slotsInUse(carrying(item('tactical-holster'), item('revolver'), item('pistol')))).toBe(
      1,
    );
    expect(slotsInUse(carrying(item('tactical-holster'), item('rifle')))).toBe(1);
    expect(
      slotsInUse(
        carrying(
          item('tactical-holster'),
          item('tactical-holster'),
          item('pistol'),
          item('pistol'),
        ),
      ),
    ).toBe(0);
  });

  it('counts an item the book gives no slots as none, until one can be carried', () => {
    expect(slotsInUse(carrying(item('quick-quiver')))).toBe(0);
  });
});

describe('what carried items add to Inventory Slots (pg. 51)', () => {
  it('adds the ultralight backpack’s two and tactical armor’s one', () => {
    expect(itemInventorySlots(carrying(item('ultralight-backpack')))).toBe(2);
    expect(itemInventorySlots(carrying(item('ultralight-backpack'), item('tactical-armor')))).toBe(
      3,
    );
    expect(itemInventorySlots(carrying(item('pistol')))).toBe(0);
  });

  it('reaches the survivor’s Inventory Slots', () => {
    // A Tier 2 survivor with no Carry: two slots, and two more for the pack.
    expect(inventorySlots(carrying(), 0)).toBe(2);
    expect(inventorySlots(carrying(item('ultralight-backpack')), 0)).toBe(4);
  });
});

describe('adding an item to the Inventory by hand (Z5-2)', () => {
  const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    ...overrides,
  });

  it('takes an item in a grade it comes in', () => {
    expect(newItemProblem(campaign(), { id: 'new', item: 'pistol', grade: 'quality' })).toBeNull();
  });

  it('refuses shoddy gear, which nobody owns (R35)', () => {
    expect(newItemProblem(campaign(), { id: 'new', item: 'pistol', grade: 'shoddy' })).toMatch(
      /R35/,
    );
  });

  it('refuses a grade the item does not come in, an unknown item or grade', () => {
    expect(newItemProblem(campaign(), { id: 'new', item: 'backpack', grade: 'standard' })).toMatch(
      /does not come in/,
    );
    expect(
      newItemProblem(campaign(), { id: 'new', item: 'toString' as ItemId, grade: 'standard' }),
    ).toMatch(/no such item/);
    expect(
      newItemProblem(campaign(), { id: 'new', item: 'pistol', grade: 'gold' as Grade }),
    ).toMatch(/no such grade/);
  });

  it('refuses another origin’s item, and takes the campaign’s own (pg. 37)', () => {
    const flamethrower = { id: 'new', item: 'flamethrower', grade: 'standard' } as const;

    expect(newItemProblem(campaign(), flamethrower)).toMatch(/another Origin/);
    expect(newItemProblem(campaign({ origin: 'viral' }), flamethrower)).toMatch(/another Origin/);
    expect(newItemProblem(campaign({ origin: 'cosmic-horror' }), flamethrower)).toBeNull();
    // An item of no origin is every campaign's.
    expect(
      newItemProblem(campaign({ origin: 'viral' }), {
        id: 'new',
        item: 'pistol',
        grade: 'standard',
      }),
    ).toBeNull();
  });

  it('refuses an id that anything already holds, wherever it is', () => {
    const held = item('pistol');
    const everywhere = [
      campaign({ inventory: [held] }),
      campaign({ survivors: [carrying(held)] }),
      campaign({ setAside: [carrying(held)] }),
    ];

    // A fresh id is taken whatever else is held.
    expect(
      newItemProblem(campaign({ inventory: [held] }), {
        id: 'fresh',
        item: 'rifle',
        grade: 'standard',
      }),
    ).toBeNull();

    for (const each of everywhere) {
      expect(newItemProblem(each, { id: held.id, item: 'rifle', grade: 'standard' })).toMatch(
        /already has that id/,
      );
    }
  });

  it('takes out only what is in the base’s Inventory', () => {
    const stored = item('pistol');
    const carried = item('rifle');
    const both = campaign({ inventory: [stored], survivors: [carrying(carried)] });

    expect(removalProblem(both, stored.id)).toBeNull();
    expect(removalProblem(both, carried.id)).toMatch(/Only an item in the base/);
    expect(allItems(both)).toEqual([stored, carried]);
  });
});
