import { describe, expect, it } from 'vitest';
import type { BaseId } from '../data/bases';
import type { Grade, ItemId } from '../data/equipment';
import { generatingUtilities, projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { submitItemBuilt } from './campaignForms';
import {
  buildableItems,
  buildCheck,
  buildCost,
  buildGrades,
  ENCHANTABLE,
  type BuildOrder,
} from './making';
import { laborAvailable, laborCommitted, laborShortfall } from './projects';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-14T09:00:00.000Z';

/** A Workshop built in the Small Town Home's garage, and whatever else is asked. */
const workshop = (upgrades: Base['slots'][string]['upgrades'] = []): Base => ({
  id: 'small-town-home',
  slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 }, upgrades } },
});

/** Turn 3 at Assign Project Team, with a project team worth `labor` and this Hardware. */
function planning(base: Base | null, labor = 4, hardware = 9): Campaign {
  const team = projectTeamWorth(labor);

  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'assign-project-team',
    base,
    materials: { food: 0, fuel: 0, hardware },
    survivors: team.survivors,
    assignments: team.assignments,
  });
}

const order = (item: ItemId, grade: Grade = 'standard', id = 'new'): BuildOrder => ({
  id,
  item,
  grade,
});

const codes = (campaign: Campaign, one: BuildOrder) =>
  buildCheck(campaign, one).blockers.map((violation) => violation.code);

function built(campaign: Campaign, one: BuildOrder): Campaign {
  const result = submitItemBuilt(campaign, one, AT);
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('building an item (pp. 20–21, 41–42; Z5-6)', () => {
  it('pays its Hardware and puts it in the Inventory at once, recording the Labor', () => {
    const after = built(planning(workshop()), order('blunt', 'standard', 'club'));

    expect(after.materials.hardware).toBe(8);
    expect(after.inventory).toEqual([{ id: 'club', item: 'blunt', grade: 'standard' }]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'item-built',
      id: 'club',
      item: 'blunt',
      grade: 'standard',
      hardware: 1,
      labor: 1,
    });
  });

  it('prices each grade it is built in, and refuses shoddy or one it is not built in', () => {
    const campaign = planning(workshop(['metal-shop']));

    expect(buildCost(campaign, order('bladed'))).toEqual({ hardware: 2, labor: 2 });
    expect(codes(campaign, order('bladed', 'shoddy'))).toEqual(['no-such-grade']);
    // A backpack is built only as quality (pg. 41).
    expect(codes(campaign, order('backpack', 'standard'))).toEqual(['no-such-grade']);
    expect(codes(campaign, order('backpack', 'quality'))).toEqual([]);
  });

  it('refuses an item that is found or traded, never built, and one that does not exist', () => {
    expect(codes(planning(workshop()), order('riot-shield'))).toEqual(['not-built']);
    expect(codes(planning(workshop()), order('laser' as ItemId))).toEqual(['no-such-item']);
    expect(buildCost(planning(workshop()), order('riot-shield'))).toBeUndefined();
    expect(buildCost(planning(workshop()), order('laser' as ItemId))).toBeUndefined();
    expect(buildCost(planning(workshop()), order('blunt', 'shoddy'))).toBeUndefined();
  });

  it('is refused with nothing to wave through', () => {
    expect(buildCheck(planning(workshop()), order('blunt'))).toEqual({
      blockers: [],
      warnings: [],
    });
    expect(
      buildCheck({ ...planning(workshop()), step: 'heal-wounds' }, order('blunt')).warnings,
    ).toEqual([]);
  });

  it('leaves the campaign alone when refused', () => {
    expect(submitItemBuilt(planning(null), order('blunt'), AT)).toEqual({
      ok: false,
      problem: 'The base has no standing facility this is built in.',
    });
  });

  it('is built in the Planning Phase only (R14)', () => {
    expect(codes({ ...planning(workshop()), step: 'heal-wounds' }, order('blunt'))).toEqual([
      'outside-the-planning-phase',
    ]);
  });

  it('refuses an id an item already has', () => {
    const once = built(planning(workshop()), order('blunt', 'standard', 'club'));

    expect(codes(once, order('blunt', 'standard', 'club'))).toEqual(['id-taken']);
  });
});

describe('what an item needs standing (pp. 41–42, 71–72)', () => {
  it('needs its facility, standing rather than on order', () => {
    expect(codes(planning({ id: 'small-town-home', slots: {} }), order('blunt'))).toEqual([
      'facility-missing',
    ]);
    expect(codes(planning(null), order('blunt'))).toEqual(['facility-missing']);
  });

  it('needs the Workshop upgrade it names', () => {
    expect(codes(planning(workshop()), order('bladed'))).toEqual(['upgrade-missing']);
    // Another upgrade is not the one it names.
    expect(codes(planning(workshop(['auto-shop'])), order('bladed'))).toEqual(['upgrade-missing']);
    expect(codes(planning(workshop(['metal-shop'])), order('bladed'))).toEqual([]);
  });

  it('builds what needs nothing anywhere', () => {
    expect(
      codes(planning({ id: 'small-town-home', slots: {} }), order('improvised-armor')),
    ).toEqual([]);
  });

  /** R44: at least one facility the row names, supplied this turn. */
  it('needs its Power or Water supplied to a facility the row names', () => {
    const unpowered = planning(workshop());
    const powered = generatingUtilities(
      planning({
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 }, power: true } },
      }),
      4,
    );
    const elsewhere = generatingUtilities(
      planning({
        id: 'small-town-home',
        slots: {
          garage: { built: { facility: 'workshop', builtOnTurn: 1 } },
          kitchen: { power: true },
        },
      }),
      4,
    );

    expect(codes(unpowered, order('walkie-talkie', 'quality'))).toEqual(['utility-missing']);
    expect(codes(powered, order('walkie-talkie', 'quality'))).toEqual([]);
    expect(codes(elsewhere, order('walkie-talkie', 'quality'))).toEqual(['utility-missing']);
  });

  it('reads a Workshop upgrade’s Workshop, and any one of the facilities a row names', () => {
    const supplied = (
      garage: boolean,
      kitchen: boolean,
      upgrades: Base['slots'][string]['upgrades'] = [],
    ) =>
      generatingUtilities(
        planning({
          id: 'small-town-home',
          slots: {
            garage: {
              built: { facility: 'workshop', builtOnTurn: 1 },
              upgrades,
              ...(garage ? { water: true as const } : {}),
            },
            kitchen: kitchen ? { water: true } : {},
          },
        }),
        4,
      );

    // A grenade: a Kitchen and a Gunsmith, and Water (pg. 42).
    expect(codes(supplied(true, false, ['gunsmith']), order('grenade'))).toEqual([]);
    expect(codes(supplied(false, true, ['gunsmith']), order('grenade'))).toEqual([]);
    // A Molotov cocktail: a Kitchen and a Workshop, Water to either.
    expect(codes(supplied(false, true), order('molotov-cocktail'))).toEqual([]);
    expect(codes(supplied(true, false), order('molotov-cocktail'))).toEqual([]);
    expect(codes(supplied(false, false), order('molotov-cocktail'))).toEqual(['utility-missing']);
  });

  it('builds a core item in a campaign running an origin', () => {
    expect(codes({ ...planning(workshop()), origin: 'viral' }, order('blunt'))).toEqual([]);
    expect(buildableItems({ ...planning(null), origin: 'viral' })).toContain('blunt');
  });

  it('refuses another origin’s item', () => {
    const library: Base = {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'mystic-library', builtOnTurn: 1 } } },
    };
    const enchanted: BuildOrder = { ...order('enchanted-melee-weapon'), enchants: 'bladed' };

    expect(codes(planning(library), enchanted)).toEqual(['other-origin']);
    expect(codes({ ...planning(library), origin: 'magic' }, enchanted)).toEqual([]);
  });

  /** Built at the cost of the standard weapon it enchants (pg. 40). */
  it('prices the enchanted melee weapon as the weapon it is built on', () => {
    const magic = { ...planning(null), origin: 'magic' as const };

    expect(codes(magic, order('enchanted-melee-weapon'))).toEqual(['needs-a-weapon']);
    expect(buildCost(magic, { ...order('enchanted-melee-weapon'), enchants: 'heavy' })).toEqual({
      hardware: 2,
      labor: 2,
    });
    expect(buildCost(magic, { ...order('enchanted-melee-weapon'), enchants: 'blunt' })).toEqual({
      hardware: 1,
      labor: 1,
    });
    expect(buildCost(magic, order('enchanted-melee-weapon'))).toBeUndefined();
    // Every weapon it can be built on is priced, which \`pricedRow\` relies on.
    for (const weapon of ENCHANTABLE) {
      expect(
        buildCost(magic, { ...order('enchanted-melee-weapon'), enchants: weapon }),
      ).toBeDefined();
    }
  });
});

describe('paying for it (pp. 20–21)', () => {
  it('refuses Hardware the stores do not hold', () => {
    expect(codes(planning(workshop(), 4, 0), order('blunt'))).toEqual(['not-enough-hardware']);
    expect(codes(planning(workshop(), 4, 1), order('blunt'))).toEqual([]);
  });

  it('refuses Labor the project team does not have, and counts what it has spent', () => {
    const team = planning(workshop(['metal-shop']), 3);

    expect(codes(planning(workshop(['metal-shop']), 1), order('bladed'))).toEqual([
      'not-enough-labor',
    ]);

    const once = built(team, order('bladed', 'standard', 'a'));
    expect(laborCommitted(once)).toBe(2);
    expect(laborAvailable(once)).toBe(1);
    expect(codes(once, order('bladed', 'standard', 'b'))).toEqual(['not-enough-labor']);
    // Any number a turn while the Labor lasts (pg. 21).
    expect(codes(once, order('blunt', 'standard', 'b'))).toEqual([]);
  });

  it('counts only this turn’s equipment against this turn’s Labor', () => {
    const once = built(planning(workshop(), 2), order('blunt', 'standard', 'a'));

    expect(laborCommitted({ ...once, turn: 4 })).toBe(0);
  });

  /** R48: a built item stays built, so the shortfall falls on the queue alone. */
  it('forgives a shortfall only equipment accounts for', () => {
    const once = built(planning(workshop(), 2), order('blunt', 'standard', 'a'));
    const shrunk = { ...once, survivors: once.survivors.slice(1) };

    expect(laborAvailable({ ...shrunk, assignments: { 'laborer-2': { task: 'project' } } })).toBe(
      0,
    );

    const gone = { ...once, survivors: [], assignments: {} };
    expect(laborAvailable(gone)).toBe(-1);
    expect(laborShortfall(gone)).toBe(0);
  });
});

describe('Blacksmithing Tools (pg. 63; R43)', () => {
  const festival = (id: BaseId = 'renaissance-festival') => planning({ id, slots: {} });

  it('halves the Labor of bladed, blunt, heavy and archery weapons, rounding up', () => {
    expect(buildCost(festival(), order('crossbow'))).toEqual({ hardware: 3, labor: 2 });
    expect(buildCost(festival(), order('bow'))).toEqual({ hardware: 2, labor: 1 });
    expect(buildCost(festival(), order('blunt'))).toEqual({ hardware: 1, labor: 1 });
  });

  it('leaves guns, disposables and other bases alone', () => {
    expect(buildCost(festival(), order('pistol'))).toEqual({ hardware: 3, labor: 2 });
    // A throwing axe is used with Bladed Weapon but is a disposable, not a weapon.
    expect(buildCost(festival(), order('throwing-axe'))).toEqual({ hardware: 3, labor: 2 });
    expect(buildCost(festival('small-town-home'), order('crossbow'))).toEqual({
      hardware: 3,
      labor: 3,
    });
  });
});

describe('what the build form offers', () => {
  it('lists every item with a row in the tables, of this campaign’s origin', () => {
    const plain = buildableItems(planning(null));

    expect(plain).toContain('blunt');
    expect(plain).toContain('improvised-armor');
    expect(plain).not.toContain('riot-shield');
    expect(plain).not.toContain('enchanted-melee-weapon');
    expect(buildableItems({ ...planning(null), origin: 'magic' })).toContain(
      'enchanted-melee-weapon',
    );
  });

  /** pg. 37; R34 (#217): the weapon tables' quality column goes unbuilt. */
  it('refuses a quality weapon, which is found or traded, and says so', () => {
    const campaign = planning(workshop(['metal-shop']));
    expect(buildCost(campaign, order('bladed', 'quality'))).toBeUndefined();
    expect(
      buildCheck(campaign, order('bladed', 'quality')).blockers.map((one) => one.message),
    ).toEqual(['A quality weapon is found or traded, never built.']);
  });

  it('offers the grades a row prices', () => {
    expect(buildGrades('bladed')).toEqual(['standard']);
    // Equipment keeps its quality column.
    expect(buildGrades('tool-belt')).toEqual(['standard', 'quality']);
    expect(buildGrades('backpack')).toEqual(['quality']);
    expect(buildGrades('enchanted-melee-weapon')).toEqual(['standard']);
    expect(buildGrades('riot-shield')).toEqual([]);
  });
});
