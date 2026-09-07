import { describe, expect, it } from 'vitest';
import { BASES, BASE_IDS, type BaseId } from '../data/bases';
import { FACILITIES, type Facility, type Upgrade } from '../data/facilities';
import type { Base, SlotState } from './campaign';
import {
  beds,
  flatUtilitiesGenerated,
  layoutOf,
  maxHeroes,
  occupants,
  siegeThreatFromBase,
  storageCaps,
  upgradesRemaining,
  upgradesUsed,
} from './base';

/** A base with nothing done to it — the state a claim leaves behind. */
const claimed = (id: BaseId): Base => ({ id, slots: {} });

const withSlots = (id: BaseId, slots: Record<string, SlotState>): Base => ({ id, slots });

/** Every slot supplied with both utilities, for the powered half of a check. */
function fullySupplied(id: BaseId): Base {
  const slots: Record<string, SlotState> = {};
  for (const slot of layoutOf(claimed(id))) slots[slot.id] = { power: true, water: true };
  return { id, slots };
}

const occupantAt = (base: Base, slotId: string) =>
  occupants(base).find((occupant) => occupant.slotId === slotId);

describe('occupants', () => {
  it('finds the facilities a base ships and nothing else', () => {
    const found = occupants(claimed('small-town-home')).map((occupant) => occupant.facility.id);

    // Two bunk rooms and a kitchen; the garage and the front yard are empty.
    expect(found).toEqual(['bunk-room', 'bunk-room', 'kitchen']);
  });

  it('gives a built-in no build turn, so its upgrades are never blocked by one', () => {
    expect(occupantAt(claimed('small-town-home'), 'kitchen')?.builtOnTurn).toBeNull();
  });

  it('finds a facility the player built, with the turn it went up', () => {
    const base = withSlots('small-town-home', {
      garage: { built: { facility: 'workshop', builtOnTurn: 4 } },
    });

    expect(occupantAt(base, 'garage')).toMatchObject({
      facility: { id: 'workshop' },
      builtOnTurn: 4,
      upgradable: true,
    });
  });

  it('puts the base’s own upgrades before the player’s', () => {
    const base = withSlots('greasy-spoon', { kitchen: { upgrades: ['refrigerator'] } });
    const found = occupantAt(base, 'kitchen')?.upgrades.map((upgrade) => upgrade.id);

    // The Greasy Spoon's kitchen ships a Gas Range.
    expect(found).toEqual(['gas-range', 'refrigerator']);
  });

  it('ignores an upgrade that belongs to another facility rather than failing', () => {
    // The parser accepts this on purpose — Z2-6 lets a player override which
    // facility an upgrade goes on — so the engine has to survive reading it.
    const base = withSlots('small-town-home', { kitchen: { upgrades: ['spotlight'] } });

    expect(occupantAt(base, 'kitchen')?.upgrades).toEqual([]);
  });

  it('surfaces the utilities the player assigned to the slot', () => {
    // Nothing Phase 2 computes is gated on Water alone — the entries that need
    // it produce or staff, which is Z2-8 and Z2-9 — so the flag is asserted
    // here rather than through an effect that would notice it going missing.
    const base = withSlots('small-town-home', {
      'bunk-room-1': { power: true },
      'bunk-room-2': { water: true },
    });

    expect(occupantAt(base, 'bunk-room-1')).toMatchObject({ power: true, water: false });
    expect(occupantAt(base, 'bunk-room-2')).toMatchObject({ power: false, water: true });
    expect(occupantAt(base, 'kitchen')).toMatchObject({ power: false, water: false });
  });

  it('has no occupant for an empty slot or an uncleared clearing project', () => {
    expect(occupantAt(claimed('rural-church'), 'yard')).toBeUndefined();
    expect(occupantAt(claimed('rural-church'), 'pews-1')).toBeUndefined();
  });
});

describe('storageCaps', () => {
  /**
   * The base roster as the book prints it (pg. 54) — Hardware / Food / Fuel,
   * and the parenthetical value where a built-in needs a utility.
   *
   * None of these numbers are stored in `src/data/bases.ts`; this re-derives
   * the whole column and is the check that the transcription is right. It moved
   * here from `rules.test.ts` when this function replaced the local helper that
   * stood in for it.
   */
  const PRINTED: Record<
    BaseId,
    { unpowered: [number, number, number]; supplied?: [number, number, number] }
  > = {
    'small-town-home': { unpowered: [4, 4, 4] },
    'summer-camp': { unpowered: [4, 4, 4] },
    'rural-church': { unpowered: [4, 4, 4] },
    // 6/6(8)/6 — the Refrigeration that lifts Food to 8 needs Power.
    'greasy-spoon': { unpowered: [6, 6, 6], supplied: [6, 8, 6] },
    'hobby-farm': { unpowered: [9, 7, 7] },
    distillery: { unpowered: [7, 7, 9] },
    'outdoor-sports-shop': { unpowered: [5, 5, 5] },
    'renaissance-festival': { unpowered: [6, 6, 6] },
    'hydroelectric-dam': { unpowered: [8, 8, 8] },
    'regional-firehouse': { unpowered: [6, 6, 6] },
  };

  it('re-derives the printed storage column of every base', () => {
    for (const id of BASE_IDS) {
      const printed = PRINTED[id];

      expect([id, storageCaps(claimed(id))]).toEqual([
        id,
        { hardware: printed.unpowered[0], food: printed.unpowered[1], fuel: printed.unpowered[2] },
      ]);

      const supplied = printed.supplied ?? printed.unpowered;
      expect([id, storageCaps(fullySupplied(id))]).toEqual([
        id,
        { hardware: supplied[0], food: supplied[1], fuel: supplied[2] },
      ]);
    }
  });

  it('raises the cap for exactly the material an upgrade names', () => {
    const base = withSlots('small-town-home', {
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['fuel-tank'] },
    });

    // Tier 1 is 4 across; the Storage Area adds 2 to each and the Fuel Tank 2
    // more to Fuel alone.
    expect(storageCaps(base)).toEqual({ hardware: 6, food: 6, fuel: 8 });
  });

  it('gives no storage at all for a facility whose utility is missing', () => {
    const unpowered = withSlots('small-town-home', {
      garage: { built: { facility: 'storage-area', builtOnTurn: 1 }, upgrades: ['refrigeration'] },
    });
    const powered = withSlots('small-town-home', {
      garage: {
        built: { facility: 'storage-area', builtOnTurn: 1 },
        upgrades: ['refrigeration'],
        power: true,
      },
    });

    // The Storage Area itself needs nothing, so it works either way; only the
    // Refrigeration switches off.
    expect(storageCaps(unpowered).food).toBe(6);
    expect(storageCaps(powered).food).toBe(8);
  });
});

describe('beds', () => {
  it('counts a base’s own bunk rooms and their upgrades', () => {
    // Two bunk rooms at two beds each.
    expect(beds(claimed('small-town-home'))).toBe(4);

    // Both of the Summer Camp's ship two Extra Beds: four beds each.
    expect(beds(claimed('summer-camp'))).toBe(8);
  });

  it('counts the Regional Firehouse’s eight, which the roster states outright', () => {
    expect(beds(claimed('regional-firehouse'))).toBe(8);
  });

  it('adds one per indoor bunk room at the Hydroelectric Dam', () => {
    // The Dam ships none, so White Noise is worth nothing until the player
    // builds one — and then it is worth one bed per bunk room, not one bed.
    expect(beds(claimed('hydroelectric-dam'))).toBe(0);

    const withBunks = withSlots('hydroelectric-dam', {
      'turbine-room-1': { built: { facility: 'bunk-room', builtOnTurn: 2 } },
      'turbine-room-2': { built: { facility: 'bunk-room', builtOnTurn: 2 } },
    });

    expect(beds(withBunks)).toBe(6);
  });

  it('does not give White Noise to a bunk room in an outdoor slot', () => {
    // A Bunk Room requires an Indoor slot, so this is only reachable by
    // overriding the build — and the special says *indoor* bunk rooms.
    const outdoors = withSlots('hydroelectric-dam', {
      'parking-lot': { built: { facility: 'bunk-room', builtOnTurn: 2 } },
    });

    expect(beds(outdoors)).toBe(2);
  });

  it('counts a player’s Extra Beds, repeats included', () => {
    const base = withSlots('small-town-home', {
      'bunk-room-1': { upgrades: ['extra-bed', 'extra-bed'] },
    });

    expect(beds(base)).toBe(6);
  });
});

describe('siegeThreatFromBase', () => {
  it('is zero for a base with nothing that touches it', () => {
    expect(siegeThreatFromBase(claimed('small-town-home'))).toBe(0);
  });

  it('counts the Renaissance Festival’s Curtain Wall', () => {
    expect(siegeThreatFromBase(claimed('renaissance-festival'))).toBe(-3);
  });

  it('counts a Spotlight only while it has Power', () => {
    const dark = withSlots('rural-church', { watchtower: { upgrades: ['spotlight'] } });
    const lit = withSlots('rural-church', { watchtower: { upgrades: ['spotlight'], power: true } });

    expect(siegeThreatFromBase(dark)).toBe(0);
    expect(siegeThreatFromBase(lit)).toBe(-1);
  });

  it('leaves out the Watchtower’s own reduction, which needs staff', () => {
    // The Rural Church ships a Watchtower. Its contribution is the staff's best
    // score, and staffing is Phase 3 — so the base's own number is unaffected.
    expect(siegeThreatFromBase(claimed('rural-church'))).toBe(0);
  });
});

describe('flatUtilitiesGenerated', () => {
  it('is nothing for a base with no generators', () => {
    expect(flatUtilitiesGenerated(claimed('small-town-home'))).toEqual({ power: 0, water: 0 });
  });

  it('counts the Distillery’s built-in 2 Water', () => {
    expect(flatUtilitiesGenerated(claimed('distillery'))).toEqual({ power: 0, water: 2 });
  });

  it('counts Solar Panels and Rain Collectors', () => {
    const base = withSlots('small-town-home', {
      'front-yard': {
        built: { facility: 'utility-station', builtOnTurn: 1 },
        upgrades: ['solar-panel', 'rain-collector'],
      },
    });

    expect(flatUtilitiesGenerated(base)).toEqual({ power: 1, water: 1 });
  });

  it('ignores production that is not a utility', () => {
    // A Garden produces Food flat. Counting it here would put a `food` key on
    // a Power-and-Water answer, which is the failure this asserts against.
    const base = withSlots('small-town-home', {
      'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } },
    });

    expect(flatUtilitiesGenerated(base)).toEqual({ power: 0, water: 0 });
  });
});

describe('upgrade counts', () => {
  it('reports three used and none remaining on a full facility', () => {
    const base = withSlots('small-town-home', {
      'bunk-room-1': { upgrades: ['extra-bed', 'extra-bed', 'loft'] },
    });
    const occupant = occupantAt(base, 'bunk-room-1');

    expect(occupant && upgradesUsed(occupant)).toBe(3);
    expect(occupant && upgradesRemaining(occupant)).toBe(0);
  });

  /**
   * The rare exemption (pg. 49), asserted against a constructed upgrade.
   *
   * Nothing in the core facility table is rare — rare base upgrades come off
   * the Rare Item Table in Phase 5 — so there is no data to build this from
   * yet, and a rule with no test until Phase 5 is a rule that arrives already
   * broken. The occupant is assembled by hand instead; that is the whole reason
   * these functions take an `Occupant` rather than a base and a slot id.
   */
  it('does not count a rare upgrade against the cap', () => {
    const rare: Upgrade = {
      id: 'extra-bed',
      cost: { hardware: 0, labor: 0 },
      effects: { beds: 1 },
      rare: true,
    };
    const ordinary = (FACILITIES['bunk-room'] as Facility).upgrades[0] as Upgrade;

    const occupant = {
      slotId: 'bunk-room-1',
      kind: 'indoor',
      facility: FACILITIES['bunk-room'] as Facility,
      upgrades: [ordinary, rare, rare, rare],
      builtOnTurn: null,
      upgradable: true,
      power: false,
      water: false,
      flatOutput: undefined,
    } as const;

    // Four upgrades, three of them rare: one against the cap, two left.
    expect(upgradesUsed(occupant)).toBe(1);
    expect(upgradesRemaining(occupant)).toBe(2);
  });

  it('reports none remaining on a built-in the base locks', () => {
    // The Summer Camp's bunk rooms arrive with two Extra Beds and take no more.
    const occupant = occupantAt(claimed('summer-camp'), 'bunk-room-1');

    expect(occupant && upgradesUsed(occupant)).toBe(2);
    expect(occupant && upgradesRemaining(occupant)).toBe(0);
  });

  it('leaves an unlocked built-in its full three', () => {
    const occupant = occupantAt(claimed('small-town-home'), 'kitchen');

    expect(occupant && upgradesRemaining(occupant)).toBe(3);
  });
});

describe('maxHeroes', () => {
  it('is the base tier', () => {
    for (const id of BASE_IDS) {
      expect([id, maxHeroes(claimed(id))]).toEqual([id, BASES[id].tier]);
    }
  });
});
