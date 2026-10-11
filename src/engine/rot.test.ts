import { describe, expect, it } from 'vitest';
import {
  createNewCampaign,
  type Assignment,
  type Base,
  type Campaign,
  type Survivor,
} from './campaign';
import type { UpgradeId } from '../data/facilities';
import { createSurvivor } from './survivor';
import {
  biteCandidates,
  mustCheck,
  restraints,
  restraintsFree,
  rotCheckPasses,
  rotCheckResolved,
  rotOutcome,
  rotTarget,
  stillToCheck,
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

describe('stillToCheck', () => {
  const checked = (survivor: string): LogEntry => ({
    turn: 3,
    phase: 'management',
    at: AT,
    event: {
      kind: 'rot-checked',
      survivor,
      name: 'A',
      roll: 10,
      target: 12,
      passed: true,
    },
  });

  /**
   * The distinction `mustCheck` cannot make: a survivor who **holds** is still
   * at 0 Health, so they went on matching it and the screen went on offering
   * them a form the reducer would refuse (#143).
   */
  it('drops a survivor whose check has already run this turn', () => {
    const dying = community([at('a', 'A', 0), at('b', 'B', 0)]);
    const half = { ...dying, log: [checked('a')] };

    expect(stillToCheck(dying).map((survivor) => survivor.id)).toEqual(['a', 'b']);
    expect(stillToCheck(half).map((survivor) => survivor.id)).toEqual(['b']);
  });

  it('keeps somebody whose check ran last turn', () => {
    const dying = community([at('a', 'A', 0)]);
    const before = { ...dying, log: [{ ...checked('a'), turn: 2 }] };

    expect(stillToCheck(before).map((survivor) => survivor.id)).toEqual(['a']);
  });

  it('names nobody when nobody is at 0 Health', () => {
    expect(stillToCheck(community([at('a', 'A', 2)]))).toEqual([]);
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

/**
 * `preventsBiting` sat in the catalogue from Phase 2 with no reader anywhere,
 * which is the shape most of the September playtest's findings took: the
 * transcription was right and nothing summed it.
 */
describe('restraints and restraintsFree', () => {
  const clinic = (upgrades: readonly UpgradeId[]): Base => ({
    id: 'small-town-home',
    slots: {
      garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, upgrades: [...upgrades] },
    },
  });

  const held = (turn: number, survivor: string): LogEntry => ({
    turn,
    phase: 'management',
    at: AT,
    event: { kind: 'bite-restrained', survivor, name: 'Marcus Webb' },
  });

  it('is nothing without a base, and nothing for a Clinic without a set', () => {
    expect(restraints(community())).toBe(0);
    expect(restraints(community([], {}, clinic([])))).toBe(0);
  });

  /**
   * Counted off `preventsBiting` rather than by the upgrade's name, so two sets
   * hold two survivors — which is what the field says and not what counting
   * upgrades would assume.
   */
  it('counts what each set prevents, across every set installed', () => {
    expect(restraints(community([], {}, clinic(['restraints'])))).toBe(1);
    expect(restraints(community([], {}, clinic(['restraints', 'restraints'])))).toBe(2);
  });

  it('ignores an upgrade that prevents nothing', () => {
    expect(restraints(community([], {}, clinic(['med-lab', 'recovery-room'])))).toBe(0);
  });

  it('is spent down by this turn’s holds and no other turn’s', () => {
    const two = community([], {}, clinic(['restraints', 'restraints']));

    // The decoy is a check this turn that held nobody: a count that asked only
    // "is this entry this turn's" would take it for a set spent.
    const decoy: LogEntry = {
      turn: 3,
      phase: 'management',
      at: AT,
      event: { kind: 'rot-checked', survivor: 'a', name: 'A', roll: 10, target: 12, passed: true },
    };

    expect(restraintsFree({ ...two, log: [decoy, held(3, 'a')] })).toBe(1);
    expect(restraintsFree({ ...two, log: [held(3, 'a'), held(3, 'b')] })).toBe(0);
    // Last turn's holds are last turn's: a set is equipment, not a consumable.
    expect(restraintsFree({ ...two, log: [held(2, 'a'), held(2, 'b')] })).toBe(2);
  });

  /** A Clinic torn down between the hold and the question, which a save can hold. */
  it('never goes below nothing', () => {
    const none = community([], {}, clinic([]));

    expect(restraintsFree({ ...none, log: [held(3, 'a')] })).toBe(0);
  });
});

describe('rotOutcome and withRotApplied', () => {
  /** Turning at 0 Health, one survivor being healed beside them at 2. */
  const clinicful = () =>
    community([at('turning', 'Turning', 0), at('healed', 'Healed', 2)], {
      turning: { task: 'healing' },
      healed: { task: 'healing' },
    });

  /** The same two, with a Clinic that has one set of Restraints (pg. 72). */
  const restrained = (): Campaign => ({
    ...clinicful(),
    base: {
      id: 'small-town-home',
      slots: {
        garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, upgrades: ['restraints'] },
      },
    },
  });

  it('costs nothing at all when the check passes', () => {
    const outcome = rotOutcome(clinicful(), 'turning', 10, 'healed');

    expect(outcome).toEqual({ turned: null, bitten: null, restrained: false });
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

  /**
   * The other half of the rule the Restraints exist for (pg. 72): the survivor
   * still turns and is still removed — what a set prevents is the bite.
   */
  it('holds the turning survivor so nobody is bitten', () => {
    const outcome = rotOutcome(restrained(), 'turning', 1, 'healed');
    const after = withRotApplied(restrained(), outcome);

    expect(outcome.turned?.id).toBe('turning');
    expect(outcome.restrained).toBe(true);
    expect(outcome.bitten).toBeNull();

    // Removed all the same, and the survivor beside them keeps their Health.
    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['healed']);
    expect(after.survivors[0]?.currentHp).toBe(2);
  });

  it('bites again once the turn’s sets are used up', () => {
    const spent: Campaign = {
      ...restrained(),
      log: [
        {
          turn: 3,
          phase: 'management',
          at: AT,
          event: { kind: 'bite-restrained', survivor: 'somebody', name: 'Somebody' },
        },
      ],
    };

    const outcome = rotOutcome(spent, 'turning', 1, 'healed');

    expect(outcome.restrained).toBe(false);
    expect(outcome.bitten?.survivor.id).toBe('healed');
  });

  /**
   * Nothing to prevent, so nothing spent. A set held back for a turning
   * survivor nobody was standing beside would leave the next one unheld for
   * nothing.
   */
  it('spends no set where there was nobody to bite', () => {
    const alone: Campaign = {
      ...restrained(),
      survivors: [at('turning', 'Turning', 0)],
      assignments: { turning: { task: 'healing' } },
    };

    const outcome = rotOutcome(alone, 'turning', 1, null);

    expect(outcome.turned?.id).toBe('turning');
    expect(outcome.restrained).toBe(false);
    expect(outcome.bitten).toBeNull();
  });

  it('holds nobody when the check passes', () => {
    expect(rotOutcome(restrained(), 'turning', 10, 'healed').restrained).toBe(false);
  });

  it('says nothing about a survivor the community does not hold', () => {
    expect(rotOutcome(clinicful(), 'nobody', 1, null)).toEqual({
      turned: null,
      bitten: null,
      restrained: false,
    });
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
