import { describe, expect, it } from 'vitest';
import { withCommonSkillBought, withSkillLevelBought, withTierBought } from './advancement';
import type { Survivor } from './campaign';
import { createSurvivor, withXpSpent } from './survivor';
import { withVeteranHealing } from './veteran';
import { createNewCampaign } from './campaign';

/** Earl, Tier 2 with Handguns at 0 and 20 XP to spend, 5 spent already. */
const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  skills: { handguns: 0 },
  xp: 20,
  xpSpent: 5,
  ...overrides,
});

describe('XP spent, counted from Z7-8 on (pg. 124; R149)', () => {
  it('rises by what each purchase costs, as the XP falls', () => {
    const skilled = withSkillLevelBought(earl(), 'handguns');
    expect([skilled.xp, skilled.xpSpent]).toEqual([19, 6]);

    const moved = withCommonSkillBought(earl(), 'move');
    expect(moved.xp + moved.xpSpent).toBe(25);
    expect(moved.xpSpent).toBeGreaterThan(5);

    // Promotion asks for every skill slot filled and a stat at 0 to raise.
    const ready = earl({ skills: { handguns: 0, scavenge: 0 } });
    const raise = (Object.keys(ready.stats) as (keyof Survivor['stats'])[]).find(
      (stat) => ready.stats[stat] === 0,
    );
    const promoted = withTierBought(ready, raise ?? null);
    expect([promoted.tier, promoted.xp, promoted.xpSpent]).toEqual([3, 14, 11]);
  });

  it('is unchanged by a purchase that is refused', () => {
    expect(withTierBought(earl({ xp: 0 }), 'strength').xpSpent).toBe(5);
  });

  it('counts a Veteran’s healing, which is XP spent too', () => {
    const veteran = earl({ veteran: true, tier: 3, xp: 2 });
    const hurt = { ...createSurvivor('Carla Proust', 2, { id: 'carla' }), currentHp: 0 };
    const after = withVeteranHealing(
      { ...createNewCampaign('Cedar Hollow'), survivors: [veteran, hurt] },
      'earl',
      'carla',
    );

    expect(after.survivors.map((one) => [one.xp, one.xpSpent])).toEqual([
      [1, 6],
      [0, 0],
    ]);
  });

  it('is the cost off one and onto the other', () => {
    expect(withXpSpent(earl(), 3)).toEqual({ ...earl(), xp: 17, xpSpent: 8 });
  });
});
