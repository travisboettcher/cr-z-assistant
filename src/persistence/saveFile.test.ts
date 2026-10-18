import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createNewCampaign, type Campaign } from '../engine/campaign';
import { serializeCampaign } from './exportFile';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';
import v1Fixture from './__fixtures__/campaign-v1.json';
import v2Fixture from './__fixtures__/campaign-v2.json';
import currentFixture from './__fixtures__/campaign-v19.json';

/** A structurally sound survivor, for the cases that damage one field of it. */
const VALID_SURVIVOR = {
  id: 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53',
  name: 'Earl Rhodes',
  tier: 4,
  stats: { strength: 3, dexterity: 2, intelligence: 4, cooperation: 1 },
  skills: { tactics: 3 },
  move: 7,
  defense: 6,
  currentHp: 3,
  infection: 0,
  xp: 5,
  items: [],
  storyTrait: null,
  veteran: false,
  bondGroup: null,
  stories: [],
};

/**
 * Pinned rather than generated, so a failure names a value that is actually in
 * this file. The factory's real defaults come from `crypto.randomUUID()` and
 * the clock, neither of which belongs in an assertion.
 */
const sampleCampaign = (): Campaign =>
  createNewCampaign('Cedar Hollow', {
    id: '9f2c1d6e-5b30-4a77-8c41-0e6b2f9a7d13',
    createdAt: '2026-08-30T00:00:00.000Z',
  });

/** A current-shape save with one field replaced, for the damaged-file cases. */
const savedWith = (overrides: Record<string, unknown>): string =>
  JSON.stringify({ ...sampleCampaign(), ...overrides });

describe('parseCampaignFile', () => {
  it('opens a saved campaign', () => {
    const result = parseCampaignFile(JSON.stringify(v1Fixture));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.name).toBe('Cedar Hollow');
    expect(result.campaign.turn).toBe(3);
    // The v6 → v7 step replaces the phase with the step that phase opens on:
    // an old save never recorded how far into a phase anyone was.
    expect(result.campaign.step).toBe('assign-facility-staff');
    // The Rare it held is a Rare Item Table roll owed since v17 (R49).
    expect(result.campaign.materials).toEqual({ food: 4, fuel: 2, hardware: 7 });
    expect(result.campaign.rareRollsOwed).toBe(1);
    expect(result.campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  /**
   * Z0-9's headline acceptance in miniature: whatever export writes, import has
   * to hand back unchanged. Everything else in this file is about the ways that
   * can fail; this is the thing all of it protects.
   */
  it('round-trips a campaign through JSON unchanged', () => {
    const campaign = sampleCampaign();
    const result = parseCampaignFile(JSON.stringify(campaign));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign).toEqual(campaign);
  });

  it('rejects a file cut short while saving', () => {
    const truncated = JSON.stringify(sampleCampaign()).slice(0, 40);
    const result = parseCampaignFile(truncated);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('invalid-json');
    // The reader gets a file-shaped explanation, never the parser's byte offset.
    expect(result.error.message).not.toMatch(/JSON|position|token/i);
  });

  it.each([
    ['an empty file', ''],
    ['prose', 'Cedar Hollow, turn 3'],
    ['half an object', '{"schemaVersion": 1,'],
    ['a trailing comma', '{"schemaVersion": 1,}'],
  ])('rejects %s rather than throwing', (_label, text) => {
    const result = parseCampaignFile(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('invalid-json');
  });

  it.each([
    ['a list', '[1, 2, 3]'],
    ['a bare string', '"Cedar Hollow"'],
    ['a number', '3'],
    ['null', 'null'],
  ])('rejects valid JSON that is %s', (_label, text) => {
    const result = parseCampaignFile(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('not-a-campaign');
    expect(result.error.message).toMatch(/County Road Z/);
  });

  it('rejects a JSON object that is some other app’s file', () => {
    const result = parseCampaignFile('{"title": "shopping list", "items": []}');

    expect(result.ok).toBe(false);
    if (result.ok) return;

    // No version to read, so this is the migration chain's call to make.
    expect(result.error.reason).toBe('unreadable-version');
    expect(result.error.message).toMatch(/County Road Z/);
  });

  /**
   * Both version failures are `migrate`'s to explain, and the assertion is
   * equality with what `migrate` actually says — a paraphrase here would be a
   * second copy of the same sentence to keep good.
   */
  it.each([
    ['a save with no version', { schemaVersion: undefined }],
    ['a save from a newer version', { schemaVersion: CURRENT_SCHEMA_VERSION + 1 }],
  ])('forwards the migration error for %s', (_label, overrides) => {
    const text = savedWith(overrides);
    const expected = migrate(JSON.parse(text));

    expect(expected.ok).toBe(false);
    if (expected.ok) return;

    const result = parseCampaignFile(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toEqual(expected.error);
  });

  it('tells someone with a newer save to update the app', () => {
    const result = parseCampaignFile(savedWith({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('future-version');
    expect(result.error.message).toMatch(/newer version/i);
  });

  /**
   * The cases that prove validation reads fields rather than counting keys: all
   * of these are campaign-shaped enough to migrate and still are not campaigns.
   */
  it.each([
    ['a step that isn’t a step', { step: 'harvest' }],
    ['a step of the wrong type', { step: 3 }],
    ['materials missing a key', { materials: { food: 4, fuel: 2 } }],
    ['a material that isn’t a number', { materials: { food: '4', fuel: 2, hardware: 7 } }],
    ['no materials at all', { materials: undefined }],
    ['a turn of zero', { turn: 0 }],
    ['a fractional turn', { turn: 2.5 }],
    ['a turn that is a string', { turn: '3' }],
    ['no id', { id: '' }],
    ['a name that isn’t a string', { name: 42 }],
    ['an unreadable creation date', { createdAt: 'last Tuesday' }],
    ['survivors this version can’t read', { survivors: [{ name: 'Rae' }] }],
    ['a base this version can’t read', { base: { rooms: [] } }],
    ['a log this version can’t read', { log: ['turn 1'] }],
  ])('rejects a campaign with %s', (_label, overrides) => {
    const result = parseCampaignFile(savedWith(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('damaged-campaign');
    expect(result.error.message).toMatch(/County Road Z/);
  });

  /** Trades on their way (Z5-9): each an item with what it cost and when it was ordered. */
  /** The vehicles the community holds (Z5-11). */
  describe('vehicles', () => {
    const pickup = { id: 'pickup', tier: 2, label: 'Red pickup', water: false };
    const message = (vehicles: unknown, more: object = {}) => {
      const result = parseCampaignFile(savedWith({ vehicles, ...more }));

      return result.ok ? null : result.error.message;
    };

    it('reads them back, a split and an upgrade included', () => {
      const vehicles = [
        { ...pickup, upgrade: { id: 'rack', item: 'car-roof-rack', grade: 'standard' } },
        { id: 'bus', tier: 4, label: 'School bus', water: true, inventorySlots: 12 },
      ];
      const result = parseCampaignFile(savedWith({ vehicles }));

      expect(result.ok && result.campaign.vehicles).toEqual(vehicles);
    });

    it.each([
      ['a list that isn’t one', 'pickup', 'its vehicles: isn’t a list'],
      ['a vehicle that isn’t one', [7], 'vehicle 1 of 1 isn’t a vehicle'],
      ['no id', [{ ...pickup, id: '' }], 'has no id'],
      ['an id that isn’t a string', [{ ...pickup, id: 7 }], 'has no id'],
      ['no Tier', [{ ...pickup, tier: 5 }], 'has no Tier from 1 to 4'],
      ['no label', [{ ...pickup, label: 3 }], 'has no label'],
      ['no word on the water', [{ ...pickup, water: 'no' }], 'whether it is a boat'],
      ['an unreadable split', [{ ...pickup, inventorySlots: -1 }], 'unreadable split'],
      [
        'an upgrade that isn’t an item',
        [{ ...pickup, upgrade: { id: 'x', item: 'laser', grade: 'standard' } }],
        'has an upgrade that',
      ],
      ['one id twice', [pickup, { ...pickup, label: 'Other' }], 'two vehicles with one id: pickup'],
    ])('refuses %s', (_label, vehicles, expected) => {
      expect(message(vehicles)).toContain(expected);
    });

    it('refuses an upgrade with an item’s id', () => {
      expect(
        message(
          [{ ...pickup, upgrade: { id: 'rack', item: 'car-roof-rack', grade: 'standard' } }],
          {
            inventory: [{ id: 'rack', item: 'bow', grade: 'standard' }],
          },
        ),
      ).toContain('it holds two items with one id: rack');
    });
  });

  /** A Rare Items trade under way (Z5-10): its turn, and each item with its dice and its share. */
  describe('a Rare Items trade under way', () => {
    const item = {
      id: 'shield',
      item: 'riot-shield',
      grade: 'standard',
      subtable: 3,
      entry: 1,
      food: 4,
      fuel: 6,
    };
    const message = (rareTrade: unknown, more: object = {}) => {
      const result = parseCampaignFile(savedWith({ rareTrade, ...more }));

      return result.ok ? null : result.error.message;
    };

    it('reads one back, or none', () => {
      const trade = { madeOnTurn: 3, items: [item] };
      const result = parseCampaignFile(savedWith({ rareTrade: trade }));

      expect(result.ok && result.campaign.rareTrade).toEqual(trade);
      expect(message(null)).toBeNull();
    });

    it.each([
      ['a trade that isn’t one', 7, 'its Rare Items trade isn’t a trade'],
      ['no turn', { items: [item] }, 'doesn’t say which turn it was made on'],
      ['items that aren’t a list', { madeOnTurn: 3, items: 'shield' }, 'isn’t a list'],
      [
        'an item that isn’t one',
        { madeOnTurn: 3, items: [item, { ...item, id: 'b', item: 'laser' }] },
        'item 2 of 2',
      ],
      [
        'a die that isn’t one',
        { madeOnTurn: 3, items: [{ ...item, subtable: 11 }] },
        'item 1 of 1 doesn’t say which roll found it',
      ],
      [
        'a second die that isn’t one',
        { madeOnTurn: 3, items: [{ ...item, entry: 0 }] },
        'item 1 of 1 doesn’t say which roll found it',
      ],
      [
        'no Food set aside',
        { madeOnTurn: 3, items: [{ ...item, food: undefined }] },
        'item 1 of 1 doesn’t say what was set aside for it',
      ],
      [
        'a Fuel of half',
        { madeOnTurn: 3, items: [{ ...item, fuel: 0.5 }] },
        'item 1 of 1 doesn’t say what was set aside for it',
      ],
    ])('refuses %s', (_label, rareTrade, expected) => {
      expect(message(rareTrade)).toContain(expected);
    });

    it('refuses an id an item already has', () => {
      expect(
        message(
          { madeOnTurn: 3, items: [item] },
          { inventory: [{ id: 'shield', item: 'bow', grade: 'standard' }] },
        ),
      ).toContain('it holds two items with one id: shield');
    });
  });

  describe('trades on order', () => {
    const trade = {
      id: 'traded',
      item: 'pistol',
      grade: 'standard',
      food: 2,
      fuel: 4,
      orderedOnTurn: 3,
    };
    const problem = (trades: unknown) => {
      const result = parseCampaignFile(savedWith({ trades }));

      return result.ok ? null : result.error.message;
    };

    it('reads a list of them back', () => {
      const result = parseCampaignFile(savedWith({ trades: [trade] }));

      expect(result.ok && result.campaign.trades).toEqual([trade]);
    });

    it.each([
      ['a list that isn’t one', 'many', 'its trades on order: isn’t a list'],
      ['an item that isn’t one', [trade, { ...trade, id: 'b', item: 'laser' }], 'trade 2 of 2'],
      ['no Food', [{ ...trade, food: undefined }], 'trade 1 of 1 doesn’t say what it cost'],
      ['a Fuel of half', [{ ...trade, fuel: 0.5 }], 'trade 1 of 1 doesn’t say what it cost'],
      [
        'no turn',
        [{ ...trade, orderedOnTurn: 0 }],
        'trade 1 of 1 doesn’t say which turn it was ordered on',
      ],
      [
        'an id an item already has',
        [trade],
        'it holds two items with one id: traded',
        { inventory: [{ id: 'traded', item: 'bow', grade: 'standard' }] },
      ],
    ])('refuses %s', (_label, trades, expected, more?: object) => {
      const result = parseCampaignFile(savedWith({ trades, ...more }));

      expect(result.ok ? null : result.error.message).toContain(expected);
      expect(problem([trade])).toBeNull();
    });
  });

  it('says which part of the campaign is wrong', () => {
    const result = parseCampaignFile(savedWith({ step: 'harvest' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.message).toContain('where in the turn it is');
  });

  /**
   * The promise the whole module makes: import surfaces a sentence, never an
   * exception, whatever it is handed.
   */
  it.each([
    ['empty', ''],
    ['whitespace', '   \n  '],
    ['a lone brace', '{'],
    ['a nested null', '{"schemaVersion": 1, "materials": null}'],
    ['deeply wrong', '{"schemaVersion": [1]}'],
  ])('never throws on %s input', (_label, text) => {
    expect(() => parseCampaignFile(text)).not.toThrow();
    expect(parseCampaignFile(text).ok).toBe(false);
  });
});

describe('parseCampaignFile with a roster', () => {
  it('opens a campaign that has survivors in it', () => {
    const result = parseCampaignFile(JSON.stringify(v2Fixture));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toHaveLength(3);
    expect(result.campaign.survivors[0]?.name).toBe('Earl Rhodes');
    expect(result.campaign.survivors[0]?.skills).toEqual({
      'heavy-weapon': 2,
      carry: 1,
      scavenge: 1,
      tactics: 3,
    });
    // Zero health is a real state, not a missing value — a survivor at 0 HP
    // faces a rot check in the Management Phase rather than being gone.
    expect(result.campaign.survivors[2]?.currentHp).toBe(0);
  });

  /**
   * The key-order guarantee, one level deeper than Z0-8 could test it. Now that
   * survivors are nested objects, `JSON.stringify` follows their insertion
   * order too, so a roster read from a file and written straight back out has
   * to come out byte-identical — otherwise every save after a survivor learns
   * a skill diffs as though the whole roster changed.
   */
  it('re-exports a roster and a base byte-identically', () => {
    // The *current* fixture, because byte-identity is a claim about the format
    // this build writes. An older file legitimately comes back one version up,
    // which is the migration working rather than the round trip failing.
    //
    // From v5 the fixture carries a base, so this also pins the slot order —
    // written in the base's layout order, not the order the player built in —
    // and that absent optional fields stay absent rather than coming back as
    // `false`. From v6 it carries a log, which pins that an entry's own keys
    // and its event's fields both survive a round trip untouched. From v8 it
    // carries assignments, which pins that they come back in roster order and
    // that a survivor with no task still has no entry. From v10 it carries a
    // project queue, which pins that an ordered array keeps its order and that
    // each kind keeps its own fields. v11 took the last siege's turn back out
    // again — it is read off the log now — so the campaign has one fewer plain
    // number among the nested ones. v12 carries a siege and how it ended,
    // which pins that an outcome's counts come back as they were written. From
    // v13 each project carries a `charged` pair, which pins the one nested
    // object inside an array element. v14 gives every survivor an Infection,
    // between their Health and their experience — and runs Viral, so the
    // numbers in it are ones a table could actually have written, including a
    // Heal Wounds entry that spent a point on Infection, whose optional count
    // has to come back in its sorted place.
    const text = `${JSON.stringify(currentFixture, null, 2)}\n`;
    const result = parseCampaignFile(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(serializeCampaign(result.campaign)).toBe(text);
  });

  /**
   * Shape, never legality. Z1-7 lets a player override the rules deliberately —
   * an over-slotted survivor, a skill above the Tier cap — and a campaign saved
   * with an override in it must still open. Refusing it here would make the
   * override a feature that quietly destroys the save that used it.
   */
  it('opens a survivor who breaks the rules but not the shape', () => {
    const houseRuled = structuredClone(v2Fixture) as Record<string, unknown>;
    houseRuled.survivors = [
      { ...v2Fixture.survivors[2], skills: { handguns: 4, archery: 2, stealth: 1 } },
    ];

    // A Rookie with three skills, one of them at level 4: illegal by pg. 7 and
    // pg. 8, and none of the parser's business.
    expect(parseCampaignFile(JSON.stringify(houseRuled)).ok).toBe(true);
  });

  it.each([
    ['isn’t an object', 'isn’t a survivor', null],
    ['has no name', 'has no name', { ...VALID_SURVIVOR, name: 42 }],
    ['has an impossible Tier', 'Tier that isn’t one', { ...VALID_SURVIVOR, tier: 7 }],
    // Reports the first stat missing, in the order the rules list them.
    ['is missing a stat', 'no dexterity score', { ...VALID_SURVIVOR, stats: { strength: 1 } }],
    [
      'knows a skill this version doesn’t',
      'skill this version doesn’t know',
      { ...VALID_SURVIVOR, skills: { whittling: 1 } },
    ],
    ['has unreadable health', 'unreadable health', { ...VALID_SURVIVOR, currentHp: 'hurt' }],
    // A current-version file with no Infection is damaged, not old: the v13 →
    // v14 step is what fills it in, and this file has already passed it.
    ['has no infection', 'unreadable infection', { ...VALID_SURVIVOR, infection: undefined }],
    ['has negative infection', 'unreadable infection', { ...VALID_SURVIVOR, infection: -1 }],
  ])('reports a survivor that %s', (_label, expected, survivor) => {
    const result = parseCampaignFile(savedWith({ survivors: [survivor] }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('damaged-campaign');
    expect(result.error.message).toContain(expected);
  });

  /**
   * Shape, never legality — the base's half of the rule the survivor tests
   * above state. Z2-5 and Z2-6 let a player override slot kinds, costs and the
   * upgrade cap on purpose, so an overridden base has to reopen: a Watchtower
   * in an Indoor slot and a Kitchen carrying a Watchtower's upgrade are both
   * illegal and both none of the parser's business.
   */
  it('opens a base that breaks the rules but not the shape', () => {
    const houseRuled = savedWith({
      base: {
        id: 'distillery',
        slots: {
          // An Outdoor-only facility in an Indoor slot, with four upgrades on
          // it, one of which belongs to another facility entirely.
          'tasting-room': {
            built: { facility: 'watchtower', builtOnTurn: 1 },
            upgrades: ['watch-post', 'watch-post', 'spotlight', 'gas-range'],
          },
        },
      },
    });

    expect(parseCampaignFile(houseRuled).ok).toBe(true);
  });

  it.each([
    ['isn’t an object', 'its base isn’t a base', 7],
    [
      'names a base this version doesn’t know',
      'base is one this version doesn’t know',
      { id: 'space-station', slots: {} },
    ],
    ['has no slots', 'its base has no slots', { id: 'hobby-farm' }],
    [
      'has a slot the base doesn’t have',
      'the hobby-farm doesn’t have',
      { id: 'hobby-farm', slots: { 'wine-cellar': {} } },
    ],
    ['has a slot that isn’t an object', 'isn’t a slot', { id: 'hobby-farm', slots: { garden: 7 } }],
    [
      'has an unreadable facility',
      'has an unreadable facility',
      { id: 'hobby-farm', slots: { 'front-yard': { built: 7 } } },
    ],
    [
      'holds a facility this version doesn’t know',
      'facility this version doesn’t know',
      {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'helipad', builtOnTurn: 1 } } },
      },
    ],
    [
      'doesn’t say when a facility was built',
      'which turn it was built on',
      { id: 'hobby-farm', slots: { 'front-yard': { built: { facility: 'garden' } } } },
    ],
    [
      'holds an upgrade this version doesn’t know',
      'upgrade this version doesn’t know',
      { id: 'hobby-farm', slots: { 'front-yard': { upgrades: ['moat'] } } },
    ],
    [
      'records something other than cleared',
      'other than cleared',
      { id: 'hobby-farm', slots: { 'ruined-chicken-coop': { cleared: false } } },
    ],
    [
      'records something other than assigned for a utility',
      'other than assigned for its power',
      { id: 'hobby-farm', slots: { garden: { power: 'yes' } } },
    ],
  ])('reports a base that %s', (_label, expected, base) => {
    const result = parseCampaignFile(savedWith({ base }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('damaged-campaign');
    expect(result.error.message).toContain(expected);
  });

  /**
   * A campaign that has not claimed a base is not a damaged one — null is the
   * answer to "which base", not a missing field.
   */
  it('opens a campaign with no base', () => {
    expect(parseCampaignFile(savedWith({ base: null })).ok).toBe(true);
  });

  /**
   * Positional, because the survivor whose name is the damaged field cannot be
   * pointed at by name.
   */
  it('names which survivor in the roster is the problem', () => {
    const result = parseCampaignFile(
      savedWith({ survivors: [VALID_SURVIVOR, VALID_SURVIVOR, { ...VALID_SURVIVOR, name: null }] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.message).toContain('survivor 3 of 3');
  });
});

/**
 * The type half of the shape check, which nothing was exercising (issue #40).
 *
 * Every earlier damaged-file case *removes* a field or gives it an out-of-range
 * value. None of them gives a field the wrong JavaScript *type* — a numeric
 * name, a string turn — so every `typeof` guard in this file could be deleted
 * and the suite stayed green. This is the app's trust boundary: the one place
 * that reads bytes somebody else wrote, and the guards there are worth more
 * than the ones anywhere else.
 */
describe('a file whose fields are the wrong type', () => {
  const rejected = (overrides: Record<string, unknown>) => {
    const result = parseCampaignFile(savedWith(overrides));

    expect(result.ok, `expected ${JSON.stringify(overrides)} to be refused`).toBe(false);
    return result.ok ? null : result.error;
  };

  it('refuses a campaign id that is not a string', () => {
    expect(rejected({ id: 12345 })?.reason).toBe('damaged-campaign');
  });

  it('refuses an empty campaign id, which is a string and still not an id', () => {
    expect(rejected({ id: '' })?.reason).toBe('damaged-campaign');
  });

  it('refuses a name that is not a string', () => {
    expect(rejected({ name: 42 })?.reason).toBe('damaged-campaign');
  });

  it('refuses a creation date that is not a string', () => {
    expect(rejected({ createdAt: 1756857600000 })?.reason).toBe('damaged-campaign');
  });

  /**
   * The value that makes the `typeof` half of that check load-bearing, and the
   * reason the test above is not enough on its own.
   *
   * `Date.parse` stringifies its argument, so `Date.parse(12345)` reads "12345"
   * as the **year 12345** and returns a perfectly good timestamp — while
   * `Date.parse(1756857600000)` has too many digits for a year and gives NaN.
   * A test using only the long number passes whether or not the string check is
   * there, which is precisely how the surviving mutant hid: the assertion looked
   * like it covered the guard and actually exercised the other half of the `||`.
   */
  it('refuses a numeric creation date that would parse as a year', () => {
    expect(Number.isNaN(Date.parse(12345 as unknown as string))).toBe(false);
    expect(rejected({ createdAt: 12345 })?.reason).toBe('damaged-campaign');
  });

  it('refuses a step that is not a string', () => {
    expect(rejected({ step: 3 })?.reason).toBe('damaged-campaign');
  });

  it('refuses a turn that is a string, even one that looks like a number', () => {
    expect(rejected({ turn: '3' })?.reason).toBe('damaged-campaign');
  });

  it('refuses a fractional turn', () => {
    expect(rejected({ turn: 2.5 })?.reason).toBe('damaged-campaign');
  });

  it('refuses a material count that is not a number', () => {
    expect(rejected({ materials: { food: '4', fuel: 0, hardware: 0 } })?.reason).toBe(
      'damaged-campaign',
    );
  });

  it('refuses a material count that is not finite', () => {
    // `Infinity` does not survive JSON — it serialises to null — which is
    // itself the reason the check is for finiteness rather than just a number.
    expect(rejected({ materials: { food: Infinity, fuel: 0, hardware: 0 } })?.reason).toBe(
      'damaged-campaign',
    );
  });

  it('refuses a flag that is not a boolean', () => {
    expect(rejected({ startingCommunityBuilt: 'yes' })?.reason).toBe('damaged-campaign');
  });

  /**
   * `origin` is the one optional field on the shape, so it needs both halves
   * asserting: absent is a campaign not using an origin and has to open, while
   * a name this build does not know has to be refused rather than carried — a
   * facilities list gated on an unrecognised origin quietly shows nothing.
   */
  it('refuses an origin it does not recognise, and accepts one it does', () => {
    expect(rejected({ origin: 'radiation' })?.reason).toBe('damaged-campaign');
    expect(rejected({ origin: 7 })?.reason).toBe('damaged-campaign');
    expect(parseCampaignFile(savedWith({ origin: 'magic' })).ok).toBe(true);
  });

  it('opens a campaign with no origin at all', () => {
    expect(parseCampaignFile(savedWith({})).ok).toBe(true);
  });
});

/** The same gap one level down, on a survivor rather than the campaign. */
describe('a survivor whose fields are the wrong type', () => {
  const withSurvivor = (overrides: Record<string, unknown>) =>
    parseCampaignFile(savedWith({ survivors: [{ ...VALID_SURVIVOR, ...overrides }] }));

  it.each([
    ['a numeric id', { id: 7 }],
    ['an empty id', { id: '' }],
    ['a numeric name', { name: 7 }],
    ['a string Tier', { tier: '4' }],
    ['stats that aren’t an object', { stats: 'strong' }],
    [
      'a string stat value',
      { stats: { strength: '3', dexterity: 2, intelligence: 4, cooperation: 1 } },
    ],
    [
      'a negative stat value',
      { stats: { strength: -1, dexterity: 2, intelligence: 4, cooperation: 1 } },
    ],
    ['skills that aren’t an object', { skills: ['tactics'] }],
    ['a string skill level', { skills: { tactics: '3' } }],
    ['a negative skill level', { skills: { tactics: -1 } }],
    ['a string move score', { move: '7' }],
    ['a negative move score', { move: -1 }],
    ['a string defense score', { defense: '6' }],
    ['a fractional health', { currentHp: 1.5 }],
    ['a fractional infection', { infection: 0.5 }],
    ['a negative experience balance', { xp: -5 }],
    // Story Traits (Z7-1): one of the five, a yes-or-no Veteran, and a bond
    // group on a Bonded survivor and nobody else (R84).
    ['a story trait that isn’t one of the five', { storyTrait: 'veteran' }],
    ['a missing story trait', { storyTrait: undefined }],
    ['a Veteran that isn’t yes or no', { veteran: 'yes' }],
    ['a bond group of 0', { storyTrait: 'bonded', bondGroup: 0 }],
    ['a Bonded survivor with no bond group', { storyTrait: 'bonded', bondGroup: null }],
    ['a bond group without the trait', { storyTrait: 'jaded', bondGroup: 1 }],
    // Attached stories (Z7-2): a list of story missions, each with its turn.
    ['stories that aren’t a list', { stories: 'warehouse' }],
    ['a story that isn’t an object', { stories: ['warehouse'] }],
    [
      'a story that isn’t a story mission',
      { stories: [{ mission: 'scavenge', attachedOnTurn: 1 }] },
    ],
    ['a story with no turn', { stories: [{ mission: 'warehouse', attachedOnTurn: 0 }] }],
  ])('refuses %s', (_label, overrides) => {
    const result = withSurvivor(overrides);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('damaged-campaign');
  });

  /** The counts that are legal, so the checks above are not simply refusing everything. */
  it('accepts a zero stat, a zero level and a zero balance', () => {
    const result = withSurvivor({
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 0 },
      skills: { tactics: 0 },
      move: 0,
      defense: 0,
      currentHp: 0,
      infection: 0,
      xp: 0,
      items: [],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts a survivor’s attached stories', () => {
    expect(withSurvivor({ stories: [{ mission: 'crashed-convoy', attachedOnTurn: 3 }] }).ok).toBe(
      true,
    );
  });

  it('refuses one story held by two survivors, one of them set aside (R136)', () => {
    const story = { stories: [{ mission: 'warehouse', attachedOnTurn: 2 }] };
    const result = parseCampaignFile(
      savedWith({
        survivors: [{ ...VALID_SURVIVOR, ...story }],
        setAside: [{ ...VALID_SURVIVOR, id: 'someone-else', ...story }],
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/two survivors hold one story: warehouse/);
  });

  it('accepts every story trait, a Veteran, and a Bonded survivor’s group', () => {
    for (const storyTrait of ['jaded', 'berserk', 'lone-wolf', 'driven']) {
      expect(withSurvivor({ storyTrait, veteran: true }).ok, storyTrait).toBe(true);
    }
    expect(withSurvivor({ storyTrait: 'bonded', bondGroup: 2 }).ok).toBe(true);
  });
});

/**
 * The guard that keeps this module's central promise (issue #40).
 *
 * `parseCampaignFile` says it always returns a result and never throws — the
 * UI branches on one shape and has no catch. `Array.isArray` is what holds that
 * up here: without it, `value.survivors.entries()` on a campaign whose survivor
 * list is a number raises an uncaught `TypeError` and takes the render tree down
 * mid-import.
 *
 * Nothing tested it, because every earlier damaged-file case gave `survivors` a
 * bad *element* rather than making it the wrong thing entirely. Asserted as
 * "does not throw" first and "refused" second, in that order, because the throw
 * is the serious failure.
 */
describe('a campaign whose survivor list is not a list', () => {
  it.each([
    ['a number', 5],
    ['a string', 'Earl Rhodes'],
    ['an object', { 0: 'Earl Rhodes' }],
    ['null', null],
  ])('refuses %s without throwing', (_label, survivors) => {
    const text = savedWith({ survivors });
    let result: ReturnType<typeof parseCampaignFile> | undefined;

    expect(() => {
      result = parseCampaignFile(text);
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    if (result?.ok === false) expect(result.error.reason).toBe('damaged-campaign');
  });
});

/** The base's Inventory and what survivors carry (Z5-2). */
describe('a campaign whose items are damaged', () => {
  const pistol = { id: 'item-1', item: 'pistol', grade: 'standard' };

  function refusalFor(overrides: Record<string, unknown>) {
    const result = parseCampaignFile(savedWith(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');

    expect(result.error.reason).toBe('damaged-campaign');
    return result.error.message;
  }

  it('reads items back as they were written, the base’s and a survivor’s', () => {
    const carried = { id: 'item-2', item: 'heavy', grade: 'shoddy' };
    const result = parseCampaignFile(
      savedWith({ inventory: [pistol], survivors: [{ ...VALID_SURVIVOR, items: [carried] }] }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.inventory).toEqual([pistol]);
    expect(result.campaign.survivors[0]?.items).toEqual([carried]);
  });

  it('reads a rare upgrade installed in a facility back as it was written (Z5-8)', () => {
    const grill = { id: 'grill', item: 'gas-grill', grade: 'standard' } as const;
    const result = parseCampaignFile(
      savedWith({ base: { id: 'hobby-farm', slots: { kitchen: { installed: [grill] } } } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.base?.slots.kitchen?.installed).toEqual([grill]);
  });

  it.each([
    ['an Inventory that isn’t a list', { inventory: 'everything' }, /Inventory isn’t a list/],
    [
      'an item this version doesn’t know',
      { inventory: [{ ...pistol, item: 'chainsaw' }] },
      /doesn’t know: chainsaw/,
    ],
    [
      'an item in a grade it doesn’t come in',
      { inventory: [{ ...pistol, item: 'backpack', grade: 'standard' }] },
      /backpack in a grade it doesn’t come in/,
    ],
    ['an item with no id', { inventory: [{ ...pistol, id: '' }] }, /item 1 of 1 has no id/],
    [
      'a shoddy item in the base, which nobody owns (R35)',
      { inventory: [{ ...pistol, grade: 'shoddy' }] },
      /shoddy item/,
    ],
    [
      'one id held in two places',
      { inventory: [pistol], survivors: [{ ...VALID_SURVIVOR, items: [pistol] }] },
      /two items with one id: item-1/,
    ],
    [
      'a survivor with no list of items',
      { survivors: [{ ...VALID_SURVIVOR, items: undefined }] },
      /carries a list that isn’t a list/,
    ],
    // Rare upgrades installed in a facility (R47; Z5-8).
    [
      'installed items that aren’t a list',
      { base: { id: 'hobby-farm', slots: { kitchen: { installed: 'a grill' } } } },
      /installed items where isn’t a list/,
    ],
    [
      'an installed item that isn’t a rare upgrade',
      { base: { id: 'hobby-farm', slots: { kitchen: { installed: [pistol] } } } },
      /isn’t a rare upgrade/,
    ],
    [
      'an installed item that shares an id with one in the Inventory',
      {
        inventory: [{ ...pistol, id: 'grill' }],
        base: {
          id: 'hobby-farm',
          slots: {
            kitchen: { installed: [{ id: 'grill', item: 'gas-grill', grade: 'standard' }] },
          },
        },
      },
      /two items with one id: grill/,
    ],
  ])('refuses %s', (_label, overrides, expected) => {
    expect(refusalFor(overrides)).toMatch(expected);
  });
});

/** The survivors a move sent away (R31; Z4-8), checked as the roster is. */
describe('a campaign whose set-aside list is damaged', () => {
  function refusalFor(overrides: Record<string, unknown>) {
    const result = parseCampaignFile(savedWith(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');

    expect(result.error.reason).toBe('damaged-campaign');
    return result.error.message;
  }

  it('reads a set-aside survivor back as they were written', () => {
    const result = parseCampaignFile(savedWith({ setAside: [VALID_SURVIVOR] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.setAside).toEqual([VALID_SURVIVOR]);
  });

  it('refuses a list that is not a list', () => {
    expect(refusalFor({ setAside: 'everybody' })).toMatch(/set aside is missing/);
  });

  it('refuses a set-aside survivor with a damaged field, and says which one', () => {
    expect(refusalFor({ setAside: [{ ...VALID_SURVIVOR, xp: -1 }] })).toMatch(
      /set-aside survivor 1 of 1 has unreadable experience/,
    );
  });

  it('refuses somebody both in the community and set aside', () => {
    expect(refusalFor({ survivors: [VALID_SURVIVOR], setAside: [VALID_SURVIVOR] })).toMatch(
      /both in the community and set aside/,
    );
  });
});

/**
 * Names that every object already has.
 *
 * `'toString' in FACILITIES` is `true`, because `in` walks the prototype chain
 * — so a catalogue lookup guarded by `in` accepts `toString`, `constructor` and
 * `valueOf` as though they were real entries, and hands the caller a function.
 * Found while adding the log's own validation in Z3-2, and fixed across the
 * whole module rather than only in the new code: the base lookup was the worst
 * of them, because `BASES.toString.slots` is `undefined` and the very next line
 * calls `.some` on it.
 *
 * These are not exotic inputs. They are ordinary words, and this module's whole
 * contract is that a damaged file comes back as a sentence rather than as an
 * exception thrown from somewhere else entirely.
 */
describe('a campaign naming something every object already has', () => {
  const inherited = ['toString', 'constructor', 'valueOf', '__proto__'];

  function refusal(text: string) {
    let result: ReturnType<typeof parseCampaignFile> | undefined;

    expect(() => {
      result = parseCampaignFile(text);
    }).not.toThrow();

    expect(result?.ok).toBe(false);
    if (result?.ok === false) expect(result.error.reason).toBe('damaged-campaign');

    return result;
  }

  it.each(inherited)('refuses %s as a base rather than crashing on it', (name) => {
    refusal(savedWith({ base: { id: name, slots: {} } }));
  });

  it.each(inherited)('refuses %s as a facility rather than crashing on it', (name) => {
    refusal(
      savedWith({
        base: {
          id: 'hobby-farm',
          slots: { garden: { built: { facility: name, builtOnTurn: 1 } } },
        },
      }),
    );
  });

  it.each(inherited)('refuses %s as a kind of log entry rather than crashing on it', (name) => {
    refusal(
      savedWith({
        log: [{ turn: 1, phase: 'mission', at: '2026-09-08T21:00:00.000Z', event: { kind: name } }],
      }),
    );
  });

  it.each(inherited)('refuses %s as a survivor skill rather than crashing on it', (name) => {
    refusal(
      savedWith({
        survivors: [
          {
            id: 'a',
            name: 'Earl Rhodes',
            tier: 1,
            stats: { strength: 1, dexterity: 0, intelligence: 0, cooperation: 0 },
            skills: { [name]: 0 },
            move: 6,
            defense: 6,
            currentHp: 1,
            xp: 0,
          },
        ],
      }),
    );
  });
});

/**
 * The campaign log, checked the way the roster and the base are: shape only,
 * one problem named, and never a thrown exception.
 *
 * There is no "illegal entry" to be permissive about here, unlike a survivor or
 * a slot — a log records what happened, and what happened happened. What these
 * defend against is a file edited or truncated since it was saved, where an
 * entry with a missing field would put `undefined` into a line of someone's
 * campaign history instead of saying the file is damaged.
 */
describe('a campaign whose log is damaged', () => {
  const good = {
    turn: 2,
    phase: 'advancement',
    at: '2026-09-08T21:00:00.000Z',
    event: { kind: 'survivor-added', survivor: 'a', name: 'Earl Rhodes', tier: 3 },
  };

  /** The Rare Items trade's entries (Z5-10), read as the campaign's trade is. */
  it.each([
    [
      'a trade made with an unreadable item',
      { kind: 'rare-trade-made', items: [{ id: 'a', item: 'riot-shield', grade: 'standard' }] },
      'unreadable items',
    ],
    [
      'a vehicle driven off with no roll',
      {
        kind: 'retrieve-new-vehicles-resolved',
        team: 1,
        vehiclesDrivenOff: 1,
        retrieved: [{ id: 'car', tier: 1, label: 'Car', water: false }],
        strangers: [],
      },
      'unreadable retrieved',
    ],
    [
      'a vehicle added that isn’t one',
      { kind: 'vehicle-added', vehicle: { id: 'car', tier: 9, label: 'Car', water: false } },
      'unreadable vehicle',
    ],
    [
      'a trade lost for a reason this version doesn’t know',
      { kind: 'rare-trade-lost', reason: 'weather', items: [], food: 0, fuel: 0 },
      'unreadable reason',
    ],
  ])('refuses %s', (_label, event, expected) => {
    const result = parseCampaignFile(savedWith({ log: [{ ...good, event }] }));

    expect(result.ok ? null : result.error.message).toContain(expected);
  });

  function refusalFor(log: unknown) {
    const result = parseCampaignFile(savedWith({ log }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');

    expect(result.error.reason).toBe('damaged-campaign');
    return result.error.message;
  }

  it('accepts a log that is right, so the refusals below mean something', () => {
    const result = parseCampaignFile(savedWith({ log: [good] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.log).toEqual([good]);
  });

  /**
   * Both shapes of the entry that records a Planning Phase clearing what came
   * before it: one written by a build that carried the assignments, and one
   * written before it did. Neither is damaged, and a reader that demanded the
   * field would refuse every campaign saved before issue #95 was fixed.
   */
  it.each([
    ['carrying what it cleared', { kind: 'planning-began', cleared: { earl: { task: 'rest' } } }],
    ['carrying nothing, as older saves do', { kind: 'planning-began' }],
  ])('accepts a Planning Phase entry %s', (_name, event) => {
    const result = parseCampaignFile(savedWith({ log: [{ ...good, event }] }));

    expect(result.ok).toBe(true);
  });

  /** A Claim chosen since Z4-7 names its base, and one chosen before it does not. */
  it.each([
    ['naming its base', { base: 'distillery' }],
    ['naming none, as one chosen before Z4-7 does', {}],
  ])('accepts a Claim a New Base selection %s', (_name, base) => {
    const event = {
      kind: 'mission-selected',
      team: 1,
      mission: 'claim-a-new-base',
      names: ['Earl Rhodes'],
      ...base,
    };

    expect(parseCampaignFile(savedWith({ log: [{ ...good, event }] })).ok).toBe(true);
  });

  /** A survivor's leaving says why since #201, and one written before it does not. */
  it.each([
    ['naming why', { cause: 'bitten' }, true],
    ['naming nothing, as one written before #201 does', {}, true],
    ['naming a cause this version doesn’t know', { cause: 'eaten' }, false],
  ])('reads a survivor’s leaving %s', (_name, cause, ok) => {
    const event = {
      kind: 'survivor-left',
      survivor: 'earl',
      name: 'Earl Rhodes',
      tier: 2,
      ...cause,
    };
    const result = parseCampaignFile(savedWith({ log: [{ ...good, event }] }));

    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.error.message).toMatch(/unreadable cause/i);
  });

  it.each([
    ['not a list at all', 5, /campaign log is missing/i],
    ['an entry that isn’t an object', [7], /isn’t a log entry/i],
    ['an entry with no turn', [{ ...good, turn: undefined }], /which turn/i],
    ['an entry from turn zero', [{ ...good, turn: 0 }], /which turn/i],
    ['an entry from half a turn', [{ ...good, turn: 1.5 }], /which turn/i],
    // Both halves of the phase check, which disagree only on these two: a
    // string that is not a phase, and a phase-shaped value that is not a
    // string. One case alone leaves the other half of the `||` untested.
    ['an entry from a phase that doesn’t exist', [{ ...good, phase: 'brunch' }], /phase/i],
    ['an entry whose phase isn’t even a word', [{ ...good, phase: 3 }], /phase/i],
    // Likewise for the timestamp: unparseable text, and a value that is not
    // text at all.
    ['an entry timed to nonsense', [{ ...good, at: 'sometime tuesday' }], /time/i],
    ['an entry timed to a number', [{ ...good, at: 20260908 }], /time/i],
    // The number that `Date.parse` is happy with. Without the `typeof` half of
    // that check this one is accepted and renders as 1970.
    ['an entry timed to a bare year', [{ ...good, at: 2026 }], /time/i],
    [
      'an entry that doesn’t say what happened',
      [{ ...good, event: 'something' }],
      /what happened/i,
    ],
    ['an entry whose kind isn’t a word', [{ ...good, event: { kind: 12 } }], /doesn’t know about/i],
    [
      'an entry whose kind this version has never heard of',
      [{ ...good, event: { kind: 'survivor-abducted' } }],
      /doesn’t know about/i,
    ],
    // A real kind, wrapped in a list. `Object.hasOwn` coerces its key, so this
    // stringifies to a name the table has and passes the lookup — the `typeof`
    // half of that check is the only thing between it and being accepted.
    [
      'an entry whose kind is a real one in a box',
      [{ ...good, event: { kind: ['turn-began'] } }],
      /doesn’t know about/i,
    ],
    // The assignments a `planning-began` entry cleared. An older entry carries
    // nothing, which is accepted below; anything present has to be readable,
    // because the Advancement Phase reads it back as though it were live.
    [
      'a clearing that isn’t a set of assignments',
      [{ ...good, event: { kind: 'planning-began', cleared: 'everything' } }],
      /unreadable cleared/i,
    ],
    [
      'a clearing naming a task this version doesn’t know',
      [{ ...good, event: { kind: 'planning-began', cleared: { earl: { task: 'foraging' } } } }],
      /unreadable cleared/i,
    ],
    [
      'a clearing whose staffing doesn’t say where',
      [{ ...good, event: { kind: 'planning-began', cleared: { earl: { task: 'staff' } } } }],
      /unreadable cleared/i,
    ],
    // The field loop: a kind this version knows, carrying a field it cannot
    // read. Nothing above reaches past the discriminant.
    [
      'a rescue bringing back somebody with no id',
      [
        {
          ...good,
          event: { kind: 'rescue-strangers-resolved', team: 1, strangers: [], returned: [''] },
        },
      ],
      /unreadable returned/i,
    ],
    [
      'a way on from an overrun the book doesn’t give',
      [{ ...good, event: { kind: 'overrun-continued', option: 'surrender' } }],
      /unreadable option/i,
    ],
    [
      'a move whose stores aren’t counts',
      [
        {
          ...good,
          event: {
            kind: 'base-moved',
            from: 'hobby-farm',
            to: 'hobby-farm',
            setAside: [],
            stores: { food: -1, fuel: 0, hardware: 0 },
          },
        },
      ],
      /unreadable stores/i,
    ],
    [
      'a claim aimed at a base that isn’t on the roster',
      [
        {
          ...good,
          event: {
            kind: 'mission-selected',
            team: 1,
            mission: 'claim-a-new-base',
            names: [],
            base: 'castle',
          },
        },
      ],
      /unreadable base/i,
    ],
    [
      'an entry about a survivor of no known Tier',
      [{ ...good, event: { ...good.event, tier: 99 } }],
      /unreadable Tier/i,
    ],
    [
      'an entry about a survivor with no name',
      [{ ...good, event: { ...good.event, name: null } }],
      /unreadable name/i,
    ],
    [
      'an entry naming a skill that doesn’t exist',
      [
        {
          ...good,
          event: {
            kind: 'skill-level-bought',
            survivor: 'a',
            name: 'Earl',
            skill: 'yodel',
            level: 1,
          },
        },
      ],
      /unreadable skill/i,
    ],
    [
      'an entry raising Move as though it were a governed skill',
      [
        {
          ...good,
          event: {
            kind: 'skill-level-bought',
            survivor: 'a',
            name: 'Earl',
            skill: 'move',
            level: 1,
          },
        },
      ],
      /unreadable skill/i,
    ],
    // Which rescue a stranger who joined answers (Z4-5): a team from one and
    // a place in its list from zero.
    [
      'a stranger who joined from before the first in the list',
      [
        {
          ...good,
          event: { ...good.event, kind: 'stranger-joined', team: 1, stranger: -1 },
        },
      ],
      /unreadable stranger/i,
    ],
    [
      'a stranger who joined from mission team 0',
      [
        {
          ...good,
          event: { ...good.event, kind: 'stranger-joined', team: 0, stranger: 0 },
        },
      ],
      /unreadable team/i,
    ],
    // What a story gave a survivor it brought (Z7-3, Z7-4).
    [
      'a stranger who joined with a build of nothing',
      [
        {
          ...good,
          event: { ...good.event, kind: 'stranger-joined', team: 1, stranger: 0, build: {} },
        },
      ],
      /unreadable build/i,
    ],
    [
      'a stranger who joined into bond group 0',
      [
        {
          ...good,
          event: { ...good.event, kind: 'stranger-joined', team: 1, stranger: 0, bondGroup: 0 },
        },
      ],
      /unreadable bondGroup/i,
    ],
  ])('refuses %s', (_label, log, expected) => {
    expect(refusalFor(log)).toMatch(expected);
  });

  // A story's ending (Z7-3), shape only.
  it.each([
    ['with no result', { result: '' }],
    ['with a trait nobody has', { trait: 'brave' }],
    ['with XP of 0', { xp: 0 }],
    ['kept with anything but true', { stays: false }],
    [
      'attaching a mission that is no story',
      { attached: { mission: 'thin-the-herd', survivor: 'a', name: 'Earl' } },
    ],
    ['attaching to nobody', { attached: { mission: 'warehouse', survivor: '', name: 'Earl' } }],
    ['bringing a Tier 5', { joins: { tier: 5 } }],
    ['bringing a survivor into bond group 0', { joins: { tier: 2, bondGroup: 0 } }],
    ['naming nobody', { survivor: '' }],
    ['naming somebody by a number', { survivor: 5 }],
    ['with a name that is a number', { name: 5 }],
    ['with a result that is a number', { result: 5 }],
    ['attaching by a bare name', { attached: 'warehouse' }],
    // What Z7-4 added.
    [
      'also attaching a mission that is no story',
      { alsoAttached: [{ mission: 'chased', survivor: 'a', name: 'Earl' }] },
    ],
    ['also attaching something not a list', { alsoAttached: { mission: 'warehouse' } }],
    [
      'giving an item of no known source',
      { items: [{ id: 'i', item: 'rifle', grade: 'quality', from: 'gift' }] },
    ],
    [
      'giving an item to a survivor unnamed',
      { items: [{ id: 'i', item: 'rifle', grade: 'quality', from: 'found-item', survivor: 'a' }] },
    ],
    [
      'giving an item rolled off the d10',
      { items: [{ id: 'i', item: 'rifle', grade: 'quality', from: 'quality-roll', entry: 11 }] },
    ],
    [
      'giving an item in a grade it lacks',
      { items: [{ id: 'i', item: 'rifle', grade: 'mythic', from: 'found-item' }] },
    ],
    ['giving items that are not a list', { items: 'rifle' }],
    ['giving no Food', { food: 0 }],
    ['giving a vehicle with no Tier', { vehicle: { id: 'boat', label: 'Boat', water: true } }],
    ['making somebody unnamed Jaded', { jaded: { survivor: 'a' } }],
    ['counting resources below 0', { resources: -1 }],
    [
      'bringing a survivor with a skill nobody knows',
      {
        joins: {
          tier: 3,
          build: {
            skill: 'juggling',
            stat: { dexterity: 3 },
            item: { item: 'rifle', grade: 'quality' },
          },
        },
      },
    ],
    [
      'bringing a survivor with no Dexterity',
      {
        joins: {
          tier: 3,
          build: { skill: 'long-guns', stat: {}, item: { item: 'rifle', grade: 'quality' } },
        },
      },
    ],
    [
      'bringing a survivor carrying no item',
      { joins: { tier: 3, build: { skill: 'long-guns', stat: { dexterity: 3 } } } },
    ],
  ] as const)('refuses a story ending %s', (_label, story) => {
    expect(
      refusalFor([
        {
          ...good,
          event: {
            kind: 'mission-played',
            team: 1,
            mission: 'left-behind-1',
            story: { survivor: 'a', name: 'Earl', result: 'rescued', ...story },
          },
        },
      ]),
    ).toMatch(/unreadable story/i);
  });

  /**
   * A mission's wounds (Z4-4): absent on every outcome written before them,
   * and checked for shape only when present — never against the roster or a
   * survivor's maximum, because the survivor may have left or been promoted
   * since.
   */
  describe('the wounds a mission outcome carries', () => {
    const outcome = (wounds: unknown) => ({
      ...good,
      phase: 'mission',
      event: {
        kind: 'gather-materials-resolved',
        strangers: [],
        team: 1,
        materialsCarriedOut: 2,
        ...(wounds === undefined ? {} : { wounds }),
      },
    });

    it.each([
      ['none, as an outcome written before them', undefined],
      ['nobody', []],
      ['Health and nothing else', [{ survivor: 'a', name: 'Earl', health: 0 }]],
      ['Infection beside it', [{ survivor: 'a', name: 'Earl', health: 9, infection: 12 }]],
    ])('accepts %s', (_label, wounds) => {
      expect(parseCampaignFile(savedWith({ log: [outcome(wounds)] })).ok).toBe(true);
    });

    it.each([
      ['not a list', { a: 1 }],
      ['a wound that isn’t an object', [3]],
      ['a wound naming nobody', [{ name: 'Earl', health: 1 }]],
      ['a wound naming an empty id', [{ survivor: '', name: 'Earl', health: 1 }]],
      ['a wound with no name', [{ survivor: 'a', health: 1 }]],
      ['a wound with negative Health', [{ survivor: 'a', name: 'Earl', health: -1 }]],
      ['a wound with no Health', [{ survivor: 'a', name: 'Earl' }]],
      [
        'a wound with fractional Infection',
        [{ survivor: 'a', name: 'E', health: 1, infection: 0.5 }],
      ],
    ])('refuses %s', (_label, wounds) => {
      expect(refusalFor([outcome(wounds)])).toMatch(/unreadable wounds/i);
    });
  });

  /**
   * The position, counted from one.
   *
   * A reader with a damaged file needs to be told which entry, and "log entry 0
   * of 2" is the kind of thing that makes someone doubt the message rather than
   * the file. Pinned here because an off-by-one is otherwise invisible.
   */
  it('counts the damaged entry from one, and says how many there are', () => {
    expect(refusalFor([good, { ...good, turn: 0 }])).toMatch(/log entry 2 of 2/);
    expect(refusalFor([{ ...good, turn: 0 }, good, good])).toMatch(/log entry 1 of 3/);
  });
});

/**
 * Assignments, checked the way the log and the base are: shape only, one
 * problem named, and never a thrown exception.
 *
 * **The line sits in a different place here than for a slot.** That a survivor
 * is staffing a facility that does not exist, resting at full Health, or on a
 * mission team while injured are all *rules* (pg. 20–21) — Z3-6 reports them,
 * and a player may be part-way through fixing one when they save. What this
 * refuses is an assignment that refers to nothing.
 */
/**
 * The project queue, checked the way the log is: shape only, one problem named,
 * and never a thrown exception.
 *
 * **Shape, not legality.** A project queued for a slot the base does not have,
 * or for a facility that slot could not hold, is a rule the screens report
 * rather than a damaged file — and Z1-7's override means a campaign can
 * genuinely hold one. What these refuse is a project that refers to nothing.
 */
describe('a campaign whose project queue is damaged', () => {
  const good = {
    kind: 'facility',
    slot: 'garage',
    facility: 'workshop',
    orderedOnTurn: 2,
    charged: { hardware: 3, labor: 2 },
  };

  function refusalFor(projects: unknown) {
    const result = parseCampaignFile(savedWith({ projects }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');

    expect(result.error.reason).toBe('damaged-campaign');
    return result.error.message;
  }

  it.each([
    ['a facility', good],
    [
      'an upgrade',
      {
        kind: 'upgrade',
        slot: 'kitchen',
        upgrade: 'gas-range',
        orderedOnTurn: 2,
        charged: { hardware: 2, labor: 1 },
      },
    ],
    [
      'a clearing',
      {
        kind: 'clearing',
        slot: 'ruined-chicken-coop',
        orderedOnTurn: 2,
        charged: { hardware: 0, labor: 2 },
      },
    ],
  ])('accepts %s, so the refusals below mean something', (_label, project) => {
    const result = parseCampaignFile(savedWith({ projects: [project] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.projects).toEqual([project]);
  });

  it.each([
    ['not a list at all', 5, /project queue is missing/i],
    ['a project that isn’t an object', [7], /isn’t a project/i],
    [
      'a kind this version has never heard of',
      [{ ...good, kind: 'demolition' }],
      /doesn’t know: demolition/i,
    ],
    ['a kind that isn’t a word', [{ ...good, kind: 12 }], /doesn’t know: 12/i],
    // `in` would accept this: every object has a `toString`. `isKeyOf` does not.
    ['a kind every object already has', [{ ...good, kind: 'toString' }], /doesn’t know/i],
    // A real kind, wrapped in a list. `Object.hasOwn` coerces its key, so this
    // stringifies to a name the table has and passes the lookup — the `typeof`
    // half of that check is the only thing between it and being accepted, and
    // a `kind` that is an array is not a project this app can render.
    ['a kind that is a real one in a box', [{ ...good, kind: ['facility'] }], /doesn’t know/i],
    ['a project that doesn’t say which slot', [{ ...good, slot: undefined }], /which slot/i],
    ['a project whose slot isn’t a word', [{ ...good, slot: 4 }], /which slot/i],
    ['a project with no turn on it', [{ ...good, orderedOnTurn: undefined }], /which turn/i],
    ['a project ordered on turn zero', [{ ...good, orderedOnTurn: 0 }], /which turn/i],
    ['a project ordered on half a turn', [{ ...good, orderedOnTurn: 1.5 }], /which turn/i],
    // The per-kind fields: only two kinds have one, and each has its own.
    [
      'a facility that isn’t in the catalogue',
      [{ ...good, facility: 'moon-base' }],
      /unreadable facility/i,
    ],
    [
      'an upgrade that isn’t in the catalogue',
      [
        {
          kind: 'upgrade',
          slot: 'kitchen',
          upgrade: 'jacuzzi',
          orderedOnTurn: 2,
          charged: { hardware: 2, labor: 1 },
        },
      ],
      /unreadable upgrade/i,
    ],
    // From v12, and required of every kind: the refund is this number read back
    // rather than a price computed again, so an order that does not carry one
    // is an order nothing can honestly cancel (#165).
    ['a project with no charge on it', [{ ...good, charged: undefined }], /what it was charged/i],
    [
      'a charge that isn’t a pair of counts',
      [{ ...good, charged: { hardware: 3 } }],
      /what it was charged/i,
    ],
    [
      'a charge that has gone negative',
      [{ ...good, charged: { hardware: -1, labor: 2 } }],
      /what it was charged/i,
    ],
    // A clearing carries nothing of its own, so a stray facility id on one is
    // not checked and not a refusal — the queue says what the project is.
  ])('refuses %s', (_label, projects, says) => {
    expect(refusalFor(projects)).toMatch(says);
  });

  /** Positional, like log entries: a damaged kind cannot be named by its kind. */
  it('says which project in the queue is the damaged one', () => {
    expect(refusalFor([good, good, { ...good, facility: 'moon-base' }])).toMatch(
      /project 3 of 3 has an unreadable facility/i,
    );
  });
});

describe('a campaign whose assignments are damaged', () => {
  const EARL = 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53';

  const roster = [
    {
      id: EARL,
      name: 'Earl Rhodes',
      tier: 4,
      stats: { strength: 3, dexterity: 2, intelligence: 4, cooperation: 1 },
      skills: { archery: 1 },
      move: 6,
      defense: 6,
      currentHp: 4,
      infection: 0,
      xp: 0,
      items: [],
      storyTrait: null,
      veteran: false,
      bondGroup: null,
      stories: [],
    },
  ];

  function refusalFor(assignments: unknown) {
    const result = parseCampaignFile(savedWith({ survivors: roster, assignments }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');

    expect(result.error.reason).toBe('damaged-campaign');
    return result.error.message;
  }

  it.each([
    ['staff', { task: 'staff', slot: 'kitchen' }],
    ['project', { task: 'project' }],
    ['rest', { task: 'rest' }],
    ['healing', { task: 'healing' }],
    ['mission', { task: 'mission', team: 1 }],
    ['scavenging', { task: 'scavenging' }],
  ])('accepts %s, so the refusals below mean something', (_label, assignment) => {
    const result = parseCampaignFile(
      savedWith({ survivors: roster, assignments: { [EARL]: assignment } }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.assignments).toEqual({ [EARL]: assignment });
  });

  it.each([
    ['not a record at all', 5, /what its survivors are doing/i],
    ['an assignment that isn’t an object', { [EARL]: 'resting' }, /isn’t an assignment/i],
    [
      'a task this version has never heard of',
      { [EARL]: { task: 'foraging' } },
      /doesn’t know: foraging/i,
    ],
    ['a task that isn’t a word', { [EARL]: { task: 7 } }, /doesn’t know: 7/i],
    // `in` would accept this: every object has a `toString`. `isKeyOf` does not.
    ['a task every object already has', { [EARL]: { task: 'toString' } }, /doesn’t know/i],
    ['staffing that doesn’t say where', { [EARL]: { task: 'staff' } }, /unreadable slot/i],
    [
      'a mission team that isn’t a team',
      { [EARL]: { task: 'mission', team: 0 } },
      /unreadable team/i,
    ],
    // The orphan: a task given to somebody the roster does not hold.
    [
      'a task given to a stranger',
      { 'not-a-survivor': { task: 'rest' } },
      /isn’t in the community: not-a-survivor/i,
    ],
  ])('refuses %s', (_label, assignments, expected) => {
    expect(refusalFor(assignments)).toMatch(expected);
  });
});
