import { describe, expect, it } from 'vitest';
import { storageCaps } from './base';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { generatingUtilities } from '../test/campaigns';
import {
  assignedCount,
  checkUtility,
  shortfall,
  staffedSpent,
  withUtilityToggled,
} from './utilities';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function campaignWith(base: Base | null, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    materials: { food: 0, fuel: 0, hardware: 20, rare: 0 },
    turn: 4,
    base,
    ...overrides,
  };
}

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

/**
 * A campaign whose staffed Utility Station generates this Score.
 *
 * The Station goes into `front-yard`, which none of these tests uses for
 * anything else, so arranging the pool cannot disturb the slot under test.
 */
const generating = (campaign: Campaign, score: number) => generatingUtilities(campaign, score);

const home = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

/** The Distillery generates a flat 2 Water from its built-in Utility Station. */
const distillery = (slots: Base['slots'] = {}): Base => ({ id: 'distillery', slots });

describe('assignedCount and shortfall', () => {
  it('counts the slots holding each utility, separately', () => {
    const base = home({
      kitchen: { power: true },
      'bunk-room-1': { power: true, water: true },
    });

    // Two Power and one Water: a count that added them would say three of each.
    expect(assignedCount(base, 'power')).toBe(2);
    expect(assignedCount(base, 'water')).toBe(1);
  });

  it('is nothing short while flat generation covers the assignments', () => {
    // The Distillery makes 2 Water flat, so two watered slots cost no staff.
    const base = distillery({ 'tasting-room': { water: true }, 'break-room': { water: true } });

    expect(shortfall(base, 'water')).toBe(0);
    expect(staffedSpent(base)).toBe(0);
  });

  it('charges the staffed Score only for what flat generation does not cover', () => {
    const base = distillery({
      'tasting-room': { water: true },
      'break-room': { water: true },
      'loading-dock': { water: true },
      rooftop: { power: true },
    });

    // Three Water against two flat is one short; Power has no flat generation
    // here at all, so its single assignment is a second.
    expect(shortfall(base, 'water')).toBe(1);
    expect(shortfall(base, 'power')).toBe(1);
    expect(staffedSpent(base)).toBe(2);
  });
});

describe('checkUtility', () => {
  it('allows a point onto a facility that wants it, within the Score', () => {
    const base = home({
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['refrigeration'] },
    });

    expect(
      checkUtility(generating(campaignWith(base), 1), { slot: 'garage', utility: 'power' }),
    ).toEqual({ blockers: [], warnings: [] });
  });

  it.each([
    ['a campaign with no base', campaignWith(null), 'kitchen', 'no-base'],
    [
      'a slot this base does not have',
      generating(campaignWith(home()), 9),
      'wine-cellar',
      'no-such-slot',
    ],
    ['an empty slot', generating(campaignWith(home()), 9), 'garage', 'nothing-to-supply'],
  ])('refuses %s', (_label, campaign, slot, expected) => {
    const check = checkUtility(campaign, { slot, utility: 'power' });

    expect(codes(check.blockers)).toEqual([expected]);
    expect(check.warnings).toEqual([]);
  });

  it('refuses a point the base cannot generate, and says how short it is', () => {
    const base = home({ kitchen: { power: true }, 'bunk-room-1': { power: true } });

    // Two assigned already, no flat generation, and a Score of 2 covers them.
    // A third needs one more than exists.
    const check = checkUtility(generating(campaignWith(base), 2), {
      slot: 'bunk-room-2',
      utility: 'power',
    });

    expect(codes(check.blockers)).toEqual(['pool-exhausted']);
    expect(check.blockers[0]?.message).toContain('1 more');
  });

  it('lets the two pools share one staffed Score', () => {
    // One Power and one Water, against a Score of 2 and no flat generation: the
    // Score covers either, which is what "in any mix" means.
    const base = home({ kitchen: { power: true } });

    expect(
      checkUtility(generating(campaignWith(base), 2), { slot: 'bunk-room-1', utility: 'water' })
        .blockers,
    ).toEqual([]);
    expect(
      codes(
        checkUtility(generating(campaignWith(base), 1), { slot: 'bunk-room-1', utility: 'water' })
          .blockers,
      ),
    ).toEqual(['pool-exhausted']);
  });

  it('spends nothing from the Score while flat generation covers the pool', () => {
    // The Distillery's built-in 2 Water is Water and cannot become Power, so a
    // watered slot is free and a powered one is not.
    const campaign = campaignWith(distillery());

    expect(checkUtility(campaign, { slot: 'utility-station', utility: 'water' }).blockers).toEqual(
      [],
    );
    expect(
      codes(checkUtility(campaign, { slot: 'utility-station', utility: 'power' }).blockers),
    ).toEqual(['pool-exhausted']);
  });

  it('warns when nothing in the slot would use the point', () => {
    // A Bunk Room needs neither utility. Legal, and pointless, so it is a
    // warning rather than a refusal.
    const check = checkUtility(generating(campaignWith(home()), 9), {
      slot: 'bunk-room-1',
      utility: 'power',
    });

    expect(check.blockers).toEqual([]);
    expect(codes(check.warnings)).toEqual(['not-needed']);
  });

  it('counts an upgrade’s need as the facility’s, because one point covers both', () => {
    // A Storage Area wants nothing; its Refrigeration wants Power. The point
    // goes on the slot, so the upgrade's need is what makes it useful.
    const bare = home({ garage: { built: { facility: 'storage-area', builtOnTurn: 1 } } });
    const upgraded = home({
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['refrigeration'] },
    });

    expect(
      codes(
        checkUtility(generating(campaignWith(bare), 9), { slot: 'garage', utility: 'power' })
          .warnings,
      ),
    ).toEqual(['not-needed']);
    expect(
      checkUtility(generating(campaignWith(upgraded), 9), { slot: 'garage', utility: 'power' })
        .warnings,
    ).toEqual([]);
  });
});

describe('withUtilityToggled', () => {
  it('puts a point on and takes it off again', () => {
    const campaign = generating(campaignWith(home({ kitchen: {} })), 1);

    const on = withUtilityToggled(campaign, { slot: 'kitchen', utility: 'water' });
    expect(on.base?.slots.kitchen?.water).toBe(true);

    const off = withUtilityToggled(on, { slot: 'kitchen', utility: 'water' });
    // Removed rather than set false: absent and false are one state, and the
    // persisted shape only has one spelling for it.
    expect(off.base?.slots.kitchen).toEqual({});
  });

  it('costs one point for a facility and all of its upgrades', () => {
    const base = home({
      garage: {
        built: { facility: 'workshop', builtOnTurn: 1 },
        upgrades: ['metal-shop', 'gunsmith'],
      },
    });

    const after = withUtilityToggled(generating(campaignWith(base), 1), {
      slot: 'garage',
      utility: 'power',
    });

    // Three things in the slot, one point of Power.
    expect(staffedSpent(after.base as Base)).toBe(1);
    expect(assignedCount(after.base as Base, 'power')).toBe(1);
  });

  it('keeps what else the slot recorded', () => {
    const base = home({ kitchen: { upgrades: ['gas-range'] } });

    const after = withUtilityToggled(generating(campaignWith(base), 1), {
      slot: 'kitchen',
      utility: 'water',
    });

    expect(after.base?.slots.kitchen).toEqual({ upgrades: ['gas-range'], water: true });
  });

  it('refuses a point it cannot generate, and changes nothing', () => {
    // A Station with somebody useless in it: staffed, and generating nothing.
    const campaign = generating(campaignWith(home({ kitchen: {} })), 0);

    expect(withUtilityToggled(campaign, { slot: 'kitchen', utility: 'water' })).toBe(campaign);
  });

  it('always lets a point go back, even from a base that is over-assigned', () => {
    // A save from a house-ruled campaign can arrive like this, and refusing to
    // give a point back would strand it there.
    const over = campaignWith(home({ kitchen: { water: true }, 'bunk-room-1': { water: true } }));

    const after = withUtilityToggled(over, { slot: 'kitchen', utility: 'water' });

    expect(after.base?.slots.kitchen?.water).toBeUndefined();
  });

  it('does nothing to a campaign with no base', () => {
    const none = campaignWith(null);

    expect(withUtilityToggled(none, { slot: 'kitchen', utility: 'power' })).toBe(none);
  });
});

describe('what a supplied utility switches on', () => {
  it('turns a Refrigeration’s storage on and off with its Power', () => {
    // The effect side is `base.ts`'s, and this is the seam: the toggle is the
    // only thing between an upgrade that works and one that does not.
    const base = home({
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['refrigeration'] },
    });
    const campaign = generating(campaignWith(base), 1);

    expect(storageCaps(base).food).toBe(6);

    const powered = withUtilityToggled(campaign, { slot: 'garage', utility: 'power' });

    expect(storageCaps(powered.base as Base).food).toBe(8);
  });
});
