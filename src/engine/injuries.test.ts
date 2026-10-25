import { describe, expect, it } from 'vitest';
import type { Injury } from '../data/traits';
import { skillLevelPurchase } from './advancement';
import { laborOf } from './assignments';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { submitTraitsSwitched } from './campaignForms';
import {
  advantagesRuledOut,
  injuryCount,
  injuryFate,
  injuryLaborAdd,
  injuryLaborSet,
  rolledInjury,
  scoreZeroed,
  skillLevelMaximum,
  withInjuryGained,
} from './injuries';
import { survivorViolations } from './legality';
import { checkAssignment } from './planning';
import { createSurvivor, inventorySlots, skillScore } from './survivor';

const AT = '2026-10-25T09:00:00.000Z';

const hurt = (
  injuries: Partial<Record<Injury, number>>,
  overrides: Partial<Survivor> = {},
  tier: 1 | 2 | 3 | 4 = 3,
): Survivor => ({
  ...createSurvivor('Earl Rhodes', tier, { id: 'earl' }),
  injuries,
  ...overrides,
});

describe('gaining a Permanent Injury (pp. 137–138; R87, R161; Z7-11)', () => {
  it('is gained up to as many as it allows', () => {
    expect(injuryFate(hurt({}), 'deaf')).toBe('gained');
    expect(injuryFate(hurt({ 'bad-knee': 1 }), 'bad-knee')).toBe('gained');
    expect(injuryFate(hurt({ 'one-handed': 1 }), 'one-handed')).toBe('gained');
  });

  it('turns them for any other repeat, a third Bad knee or Bad shoulder included (R161)', () => {
    expect(injuryFate(hurt({ deaf: 1 }), 'deaf')).toBe('turns');
    expect(injuryFate(hurt({ blind: 1 }), 'blind')).toBe('turns');
    expect(injuryFate(hurt({ 'bad-knee': 2 }), 'bad-knee')).toBe('turns');
    expect(injuryFate(hurt({ 'bad-shoulder': 2 }), 'bad-shoulder')).toBe('turns');
    expect(injuryFate(hurt({ touched: 1 }), 'touched')).toBe('turns');
  });

  it('makes a second One-eyed Blind, unless they are Blind already', () => {
    expect(injuryFate(hurt({ 'one-eyed': 1 }), 'one-eyed')).toBe('becomes');
    expect(injuryFate(hurt({ 'one-eyed': 1, blind: 1 }), 'one-eyed')).toBe('turns');
    expect(withInjuryGained(hurt({ 'one-eyed': 1, deaf: 1 }), 'one-eyed').injuries).toEqual({
      deaf: 1,
      blind: 1,
    });
  });

  it('kills at a third One-handed', () => {
    expect(injuryFate(hurt({ 'one-handed': 2 }), 'one-handed')).toBe('kills');
  });

  it('counts one more, and One-handed takes Ambidextrous away, its debt staying (R159)', () => {
    const before = hurt({ deaf: 1 }, { advantages: ['ambidextrous', 'quiet'], xpDebt: 6 });
    const after = withInjuryGained(before, 'one-handed');

    expect(after.injuries).toEqual({ deaf: 1, 'one-handed': 1 });
    expect(after.advantages).toEqual(['quiet']);
    expect(after.xpDebt).toBe(6);
    expect(injuryCount(withInjuryGained(after, 'one-handed'), 'one-handed')).toBe(2);
    expect(advantagesRuledOut(after)).toEqual(['ambidextrous']);
    expect(advantagesRuledOut(before)).toEqual([]);
  });
});

describe('the table (pg. 138)', () => {
  it('gives each row its injury', () => {
    expect(rolledInjury(undefined, 1)).toBe('wheelchair-bound');
    expect(rolledInjury(undefined, 7)).toBe('blind');
    expect(rolledInjury(undefined, 9)).toBe('twice-shy');
  });

  it('gives a 4 the origin’s injury, and none with no origin, which is rolled again', () => {
    expect(rolledInjury('viral', 4)).toBe('sickly');
    expect(rolledInjury('cosmic-horror', 4)).toBe('psychic-scars');
    expect(rolledInjury('magic', 4)).toBe('touched');
    expect(rolledInjury(undefined, 4)).toBeNull();
  });

  it('gives a 10 whatever the player chose', () => {
    expect(rolledInjury(undefined, 10, 'deaf')).toBe('deaf');
    expect(rolledInjury(undefined, 10)).toBeNull();
    // A choice on any other row changes nothing.
    expect(rolledInjury(undefined, 8, 'blind')).toBe('deaf');
  });
});

describe('what an injury changes between missions (pg. 138; Z7-11)', () => {
  it('Wheelchair-bound carries one more', () => {
    expect(inventorySlots(hurt({ 'wheelchair-bound': 1 }), 0)).toBe(
      inventorySlots(hurt({}), 0) + 1,
    );
  });

  it('Blind has 0 Scout and Scavenge, and only those', () => {
    const blind = hurt({ blind: 1 }, { skills: { scout: 2, scavenge: 1, medicine: 1 } });

    expect(skillScore(blind, 'scout', 0)).toBe(0);
    expect(skillScore(blind, 'scavenge', 0)).toBe(0);
    expect(skillScore(blind, 'medicine', 0)).toBeGreaterThan(0);
    expect(scoreZeroed(blind, 'medicine')).toBe(false);
    expect(scoreZeroed(hurt({}), 'scout')).toBe(false);
  });

  it('a second Bad shoulder takes 2 off Long Guns and Heavy Weapons’ maximums', () => {
    const one = hurt({ 'bad-shoulder': 1 }, { skills: { 'long-guns': 2 } });
    const two = hurt({ 'bad-shoulder': 2 }, { skills: { 'long-guns': 2, handguns: 2 } });

    expect(skillLevelMaximum(one, 'long-guns')).toBe(skillLevelMaximum(hurt({}), 'long-guns'));
    expect(skillLevelMaximum(two, 'long-guns')).toBe(skillLevelMaximum(hurt({}), 'long-guns') - 2);
    expect(skillLevelMaximum(two, 'heavy-weapon')).toBe(skillLevelMaximum(two, 'long-guns'));
    expect(skillLevelMaximum(two, 'handguns')).toBe(skillLevelMaximum(hurt({}), 'handguns'));
    expect(skillLevelPurchase({ ...two, xp: 20 }, 'long-guns').blocked).toBe('at-tier-maximum');
    expect(skillLevelPurchase({ ...one, xp: 20 }, 'long-guns').blocked).toBeNull();
    // Never below 0, even at Tier 1.
    expect(skillLevelMaximum(hurt({ 'bad-shoulder': 2 }, {}, 1), 'long-guns')).toBe(0);
  });

  it('says a level above an injured maximum is, with the page that lowers it', () => {
    const over = hurt({ 'bad-shoulder': 2 }, { skills: { 'long-guns': 3 } });
    const violation = survivorViolations(over).find((one) => one.code === 'skill-above-tier');

    expect(violation?.message).toMatch(/above the maximum of \d their injuries leave/);
    expect(violation?.pages).toBe(138);
  });

  it('sets and adds Labor by R89’s steps', () => {
    const campaign = createNewCampaign('Cedar Hollow');
    const labor = (survivor: Survivor, team: readonly Survivor[] = [survivor]) =>
      laborOf(campaign, team, campaign.turn);

    expect(labor(hurt({ blind: 1 }))).toBe(1);
    expect(labor(hurt({ 'one-handed': 1 }))).toBe(2);
    expect(labor(hurt({ 'one-handed': 2 }))).toBe(0);
    expect(injuryLaborSet(hurt({ 'one-handed': 2, blind: 1 }))).toBe(0);
    expect(injuryLaborSet(hurt({ deaf: 1 }))).toBeNull();
    expect(injuryLaborAdd(hurt({ 'one-handed': 2 }))).toBe(0);
    expect(injuryLaborAdd(hurt({ 'one-handed': 1 }))).toBe(-1);
    // A Natural Leader's point is added after the set (R89).
    const leader = {
      ...createSurvivor('Lea', 2, { id: 'lea' }),
      advantages: ['natural-leader'] as const,
    };
    expect(labor(hurt({ blind: 1 }), [hurt({ blind: 1 }), leader]) - labor(leader)).toBe(2);
  });
});

describe('the tasks an injury forbids (pg. 138; R93; Z7-11)', () => {
  const planning = (
    survivors: readonly Survivor[],
    overrides: Partial<Campaign> = {},
  ): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    step: 'assign-mission-team',
    survivors,
    base: {
      id: 'small-town-home',
      slots: { 'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } } },
    },
    ...overrides,
  });
  const codes = (check: { blockers: readonly { code: string }[] }) =>
    check.blockers.map((one) => one.code);

  it('keeps a Blind survivor off every mission team', () => {
    const campaign = planning([hurt({ blind: 1 })]);

    expect(codes(checkAssignment(campaign, 'earl', { task: 'mission', team: 1 }))).toEqual([
      'forbidden-by-injury',
    ]);
    expect(codes(checkAssignment(campaign, 'earl', { task: 'project' }))).toEqual([]);
  });

  it('keeps a Twice shy survivor off a Watchtower, and nothing else they staff', () => {
    const campaign = planning([hurt({ 'twice-shy': 1 })], {
      base: {
        id: 'small-town-home',
        slots: {
          'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } },
          garage: { built: { facility: 'workshop', builtOnTurn: 1 } },
        },
      },
    });

    expect(codes(checkAssignment(campaign, 'earl', { task: 'staff', slot: 'front-yard' }))).toEqual(
      ['forbidden-by-injury'],
    );
    expect(codes(checkAssignment(campaign, 'earl', { task: 'staff', slot: 'garage' }))).toEqual([]);
    expect(codes(checkAssignment(campaign, 'earl', { task: 'staff', slot: 'kitchen' }))).toEqual(
      [],
    );
  });

  it('warns a Twice shy survivor needs three others on the team', () => {
    const others = ['a', 'b', 'c'].map((id) => createSurvivor(id, 1, { id }));
    const warned = (company: number) =>
      checkAssignment(
        planning([hurt({ 'twice-shy': 1 }), ...others], {
          assignments: Object.fromEntries(
            others.slice(0, company).map((one) => [one.id, { task: 'mission', team: 1 } as const]),
          ),
        }),
        'earl',
        { task: 'mission', team: 1 },
      ).warnings.map((one) => one.code);

    expect(warned(2)).toContain('twice-shy-needs-company');
    expect(warned(3)).not.toContain('twice-shy-needs-company');
    // Somebody without it is never warned about company.
    expect(
      checkAssignment(planning([hurt({})]), 'earl', { task: 'mission', team: 1 }).warnings.map(
        (one) => one.code,
      ),
    ).not.toContain('twice-shy-needs-company');
  });
});

describe('switching the traits off (R84)', () => {
  it('takes every survivor’s injuries too', () => {
    const on: Campaign = {
      ...createNewCampaign('Cedar Hollow', { traitsEnabled: true }),
      survivors: [hurt({ deaf: 1 })],
    };
    const off = submitTraitsSwitched(on, false, AT);
    if (!off.ok) throw new Error(off.problem);

    expect(off.campaign.survivors[0]?.injuries).toEqual({});
  });
});
