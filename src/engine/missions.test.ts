import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import type { CampaignEvent, LogEntry } from './log';
import {
  deployed,
  firstMissionFailed,
  missionOutcomeProblem,
  outcomeMission,
  outcomeOf,
  retryOwed,
  strangerWarning,
  teamOutcomes,
  unresolvedTeams,
  missionsChosen,
  missionsOnOffer,
  missionTeams,
  selectionProblem,
  skipProblem,
  turnMissions,
} from './missions';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-12T09:00:00.000Z';

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const carla = createSurvivor('Carla Proust', 2, { id: 'carla' });
const ruby = createSurvivor('Ruby Vance', 3, { id: 'ruby' });
const nell = createSurvivor('Nell Haig', 1, { id: 'nell' });

const onTeam = (team: number): Assignment => ({ task: 'mission', team });

/** Turn 4, at Select Mission: Earl and Carla on team 1, Ruby on team 2, Nell at home. */
function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'select-mission',
    survivors: [earl, carla, ruby, nell],
    assignments: { earl: onTeam(1), carla: onTeam(1), ruby: onTeam(2) },
    ...overrides,
  };
}

const at = (turn: number, event: CampaignEvent): LogEntry => ({
  turn,
  phase: event.kind === 'horde-checked' ? 'management' : 'mission',
  at: AT,
  event,
});

const chose = (team: number, mission: 'thin-the-herd' | 'rescue-strangers', turn = 4): LogEntry =>
  at(turn, { kind: 'mission-selected', team, mission, names: [] });

/** A Thin the Herd's outcome, everything cleared and one survivor out. */
const thinHerd = () => ({
  kind: 'thin-the-herd-resolved' as const,
  startingZombies: 6,
  zombiesLeft: 0,
  survivorsExited: 1,
  allIncapacitated: false,
});

const skipped = (turn = 4): LogEntry => at(turn, { kind: 'mission-skipped' });

/** The horde called a siege at turn 3's Check the Horde, so turn 4 is a Siege Defense. */
const calledForTurn4 = at(3, { kind: 'horde-checked', roll: 9, threat: 8, siege: true });

const ids = (survivors: readonly Survivor[]) => survivors.map((survivor) => survivor.id);

describe('missionTeams', () => {
  it('reads the teams Planning split the mission survivors into, in team order (pg. 21)', () => {
    expect(
      missionTeams(playing()).map((team) => ({ team: team.team, members: ids(team.members) })),
    ).toEqual([
      { team: 1, members: ['earl', 'carla'] },
      { team: 2, members: ['ruby'] },
    ]);
  });

  it('makes the whole community one team on a siege turn (pg. 85)', () => {
    const teams = missionTeams(playing({ log: [calledForTurn4] }));

    expect(teams.map((team) => ({ team: team.team, members: ids(team.members) }))).toEqual([
      { team: 1, members: ['earl', 'carla', 'ruby', 'nell'] },
    ]);
  });

  it('has no team at all on a siege turn with nobody left to fight it', () => {
    expect(missionTeams(playing({ survivors: [], log: [calledForTurn4] }))).toEqual([]);
  });

  it('numbers the teams in order, whatever order the roster lists their members in', () => {
    const shuffled = playing({
      assignments: { earl: onTeam(3), carla: onTeam(1), ruby: onTeam(2) },
    });

    expect(missionTeams(shuffled).map((team) => team.team)).toEqual([1, 2, 3]);
  });

  it('has no team nobody is on', () => {
    expect(missionTeams(playing({ assignments: {} }))).toEqual([]);
  });

  it('still reads the teams once this turn’s Planning Phase has cleared them', () => {
    const cleared = playing({
      step: 'assign-facility-staff',
      assignments: {},
      log: [
        at(4, {
          kind: 'planning-began',
          cleared: { earl: onTeam(1), carla: onTeam(1), ruby: onTeam(2) },
        }),
      ],
    });

    expect(missionTeams(cleared).map((team) => team.team)).toEqual([1, 2]);
  });
});

describe('turnMissions', () => {
  it('records nothing on a turn nobody has chosen for', () => {
    expect(turnMissions(playing())).toEqual({ choices: [], skipped: false, recorded: false });
  });

  it('keeps the latest choice for each team, in team order', () => {
    const campaign = playing({
      log: [chose(2, 'rescue-strangers'), chose(1, 'rescue-strangers'), chose(1, 'thin-the-herd')],
    });

    // Strictly: a choice that asked for no material carries no `material` key.
    expect(turnMissions(campaign).choices).toStrictEqual([
      { team: 1, mission: 'thin-the-herd' },
      { team: 2, mission: 'rescue-strangers' },
    ]);
  });

  it('lets an opt-out clear the choices before it, and a choice after it take it back', () => {
    expect(turnMissions(playing({ log: [chose(1, 'thin-the-herd'), skipped()] }))).toEqual({
      choices: [],
      skipped: true,
      recorded: true,
    });
    expect(turnMissions(playing({ log: [skipped(), chose(1, 'thin-the-herd')] }))).toEqual({
      choices: [{ team: 1, mission: 'thin-the-herd' }],
      skipped: false,
      recorded: true,
    });
  });

  it('reads only this turn', () => {
    expect(turnMissions(playing({ log: [chose(1, 'thin-the-herd', 3)] })).recorded).toBe(false);
  });

  it('carries a Gather Materials team’s material type', () => {
    const campaign = playing({
      log: [
        at(4, {
          kind: 'mission-selected',
          team: 1,
          mission: 'gather-materials',
          names: [],
          material: 'fuel',
        }),
      ],
    });

    expect(turnMissions(campaign).choices).toEqual([
      { team: 1, mission: 'gather-materials', material: 'fuel' },
    ]);
  });
});

describe('deployed', () => {
  it('sends every team out on a turn nobody has chosen for, which is how older turns read', () => {
    expect(ids(deployed(playing()))).toEqual(['earl', 'carla', 'ruby']);
  });

  it('sends only the teams that chose a mission', () => {
    expect(ids(deployed(playing({ log: [chose(2, 'rescue-strangers')] })))).toEqual(['ruby']);
  });

  it('sends every team that chose, and only those', () => {
    const three = playing({
      assignments: { ...playing().assignments, nell: onTeam(3) },
      log: [chose(1, 'thin-the-herd'), chose(2, 'rescue-strangers')],
    });

    expect(ids(deployed(three))).toEqual(['earl', 'carla', 'ruby']);
  });

  it('sends nobody when the community opted out (pg. 17)', () => {
    expect(deployed(playing({ log: [skipped()] }))).toEqual([]);
  });

  it('sends the whole community to a Siege Defense (pg. 85)', () => {
    expect(ids(deployed(playing({ log: [calledForTurn4] })))).toEqual([
      'earl',
      'carla',
      'ruby',
      'nell',
    ]);
  });
});

describe('missionsChosen', () => {
  it('waits for every team', () => {
    expect(missionsChosen(playing())).toBe(false);
    expect(missionsChosen(playing({ log: [chose(1, 'thin-the-herd')] }))).toBe(false);
    expect(
      missionsChosen(playing({ log: [chose(1, 'thin-the-herd'), chose(2, 'rescue-strangers')] })),
    ).toBe(true);
  });

  it('is done when the community opted out, or nobody is on a team', () => {
    expect(missionsChosen(playing({ log: [skipped()] }))).toBe(true);
    expect(missionsChosen(playing({ assignments: {} }))).toBe(true);
  });
});

describe('missionsOnOffer', () => {
  it('offers only the First Mission on turn 1 (pg. 76)', () => {
    expect(missionsOnOffer(playing({ turn: 1 }))).toEqual(['first-mission']);
  });

  it('offers only the Siege Defense when the horde called one (pg. 23)', () => {
    expect(missionsOnOffer(playing({ log: [calledForTurn4] }))).toEqual(['siege-defense']);
  });

  it('offers the six other standard missions any other turn (pg. 75)', () => {
    const offered = missionsOnOffer(playing());

    expect(offered).not.toContain('first-mission');
    expect(offered).not.toContain('siege-defense');
    expect(offered).toEqual(
      expect.arrayContaining([
        'claim-a-new-base',
        'gather-materials',
        'thin-the-herd',
        'retrieve-new-vehicles',
        'rescue-strangers',
        'rare-goods-trader',
      ]),
    );
  });

  it('offers story and Road Trip missions, and only the campaign’s own origin missions', () => {
    const plain = missionsOnOffer(playing());
    const viral = missionsOnOffer(playing({ origin: 'viral' }));

    expect(plain).toContain('left-behind-1');
    expect(plain).toContain('chased');
    expect(plain).not.toContain('experimental-data');
    expect(viral).toContain('experimental-data');
    expect(viral).not.toContain('the-graveyard');
  });
});

describe('selectionProblem', () => {
  it('takes a mission on offer for a team with somebody on it', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'thin-the-herd' })).toBeNull();
  });

  it('takes a second choice for the same team, which is how one is corrected', () => {
    const campaign = playing({ log: [chose(1, 'thin-the-herd')] });

    expect(selectionProblem(campaign, { team: 1, mission: 'rescue-strangers' })).toBeNull();
  });

  it('refuses outside the Mission Phase', () => {
    expect(
      selectionProblem(playing({ step: 'heal-wounds' }), { team: 1, mission: 'thin-the-herd' }),
    ).toMatch(/Mission Phase/);
  });

  it('refuses a mission or a material the catalogue does not have', () => {
    expect(
      selectionProblem(playing(), { team: 1, mission: 'toString' as 'thin-the-herd' }),
    ).toMatch(/no such mission/);
    expect(
      selectionProblem(playing(), {
        team: 1,
        mission: 'gather-materials',
        material: 'gold' as 'fuel',
      }),
    ).toMatch(/no such material/);
  });

  it('takes a story mission, which asks for nothing more', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'left-behind-1' })).toBeNull();
    expect(
      selectionProblem(playing(), { team: 1, mission: 'left-behind-1', material: 'fuel' }),
    ).toMatch(/Only Gather Materials/);
  });

  it('refuses a team nobody is on', () => {
    expect(selectionProblem(playing(), { team: 3, mission: 'thin-the-herd' })).toMatch(
      /somebody on it/,
    );
  });

  it('refuses anything but the First Mission on turn 1, and the First Mission after it', () => {
    expect(selectionProblem(playing({ turn: 1 }), { team: 1, mission: 'thin-the-herd' })).toMatch(
      /Turn 1/,
    );
    expect(
      selectionProblem(playing({ turn: 1 }), { team: 1, mission: 'first-mission' }),
    ).toBeNull();
    expect(selectionProblem(playing(), { team: 1, mission: 'first-mission' })).toMatch(/turn 1/);
  });

  it('refuses anything but the Siege Defense on a siege turn, and a Siege Defense nobody called', () => {
    const besieged = playing({ log: [calledForTurn4] });

    expect(selectionProblem(besieged, { team: 1, mission: 'thin-the-herd' })).toMatch(/Siege/);
    expect(selectionProblem(besieged, { team: 1, mission: 'siege-defense' })).toBeNull();
    expect(selectionProblem(playing(), { team: 1, mission: 'siege-defense' })).toMatch(
      /horde calls/,
    );
  });

  it('refuses another origin’s mission', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'experimental-data' })).toMatch(
      /Origin/,
    );
  });

  it('refuses a second Claim a New Base in one turn (R20)', () => {
    const claiming = playing({
      log: [at(4, { kind: 'mission-selected', team: 1, mission: 'claim-a-new-base', names: [] })],
    });

    expect(selectionProblem(claiming, { team: 2, mission: 'claim-a-new-base' })).toMatch(
      /Another team/,
    );
    // The same team choosing it again is a correction, not a second claim.
    expect(selectionProblem(claiming, { team: 1, mission: 'claim-a-new-base' })).toBeNull();
    // And it limits only Claim a New Base: another team may choose anything else.
    expect(selectionProblem(claiming, { team: 2, mission: 'thin-the-herd' })).toBeNull();
  });

  it('counts a claim by any other team, not only the first one asked about (R20)', () => {
    const three = playing({
      assignments: { ...playing().assignments, nell: onTeam(3) },
      log: [
        at(4, { kind: 'mission-selected', team: 1, mission: 'claim-a-new-base', names: [] }),
        chose(2, 'thin-the-herd'),
      ],
    });

    expect(selectionProblem(three, { team: 3, mission: 'claim-a-new-base' })).toMatch(
      /Another team/,
    );
  });

  it('lets a second team claim a new base when the other team chose something else', () => {
    expect(
      selectionProblem(playing({ log: [chose(1, 'thin-the-herd')] }), {
        team: 2,
        mission: 'claim-a-new-base',
      }),
    ).toBeNull();
  });

  it('asks Gather Materials for a material type, and no other mission (pg. 80)', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'gather-materials' })).toMatch(
      /type it takes/,
    );
    expect(
      selectionProblem(playing(), { team: 1, mission: 'gather-materials', material: 'fuel' }),
    ).toBeNull();
    expect(
      selectionProblem(playing(), { team: 1, mission: 'thin-the-herd', material: 'fuel' }),
    ).toMatch(/Only Gather Materials/);
  });
});

describe('skipProblem', () => {
  it('lets a community opt out of an ordinary turn’s mission (pg. 17)', () => {
    expect(skipProblem(playing())).toBeNull();
  });

  it('refuses on turn 1, on a siege turn, outside the Mission Phase, and twice', () => {
    expect(skipProblem(playing({ turn: 1 }))).toMatch(/First Mission/);
    expect(skipProblem(playing({ log: [calledForTurn4] }))).toMatch(/siege/);
    expect(skipProblem(playing({ step: 'heal-wounds' }))).toMatch(/Mission Phase/);
    expect(skipProblem(playing({ log: [skipped()] }))).toMatch(/already/);
  });
});

describe('missionOutcomeProblem', () => {
  const siege = {
    kind: 'siege-defense-resolved' as const,
    zombiesLeft: 0,
    survivorsExited: 1,
  };
  const herd = {
    kind: 'thin-the-herd-resolved' as const,
    startingZombies: 8,
    zombiesLeft: 0,
    survivorsExited: 1,
    allIncapacitated: false,
  };
  const thinning = (overrides: Partial<Campaign> = {}) =>
    playing({ step: 'tactical-mission', log: [chose(1, 'thin-the-herd')], ...overrides });
  const besieged = (overrides: Partial<Campaign> = {}) =>
    playing({
      step: 'tactical-mission',
      log: [
        calledForTurn4,
        at(4, { kind: 'mission-selected', team: 1, mission: 'siege-defense', names: [] }),
      ],
      ...overrides,
    });

  it('takes the outcome of a mission a team chose', () => {
    expect(missionOutcomeProblem(thinning(), herd)).toBeNull();
    expect(missionOutcomeProblem(besieged(), siege)).toBeNull();
  });

  it('refuses a mission no team chose, rather than guessing from the siege', () => {
    expect(missionOutcomeProblem(playing({ step: 'tactical-mission' }), herd)).toMatch(
      /has not chosen a mission/,
    );
    expect(
      missionOutcomeProblem(playing({ step: 'tactical-mission', log: [calledForTurn4] }), siege),
    ).toMatch(/has not chosen a mission/);
    expect(missionOutcomeProblem(thinning(), siege)).toMatch(/not the mission team 1 chose/);
  });

  it('checks each team’s outcome against its own choice (Z4-3)', () => {
    const two = playing({
      step: 'tactical-mission',
      log: [chose(1, 'thin-the-herd'), chose(2, 'rescue-strangers')],
    });
    const rescued = {
      kind: 'rescue-strangers-resolved' as const,
      team: 2,
      strangers: [1] as const,
    };

    expect(missionOutcomeProblem(two, rescued)).toBeNull();
    expect(missionOutcomeProblem(two, { ...rescued, team: 1 })).toMatch(/not the mission/);
    // Team 1's outcome does not count as team 2's.
    expect(missionOutcomeProblem({ ...two, log: [...two.log, at(4, herd)] }, rescued)).toBeNull();
    expect(missionOutcomeProblem({ ...two, log: [...two.log, at(4, rescued)] }, rescued)).toMatch(
      /team 2’s outcome is already recorded/,
    );
  });

  it('refuses outside the Mission Phase, and a second outcome in one turn', () => {
    expect(missionOutcomeProblem(thinning({ step: 'heal-wounds' }), herd)).toMatch(/Mission Phase/);
    expect(
      missionOutcomeProblem(thinning({ log: [chose(1, 'thin-the-herd'), at(4, herd)] }), herd),
    ).toMatch(/already/);
  });

  it('takes a count of zero', () => {
    expect(missionOutcomeProblem(thinning(), { ...herd, startingZombies: 0 })).toBeNull();
  });

  it.each([
    ['a negative', -1],
    ['a fractional', 1.5],
    ['an unreadable', Number.NaN],
  ])('refuses %s count in any field', (_, bad) => {
    const refused = /whole number/;

    expect(missionOutcomeProblem(besieged(), { ...siege, zombiesLeft: bad })).toMatch(refused);
    expect(missionOutcomeProblem(besieged(), { ...siege, survivorsExited: bad })).toMatch(refused);
    expect(missionOutcomeProblem(thinning(), { ...herd, startingZombies: bad })).toMatch(refused);
    expect(missionOutcomeProblem(thinning(), { ...herd, zombiesLeft: bad })).toMatch(refused);
    expect(missionOutcomeProblem(thinning(), { ...herd, survivorsExited: bad })).toMatch(refused);
  });
});

describe('the outcomes of the other standard missions (Z4-3)', () => {
  const firstTurn = (log: readonly LogEntry[] = []) =>
    playing({
      turn: 1,
      step: 'tactical-mission',
      log: [
        at(1, { kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
        ...log,
      ],
    });
  const first = (endCondition: number | null, strangers: readonly (1 | 2 | 3 | 4)[] = []) => ({
    kind: 'first-mission-resolved' as const,
    team: 1,
    endCondition,
    strangers,
  });

  it('takes an end condition the mission has, or none (pg. 77)', () => {
    expect(missionOutcomeProblem(firstTurn(), first(1))).toBeNull();
    expect(missionOutcomeProblem(firstTurn(), first(3))).toBeNull();
    expect(missionOutcomeProblem(firstTurn(), first(null))).toBeNull();
    expect(missionOutcomeProblem(firstTurn(), first(4))).toMatch(/1 to 3/);
    expect(missionOutcomeProblem(firstTurn(), first(0))).toMatch(/1 to 3/);
    expect(missionOutcomeProblem(firstTurn(), first(1.5))).toMatch(/1 to 3/);
    expect(missionOutcomeProblem(firstTurn(), first(Number.NaN))).toMatch(/1 to 3/);
  });

  it('takes strangers with real Tiers', () => {
    expect(missionOutcomeProblem(firstTurn(), first(2, [1, 4]))).toBeNull();
    expect(missionOutcomeProblem(firstTurn(), { ...first(2), strangers: [5 as 4] })).toMatch(
      /Tier from 1 to 4/,
    );
  });

  it.each([
    [
      'claim-a-new-base' as const,
      {
        kind: 'claim-a-new-base-resolved' as const,
        team: 1,
        endCondition: 1,
        strangers: [],
        vehiclesOnArea: 2,
      },
      { vehiclesOnArea: -1 },
    ],
    [
      'gather-materials' as const,
      { kind: 'gather-materials-resolved' as const, team: 1, materialsCarriedOut: 5 },
      { materialsCarriedOut: 1.5 },
    ],
    [
      'retrieve-new-vehicles' as const,
      { kind: 'retrieve-new-vehicles-resolved' as const, team: 1, vehiclesDrivenOff: 0 },
      { vehiclesDrivenOff: Number.NaN },
    ],
    [
      'rare-goods-trader' as const,
      { kind: 'rare-goods-trader-resolved' as const, team: 1, survivorsExited: 1 },
      { survivorsExited: -2 },
    ],
  ])('takes a %s outcome and refuses a count that is not whole', (mission, outcome, bad) => {
    const campaign = playing({
      step: 'tactical-mission',
      log: [
        at(4, {
          kind: 'mission-selected',
          team: 1,
          mission,
          names: [],
          ...(mission === 'gather-materials' ? { material: 'fuel' as const } : {}),
        }),
      ],
    });

    expect(missionOutcomeProblem(campaign, outcome)).toBeNull();
    expect(missionOutcomeProblem(campaign, { ...outcome, ...bad })).toMatch(/whole number/);
  });

  it('takes a story, origin or Road Trip mission as played, and only the one chosen', () => {
    const campaign = playing({
      step: 'tactical-mission',
      log: [at(4, { kind: 'mission-selected', team: 1, mission: 'left-behind-1', names: [] })],
    });

    expect(
      missionOutcomeProblem(campaign, {
        kind: 'mission-played',
        team: 1,
        mission: 'left-behind-1',
      }),
    ).toBeNull();
    expect(
      missionOutcomeProblem(campaign, { kind: 'mission-played', team: 1, mission: 'chased' }),
    ).toMatch(/not the mission/);
  });

  it('reopens a failed First Mission on turn 1, and nothing else (R21)', () => {
    const failed = firstTurn([at(1, first(null))]);
    const won = firstTurn([at(1, first(1))]);

    expect(retryOwed(failed, 1)).toBe(true);
    expect(firstMissionFailed(failed)).toBe(true);
    expect(
      selectionProblem(
        { ...failed, step: 'select-mission' },
        { team: 1, mission: 'first-mission' },
      ),
    ).toBeNull();

    expect(retryOwed(won, 1)).toBe(false);
    expect(firstMissionFailed(won)).toBe(false);
    expect(
      selectionProblem({ ...won, step: 'select-mission' }, { team: 1, mission: 'first-mission' }),
    ).toMatch(/outcome recorded/);
  });

  it('lets the First Mission played again have its own outcome (R21)', () => {
    const again = firstTurn([
      at(1, first(null)),
      at(1, { kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
    ]);

    expect(teamOutcomes(again).size).toBe(0);
    expect(unresolvedTeams(again)).toEqual([1]);
    expect(missionOutcomeProblem(again, first(2))).toBeNull();
  });

  it('refuses an opt-out once a mission has been played', () => {
    const played = playing({
      log: [chose(1, 'thin-the-herd'), at(4, { ...thinHerd(), team: 1 })],
    });

    expect(skipProblem(played)).toMatch(/already played/);
  });

  it('warns when a stranger outranks everybody on the team (pg. 31)', () => {
    const rescuing = playing({
      step: 'tactical-mission',
      log: [chose(2, 'rescue-strangers')],
    });
    const rescue = (tier: 1 | 2 | 3 | 4) => ({
      kind: 'rescue-strangers-resolved' as const,
      team: 2,
      strangers: [1, tier] as const,
    });

    // Ruby, team 2's only member, is Tier 3.
    expect(strangerWarning(rescuing, rescue(3))).toBeNull();
    expect(strangerWarning(rescuing, rescue(4))).toMatch(/Tier 4 or higher/);
    expect(strangerWarning(rescuing, thinHerd())).toBeNull();
  });
});

describe('outcomeOf', () => {
  const counts = {
    endCondition: 2,
    strangers: [1, 2] as const,
    vehiclesOnArea: 1,
    materialsCarriedOut: 5,
    startingZombies: 8,
    zombiesLeft: 3,
    survivorsExited: 1,
    allIncapacitated: false,
    vehiclesDrivenOff: 2,
  };

  it('writes each standard mission’s own kind, with only the counts it records', () => {
    expect(outcomeOf({ team: 2, mission: 'claim-a-new-base' }, counts)).toStrictEqual({
      kind: 'claim-a-new-base-resolved',
      team: 2,
      endCondition: 2,
      strangers: [1, 2],
      vehiclesOnArea: 1,
    });
    expect(outcomeOf({ team: 1, mission: 'siege-defense' }, counts)).toStrictEqual({
      kind: 'siege-defense-resolved',
      team: 1,
      zombiesLeft: 3,
      survivorsExited: 1,
    });
  });

  it('gives every standard mission an outcome its own guard reads back as that mission', () => {
    for (const mission of [
      'first-mission',
      'claim-a-new-base',
      'gather-materials',
      'thin-the-herd',
      'retrieve-new-vehicles',
      'rescue-strangers',
      'rare-goods-trader',
      'siege-defense',
    ] as const) {
      expect(outcomeMission(outcomeOf({ team: 1, mission }, counts))).toBe(mission);
    }
  });

  it('records any other mission as played', () => {
    expect(outcomeOf({ team: 3, mission: 'the-dark' }, counts)).toStrictEqual({
      kind: 'mission-played',
      team: 3,
      mission: 'the-dark',
    });
  });
});

describe('teamOutcomes', () => {
  it('reads only this turn’s outcomes, and only outcomes', () => {
    const campaign = playing({
      log: [
        // Last turn's team 2, which nothing this turn chose again.
        chose(2, 'thin-the-herd', 3),
        at(3, { ...thinHerd(), team: 2 }),
        chose(1, 'thin-the-herd'),
        at(4, {
          kind: 'xp-awarded',
          survivor: 'earl',
          name: 'Earl Rhodes',
          amount: 1,
          source: 'mission',
        }),
      ],
    });

    expect(teamOutcomes(campaign).size).toBe(0);
  });

  it('lets an opt-out clear every outcome before it', () => {
    const campaign = playing({
      log: [chose(1, 'thin-the-herd'), at(4, { ...thinHerd(), team: 1 }), skipped()],
    });

    expect(teamOutcomes(campaign).size).toBe(0);
  });
});

describe('retryOwed (R21)', () => {
  const failedFirst = {
    kind: 'first-mission-resolved' as const,
    team: 1,
    endCondition: null,
    strangers: [],
  };

  it('is owed only on turn 1', () => {
    const later = playing({ log: [at(4, failedFirst)] });

    expect(retryOwed(later, 1)).toBe(false);
  });

  it('is owed only for the First Mission, not another mission that met no end condition', () => {
    const claim = playing({
      turn: 1,
      log: [
        at(1, {
          kind: 'claim-a-new-base-resolved',
          team: 1,
          endCondition: null,
          strangers: [],
          vehiclesOnArea: 0,
        }),
      ],
    });

    expect(retryOwed(claim, 1)).toBe(false);
  });

  it('is not owed for a team with no outcome', () => {
    expect(retryOwed(playing({ turn: 1 }), 1)).toBe(false);
  });
});

describe('strangerWarning, at its edges', () => {
  it('names the highest Tier nobody on the team reaches', () => {
    const rescuing = playing({ step: 'tactical-mission', log: [chose(1, 'rescue-strangers')] });

    // Earl and Carla, team 1, are both Tier 2.
    expect(
      strangerWarning(rescuing, {
        kind: 'rescue-strangers-resolved',
        team: 1,
        strangers: [4, 3],
      }),
    ).toMatch(/Tier 4 or higher/);
  });

  it('warns about any stranger for a team nobody is on', () => {
    expect(
      strangerWarning(playing(), { kind: 'rescue-strangers-resolved', team: 5, strangers: [1] }),
    ).toMatch(/Tier 1 or higher/);
  });
});
