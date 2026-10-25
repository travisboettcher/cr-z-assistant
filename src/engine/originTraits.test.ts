import { describe, expect, it } from 'vitest';
import type { MissionId } from '../data/missions';
import type { Injury } from '../data/traits';
import { campaignReducer } from '../state/campaignStore';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { projectTeamHumanityDue, withHumanityGained } from './humanity';
import { humanityMax, infectionAfterMission, injuryFate, withInjuryGained } from './injuries';
import type { LogEntry, MissionWound } from './log';
import { submitRotCheck } from './managementForms';
import { submitMissionEnded } from './missionForms';
import { madnessAfter, madnessPerTurn, woundsProblem } from './missions';
import { spellLearningProblem } from './spells';
import { createSurvivor } from './survivor';
import { traitsProblem } from './traits';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-25T09:00:00.000Z';

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});

/** Turn 4's Tactical Mission, Earl alone on team 1, under this origin. */
function onMission(
  origin: NonNullable<Campaign['origin']>,
  survivor: Survivor,
  mission: MissionId = 'thin-the-herd',
): Campaign {
  const chose: LogEntry = {
    turn: 4,
    phase: 'mission',
    at: AT,
    event: { kind: 'mission-selected', team: 1, mission, names: [] },
  };

  return {
    ...createNewCampaign('Cedar Hollow', { ...FIXED, origin, traitsEnabled: true }),
    turn: 4,
    step: 'tactical-mission',
    survivors: [survivor],
    assignments: { earl: { task: 'mission', team: 1 } },
    log: [chose],
  };
}

const ended = (campaign: Campaign, wound: Partial<MissionWound>, mission: MissionId) => {
  const result = submitMissionEnded(
    campaign,
    {
      kind: 'mission-played',
      team: 1,
      mission,
      wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2, ...wound }],
    },
    [],
    AT,
  );
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
};

describe('an origin injury takes its Advantage away instead (pg. 140; R159, R162)', () => {
  it('is the fate whenever they hold the Advantage, the injury not gained and the debt kept', () => {
    const viral = earl({ rotResistant: true, xpDebt: 2 });
    const cosmic = earl({ advantages: ['calloused-psyche', 'quiet'], xpDebt: 7 });
    const magic = earl({ advantages: ['resistance'], xpDebt: 1 });

    expect(injuryFate(viral, 'sickly')).toBe('replaces');
    expect(injuryFate(cosmic, 'psychic-scars')).toBe('replaces');
    expect(injuryFate(magic, 'touched')).toBe('replaces');
    expect(withInjuryGained(viral, 'sickly')).toEqual({ ...viral, rotResistant: false });
    expect(withInjuryGained(cosmic, 'psychic-scars')).toEqual({ ...cosmic, advantages: ['quiet'] });
    expect(withInjuryGained(magic, 'touched')).toEqual({ ...magic, advantages: [] });
  });

  it('leaves them with neither, so the next one is gained as usual', () => {
    const after = withInjuryGained(earl({ advantages: ['resistance'] }), 'touched');

    expect(injuryFate(after, 'touched')).toBe('gained');
    expect(withInjuryGained(after, 'touched').injuries).toEqual({ touched: 1 });
    // Nobody else's Advantage is taken by it.
    expect(injuryFate(earl({ advantages: ['calloused-psyche'] }), 'sickly')).toBe('gained');
  });

  it('replaces Rot Resistant even beside a Sickly an Inoculation came after', () => {
    expect(injuryFate(earl({ rotResistant: true, injuries: { sickly: 1 } }), 'sickly')).toBe(
      'replaces',
    );
  });

  it('is taken at a failed Rot check, nobody turning, and logged so', () => {
    const campaign: Campaign = {
      ...createNewCampaign('Cedar Hollow', { origin: 'viral', traitsEnabled: true }),
      turn: 3,
      step: 'check-for-rot',
      base: { id: 'small-town-home', slots: {} },
      survivors: [earl({ currentHp: 0, rotResistant: true })],
      assignments: { earl: { task: 'healing' } },
    };
    const result = submitRotCheck(
      campaign,
      { survivor: 'earl', roll: 1, bitten: null, injury: { roll: 4 } },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors[0]).toMatchObject({ rotResistant: false, injuries: {} });
    expect(result.campaign.log.at(-1)?.event).toMatchObject({
      kind: 'rot-checked',
      passed: false,
      injury: { roll: 4, injury: 'sickly', fate: 'replaces' },
    });
  });
});

describe('an origin Advantage and its injury at creation (R163)', () => {
  const base = { storyTrait: null, veteran: false, bondGroup: null, stories: [] } as const;
  const both = (advantage: 'calloused-psyche' | 'resistance', injury: Injury) =>
    traitsProblem({ ...base, advantages: [advantage], injuries: { [injury]: 1 } });

  it('refuses Calloused Psyche with Psychic Scars, and Resistance with Touched', () => {
    expect(both('calloused-psyche', 'psychic-scars')).toBe(
      'An origin injury and the Advantage it takes away can’t be held together.',
    );
    expect(both('resistance', 'touched')).toMatch(/origin injury/);
    expect(both('resistance', 'psychic-scars')).toBeNull();
  });

  it('leaves Rot Resistant with Sickly to the sheet, since an Inoculation gives it to anybody', () => {
    expect(traitsProblem({ ...base, rotResistant: true, injuries: { sickly: 1 } })).toBeNull();
  });
});

describe('Sickly (pg. 140)', () => {
  it('adds 1 Infection after a mission that gave them any, and none otherwise', () => {
    const sickly = earl({ infection: 2, injuries: { sickly: 1 } });

    expect(infectionAfterMission(sickly, 3)).toBe(4);
    expect(infectionAfterMission(sickly, 2)).toBe(2);
    expect(infectionAfterMission(sickly, 1)).toBe(1);
    expect(infectionAfterMission(earl({ infection: 2 }), 3)).toBe(3);
  });

  it('is added when the outcome is recorded, its entry saying so', () => {
    const after = ended(
      onMission('viral', earl({ infection: 1, injuries: { sickly: 1 } })),
      { infection: 2 },
      'thin-the-herd',
    );

    expect(after.survivors[0]?.infection).toBe(3);
    expect(after.log.at(-1)?.event).toMatchObject({ wounds: [{ infection: 3 }] });
  });
});

describe('Calloused Psyche (pg. 140; R165)', () => {
  it('keeps at most 3 of the Madness a mission gives', () => {
    const callous = earl({ madness: 2, advantages: ['calloused-psyche'] });
    const wound = (madness: number): MissionWound => ({
      survivor: 'earl',
      name: 'Earl Rhodes',
      health: 2,
      madness,
    });

    expect(madnessPerTurn(callous)).toBe(3);
    expect(madnessPerTurn(earl({ advantages: ['quiet'] }))).toBe(Infinity);
    expect(madnessAfter(callous, wound(9)).madness).toBe(5);
    expect(madnessAfter(callous, wound(4)).madness).toBe(4);
    expect(madnessAfter(callous, wound(1)).madness).toBe(1);
    expect(madnessAfter(earl({ madness: 2 }), wound(9)).madness).toBe(9);
  });

  it('is kept when the outcome is recorded', () => {
    const after = ended(
      onMission('cosmic-horror', earl({ madness: 2, advantages: ['calloused-psyche'] })),
      { madness: 10 },
      'thin-the-herd',
    );

    expect(after.survivors[0]?.madness).toBe(5);
  });
});

describe('Resistance (pg. 140)', () => {
  it('never learns a spell at the Mystic Library', () => {
    const library = (survivor: Survivor): Campaign => ({
      ...createNewCampaign('Cedar Hollow'),
      turn: 4,
      step: 'character-advancement',
      origin: 'magic',
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'mystic-library', builtOnTurn: 1 } } },
      },
      survivors: [survivor],
      assignments: { earl: { task: 'staff', slot: 'garage' } },
      log: [
        {
          turn: 3,
          phase: 'mission',
          at: AT,
          event: { kind: 'spells-cast', team: 1, spells: ['teleport'] },
        },
      ],
    });

    expect(
      spellLearningProblem(
        library(earl({ xp: 10, advantages: ['resistance'] })),
        'earl',
        'teleport',
      ),
    ).toBe('Resistance never learns a spell.');
    expect(
      spellLearningProblem(library(earl({ xp: 10, advantages: ['quiet'] })), 'earl', 'teleport'),
    ).toBeNull();
  });
});

describe('Touched (pg. 140; R114)', () => {
  const touched = (humanity: number) => earl({ humanity, injuries: { touched: 1 } });

  it('lowers the most Humanity to 4, and gaining it brings 5 down', () => {
    expect(humanityMax(touched(3))).toBe(4);
    expect(humanityMax(earl())).toBe(5);
    expect(humanityMax(earl({ injuries: { deaf: 1 } }))).toBe(5);
    expect(withInjuryGained(earl({ humanity: 5 }), 'touched').humanity).toBe(4);
    expect(withInjuryGained(earl({ humanity: 3 }), 'touched').humanity).toBe(3);
    expect(withInjuryGained(earl({ humanity: 5 }), 'deaf').humanity).toBe(5);
  });

  it('gains nothing at 4, from the project team or anywhere', () => {
    const campaign: Campaign = {
      ...createNewCampaign('Cedar Hollow', { origin: 'magic' }),
      turn: 3,
      step: 'check-for-rot',
      survivors: [
        touched(4),
        { ...createSurvivor('Carla Proust', 2, { id: 'carla' }), humanity: 4 },
      ],
      assignments: { earl: { task: 'project' }, carla: { task: 'project' } },
    };

    expect(projectTeamHumanityDue(campaign).map((one) => one.id)).toEqual(['carla']);
    expect(
      withHumanityGained(campaign, ['earl', 'carla'], 'project-team', AT).survivors.map(
        (one) => one.humanity,
      ),
    ).toEqual([4, 5]);
  });

  it('is recorded and set to 4 at most', () => {
    const problem = (humanity: number) =>
      woundsProblem(onMission('magic', touched(3)), {
        kind: 'mission-played',
        team: 1,
        mission: 'thin-the-herd',
        wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2, humanity }],
      });

    expect(problem(4)).toBeNull();
    expect(problem(5)).toBe('Earl Rhodes’s Humanity must be a whole number from 0 to 4.');

    const state = campaignReducer(
      { status: 'open', campaign: onMission('magic', touched(3)) },
      { type: 'survivor/humanitySet', id: 'earl', humanity: 5 },
    );
    expect(state.status === 'open' && state.campaign.survivors[0]?.humanity).toBe(4);
  });
});
