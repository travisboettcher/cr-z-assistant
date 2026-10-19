import { describe, expect, it } from 'vitest';
import type { ViralMissionId } from '../data/missions';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import type { CampaignEvent, LogEntry, ViralRecord } from './log';
import { submitMissionEnded } from './missionForms';
import { missionsOnOffer } from './missions';
import { createSurvivor } from './survivor';
import {
  containmentHardware,
  containmentStands,
  containmentUnlock,
  isViralMission,
  viralAsks,
  viralProblem,
  viralRecord,
  withViralRecorded,
} from './viralMissions';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const carla = createSurvivor('Carla Proust', 3, { id: 'carla' });

const entry = (event: CampaignEvent, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

/** A Medical Clinic in the Garage, with Containment if asked. */
const clinic = (containment: boolean): Base => ({
  id: 'small-town-home',
  slots: {
    garage: {
      built: { facility: 'medical-clinic', builtOnTurn: 1 },
      ...(containment ? { upgrades: ['containment'] } : {}),
    },
  },
});

/** Turn 4 of a Viral campaign, Play the Mission: Earl and Carla on team 1 playing `mission`. */
function playing(mission: ViralMissionId, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    origin: 'viral',
    base: clinic(true),
    survivors: [earl, carla],
    assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 1 } },
    log: [entry({ kind: 'mission-selected', team: 1, mission, names: [] })],
    ...overrides,
  };
}

/** Record the team's outcome with this Viral record, the team unhurt. */
function recorded(campaign: Campaign, mission: ViralMissionId, viral: ViralRecord) {
  return submitMissionEnded(
    campaign,
    {
      kind: 'mission-played',
      team: 1,
      mission,
      wounds: [earl, carla].map((member) => ({
        survivor: member.id,
        name: member.name,
        health: member.currentHp,
        infection: 0,
      })),
      viral,
    },
    [],
    AT,
  );
}

function accepted(result: ReturnType<typeof recorded>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const viralOf = (campaign: Campaign): ViralRecord | undefined => {
  const event = campaign.log.at(-1)?.event;

  return event?.kind === 'mission-played' ? event.viral : undefined;
};

describe('the Viral missions (pp. 103–107)', () => {
  it('are the three, each asking for its own counts', () => {
    expect(isViralMission('experimental-data')).toBe(true);
    expect(isViralMission('medical-salvage')).toBe(true);
    expect(isViralMission('the-graveyard')).toBe(false);
    expect(isViralMission('left-behind-1')).toBe(false);
    expect(viralAsks('experimental-data')).toEqual(['investigated', 'brokenCage']);
    expect(viralAsks('bring-it-on-home')).toEqual(['zombiesLeft']);
    expect(viralAsks('medical-salvage')).toEqual(['supplies']);
  });
});

describe('viralProblem', () => {
  it('asks a Viral mission for every count it has, and nothing else', () => {
    expect(viralProblem('medical-salvage', { supplies: 3 })).toBeNull();
    expect(viralProblem('medical-salvage', { supplies: 0 })).toBeNull();
    expect(viralProblem('experimental-data', { investigated: 0, brokenCage: false })).toBeNull();
    expect(viralProblem('medical-salvage', undefined)).toBe('Enter what the mission ended with.');
    expect(viralProblem('medical-salvage', { supplies: 3, zombiesLeft: 1 })).toBe(
      'That isn’t something this mission ends with.',
    );
    expect(viralProblem('experimental-data', { investigated: 1 })).toBe(
      'Say whether the Broken Cage check passed.',
    );
    expect(viralProblem('bring-it-on-home', { zombiesLeft: Number.NaN })).toBe(
      'Each count must be a whole number, 0 or more.',
    );
    expect(viralProblem('bring-it-on-home', { zombiesLeft: -1 })).toMatch(/whole number/);
    expect(viralProblem('bring-it-on-home', { zombiesLeft: 1.5 })).toMatch(/whole number/);
    expect(viralProblem('bring-it-on-home', {})).toMatch(/whole number/);
    expect(
      viralProblem('experimental-data', { investigated: Number.NaN, brokenCage: true }),
    ).toMatch(/whole number/);
    // `held` is the app's to say, so a record carrying it is not refused for it.
    expect(viralProblem('bring-it-on-home', { zombiesLeft: 1, held: true })).toBeNull();
  });

  it('records nothing Viral for any other mission', () => {
    expect(viralProblem('gather-materials', undefined)).toBeNull();
    expect(viralProblem('gather-materials', { supplies: 1 })).toBe(
      'Only a Viral mission records what it ended with.',
    );
  });
});

describe('a held zombie (R104, R146)', () => {
  it('is held only by a Containment standing on the base', () => {
    expect(containmentStands(playing('bring-it-on-home'))).toBe(true);
    expect(containmentStands(playing('bring-it-on-home', { base: clinic(false) }))).toBe(false);
    expect(containmentStands(playing('bring-it-on-home', { base: null }))).toBe(false);
    expect(
      containmentStands(
        playing('bring-it-on-home', {
          base: {
            id: 'small-town-home',
            slots: {
              garage: {
                built: { facility: 'medical-clinic', builtOnTurn: 1 },
                upgrades: ['restraints'],
              },
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it('goes into Containment when any ensnared zombie left, however many', () => {
    const after = accepted(
      recorded(playing('bring-it-on-home'), 'bring-it-on-home', { zombiesLeft: 3 }),
    );

    expect(after.heldZombies).toBe(1);
    expect(viralOf(after)).toEqual({ zombiesLeft: 3, held: true });
  });

  it('is not held when none left, or with no Containment, whatever the screen sent', () => {
    const none = accepted(
      recorded(playing('bring-it-on-home'), 'bring-it-on-home', { zombiesLeft: 0, held: true }),
    );
    const caged = accepted(
      recorded(playing('bring-it-on-home', { base: clinic(false) }), 'bring-it-on-home', {
        zombiesLeft: 2,
        held: true,
      }),
    );

    expect(none.heldZombies).toBe(0);
    expect(viralOf(none)).toEqual({ zombiesLeft: 0, held: false });
    expect(caged.heldZombies).toBe(0);
    expect(viralOf(caged)).toEqual({ zombiesLeft: 2, held: false });
  });

  it('adds to those held already', () => {
    const after = accepted(
      recorded(playing('bring-it-on-home', { heldZombies: 2 }), 'bring-it-on-home', {
        zombiesLeft: 1,
      }),
    );

    expect(after.heldZombies).toBe(3);
  });
});

describe('Medical Salvage’s tokens (R131)', () => {
  it('are kept by the base, added to any it has', () => {
    const after = accepted(
      recorded(playing('medical-salvage', { medicalSupplies: 1 }), 'medical-salvage', {
        supplies: 4,
      }),
    );

    expect(after.medicalSupplies).toBe(5);
    expect(after.heldZombies).toBe(0);
    expect(viralOf(after)).toEqual({ supplies: 4 });
  });

  it('are refused without a count', () => {
    expect(recorded(playing('medical-salvage'), 'medical-salvage', {})).toEqual({
      ok: false,
      problem: 'Each count must be a whole number, 0 or more.',
    });
  });
});

describe('Containment’s unlock (R122, R144)', () => {
  it('changes the Hardware by +2 for one point of interest and −2 for the Broken Cage, adding up', () => {
    expect(containmentHardware({ investigated: 0, brokenCage: true })).toBeNull();
    expect(containmentHardware({})).toBeNull();
    expect(containmentHardware({ investigated: 1, brokenCage: false })).toBe(2);
    expect(containmentHardware({ investigated: 1, brokenCage: true })).toBe(0);
    expect(containmentHardware({ investigated: 2, brokenCage: false })).toBe(0);
    expect(containmentHardware({ investigated: 3, brokenCage: true })).toBe(-2);
  });

  it('is the campaign’s, from the first Experimental Data that investigated one', () => {
    const played = (viral: ViralRecord | undefined, turn: number): LogEntry =>
      entry(
        {
          kind: 'mission-played',
          team: 1,
          mission: 'experimental-data',
          ...(viral === undefined ? {} : { viral }),
        },
        turn,
      );
    const campaign = (log: readonly LogEntry[]) => ({ ...playing('experimental-data'), log });

    expect(containmentUnlock(campaign([]))).toBeNull();
    expect(
      containmentUnlock(
        campaign([played(undefined, 2), played({ investigated: 0, brokenCage: false }, 3)]),
      ),
    ).toBeNull();
    expect(
      containmentUnlock(
        campaign([
          entry({
            kind: 'mission-played',
            team: 1,
            mission: 'medical-salvage',
            viral: { supplies: 1 },
          }),
          // Only an Experimental Data's points of interest unlock it.
          entry({
            kind: 'mission-played',
            team: 1,
            mission: 'bring-it-on-home',
            viral: { investigated: 1, brokenCage: false },
          }),
          played({ investigated: 0, brokenCage: false }, 3),
          played({ investigated: 2, brokenCage: true }, 4),
          played({ investigated: 1, brokenCage: false }, 5),
        ]),
      ),
    ).toEqual({ hardware: -2 });
  });

  it('is recorded off the outcome, rebuilt with only its own fields', () => {
    const after = accepted(
      recorded(playing('experimental-data'), 'experimental-data', {
        investigated: 1,
        brokenCage: false,
        held: true,
      }),
    );

    expect(viralOf(after)).toEqual({ investigated: 1, brokenCage: false });
    expect(containmentUnlock(after)).toEqual({ hardware: 2 });
    expect(after.heldZombies).toBe(0);
    expect(after.medicalSupplies).toBe(0);
  });
});

describe('which Viral missions are offered (R132, R145)', () => {
  const offered = (campaign: Campaign) =>
    missionsOnOffer(campaign, 1).filter((id) => isViralMission(id));

  it('is all three until Containment is unlocked, then the two that repeat', () => {
    const fresh = { ...playing('experimental-data'), log: [] };
    const unlocked = accepted(
      recorded(playing('experimental-data'), 'experimental-data', {
        investigated: 2,
        brokenCage: false,
      }),
    );

    expect(offered(fresh)).toEqual(['experimental-data', 'bring-it-on-home', 'medical-salvage']);
    expect(offered({ ...unlocked, turn: 5 })).toEqual(['bring-it-on-home', 'medical-salvage']);
    // No Containment and no held zombie hold the other two back.
    expect(offered({ ...fresh, base: null })).toEqual([
      'experimental-data',
      'bring-it-on-home',
      'medical-salvage',
    ]);
    expect(offered({ ...fresh, origin: 'magic' })).toEqual([]);
  });
});

describe('withViralRecorded', () => {
  it('adds a held zombie and tokens, and nothing for a record that gives neither', () => {
    const campaign = { ...playing('medical-salvage'), heldZombies: 1, medicalSupplies: 2 };

    expect(withViralRecorded(campaign, { investigated: 1, brokenCage: true })).toEqual(campaign);
    expect(withViralRecorded(campaign, { zombiesLeft: 1, held: false })).toEqual(campaign);
    expect(withViralRecorded(campaign, { zombiesLeft: 1, held: true }).heldZombies).toBe(2);
    expect(withViralRecorded(campaign, { supplies: 3 }).medicalSupplies).toBe(5);
  });

  it('keeps only the fields each mission asks for when rebuilt', () => {
    const campaign = playing('medical-salvage');

    expect(viralRecord(campaign, 'medical-salvage', { supplies: 2, investigated: 4 })).toEqual({
      supplies: 2,
    });
  });
});
