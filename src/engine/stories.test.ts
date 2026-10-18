import { describe, expect, it } from 'vitest';
import { submitPromotion } from './advancementForms';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { submitTraitsSet, submitVeteranHealing } from './campaignForms';
import { healthAwards, need, sharedEqually } from './healing';
import { becomesVeteran, storiesHeld, storiesOnOffer } from './traits';
import { createSurvivor } from './survivor';
import { healthThisTurn, veteranCanReach, veteranHealingProblem } from './veteran';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-17T09:00:00.000Z';

const survivor = (name: string, tier: 1 | 2 | 3 | 4, overrides: Partial<Survivor> = {}) => ({
  ...createSurvivor(name, tier, { id: name.split(' ')[0]?.toLowerCase() as string }),
  ...overrides,
});

function campaignOf(survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 4, survivors, ...overrides };
}

function accepted(result: ReturnType<typeof submitPromotion>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('promotion attaches a story, or makes a Veteran (pg. 87; R117, R136)', () => {
  /** A Leader's stat array has a single 0, so no stat choice is asked. */
  const leader = survivor('Carla Proust', 3, { xp: 8 });
  const rookie = survivor('Ruby Vance', 1, {
    xp: 4,
    stats: { strength: 1, dexterity: 0, intelligence: 0, cooperation: 0 },
  });

  it('offers a Tier 1 or 2 the five stories, and a Tier 3 none', () => {
    expect(storiesOnOffer(campaignOf([rookie]), rookie)).toEqual([
      'left-behind-1',
      'preppers-stash-1',
      'sentimental-value',
      'neighbors-rifle',
      'crashed-convoy',
    ]);
    expect(storiesOnOffer(campaignOf([leader]), leader)).toEqual([]);
    expect(becomesVeteran(leader)).toBe(true);
    expect(becomesVeteran(rookie)).toBe(false);
  });

  /** The acceptance's first half. */
  it('attaches the chosen story, on this turn, and the log says which', () => {
    const after = accepted(
      submitPromotion(
        campaignOf([rookie]),
        { survivor: 'ruby', raise: 'dexterity', story: 'crashed-convoy' },
        AT,
      ),
    );

    expect(after.survivors[0]?.stories).toEqual([{ mission: 'crashed-convoy', attachedOnTurn: 4 }]);
    expect(after.survivors[0]?.veteran).toBe(false);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'survivor-promoted',
      survivor: 'ruby',
      name: 'Ruby Vance',
      tier: 2,
      story: 'crashed-convoy',
    });
  });

  it('asks for a story whenever one is on offer, and only one on offer', () => {
    const problem = (story?: 'left-behind-1' | 'warehouse') => {
      const result = submitPromotion(
        campaignOf([
          rookie,
          survivor('Earl Rhodes', 2, {
            stories: [{ mission: 'left-behind-1', attachedOnTurn: 1 }],
          }),
        ]),
        { survivor: 'ruby', raise: 'dexterity', ...(story === undefined ? {} : { story }) },
        AT,
      );
      return result.ok ? null : result.problem;
    };

    expect(problem()).toBe('Choose the story this promotion attaches.');
    // The stat choice is still asked first, story or no story (pg. 18).
    const unmade = submitPromotion(
      campaignOf([rookie]),
      { survivor: 'ruby', raise: null, story: 'crashed-convoy' },
      AT,
    );
    expect(unmade.ok ? null : unmade.problem).toBe(
      'Choose which stat the promotion lifts off zero.',
    );
    expect(problem('left-behind-1')).toBe('Choose the story this promotion attaches.');
    expect(problem('warehouse' as 'left-behind-1')).toBe(
      'Choose the story this promotion attaches.',
    );
  });

  /** The acceptance's second half. */
  it('makes a Leader promoted to Hero a Veteran, with no story', () => {
    const after = accepted(
      submitPromotion(campaignOf([leader]), { survivor: 'carla', raise: null }, AT),
    );

    expect(after.survivors[0]).toMatchObject({ tier: 4, veteran: true, stories: [] });
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'survivor-promoted',
      survivor: 'carla',
      name: 'Carla Proust',
      tier: 4,
      veteran: true,
    });
    const refused = submitPromotion(
      campaignOf([leader]),
      { survivor: 'carla', raise: null, story: 'crashed-convoy' },
      AT,
    );
    expect(refused.ok ? null : refused.problem).toBe('This promotion attaches no story.');
  });

  it('offers only the stories nobody holds, set-aside survivors included, and none when all are held', () => {
    const holders = [
      survivor('Ada Moss', 2, {
        stories: [
          { mission: 'left-behind-1', attachedOnTurn: 1 },
          { mission: 'preppers-stash-1', attachedOnTurn: 2 },
        ],
      }),
    ];
    const away = survivor('Bo Lane', 2, {
      stories: [{ mission: 'sentimental-value', attachedOnTurn: 1 }],
    });
    const campaign = campaignOf([rookie, ...holders], { setAside: [away] });

    expect([...storiesHeld(campaign)]).toEqual([
      'left-behind-1',
      'preppers-stash-1',
      'sentimental-value',
    ]);
    expect(storiesOnOffer(campaign, rookie)).toEqual(['neighbors-rifle', 'crashed-convoy']);

    const everything = campaignOf([
      rookie,
      survivor('Cy Dunn', 2, {
        stories: [
          'left-behind-1',
          'preppers-stash-1',
          'sentimental-value',
          'neighbors-rifle',
          'crashed-convoy',
        ].map((mission) => ({ mission: mission as 'left-behind-1', attachedOnTurn: 1 })),
      }),
    ]);
    expect(storiesOnOffer(everything, rookie)).toEqual([]);
    expect(
      accepted(submitPromotion(everything, { survivor: 'ruby', raise: 'dexterity' }, AT))
        .survivors[0]?.stories,
    ).toEqual([]);
  });
});

describe('stories set by hand (R116, R136)', () => {
  const none = { storyTrait: null, veteran: false, bondGroup: null } as const;

  it('attaches a story nobody else holds, and refuses one somebody does, or the same twice', () => {
    const campaign = campaignOf([
      survivor('Ada Moss', 2),
      survivor('Bo Lane', 2, { stories: [{ mission: 'warehouse', attachedOnTurn: 1 }] }),
    ]);
    const set = (missions: readonly ('warehouse' | 'crashed-convoy')[]) =>
      submitTraitsSet(campaign, 'ada', {
        ...none,
        stories: missions.map((mission) => ({ mission, attachedOnTurn: 4 })),
      });

    const ok = set(['crashed-convoy']);
    expect(ok.ok ? ok.campaign.survivors[0]?.stories : null).toEqual([
      { mission: 'crashed-convoy', attachedOnTurn: 4 },
    ]);
    for (const refused of [set(['warehouse']), set(['crashed-convoy', 'crashed-convoy'])]) {
      expect(refused.ok ? null : refused.problem).toBe(
        'A story is attached to one survivor at a time.',
      );
    }

    // Bo keeps his own story when his sheet is saved again.
    const bo = submitTraitsSet(campaign, 'bo', {
      ...none,
      stories: [{ mission: 'warehouse', attachedOnTurn: 1 }],
    });
    expect(bo.ok).toBe(true);
  });
});

describe('a Veteran’s healing (pg. 88; R90, R91, R137)', () => {
  const earl = survivor('Earl Rhodes', 4, { veteran: true, xp: 2 });
  const ruby = survivor('Ruby Vance', 2, { currentHp: 0 });
  const carla = survivor('Carla Proust', 3, { currentHp: 0 });
  const planning = (overrides: Partial<Campaign> = {}) =>
    campaignOf([earl, ruby, carla], { step: 'assign-rest-and-healing', ...overrides });
  const heal = (campaign: Campaign, veteran: string, target: string) => {
    const result = submitVeteranHealing(campaign, veteran, target, AT);
    if (!result.ok) throw new Error(result.problem);
    return result.campaign;
  };

  /** The acceptance: 2 XP lifts two survivors from 0 to 1. */
  it('lifts a survivor at 0 Health to 1 for 1 of the Veteran’s XP, as many as it pays for', () => {
    const after = heal(heal(planning(), 'earl', 'ruby'), 'earl', 'carla');

    expect(after.survivors.map((one) => [one.id, one.currentHp, one.xp])).toEqual([
      ['earl', 4, 0],
      ['ruby', 1, 0],
      ['carla', 1, 0],
    ]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'veteran-healed',
      veteran: 'earl',
      veteranName: 'Earl Rhodes',
      survivor: 'carla',
      name: 'Carla Proust',
    });
    expect(veteranHealingProblem(after, 'earl', 'ruby')).toBe(
      'Earl Rhodes has no XP to spend on it.',
    );
  });

  it('reaches only survivors at 0 Health, once each', () => {
    const once = heal(planning(), 'earl', 'ruby');

    expect(veteranHealingProblem(once, 'earl', 'ruby')).toBe(
      'Only a survivor at 0 Health can be brought up.',
    );
    expect(veteranHealingProblem(once, 'earl', 'nobody')).toBe(
      'Only a survivor at 0 Health can be brought up.',
    );
    expect(veteranCanReach(once, 'earl').map((one) => one.id)).toEqual(['carla']);
  });

  it('brings somebody below 0 up to 1, not further', () => {
    const after = heal(planning({ survivors: [earl, { ...ruby, currentHp: -1 }] }), 'earl', 'ruby');

    expect(after.survivors[1]?.currentHp).toBe(1);
  });

  it('counts only this survivor’s Health this turn', () => {
    const at = (event: Campaign['log'][number]['event'], turn = 4) => ({
      turn,
      phase: 'advancement' as const,
      at: AT,
      event,
    });
    const campaign = planning({
      log: [
        at({
          kind: 'health-restored',
          survivor: 'carla',
          name: 'Carla Proust',
          health: 2,
          source: 'facility',
        }),
        at({
          kind: 'veteran-healed',
          veteran: 'earl',
          veteranName: 'Earl Rhodes',
          survivor: 'carla',
          name: 'Carla Proust',
        }),
        at(
          {
            kind: 'health-restored',
            survivor: 'ruby',
            name: 'Ruby Vance',
            health: 1,
            source: 'rest',
          },
          3,
        ),
        at({ kind: 'mission-selected', team: 1, mission: 'thin-the-herd', names: [] }),
        at({ kind: 'survivor-promoted', survivor: 'ruby', name: 'Ruby Vance', tier: 3 }),
      ],
    });

    expect(healthThisTurn(campaign, 'ruby')).toBe(0);
    expect(healthThisTurn(campaign, 'carla')).toBe(3);
  });

  it('brings themselves up too (R137)', () => {
    const down = planning({ survivors: [{ ...earl, currentHp: 0 }] });
    const after = heal(down, 'earl', 'earl');

    expect(after.survivors[0]).toMatchObject({ currentHp: 1, xp: 1 });
    expect(after.log.at(-1)?.event).toMatchObject({ veteran: 'earl', survivor: 'earl' });
  });

  it('is a Veteran’s, in the Planning Phase', () => {
    expect(veteranHealingProblem(planning({ step: 'heal-wounds' }), 'earl', 'ruby')).toBe(
      'A Veteran heals in the Planning Phase.',
    );
    expect(veteranHealingProblem(planning(), 'ruby', 'carla')).toBe(
      'Only a Veteran in the community can do this.',
    );
    expect(veteranHealingProblem(planning(), 'nobody', 'carla')).toBe(
      'Only a Veteran in the community can do this.',
    );
    expect(submitVeteranHealing(planning({ step: 'heal-wounds' }), 'earl', 'ruby', AT).ok).toBe(
      false,
    );
  });

  it('passes over a Jaded survivor who has had their 1 this turn, and Heal Wounds counts it (R90)', () => {
    const jaded = { ...ruby, storyTrait: 'jaded' as const };
    const healed = planning({
      survivors: [earl, jaded],
      log: [
        {
          turn: 4,
          phase: 'advancement',
          at: AT,
          event: {
            kind: 'health-restored',
            survivor: 'ruby',
            name: 'Ruby Vance',
            health: 1,
            source: 'facility',
            infection: 1,
          },
        },
      ],
    });

    expect(healthThisTurn(healed, 'ruby')).toBe(1);
    expect(veteranHealingProblem(healed, 'earl', 'ruby')).toBe(
      'Ruby Vance is Jaded, and has had their Health for this turn.',
    );

    // The other way round: a Veteran's point, then the walk back to Heal Wounds.
    const lifted = heal(planning({ survivors: [earl, jaded] }), 'earl', 'ruby');
    const lowered = {
      ...lifted,
      survivors: lifted.survivors.map((one) =>
        one.id === 'ruby' ? { ...one, currentHp: 0 } : one,
      ),
    };
    expect(healthThisTurn(lowered, 'ruby')).toBe(1);
    expect(need(lowered.survivors[1] as Survivor, 1)).toBe(0);
    expect(sharedEqually([lowered.survivors[1] as Survivor], 3, () => 1)).toEqual([]);
    expect(
      healthAwards({
        ...lowered,
        step: 'heal-wounds',
        assignments: { ruby: { task: 'rest' } },
      }),
    ).toEqual([]);
    expect(healthThisTurn({ ...lowered, turn: 5 }, 'ruby')).toBe(0);
  });
});
