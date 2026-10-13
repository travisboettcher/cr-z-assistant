import { describe, expect, it } from 'vitest';
import type { Grade, ItemId } from '../data/equipment';
import { createNewCampaign, type Campaign, type Item, type Survivor } from './campaign';
import {
  allItems,
  bestItemFor,
  commonSkillScore,
  holdsShoddyFree,
  itemCap,
  itemInventorySlots,
  itemTerm,
  itemsAddingTo,
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

/**
 * The third term of a Skill Score (pp. 8, 14; R39, R40; Z5-3). `survivor.test`
 * checks Earl's printed number; these check the term on its own.
 */
describe('the Item term', () => {
  it('is the shoddy −1 for a weapon skill or Tinker when nothing better is carried', () => {
    for (const skill of [
      'handguns',
      'long-guns',
      'archery',
      'blunt-weapon',
      'blade-weapon',
      'heavy-weapon',
      'tinker',
    ] as const) {
      expect(holdsShoddyFree(skill), skill).toBe(true);
      expect(itemTerm(carrying(), skill), skill).toBe(-1);
    }
  });

  it('is nothing for a skill no free item is used with', () => {
    expect(holdsShoddyFree('scavenge')).toBe(false);
    expect(holdsShoddyFree('traps')).toBe(false);
    expect(itemTerm(carrying(), 'scavenge')).toBe(0);
    expect(itemTerm(carrying(), 'stealth')).toBe(0);
  });

  it('is the grade of the best item carried for the skill, once', () => {
    const shoddy = item('pistol', 'shoddy');
    const standard = item('revolver');
    const quality = item('pistol', 'quality');

    expect(itemTerm(carrying(shoddy), 'handguns')).toBe(-1);
    expect(itemTerm(carrying(standard), 'handguns')).toBe(0);
    expect(itemTerm(carrying(quality), 'handguns')).toBe(1);
    expect(itemTerm(carrying(shoddy, quality, standard), 'handguns')).toBe(1);
    expect(bestItemFor(carrying(shoddy, quality, standard), 'handguns')).toBe(quality);
    expect(bestItemFor(carrying(standard, shoddy), 'handguns')).toBe(standard);
    // Of two equally good, the first carried, so the sheet's name holds still.
    expect(bestItemFor(carrying(standard, item('pistol')), 'handguns')).toBe(standard);
    expect(bestItemFor(carrying(quality), 'long-guns')).toBeUndefined();
  });

  it('adds a quality-only item’s one +1 to the Score it names (R39)', () => {
    expect(itemTerm(carrying(item('binoculars', 'quality')), 'scout')).toBe(1);
    expect(itemTerm(carrying(item('backpack', 'quality')), 'carry')).toBe(1);
  });

  it('stacks bonuses from different items, but not from two of one (R40)', () => {
    const binoculars = item('binoculars', 'quality');
    const goggles = item('night-vision-goggles');

    expect(itemTerm(carrying(binoculars, goggles), 'scout')).toBe(2);
    expect(itemTerm(carrying(binoculars, item('binoculars', 'quality')), 'scout')).toBe(1);
    expect(itemsAddingTo(carrying(binoculars, goggles), 'scout')).toEqual([binoculars, goggles]);
    expect(itemsAddingTo(carrying(binoculars), 'tactics')).toEqual([]);
    // The first of two alike is the one named.
    const [named] = itemsAddingTo(carrying(binoculars, item('binoculars', 'quality')), 'scout');
    expect(named).toBe(binoculars);
  });

  it('takes the best item for the skill across kinds, a tool belt beside a flamethrower', () => {
    const belt = item('tool-belt', 'quality');

    expect(itemTerm(carrying(belt, item('flamethrower')), 'tinker')).toBe(1);
    expect(bestItemFor(carrying(item('flamethrower'), belt), 'tinker')).toBe(belt);
  });
});

describe('itemCap (pg. 44)', () => {
  it('caps Stealth while a tool belt is carried, whatever its grade', () => {
    expect(itemCap(carrying(), 'stealth')).toBeUndefined();
    expect(itemCap(carrying(item('tool-belt')), 'stealth')).toBe(3);
    expect(itemCap(carrying(item('tool-belt', 'quality')), 'stealth')).toBe(3);
    expect(itemCap(carrying(item('tool-belt')), 'tinker')).toBeUndefined();
    expect(itemCap(carrying(item('pistol'), item('tool-belt')), 'stealth')).toBe(3);
  });
});

describe('Move and Defense as worn (pp. 9, 45, 51)', () => {
  it('are the Scores bought when nothing is worn', () => {
    expect(commonSkillScore(carrying(), 'move')).toBe(6);
    expect(commonSkillScore(carrying(), 'defense')).toBe(6);
  });

  it('take reinforced clothing’s Defense, and its Move cost only at standard', () => {
    const standard = carrying(item('reinforced-clothing'));
    const quality = carrying(item('reinforced-clothing', 'quality'));

    expect(commonSkillScore(standard, 'defense')).toBe(7);
    expect(commonSkillScore(standard, 'move')).toBe(5);
    expect(commonSkillScore(quality, 'defense')).toBe(7);
    expect(commonSkillScore(quality, 'move')).toBe(6);
  });

  it('count one set of each protective item, the best one worn (R40)', () => {
    const standard = item('reinforced-clothing');
    const quality = item('reinforced-clothing', 'quality');

    // In either order: the quality set, which costs no Move.
    for (const worn of [carrying(standard, quality), carrying(quality, standard)]) {
      expect(commonSkillScore(worn, 'defense')).toBe(7);
      expect(commonSkillScore(worn, 'move')).toBe(6);
    }
  });

  it('stack different protective items', () => {
    const worn = carrying(item('reinforced-clothing'), item('tactical-armor'));

    expect(commonSkillScore(worn, 'defense')).toBe(8);
  });

  it('never go below zero', () => {
    const slow = { ...carrying(item('reinforced-clothing')), move: 0 };

    expect(commonSkillScore(slow, 'move')).toBe(0);
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
