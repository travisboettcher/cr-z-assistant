import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { submitInfectionCheck, submitRotCheck } from './managementForms';
import { outstanding } from './outstanding';
import {
  checkInfectionBite,
  infectionBonus,
  infectionCheckPasses,
  infectionCheckResolved,
  infectionMustCheck,
  infectionOutcome,
  infectionStillToCheck,
  rotCheckResolved,
} from './rot';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const carrying = (
  id: string,
  name: string,
  infection: number,
  tier: 1 | 2 | 3 | 4 = 2,
): Survivor => ({
  ...createSurvivor(name, tier, { id }),
  infection,
});

/** A survivor whose Medicine Score is exactly this (pg. 8). */
const medic = (id: string, score: number): Survivor => ({
  ...createSurvivor('Nell Haig', 4, { id }),
  stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
  skills: { medicine: 0 },
});

const clinic = (): Base => ({
  id: 'small-town-home',
  slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
});

/** Turn 3, Check for Rot, in a Viral campaign. */
function viral(survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'check-for-rot',
    origin: 'viral',
    survivors,
    ...overrides,
  };
}

const ids = (survivors: readonly Survivor[]) => survivors.map((survivor) => survivor.id);

describe('who makes the Infection check (pg. 123; R99, R101)', () => {
  it('is everybody carrying Infection, in a Viral campaign only', () => {
    const survivors = [carrying('a', 'A', 2), carrying('b', 'B', 0), carrying('c', 'C', 10)];

    expect(ids(infectionMustCheck(viral(survivors)))).toEqual(['a', 'c']);
    expect(
      infectionMustCheck({ ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors }),
    ).toEqual([]);
    expect(infectionMustCheck(viral(survivors, { origin: 'cosmic-horror' }))).toEqual([]);
  });

  it('leaves out anybody whose check is resolved this turn', () => {
    const campaign = viral([carrying('a', 'A', 2), carrying('c', 'C', 5)], {
      log: [
        {
          turn: 3,
          phase: 'management',
          at: AT,
          event: {
            kind: 'infection-checked',
            survivor: 'a',
            name: 'A',
            roll: 5,
            infection: 2,
            bonus: 0,
            passed: true,
          },
        },
      ],
    });

    expect(infectionCheckResolved(campaign, 'a')).toBe(true);
    expect(rotCheckResolved(campaign, 'a')).toBe(false);
    expect(infectionCheckResolved({ ...campaign, turn: 4 }, 'a')).toBe(false);
    expect(ids(infectionStillToCheck(campaign))).toEqual(['c']);
  });

  it('is a check of its own, neither resolving nor resolved by the Rot check (R100)', () => {
    const rotChecked = viral([carrying('a', 'A', 2)], {
      log: [
        {
          turn: 3,
          phase: 'management',
          at: AT,
          event: {
            kind: 'rot-checked',
            survivor: 'a',
            name: 'A',
            roll: 5,
            target: 4,
            passed: true,
          },
        },
      ],
    });

    expect(rotCheckResolved(rotChecked, 'a')).toBe(true);
    expect(infectionCheckResolved(rotChecked, 'a')).toBe(false);
    expect(rotCheckResolved(viral([carrying('a', 'A', 2)], { log: [] }), 'a')).toBe(false);
  });
});

describe('the roll (pp. 8, 123; R99)', () => {
  it('is the die and the Tier against the Infection, with no natural results', () => {
    const tier2 = carrying('a', 'A', 6);

    expect(infectionCheckPasses(tier2, 4, 0)).toBe(true);
    expect(infectionCheckPasses(tier2, 3, 0)).toBe(false);
    expect(infectionCheckPasses(tier2, 3, 1)).toBe(true);
    // A 1 is only a 1, and a 10 only a 10.
    expect(infectionCheckPasses(carrying('b', 'B', 3), 1, 0)).toBe(true);
    expect(infectionCheckPasses(carrying('c', 'C', 10, 1), 10, -2)).toBe(false);
  });

  it('adds every survivor’s Medicine with a Medical Clinic, and nothing without one', () => {
    const survivors = [carrying('a', 'A', 6), medic('m1', 2), medic('m2', 1)];

    expect(infectionBonus(viral(survivors, { base: clinic() }))).toBe(3);
    expect(infectionBonus(viral(survivors))).toBe(0);
    expect(
      infectionBonus(
        viral(survivors, {
          base: {
            id: 'small-town-home',
            slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 } } },
          },
        }),
      ),
    ).toBe(0);
  });
});

describe('a failure turns them, as a failed Rot check does (pg. 22; R100)', () => {
  const healing = { task: 'healing' as const };

  it('turns the survivor, and they bite somebody being healed', () => {
    const campaign = viral([carrying('a', 'A', 9), carrying('b', 'B', 0)], {
      assignments: { b: healing },
    });

    expect(infectionOutcome(campaign, 'a', 2, 'b')).toMatchObject({
      turned: { id: 'a' },
      bitten: { survivor: { id: 'b' }, dies: false },
      restrained: false,
    });
    expect(infectionOutcome(campaign, 'a', 7, 'b')).toEqual({
      turned: null,
      bitten: null,
      restrained: false,
    });
    expect(checkInfectionBite(campaign, 'a', 2, null).blockers[0]?.code).toBe('bite-required');
    expect(checkInfectionBite(campaign, 'a', 2, 'b').blockers).toEqual([]);
  });

  it('is recorded, with the turning’s own entries after it', () => {
    const campaign = viral([carrying('a', 'A', 9), carrying('b', 'B', 0)], {
      assignments: { b: healing },
    });
    const result = submitInfectionCheck(campaign, { survivor: 'a', roll: 2, bitten: 'b' }, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log.map(({ event }) => event.kind)).toEqual([
      'infection-checked',
      'survivor-left',
      'survivor-bitten',
    ]);
    expect(result.campaign.log[0]?.event).toEqual({
      kind: 'infection-checked',
      survivor: 'a',
      name: 'A',
      roll: 2,
      infection: 9,
      bonus: 0,
      passed: false,
    });
    expect(ids(result.campaign.survivors)).toEqual(['b']);
  });

  it('records a check that held, and nothing else', () => {
    const campaign = viral([carrying('a', 'A', 3), medic('m', 2)], { base: clinic() });
    const result = submitInfectionCheck(campaign, { survivor: 'a', roll: 1, bitten: null }, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log).toHaveLength(1);
    expect(result.campaign.log[0]?.event).toMatchObject({ bonus: 2, passed: true });
    expect(infectionCheckResolved(result.campaign, 'a')).toBe(true);
  });

  it('refuses a second check, anybody carrying none, and a bite left out', () => {
    const campaign = viral([carrying('a', 'A', 9), carrying('b', 'B', 0)], {
      assignments: { b: healing },
    });
    const once = submitInfectionCheck(campaign, { survivor: 'a', roll: 9, bitten: null }, AT);
    if (!once.ok) throw new Error(once.problem);

    expect(
      submitInfectionCheck(once.campaign, { survivor: 'a', roll: 9, bitten: null }, AT),
    ).toEqual({
      ok: false,
      problem: 'Their Infection check is already resolved this turn.',
    });
    expect(submitInfectionCheck(campaign, { survivor: 'b', roll: 9, bitten: null }, AT)).toEqual({
      ok: false,
      problem: 'Only a survivor carrying Infection, in a Viral campaign, makes this check.',
    });
    expect(
      submitInfectionCheck(campaign, { survivor: 'a', roll: 2, bitten: null }, AT),
    ).toMatchObject({ ok: false, problem: /takes the bite/ });
  });

  it('turns a survivor who fails both checks once (R100)', () => {
    const campaign = viral([{ ...carrying('a', 'A', 9), currentHp: 0 }]);
    const rot = submitRotCheck(campaign, { survivor: 'a', roll: 1, bitten: null }, AT);
    if (!rot.ok) throw new Error(rot.problem);

    // Gone, so nothing is left to check.
    expect(infectionStillToCheck(rot.campaign)).toEqual([]);
    expect(
      submitInfectionCheck(rot.campaign, { survivor: 'a', roll: 1, bitten: null }, AT),
    ).toMatchObject({
      ok: false,
    });
  });
});

describe('a failure taken as a Permanent Injury instead (R100; Z7-12)', () => {
  const toolkit = (survivors: readonly Survivor[]) =>
    viral(survivors, { traitsEnabled: true, assignments: { b: { task: 'healing' } } });

  it('gains it and turns nobody, the check’s entry saying so', () => {
    const result = submitInfectionCheck(
      toolkit([carrying('a', 'A', 9), carrying('b', 'B', 0)]),
      { survivor: 'a', roll: 2, bitten: null, injury: { roll: 4 } },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors.map((one) => [one.id, one.injuries])).toEqual([
      ['a', { sickly: 1 }],
      ['b', {}],
    ]);
    expect(result.campaign.log.map(({ event }) => event)).toEqual([
      {
        kind: 'infection-checked',
        survivor: 'a',
        name: 'A',
        roll: 2,
        infection: 9,
        bonus: 0,
        passed: false,
        injury: { roll: 4, injury: 'sickly', fate: 'gained' },
      },
    ]);
    expect(infectionCheckResolved(result.campaign, 'a')).toBe(true);
  });

  it('turns them as normal for a repeat they can’t carry, the bite and all', () => {
    const result = submitInfectionCheck(
      toolkit([{ ...carrying('a', 'A', 9), injuries: { deaf: 1 } }, carrying('b', 'B', 0)]),
      { survivor: 'a', roll: 2, bitten: 'b', injury: { roll: 8 } },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log.map(({ event }) => event.kind)).toEqual([
      'infection-checked',
      'survivor-left',
      'survivor-bitten',
    ]);
    expect(result.campaign.log[0]?.event).toMatchObject({
      injury: { roll: 8, injury: 'deaf', fate: 'turns' },
    });
  });

  it('is refused on a check that held, and without the traits', () => {
    const held = submitInfectionCheck(
      toolkit([carrying('a', 'A', 3)]),
      { survivor: 'a', roll: 9, bitten: null, injury: { roll: 8 } },
      AT,
    );
    expect(held).toEqual({
      ok: false,
      problem: 'They passed, so there’s no turning to take an injury instead of.',
    });
    expect(
      submitInfectionCheck(
        viral([carrying('a', 'A', 9)]),
        { survivor: 'a', roll: 2, bitten: null, injury: { roll: 8 } },
        AT,
      ),
    ).toEqual({
      ok: false,
      problem: 'Permanent Injuries come with the Toolkit’s survivor traits.',
    });
  });
});

describe('the step owes the checks (R99)', () => {
  it('until everybody carrying Infection has made one', () => {
    const campaign = viral([carrying('a', 'A', 2)]);
    const owed = (c: Campaign) => outstanding(c).map((one) => one.says);
    const checked = submitInfectionCheck(campaign, { survivor: 'a', roll: 5, bitten: null }, AT);
    if (!checked.ok) throw new Error(checked.problem);

    expect(owed(campaign)).toContain('Somebody carrying Infection hasn’t made an Infection check.');
    expect(owed(checked.campaign)).not.toContain(
      'Somebody carrying Infection hasn’t made an Infection check.',
    );
  });
});
