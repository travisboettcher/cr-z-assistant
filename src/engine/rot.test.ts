import { describe, expect, it } from 'vitest';
import {
  createNewCampaign,
  type Assignment,
  type Base,
  type Campaign,
  type Survivor,
} from './campaign';
import { createSurvivor } from './survivor';
import {
  biteCandidates,
  mustCheck,
  rotCheckPasses,
  rotCheckResolved,
  rotOutcome,
  rotTarget,
  withRotApplied,
} from './rot';
import type { LogEntry } from './log';
import { staffedWith } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

function at(id: string, name: string, currentHp: number, tier: 1 | 2 | 3 | 4 = 2): Survivor {
  return { ...createSurvivor(name, tier, { id }), currentHp };
}

function community(
  survivors: readonly Survivor[] = [],
  assignments: Record<string, Assignment> = {},
  base: Base | null = null,
): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors, assignments, base };
}

describe('mustCheck', () => {
  it('names everybody at 0 Health and nobody else', () => {
    const campaign = community([at('a', 'A', 0), at('b', 'B', 1), at('c', 'C', 0)]);

    expect(mustCheck(campaign).map((survivor) => survivor.id)).toEqual(['a', 'c']);
  });

  /**
   * Health is typed in and can be overridden below zero, the same way it can be
   * pushed above the maximum. Somebody at −1 is not less dead than somebody at
   * zero.
   */
  it('includes a survivor below zero, which a save can hold', () => {
    expect(mustCheck(community([at('a', 'A', -1)])).map((survivor) => survivor.id)).toEqual(['a']);
  });
});

describe('rotTarget', () => {
  const clinic = (): Base => ({
    id: 'small-town-home',
    slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
  });

  /** The same Clinic with a Med Lab, powered and watered so it applies. */
  const medLab = (): Base => ({
    id: 'small-town-home',
    slots: {
      garage: {
        built: { facility: 'medical-clinic', builtOnTurn: 1 },
        upgrades: ['med-lab'],
        power: true,
        water: true,
      },
    },
  });

  const medic = (score: number): Survivor => ({
    ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
    skills: { medicine: 0 },
  });

  it('is twelve without a base', () => {
    expect(rotTarget(community())).toBe(12);
  });

  it('is twelve with a Clinic nobody is working', () => {
    expect(rotTarget(community([], {}, clinic()))).toBe(12);
  });

  it('drops by the Clinic staff’s combined Medicine', () => {
    expect(rotTarget(staffedWith(community([], {}, clinic()), 'garage', [medic(3)]))).toBe(9);
  });

  /**
   * A Clinic takes one survivor; a Med Lab adds the second (pg. 54, 72). The
   * scores then sum rather than the better winning — which is the distinction
   * worth a test, and was unreachable while capacity had no reader at all.
   */
  it('sums two medics rather than taking the better of them', () => {
    const both = staffedWith(community([], {}, medLab()), 'garage', [
      medic(3),
      { ...medic(2), id: 'other', name: 'Ada Poole' },
    ]);

    expect(rotTarget(both)).toBe(7);
  });

  /** And the second medic does nothing at all without the Med Lab. */
  it('counts only the one a bare Clinic takes', () => {
    const both = staffedWith(community([], {}, clinic()), 'garage', [
      medic(3),
      { ...medic(2), id: 'other', name: 'Ada Poole' },
    ]);

    expect(rotTarget(both)).toBe(9);
  });

  it('counts nobody working anything else', () => {
    const kitchen: Base = {
      id: 'small-town-home',
      slots: { kitchen: { built: { facility: 'kitchen', builtOnTurn: 1 } } },
    };

    expect(rotTarget(staffedWith(community([], {}, kitchen), 'kitchen', [medic(3)]))).toBe(12);
  });

  /**
   * Ruling 2: the book states no floor, the natural-1 rule already stops the
   * check becoming a certainty, and clamping would be inventing a rule.
   */
  it('has no floor, and will go below zero for a well-staffed Clinic', () => {
    // A Med Lab's two seats, both filled by somebody very good at Medicine.
    // This used to pile four medics into a bare Clinic, which is not a state
    // the rules allow and is no longer one the engine counts.
    const crowded = staffedWith(community([], {}, medLab()), 'garage', [
      medic(8),
      { ...medic(8), id: 'two', name: 'Two' },
    ]);

    expect(rotTarget(crowded)).toBe(-4);
  });

  /** Check for Rot runs before Feed, so the penalty in force is last turn's. */
  it('reads the Medicine under the hunger penalty', () => {
    const staffed = staffedWith(community([], {}, clinic()), 'garage', [medic(4)]);
    const starving: Campaign = {
      ...staffed,
      // One survivor and a shortfall of three: a penalty of two.
      survivors: [...staffed.survivors],
      log: [
        {
          turn: 2,
          phase: 'management',
          at: AT,
          event: { kind: 'survivors-fed', required: 2, hunger: 3 },
        },
      ],
    };

    expect(rotTarget(staffed)).toBe(8);
    expect(rotTarget(starving)).toBe(10);
  });
});

describe('rotCheckPasses', () => {
  const citizen = at('a', 'A', 0, 2);

  it('adds the survivor’s Tier to the die', () => {
    // Tier 2 against a target of 9: an 8 is ten and holds, a 6 is eight and
    // does not.
    expect(rotCheckPasses(citizen, 8, 9)).toBe(true);
    expect(rotCheckPasses(citizen, 6, 9)).toBe(false);
  });

  it('passes on exactly the target', () => {
    expect(rotCheckPasses(citizen, 7, 9)).toBe(true);
  });

  /** pg. 8, and the reason `rotTarget` needs no floor. */
  it('always fails on a natural 1 and always holds on a natural 10', () => {
    expect(rotCheckPasses(citizen, 1, -5)).toBe(false);
    expect(rotCheckPasses(citizen, 10, 99)).toBe(true);
  });

  it('gives a Hero two more than a Citizen on the same die', () => {
    expect(rotCheckPasses(at('h', 'H', 0, 4), 6, 9)).toBe(true);
    expect(rotCheckPasses(citizen, 6, 9)).toBe(false);
  });
});

describe('biteCandidates', () => {
  const three = () =>
    community([at('turning', 'Turning', 0), at('healed', 'Healed', 2), at('busy', 'Busy', 2)], {
      turning: { task: 'healing' },
      healed: { task: 'healing' },
      busy: { task: 'project' },
    });

  it('is whoever else is being healed', () => {
    expect(biteCandidates(three(), 'turning').map((survivor) => survivor.id)).toEqual(['healed']);
  });

  it('is nobody when the turning survivor is alone in the Clinic', () => {
    const alone = community([at('turning', 'Turning', 0)], { turning: { task: 'healing' } });

    expect(biteCandidates(alone, 'turning')).toEqual([]);
  });
});

describe('rotOutcome and withRotApplied', () => {
  /** Turning at 0 Health, one survivor being healed beside them at 2. */
  const clinicful = () =>
    community([at('turning', 'Turning', 0), at('healed', 'Healed', 2)], {
      turning: { task: 'healing' },
      healed: { task: 'healing' },
    });

  it('costs nothing at all when the check passes', () => {
    const outcome = rotOutcome(clinicful(), 'turning', 10, 'healed');

    expect(outcome).toEqual({ turned: null, bitten: null });
    expect(withRotApplied(clinicful(), outcome)).toEqual(clinicful());
  });

  it('removes the survivor who turned', () => {
    const outcome = rotOutcome(clinicful(), 'turning', 1, null);
    const after = withRotApplied(clinicful(), outcome);

    expect(outcome.turned?.id).toBe('turning');
    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['healed']);
  });

  it('takes the turned survivor’s assignment with them', () => {
    const after = withRotApplied(clinicful(), rotOutcome(clinicful(), 'turning', 1, null));

    expect(after.assignments).toEqual({ healed: { task: 'healing' } });
  });

  it('bites the survivor the player picked, for one Damage', () => {
    const outcome = rotOutcome(clinicful(), 'turning', 1, 'healed');
    const after = withRotApplied(clinicful(), outcome);

    expect(outcome.bitten?.survivor.id).toBe('healed');
    expect(outcome.bitten?.dies).toBe(false);
    expect(after.survivors).toEqual([{ ...at('healed', 'Healed', 1) }]);
  });

  /** The worst case the story names: one failed check, two removals. */
  it('removes the bitten survivor as well when the bite finishes them', () => {
    const barely = community([at('turning', 'Turning', 0), at('healed', 'Healed', 1)], {
      turning: { task: 'healing' },
      healed: { task: 'healing' },
    });
    const outcome = rotOutcome(barely, 'turning', 1, 'healed');

    expect(outcome.bitten?.dies).toBe(true);
    expect(withRotApplied(barely, outcome).survivors).toEqual([]);
    expect(withRotApplied(barely, outcome).assignments).toEqual({});
  });

  it('bites nobody when the player picked nobody', () => {
    const outcome = rotOutcome(clinicful(), 'turning', 1, null);

    expect(outcome.bitten).toBeNull();
    expect(withRotApplied(clinicful(), outcome).survivors).toEqual([at('healed', 'Healed', 2)]);
  });

  it('bites nobody when the pick is not a candidate', () => {
    const elsewhere = community([at('turning', 'Turning', 0), at('busy', 'Busy', 2)], {
      turning: { task: 'healing' },
      busy: { task: 'project' },
    });

    expect(rotOutcome(elsewhere, 'turning', 1, 'busy').bitten).toBeNull();
  });

  it('says nothing about a survivor the community does not hold', () => {
    expect(rotOutcome(clinicful(), 'nobody', 1, null)).toEqual({ turned: null, bitten: null });
  });

  it('leaves everything else about the campaign alone', () => {
    const before = clinicful();
    const after = withRotApplied(before, rotOutcome(before, 'turning', 10, 'healed'));

    expect(after).toEqual(before);
  });
});

/**
 * The story's headline acceptance, as a claim about the survivor records
 * themselves: a hungry community rolls worse without a single stat being
 * rewritten. See `survivor.test.ts` for what the penalty does to a Score.
 */
describe('the hunger penalty touches no survivor record', () => {
  it('changes the Rot target and nothing on the roster', () => {
    const clinic: Base = {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
    };
    const fed = staffedWith(community([], {}, clinic), 'garage', [
      {
        ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
        stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 4 },
        skills: { medicine: 0 },
      },
    ]);

    const hungry: Campaign = {
      ...fed,
      log: [
        {
          turn: 2,
          phase: 'management',
          at: AT,
          event: { kind: 'survivors-fed', required: 2, hunger: 4 },
        } satisfies LogEntry,
      ],
    };

    expect(rotTarget(hungry)).toBeGreaterThan(rotTarget(fed));
    expect(hungry.survivors).toEqual(fed.survivors);
  });
});

/**
 * Per survivor rather than per step, unlike every other guard in this phase:
 * the step resolves one check for each survivor at 0 Health, so "already done"
 * is a question about a person. Without it the same survivor was observed
 * passing at 10 and then dying at 1, both entries in the log.
 */
describe('rotCheckResolved', () => {
  const checked = (turn: number, survivor: string): LogEntry => ({
    turn,
    phase: 'management',
    at: AT,
    event: {
      kind: 'rot-checked',
      survivor,
      name: 'Marcus Webb',
      roll: 5,
      target: 12,
      passed: true,
    },
  });

  const withLog = (log: readonly LogEntry[]): Campaign => ({ ...community(), log });

  it('is false before the check', () => {
    expect(rotCheckResolved(community(), 'webb')).toBe(false);
  });

  it('is true once this survivor has been checked this turn', () => {
    expect(rotCheckResolved(withLog([checked(3, 'webb')]), 'webb')).toBe(true);
  });

  /** The decoy: somebody else's check is not this survivor's. */
  it('is false for a survivor whose check has not run', () => {
    expect(rotCheckResolved(withLog([checked(3, 'ada')]), 'webb')).toBe(false);
  });

  it('ignores a check from an earlier turn', () => {
    expect(rotCheckResolved(withLog([checked(2, 'webb')]), 'webb')).toBe(false);
  });
});
