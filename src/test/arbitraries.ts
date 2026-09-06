/**
 * Generators for property-based tests (`fast-check`).
 *
 * **Why these exist.** The rest of the suite tests this app against inputs a
 * person thought of, and that person also wrote the code. A hand-written list
 * of hostile save files is a list of ways a file can be wrong that *I* imagined;
 * it says nothing about the ways I did not. These generate inputs nobody wrote
 * down.
 *
 * **`campaignArbitrary` is typed as producing a `Campaign` on purpose.** That
 * makes this module a second place the persisted shape is written down: when
 * Phase 2 gives `base` a real type, this file stops compiling, and a
 * disagreement between the generator and the type is a bug in one of them. A
 * generator typed `any` would silently keep passing while testing the old shape.
 *
 * Not shipped: the bundle is built from `main.tsx` down, nothing outside a test
 * imports this file, and so neither it nor `fast-check` is reachable from the
 * app. The build size is the check on that claim, not this sentence.
 */

import fc from 'fast-check';
import { SKILLS, STATS, type Skill } from '../data/skills';
import { TIERS } from '../data/tiers';
import { MATERIALS, type Materials } from '../data/materials';
import { CAMPAIGN_ORIGINS } from '../data/origins';
import { CAMPAIGN_PHASES, CURRENT_SCHEMA_VERSION } from '../engine/campaign';
import type { Campaign, SkillLevels, Stats, Survivor } from '../engine/campaign';

/**
 * Any single UTF-16 code unit — **including an unpaired surrogate**.
 *
 * The built-in units all produce well-formed strings: `fc.string()` with
 * `unit: 'binary'` emits valid code points and keeps surrogate pairs intact, so
 * a generator using it never reaches the case worth reaching. Sampling 300
 * campaigns from an earlier draft of this file produced exactly zero lone
 * surrogates, which is how that was caught.
 *
 * Lone surrogates matter because they are the input `JSON.stringify` had to be
 * amended for in ES2019 (well-formed stringify): before that it emitted invalid
 * UTF-16 that could not be parsed back. A save file is written by one build and
 * read by another, so this is a real round trip, not a theoretical one.
 */
const anyCodeUnit = fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code));

/**
 * A name, and the reason this is not `fc.string()`.
 *
 * `name` is the one free-text field in the whole save file, so it is where a
 * round trip realistically breaks: quotes, backslashes, newlines, astral-plane
 * emoji, right-to-left marks, and unpaired surrogates. A generator restricted to
 * the default alphabet would emit `abc` forever and prove nothing about
 * serialization at all.
 */
const anyName = fc.string({ unit: anyCodeUnit, maxLength: 40 });

/** An id, which the parser requires to be a non-empty string and nothing more. */
const anyId = fc.string({ unit: anyCodeUnit, minLength: 1, maxLength: 40 });

/**
 * A count the save-file parser accepts: a whole number, zero or more.
 *
 * Capped well above anything the rules produce. The point is not to explore
 * large numbers — it is that a level of 12 or an XP balance of 900 must still
 * *round-trip*, because Z1-7's override lets a player save a survivor the rules
 * would refuse, and a file that refused to reopen would make the override a
 * feature that silently destroys the save that used it.
 */
const anyCount = fc.integer({ min: 0, max: 999 });

/**
 * A material count.
 *
 * The parser asks only for a finite number, not a whole one, so the type
 * genuinely permits `2.5` — and this is deliberately narrower than that. The
 * last test in `roundTrip.property.test.ts` records the one finite number that
 * does not survive JSON, and why constraining the generator is the right answer
 * to it rather than adding a branch to the app.
 */
const anyMaterialCount = fc.integer({ min: 0, max: 9999 });

/** An ISO 8601 timestamp, which is what `createNewCampaign` writes. */
const anyCreatedAt = fc
  .date({ min: new Date('1970-01-01T00:00:00.000Z'), max: new Date('2999-12-31T23:59:59.999Z') })
  .map((date) => date.toISOString());

function statsArbitrary(): fc.Arbitrary<Stats> {
  return fc.record(
    Object.fromEntries(STATS.map((stat) => [stat, anyCount])) as Record<
      keyof Stats,
      fc.Arbitrary<number>
    >,
  );
}

/**
 * Some subset of the twenty skills, at any level.
 *
 * **Deliberately not rule-legal.** It will happily give a Rookie four skills at
 * level 9. Structural validity is what the save file requires; legality is a
 * rule the player may override (Z1-7a), and an overridden survivor is exactly
 * the survivor most likely to break a round trip and least likely to appear in
 * a hand-written fixture.
 */
function skillsArbitrary(): fc.Arbitrary<SkillLevels> {
  return fc
    .uniqueArray(fc.tuple(fc.constantFrom<Skill>(...SKILLS), anyCount), {
      // Unique by skill, not by pair, so a skill never appears twice.
      selector: ([skill]) => skill,
      maxLength: SKILLS.length,
    })
    .map((entries) => {
      const chosen: SkillLevels = {};
      for (const [skill, level] of entries) chosen[skill] = level;
      return chosen;
    });
}

export function survivorArbitrary(): fc.Arbitrary<Survivor> {
  return fc.record({
    id: anyId,
    name: anyName,
    tier: fc.constantFrom(...TIERS),
    stats: statsArbitrary(),
    skills: skillsArbitrary(),
    move: anyCount,
    defense: anyCount,
    currentHp: anyCount,
    xp: anyCount,
  });
}

function materialsArbitrary(): fc.Arbitrary<Materials> {
  return fc.record(
    Object.fromEntries(MATERIALS.map((material) => [material, anyMaterialCount])) as Record<
      keyof Materials,
      fc.Arbitrary<number>
    >,
  );
}

/**
 * A campaign this build could have written.
 *
 * `schemaVersion` is pinned to the current one rather than generated, because
 * the round-trip property is a claim about the format this build *writes*. An
 * older version would be migrated forward on the way back in, and would then
 * — correctly — not equal what went out; that is the migration chain's own
 * tests' job, and they use real fixture files rather than generated ones.
 */
export function campaignArbitrary(): fc.Arbitrary<Campaign> {
  return fc.record(
    {
      schemaVersion: fc.constant(CURRENT_SCHEMA_VERSION),
      id: anyId,
      name: anyName,
      createdAt: anyCreatedAt,
      turn: fc.integer({ min: 1, max: 9999 }),
      phase: fc.constantFrom(...CAMPAIGN_PHASES),
      origin: fc.constantFrom(...CAMPAIGN_ORIGINS),
      materials: materialsArbitrary(),
      survivors: fc.array(survivorArbitrary(), { maxLength: 6 }),
      startingCommunityBuilt: fc.boolean(),
      base: fc.constant(null),
      log: fc.constant([]),
    },
    // Every key but `origin`, which is optional on `Campaign` — so half the
    // generated campaigns leave it out entirely. Both are real files, and the
    // absent one is the one a round trip can get wrong by writing `null`.
    {
      requiredKeys: [
        'schemaVersion',
        'id',
        'name',
        'createdAt',
        'turn',
        'phase',
        'materials',
        'survivors',
        'startingCommunityBuilt',
        'base',
        'log',
      ],
    },
  );
}

/**
 * Arbitrary JSON — the shape `migrate` and `parseCampaignFile` have to survive
 * being handed, rather than the shape they hope for.
 */
export function jsonValueArbitrary(): fc.Arbitrary<unknown> {
  return fc.jsonValue();
}
