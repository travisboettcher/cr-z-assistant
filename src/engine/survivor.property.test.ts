import { ADVANTAGE_RULES, type AdvantageRules } from '../data/traits';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NO_PENALTY } from './production';
import { SKILLS, SKILL_STATS } from '../data/skills';
import { itemCap, itemTerm } from './equipment';
import { survivorArbitrary } from '../test/arbitraries';
import { inventorySlots, labor, maxHp, skillScore, statValue } from './survivor';

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
  it('score a skill if and only if the survivor has it, or an Advantage gives one (R92)', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        for (const skill of SKILLS) {
          const held =
            skill in survivor.skills ||
            survivor.advantages.some(
              (advantage) => (ADVANTAGE_RULES[advantage] as AdvantageRules).score?.skill === skill,
            );

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

          if (score === null || level === undefined || itemCap(survivor, skill) !== undefined) {
            continue;
          }

          // Both stats and levels are counts, so a score less its item term is
          // at least each of them — which fails immediately if the two are
          // subtracted. The item term is its own (Z5-3), and may be −1.
          const bare = score - itemTerm(survivor, skill);
          expect(bare).toBeGreaterThanOrEqual(level);
          expect(bare).toBeGreaterThanOrEqual(statValue(survivor, SKILL_STATS[skill], NO_PENALTY));
          expect(Number.isInteger(score)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  /**
   * What a survivor carries only ever helps a Skill Score, apart from the tool
   * belt's cap: the worst item term is the shoddy −1 they hold anyway, so
   * picking something up can never make them worse at a skill (pp. 8, 14).
   */
  it('never fall for carrying more, short of a cap', () => {
    fc.assert(
      fc.property(survivorArbitrary(), (survivor) => {
        const unarmed = { ...survivor, items: [] };

        for (const skill of SKILLS) {
          const carrying = skillScore(survivor, skill, NO_PENALTY);
          const without = skillScore(unarmed, skill, NO_PENALTY);

          if (carrying === null || without === null || itemCap(survivor, skill) !== undefined) {
            continue;
          }

          expect(carrying).toBeGreaterThanOrEqual(without);
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
