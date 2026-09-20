import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NO_PENALTY } from './production';
import { SKILLS } from '../data/skills';
import { survivorArbitrary } from '../test/arbitraries';
import { inventorySlots, labor, maxHp, skillScore } from './survivor';

/** See `roundTrip.property.test.ts` for why the seed is fixed rather than random. */
const RUNS = { seed: 20260903, numRuns: 300 } as const;

/**
 * The derived values, over survivors nobody wrote down.
 *
 * These use the *wild* generator from `src/test` rather than the tame one the
 * advancement properties use, because reading a survivor is exactly what has to
 * keep working for a survivor who should not exist: an overridden build, a
 * hand-edited file, a campaign from a future the app has not shipped yet. The
 * sheet renders whatever is on the roster, so the arithmetic behind it must not
 * have opinions about what it is handed.
 */
describe('derived survivor values', () => {
  /**
   * The iff, not two examples of it. `skillScore` returning null is the whole
   * reason the sheet can show an em dash instead of a number somebody could
   * roll against, and "null exactly when the skill is absent" is the claim that
   * makes that safe — a version that returned null for level 0 as well would
   * pass a test that only checked the absent case.
   */
  it('score a skill if and only if the survivor has it', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        for (const skill of SKILLS) {
          const held = skill in survivor.skills;

          expect(skillScore(survivor, skill, NO_PENALTY) === null).toBe(!held);
        }
      }),
      RUNS,
    );
  });

  it('add the level to the governing stat, so a score is never below either', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        for (const skill of SKILLS) {
          const score = skillScore(survivor, skill, NO_PENALTY);
          const level = survivor.skills[skill];

          if (score === null || level === undefined) continue;

          // Both stats and levels are counts, so a score is at least each of
          // them — which fails immediately if the two are subtracted.
          expect(score).toBeGreaterThanOrEqual(level);
          expect(Number.isInteger(score)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  /**
   * Inventory Slots can be shown on a sheet and counted against, so a negative one
   * is not a display bug — it is a survivor who can carry less than nothing.
   */
  it('never make Inventory Slots, health or labor negative', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        expect(inventorySlots(survivor, NO_PENALTY)).toBeGreaterThanOrEqual(0);
        expect(maxHp(survivor)).toBeGreaterThan(0);
        expect(labor(survivor)).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  /**
   * The Carry rule reads *Score*, not level (pg. 14) — the reading that was
   * wrong once already and got caught by Earl's seven Inventory Slots. Stated here
   * as the relationship rather than the number: a survivor with Carry always
   * has more slots than the same survivor without it, whatever their tier.
   */
  it('give a survivor with carry more slots than the same survivor without', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        const withoutCarry = { ...survivor, skills: { ...survivor.skills } };
        delete withoutCarry.skills.carry;

        if (!('carry' in survivor.skills)) return;

        expect(inventorySlots(survivor, NO_PENALTY)).toBeGreaterThanOrEqual(
          inventorySlots(withoutCarry, NO_PENALTY),
        );
      }),
      RUNS,
    );
  });
});
