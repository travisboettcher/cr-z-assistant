import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createNewCampaign } from '../engine/campaign';
import { MIGRATION_STEPS, migrate } from './migrations';

/**
 * Fixtures are discovered from the directory rather than listed here on
 * purpose. A hand-maintained list is one more thing to forget alongside the
 * step and the version bump, and the whole point of this file is to catch
 * exactly that kind of forgetting.
 */
const fixtureModules = import.meta.glob<Record<string, unknown>>(
  './__fixtures__/campaign-v*.json',
  {
    eager: true,
    import: 'default',
  },
);

const fixtures = Object.entries(fixtureModules)
  .map(([path, contents]) => ({
    path,
    version: Number(/campaign-v(\d+)\.json$/.exec(path)?.[1]),
    contents,
  }))
  .sort((a, b) => a.version - b.version);

const versionsUpToCurrent = Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, i) => i + 1);

/**
 * The story's central acceptance: bumping `CURRENT_SCHEMA_VERSION` alone must
 * turn this suite red. Each test below is one half of the trap, and the third
 * is what makes the other two more than bookkeeping.
 */
describe('the version-bump guard', () => {
  /**
   * Fails the moment the version outruns the registry: at version N the chain
   * must be N - 1 single-version links starting at 1, with no holes and no
   * jumps. Comparing the whole list rather than just its length also catches a
   * step wired to the wrong pair of versions.
   */
  it('has one migration step per version bump, each moving exactly one version', () => {
    const expected = Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, i) => ({
      from: i + 1,
      to: i + 2,
    }));

    expect(MIGRATION_STEPS.map(({ from, to }) => ({ from, to }))).toEqual(expected);
  });

  /**
   * Every version ever shipped keeps a fixture, current one included — a
   * version with no sample of its shape cannot be proven to still load, and
   * today's current version is tomorrow's old shape.
   */
  it('checks in a fixture for every schema version, named for the version it holds', () => {
    expect(fixtures.map((fixture) => fixture.version)).toEqual(versionsUpToCurrent);

    for (const fixture of fixtures) {
      expect(fixture.contents.schemaVersion, `${fixture.path} is not the version it claims`).toBe(
        fixture.version,
      );
    }
  });

  /**
   * The test that stops the other two from being satisfied by a copied file
   * and a no-op step. Every historical shape has to come out of the chain
   * looking like a campaign this build recognises, so a bump that adds a field
   * to `Campaign` without a step that fills it in fails here.
   *
   * It compares top-level keys, so a change confined to a nested shape passes
   * this particular assertion — the step and fixture are still mandatory, and
   * a change like that deserves its own assertion added alongside its step.
   */
  it('brings every checked-in fixture up to the current campaign shape', () => {
    const expectedKeys = Object.keys(createNewCampaign('Cedar Hollow')).sort();

    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(Object.keys(result.campaign).sort(), `${fixture.path} is missing a field`).toEqual(
        expectedKeys,
      );
    }
  });
});

describe('migrate', () => {
  it('yields a current-version campaign from the v1 fixture', () => {
    const v1 = fixtures.find((fixture) => fixture.version === 1);
    const result = migrate(v1?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.campaign.name).toBe('Cedar Hollow');
    expect(result.campaign.turn).toBe(3);
    expect(result.campaign.phase).toBe('planning');
    expect(result.campaign.materials).toEqual({ food: 4, fuel: 2, hardware: 7, rare: 1 });
  });

  it('leaves the original object untouched', () => {
    const v1 = fixtures.find((fixture) => fixture.version === 1);
    const before = structuredClone(v1?.contents);

    migrate(v1?.contents);

    expect(v1?.contents).toEqual(before);
  });

  it('refuses a save from a newer version with a message naming both versions', () => {
    const future = {
      ...createNewCampaign('Cedar Hollow'),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    };
    const result = migrate(future);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('future-version');
    expect(result.error.message).toContain(String(CURRENT_SCHEMA_VERSION + 1));
    expect(result.error.message).toContain(String(CURRENT_SCHEMA_VERSION));
    expect(result.error.message).toMatch(/newer version/i);
  });

  it.each([
    ['null', null],
    ['a string', 'not a campaign'],
    ['an object with no version', { name: 'Cedar Hollow' }],
    ['a non-numeric version', { schemaVersion: '1' }],
    ['a fractional version', { schemaVersion: 1.5 }],
    ['version zero', { schemaVersion: 0 }],
  ])('refuses %s rather than guessing at a version', (_label, raw) => {
    const result = migrate(raw);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.reason).toBe('unreadable-version');
    expect(result.error.message.length).toBeGreaterThan(0);
  });
});
