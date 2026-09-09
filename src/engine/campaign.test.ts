import { describe, expect, it } from 'vitest';
import { MATERIALS } from '../data/materials';
import {
  CURRENT_SCHEMA_VERSION,
  createNewCampaign,
  type Campaign,
  type Survivor,
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
   *
   * `origin` is absent and belongs absent: it is optional, and a new campaign
   * has not been asked which apocalypse it is running.
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
      'startingCommunityBuilt',
      'survivors',
      'turn',
    ]);
  });
});

describe('Survivor', () => {
  /**
   * The same canary one level down, and the one that matters most now that a
   * survivor is where the derived values live. Skill Score, max HP, Inventory Slots
   * and labor are all computable from what is here; caching any of them would
   * put a value on the persisted shape that the Phase 3 hunger penalty makes
   * wrong for a whole turn.
   *
   * `satisfies` rather than a plain literal, so adding a field to `Survivor`
   * fails the typecheck here before it fails the assertion.
   */
  it('stores exactly the primitive facts and nothing derived', () => {
    const survivor = {
      id: 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53',
      name: 'Earl Rhodes',
      tier: 4,
      stats: { strength: 3, dexterity: 2, intelligence: 4, cooperation: 1 },
      skills: { 'heavy-weapon': 2, tactics: 3 },
      move: 7,
      defense: 6,
      currentHp: 3,
      xp: 5,
    } satisfies Survivor;

    expect(Object.keys(survivor).sort()).toEqual([
      'currentHp',
      'defense',
      'id',
      'move',
      'name',
      'skills',
      'stats',
      'tier',
      'xp',
    ]);
  });

  /**
   * A partial record, not twenty entries of which most are zero. "Has the skill
   * at level 0" and "does not have the skill" are different states — the first
   * spends one of the survivor's Tier-many skill slots and the second does not.
   */
  it('records only the skills a survivor actually has', () => {
    const rookie = {
      id: 'f60b2d84-9a17-4c3e-85d0-2b7f1e6a9c48',
      name: 'Ruby Vance',
      tier: 1,
      stats: { strength: 0, dexterity: 1, intelligence: 0, cooperation: 0 },
      skills: { handguns: 1 },
      move: 6,
      defense: 6,
      currentHp: 1,
      xp: 0,
    } satisfies Survivor;

    expect(Object.keys(rookie.skills)).toEqual(['handguns']);
    expect('archery' in rookie.skills).toBe(false);
  });
});

describe('constants', () => {
  it('covers every material in the starting inventory', () => {
    const campaign = createNewCampaign('Cedar Hollow', FIXED);

    expect(Object.keys(campaign.materials).sort()).toEqual([...MATERIALS].sort());
  });
});
