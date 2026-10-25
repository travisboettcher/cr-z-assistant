import { describe, expect, it } from 'vitest';
import type { Advantage } from '../data/traits';
import { submitHaul } from './advancementForms';
import { laborOf } from './assignments';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { exhaustion, foodEaten, foodRequired } from './feeding';
import { foraged } from './materials';
import { createSurvivor, inventorySlots, skillScore } from './survivor';

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
