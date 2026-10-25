import { describe, expect, it } from 'vitest';
import { commonSkillPurchase, skillLevelPurchase, tierPurchase } from './advancement';
import { submitXpAward } from './advancementForms';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { submitVeteranHealing } from './campaignForms';
import { withLostRolled } from './lostRoll';
import { createSurvivor, withXpGained } from './survivor';
import { spellLearningProblem } from './spells';

const AT = '2026-10-25T09:00:00.000Z';

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});

describe('experience debt (pg. 137; R94; Z7-10)', () => {
  it('takes XP gained one for one before any reaches the survivor', () => {
    expect(withXpGained(earl({ xp: 2, xpDebt: 3 }), 1)).toMatchObject({ xp: 2, xpDebt: 2 });
    expect(withXpGained(earl({ xp: 2, xpDebt: 1 }), 3)).toMatchObject({ xp: 4, xpDebt: 0 });
    expect(withXpGained(earl({ xp: 2, xpDebt: 0 }), 2)).toMatchObject({ xp: 4, xpDebt: 0 });
  });

  it('pays off from the Advancement Phase’s XP, and says so in the history', () => {
    const campaign: Campaign = {
      ...createNewCampaign('Cedar Hollow'),
      turn: 3,
      step: 'character-advancement',
      survivors: [earl({ xpDebt: 1 })],
      assignments: { earl: { task: 'mission', team: 1 } },
    };
    const result = submitXpAward(campaign, { survivor: 'earl', source: 'mission' }, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors[0]).toMatchObject({ xp: 0, xpDebt: 0 });
    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'xp-awarded',
      survivor: 'earl',
      name: 'Earl Rhodes',
      amount: 1,
      source: 'mission',
      toDebt: 1,
    });

    const free = submitXpAward(
      { ...campaign, survivors: [earl()] },
      { survivor: 'earl', source: 'mission' },
      AT,
    );
    expect(free.ok && free.campaign.log.at(-1)?.event).not.toHaveProperty('toDebt');
  });

  it('pays off from a Lost roll that places nobody', () => {
    const campaign: Campaign = {
      ...createNewCampaign('Cedar Hollow'),
      turn: 3,
      step: 'select-mission',
      lost: [earl({ xpDebt: 2 })],
    };

    expect(withLostRolled(campaign, 'earl', 2, null, AT).lost[0]).toMatchObject({
      xp: 0,
      xpDebt: 1,
    });
  });

  it('refuses every purchase while any is left', () => {
    const indebted = earl({ xp: 20, xpDebt: 1, skills: { archery: 1 } });

    expect(skillLevelPurchase(indebted, 'archery').blocked).toBe('in-debt');
    expect(commonSkillPurchase(indebted, 'move').blocked).toBe('in-debt');
    const zero = (Object.keys(indebted.stats) as (keyof Survivor['stats'])[]).find(
      (stat) => indebted.stats[stat] === 0,
    );
    expect(tierPurchase(indebted, zero ?? null).blocked).toBe('in-debt');
    expect(skillLevelPurchase({ ...indebted, xpDebt: 0 }, 'archery').blocked).toBeNull();
  });

  it('keeps a Veteran in debt from healing (R91), and a learner from a spell (R113)', () => {
    const planning: Campaign = {
      ...createNewCampaign('Cedar Hollow'),
      turn: 4,
      step: 'assign-rest-and-healing',
      survivors: [
        earl({ veteran: true, xp: 3, xpDebt: 1 }),
        createSurvivor('Carla Proust', 2, { id: 'carla' }),
      ].map((one) => (one.id === 'carla' ? { ...one, currentHp: 0 } : one)),
    };

    expect(submitVeteranHealing(planning, 'earl', 'carla', AT)).toEqual({
      ok: false,
      problem: 'Earl Rhodes has experience debt to pay off first.',
    });

    const library: Campaign = {
      ...createNewCampaign('Cedar Hollow'),
      turn: 4,
      step: 'character-advancement',
      origin: 'magic',
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'mystic-library', builtOnTurn: 1 } } },
      },
      survivors: [earl({ xp: 10, xpDebt: 1 })],
      assignments: { earl: { task: 'staff', slot: 'garage' } },
      log: [
        {
          turn: 3,
          phase: 'mission',
          at: AT,
          event: { kind: 'spells-cast', team: 1, spells: ['teleport'] },
        },
      ],
    };
    expect(spellLearningProblem(library, 'earl', 'teleport')).toBe(
      'Their experience debt is paid off before any XP is spent.',
    );
  });
});
