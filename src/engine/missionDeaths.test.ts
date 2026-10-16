import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Item } from './campaign';
import type { FormResult } from './forms';
import { deathProblem, deathsProblem, wentOut, type MissionDeath } from './missionDeaths';
import {
  submitMissionDeath,
  submitMissionEnded,
  submitMissionOutcome,
  submitMissionSelection,
} from './missionForms';
import type { MissionOutcome } from './missions';
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

/** Team 1's Thin the Herd, everybody coming home as they went. */
function thinned(campaign: Campaign): MissionOutcome {
  return outcomeOf(
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
  );
}

/** `chosen()` with team 1's outcome recorded. */
function played(): Campaign {
  const campaign = chosen();

  return accepted(submitMissionOutcome(campaign, thinned(campaign), AT));
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
      'Record deaths on a mission in the Mission Phase.',
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

    const problem = 'Only somebody else on mission team 1 takes an item from Earl Rhodes.';
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

/** #236, R3: a death is part of how the mission ended, so it is recorded with the outcome. */
describe('deaths recorded with the outcome', () => {
  const carla = (taken: Record<string, string> = {}): MissionDeath => ({
    team: 1,
    survivor: 'carla',
    taken,
  });

  it('records the outcome, then each death, in one press', () => {
    const campaign = chosen();
    const after = accepted(
      submitMissionEnded(campaign, thinned(campaign), [earl({ 'rifle-1': 'carla' })], AT),
    );

    expect(after.log.slice(-3).map((entry) => entry.event.kind)).toEqual([
      'thin-the-herd-resolved',
      'item-moved',
      'survivor-left',
    ]);
    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['carla', 'ada', 'bo']);
    expect(after.survivors[0]?.items).toEqual([rifle]);
  });

  it('leaves the dead out of the Health the team came home with', () => {
    const campaign = chosen();
    const after = accepted(submitMissionEnded(campaign, thinned(campaign), [earl()], AT));
    const outcome = after.log.find((entry) => entry.event.kind === 'thin-the-herd-resolved');

    expect(outcome?.event).toHaveProperty('wounds', [
      { survivor: 'carla', name: 'Carla Proust', health: 2 },
    ]);
  });

  it('records everybody who died, whoever is listed first', () => {
    const campaign = chosen();
    const after = accepted(submitMissionEnded(campaign, thinned(campaign), [carla(), earl()], AT));

    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['ada', 'bo']);
  });

  it('records nothing at all when a death is refused', () => {
    const campaign = chosen();
    const result = submitMissionEnded(campaign, thinned(campaign), [earl({ 'rifle-1': 'bo' })], AT);

    expect(result).toEqual({
      ok: false,
      problem: 'Only somebody else on mission team 1 takes an item from Earl Rhodes.',
    });
  });

  it('refuses a death on another team, twice over, or a taker who died too', () => {
    const campaign = chosen();

    expect(deathsProblem(campaign, 1, [])).toBeNull();
    expect(deathsProblem(campaign, 1, [earl()])).toBeNull();
    expect(deathsProblem(campaign, 2, [earl()])).toBe(
      'Only somebody who went out with mission team 2 dies on its mission.',
    );
    expect(deathsProblem(campaign, 1, [earl(), earl()])).toBe('Each survivor dies once.');
    expect(deathsProblem(campaign, 1, [earl({ 'rifle-1': 'carla' }), carla()])).toBe(
      'Only somebody who came home takes an item from Earl Rhodes.',
    );
    expect(deathsProblem(campaign, 1, [{ ...earl(), survivor: 'bo' }])).toBe(
      'Only somebody who went out with mission team 1 dies on its mission.',
    );
  });

  it('refuses what the outcome alone refuses', () => {
    const campaign = played();

    expect(submitMissionEnded(campaign, thinned(chosen()), [earl()], AT).ok).toBe(false);
  });
});
