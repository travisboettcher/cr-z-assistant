import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMON_SKILLS, COMMON_SKILL_MAX_SCORE, SKILLS, STATS } from '../data/skills';
import type { CommonSkill, Skill, Stat } from '../data/skills';
import { TIERS, TIER_RULES } from '../data/tiers';
import {
  commonSkillPurchase,
  skillLevelPurchase,
  tierPurchase,
  withCommonSkillBought,
  withSkillLevelBought,
  withTierBought,
} from './advancement';
import type { Stats, Survivor } from './campaign';

/** See `roundTrip.property.test.ts` for why the seed is fixed rather than random. */
const RUNS = { seed: 20260903, numRuns: 300 } as const;

/**
 * A survivor in the range advancement actually operates on.
 *
 * Deliberately narrower than `survivorArbitrary` in `src/test`. That one is
 * built for the save file and produces level-900 skills, because Z1-7's
 * override means such a survivor can genuinely be on disk. Feeding those here
 * would be *worse* testing, not better: nearly every purchase would be blocked
 * at a cap, and the property would spend its whole budget proving that blocked
 * purchases change nothing. Buying is the interesting path, so this generates
 * survivors who can afford to.
 *
 * The counter at the end of the first property is what keeps that claim honest.
 */
function playableSurvivorArbitrary(): fc.Arbitrary<Survivor> {
  const level = fc.integer({ min: 0, max: 4 });

  return fc.record({
    id: fc.constant('7c1f9a03-5d62-4b8e-9f21-0a4c6e83b715'),
    name: fc.constant('Test Survivor'),
    tier: fc.constantFrom(...TIERS),
    stats: fc.record(
      Object.fromEntries(STATS.map((stat) => [stat, fc.integer({ min: 0, max: 4 })])) as Record<
        keyof Stats,
        fc.Arbitrary<number>
      >,
    ),
    skills: fc
      .uniqueArray(fc.tuple(fc.constantFrom<Skill>(...SKILLS), level), {
        selector: ([skill]) => skill,
        maxLength: 5,
      })
      .map((entries) => Object.fromEntries(entries) as Survivor['skills']),
    move: fc.integer({ min: 6, max: 8 }),
    defense: fc.integer({ min: 6, max: 8 }),
    currentHp: fc.integer({ min: 0, max: 4 }),
    xp: fc.integer({ min: 0, max: 40 }),
  });
}

type Purchase =
  | { readonly kind: 'skill'; readonly skill: Skill }
  | { readonly kind: 'common'; readonly skill: CommonSkill }
  /**
   * `raise` is drawn from every stat *and* null rather than from the zeros this
   * survivor happens to have. The survivor changes under the run — a promotion
   * rewrites all four stats — so a choice picked from the starting survivor
   * would go stale anyway, and drawing across the whole space exercises both
   * the promotion that goes through and the one refused for want of an answer.
   */
  | { readonly kind: 'tier'; readonly raise: Stat | null };

/**
 * Purchases drawn from the survivor who will make them.
 *
 * Chained off the survivor rather than generated independently, because an
 * independent draw picks one of twenty skills for a survivor who holds at most
 * five — so five attempts in six are refused `skill-not-taken` before any
 * arithmetic happens, and the property spends its budget re-proving that a
 * blocked purchase changes nothing. Weighting towards held skills puts the
 * budget on the path that actually spends XP.
 *
 * Skills the survivor does *not* hold are still drawn, at a lower weight: that
 * refusal is a real branch and worth exercising, just not eighty percent of the
 * time.
 */
function scenarioArbitrary(): fc.Arbitrary<{
  readonly survivor: Survivor;
  readonly purchases: readonly Purchase[];
}> {
  return playableSurvivorArbitrary().chain((survivor) => {
    const held = Object.keys(survivor.skills) as Skill[];
    const someSkill: fc.Arbitrary<Skill> =
      held.length === 0 ? fc.constantFrom<Skill>(...SKILLS) : fc.constantFrom<Skill>(...held);

    const purchase: fc.Arbitrary<Purchase> = fc.oneof(
      {
        arbitrary: fc.record({ kind: fc.constant('skill' as const), skill: someSkill }),
        weight: 5,
      },
      {
        arbitrary: fc.record({
          kind: fc.constant('skill' as const),
          skill: fc.constantFrom<Skill>(...SKILLS),
        }),
        weight: 1,
      },
      {
        arbitrary: fc.record({
          kind: fc.constant('common' as const),
          skill: fc.constantFrom<CommonSkill>(...COMMON_SKILLS),
        }),
        weight: 3,
      },
      {
        arbitrary: fc.record({
          kind: fc.constant('tier' as const),
          raise: fc.constantFrom<Stat | null>(...STATS, null),
        }),
        weight: 2,
      },
    );

    return fc
      .array(purchase, { maxLength: 12 })
      .map((purchases) => ({ survivor, purchases }) as const);
  });
}

/** The quoted price and the resulting survivor, from the one pair of functions. */
function apply(survivor: Survivor, purchase: Purchase) {
  switch (purchase.kind) {
    case 'skill':
      return {
        quote: skillLevelPurchase(survivor, purchase.skill),
        after: withSkillLevelBought(survivor, purchase.skill),
      };
    case 'common':
      return {
        quote: commonSkillPurchase(survivor, purchase.skill),
        after: withCommonSkillBought(survivor, purchase.skill),
      };
    case 'tier':
      return {
        quote: tierPurchase(survivor, purchase.raise),
        after: withTierBought(survivor, purchase.raise),
      };
  }
}

/**
 * Spending experience, over sequences of purchases rather than one at a time.
 *
 * The example tests buy one thing and check the result. These buy an arbitrary
 * *run* of things in an arbitrary order, which is where an off-by-one in a cap
 * or a price would actually show: a survivor who can afford three purchases but
 * not four is a state no hand-written test happens to sit on.
 */
describe('advancement never overdraws', () => {
  /**
   * The all-or-nothing claim, which is really a claim about the module's shape:
   * every `with*Bought` re-runs its own `*Purchase` check, so a blocked purchase
   * has to leave the survivor byte-identical and an allowed one has to cost
   * exactly what was quoted. Anything in between means the two halves disagree.
   */
  it('either changes nothing or charges exactly the price it quoted', () => {
    let bought = 0;

    fc.assert(
      fc.property(scenarioArbitrary(), ({ survivor: start, purchases }) => {
        let survivor = start;

        for (const purchase of purchases) {
          const before = survivor;
          const { quote, after } = apply(survivor, purchase);

          if (quote.blocked !== null) {
            expect(after).toEqual(before);
          } else {
            bought += 1;
            expect(after.xp).toBe(before.xp - quote.cost);
            expect(after.xp).toBeGreaterThanOrEqual(0);
          }

          survivor = after;
        }
      }),
      RUNS,
    );

    /*
     * The guard against a property that passes by never testing anything. A
     * generator that drifted into producing only broke survivors, or only
     * purchases they cannot make, would still make every assertion above hold
     * — vacuously — and nothing else in the file would notice.
     *
     * The floor is set from the measurement, not from a hope: this run buys
     * 397 times, and 250 leaves room for fast-check's sampling to shift without
     * turning a healthy suite red. If a change to the generator drops it under
     * that, the generator is the thing that broke.
     */
    expect(bought).toBeGreaterThan(250);
  });

  /**
   * No purchase ever carries a survivor past a cap. Stated as "unchanged, or
   * now within the cap" rather than "within the cap", because a survivor can
   * arrive above one — Z1-7's override, or a hand-edited file — and advancement
   * must refuse to make that worse rather than assume it cannot happen.
   */
  it('never raises anything past its maximum', () => {
    fc.assert(
      fc.property(scenarioArbitrary(), ({ survivor: start, purchases }) => {
        let survivor = start;

        for (const purchase of purchases) {
          const before = survivor;
          survivor = apply(survivor, purchase).after;

          expect(survivor.tier).toBeLessThanOrEqual(4);

          for (const skill of SKILLS) {
            const level = survivor.skills[skill];
            if (level === undefined || level === before.skills[skill]) continue;
            expect(level).toBeLessThanOrEqual(TIER_RULES[survivor.tier].maxSkillLevel);
          }

          for (const common of COMMON_SKILLS) {
            if (survivor[common] === before[common]) continue;
            expect(survivor[common]).toBeLessThanOrEqual(COMMON_SKILL_MAX_SCORE);
          }
        }
      }),
      RUNS,
    );
  });

  /**
   * Buying is never the way a survivor acquires a skill — that is a slot
   * decision, and it is free. A purchase that quietly added a key would let a
   * player walk past the Tier's slot count by spending XP, which is the one
   * thing the skill-slot rule exists to stop.
   */
  it('never adds or removes a skill, only levels one already held', () => {
    fc.assert(
      fc.property(scenarioArbitrary(), ({ survivor: start, purchases }) => {
        let survivor = start;

        for (const purchase of purchases) {
          const before = Object.keys(survivor.skills).sort();
          survivor = apply(survivor, purchase).after;

          expect(Object.keys(survivor.skills).sort()).toEqual(before);
        }
      }),
      RUNS,
    );
  });
});
