import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createNewCampaign,
  type Base,
  type Campaign,
  type SlotState,
  type Survivor,
} from '../engine/campaign';
import { MIGRATION_STEPS, migrate } from './migrations';

/**
 * The current survivor shape, spelled out. `satisfies` means adding a field to
 * `Survivor` fails the typecheck here, so the key list below cannot quietly
 * fall behind the type it is supposed to be policing.
 */
const SAMPLE_SURVIVOR = {
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
  rotResistant: false,
  madness: 0,
  humanity: 3,
  xpSpent: 0,
  found: false,
  foundCheckPassed: false,
} satisfies Survivor;

/**
 * The current base shape, spelled out, for the same reason `SAMPLE_SURVIVOR`
 * is: `satisfies` means a field added to `Base` fails the typecheck here rather
 * than quietly escaping the nested-shape assertion below.
 *
 * `SlotState` gets its own spelling because every one of its fields is optional
 * — a key list taken from a sample slot would only cover the fields that sample
 * happened to use, so the sample uses all of them.
 */
const TRADE = {
  id: 'traded',
  item: 'pistol',
  grade: 'standard',
  food: 1,
  fuel: 2,
  orderedOnTurn: 3,
};

const SAMPLE_SLOT = {
  cleared: true,
  built: { facility: 'watchtower', builtOnTurn: 2 },
  upgrades: ['spotlight'],
  power: true,
  water: true,
  installed: [{ id: 'grill', item: 'gas-grill', grade: 'standard' }],
} satisfies SlotState;

const SAMPLE_BASE = {
  id: 'hobby-farm',
  slots: { 'front-yard': SAMPLE_SLOT },
} satisfies Base;

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
 * The fields a migrated campaign may legitimately not have.
 *
 * The shape guard below works by comparing a migrated fixture's keys against a
 * freshly created campaign's, and an optional field breaks that outright: it is
 * absent from a new campaign and present on a fixture that uses it, and both are
 * correct. Listing it here is the deliberate act that says so — a *required*
 * field added without a step still fails the guard, because adding it to this
 * list is a separate decision somebody has to make on purpose.
 *
 * `satisfies` keeps the names honest: a field renamed on `Campaign` fails the
 * typecheck here rather than silently exempting a key that no longer exists.
 */
const OPTIONAL_CAMPAIGN_KEYS = ['origin'] as const satisfies readonly (keyof Campaign)[];

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
      expect(fixture.contents.schemaVersion, `${fixture.path} isn’t the version it claims`).toBe(
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
    const optional: readonly string[] = OPTIONAL_CAMPAIGN_KEYS;

    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      // An optional field a fixture happens to carry is set aside rather than
      // counted as a difference; anything else missing or extra is a hole in
      // the chain.
      expect(
        Object.keys(result.campaign)
          .filter((key) => !optional.includes(key))
          .sort(),
        `${fixture.path} is missing a field`,
      ).toEqual(expectedKeys);
    }
  });

  /**
   * The other half of that exemption. Setting a key aside is only safe while it
   * is genuinely optional, so the fixture that carries one has to arrive with it
   * intact: a chain that dropped `origin` on the way forward would otherwise
   * pass the test above by being ignored.
   */
  it('carries an optional field through the chain rather than dropping it', () => {
    const v4 = fixtures.find((fixture) => fixture.version === 4);
    const result = migrate(v4?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.origin).toBe('cosmic-horror');
  });

  /**
   * The assertion the test above asked for.
   *
   * It compares **top-level** keys, and v1 → v2 adds none — `survivors` was
   * always there, it just stopped being empty. So the change that gave
   * survivors a real shape would have sailed through the guard untouched. This
   * is the nested-shape assertion its comment says such a change deserves: from
   * here on, a fixture whose survivors are missing a field fails, which is what
   * makes a future v2 → v3 that forgets one fail too.
   */
  it('brings every fixture survivor up to the current survivor shape', () => {
    const expectedKeys = Object.keys(SAMPLE_SURVIVOR).sort();

    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const [index, survivor] of result.campaign.survivors.entries()) {
        expect(
          Object.keys(survivor).sort(),
          `${fixture.path} survivor ${index + 1} is missing a field`,
        ).toEqual(expectedKeys);
      }
    }
  });

  /**
   * The nested-shape assertion for the base, alongside the one for survivors
   * and for the same reason: v4 → v5 adds no top-level key — `base` was always
   * there, it just stopped being `null` — so the guard above would not have
   * noticed the change at all.
   *
   * Only the keys a fixture actually uses can be checked, because `SlotState`
   * is all-optional and absent is a legitimate value for every field of it. So
   * this asserts the other direction: no fixture may carry a key that is not
   * part of the shape.
   */
  it('brings every fixture base up to the current base shape', () => {
    const baseKeys = Object.keys(SAMPLE_BASE).sort();
    const slotKeys: readonly string[] = Object.keys(SAMPLE_SLOT);

    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok || result.campaign.base === null) continue;

      expect(Object.keys(result.campaign.base).sort(), `${fixture.path} base`).toEqual(baseKeys);

      for (const [id, slot] of Object.entries(result.campaign.base.slots)) {
        for (const key of Object.keys(slot)) {
          expect(slotKeys, `${fixture.path} slot ${id} has an unknown field`).toContain(key);
        }
      }
    }
  });

  /**
   * The base's equivalent of the optional-field test above: a chain that
   * dropped `base` on the way forward would pass the shape guard by leaving
   * `null` behind, which is a legitimate value.
   */
  it('carries a claimed base through the chain rather than dropping it', () => {
    const v5 = fixtures.find((fixture) => fixture.version === 5);
    const result = migrate(v5?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.base?.id).toBe('hobby-farm');
    expect(result.campaign.base?.slots['front-yard']).toEqual({
      built: { facility: 'watchtower', builtOnTurn: 2 },
      upgrades: ['spotlight'],
      power: true,
    });
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
    expect(result.campaign.step).toBe('assign-facility-staff');
    expect(result.campaign.materials).toEqual({ food: 4, fuel: 2, hardware: 7 });
    expect(result.campaign.rareRollsOwed).toBe(1);
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

/**
 * The v2 → v3 step answers `true` where `createNewCampaign` answers `false`,
 * and this pair is the whole reason they differ.
 *
 * The ten-tier-level budget did not exist when a v2 campaign was written, so
 * its roster was built without ever being checked against it. Defaulting those
 * campaigns to "still building" would take a perfectly good community and start
 * reporting it as over budget the moment the player updated the app.
 */
describe('the v2 to v3 default', () => {
  it('marks every campaign written before the question existed as already built', () => {
    for (const fixture of fixtures.filter((f) => f.version < 3)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(
        result.campaign.startingCommunityBuilt,
        `${fixture.path} was re-opened for checking`,
      ).toBe(true);
    }
  });

  it('leaves a brand-new campaign under the check', () => {
    expect(createNewCampaign('Cedar Hollow').startingCommunityBuilt).toBe(false);
  });

  it('keeps a v3 campaign’s own answer', () => {
    const v3 = fixtures.find((fixture) => fixture.version === 3);
    const result = migrate(v3?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.startingCommunityBuilt).toBe(true);
  });
});

/**
 * The v6 → v7 replacement, which is the first step in the chain that swaps a
 * field rather than adding one — and the first that can put a campaign in the
 * wrong place rather than merely in an incomplete one.
 */
describe('the v6 to v7 phase-to-step mapping', () => {
  function stepAfterMigrating(phase: unknown): string | undefined {
    const v6 = fixtures.find((fixture) => fixture.version === 6);
    const result = migrate({ ...(v6?.contents as object), phase });

    expect(result.ok).toBe(true);
    if (!result.ok) return undefined;

    return result.campaign.step;
  }

  it.each([
    ['mission', 'select-mission'],
    ['advancement', 'character-advancement'],
    ['planning', 'assign-facility-staff'],
    ['management', 'check-for-rot'],
  ])('brings a campaign in the %s phase to %s', (phase, step) => {
    expect(stepAfterMigrating(phase)).toBe(step);
  });

  /**
   * The first step of the phase, not the last, and the choice matters.
   *
   * A v6 build never recorded how far into a phase anyone was, so the position
   * genuinely is not in the file — but the two ways of guessing fail
   * differently. Landing at the top risks repeating work a player can *see*
   * they have already done. Landing at the bottom risks skipping work they have
   * not, silently, and three Management steps remove survivors or destroy
   * materials.
   */
  it('lands at the top of the phase rather than the bottom', () => {
    expect(stepAfterMigrating('management')).toBe('check-for-rot');
    expect(stepAfterMigrating('management')).not.toBe('departures');
  });

  it('puts a campaign whose phase is unreadable at the top of the turn', () => {
    // `saveFile.ts` re-checks the shape after this runs, so a bad value could
    // equally be left to fail there. Handing on a field the chain knows is
    // wrong would make the failure look like a bug in the newer code.
    expect(stepAfterMigrating('harvest')).toBe('select-mission');
    expect(stepAfterMigrating(undefined)).toBe('select-mission');
  });

  it('leaves no `phase` behind', () => {
    const v6 = fixtures.find((fixture) => fixture.version === 6);
    const result = migrate(v6?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect('phase' in result.campaign).toBe(false);
  });
});

/**
 * The v7 → v8 addition, which is a no-op that is worth a test anyway: the
 * empty record it adds is not a placeholder, it is where every turn starts.
 */
describe('the v7 to v8 assignments default', () => {
  it('brings every earlier campaign forward with nobody assigned', () => {
    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      // The v8 fixture has three, and every older one has none — an old save
      // records the *results* of assignments nobody wrote down, and inventing a
      // project team from a facility that got built would be making up a turn.
      expect(
        Object.keys(result.campaign.assignments).length,
        `${fixture.path} came forward with the wrong assignments`,
      ).toBe(fixture.version >= 8 ? 3 : 0);
    }
  });

  it('keeps a v8 campaign’s own answers', () => {
    const v8 = fixtures.find((fixture) => fixture.version === 8);
    const result = migrate(v8?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.assignments['b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53']).toEqual({
      task: 'staff',
      slot: 'kitchen',
    });
  });
});

/**
 * The nested change the top-level key guard cannot see, which is why the guard
 * says a change like this deserves its own assertion beside its step.
 */
describe('the v12 to v13 recorded charge', () => {
  it('gives every queued project a charge, whatever version it came from', () => {
    for (const fixture of fixtures) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const [at, project] of result.campaign.projects.entries()) {
        expect(
          project.charged,
          `${fixture.path} project ${String(at)} came forward with no charge`,
        ).toEqual({ hardware: expect.any(Number), labor: expect.any(Number) });
      }
    }
  });

  /**
   * Replayed rather than zeroed: the charges are the catalogue's, which is what
   * a player who cancels one of them gets back.
   *
   * The clearing comes forward at nothing, and that is the honest answer rather
   * than a gap. Its slot holds a built Watchtower, so there is no clearing
   * project standing there to price against — the same answer the quote gives,
   * and the same one this build would have refunded before the charge was
   * recorded.
   */
  it('prices a v11 queue as the orders would have been charged', () => {
    const v11 = fixtures.find((fixture) => fixture.version === 11);
    const result = migrate(v11?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.projects.map((project) => project.charged)).toEqual([
      { hardware: 3, labor: 2 },
      { hardware: 2, labor: 1 },
      { hardware: 0, labor: 0 },
    ]);
  });

  /** A save that was already v13 keeps the numbers it was written with. */
  it('leaves a v13 queue alone', () => {
    const v13 = fixtures.find((fixture) => fixture.version === 13);
    const result = migrate(v13?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.projects[0]?.charged).toEqual({ hardware: 3, labor: 2 });
  });
});

/**
 * The first step to reach inside the roster rather than add a top-level field,
 * so the key guard above is blind to it — this is the assertion its comment
 * asks for, beside the survivor-shape one that would catch a missing key but
 * not a wrong value.
 */
describe('the v13 to v14 infection', () => {
  it('brings every earlier survivor forward clean', () => {
    for (const fixture of fixtures.filter((f) => f.version < 14)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      // Zero rather than anything inferred from their Health: a v13 build had
      // nowhere to write Infection, so no earlier save can have lost any.
      for (const survivor of result.campaign.survivors) {
        expect(survivor.infection, `${fixture.path} ${survivor.name}`).toBe(0);
      }
    }
  });

  it('keeps a v14 survivor’s own Infection', () => {
    const v14 = fixtures.find((fixture) => fixture.version === 14);
    const result = migrate(v14?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors.map((survivor) => survivor.infection)).toEqual([0, 4, 10, 0]);
  });

  /**
   * A roster that is not a list is somebody else's problem: `saveFile.ts`
   * refuses it with a message about the roster, which is the damage. A step
   * that "repaired" it would be writing a campaign nobody saved.
   */
  it('hands an unreadable roster on untouched', () => {
    const v13 = fixtures.find((fixture) => fixture.version === 13);
    const result = migrate({ ...(v13?.contents as object), survivors: 'everybody' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toBe('everybody');
  });
});

/** Somewhere to keep the survivors a move sends away (R31; Z4-8). */
describe('the v14 to v15 set-aside list', () => {
  it('brings every earlier save forward with nobody set aside', () => {
    for (const fixture of fixtures.filter((f) => f.version < 15)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      // Empty rather than anything inferred: a v14 build could not move house,
      // so no earlier save sent anybody away.
      expect(result.campaign.setAside, fixture.path).toEqual([]);
    }
  });

  it('leaves a list that is already there alone', () => {
    const v14 = fixtures.find((fixture) => fixture.version === 14);
    const result = migrate({ ...(v14?.contents as object), setAside: [SAMPLE_SURVIVOR] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.setAside).toEqual([SAMPLE_SURVIVOR]);
  });
});

/** The base's Inventory and what each survivor carries (Z5-2). */
describe('the v15 to v16 items', () => {
  it('brings every earlier save forward with nothing owned, by the base or anybody', () => {
    for (const fixture of fixtures.filter((f) => f.version < 16)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      // Empty rather than anything inferred: a v15 build had no items at all.
      expect(result.campaign.inventory, fixture.path).toEqual([]);
      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(survivor.items, `${fixture.path} ${survivor.name}`).toEqual([]);
      }
    }
  });

  it('keeps a v16 save’s own items', () => {
    const v16 = fixtures.find((fixture) => fixture.version === 16);
    const result = migrate(v16?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.inventory.map((item) => item.item)).toEqual(['pistol', 'binoculars']);
    expect(result.campaign.survivors[0]?.items.map((item) => item.grade)).toEqual([
      'shoddy',
      'standard',
    ]);
  });

  it('hands an unreadable roster or set-aside list on untouched', () => {
    const v15 = fixtures.find((fixture) => fixture.version === 15);
    const result = migrate({
      ...(v15?.contents as object),
      survivors: 'everybody',
      setAside: [7],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toBe('everybody');
    expect(result.campaign.setAside).toEqual([7]);
  });

  it('leaves an Inventory, or a survivor’s items, that are already there alone', () => {
    const v15 = fixtures.find((fixture) => fixture.version === 15);
    const pistol = { id: 'p', item: 'pistol', grade: 'standard' };
    const result = migrate({
      ...(v15?.contents as object),
      inventory: [pistol],
      survivors: [{ ...SAMPLE_SURVIVOR, items: [pistol] }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.inventory).toEqual([pistol]);
    expect(result.campaign.survivors[0]?.items).toEqual([pistol]);
  });
});

/** R49: the Rare in storage becomes Rare Item Table rolls owed, and stops being a material. */
describe('the v16 to v17 Rare rolls', () => {
  it('owes a roll for each Rare every earlier save held, and keeps the three materials', () => {
    for (const fixture of fixtures.filter((f) => f.version < 17)) {
      const before = (fixture.contents as { materials: Record<string, number> }).materials;
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.rareRollsOwed, fixture.path).toBe(before.rare ?? 0);
      expect(Object.keys(result.campaign.materials), fixture.path).toEqual([
        'food',
        'fuel',
        'hardware',
      ]);
    }
  });

  it('owes nothing for a save with no Rare count', () => {
    const v16 = fixtures.find((fixture) => fixture.version === 16);
    const result = migrate({
      ...(v16?.contents as object),
      materials: { food: 1, fuel: 1, hardware: 1 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.rareRollsOwed).toBe(0);
  });

  it('hands unreadable materials on for the reader to refuse', () => {
    const v16 = fixtures.find((fixture) => fixture.version === 16);

    for (const materials of ['plenty', null, [1, 2]]) {
      const result = migrate({ ...(v16?.contents as object), materials });

      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.materials).toEqual(materials);
      expect(result.campaign.rareRollsOwed).toBe(0);
      expect(result.campaign.name).toBe('Cedar Hollow');
    }
  });
});

/** R53: trades on their way, which nothing before v18 could place (Z5-9). */
describe('the v17 to v18 trades', () => {
  it('brings every earlier save forward with nothing on order', () => {
    for (const fixture of fixtures.filter((f) => f.version < 18)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.trades, fixture.path).toEqual([]);
    }
  });

  it('keeps a v18 save’s own trades, and a list already there', () => {
    const v18 = fixtures.find((fixture) => fixture.version === 18);
    const ordered = migrate(v18?.contents);
    const v17 = fixtures.find((fixture) => fixture.version === 17);
    const trade = { ...TRADE, id: 'another' };
    const kept = migrate({ ...(v17?.contents as object), trades: [trade] });

    expect(ordered.ok && ordered.campaign.trades.map((one) => one.item)).toEqual(['pistol']);
    expect(kept.ok && kept.campaign.trades).toEqual([trade]);
  });
});

describe('the v18 to v19 Story Traits', () => {
  it('brings every earlier survivor forward with no trait, no Veteran and no bond', () => {
    for (const fixture of fixtures.filter((f) => f.version < 19)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(
          {
            storyTrait: survivor.storyTrait,
            veteran: survivor.veteran,
            bondGroup: survivor.bondGroup,
          },
          `${fixture.path} ${survivor.name}`,
        ).toEqual({ storyTrait: null, veteran: false, bondGroup: null });
      }
    }
  });

  it('keeps a v19 save’s own traits', () => {
    const v19 = fixtures.find((fixture) => fixture.version === 19);
    const result = migrate(v19?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      result.campaign.survivors.map((one) => [one.storyTrait, one.veteran, one.bondGroup]),
    ).toEqual([
      ['driven', true, null],
      ['bonded', false, 1],
      ['jaded', false, null],
      ['bonded', false, 1],
    ]);
  });

  it('hands a survivor that is not an object, or a list that is not a list, on untouched', () => {
    const v18 = fixtures.find((fixture) => fixture.version === 18);
    const result = migrate({
      ...(v18?.contents as object),
      survivors: [null, 7],
      setAside: 'nobody',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toEqual([null, 7]);
    expect(result.campaign.setAside).toBe('nobody');
  });
});

describe('the v19 to v20 Rot Resistant', () => {
  it('brings every earlier survivor forward not Rot Resistant', () => {
    for (const fixture of fixtures.filter((f) => f.version < 20)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(survivor.rotResistant, `${fixture.path} ${survivor.name}`).toBe(false);
      }
    }
  });

  it('keeps a v20 save’s own', () => {
    const v20 = fixtures.find((fixture) => fixture.version === 20);
    const result = migrate(v20?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors.map((one) => one.rotResistant)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it('hands a survivor that is not an object, or a list that is not a list, on untouched', () => {
    const v19 = fixtures.find((fixture) => fixture.version === 19);
    const result = migrate({
      ...(v19?.contents as object),
      survivors: [null, 7],
      setAside: 'nobody',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toEqual([null, 7]);
    expect(result.campaign.setAside).toBe('nobody');
  });
});

describe('the v20 to v21 Containment and Medical Supplies', () => {
  it('brings every earlier save forward holding no zombie and keeping no token', () => {
    for (const fixture of fixtures.filter((f) => f.version < 21)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      expect(result.campaign.heldZombies, fixture.path).toBe(0);
      expect(result.campaign.medicalSupplies, fixture.path).toBe(0);
    }
  });

  it('keeps a v21 save’s own', () => {
    const v21 = fixtures.find((fixture) => fixture.version === 21);
    const result = migrate(v21?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([result.campaign.heldZombies, result.campaign.medicalSupplies]).toEqual([1, 2]);
  });
});

describe('the v21 to v22 Madness and the Lost', () => {
  it('brings every earlier survivor forward with no Madness, and nobody Lost', () => {
    for (const fixture of fixtures.filter((f) => f.version < 22)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(survivor.madness, `${fixture.path} ${survivor.name}`).toBe(0);
      }
      expect(result.campaign.lost, fixture.path).toEqual([]);
    }
  });

  it('keeps a v22 save’s own', () => {
    const v22 = fixtures.find((fixture) => fixture.version === 22);
    const result = migrate(v22?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors.map((one) => one.madness)).toEqual([5, 0, 0, 0]);
  });

  it('hands a survivor that is not an object, or a list that is not a list, on untouched', () => {
    const v21 = fixtures.find((fixture) => fixture.version === 21);
    const result = migrate({
      ...(v21?.contents as object),
      survivors: [null, 7],
      setAside: 'nobody',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors).toEqual([null, 7]);
    expect(result.campaign.setAside).toBe('nobody');
  });
});

describe('the v22 to v23 XP spent and Found', () => {
  it('brings every earlier survivor forward having spent nothing, and nobody Found', () => {
    for (const fixture of fixtures.filter((f) => f.version < 23)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(
          [survivor.xpSpent, survivor.found, survivor.foundCheckPassed],
          `${fixture.path} ${survivor.name}`,
        ).toEqual([0, false, false]);
      }
    }
  });

  it('keeps a v23 save’s own', () => {
    const v23 = fixtures.find((fixture) => fixture.version === 23);
    const result = migrate(v23?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors.map((one) => [one.xpSpent, one.found])).toEqual([
      [6, false],
      [0, true],
      [0, false],
      [0, false],
    ]);
  });

  it('brings a Lost survivor forward too, and hands anything else on untouched', () => {
    const v22 = fixtures.find((fixture) => fixture.version === 22);
    const lost = { ...((v22?.contents as { survivors: object[] }).survivors[0] as object) };
    delete (lost as { xpSpent?: unknown }).xpSpent;
    const result = migrate({
      ...(v22?.contents as object),
      lost: [{ ...lost, id: 'gone' }],
      survivors: [null, 7],
      setAside: 'nobody',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.lost[0]?.xpSpent).toBe(0);
    expect(result.campaign.survivors).toEqual([null, 7]);
    expect(result.campaign.setAside).toBe('nobody');
  });
});

describe('the v23 to v24 Humanity', () => {
  it('brings every earlier survivor forward at 3, where everybody starts (R115)', () => {
    for (const fixture of fixtures.filter((f) => f.version < 24)) {
      const result = migrate(fixture.contents);

      expect(result.ok, `${fixture.path} no longer migrates`).toBe(true);
      if (!result.ok) continue;

      for (const survivor of [...result.campaign.survivors, ...result.campaign.setAside]) {
        expect(survivor.humanity, `${fixture.path} ${survivor.name}`).toBe(3);
      }
    }
  });

  it('keeps a v24 save’s own', () => {
    const v24 = fixtures.find((fixture) => fixture.version === 24);
    const result = migrate(v24?.contents);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.survivors.map((one) => one.humanity)).toEqual([2, 3, 3, 3]);
  });

  it('brings a Lost survivor forward too, and hands anything else on untouched', () => {
    const v23 = fixtures.find((fixture) => fixture.version === 23);
    const gone = { ...((v23?.contents as { survivors: object[] }).survivors[0] as object) };
    const result = migrate({
      ...(v23?.contents as object),
      lost: [{ ...gone, id: 'gone' }],
      survivors: [null, 7],
      setAside: 'nobody',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.campaign.lost[0]?.humanity).toBe(3);
    expect(result.campaign.survivors).toEqual([null, 7]);
    expect(result.campaign.setAside).toBe('nobody');
  });
});
