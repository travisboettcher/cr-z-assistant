import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Campaign } from '../engine/campaign';
import { campaignArbitrary, jsonValueArbitrary } from '../test/arbitraries';
import { serializeCampaign } from './exportFile';
import { migrate } from './migrations';
import { parseCampaignFile } from './saveFile';

/**
 * The round trip, asserted over generated campaigns rather than written ones.
 *
 * The existing tests in this directory check the round trip for the campaigns I
 * thought to write down. These check it for campaigns nobody wrote down, which
 * is the only kind that can catch a blind spot shared by the code and its
 * tests — and that shared blind spot is the whole reason issue #40 exists.
 *
 * **A fixed seed on every run.** Property tests that pick a new seed each time
 * are flaky by construction: a failure appears once in CI, cannot be reproduced,
 * and gets re-run until it goes away. With a fixed seed the suite is
 * deterministic, and a counterexample found while raising `numRuns` locally gets
 * checked in as an ordinary example test — the property guards the class, the
 * example pins the instance.
 */
const SEED = 20260903;

const RUNS = { seed: SEED, numRuns: 300 } as const;

describe('a campaign survives the round trip', () => {
  /**
   * The single highest-value property here: whatever this build can write, it
   * can read back. Everything else in the app is downstream of that promise.
   */
  it('parses back to exactly what was serialized', () => {
    fc.assert(
      fc.property(campaignArbitrary(), (campaign) => {
        const result = parseCampaignFile(serializeCampaign(campaign));

        expect(result.ok).toBe(true);
        // Narrowed by the assertion above; read off the union rather than cast.
        if (!result.ok) return;

        expect(result.campaign).toEqual(campaign);
      }),
      RUNS,
    );
  });

  /**
   * Names are the one free-text field in the file, so they are asserted
   * separately and with the ugliest inputs the generator has: a name that
   * survives `toEqual` inside a whole campaign might still have been mangled in
   * a way a deep comparison of two identically-mangled objects would miss.
   */
  it('brings a survivor’s name back byte for byte', () => {
    fc.assert(
      fc.property(campaignArbitrary(), (campaign) => {
        const result = parseCampaignFile(serializeCampaign(campaign));

        if (!result.ok) throw new Error('expected the campaign to parse');

        expect(result.campaign.survivors.map((survivor) => survivor.name)).toEqual(
          campaign.survivors.map((survivor) => survivor.name),
        );
      }),
      RUNS,
    );
  });
});

/**
 * Byte-stability, which `exportFile.ts` goes to real trouble for.
 *
 * `inFileOrder`, `orderedMaterials`, `orderedStats`, `orderedSkills` and
 * `orderedSurvivor` exist so that two saves of the same campaign diff as
 * identical. Nothing previously proved that for a campaign whose objects were
 * *assembled* in an unusual order — and insertion order is exactly what
 * `JSON.stringify` follows, so rebuilding the same campaign with its keys
 * shuffled is what actually exercises those five functions.
 */
describe('serialization is stable', () => {
  it('gives identical bytes for the same campaign twice', () => {
    fc.assert(
      fc.property(campaignArbitrary(), (campaign) => {
        expect(serializeCampaign(campaign)).toBe(serializeCampaign(campaign));
      }),
      RUNS,
    );
  });

  it('does not depend on the order the campaign object was built in', () => {
    fc.assert(
      fc.property(campaignArbitrary(), fc.integer(), (campaign, rotation) => {
        expect(serializeCampaign(reordered(campaign, rotation))).toBe(serializeCampaign(campaign));
      }),
      RUNS,
    );
  });
});

/**
 * The same campaign with every object's keys rotated into a different insertion
 * order.
 *
 * A rotation rather than a shuffle so the reordering is a pure function of the
 * generated inputs — a property test that reaches for `Math.random` is not
 * reproducible from its seed, which defeats the point of fixing one.
 *
 * The cast is the honest kind: this is the same data with the same keys, and
 * `Object.fromEntries` cannot know that.
 */
function reordered(campaign: Campaign, rotation: number): Campaign {
  const rotate = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(rotate);

    const entries = Object.entries(value).map(([key, nested]) => [key, rotate(nested)] as const);
    if (entries.length === 0) return {};

    const by = ((rotation % entries.length) + entries.length) % entries.length;

    return Object.fromEntries([...entries.slice(by), ...entries.slice(0, by)]);
  };

  return rotate(campaign) as Campaign;
}

/**
 * A result, never an exception — for input that was never a campaign at all.
 *
 * `saveFile.test.ts` already checks a hand-written list of hostile files. This
 * generalises it past the failure modes I happened to think of, which is the
 * distinction issue #40 draws: the list is a record of my imagination, not of
 * the input space.
 */
describe('nothing throws on input that is not a campaign', () => {
  it('parses any string into a result', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        expect(() => parseCampaignFile(text)).not.toThrow();
        expect(typeof parseCampaignFile(text).ok).toBe('boolean');
      }),
      RUNS,
    );
  });

  it('parses the text of any JSON value into a result', () => {
    fc.assert(
      fc.property(jsonValueArbitrary(), (value) => {
        expect(() => parseCampaignFile(JSON.stringify(value))).not.toThrow();
      }),
      RUNS,
    );
  });

  it('migrates any JSON value into a result', () => {
    fc.assert(
      fc.property(jsonValueArbitrary(), (value) => {
        expect(() => migrate(value)).not.toThrow();
        expect(typeof migrate(value).ok).toBe('boolean');
      }),
      RUNS,
    );
  });
});

/**
 * The one finite number that does not survive a JSON round trip, recorded as an
 * example rather than fixed.
 *
 * `JSON.stringify(-0)` is `"0"`, so negative zero comes back as positive zero
 * and `toEqual` — correctly — calls those different values. The parser accepts
 * it because it asks only for a finite number, and material counts are
 * deliberately not forced to whole numbers: how many of a material a campaign
 * may hold is a rule, and no phase has shipped one yet.
 *
 * **Not worth fixing**, and the generator is constrained instead. Nothing in the
 * app can produce a −0 count: materials are only ever written as whole counts,
 * and Phase 0 and 1 write nothing but zero. Special-casing the parser to
 * normalise it would add a branch to defend against a value no code path
 * reaches. If Phase 2's materials arithmetic ever subtracts its way to −0, this
 * test is where the decision is written down.
 */
it('does not survive a negative zero material count, which is why the generator has none', () => {
  const campaign: Campaign = {
    schemaVersion: 3,
    id: 'a5f3c2d1-8b47-4e90-a2c6-1d7e5f309b84',
    name: 'Cedar Hollow',
    createdAt: '2026-09-03T00:00:00.000Z',
    turn: 1,
    phase: 'mission',
    materials: { food: -0, fuel: 0, hardware: 0, rare: 0 },
    survivors: [],
    startingCommunityBuilt: false,
    base: null,
    log: [],
  };

  const result = parseCampaignFile(serializeCampaign(campaign));

  if (!result.ok) throw new Error('expected the campaign to parse');

  // It parses, and it is the same campaign in every way a person cares about.
  expect(result.campaign.materials.food).toBe(0);
  expect(Object.is(result.campaign.materials.food, -0)).toBe(false);
});
