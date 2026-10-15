import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Item } from './campaign';
import type { FormResult } from './forms';
import { deathProblem, wentOut, type MissionDeath } from './missionDeaths';
import { submitMissionDeath, submitMissionOutcome, submitMissionSelection } from './missionForms';
import { outcomeOf, woundsAsTheyStand } from './missions';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-15T09:00:00.000Z';

const rifle: Item = { id: 'rifle-1', item: 'rifle', grade: 'standard' };
const bat: Item = { id: 'bat-1', item: 'blunt', grade: 'standard' };

function accepted(result: FormResult): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

/**
 * Turn 4 at Play the Mission: Earl, carrying a rifle and a bat, and Carla on
 * team 1; Ada on team 2, which stays home; Bo at a facility.
 */
function chosen(): Campaign {
  return accepted(
    submitMissionSelection(
      {
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 4,
        step: 'tactical-mission',
        survivors: [
          { ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }), items: [rifle, bat] },
          createSurvivor('Carla Proust', 2, { id: 'carla' }),
          createSurvivor('Ada Moss', 2, { id: 'ada' }),
          createSurvivor('Bo Lane', 1, { id: 'bo' }),
        ],
        assignments: {
          earl: { task: 'mission', team: 1 },
          carla: { task: 'mission', team: 1 },
          ada: { task: 'mission', team: 2 },
        },
      },
      { team: 1, mission: 'thin-the-herd' },
      AT,
    ),
  );
}

/** `chosen()` with team 1's outcome recorded. */
function played(): Campaign {
  const campaign = chosen();

  return accepted(
    submitMissionOutcome(
      campaign,
      outcomeOf(
        { team: 1, mission: 'thin-the-herd' },
        {
          endCondition: null,
          strangers: [],
          vehiclesOnArea: 0,
          materialsCarriedOut: 0,
          startingZombies: 4,
          zombiesLeft: 2,
          survivorsExited: 1,
          allIncapacitated: false,
          vehiclesDrivenOff: 0,
          wounds: woundsAsTheyStand(campaign, 1),
        },
      ),
      AT,
    ),
  );
}

const earl = (taken: Record<string, string> = {}): MissionDeath => ({
  team: 1,
  survivor: 'earl',
  taken,
});

describe('a survivor who dies on a mission (pp. 31, 34; R71)', () => {
  it('loses what nobody took, and leaves the roster with a cause of its own', () => {
    const after = accepted(submitMissionDeath(played(), earl(), AT));

    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['carla', 'ada', 'bo']);
    expect(after.assignments).not.toHaveProperty('earl');
    expect(after.inventory).toEqual([]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'survivor-left',
      survivor: 'earl',
      name: 'Earl Rhodes',
      tier: 2,
      cause: 'killed',
      team: 1,
      lost: [rifle, bat],
    });
  });

  it('sends what a teammate took home with them, and the log says who', () => {
    const after = accepted(submitMissionDeath(played(), earl({ 'rifle-1': 'carla' }), AT));

    expect(after.survivors.map((survivor) => survivor.items)).toEqual([[rifle], [], []]);
    expect(after.log.slice(-2).map((entry) => entry.event)).toEqual([
      {
        kind: 'item-moved',
        id: 'rifle-1',
        item: 'rifle',
        grade: 'standard',
        from: { survivor: 'earl', name: 'Earl Rhodes' },
        to: { survivor: 'carla', name: 'Carla Proust' },
      },
      {
        kind: 'survivor-left',
        survivor: 'earl',
        name: 'Earl Rhodes',
        tier: 2,
        cause: 'killed',
        team: 1,
        lost: [bat],
      },
    ]);
  });

  it('names nothing lost when everything was taken', () => {
    const after = accepted(
      submitMissionDeath(played(), earl({ 'rifle-1': 'carla', 'bat-1': 'carla' }), AT),
    );

    expect(after.log.at(-1)?.event).not.toHaveProperty('lost');
    expect(after.survivors.find((survivor) => survivor.id === 'carla')?.items).toEqual([
      rifle,
      bat,
    ]);
  });

  it('is recorded in the Mission Phase, after the team’s outcome', () => {
    expect(deathProblem({ ...played(), step: 'heal-wounds' }, earl())).toBe(
      'A death on a mission is recorded in the Mission Phase.',
    );
    expect(deathProblem(chosen(), earl())).toBe('Record mission team 1’s outcome first.');
    expect(deathProblem(played(), earl())).toBeNull();
  });

  it('is only of somebody who went out with the team', () => {
    const problem = 'Only somebody who went out with mission team 1 dies on its mission.';

    expect(deathProblem(played(), { ...earl(), survivor: 'bo' })).toBe(problem);
    expect(deathProblem(played(), { ...earl(), survivor: 'ada' })).toBe(problem);
    expect(deathProblem(played(), { ...earl(), survivor: 'nobody' })).toBe(problem);
  });

  it('takes only what they carried, and only by somebody else on the team', () => {
    expect(deathProblem(played(), earl({ 'pistol-9': 'carla' }))).toBe(
      'Only what Earl Rhodes carried can be taken from them.',
    );

    const problem = 'Only somebody else on mission team 1 takes an item from Earl Rhodes (R71).';
    expect(deathProblem(played(), earl({ 'rifle-1': 'earl' }))).toBe(problem);
    expect(deathProblem(played(), earl({ 'rifle-1': 'ada' }))).toBe(problem);
    expect(deathProblem(played(), earl({ 'rifle-1': 'bo' }))).toBe(problem);
    expect(submitMissionDeath(played(), earl({ 'rifle-1': 'bo' }), AT).ok).toBe(false);
  });

  it('knows who went out on each team', () => {
    expect(wentOut(played(), 1).map((survivor) => survivor.id)).toEqual(['earl', 'carla']);
    expect(wentOut(played(), 2)).toEqual([]);
    expect(wentOut(played(), 3)).toEqual([]);
  });
});
