/**
 * The derived values as *properties* — what stays true of every survivor,
 * rather than of the four from pg. 48–50.
 *
 * The worked examples in `survivor.test.ts` are still the primary defence, and
 * these do not replace them: an example checks the arithmetic against the
 * *rules*, and no amount of generated input can do that. What these add is the
 * ranges — that no roster produces a negative carry capacity, that "has the
 * skill" and "has a score" are the same question asked twice, that a value the
 * UI is about to render is never a number nobody could act on.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SKILL_STATS, SKILLS } from '../data/skills';
import { TIER_RULES, TIERS } from '../data/tiers';
import { arbitrarySurvivor, PROPERTY_RUN } from '../test/arbitraries';
import { communityTierLevels, itemSlots, labor, maxHp, skillScore } from './survivor';

const anySkill = fc.constantFrom(...SKILLS);

describe('skillScore', () => {
  /**
   * The rule this function exists for (pg. 41): null is *"does not have the
   * skill"*, and it is null exactly then. A zero here would read as a score a
   * player could act on, and this is what keeps the two apart for skills nobody
   * wrote a case for.
   */
  it('is null exactly when the survivor does not have the skill', () => {
    fc.assert(
      fc.property(arbitrarySurvivor, anySkill, (survivor, skill) => {
        expect(skillScore(survivor, skill) === null).toBe(survivor.skills[skill] === undefined);
      }),
      PROPERTY_RUN,
    );
  });

  it('is the governing stat plus the level whenever it is not null', () => {
    fc.assert(
      fc.property(arbitrarySurvivor, anySkill, (survivor, skill) => {
        const score = skillScore(survivor, skill);
        const level = survivor.skills[skill];

        if (level === undefined) return;
        expect(score).toBe(survivor.stats[SKILL_STATS[skill]] + level);
        // Stats and levels are both counts from zero, so a score is never one
        // of those either — a negative Skill Score is not a thing to render.
        expect(score).toBeGreaterThanOrEqual(0);
      }),
      PROPERTY_RUN,
    );
  });
});

describe('itemSlots', () => {
  it('is never negative, and never less than the tier alone gives', () => {
    fc.assert(
      fc.property(arbitrarySurvivor, (survivor) => {
        const slots = itemSlots(survivor);

        expect(slots).toBeGreaterThanOrEqual(0);
        expect(slots).toBeGreaterThanOrEqual(TIER_RULES[survivor.tier].baseItemSlots);
      }),
      PROPERTY_RUN,
    );
  });

  /**
   * Carry adds the *Score*, not the level (pg. 49), so taking Carry at level 0
   * is worth a survivor's whole Strength and never worth nothing. A survivor
   * without the skill adds nothing at all — the two halves of the same rule.
   */
  it('adds the whole Carry Score when the survivor has Carry, and nothing when they do not', () => {
    fc.assert(
      fc.property(arbitrarySurvivor, (survivor) => {
        const base = TIER_RULES[survivor.tier].baseItemSlots;
        const carry = skillScore(survivor, 'carry');

        expect(itemSlots(survivor)).toBe(carry === null ? base : base + carry);
      }),
      PROPERTY_RUN,
    );
  });
});

describe('maxHp and labor', () => {
  it('read the Tier table and nothing else', () => {
    fc.assert(
      fc.property(arbitrarySurvivor, (survivor) => {
        expect(maxHp(survivor)).toBe(TIER_RULES[survivor.tier].maxHp);
        expect(labor(survivor)).toBe(TIER_RULES[survivor.tier].labor);
      }),
      PROPERTY_RUN,
    );
  });
});

describe('communityTierLevels', () => {
  it('is the sum of the roster, and sits between one and four per survivor', () => {
    fc.assert(
      fc.property(fc.array(arbitrarySurvivor, { maxLength: 10 }), (survivors) => {
        const total = communityTierLevels(survivors);

        expect(total).toBe(survivors.reduce((sum, survivor) => sum + survivor.tier, 0));
        expect(total).toBeGreaterThanOrEqual(survivors.length * Math.min(...TIERS));
        expect(total).toBeLessThanOrEqual(survivors.length * Math.max(...TIERS));
      }),
      PROPERTY_RUN,
    );
  });
});
