/**
 * Arbitrary campaigns — the generators the property tests draw from.
 *
 * This file is **the persisted shape written down a second time**. `Campaign`
 * says what fields a campaign has; this says what values those fields can
 * actually hold, and the properties in `*.property.test.ts` hold the two
 * against each other. `fc.record<Campaign>` stops typechecking the moment a
 * field is added to the type and not to the model here, which is the point: a
 * field nobody generates is a field no property covers, and a generator that
 * quietly stopped covering the new field would be worse than no generator.
 *
 * Everything generated here is deliberately **valid** — exactly what
 * `parseCampaignFile` accepts, and nothing it refuses. Hostile input is
 * generated from `fc.anything()` and friends at the point of use instead,
 * because the property over it is a different property: a valid campaign has
 * to survive a round trip, a hostile one only has to fail politely.
 *
 * Values are drawn from the rules data (`STATS`, `SKILLS`, `MATERIALS`,
 * `TIERS`) rather than restated, so a rules edit widens the generator instead
 * of leaving it testing a shape the app no longer has.
 */

import fc from 'fast-check';
import { SKILLS, STATS, type Skill } from '../data/skills';
import { TIERS } from '../data/tiers';
import {
  CAMPAIGN_PHASES,
  CURRENT_SCHEMA_VERSION,
  MATERIALS,
  type Campaign,
  type Materials,
  type Stats,
  type Survivor,
} from '../engine/campaign';

/**
 * The settings every `fc.assert` in this project runs with.
 *
 * The seed is **fixed**, so a failing property fails for everyone and keeps
 * failing until it is fixed, rather than appearing on one CI run and
 * evaporating on the re-run. The trade is that a fixed seed explores the same
 * 200 cases every time; a counterexample it does find is checked in as an
 * ordinary test case next to the fix, which is where the coverage actually
 * accumulates. To go looking for new cases, raise `numRuns` or change the seed
 * locally — the number here is a date and has no other meaning.
 */
export const PROPERTY_RUN = { seed: 20260901, numRuns: 200 } as const;

/** A record with a value drawn for each of a fixed set of keys. */
function recordOf<K extends string, V>(
  keys: readonly K[],
  value: fc.Arbitrary<V>,
): fc.Arbitrary<Record<K, V>> {
  return fc
    .tuple(...keys.map(() => value))
    .map((values) => Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Record<K, V>);
}

/**
 * Free text as it actually arrives: a campaign gets named by a person, and
 * people use emoji, right-to-left scripts and combining marks. `binary` is the
 * widest unit fast-check has and includes lone surrogates — which round-trip
 * through `JSON.stringify` correctly, and are worth proving rather than
 * assuming.
 */
const freeText = fc.string({ unit: 'binary', maxLength: 40 });

/** A non-empty id. The validator refuses `''`, so the generator never makes one. */
const arbitraryId = fc.string({ minLength: 1, maxLength: 40 });

/** ISO 8601, which is the only thing `createdAt` is documented to hold. */
const arbitraryCreatedAt = fc
  .date({
    min: new Date('1970-01-01T00:00:00.000Z'),
    max: new Date('2100-01-01T00:00:00.000Z'),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString());

/** Stats, skill levels, scores and health are all whole counts from zero. */
const arbitraryCount = fc.nat({ max: 12 });

/**
 * Material counts, which the validator deliberately allows to be fractional —
 * how much of a material a campaign may hold is a rule, and none has shipped.
 *
 * `-0` is excluded, and that is a fact about JSON rather than about this app:
 * `JSON.stringify(-0)` is `"0"`, so no round trip through a file can preserve
 * it. Generating it would fail the round-trip property for a reason no code
 * change here could fix.
 */
const arbitraryMaterialCount = fc.oneof(
  { arbitrary: fc.nat({ max: 999 }), weight: 4 },
  {
    arbitrary: fc
      .double({ noNaN: true, noDefaultInfinity: true })
      .filter((value) => !Object.is(value, -0)),
    weight: 1,
  },
);

export const arbitraryStats: fc.Arbitrary<Stats> = recordOf(STATS, arbitraryCount);

export const arbitraryMaterials: fc.Arbitrary<Materials> = recordOf(
  MATERIALS,
  arbitraryMaterialCount,
);

/**
 * A survivor's skills — a *subset* of the skills, at a level each.
 *
 * Partial on purpose, mirroring `SkillLevels`: "has Carry at level 0" and "does
 * not have Carry" are different states, and a generator that always produced
 * all twenty would never generate the second one, which is the state
 * `skillScore` returns null for.
 */
export const arbitrarySkills = fc
  .uniqueArray(fc.constantFrom(...SKILLS), { maxLength: SKILLS.length })
  .chain((skills) =>
    fc
      .tuple(...skills.map(() => arbitraryCount))
      .map(
        (levels) =>
          Object.fromEntries(skills.map((skill, i) => [skill, levels[i]])) as Partial<
            Record<Skill, number>
          >,
      ),
  );

/**
 * One survivor. Written field by field rather than derived from the type, so
 * that adding a field to `Survivor` fails here until someone decides what
 * values it can take.
 */
export const arbitrarySurvivor: fc.Arbitrary<Survivor> = fc.record<Survivor>({
  id: arbitraryId,
  name: freeText,
  tier: fc.constantFrom(...TIERS),
  stats: arbitraryStats,
  skills: arbitrarySkills,
  move: arbitraryCount,
  defense: arbitraryCount,
  currentHp: arbitraryCount,
  xp: fc.nat({ max: 200 }),
});

/**
 * A whole campaign at the current schema version.
 *
 * `base` and `log` are pinned to `null` and `[]` because that is the only value
 * this version can legally hold — `saveFile.ts` refuses anything else, on
 * purpose, and a generator that produced a populated base would be generating a
 * file from a version that does not exist yet.
 */
export const arbitraryCampaign: fc.Arbitrary<Campaign> = fc.record<Campaign>({
  schemaVersion: fc.constant(CURRENT_SCHEMA_VERSION),
  id: arbitraryId,
  name: freeText,
  createdAt: arbitraryCreatedAt,
  turn: fc.integer({ min: 1, max: 500 }),
  phase: fc.constantFrom(...CAMPAIGN_PHASES),
  materials: arbitraryMaterials,
  survivors: fc.array(arbitrarySurvivor, { maxLength: 5 }),
  base: fc.constant(null),
  log: fc.constant([]),
});
