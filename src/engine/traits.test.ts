import { describe, expect, it } from 'vitest';
import { STORY_TRAIT_RULES, type StoryTrait } from '../data/traits';
import { submitAssignment, submitTraitsSet } from './campaignForms';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import { laborOf, traitLaborChange } from './assignments';
import { need, sharedEqually } from './healing';
import { checkAssignment } from './planning';
import { createSurvivor, maxHp, statValue } from './survivor';
import {
  bondmates,
  forbiddenBy,
  healthPerTurn,
  survivorLabor,
  traitMaxHealth,
  traitStatBonus,
  traitsProblem,
  withTraits,
} from './traits';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

/** A survivor of this Tier holding this trait, and in this bond group if Bonded. */
function holding(
  name: string,
  tier: 1 | 2 | 3 | 4,
  storyTrait: StoryTrait | null,
  overrides: Partial<Survivor> = {},
): Survivor {
  return {
    ...createSurvivor(name, tier, { id: name.toLowerCase() }),
    storyTrait,
    bondGroup: storyTrait === 'bonded' ? 1 : null,
    ...overrides,
  };
}

function campaignOf(survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors, ...overrides };
}

const labor = (team: readonly Survivor[]) => laborOf(campaignOf(team), team, 3);

describe('Labor with Story Traits (pp. 20, 88; R89, R134)', () => {
  const ada = holding('Ada', 2, 'bonded');
  const bo = holding('Bo', 3, 'bonded');
  const cy = holding('Cy', 1, null);

  /** The acceptance's first half. */
  it('doubles two bondmates on the project team', () => {
    expect(bondmates(ada, bo)).toBe(true);
    expect(labor([ada, bo])).toBe(10);
    expect(labor([ada, bo, cy])).toBe(11);
  });

  it('doubles nothing for a Bonded survivor alone, or Bonded survivors of two groups', () => {
    expect(labor([ada, cy])).toBe(3);

    const other = { ...bo, bondGroup: 2 };
    expect(bondmates(ada, other)).toBe(false);
    expect(labor([ada, other])).toBe(5);
    expect(bondmates(ada, { ...bo, storyTrait: 'jaded', bondGroup: 1 })).toBe(false);
    expect(bondmates({ ...ada, bondGroup: null }, { ...bo, bondGroup: null })).toBe(false);
  });

  /** The acceptance's second half: half, rounded up. */
  it('halves a Jaded survivor’s Labor, rounded up', () => {
    expect(survivorLabor(holding('Jo', 3, 'jaded'), [])).toBe(2);
    expect(survivorLabor(holding('Jo', 4, 'jaded'), [])).toBe(2);
    expect(survivorLabor(holding('Jo', 1, 'jaded'), [])).toBe(1);
  });

  it('gives a Lone Wolf nothing with company, and double alone', () => {
    const wolf = holding('Wolf', 3, 'lone-wolf');

    expect(labor([wolf])).toBe(6);
    expect(labor([wolf, cy])).toBe(1);
  });

  it('leaves everybody else at their Tier', () => {
    for (const trait of [null, 'berserk', 'driven'] as const) {
      expect(survivorLabor(holding('Al', 3, trait), [cy]), String(trait)).toBe(3);
    }
  });
});

describe('Jaded’s 1 Health a turn (pp. 19, 88; R90)', () => {
  const jaded = { ...holding('Jo', 3, 'jaded'), currentHp: 0 };
  const wounded = { ...holding('Wren', 3, null), currentHp: 0 };

  /** The acceptance. */
  it('takes 1 point from the Clinic, and the next goes to somebody else', () => {
    const awards = sharedEqually([jaded, wounded], 4);

    expect(awards.map((award) => [award.survivor.id, award.health])).toEqual([
      ['jo', 1],
      ['wren', 3],
    ]);
  });

  it('takes 1 at most, however deep the wound', () => {
    expect(healthPerTurn(jaded)).toBe(1);
    expect(need(jaded)).toBe(1);
    expect(need({ ...jaded, currentHp: 2 })).toBe(1);
  });

  it('caps nobody else', () => {
    expect(healthPerTurn(wounded)).toBeUndefined();
    expect(need(wounded)).toBe(3);
  });
});

describe('Berserk (pg. 88; R93, R133)', () => {
  const berserk = holding('Rex', 2, 'berserk');
  const campaign = campaignOf([berserk]);
  const task = (assignment: Assignment) => checkAssignment(campaign, 'rex', assignment);

  it('has one more maximum Health while it is held', () => {
    expect(traitMaxHealth(berserk)).toBe(1);
    expect(maxHp(berserk)).toBe(3);
    expect(maxHp({ ...berserk, storyTrait: 'jaded' })).toBe(2);
  });

  /** The acceptance. */
  it('only rests, heals or goes on a mission', () => {
    for (const refused of [
      { task: 'staff', slot: 'kitchen' },
      { task: 'project' },
      { task: 'scavenging' },
    ] as const) {
      expect(forbiddenBy(berserk, refused.task), refused.task).toBe('berserk');
      expect(task(refused).blockers, refused.task).toEqual([
        {
          code: 'forbidden-by-trait',
          message: 'A Berserk survivor only rests, heals or goes on a mission.',
          pages: 88,
        },
      ]);
      expect(submitAssignment(campaign, 'rex', refused).ok, refused.task).toBe(false);
    }

    for (const allowed of [
      { task: 'rest' },
      { task: 'healing' },
      { task: 'mission', team: 1 },
    ] as const) {
      expect(task(allowed).blockers, allowed.task).toEqual([]);
      expect(submitAssignment(campaign, 'rex', allowed).ok, allowed.task).toBe(true);
    }
  });

  it('forbids nothing to anybody without it', () => {
    expect(forbiddenBy(holding('Al', 2, 'driven'), 'project')).toBeUndefined();
    expect(forbiddenBy(holding('Al', 2, null), 'staff')).toBeUndefined();
  });

  it('records the task it allows', () => {
    const result = submitAssignment(campaign, 'rex', { task: 'rest' });

    expect(result.ok ? result.campaign.assignments : null).toEqual({ rex: { task: 'rest' } });
  });
});

describe('Jaded on a mission team (pg. 88; R12, R93)', () => {
  it('goes out wounded without the warning anybody else gets', () => {
    const jaded = { ...holding('Jo', 3, 'jaded'), currentHp: 1 };
    const wounded = { ...holding('Wren', 3, null), currentHp: 1 };
    const campaign = campaignOf([jaded, wounded]);
    const codes = (id: string) =>
      checkAssignment(campaign, id, { task: 'mission', team: 1 }).warnings.map(
        (warning) => warning.code,
      );

    expect(codes('jo')).toEqual([]);
    expect(codes('wren')).toEqual(['injured-on-a-mission']);
  });
});

describe('Driven (pg. 88; R135)', () => {
  const driven = (stats: Survivor['stats']) => ({ ...holding('Dee', 3, 'driven'), stats });

  it('raises every stat but the highest', () => {
    const dee = driven({ strength: 3, dexterity: 2, intelligence: 1, cooperation: 0 });

    expect(
      (['strength', 'dexterity', 'intelligence', 'cooperation'] as const).map((stat) =>
        statValue(dee, stat, 0),
      ),
    ).toEqual([3, 3, 2, 1]);
  });

  it('leaves every stat tied for the highest alone', () => {
    const dee = driven({ strength: 2, dexterity: 2, intelligence: 1, cooperation: 0 });

    expect(traitStatBonus(dee, 'strength')).toBe(0);
    expect(traitStatBonus(dee, 'dexterity')).toBe(0);
    expect(traitStatBonus(dee, 'intelligence')).toBe(1);
  });

  it('is raised before the hunger penalty takes from it', () => {
    const dee = driven({ strength: 3, dexterity: 2, intelligence: 1, cooperation: 0 });

    expect(statValue(dee, 'cooperation', 1)).toBe(0);
    expect(statValue(dee, 'dexterity', 1)).toBe(2);
  });

  it('raises nothing without the trait', () => {
    expect(
      traitStatBonus(
        holding('Al', 3, 'jaded', {
          stats: { strength: 3, dexterity: 2, intelligence: 1, cooperation: 0 },
        }),
        'cooperation',
      ),
    ).toBe(0);
  });
});

describe('the trait catalogue against the engine', () => {
  /** Every task there is, held to `Assignment` by the record's keys. */
  const TASKS = Object.keys({
    staff: true,
    project: true,
    rest: true,
    healing: true,
    mission: true,
    scavenging: true,
    'madness-recovery': true,
  } satisfies Record<Assignment['task'], true>);

  it('names only tasks that exist (R93)', () => {
    for (const [trait, rules] of Object.entries(STORY_TRAIT_RULES)) {
      const only: readonly string[] = 'onlyTasks' in rules ? rules.onlyTasks : [];
      for (const task of only) expect(TASKS, trait).toContain(task);
    }
  });
});

describe('setting traits by hand (R84, R85, R133)', () => {
  const none = { storyTrait: null, veteran: false, bondGroup: null, stories: [] } as const;

  it('needs a bond group on a Bonded survivor, and only there', () => {
    expect(traitsProblem({ ...none, storyTrait: 'bonded', bondGroup: 2 })).toBeNull();
    expect(traitsProblem({ ...none, storyTrait: 'bonded', bondGroup: 1 })).toBeNull();
    expect(traitsProblem({ ...none, storyTrait: 'bonded' })).toBe(
      'A Bonded survivor needs a bond group.',
    );
    expect(traitsProblem({ ...none, storyTrait: 'bonded', bondGroup: 0 })).toBe(
      'A Bonded survivor needs a bond group.',
    );
    expect(traitsProblem({ ...none, storyTrait: 'bonded', bondGroup: 1.5 })).toBe(
      'A Bonded survivor needs a bond group.',
    );
    expect(traitsProblem({ ...none, storyTrait: 'jaded', bondGroup: 1 })).toBe(
      'Only a Bonded survivor has a bond group.',
    );
    expect(traitsProblem({ ...none, veteran: true })).toBeNull();
  });

  it('sets them on the survivor named, and refuses anybody else or a bad set', () => {
    const al = holding('Al', 2, null);
    const campaign = campaignOf([al, holding('Bo', 1, null)]);
    const result = submitTraitsSet(campaign, 'al', {
      ...none,
      storyTrait: 'driven',
      veteran: true,
    });

    expect(
      result.ok ? result.campaign.survivors.map((one) => [one.storyTrait, one.veteran]) : null,
    ).toEqual([
      ['driven', true],
      [null, false],
    ]);
    expect(result.ok ? result.campaign.log : null).toEqual(campaign.log);
    expect(submitTraitsSet(campaign, 'nobody', none).ok).toBe(false);
    expect(submitTraitsSet(campaign, 'al', { ...none, storyTrait: 'bonded' }).ok).toBe(false);
  });

  it('drops Health above the new maximum when Berserk goes, and only then', () => {
    const rex = { ...holding('Rex', 2, 'berserk'), currentHp: 3 };

    expect(withTraits(rex, { ...none, storyTrait: 'jaded' }).currentHp).toBe(2);
    expect(withTraits(rex, { ...none, storyTrait: 'berserk', veteran: true }).currentHp).toBe(3);

    // Above the maximum by an override, not a trait: left alone.
    const over = { ...holding('Al', 2, null), currentHp: 5 };
    expect(withTraits(over, { ...none, storyTrait: 'jaded' }).currentHp).toBe(5);
    expect(withTraits(over, { ...none, storyTrait: 'berserk' }).currentHp).toBe(5);
    expect(withTraits({ ...rex, currentHp: 1 }, none).currentHp).toBe(1);
  });
});

describe('what the traits change the pool by, for the caption (#143)', () => {
  it('is the team’s Labor less its Tiers', () => {
    const team = [
      holding('Ada', 2, 'bonded'),
      holding('Bo', 3, 'bonded'),
      holding('Jo', 3, 'jaded'),
    ];
    const assignments = Object.fromEntries(
      team.map((one) => [one.id, { task: 'project' } as const]),
    );

    expect(traitLaborChange(campaignOf(team, { assignments }))).toBe(4);
    expect(traitLaborChange(campaignOf(team))).toBe(0);
  });
});
