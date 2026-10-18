import { describe, expect, it } from 'vitest';
import { submitInoculated, submitRotResisted } from './advancementForms';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { submitInoculationChosen } from './campaignForms';
import { beingHealed } from './healing';
import {
  inoculateProblem,
  inoculationFor,
  inoculationProblem,
  inoculationsDue,
  inoculationsHeld,
  rotResistanceDue,
  rotResistanceProblem,
} from './inoculation';
import type { LogEntry } from './log';
import { outstanding } from './outstanding';
import { checkAssignment } from './planning';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const clinic = (): Base => ({
  id: 'small-town-home',
  slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
});

const SHOT = { id: 'shot', item: 'inoculation' as const, grade: 'standard' as const };

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});
const carla = createSurvivor('Carla Proust', 2, { id: 'carla' });

/** Turn 3 in a Viral campaign with a Clinic and an Inoculation, Earl and Carla assigned to healing. */
function viral(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'assign-rest-and-healing',
    origin: 'viral',
    base: clinic(),
    survivors: [earl(), carla],
    inventory: [SHOT, { id: 'pistol', item: 'pistol', grade: 'standard' }],
    assignments: { earl: { task: 'healing' }, carla: { task: 'healing' } },
    ...overrides,
  };
}

function accepted(result: ReturnType<typeof submitInoculated>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const named = (campaign: Campaign, id: string) =>
  campaign.survivors.find((survivor) => survivor.id === id) as Survivor;

describe('choosing an Inoculation in the Planning Phase (pg. 48; R97, R143)', () => {
  it('is one from the base’s Inventory, for somebody assigned to healing', () => {
    const chosen = accepted(submitInoculationChosen(viral(), 'earl', 'shot'));

    expect(inoculationsHeld(viral()).map((item) => item.id)).toEqual(['shot']);
    expect(chosen.assignments.earl).toEqual({ task: 'healing', inoculation: 'shot' });
    expect(inoculationFor(chosen, 'earl')).toBe('shot');
    expect(inoculationFor(chosen, 'carla')).toBeUndefined();
    // Taken back, it is healing again.
    expect(accepted(submitInoculationChosen(chosen, 'earl', null)).assignments.earl).toEqual({
      task: 'healing',
    });
  });

  it('refuses outside Planning, off a healing assignment, without a Clinic, or twice over', () => {
    const chosen = accepted(submitInoculationChosen(viral(), 'earl', 'shot'));

    expect(inoculationProblem(viral({ step: 'heal-wounds' }), 'earl', 'shot')).toMatch(
      /Planning Phase/,
    );
    expect(
      inoculationProblem(viral({ assignments: { earl: { task: 'rest' } } }), 'earl', 'shot'),
    ).toBe('Only a survivor assigned to healing is given an Inoculation.');
    expect(inoculationProblem(viral({ base: null }), 'earl', 'shot')).toMatch(
      /Medical Clinic, and this base has none/,
    );
    expect(inoculationProblem(viral(), 'earl', 'pistol')).toBe(
      'That isn’t an Inoculation in the base’s Inventory.',
    );
    expect(inoculationProblem(chosen, 'carla', 'shot')).toBe(
      'That Inoculation is given to somebody else already.',
    );
    expect(inoculationProblem(chosen, 'earl', 'shot')).toBeNull();
    expect(
      inoculationProblem(
        viral({ survivors: [earl({ rotResistant: true }), carla] }),
        'earl',
        'shot',
      ),
    ).toBe('Earl Rhodes is Rot Resistant already.');
    expect(inoculationProblem(viral({ base: null }), 'earl', null)).toBeNull();
  });

  /** R143: being inoculated is reason enough to be at the Clinic at full Health. */
  it('drops the full-Health warning for somebody being inoculated', () => {
    const codes = (campaign: Campaign) =>
      checkAssignment(
        campaign,
        'earl',
        campaign.assignments.earl ?? { task: 'healing' },
      ).warnings.map((warning) => warning.code);

    expect(codes(viral())).toContain('already-at-full-health');
    expect(codes(accepted(submitInoculationChosen(viral(), 'earl', 'shot')))).not.toContain(
      'already-at-full-health',
    );
  });
});

describe('giving it at Heal Wounds (R97)', () => {
  /** Next turn's Heal Wounds, with Earl's Inoculation chosen last Planning Phase. */
  const healing = (overrides: Partial<Campaign> = {}): Campaign =>
    viral({
      step: 'heal-wounds',
      assignments: { earl: { task: 'healing', inoculation: 'shot' }, carla: { task: 'healing' } },
      ...overrides,
    });

  it('owes it, and takes Earl out of the Clinic’s healing share', () => {
    expect(inoculationsDue(healing()).map(({ survivor, item }) => [survivor.id, item])).toEqual([
      ['earl', 'shot'],
    ]);
    expect(beingHealed(healing()).map((survivor) => survivor.id)).toEqual(['carla']);
    expect(outstanding(healing()).map((one) => one.says)).toContain(
      'An Inoculation hasn’t been given.',
    );
  });

  it('uses the item up, makes Earl Rot Resistant, and logs it', () => {
    const after = accepted(submitInoculated(healing(), 'earl', AT));

    expect(named(after, 'earl').rotResistant).toBe(true);
    expect(after.inventory.map((item) => item.id)).toEqual(['pistol']);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'survivor-inoculated',
      survivor: 'earl',
      name: 'Earl Rhodes',
      item: 'shot',
    });
    expect(inoculationsDue(after)).toEqual([]);
    expect(outstanding(after).map((one) => one.says)).not.toContain(
      'An Inoculation hasn’t been given.',
    );
  });

  it('refuses outside the Advancement Phase, somebody not owed one, a gone item, or a second', () => {
    expect(inoculateProblem(healing({ step: 'assign-rest-and-healing' }), 'earl')).toMatch(
      /Advancement Phase/,
    );
    expect(inoculateProblem(healing(), 'carla')).toBe(
      'Nobody by that name is owed an Inoculation this turn.',
    );
    expect(inoculateProblem(healing({ inventory: [] }), 'earl')).toBe(
      'The Inoculation chosen for them is no longer in the base’s Inventory.',
    );
    expect(
      inoculateProblem(healing({ survivors: [earl({ rotResistant: true }), carla] }), 'earl'),
    ).toBe('Earl Rhodes is Rot Resistant already.');
    expect(submitInoculated(accepted(submitInoculated(healing(), 'earl', AT)), 'earl', AT)).toEqual(
      {
        ok: false,
        problem: 'Nobody by that name is owed an Inoculation this turn.',
      },
    );
  });

  it('reads last turn’s choice once this turn’s Planning has cleared it', () => {
    const planned: LogEntry = {
      turn: 3,
      phase: 'planning',
      at: AT,
      event: {
        kind: 'planning-began',
        cleared: { earl: { task: 'healing', inoculation: 'shot' } },
      },
    };
    const cleared = healing({ step: 'assign-facility-staff', assignments: {}, log: [planned] });

    expect(inoculationsDue(cleared).map(({ survivor }) => survivor.id)).toEqual(['earl']);
  });
});

describe('Rot Resistant’s 1 Infection off (pg. 140; R96)', () => {
  const advancing = (survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign =>
    viral({ step: 'character-advancement', survivors, ...overrides });

  it('reaches everybody Rot Resistant carrying Infection, in a Viral campaign, once a turn', () => {
    const campaign = advancing([
      earl({ rotResistant: true, infection: 3 }),
      { ...carla, rotResistant: true },
      createSurvivor('Ruby Vance', 2, { id: 'ruby' }),
    ]);
    const after = accepted(submitRotResisted(campaign, AT));

    expect(rotResistanceDue(campaign).map((survivor) => survivor.id)).toEqual(['earl']);
    expect(named(after, 'earl').infection).toBe(2);
    expect(named(after, 'carla').infection).toBe(0);
    expect(after.log.map(({ event }) => event)).toEqual([
      { kind: 'infection-resisted', survivor: 'earl', name: 'Earl Rhodes' },
    ]);
    expect(rotResistanceDue(after)).toEqual([]);
    expect(rotResistanceDue({ ...after, turn: 4 }).map((survivor) => survivor.id)).toEqual([
      'earl',
    ]);
    expect(submitRotResisted(after, AT)).toEqual({
      ok: false,
      problem: 'Nobody Rot Resistant has Infection to lose this turn.',
    });
  });

  it('is owed at Character Advancement, and refused outside the Advancement Phase', () => {
    const campaign = advancing([earl({ rotResistant: true, infection: 1 })]);

    expect(outstanding(campaign).map((one) => one.says)).toContain(
      'Rot Resistant hasn’t taken this turn’s Infection off.',
    );
    expect(rotResistanceProblem({ ...campaign, step: 'check-for-rot' })).toMatch(
      /Advancement Phase/,
    );
    expect(rotResistanceDue({ ...campaign, origin: 'magic' })).toEqual([]);
  });

  it('does the lot for several at once, an entry each', () => {
    const after = accepted(
      submitRotResisted(
        advancing([
          earl({ rotResistant: true, infection: 1 }),
          { ...carla, rotResistant: true, infection: 4 },
        ]),
        AT,
      ),
    );

    expect(after.survivors.map((survivor) => survivor.infection)).toEqual([0, 3]);
    expect(after.log).toHaveLength(2);
  });
});
