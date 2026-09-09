import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createNewCampaign, type Campaign } from '../engine/campaign';
import { serializeCampaign } from './exportFile';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';
import v1Fixture from './__fixtures__/campaign-v1.json';
import v2Fixture from './__fixtures__/campaign-v2.json';
import v7Fixture from './__fixtures__/campaign-v7.json';

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
  xp: 5,
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
    expect(result.campaign.materials).toEqual({ food: 4, fuel: 2, hardware: 7, rare: 1 });
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
    ['a step that is not a step', { step: 'harvest' }],
    ['a step of the wrong type', { step: 3 }],
    ['materials missing a key', { materials: { food: 4, fuel: 2, hardware: 7 } }],
    [
      'a material that is not a number',
      { materials: { food: '4', fuel: 2, hardware: 7, rare: 1 } },
    ],
    ['no materials at all', { materials: undefined }],
    ['a turn of zero', { turn: 0 }],
    ['a fractional turn', { turn: 2.5 }],
    ['a turn that is a string', { turn: '3' }],
    ['no id', { id: '' }],
    ['a name that is not a string', { name: 42 }],
    ['an unreadable creation date', { createdAt: 'last Tuesday' }],
    ['survivors this version cannot read', { survivors: [{ name: 'Rae' }] }],
    ['a base this version cannot read', { base: { rooms: [] } }],
    ['a log this version cannot read', { log: ['turn 1'] }],
  ])('rejects a campaign with %s', (_label, overrides) => {
    const result = parseCampaignFile(savedWith(overrides));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('damaged-campaign');
    expect(result.error.message).toMatch(/County Road Z/);
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
    // and its event's fields both survive a round trip untouched.
    const text = `${JSON.stringify(v7Fixture, null, 2)}\n`;
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
    ['is not an object', 'is not a survivor', null],
    ['has no name', 'has no name', { ...VALID_SURVIVOR, name: 42 }],
    ['has an impossible tier', 'tier that is not one', { ...VALID_SURVIVOR, tier: 7 }],
    // Reports the first stat missing, in the order the rules list them.
    ['is missing a stat', 'no dexterity score', { ...VALID_SURVIVOR, stats: { strength: 1 } }],
    [
      'knows a skill this version does not',
      'skill this version does not know',
      { ...VALID_SURVIVOR, skills: { whittling: 1 } },
    ],
    ['has unreadable health', 'unreadable health', { ...VALID_SURVIVOR, currentHp: 'hurt' }],
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
    ['is not an object', 'its base is not a base', 7],
    [
      'names a base this version does not know',
      'base is one this version does not know',
      { id: 'space-station', slots: {} },
    ],
    ['has no slots', 'its base has no slots', { id: 'hobby-farm' }],
    [
      'has a slot the base does not have',
      'the hobby-farm does not have',
      { id: 'hobby-farm', slots: { 'wine-cellar': {} } },
    ],
    [
      'has a slot that is not an object',
      'is not a slot',
      { id: 'hobby-farm', slots: { garden: 7 } },
    ],
    [
      'has an unreadable facility',
      'has an unreadable facility',
      { id: 'hobby-farm', slots: { 'front-yard': { built: 7 } } },
    ],
    [
      'holds a facility this version does not know',
      'facility this version does not know',
      {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'helipad', builtOnTurn: 1 } } },
      },
    ],
    [
      'does not say when a facility was built',
      'which turn it was built on',
      { id: 'hobby-farm', slots: { 'front-yard': { built: { facility: 'garden' } } } },
    ],
    [
      'holds an upgrade this version does not know',
      'upgrade this version does not know',
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
    expect(rejected({ materials: { food: '4', fuel: 0, hardware: 0, rare: 0 } })?.reason).toBe(
      'damaged-campaign',
    );
  });

  it('refuses a material count that is not finite', () => {
    // `Infinity` does not survive JSON — it serialises to null — which is
    // itself the reason the check is for finiteness rather than just a number.
    expect(rejected({ materials: { food: Infinity, fuel: 0, hardware: 0, rare: 0 } })?.reason).toBe(
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
    ['a string tier', { tier: '4' }],
    ['stats that are not an object', { stats: 'strong' }],
    [
      'a string stat value',
      { stats: { strength: '3', dexterity: 2, intelligence: 4, cooperation: 1 } },
    ],
    [
      'a negative stat value',
      { stats: { strength: -1, dexterity: 2, intelligence: 4, cooperation: 1 } },
    ],
    ['skills that are not an object', { skills: ['tactics'] }],
    ['a string skill level', { skills: { tactics: '3' } }],
    ['a negative skill level', { skills: { tactics: -1 } }],
    ['a string move score', { move: '7' }],
    ['a negative move score', { move: -1 }],
    ['a string defense score', { defense: '6' }],
    ['a fractional health', { currentHp: 1.5 }],
    ['a negative experience balance', { xp: -5 }],
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
      xp: 0,
    });

    expect(result.ok).toBe(true);
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

  it.each([
    ['not a list at all', 5, /campaign log is missing/i],
    ['an entry that is not an object', [7], /is not a log entry/i],
    ['an entry with no turn', [{ ...good, turn: undefined }], /which turn/i],
    ['an entry from turn zero', [{ ...good, turn: 0 }], /which turn/i],
    ['an entry from half a turn', [{ ...good, turn: 1.5 }], /which turn/i],
    // Both halves of the phase check, which disagree only on these two: a
    // string that is not a phase, and a phase-shaped value that is not a
    // string. One case alone leaves the other half of the `||` untested.
    ['an entry from a phase that does not exist', [{ ...good, phase: 'brunch' }], /phase/i],
    ['an entry whose phase is not even a word', [{ ...good, phase: 3 }], /phase/i],
    // Likewise for the timestamp: unparseable text, and a value that is not
    // text at all.
    ['an entry timed to nonsense', [{ ...good, at: 'sometime tuesday' }], /time/i],
    ['an entry timed to a number', [{ ...good, at: 20260908 }], /time/i],
    // The number that `Date.parse` is happy with. Without the `typeof` half of
    // that check this one is accepted and renders as 1970.
    ['an entry timed to a bare year', [{ ...good, at: 2026 }], /time/i],
    [
      'an entry that does not say what happened',
      [{ ...good, event: 'something' }],
      /what happened/i,
    ],
    [
      'an entry whose kind is not a word',
      [{ ...good, event: { kind: 12 } }],
      /does not know about/i,
    ],
    [
      'an entry whose kind this version has never heard of',
      [{ ...good, event: { kind: 'survivor-abducted' } }],
      /does not know about/i,
    ],
    // A real kind, wrapped in a list. `Object.hasOwn` coerces its key, so this
    // stringifies to a name the table has and passes the lookup — the `typeof`
    // half of that check is the only thing between it and being accepted.
    [
      'an entry whose kind is a real one in a box',
      [{ ...good, event: { kind: ['turn-began'] } }],
      /does not know about/i,
    ],
    // The field loop: a kind this version knows, carrying a field it cannot
    // read. Nothing above reaches past the discriminant.
    [
      'an entry about a survivor of no known tier',
      [{ ...good, event: { ...good.event, tier: 99 } }],
      /unreadable tier/i,
    ],
    [
      'an entry about a survivor with no name',
      [{ ...good, event: { ...good.event, name: null } }],
      /unreadable name/i,
    ],
    [
      'an entry naming a skill that does not exist',
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
  ])('refuses %s', (_label, log, expected) => {
    expect(refusalFor(log)).toMatch(expected);
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
