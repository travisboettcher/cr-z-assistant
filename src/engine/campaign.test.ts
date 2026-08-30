import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_PHASES,
  CURRENT_SCHEMA_VERSION,
  MATERIALS,
  createNewCampaign,
  type Campaign,
} from './campaign';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

describe('createNewCampaign', () => {
  it('starts at turn 1 in the Mission Phase with nothing in storage', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(campaign.name).toBe('Cedar Hollow');
    expect(campaign.turn).toBe(1);
    expect(campaign.phase).toBe('mission');
    expect(campaign.materials).toEqual({ food: 0, fuel: 0, hardware: 0, rare: 0 });
    expect(campaign.survivors).toEqual([]);
    expect(campaign.base).toBeNull();
    expect(campaign.log).toEqual([]);
    expect(campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('honours an injected id and createdAt', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(campaign.id).toBe(FIXED.id);
    expect(campaign.createdAt).toBe(FIXED.createdAt);
  });

  it('generates a distinct id and a valid timestamp when none is given', () => {
    const a = createNewCampaign('Cedar Hollow');
    const b = createNewCampaign('Cedar Hollow');

    expect(a.id).not.toBe(b.id);
    expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
  });

  /**
   * Z0-9's headline acceptance is export → reload → import returning the same
   * campaign. That is only possible if every field survives JSON, so the
   * property is worth pinning at the type's source rather than waiting for the
   * round-trip to fail three rounds later.
   */
  it('round-trips through JSON unchanged', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);
    const restored: Campaign = JSON.parse(JSON.stringify(campaign));

    expect(restored).toEqual(campaign);
  });

  /**
   * A canary, not a tautology. Derived values must never be stored, and the
   * cheapest way that rule gets broken is someone caching `unrest` or a Skill
   * Score onto the campaign because it was convenient. Adding a field to
   * `Campaign` should be a deliberate act that updates this list.
   */
  it('stores exactly the primitive facts and nothing derived', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(Object.keys(campaign).sort()).toEqual([
      'base',
      'createdAt',
      'id',
      'log',
      'materials',
      'name',
      'phase',
      'schemaVersion',
      'survivors',
      'turn',
    ]);
  });
});

describe('constants', () => {
  it('runs the four campaign phases in rulebook order', () => {
    expect(CAMPAIGN_PHASES).toEqual(['mission', 'advancement', 'planning', 'management']);
  });

  it('covers every material in the starting inventory', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(Object.keys(campaign.materials).sort()).toEqual([...MATERIALS].sort());
  });
});
