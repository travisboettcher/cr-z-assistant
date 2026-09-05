import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createNewCampaign, type Campaign } from '../engine/campaign';
import { serializeCampaign } from './exportFile';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';
import v1Fixture from './__fixtures__/campaign-v1.json';
import v2Fixture from './__fixtures__/campaign-v2.json';
import v4Fixture from './__fixtures__/campaign-v4.json';

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
    expect(result.campaign.phase).toBe('planning');
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
    ['a phase that is not a phase', { phase: 'harvest' }],
    ['a phase of the wrong type', { phase: 3 }],
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
    const result = parseCampaignFile(savedWith({ phase: 'harvest' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.message).toContain('mission, advancement, planning, management');
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
  it('re-exports a roster byte-identically', () => {
    // The *current* fixture, because byte-identity is a claim about the format
    // this build writes. An older file legitimately comes back one version up,
    // which is the migration working rather than the round trip failing.
    const text = `${JSON.stringify(v4Fixture, null, 2)}\n`;
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

  it('refuses a phase that is not a string', () => {
    expect(rejected({ phase: 3 })?.reason).toBe('damaged-campaign');
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
