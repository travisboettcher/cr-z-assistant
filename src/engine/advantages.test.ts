import { describe, expect, it } from 'vitest';
import type { Advantage } from '../data/traits';
import { submitHaul } from './advancementForms';
import { laborOf } from './assignments';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { exhaustion, foodEaten, foodRequired } from './feeding';
import { foraged } from './materials';
import { createSurvivor, inventorySlots, skillScore } from './survivor';
import { submitTraitsSwitched } from './campaignForms';
import { traitsProblem } from './traits';

const AT = '2026-10-25T09:00:00.000Z';

const with_ = (
  name: string,
  tier: 1 | 2 | 3 | 4,
  advantages: readonly Advantage[],
  overrides: Partial<Survivor> = {},
): Survivor => ({
  ...createSurvivor(name, tier, { id: name.toLowerCase() }),
  advantages,
  ...overrides,
});

describe('the Advantages between missions (pg. 139; Z7-10)', () => {
  it('Powerhouse carries one more', () => {
    const plain = with_('Earl', 2, []);

    expect(inventorySlots(with_('Earl', 2, ['powerhouse']), 0)).toBe(inventorySlots(plain, 0) + 1);
  });

  it('Quiet and Natural Leader give a Score of 1 without the skill, and 1 more with it (R92)', () => {
    expect(skillScore(with_('Earl', 2, ['quiet']), 'stealth', 0)).toBe(1);
    expect(skillScore(with_('Earl', 2, []), 'stealth', 0)).toBeNull();
    const skilled = with_('Earl', 2, [], { skills: { stealth: 1 } });
    expect(skillScore({ ...skilled, advantages: ['quiet'] }, 'stealth', 0)).toBe(
      (skillScore(skilled, 'stealth', 0) ?? 0) + 1,
    );
    expect(skillScore(with_('Earl', 2, ['natural-leader']), 'tactics', 0)).toBe(1);
    expect(skillScore(with_('Earl', 2, ['natural-leader']), 'stealth', 0)).toBeNull();
  });

  it('Natural Leader adds 1 Labor to every other member, before the multipliers (R89)', () => {
    const campaign = createNewCampaign('Cedar Hollow');
    const leader = with_('Lea', 2, ['natural-leader']);
    const two = with_('Earl', 2, []);
    const three = with_('Carla', 3, []);

    // 2 for the leader, 2 + 1 and 3 + 1 for the others.
    expect(laborOf(campaign, [leader, two, three], campaign.turn)).toBe(2 + 3 + 4);
    expect(laborOf(campaign, [leader], campaign.turn)).toBe(2);
    // Jaded halves after the add, rounding up: (2 + 1) × ½ is 2.
    const jaded = with_('Earl', 2, [], { storyTrait: 'jaded' });
    expect(laborOf(campaign, [leader, jaded], campaign.turn)).toBe(2 + 2);
  });

  it('Light Eater eats 1 whatever the Tier', () => {
    expect(foodEaten(with_('Earl', 4, ['light-eater']))).toBe(1);
    expect(foodEaten(with_('Earl', 4, []))).toBe(2);
    // Another Advantage leaves what they eat alone.
    expect(foodEaten(with_('Earl', 4, ['forager']))).toBe(2);
    expect(
      foodRequired({
        ...createNewCampaign('Cedar Hollow'),
        survivors: [with_('Earl', 3, ['light-eater']), with_('Carla', 3, [])],
      }),
    ).toBe(3);
  });

  it('Outdoor Enthusiast takes no bed', () => {
    const camping = (advantages: readonly Advantage[]): Campaign => ({
      ...createNewCampaign('Cedar Hollow'),
      base: { id: 'small-town-home', slots: {} },
      survivors: Array.from({ length: 6 }, (_, at) =>
        with_(`S${String(at)}`, 1, at === 0 ? advantages : []),
      ),
    });

    expect(exhaustion(camping(['outdoor-enthusiast']))).toBe(exhaustion(camping([])) - 1);
    expect(exhaustion(camping(['forager']))).toBe(exhaustion(camping([])));
  });

  describe('Forager (R164)', () => {
    /** Turn 4's Add Materials to Storage, Earl and Carla on team 1. */
    const hauling = (overrides: Partial<Campaign> = {}): Campaign => ({
      ...createNewCampaign('Cedar Hollow'),
      turn: 4,
      step: 'add-materials-to-storage',
      base: { id: 'small-town-home', slots: {} },
      materials: { food: 0, fuel: 0, hardware: 0 },
      survivors: [
        with_('Earl', 2, ['forager']),
        with_('Carla', 2, ['forager']),
        with_('Ruby', 1, ['forager']),
      ],
      assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 1 } },
      ...overrides,
    });

    it('brings 1 Food for each Forager who went out, and none for those at home', () => {
      expect(foraged(hauling()).food).toBe(2);
      expect(foraged(hauling({ assignments: {} })).food).toBe(0);
    });

    it('brings none on a siege turn', () => {
      const siege = hauling({
        log: [
          {
            turn: 3,
            phase: 'management',
            at: AT,
            event: { kind: 'horde-checked', roll: 10, threat: 6, siege: true },
          },
        ],
      });

      expect(foraged(siege).food).toBe(0);
    });

    it('goes into storage with the haul', () => {
      const result = submitHaul(hauling(), { rolls: [] }, AT);
      if (!result.ok) throw new Error(result.problem);

      const without = submitHaul(
        hauling({ survivors: hauling().survivors.map((one) => ({ ...one, advantages: [] })) }),
        { rolls: [] },
        AT,
      );
      if (!without.ok) throw new Error(without.problem);

      expect(result.campaign.materials.food - without.campaign.materials.food).toBe(2);
    });
  });
});

describe('the Toolkit’s traits switch (R84, R158; Z7-10)', () => {
  it('starts a campaign with its origin and the traits as asked, and off by default', () => {
    expect(createNewCampaign('Cedar Hollow').traitsEnabled).toBe(false);
    expect(createNewCampaign('Cedar Hollow')).not.toHaveProperty('origin');
    expect(
      createNewCampaign('Cedar Hollow', { origin: 'viral', traitsEnabled: true }),
    ).toMatchObject({ origin: 'viral', traitsEnabled: true });
  });

  it('switches on with nothing given, and off taking every survivor’s Advantages and debt', () => {
    const forager = with_('Earl', 2, ['forager'], { xpDebt: 3 });
    const off: Campaign = { ...createNewCampaign('Cedar Hollow'), survivors: [forager] };

    const on = submitTraitsSwitched(off, true, AT);
    if (!on.ok) throw new Error(on.problem);
    expect(on.campaign.traitsEnabled).toBe(true);
    expect(on.campaign.survivors[0]).toEqual(forager);
    expect(on.campaign.log.at(-1)?.event).toEqual({ kind: 'traits-switched', enabled: true });

    const kept: Campaign = {
      ...on.campaign,
      setAside: [with_('Carla', 2, ['quiet'], { xpDebt: 5 })],
      lost: [with_('Ruby', 1, ['powerhouse'], { xpDebt: 5 })],
    };
    const back = submitTraitsSwitched(kept, false, AT);
    if (!back.ok) throw new Error(back.problem);
    for (const survivor of [
      ...back.campaign.survivors,
      ...back.campaign.setAside,
      ...back.campaign.lost,
    ]) {
      expect(survivor).toMatchObject({ advantages: [], xpDebt: 0 });
    }

    expect(submitTraitsSwitched(off, false, AT)).toEqual({
      ok: false,
      problem: 'The Toolkit’s traits are off already.',
    });
    expect(submitTraitsSwitched(on.campaign, true, AT)).toEqual({
      ok: false,
      problem: 'The Toolkit’s traits are in use already.',
    });
  });

  it('sets Advantages and debt on the sheet, each Advantage once and the debt whole', () => {
    const base = { storyTrait: null, veteran: false, bondGroup: null, stories: [] } as const;

    expect(traitsProblem({ ...base, advantages: ['quiet', 'forager'], xpDebt: 8 })).toBeNull();
    expect(traitsProblem({ ...base, xpDebt: 0 })).toBeNull();
    expect(traitsProblem({ ...base, advantages: ['quiet', 'quiet'] })).toBe(
      'Each Advantage is held once.',
    );
    expect(traitsProblem({ ...base, advantages: ['telepathy' as Advantage] })).toBe(
      'Each Advantage is held once.',
    );
    expect(traitsProblem({ ...base, xpDebt: -1 })).toBe(
      'Experience debt is a whole number, 0 or more.',
    );
    expect(traitsProblem({ ...base, xpDebt: 1.5 })).toMatch(/whole number/);
  });
});
