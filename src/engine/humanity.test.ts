import { describe, expect, it } from 'vitest';
import { submitHealing } from './advancementForms';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { submitVeteranHealing } from './campaignForms';
import { healedFromZero, projectTeamHumanityDue, withHumanityGained } from './humanity';
import type { MissionWound } from './log';
import { submitProjectHumanity } from './managementForms';
import { submitMissionEnded } from './missionForms';
import { carriesMagic, woundsAsTheyStand, woundsProblem } from './missions';
import { outstanding } from './outstanding';
import { createSurvivor } from './survivor';

const AT = '2026-10-19T09:00:00.000Z';
const CHARM = { id: 'charm', item: 'resistance-charm', grade: 'standard' } as const;
const AXE = { id: 'axe', item: 'bladed', grade: 'standard' } as const;

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});
const carla = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Carla Proust', 3, { id: 'carla' }),
  ...overrides,
});

/** Turn 4's Play the Mission in a Magic campaign: Earl and Carla on team 1, Rescue Strangers. */
const playing = (survivors: readonly Survivor[]): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  step: 'tactical-mission',
  origin: 'magic',
  survivors,
  assignments: Object.fromEntries(
    survivors.map((survivor) => [survivor.id, { task: 'mission', team: 1 } as const]),
  ),
  log: [
    {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
    },
  ],
});

const wound = (survivor: Survivor, humanity: number): MissionWound => ({
  survivor: survivor.id,
  name: survivor.name,
  health: survivor.currentHp,
  humanity,
});

const recorded = (campaign: Campaign, wounds: readonly MissionWound[]): Campaign => {
  const result = submitMissionEnded(
    campaign,
    { kind: 'rescue-strangers-resolved', team: 1, strangers: [], wounds },
    [],
    AT,
  );
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
};

describe('Humanity on a mission’s wounds (pg. 127; R114)', () => {
  it('starts each member where they are, 1 lower for a magical item, never below 0', () => {
    const campaign = playing([earl({ items: [CHARM] }), carla({ items: [AXE] })]);

    expect(carriesMagic(earl({ items: [CHARM] }))).toBe(true);
    expect(carriesMagic(carla({ items: [AXE] }))).toBe(false);
    expect(woundsAsTheyStand(campaign, 1).map((one) => one.humanity)).toEqual([2, 3]);
    expect(
      woundsAsTheyStand(playing([earl({ items: [CHARM, CHARM], humanity: 0 })]), 1)[0]?.humanity,
    ).toBe(0);
  });

  it('asks a whole number from 0 to 5 in a Magic campaign, and none elsewhere', () => {
    const problem = (campaign: Campaign, humanity: number) =>
      woundsProblem(campaign, {
        kind: 'rescue-strangers-resolved',
        team: 1,
        strangers: [],
        wounds: [wound(earl(), humanity)],
      });

    expect(problem(playing([earl()]), 5)).toBeNull();
    expect(problem(playing([earl()]), 0)).toBeNull();
    expect(problem(playing([earl()]), 6)).toBe(
      'Earl Rhodes’s Humanity must be a whole number from 0 to 5.',
    );
    expect(problem(playing([earl()]), -1)).toMatch(/from 0 to 5/);
    expect(problem(playing([earl()]), 2.5)).toMatch(/from 0 to 5/);
    const { origin, ...none } = playing([earl()]);
    void origin;
    expect(problem(none, 3)).toBe('Only a Magic campaign records Humanity.');
  });

  it('sets the roster to what the outcome recorded', () => {
    const after = recorded(playing([earl(), carla()]), [wound(earl(), 1), wound(carla(), 4)]);

    expect(after.survivors.map((one) => one.humanity)).toEqual([1, 4]);
  });

  it('loses a survivor at 0 to the Veil, with what they carry (R151)', () => {
    const after = recorded(playing([earl({ items: [AXE] }), carla()]), [
      wound(earl(), 0),
      wound(carla(), 3),
    ]);

    expect(after.survivors.map((one) => one.id)).toEqual(['carla']);
    expect(after.assignments).not.toHaveProperty('earl');
    expect(after.inventory).toEqual([]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'survivor-veiled',
      survivor: 'earl',
      name: 'Earl Rhodes',
      items: [AXE],
    });
  });

  it('writes no items for somebody lost to the Veil carrying none', () => {
    const after = recorded(playing([earl()]), [wound(earl(), 0)]);

    expect(after.log.at(-1)?.event).not.toHaveProperty('items');
  });
});

describe('a turn on the project team (R114)', () => {
  /** Turn 4's Check for Rot in a Magic campaign, Earl and Carla on the project team. */
  const managing = (survivors: readonly Survivor[] = [earl(), carla()]): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'check-for-rot',
    origin: 'magic',
    survivors,
    assignments: { earl: { task: 'project' }, carla: { task: 'project' } },
  });

  it('gives each 1 Humanity, to no more than 5, once a turn', () => {
    const before = managing([earl(), carla({ humanity: 5 })]);

    expect(projectTeamHumanityDue(before).map((one) => one.id)).toEqual(['earl']);
    expect(outstanding(before).map((one) => one.says)).toContain(
      'The project team hasn’t taken its Humanity for the turn.',
    );

    const result = submitProjectHumanity(before, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors.map((one) => one.humanity)).toEqual([4, 5]);
    expect(result.campaign.log.map((entry) => entry.event)).toEqual([
      { kind: 'humanity-gained', survivor: 'earl', name: 'Earl Rhodes', reason: 'project-team' },
    ]);
    expect(projectTeamHumanityDue(result.campaign)).toEqual([]);
    expect(projectTeamHumanityDue({ ...result.campaign, turn: 5 }).map((one) => one.id)).toEqual([
      'earl',
    ]);
    expect(submitProjectHumanity(result.campaign, AT)).toEqual({
      ok: false,
      problem: 'Nobody on the project team has Humanity to gain now.',
    });
  });

  it('is owed only in a Magic campaign’s Management Phase', () => {
    expect(projectTeamHumanityDue({ ...managing(), origin: 'viral' })).toEqual([]);
    expect(projectTeamHumanityDue({ ...managing(), step: 'heal-wounds' })).toEqual([]);
  });

  it('is not taken by another gain this turn', () => {
    const healed = withHumanityGained(managing(), ['carla'], 'healed-from-0', AT);

    expect(projectTeamHumanityDue(healed).map((one) => one.id)).toEqual(['earl', 'carla']);
  });
});

describe('healing from 0 Health (R114)', () => {
  const clinic: Base = {
    id: 'small-town-home',
    slots: {
      garage: {
        built: { facility: 'medical-clinic', builtOnTurn: 1 },
        upgrades: ['recovery-room'],
      },
    },
  };

  it('gives 1 Humanity at Heal Wounds to anybody brought up from 0', () => {
    const result = submitHealing(
      {
        ...createNewCampaign('Cedar Hollow'),
        turn: 4,
        step: 'heal-wounds',
        origin: 'magic',
        base: clinic,
        survivors: [earl({ currentHp: 0 }), carla({ currentHp: 1 })],
        assignments: { earl: { task: 'healing' }, carla: { task: 'healing' } },
      },
      {},
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors.map((one) => [one.currentHp, one.humanity])).toEqual([
      [1, 4],
      [2, 3],
    ]);
    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'humanity-gained',
      survivor: 'earl',
      name: 'Earl Rhodes',
      reason: 'healed-from-0',
    });
  });

  it('gives it for a Veteran’s healing too, and nothing outside a Magic campaign', () => {
    const planning = (origin: 'magic' | 'viral'): Campaign => ({
      ...createNewCampaign('Cedar Hollow'),
      turn: 4,
      step: 'assign-rest-and-healing',
      origin,
      survivors: [carla({ veteran: true, xp: 2 }), earl({ currentHp: 0 })],
      log: [
        {
          turn: 4,
          phase: 'planning',
          at: AT,
          event: { kind: 'planning-began', cleared: {} },
        },
      ],
    });
    const healed = (origin: 'magic' | 'viral') => {
      const result = submitVeteranHealing(planning(origin), 'carla', 'earl', AT);
      if (!result.ok) throw new Error(result.problem);

      return result.campaign.survivors.find((one) => one.id === 'earl')?.humanity;
    };

    expect(healed('magic')).toBe(4);
    expect(healed('viral')).toBe(3);
  });
});

describe('withHumanityGained and healedFromZero', () => {
  const both = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    origin: 'magic',
    survivors: [earl({ humanity: 4 }), carla({ humanity: 5 })],
  });

  it('raises only those named and below 5, an entry each', () => {
    const after = withHumanityGained(both(), ['earl', 'carla'], 'healed-from-0', AT);

    expect(after.survivors.map((one) => one.humanity)).toEqual([5, 5]);
    expect(after.log).toHaveLength(1);
    const full = both();
    expect(withHumanityGained(full, ['carla'], 'project-team', AT)).toEqual(full);
  });

  it('names who healing brought up from 0, by comparing each with themselves', () => {
    const before: Campaign = {
      ...both(),
      survivors: [earl({ currentHp: 0 }), carla({ currentHp: 0 })],
    };
    const after: Campaign = {
      ...before,
      survivors: [earl({ currentHp: 0 }), carla({ currentHp: 2 })],
    };

    expect(healedFromZero(before, after)).toEqual(['carla']);
    expect(healedFromZero({ ...before, origin: 'viral' }, after)).toEqual([]);
    expect(healedFromZero(before, { ...after, survivors: [] })).toEqual([]);
  });
});
