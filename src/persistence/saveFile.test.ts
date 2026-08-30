import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createNewCampaign, type Campaign } from '../engine/campaign';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';
import v1Fixture from './__fixtures__/campaign-v1.json';

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
