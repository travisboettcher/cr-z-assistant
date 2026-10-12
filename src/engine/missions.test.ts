import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import type { CampaignEvent, LogEntry } from './log';
import {
  deployed,
  missionOutcomeProblem,
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
      /No team chose/,
    );
    expect(
      missionOutcomeProblem(playing({ step: 'tactical-mission', log: [calledForTurn4] }), siege),
    ).toMatch(/Choose the Siege Defense/);
    expect(missionOutcomeProblem(thinning(), siege)).toMatch(/Choose the Siege Defense/);
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
