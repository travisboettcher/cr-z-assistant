import { describe, expect, it } from 'vitest';
import type { MissionId } from '../data/missions';
import { createNewCampaign, keptSurvivors, type Campaign, type Survivor } from './campaign';
import type { LogEntry, MissionWound } from './log';
import { submitMissionEnded } from './missionForms';
import { missionsOnOffer, woundsAsTheyStand, woundsProblem } from './missions';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});
const carla = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Carla Proust', 3, { id: 'carla' }),
  ...overrides,
});

/** Turn 4 of a Cosmic Horror campaign: Earl on team 1, Carla on team 2. */
function cosmic(
  overrides: Partial<Campaign> = {},
  mission: MissionId = 'invisible-light',
): Campaign {
  const chose = (team: number): LogEntry => ({
    turn: 4,
    phase: 'mission',
    at: AT,
    event: { kind: 'mission-selected', team, mission, names: [] },
  });

  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    origin: 'cosmic-horror',
    survivors: [earl({ madness: 2 }), carla({ madness: 5 })],
    assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 2 } },
    log: [chose(1), chose(2)],
    ...overrides,
  };
}

const wounded = (madness: number | undefined): MissionWound => ({
  survivor: 'earl',
  name: 'Earl Rhodes',
  health: 2,
  ...(madness === undefined ? {} : { madness }),
});

describe('Madness on a mission’s wounds (pg. 124; Z7-7)', () => {
  it('starts each member at their Madness in a Cosmic Horror campaign only', () => {
    expect(woundsAsTheyStand(cosmic(), 1)).toEqual([wounded(2)]);
    expect(woundsAsTheyStand(cosmic({ origin: 'viral' }), 1)).toEqual([
      { ...wounded(undefined), infection: 0 },
    ]);
    expect(woundsAsTheyStand(cosmic({ origin: 'magic' }), 1)).toEqual([
      { ...wounded(undefined), humanity: 3 },
    ]);
  });

  it('asks for a whole number from 0, and nothing outside Cosmic Horror', () => {
    const problem = (campaign: Campaign, wound: MissionWound) =>
      woundsProblem(campaign, {
        kind: 'mission-played',
        team: 1,
        mission: 'invisible-light',
        wounds: [wound],
      });

    expect(problem(cosmic(), wounded(14))).toBeNull();
    expect(problem(cosmic(), wounded(0))).toBeNull();
    expect(problem(cosmic(), wounded(undefined))).toBe(
      'Earl Rhodes’s Madness must be a whole number, 0 or more.',
    );
    expect(problem(cosmic(), wounded(-1))).toMatch(/Madness must be a whole number/);
    expect(problem(cosmic(), wounded(1.5))).toMatch(/Madness must be a whole number/);
    expect(problem(cosmic({ origin: 'magic' }), wounded(3))).toBe(
      'Only a Cosmic Horror campaign records Madness.',
    );
  });

  it('sets the roster to the Madness recorded, and logs it', () => {
    const result = submitMissionEnded(
      cosmic(),
      { kind: 'mission-played', team: 1, mission: 'invisible-light', wounds: [wounded(7)] },
      [],
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors.map((survivor) => survivor.madness)).toEqual([7, 5]);
    expect(result.campaign.log.at(-1)?.event).toMatchObject({ wounds: [wounded(7)] });
  });
});

describe('Cosmic Horror missions on offer (R132)', () => {
  const cosmicOn = (campaign: Campaign, team: number) =>
    missionsOnOffer(campaign, team).filter((id) =>
      ['invisible-light', 'from-the-deep', 'friend-or-foe'].includes(id),
    );

  it('to a team with somebody at 4 or more Madness, and no other', () => {
    expect(cosmicOn(cosmic(), 1)).toEqual([]);
    expect(cosmicOn(cosmic(), 2)).toEqual(['invisible-light', 'from-the-deep', 'friend-or-foe']);
    expect(cosmicOn(cosmic({ survivors: [earl({ madness: 4 }), carla()] }), 1)).toHaveLength(3);
    expect(cosmicOn(cosmic({ survivors: [earl({ madness: 3 }), carla()] }), 1)).toEqual([]);
    // One member is enough.
    const together = cosmic({
      survivors: [earl({ madness: 0 }), carla({ madness: 4 })],
      assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 1 } },
    });
    expect(cosmicOn(together, 1)).toHaveLength(3);
  });
});

describe('keptSurvivors', () => {
  it('is the community, the set-aside and the Lost', () => {
    const campaign = cosmic({
      survivors: [earl()],
      setAside: [carla()],
      lost: [createSurvivor('Ruby Vance', 2, { id: 'ruby' })],
    });

    expect(keptSurvivors(campaign).map((survivor) => survivor.id)).toEqual([
      'earl',
      'carla',
      'ruby',
    ]);
  });
});
