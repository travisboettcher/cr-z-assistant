import { describe, expect, it } from 'vitest';
import { storageCaps } from './base';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { createSurvivor } from './survivor';
import type { FacilityId, Utility } from '../data/facilities';
import { generatingUtilities } from '../test/campaigns';
import {
  assignedCount,
  checkUtility,
  communityUtilities,
  suppliedOccupants,
  suppliesEveryFacility,
  shortfall,
  staffedSpent,
  utilityCapacity,
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

/**
 * The base sheet's denominator. It printed flat generation alone, so a point a
 * staffed Station was generating read as `Power assigned 1 / 0 flat` — an
 * over-assignment reported about a legal assignment, with the Station right
 * there on the same screen.
 */
describe('utilityCapacity', () => {
  it('is nothing without a base', () => {
    expect(utilityCapacity(campaignWith(null), 'power')).toBe(0);
  });

  it('is the flat generation when nobody is working a Station', () => {
    // The Distillery makes 2 Water flat and no Power at all.
    expect(utilityCapacity(campaignWith(distillery()), 'water')).toBe(2);
    expect(utilityCapacity(campaignWith(distillery()), 'power')).toBe(0);
  });

  it('counts the staffed Score, which is the half the old denominator dropped', () => {
    const staffed = generating(campaignWith(home()), 2);

    expect(utilityCapacity(staffed, 'power')).toBe(2);
    expect(utilityCapacity(staffed, 'water')).toBe(2);
  });

  /**
   * The two pools share the staffed half and only the staffed half: flat Power
   * cannot become Water, but a staffed point can be either — so spending one
   * on Water is what takes it away from Power.
   */
  it('takes what the other pool is already spending off the shared Score', () => {
    const watered = generating(campaignWith(home({ kitchen: { water: true } })), 2);

    expect(utilityCapacity(watered, 'water')).toBe(2);
    expect(utilityCapacity(watered, 'power')).toBe(1);
  });

  it('does not let the other pool take flat generation with it', () => {
    // Two Water assigned against the Distillery's two flat: the staffed Score
    // is untouched, so Power still has all of it.
    // Staffed into the Distillery's own built-in Station, because `generating`
    // puts one in the front yard and the Distillery has no such slot.
    const flatlyWatered = generatingUtilities(
      campaignWith(distillery({ 'tasting-room': { water: true }, 'break-room': { water: true } })),
      2,
      'utility-station',
    );

    expect(utilityCapacity(flatlyWatered, 'power')).toBe(2);
  });

  it('never goes below nothing, whatever a save holds', () => {
    const overspent = campaignWith(
      home({ kitchen: { water: true }, 'bunk-room-1': { water: true } }),
    );

    expect(utilityCapacity(overspent, 'power')).toBe(0);
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

    expect(storageCaps(base, suppliedOccupants(campaign)).food).toBe(6);

    const powered = withUtilityToggled(campaign, { slot: 'garage', utility: 'power' });

    expect(storageCaps(powered.base as Base, suppliedOccupants(powered)).food).toBe(8);
  });

  /**
   * Playtest finding M11: the point outlived the survivor generating it. The
   * Greasy Spoon's Food cap held at 8 on the strength of a Refrigeration
   * powered by nobody, with the score panel reading `1 / 0` and no warning.
   *
   * Assignment is a player decision that persists on the slot; generation is
   * not, and the two come apart the moment the Station empties.
   */
  it('stops applying once the survivor generating the point stops staffing', () => {
    const base = home({
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['refrigeration'] },
    });
    const powered = withUtilityToggled(generating(campaignWith(base), 1), {
      slot: 'garage',
      utility: 'power',
    });

    expect(storageCaps(powered.base as Base, suppliedOccupants(powered)).food).toBe(8);

    // The point is still assigned — the slot still carries the flag — and it is
    // no longer backed by anything.
    const abandoned: Campaign = { ...powered, assignments: {} };

    expect(abandoned.base?.slots.garage?.power).toBe(true);
    expect(storageCaps(abandoned.base as Base, suppliedOccupants(abandoned)).food).toBe(6);
  });
});

/**
 * Three ways a facility can want a utility, and `checkUtility` read one.
 *
 * Playtest finding M15: the Kitchen's Water toggle carried "Nothing here uses
 * it, so the point would do no work" three lines above the same screen saying
 * "halved for want of a utility", and the Garden's said the same where Water
 * takes it from 1 Food to 3.
 */
describe('what counts as wanting a utility', () => {
  const withFacility = (facility: FacilityId, slot = 'garage'): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    base: { id: 'small-town-home', slots: { [slot]: { built: { facility, builtOnTurn: 1 } } } },
  });

  const notNeeded = (campaign: Campaign, utility: Utility, slot = 'garage') =>
    checkUtility(campaign, { slot, utility }).warnings.some(
      (warning) => warning.code === 'not-needed',
    );

  /** The Storage Area's Refrigeration *requires* Power — the case that worked. */
  it('says nothing for a facility whose upgrade requires it', () => {
    const fridge: Campaign = {
      ...createNewCampaign('Cedar Hollow', FIXED),
      base: {
        id: 'small-town-home',
        slots: {
          garage: {
            built: { facility: 'storage-area', builtOnTurn: 1 },
            upgrades: ['refrigeration'],
          },
        },
      },
    };

    expect(notNeeded(fridge, 'power')).toBe(false);
  });

  /** The Kitchen is halved without Water — less, not nothing. */
  it('says nothing for a facility whose output is halved without it', () => {
    expect(notNeeded(withFacility('kitchen'), 'water')).toBe(false);
  });

  /** The Garden makes 1 Food, or 3 with Water. */
  it('says nothing for a facility that produces more with it', () => {
    expect(notNeeded(withFacility('garden', 'front-yard'), 'water', 'front-yard')).toBe(false);
  });

  /** And still warns where the point genuinely changes nothing. */
  it('still warns where nothing in the slot reads the utility', () => {
    expect(notNeeded(withFacility('kitchen'), 'power')).toBe(true);
  });
});

/**
 * The Hydroelectric Dam's two Phase 3 specials, which nothing read.
 *
 * Of the seven base specials, only `curtain-wall` and `white-noise` had
 * consumers; `bases.ts` said so in its own comment and Phase 3 did not add the
 * rest. Two of the missing ones are Phase 3's own rules, so choosing the Dam
 * gave a player strictly less than the book says.
 */
describe('the Hydroelectric Dam', () => {
  const dam = (survivors: readonly Survivor[] = []): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors,
    base: { id: 'hydroelectric-dam', slots: {} },
  });

  /** A Tier 4's Cooperation is 1, so Utilities at level `n` is a Score of 1 + n. */
  const engineer = (level: number, id: string): Survivor => ({
    ...createSurvivor('Sam Reyes', 4, { id }),
    skills: { utilities: level },
  });

  describe('dam-utilities', () => {
    it('supplies every facility once the community reaches the threshold', () => {
      // Two engineers at Score 4 apiece: a combined 8, over the 6 it asks for.
      const supplied = dam([engineer(3, 'one'), engineer(3, 'two')]);

      expect(communityUtilities(supplied)).toBe(8);
      expect(suppliesEveryFacility(supplied)).toBe(true);
      expect(
        suppliedOccupants(supplied).every((occupant) => occupant.power && occupant.water),
      ).toBe(true);
    });

    it('supplies nothing below the threshold', () => {
      const short = dam([engineer(3, 'one')]);

      expect(communityUtilities(short)).toBe(4);
      expect(suppliesEveryFacility(short)).toBe(false);
      expect(suppliedOccupants(short).some((occupant) => occupant.power)).toBe(false);
    });

    /**
     * It counts the whole community, not just whoever staffs a Station — which
     * is the distinction that makes it reachable at all. The Dam ships no
     * Utility Station slot and no flat generation, so nothing else could ever
     * power anything there.
     */
    it('counts survivors who are staffing nothing', () => {
      const idle = dam([engineer(3, 'one'), engineer(3, 'two')]);

      expect(idle.assignments).toEqual({});
      expect(suppliesEveryFacility(idle)).toBe(true);
    });

    it('is not a rule any other base has', () => {
      const home: Campaign = {
        ...dam([engineer(3, 'one'), engineer(3, 'two')]),
        base: { id: 'small-town-home', slots: {} },
      };

      expect(suppliesEveryFacility(home)).toBe(false);
    });
  });
});
