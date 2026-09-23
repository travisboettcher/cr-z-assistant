import { describe, expect, it } from 'vitest';
import { STATS } from '../data/skills';
import { TIER_RULES, type Tier } from '../data/tiers';
import type { Survivor } from './campaign';
import {
  communityViolations,
  promotionViolations,
  skillSlotsAreFull,
  survivorViolations,
  withStatValue,
} from './legality';
import { createSurvivor } from './survivor';

/**
 * Earl as the rulebook finishes him on pg. 14: a legal Tier 4 build, four
 * skills, stats 4/3/2/1 arranged as the example arranges them. If this reports
 * a violation, the rules are being read wrong — which is the point of using the
 * book's own character rather than one invented to match the code.
 */
const EARL = {
  id: 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53',
  name: 'Earl Rhodes',
  tier: 4,
  stats: { strength: 3, dexterity: 2, intelligence: 4, cooperation: 1 },
  skills: { 'heavy-weapon': 0, tactics: 0, carry: 0, scavenge: 0 },
  move: 6,
  defense: 6,
  currentHp: 4,
  xp: 0,
} satisfies Survivor;

const codes = (survivor: Survivor) => survivorViolations(survivor).map((v) => v.code);

describe('survivorViolations', () => {
  it('passes the rulebook’s own finished character', () => {
    expect(survivorViolations(EARL)).toEqual([]);
  });

  it('reports a survivor still choosing skills, without treating it as a mistake', () => {
    // What every survivor looks like the moment they are added.
    const fresh = createSurvivor('Ruby Vance', 3, { id: 'x' });

    expect(codes(fresh)).toEqual(['not-enough-skills']);
    expect(survivorViolations(fresh)[0]?.message).toMatch(/0 of 3/);
  });

  it('reports more skills than the tier has slots', () => {
    const citizen = {
      ...createSurvivor('Ruby Vance', 2, { id: 'x' }),
      skills: { archery: 0, stealth: 0, enter: 0 },
    } satisfies Survivor;

    expect(codes(citizen)).toEqual(['too-many-skills']);
  });

  it('reports a skill level above the tier maximum', () => {
    const overTrained = { ...EARL, tier: 2, skills: { tactics: 3 } } satisfies Survivor;

    // Tier 2 caps skills at level 2, has two slots, and hands out 2/1/0/0 —
    // so this one survivor breaks three separate rules and reports all three.
    expect(codes(overTrained)).toEqual([
      'skill-above-tier',
      'stats-not-tier-array',
      'not-enough-skills',
    ]);
  });

  /**
   * Which stat holds which value is the player's choice (pg. 7), so only
   * the collection is checked. Earl with his 4 in Strength instead of
   * Intelligence is a different character, not an illegal one.
   */
  it('accepts any arrangement of the tier’s stat values', () => {
    const rearranged = {
      ...EARL,
      stats: { strength: 4, dexterity: 3, intelligence: 2, cooperation: 1 },
    } satisfies Survivor;

    expect(survivorViolations(rearranged)).toEqual([]);
  });

  it('reports stat values the tier never hands out', () => {
    const inflated = { ...EARL, stats: { ...EARL.stats, cooperation: 4 } } satisfies Survivor;

    expect(codes(inflated)).toContain('stats-not-tier-array');
  });

  it('puts the unfinished-build note last, so a first violation is one worth acting on', () => {
    const messy = {
      ...createSurvivor('Ruby Vance', 4, { id: 'x' }),
      stats: { strength: 9, dexterity: 9, intelligence: 9, cooperation: 9 },
    } satisfies Survivor;

    expect(codes(messy)).toEqual(['stats-not-tier-array', 'not-enough-skills']);
  });

  it('cites a page for every violation it reports', () => {
    for (const violation of survivorViolations({ ...EARL, tier: 1 })) {
      expect(violation.pages, violation.code).toBeTruthy();
      expect(violation.message.length, violation.code).toBeGreaterThan(0);
    }
  });
});

describe('skillSlotsAreFull', () => {
  it('is true exactly when the tier’s slots are all spent', () => {
    expect(skillSlotsAreFull(EARL)).toBe(true);
    expect(skillSlotsAreFull({ ...EARL, skills: { tactics: 0 } })).toBe(false);
  });
});

describe('withStatValue', () => {
  it('swaps, so the tier’s multiset is preserved', () => {
    const stats = withStatValue(EARL, 'cooperation', 4);

    expect(stats).toEqual({ strength: 3, dexterity: 2, intelligence: 1, cooperation: 4 });
  });

  it('is a no-op when the stat already holds the value', () => {
    expect(withStatValue(EARL, 'intelligence', 4)).toEqual(EARL.stats);
  });

  /**
   * The claim the swap design makes, checked exhaustively rather than asserted:
   * **no** sequence of assignments can produce a multiset the Tier does not
   * hand out. Every (stat, value) pair applied in turn, from every state the
   * previous ones reach.
   */
  it('cannot reach a stat array the tier does not have, however it is driven', () => {
    const expected = [...TIER_RULES[4].statArray].sort((a, b) => a - b);
    let survivor: Survivor = EARL;

    for (let round = 0; round < 3; round += 1) {
      for (const stat of STATS) {
        for (const value of TIER_RULES[4].statArray) {
          survivor = { ...survivor, stats: withStatValue(survivor, stat, value) };

          expect(Object.values(survivor.stats).sort((a, b) => a - b)).toEqual(expected);
          expect(survivorViolations(survivor)).toEqual([]);
        }
      }
    }
  });
});

describe('communityViolations', () => {
  const roster = (...tiers: readonly Tier[]): readonly Survivor[] =>
    tiers.map((tier, index) => createSurvivor(`Survivor ${index}`, tier, { id: `s${index}` }));

  it('accepts the ten tier levels a starting community is built from', () => {
    // The rulebook's recommended opening: one Hero and two Leaders (pg. 13).
    expect(communityViolations(roster(4, 3, 3), false)).toEqual([]);
  });

  it('reports an eleventh tier level', () => {
    const violations = communityViolations(roster(4, 3, 3, 1), false);

    expect(violations.map((v) => v.code)).toEqual(['community-over-budget']);
    expect(violations[0]?.message).toMatch(/spends 11/);
  });

  /**
   * The budget is a rule about *building* a starting community, not about
   * having one. Recruits push a community past ten legitimately, so once the
   * player says the building is done the rule stops applying — otherwise the
   * app is wrong for the rest of the campaign.
   */
  it('stops applying once the community is marked built', () => {
    expect(communityViolations(roster(4, 3, 3, 1), true)).toEqual([]);
  });

  it('applies again if the flag is turned back off', () => {
    const over = roster(4, 3, 3, 1);

    expect(communityViolations(over, true)).toEqual([]);
    expect(communityViolations(over, false)).toHaveLength(1);
  });

  it('says nothing about an empty community', () => {
    expect(communityViolations([], false)).toEqual([]);
  });
});

/**
 * Boundaries and unreachable-looking guards, each added because a mutation of
 * it survived the whole suite (issue #40).
 *
 * These are the cases a hand-written test set predictably misses: the value
 * exactly *on* a limit rather than over it, and a branch the types make look
 * impossible but a hand-edited save file can still reach.
 */
describe('the edges the tests were missing', () => {
  /**
   * `>` and `>=` differ by exactly one survivor: the one sitting on the cap.
   * Every earlier test used a level clearly over it, so flipping the operator
   * broke nothing — a Leader with Archery at 3 would have been reported as
   * illegal and nothing would have said so.
   */
  it('allows a skill sitting exactly on the tier maximum', () => {
    const leader = { ...createSurvivor('Carla Proust', 3), skills: { archery: 3 } };

    expect(TIER_RULES[3].maxSkillLevel).toBe(3);
    expect(survivorViolations(leader).map((v) => v.code)).not.toContain('skill-above-tier');
  });

  it('still reports a skill one level over it', () => {
    const leader = { ...createSurvivor('Carla Proust', 3), skills: { archery: 4 } };

    expect(survivorViolations(leader).map((v) => v.code)).toContain('skill-above-tier');
  });

  /**
   * The length half of the stat-array comparison, which looks dead because
   * `Stats` has four keys and a `StatArray` has four values — and is not, because
   * the save-file parser only checks that the four it knows about are present.
   * A hand-edited file with a fifth stat gets this far, and without the length
   * check its four real values would match and the extra would pass unnoticed.
   */
  it('reports a survivor carrying a stat this version does not know about', () => {
    const hero = createSurvivor('Earl Rhodes', 4);
    const withExtra = { ...hero, stats: { ...hero.stats, luck: 7 } } as unknown as Survivor;

    expect(survivorViolations(withExtra).map((v) => v.code)).toContain('stats-not-tier-array');
  });

  /**
   * `withStatValue` swaps, so it needs somebody holding the value it is asked
   * to assign. Nothing in the app can ask for a value the survivor does not
   * have — the dropdown is built from what they hold — so this only fires for a
   * hand-edited file, where `stats-not-tier-array` is already the real report.
   * Returning the stats untouched is what keeps that from silently corrupting
   * them further.
   */
  it('leaves stats alone when asked to assign a value nobody holds', () => {
    const hero = createSurvivor('Earl Rhodes', 4);

    expect(Object.values(hero.stats)).not.toContain(9);
    expect(withStatValue(hero, 'strength', 9)).toEqual(hero.stats);
  });
});

/**
 * **R3-M3.** The cap was computed, displayed on the base sheet and reported as
 * exceeded, and never mentioned at the moment of the purchase — the only moment
 * a player could act on it. A Tier 2 base took a third and then a fourth Hero
 * with no warning and no blocker (#168).
 */
describe('promotionViolations', () => {
  const leader = (): Survivor => createSurvivor('Earl Rhodes', 3, { id: 'earl' });

  it('says nothing while the community is under the cap', () => {
    expect(promotionViolations(leader(), 1, 2)).toEqual([]);
  });

  it('warns on the promotion that would reach the cap', () => {
    const [violation] = promotionViolations(leader(), 2, 2);

    expect(violation?.code).toBe('over-hero-cap');
    expect(violation?.message).toContain('2 Hero-Tier survivors');
    expect(violation?.pages).toBe(54);
  });

  it('goes on warning past it, because the community is still over', () => {
    expect(promotionViolations(leader(), 4, 2)).toHaveLength(1);
  });

  /** The singular, and the base that allows none at all. */
  it.each([
    [1, 1, 'allows 1 Hero-Tier survivor'],
    [0, 0, 'no Hero-Tier survivors at all'],
  ])('reads properly at a cap of %i', (heroes, cap, says) => {
    expect(promotionViolations(leader(), heroes, cap)[0]?.message).toContain(says);
  });

  /**
   * Only the promotion that makes a Hero. Every other one leaves the count
   * alone, and the cap is about who is Tier 4 rather than about promotions.
   */
  it.each([1, 2] as const)('says nothing about a promotion from Tier %i', (tier) => {
    expect(promotionViolations(createSurvivor('Carla', tier, { id: 'c' }), 9, 1)).toEqual([]);
  });

  it('says nothing to a survivor already at the top', () => {
    expect(promotionViolations(createSurvivor('Nell', 4, { id: 'n' }), 9, 1)).toEqual([]);
  });
});
