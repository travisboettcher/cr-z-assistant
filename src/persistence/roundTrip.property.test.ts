/**
 * The save file as a set of *properties*, rather than a list of files someone
 * thought to write down.
 *
 * The hand-written cases in `saveFile.test.ts` and `exportFile.test.ts` are the
 * ways a file can be wrong that occurred to whoever wrote them — which is the
 * same limitation the code has, since it was written from the same reading. The
 * generator in `src/test/arbitraries.ts` produces campaigns nobody chose, and
 * these say what has to be true of all of them.
 *
 * Four properties, in the order they matter:
 *
 * 1. Any campaign survives export and import unchanged. That is the promise the
 *    whole persistence layer exists to keep.
 * 2. Serialising is stable — same bytes twice, and independent of the order the
 *    object's keys happened to be built in. `exportFile.ts` goes to real trouble
 *    for this; nothing before this proved it for a campaign assembled oddly.
 * 3. Nothing throws. Import reaches someone mid-campaign holding a tablet, and
 *    every failure has to arrive as a sentence, not a stack trace.
 * 4. A campaign missing any single field is refused, not quietly accepted.
 *
 * A counterexample any of these finds gets checked in as an ordinary test case
 * next to its fix — the property proves the class, the case documents the bug.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arbitraryCampaign, arbitrarySurvivor, PROPERTY_RUN } from '../test/arbitraries';
import type { Campaign, Survivor } from '../engine/campaign';
import { CURRENT_SCHEMA_VERSION } from '../engine/campaign';
import { serializeCampaign } from './exportFile';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';

/**
 * Every key an exported file holds, in the order `inFileOrder` writes them.
 *
 * Typed as `keyof Campaign` so it cannot name a field that does not exist, and
 * checked against a real export below so it cannot *miss* one either. That
 * check is what makes the "any one field missing" property honest: a property
 * that only deletes nine of ten fields silently stops covering the tenth.
 */
const FILE_KEYS: readonly (keyof Campaign)[] = [
  'schemaVersion',
  'id',
  'name',
  'createdAt',
  'turn',
  'phase',
  'materials',
  'survivors',
  'base',
  'log',
];

/**
 * Every key a survivor holds. Typed and checked the same way `FILE_KEYS` is.
 */
const SURVIVOR_KEYS: readonly (keyof Survivor)[] = [
  'id',
  'name',
  'tier',
  'stats',
  'skills',
  'move',
  'defense',
  'currentHp',
  'xp',
];

/**
 * The same value with its object keys rotated, recursively — a campaign built
 * in a different order than the factory builds one.
 *
 * Rotation rather than a shuffle because it is deterministic given the offset,
 * so a failing case reproduces from the counterexample fast-check prints.
 */
function rotateKeys(value: unknown, by: number): unknown {
  if (Array.isArray(value)) return value.map((item) => rotateKeys(item, by));
  if (typeof value !== 'object' || value === null) return value;

  const entries = Object.entries(value);
  const offset = entries.length === 0 ? 0 : by % entries.length;

  return Object.fromEntries(
    [...entries.slice(offset), ...entries.slice(0, offset)].map(([key, nested]) => [
      key,
      rotateKeys(nested, by),
    ]),
  );
}

/**
 * What every failure message has to be: a finished sentence.
 *
 * Weak-looking, and it is not — the messages are built by concatenating
 * fragments, and a fragment lost anywhere in one leaves a message that stops
 * mid-clause. Someone mid-campaign gets the whole sentence or the module has
 * failed at its one job.
 */
function expectASentence(message: string): void {
  expect(message.length).toBeGreaterThan(20);
  expect(message.trimEnd()).toBe(message);
  expect(message.endsWith('.')).toBe(true);
}

describe('the export/import round trip, for any campaign', () => {
  it('returns a campaign deep-equal to the one written', () => {
    fc.assert(
      fc.property(arbitraryCampaign, (campaign) => {
        const result = parseCampaignFile(serializeCampaign(campaign));

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.campaign).toEqual(campaign);
      }),
      PROPERTY_RUN,
    );
  });

  /**
   * The migration chain's own round trip. A v1 file is a current file with the
   * version wound back and no survivors — v1 could not hold one — so this is
   * the oldest shape the app claims to still open, generated rather than
   * fixtured.
   */
  it('brings a v1 file forward to the current version', () => {
    fc.assert(
      fc.property(arbitraryCampaign, (campaign) => {
        const asV1 = { ...campaign, schemaVersion: 1, survivors: [] };
        const result = parseCampaignFile(serializeCampaign(asV1));

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.campaign.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
          expect(result.campaign).toEqual({ ...asV1, schemaVersion: CURRENT_SCHEMA_VERSION });
        }
      }),
      PROPERTY_RUN,
    );
  });
});

describe('serialization is stable', () => {
  it('writes the same bytes twice', () => {
    fc.assert(
      fc.property(arbitraryCampaign, (campaign) => {
        expect(serializeCampaign(campaign)).toBe(serializeCampaign(campaign));
      }),
      PROPERTY_RUN,
    );
  });

  it('does not depend on the order the campaign object was built in', () => {
    fc.assert(
      fc.property(arbitraryCampaign, fc.integer({ min: 1, max: 9 }), (campaign, by) => {
        const rotated = rotateKeys(campaign, by) as Campaign;

        // The rotation has to actually change something, or this proves nothing.
        expect(Object.keys(rotated)).not.toEqual(Object.keys(campaign));
        expect(serializeCampaign(rotated)).toBe(serializeCampaign(campaign));
      }),
      PROPERTY_RUN,
    );
  });

  it('writes every field of the campaign and of every survivor, in file order', () => {
    fc.assert(
      fc.property(arbitraryCampaign, (campaign) => {
        const written = JSON.parse(serializeCampaign(campaign)) as Record<string, unknown>;

        expect(Object.keys(written)).toEqual(FILE_KEYS);
        for (const survivor of written.survivors as object[]) {
          expect(Object.keys(survivor)).toEqual(SURVIVOR_KEYS);
        }
      }),
      PROPERTY_RUN,
    );
  });
});

describe('nothing throws', () => {
  const anyText = fc.oneof(
    fc.string({ unit: 'binary' }),
    fc.json(),
    fc.jsonValue().map((value) => JSON.stringify(value) ?? ''),
    arbitraryCampaign.map(serializeCampaign),
  );

  it('parseCampaignFile always returns a result, for any text at all', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const result = parseCampaignFile(text);

        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) expectASentence(result.error.message);
      }),
      PROPERTY_RUN,
    );
  });

  /**
   * The one refusal that is about the *future* rather than about damage, and
   * the only one whose message a reader is expected to act on by updating the
   * app. Any version above the current one, not just the next one: a campaign
   * can skip several versions between the day it was saved and the day someone
   * opens it on an old build.
   */
  it('refuses a save from any future version, and says which versions it means', () => {
    fc.assert(
      fc.property(
        arbitraryCampaign,
        fc.integer({ min: CURRENT_SCHEMA_VERSION + 1, max: 1000 }),
        (campaign, version) => {
          const result = parseCampaignFile(
            serializeCampaign({ ...campaign, schemaVersion: version }),
          );

          expect(result.ok).toBe(false);
          if (result.ok) return;

          expect(result.error.reason).toBe('future-version');
          expect(result.error.message).toContain(String(version));
          expect(result.error.message).toContain(String(CURRENT_SCHEMA_VERSION));
          expectASentence(result.error.message);
        },
      ),
      PROPERTY_RUN,
    );
  });

  it('migrate always returns a result, for any value at all', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = migrate(value);

        expect(typeof result.ok).toBe('boolean');
        if (!result.ok) expectASentence(result.error.message);
      }),
      PROPERTY_RUN,
    );
  });
});

/**
 * A refusal has to say *what* is wrong, not only that something is.
 *
 * "…is not complete: ." is a sentence, and it is useless — it tells someone
 * holding a tablet that their save is broken and nothing else. So the phrase
 * after the colon has to actually be a phrase.
 */
function expectNamesTheProblem(error: { reason: string; message: string }): void {
  expectASentence(error.message);
  if (error.reason !== 'damaged-campaign') return;

  expect(error.message).toMatch(/is not complete: [a-z][^.]{4,}\./);
}

describe('a damaged campaign is refused rather than half-read', () => {
  it('refuses a file with any one field missing', () => {
    fc.assert(
      fc.property(arbitraryCampaign, fc.constantFrom(...FILE_KEYS), (campaign, missing) => {
        const written = JSON.parse(serializeCampaign(campaign)) as Record<string, unknown>;
        delete written[missing];

        const result = parseCampaignFile(JSON.stringify(written));

        expect(result.ok).toBe(false);
        if (!result.ok) expectNamesTheProblem(result.error);
      }),
      PROPERTY_RUN,
    );
  });

  /**
   * Every field, given a value of the wrong type. `null` is the interesting
   * wrong value rather than a random one: it is what a hand-edited file and a
   * half-written export both tend to produce, and `typeof null === 'object'`
   * is the check a validator is most likely to get wrong.
   *
   * `base` is exempt because `null` is its only legal value today.
   */
  it('refuses a file with any one field nulled', () => {
    const nullable = FILE_KEYS.filter((key) => key !== 'base');

    fc.assert(
      fc.property(arbitraryCampaign, fc.constantFrom(...nullable), (campaign, nulled) => {
        const written = JSON.parse(serializeCampaign(campaign)) as Record<string, unknown>;
        written[nulled] = null;

        const result = parseCampaignFile(JSON.stringify(written));

        expect(result.ok).toBe(false);
        if (!result.ok) expectNamesTheProblem(result.error);
      }),
      PROPERTY_RUN,
    );
  });

  /**
   * The same, one level down: a roster with any one survivor field missing or
   * nulled. A survivor is where a hand-edited file is most likely to go wrong —
   * it is the part of the save a player is tempted to tweak — and the fields
   * are checked one by one, so a check that quietly stopped firing would only
   * show up on the file that needed it.
   */
  it('refuses a roster with any one survivor field missing or nulled', () => {
    fc.assert(
      fc.property(
        arbitraryCampaign,
        arbitrarySurvivor,
        fc.constantFrom(...SURVIVOR_KEYS),
        fc.boolean(),
        (campaign, survivor, damaged, nulled) => {
          const broken: Record<string, unknown> = { ...survivor };
          if (nulled) broken[damaged] = null;
          else delete broken[damaged];

          const written = JSON.parse(
            serializeCampaign({ ...campaign, survivors: [survivor] }),
          ) as Record<string, unknown>;
          written.survivors = [broken];

          const result = parseCampaignFile(JSON.stringify(written));

          expect(result.ok).toBe(false);
          if (!result.ok) expectNamesTheProblem(result.error);
        },
      ),
      PROPERTY_RUN,
    );
  });
});
