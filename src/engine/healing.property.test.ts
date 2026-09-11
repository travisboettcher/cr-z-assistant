import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TIERS, TIER_RULES } from '../data/tiers';
import { createSurvivor } from './survivor';
import { room, sharedEqually } from './healing';
import type { Survivor } from './campaign';

/** See `roundTrip.property.test.ts` for why the seed is fixed rather than random. */
const RUNS = { seed: 20260911, numRuns: 400 } as const;

/**
 * A wounded community, in the range Heal Wounds actually operates on.
 *
 * Narrower than `survivorArbitrary` in `src/test` on purpose, and for the same
 * reason the advancement properties narrow theirs: that one generates the
 * survivors a *save file* can hold, including ones healed past their maximum,
 * and a distribution over those would spend its budget proving that people with
 * no room get nothing. The interesting path is a pool being shared out, so this
 * generates survivors who can take a point — with full-Health survivors mixed
 * in, because somebody filling up mid-distribution is the whole algorithm.
 */
function woundedArbitrary(): fc.Arbitrary<Survivor> {
  return fc
    .record({ tier: fc.constantFrom(...TIERS), index: fc.integer({ min: 0, max: 99 }) })
    .chain(({ tier, index }) =>
      fc.integer({ min: 0, max: TIER_RULES[tier].maxHp }).map((currentHp) => ({
        ...createSurvivor(`Survivor ${String(index)}`, tier, { id: `survivor-${String(index)}` }),
        currentHp,
      })),
    );
}

/** A community whose ids are distinct, which a roster's always are. */
const communityArbitrary = fc
  .array(woundedArbitrary(), { maxLength: 8 })
  .map((survivors) =>
    survivors.map((survivor, at) => ({ ...survivor, id: `survivor-${String(at)}` })),
  );

const anyPool = fc.integer({ min: 0, max: 30 });

const handedOut = (awards: readonly { health: number }[]) =>
  awards.reduce((total, award) => total + award.health, 0);

describe('sharing a pool of Health equally', () => {
  it('never hands out more than the pool holds', () => {
    fc.assert(
      fc.property(communityArbitrary, anyPool, (survivors, pool) => {
        expect(handedOut(sharedEqually(survivors, pool))).toBeLessThanOrEqual(pool);
      }),
      RUNS,
    );
  });

  it('never takes a survivor past their maximum', () => {
    fc.assert(
      fc.property(communityArbitrary, anyPool, (survivors, pool) => {
        for (const award of sharedEqually(survivors, pool)) {
          expect(award.health).toBeLessThanOrEqual(room(award.survivor));
        }
      }),
      RUNS,
    );
  });

  /**
   * The rule itself. Two survivors who both still have room must be within one
   * point of each other — that is what "equally" means once somebody filling up
   * has stopped it being a division.
   */
  it('keeps two survivors who both still have room within a point of each other', () => {
    fc.assert(
      fc.property(communityArbitrary, anyPool, (survivors, pool) => {
        const awards = sharedEqually(survivors, pool);
        const given = (survivor: Survivor) =>
          awards.find((award) => award.survivor.id === survivor.id)?.health ?? 0;

        const stillTaking = survivors.filter((survivor) => given(survivor) < room(survivor));

        for (const one of stillTaking) {
          for (const other of stillTaking) {
            expect(Math.abs(given(one) - given(other))).toBeLessThanOrEqual(1);
          }
        }
      }),
      RUNS,
    );
  });

  it('spends the whole pool whenever the community can absorb it', () => {
    fc.assert(
      fc.property(communityArbitrary, anyPool, (survivors, pool) => {
        const space = survivors.reduce((total, survivor) => total + room(survivor), 0);

        expect(handedOut(sharedEqually(survivors, pool))).toBe(Math.min(pool, space));
      }),
      RUNS,
    );
  });

  /**
   * The generator's own honesty check, the way the advancement properties keep
   * one: a run that only ever produced full-Health communities would satisfy
   * every property above for entirely the wrong reason.
   */
  it('generates communities that actually take points', () => {
    let shared = 0;
    let filledSomebody = 0;

    fc.assert(
      fc.property(communityArbitrary, anyPool, (survivors, pool) => {
        const awards = sharedEqually(survivors, pool);
        if (awards.length > 0) shared += 1;

        const filled = awards.some((award) => award.health === room(award.survivor));

        if (filled && survivors.length > 1) filledSomebody += 1;
      }),
      RUNS,
    );

    expect(shared).toBeGreaterThan(RUNS.numRuns / 4);
    // And the corner the algorithm exists for — somebody reaching full while
    // others are still taking — turns up often enough to be under test.
    expect(filledSomebody).toBeGreaterThan(RUNS.numRuns / 10);
  });
});
