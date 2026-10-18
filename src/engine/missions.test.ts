import { describe, expect, it } from 'vitest';
import { overrun, wentOn } from '../test/overrun';
import type { BaseId } from '../data/bases';
import type { Material } from '../data/materials';
import type { StoryMissionId } from '../data/missions';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import type { CampaignEvent, LogEntry, MissionWound } from './log';
import {
  asksForBase,
  asksSameMap,
  deployed,
  firstMissionFailed,
  missionOutcomeProblem,
  outcomeMission,
  outcomeOf,
  outcomeTeam,
  retryOwed,
  strangerWarning,
  teamOutcomes,
  unresolvedTeams,
  missionsChosen,
  missionsOnOffer,
  missionTeams,
  selectionProblem,
  skipProblem,
  missionPlayed,
  turnMissions,
  withWounds,
  woundsAsTheyStand,
  woundsProblem,
  type MissionOutcome,
} from './missions';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-12T09:00:00.000Z';

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const carla = createSurvivor('Carla Proust', 2, { id: 'carla' });
const ruby = createSurvivor('Ruby Vance', 3, { id: 'ruby' });
const nell = createSurvivor('Nell Haig', 1, { id: 'nell' });

const onTeam = (team: number): Assignment => ({ task: 'mission', team });

/** The survivor with this story attached, since turn 2. */
const withStory = (survivor: Survivor, mission: StoryMissionId): Survivor => ({
  ...survivor,
  stories: [{ mission, attachedOnTurn: 2 }],
});

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

/**
 * The outcome guard, with the team as it stands written in as the outcome's
 * wounds unless the outcome gives its own — so the tests about counts are
 * about counts. The wounds have their own tests, under `woundsProblem`.
 */
const outcomeProblem = (campaign: Campaign, outcome: MissionOutcome) =>
  missionOutcomeProblem(campaign, {
    wounds: woundsAsTheyStand(campaign, outcomeTeam(outcome)),
    ...outcome,
  });

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
      { team: 1, mission: 'thin-the-herd', names: [] },
      { team: 2, mission: 'rescue-strangers', names: [] },
    ]);
  });

  it('lets an opt-out clear the choices before it, and a choice after it take it back', () => {
    expect(turnMissions(playing({ log: [chose(1, 'thin-the-herd'), skipped()] }))).toEqual({
      choices: [],
      skipped: true,
      recorded: true,
    });
    expect(turnMissions(playing({ log: [skipped(), chose(1, 'thin-the-herd')] }))).toEqual({
      choices: [{ team: 1, mission: 'thin-the-herd', names: [] }],
      skipped: false,
      recorded: true,
    });
  });

  it('reads only this turn', () => {
    expect(turnMissions(playing({ log: [chose(1, 'thin-the-herd', 3)] })).recorded).toBe(false);
  });

  /** #237: turn 1 offers one mission, so team 1 plays it without choosing it. */
  describe('on turn 1', () => {
    const turnOne = (overrides: Partial<Campaign> = {}) =>
      playing({ turn: 1, assignments: { earl: onTeam(1), carla: onTeam(1) }, ...overrides });

    it('has team 1 playing the First Mission with nothing chosen, named as the team is now', () => {
      expect(turnMissions(turnOne())).toEqual({
        choices: [{ team: 1, mission: 'first-mission', names: [earl.name, carla.name] }],
        skipped: false,
        recorded: true,
      });
      expect(missionsChosen(turnOne())).toBe(true);
      expect(unresolvedTeams(turnOne())).toEqual([1]);
    });

    it('has no First Mission while nobody is on team 1', () => {
      expect(turnMissions(turnOne({ assignments: {} })).choices).toEqual([]);
      // Team 1's, and nobody else's.
      expect(turnMissions(turnOne({ assignments: { ruby: onTeam(2) } })).choices).toEqual([]);
    });

    it('keeps an entry when there is one: choosing again is how a failed one is replayed (R21)', () => {
      const replay = turnOne({
        log: [
          at(1, { kind: 'mission-selected', team: 1, mission: 'first-mission', names: ['Earl'] }),
        ],
      });

      expect(turnMissions(replay).choices).toEqual([
        { team: 1, mission: 'first-mission', names: ['Earl'] },
      ]);
    });

    it('is turn 1 alone', () => {
      expect(turnMissions(turnOne({ turn: 2 })).choices).toEqual([]);
    });
  });

  /**
   * #236, R1. Select Mission's record named the team as it was *now*, so
   * taking somebody off it after the choice rewrote who the record said went.
   * The entry has always stored the names it was recorded with.
   */
  it('keeps the names each choice was recorded with, whoever is on the team now', () => {
    const campaign = playing({
      assignments: { earl: onTeam(1) },
      log: [
        at(4, {
          kind: 'mission-selected',
          team: 1,
          mission: 'thin-the-herd',
          names: ['Earl Rhodes', 'Carla Proust'],
        }),
      ],
    });

    expect(turnMissions(campaign).choices[0]?.names).toEqual(['Earl Rhodes', 'Carla Proust']);
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
      { team: 1, mission: 'gather-materials', names: [], material: 'fuel' },
    ]);
  });

  it('carries the base a Claim a New Base team is claiming, and nothing for a Claim without one', () => {
    const claim = (base?: BaseId): LogEntry =>
      at(4, {
        kind: 'mission-selected',
        team: 1,
        mission: 'claim-a-new-base',
        names: [],
        ...(base === undefined ? {} : { base }),
      });

    expect(turnMissions(playing({ log: [claim('distillery')] })).choices).toStrictEqual([
      { team: 1, mission: 'claim-a-new-base', names: [], base: 'distillery' },
    ]);
    // A Claim chosen before Z4-7 named no base, and reads as one that did not.
    expect(turnMissions(playing({ log: [claim()] })).choices).toStrictEqual([
      { team: 1, mission: 'claim-a-new-base', names: [] },
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
    expect(missionsOnOffer(playing({ turn: 1 }), 1)).toEqual(['first-mission']);
  });

  it('offers only the Siege Defense when the horde called one (pg. 23)', () => {
    expect(missionsOnOffer(playing({ log: [calledForTurn4] }), 1)).toEqual(['siege-defense']);
  });

  it('offers the six other standard missions any other turn (pg. 75)', () => {
    const offered = missionsOnOffer(playing(), 1);

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

  it('offers Road Trip missions, and only the campaign’s own origin missions', () => {
    const plain = missionsOnOffer(playing(), 1);
    const viral = missionsOnOffer(playing({ origin: 'viral' }), 1);

    expect(plain).toContain('chased');
    expect(plain).not.toContain('experimental-data');
    expect(viral).toContain('experimental-data');
    expect(viral).not.toContain('the-graveyard');
  });

  /** The acceptance. */
  it('offers a story only to the team its survivor is on (pg. 87; R116)', () => {
    const storied = playing({ survivors: [withStory(earl, 'left-behind-1'), carla, ruby, nell] });

    expect(missionsOnOffer(storied, 1)).toContain('left-behind-1');
    expect(missionsOnOffer(storied, 1)).not.toContain('warehouse');
    expect(missionsOnOffer(storied, 2)).not.toContain('left-behind-1');
    expect(missionsOnOffer(playing(), 1)).not.toContain('left-behind-1');
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
    const storied = playing({ survivors: [withStory(earl, 'left-behind-1'), carla, ruby, nell] });

    expect(selectionProblem(storied, { team: 1, mission: 'left-behind-1' })).toBeNull();
    expect(
      selectionProblem(storied, { team: 1, mission: 'left-behind-1', material: 'fuel' }),
    ).toMatch(/Only Gather Materials/);
  });

  it('refuses a story to a team its survivor is not on (R116)', () => {
    const storied = playing({ survivors: [withStory(earl, 'left-behind-1'), carla, ruby, nell] });

    expect(selectionProblem(storied, { team: 2, mission: 'left-behind-1' })).toBe(
      'A story is played by the team its survivor is on.',
    );
    expect(selectionProblem(playing(), { team: 1, mission: 'warehouse' })).toBe(
      'A story is played by the team its survivor is on.',
    );
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
    expect(
      selectionProblem(claiming, { team: 1, mission: 'claim-a-new-base', base: 'summer-camp' }),
    ).toBeNull();
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
        base: 'summer-camp',
      }),
    ).toBeNull();
  });

  it('asks Claim a New Base for the base it claims, and no other mission (pg. 78; Z4-7)', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'claim-a-new-base' })).toMatch(
      /Choose the base this mission claims/,
    );
    expect(
      selectionProblem(playing(), { team: 1, mission: 'claim-a-new-base', base: 'distillery' }),
    ).toBeNull();
    expect(
      selectionProblem(playing(), { team: 1, mission: 'thin-the-herd', base: 'distillery' }),
    ).toMatch(/Only Claim a New Base/);
    expect(
      selectionProblem(playing(), {
        team: 1,
        mission: 'claim-a-new-base',
        base: 'toString' as 'distillery',
      }),
    ).toMatch(/no such base/);
  });

  it('lets a claim aim at the base already held, or a lower Tier (pg. 78; R26)', () => {
    const housed = playing({ base: { id: 'hydroelectric-dam', slots: {} } });

    expect(
      selectionProblem(housed, { team: 1, mission: 'claim-a-new-base', base: 'hydroelectric-dam' }),
    ).toBeNull();
    expect(
      selectionProblem(housed, { team: 1, mission: 'claim-a-new-base', base: 'small-town-home' }),
    ).toBeNull();
  });

  it('asks Gather Materials for a material type, and no other mission (pg. 80)', () => {
    expect(selectionProblem(playing(), { team: 1, mission: 'gather-materials' })).toMatch(
      /material type Gather Materials takes/,
    );
    expect(
      selectionProblem(playing(), { team: 1, mission: 'gather-materials', material: 'fuel' }),
    ).toBeNull();
    expect(
      selectionProblem(playing(), { team: 1, mission: 'thin-the-herd', material: 'fuel' }),
    ).toMatch(/Only Gather Materials/);
    // Nor anything that is not a material at all.
    expect(
      selectionProblem(playing(), {
        team: 1,
        mission: 'gather-materials',
        material: 'rare' as Material,
      }),
    ).toMatch(/no such material/);
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
    expect(outcomeProblem(thinning(), herd)).toBeNull();
    expect(outcomeProblem(besieged(), siege)).toBeNull();
  });

  it('refuses a mission no team chose, rather than guessing from the siege', () => {
    expect(outcomeProblem(playing({ step: 'tactical-mission' }), herd)).toMatch(
      /hasn’t chosen a mission/,
    );
    expect(
      outcomeProblem(playing({ step: 'tactical-mission', log: [calledForTurn4] }), siege),
    ).toMatch(/hasn’t chosen a mission/);
    expect(outcomeProblem(thinning(), siege)).toMatch(/isn’t the mission team 1 chose/);
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

    expect(outcomeProblem(two, rescued)).toBeNull();
    expect(outcomeProblem(two, { ...rescued, team: 1 })).toMatch(/isn’t the mission/);
    // Team 1's outcome does not count as team 2's.
    expect(outcomeProblem({ ...two, log: [...two.log, at(4, herd)] }, rescued)).toBeNull();
    expect(outcomeProblem({ ...two, log: [...two.log, at(4, rescued)] }, rescued)).toMatch(
      /team 2’s outcome is already recorded/,
    );
  });

  it('refuses outside the Mission Phase, and a second outcome in one turn', () => {
    expect(outcomeProblem(thinning({ step: 'heal-wounds' }), herd)).toMatch(/Mission Phase/);
    expect(
      outcomeProblem(thinning({ log: [chose(1, 'thin-the-herd'), at(4, herd)] }), herd),
    ).toMatch(/already/);
  });

  it('takes a count of zero', () => {
    expect(outcomeProblem(thinning(), { ...herd, startingZombies: 0 })).toBeNull();
  });

  it.each([
    ['a negative', -1],
    ['a fractional', 1.5],
    ['an unreadable', Number.NaN],
  ])('refuses %s count in any field', (_, bad) => {
    const refused = /whole number/;

    expect(outcomeProblem(besieged(), { ...siege, zombiesLeft: bad })).toMatch(refused);
    expect(outcomeProblem(besieged(), { ...siege, survivorsExited: bad })).toMatch(refused);
    expect(outcomeProblem(thinning(), { ...herd, startingZombies: bad })).toMatch(refused);
    expect(outcomeProblem(thinning(), { ...herd, zombiesLeft: bad })).toMatch(refused);
    expect(outcomeProblem(thinning(), { ...herd, survivorsExited: bad })).toMatch(refused);
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
  const first = (endCondition: number | null, strangers: readonly (1 | 2 | 3)[] = []) => ({
    kind: 'first-mission-resolved' as const,
    team: 1,
    endCondition,
    strangers,
  });

  it('takes an end condition the mission has, or none (pg. 77)', () => {
    expect(outcomeProblem(firstTurn(), first(1))).toBeNull();
    expect(outcomeProblem(firstTurn(), first(3))).toBeNull();
    expect(outcomeProblem(firstTurn(), first(null))).toBeNull();
    expect(outcomeProblem(firstTurn(), first(4))).toMatch(/1 to 3/);
    expect(outcomeProblem(firstTurn(), first(0))).toMatch(/1 to 3/);
    expect(outcomeProblem(firstTurn(), first(1.5))).toMatch(/1 to 3/);
    expect(outcomeProblem(firstTurn(), first(Number.NaN))).toMatch(/1 to 3/);
  });

  it('takes strangers of Tiers 1 to 3, and refuses a Hero (pg. 7; R24)', () => {
    expect(outcomeProblem(firstTurn(), first(2, [1, 3]))).toBeNull();
    expect(outcomeProblem(firstTurn(), { ...first(2), strangers: [4 as 3] })).toMatch(
      /Tier 1 to 3/,
    );
    expect(outcomeProblem(firstTurn(), { ...first(2), strangers: [0 as 1] })).toMatch(
      /Tier 1 to 3/,
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
      {
        kind: 'gather-materials-resolved' as const,
        team: 1,
        materialsCarriedOut: 5,
        strangers: [1] as const,
      },
      { materialsCarriedOut: 1.5 },
    ],
    [
      'retrieve-new-vehicles' as const,
      {
        kind: 'retrieve-new-vehicles-resolved' as const,
        team: 1,
        vehiclesDrivenOff: 0,
        strangers: [],
      },
      { vehiclesDrivenOff: Number.NaN },
    ],
    [
      'rare-goods-trader' as const,
      {
        kind: 'rare-goods-trader-resolved' as const,
        team: 1,
        survivorsExited: 1,
        strangers: [3] as const,
      },
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

    expect(outcomeProblem(campaign, outcome)).toBeNull();
    expect(outcomeProblem(campaign, { ...outcome, ...bad })).toMatch(/whole number/);
  });

  it('takes an origin or Road Trip mission as played, and only the one chosen', () => {
    const campaign = playing({
      step: 'tactical-mission',
      log: [at(4, { kind: 'mission-selected', team: 1, mission: 'chased', names: [] })],
    });

    expect(
      outcomeProblem(campaign, { kind: 'mission-played', team: 1, mission: 'chased' }),
    ).toBeNull();
    expect(
      outcomeProblem(campaign, { kind: 'mission-played', team: 1, mission: 'left-behind-1' }),
    ).toMatch(/isn’t the mission/);
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
    ).toMatch(/already played its mission/);
  });

  it('lets the First Mission played again have its own outcome (R21)', () => {
    const again = firstTurn([
      at(1, first(null)),
      at(1, { kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
    ]);

    expect(teamOutcomes(again).size).toBe(0);
    expect(unresolvedTeams(again)).toEqual([1]);
    expect(outcomeProblem(again, first(2))).toBeNull();
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
      log: [chose(1, 'rescue-strangers')],
    });
    const rescue = (tier: 1 | 2 | 3) => ({
      kind: 'rescue-strangers-resolved' as const,
      team: 1,
      strangers: [1, tier] as const,
    });

    // Earl and Carla, team 1, are both Tier 2.
    expect(strangerWarning(rescuing, rescue(2))).toBeNull();
    expect(strangerWarning(rescuing, rescue(3))).toMatch(/Tier 3 or higher/);
    expect(strangerWarning(rescuing, thinHerd())).toBeNull();
  });
});

describe('outcomeOf', () => {
  const wounds = [{ survivor: 'earl', name: 'Earl Rhodes', health: 1 }];
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
    wounds,
  };

  it('writes each standard mission’s own kind, with only the counts it records', () => {
    expect(outcomeOf({ team: 2, mission: 'claim-a-new-base' }, counts)).toStrictEqual({
      kind: 'claim-a-new-base-resolved',
      team: 2,
      endCondition: 2,
      strangers: [1, 2],
      vehiclesOnArea: 1,
      wounds,
    });
    expect(outcomeOf({ team: 1, mission: 'siege-defense' }, counts)).toStrictEqual({
      kind: 'siege-defense-resolved',
      team: 1,
      zombiesLeft: 3,
      survivorsExited: 1,
      wounds,
    });
  });

  /** The page numbers a total loss as condition 4 (pp. 77, 79; #205). */
  it('records the printed failure’s number as no condition met', () => {
    for (const mission of ['first-mission', 'claim-a-new-base'] as const) {
      expect(outcomeOf({ team: 1, mission }, { ...counts, endCondition: 4 })).toMatchObject({
        endCondition: null,
      });
      expect(outcomeOf({ team: 1, mission }, { ...counts, endCondition: 3 })).toMatchObject({
        endCondition: 3,
      });
      expect(outcomeOf({ team: 1, mission }, { ...counts, endCondition: null })).toMatchObject({
        endCondition: null,
      });
    }
  });

  it('gives every standard mission an outcome its own guard reads back as that mission, with the team’s wounds (Z4-4)', () => {
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
      const outcome = outcomeOf({ team: 1, mission }, counts);

      expect(outcomeMission(outcome)).toBe(mission);
      expect(outcome.wounds).toBe(wounds);
    }
  });

  it('records any other mission as played, with its wounds too', () => {
    expect(outcomeOf({ team: 3, mission: 'the-dark' }, counts)).toStrictEqual({
      kind: 'mission-played',
      team: 3,
      mission: 'the-dark',
      wounds,
    });
  });
});

describe('woundsAsTheyStand', () => {
  it('starts each member of the team at their Health now, in roster order', () => {
    const hurt = playing({ survivors: [{ ...earl, currentHp: 1 }, carla, ruby, nell] });

    expect(woundsAsTheyStand(hurt, 1)).toStrictEqual([
      { survivor: 'earl', name: 'Earl Rhodes', health: 1 },
      { survivor: 'carla', name: 'Carla Proust', health: 2 },
    ]);
  });

  it('adds their Infection in a Viral campaign, and only there (pg. 123)', () => {
    const viral = playing({ origin: 'viral', survivors: [earl, carla, { ...ruby, infection: 3 }] });

    expect(woundsAsTheyStand(viral, 2)).toStrictEqual([
      { survivor: 'ruby', name: 'Ruby Vance', health: 3, infection: 3 },
    ]);
    expect(woundsAsTheyStand(playing({ origin: 'magic' }), 2)).toStrictEqual([
      { survivor: 'ruby', name: 'Ruby Vance', health: 3 },
    ]);
  });

  it('has nobody for a team nobody is on', () => {
    expect(woundsAsTheyStand(playing(), 3)).toEqual([]);
  });

  it('is the whole community on a siege turn (pg. 85)', () => {
    expect(
      woundsAsTheyStand(playing({ log: [calledForTurn4] }), 1).map((wound) => wound.survivor),
    ).toEqual(['earl', 'carla', 'ruby', 'nell']);
  });
});

describe('woundsProblem', () => {
  /** Team 1 — Earl and Carla, both Tier 2, so 2 Health at most — playing a Thin the Herd. */
  const thinning = (overrides: Partial<Campaign> = {}) =>
    playing({ step: 'tactical-mission', log: [chose(1, 'thin-the-herd')], ...overrides });
  const wounded = (...wounds: MissionWound[]): MissionOutcome => ({
    ...thinHerd(),
    team: 1,
    wounds,
  });
  const EARL = { survivor: 'earl', name: 'Earl Rhodes' };
  const CARLA = { survivor: 'carla', name: 'Carla Proust' };

  it('takes every member at a Health from 0 to their maximum (pg. 7)', () => {
    expect(
      woundsProblem(thinning(), wounded({ ...EARL, health: 0 }, { ...CARLA, health: 2 })),
    ).toBeNull();
    expect(
      missionOutcomeProblem(thinning(), wounded({ ...CARLA, health: 1 }, { ...EARL, health: 2 })),
    ).toBeNull();
  });

  it.each([
    ['above the maximum', 3],
    ['below 0', -1],
    ['fractional', 1.5],
    ['unreadable', Number.NaN],
  ])('refuses Health %s, naming whose and the range', (_, health) => {
    expect(
      missionOutcomeProblem(thinning(), wounded({ ...EARL, health }, { ...CARLA, health: 2 })),
    ).toBe('Earl Rhodes’s Health must be a whole number from 0 to 2.');
  });

  it('reads the maximum off each survivor’s own Tier', () => {
    const veteran = thinning({ assignments: { ruby: onTeam(1) } });
    const RUBY = { survivor: 'ruby', name: 'Ruby Vance' };

    expect(woundsProblem(veteran, wounded({ ...RUBY, health: 3 }))).toBeNull();
    expect(woundsProblem(veteran, wounded({ ...RUBY, health: 4 }))).toMatch(/from 0 to 3/);
  });

  it('refuses a team with somebody left out, or with no wounds at all', () => {
    expect(woundsProblem(thinning(), wounded({ ...EARL, health: 2 }))).toBe(
      'Record the end-of-mission Health of everybody on mission team 1.',
    );
    expect(woundsProblem(thinning(), thinHerd())).toMatch(
      /Record the end-of-mission Health of everybody on mission team 1/,
    );
    expect(missionOutcomeProblem(thinning(), { ...thinHerd(), team: 1 })).toMatch(
      /Record the end-of-mission Health/,
    );
  });

  it('refuses somebody twice, even when the count of wounds is right', () => {
    expect(woundsProblem(thinning(), wounded({ ...EARL, health: 2 }, { ...EARL, health: 1 }))).toBe(
      'Earl Rhodes’s Health is recorded once.',
    );
  });

  it('refuses somebody who is not on the team', () => {
    expect(
      woundsProblem(
        thinning(),
        wounded(
          { ...EARL, health: 2 },
          { ...CARLA, health: 2 },
          { survivor: 'ruby', name: 'Ruby Vance', health: 3 },
        ),
      ),
    ).toBe('Only somebody on mission team 1 has Health to record from its mission.');
  });

  it('takes no wounds for a team with nobody on it', () => {
    const empty = playing({
      step: 'tactical-mission',
      survivors: [],
      log: [calledForTurn4, chose(1, 'thin-the-herd')],
    });

    expect(woundsProblem(empty, { ...thinHerd(), team: 1, wounds: [] })).toBeNull();
  });

  it('refuses Infection in a campaign that is not Viral (pg. 123)', () => {
    expect(
      woundsProblem(
        thinning(),
        wounded({ ...EARL, health: 2, infection: 0 }, { ...CARLA, health: 2 }),
      ),
    ).toBe('Only a Viral campaign records Infection.');
  });

  describe('in a Viral campaign', () => {
    const viral = () => thinning({ origin: 'viral' });

    it('takes Infection from 0 with no ceiling, as the survivor sheet does (#176)', () => {
      expect(
        woundsProblem(
          viral(),
          wounded({ ...EARL, health: 2, infection: 0 }, { ...CARLA, health: 0, infection: 12 }),
        ),
      ).toBeNull();
    });

    it.each([
      ['missing', undefined],
      ['below 0', -1],
      ['fractional', 0.5],
      ['unreadable', Number.NaN],
    ])('refuses Infection %s, naming whose', (_, infection) => {
      expect(
        woundsProblem(
          viral(),
          wounded(
            { ...EARL, health: 2, infection: 1 },
            { ...CARLA, health: 2, ...(infection === undefined ? {} : { infection }) },
          ),
        ),
      ).toBe('Carla Proust’s Infection must be a whole number, 0 or more.');
    });
  });
});

describe('withWounds', () => {
  it('sets each named survivor’s Health, and Infection where it is given, and nobody else’s', () => {
    const before = playing({ survivors: [earl, { ...carla, infection: 2 }, ruby] });
    const after = withWounds(before, [
      { survivor: 'earl', name: 'Earl Rhodes', health: 0, infection: 5 },
      { survivor: 'carla', name: 'Carla Proust', health: 1 },
    ]);

    expect(after.survivors).toStrictEqual([
      { ...earl, currentHp: 0, infection: 5 },
      { ...carla, currentHp: 1, infection: 2 },
      ruby,
    ]);
    expect({ ...after, survivors: before.survivors }).toStrictEqual(before);
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
        strangers: [3, 1],
      }),
    ).toMatch(/Tier 3 or higher/);
  });

  it('warns about any stranger for a team nobody is on, naming the highest Tier', () => {
    expect(
      strangerWarning(playing(), { kind: 'rescue-strangers-resolved', team: 5, strangers: [2, 3] }),
    ).toMatch(/Tier 3 or higher/);
  });
});

/** The further mission an overrun base goes on with (pg. 86; R27, R28; Z4-9). */
describe('the overrun’s continuation', () => {
  it('offers only the mission the way on plays, once one is chosen', () => {
    expect(missionsOnOffer(overrun(), 1)).toEqual(['siege-defense']);
    expect(
      missionsOnOffer(overrun([at(4, { kind: 'overrun-continued', option: 'claim' })]), 1),
    ).toEqual(['claim-a-new-base']);
    expect(
      missionsOnOffer(overrun([at(4, { kind: 'overrun-continued', option: 'start-over' })]), 1),
    ).toEqual(['first-mission']);
  });

  it('lets team 1 choose it although the siege is its outcome, and only then', () => {
    const chosen = overrun([at(4, { kind: 'overrun-continued', option: 'claim' })]);
    const claim = { team: 1, mission: 'claim-a-new-base', base: 'distillery' } as const;

    expect(selectionProblem(overrun(), claim)).toMatch(/already played its mission/);
    expect(selectionProblem(chosen, claim)).toBeNull();
    expect(selectionProblem(chosen, { team: 1, mission: 'siege-defense' })).toMatch(
      /mission it chose to go on with/,
    );
  });

  it('lets the continuation be corrected before it is played, and not the siege', () => {
    const playing = overrun([...wentOn('claim', 'distillery')]);

    expect(
      selectionProblem(playing, { team: 1, mission: 'claim-a-new-base', base: 'summer-camp' }),
    ).toBeNull();
    expect(selectionProblem(playing, { team: 1, mission: 'siege-defense' })).toMatch(
      /mission it chose to go on with/,
    );
  });

  it('asks a community starting over for the base it will claim (R30)', () => {
    const starting = overrun([at(4, { kind: 'overrun-continued', option: 'start-over' })]);

    expect(asksForBase(starting, 'first-mission')).toBe(true);
    expect(selectionProblem(starting, { team: 1, mission: 'first-mission' })).toMatch(
      /Choose the base/,
    );
    expect(
      selectionProblem(starting, { team: 1, mission: 'first-mission', base: 'summer-camp' }),
    ).toBeNull();
    // Turn 1's own First Mission claims its base on the base sheet instead.
    expect(asksForBase(playing({ turn: 1 }), 'first-mission')).toBe(false);
    expect(asksForBase(overrun(), 'first-mission')).toBe(false);
  });

  it('records no strangers for the claim an overrun goes on with (pg. 86)', () => {
    const claiming = overrun([...wentOn('claim', 'distillery')]);
    const outcome = {
      kind: 'claim-a-new-base-resolved' as const,
      team: 1,
      endCondition: 1,
      vehiclesOnArea: 0,
    };

    expect(outcomeProblem(claiming, { ...outcome, strangers: [2] })).toMatch(/no strangers/);
    expect(outcomeProblem(claiming, { ...outcome, strangers: [] })).toBeNull();
  });

  it('asks about the map for a claim of the overrun base’s own type, and only it (R29)', () => {
    const outcome = {
      kind: 'claim-a-new-base-resolved' as const,
      team: 1,
      endCondition: 1,
      strangers: [],
      vehiclesOnArea: 0,
    };
    const home = overrun([...wentOn('claim', 'hobby-farm')]);
    const away = overrun([...wentOn('claim', 'distillery')]);

    expect(asksSameMap(home, { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' })).toBe(
      true,
    );
    expect(outcomeProblem(home, outcome)).toMatch(/own map/);
    expect(outcomeProblem(home, { ...outcome, sameMap: false })).toBeNull();
    expect(outcomeProblem(away, { ...outcome, sameMap: true })).toMatch(/Only a claim of/);
    expect(outcomeProblem(away, outcome)).toBeNull();
  });

  it('asks about the map of a claim only, and only with a base on each side', () => {
    const home = overrun([...wentOn('claim', 'hobby-farm')]);

    expect(asksSameMap(home, { team: 1, mission: 'first-mission', base: 'hobby-farm' })).toBe(
      false,
    );
    // No base named, and no base held: nothing to be the same as.
    const homeless = overrun([...wentOn('claim', 'hobby-farm')], { base: null });
    expect(asksSameMap(homeless, { team: 1, mission: 'claim-a-new-base' })).toBe(false);
    expect(
      asksSameMap(homeless, { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' }),
    ).toBe(false);
  });

  it('asks for a base only of the First Mission a community starts over with', () => {
    const claiming = overrun([at(4, { kind: 'overrun-continued', option: 'claim' })]);

    expect(asksForBase(claiming, 'siege-defense')).toBe(false);
    expect(asksForBase(playing(), 'first-mission')).toBe(false);
  });

  it('writes whether the claim was on the same map when the form says', () => {
    const counts = {
      endCondition: 1,
      strangers: [],
      vehiclesOnArea: 0,
      materialsCarriedOut: 0,
      startingZombies: 0,
      zombiesLeft: 0,
      survivorsExited: 0,
      allIncapacitated: false,
      vehiclesDrivenOff: 0,
      wounds: [],
    };
    const claim = { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' } as const;

    expect(outcomeOf(claim, { ...counts, sameMap: false })).toMatchObject({ sameMap: false });
    expect(outcomeOf(claim, counts)).not.toHaveProperty('sameMap');
  });

  it('asks nothing about the map of an ordinary claim, even of the base held', () => {
    const ordinary = playing({
      base: { id: 'hobby-farm', slots: {} },
      log: [
        at(4, {
          kind: 'mission-selected',
          team: 1,
          mission: 'claim-a-new-base',
          names: [],
          base: 'hobby-farm',
        }),
      ],
    });

    expect(
      asksSameMap(ordinary, { team: 1, mission: 'claim-a-new-base', base: 'hobby-farm' }),
    ).toBe(false);
  });
});

/** Set-aside survivors a Rescue Strangers team brings back (R31; Z4-11). */
describe('survivors brought back by Rescue Strangers', () => {
  const hera = createSurvivor('Hera Okafor', 4, { id: 'hera' });
  const june = createSurvivor('June Park', 2, { id: 'june' });
  const rescuing = playing({
    setAside: [hera, june],
    log: [at(4, { kind: 'mission-selected', team: 2, mission: 'rescue-strangers', names: [] })],
  });
  const outcome = (returned?: readonly string[]) => ({
    kind: 'rescue-strangers-resolved' as const,
    team: 2,
    strangers: [],
    ...(returned === undefined ? {} : { returned }),
  });

  it('takes somebody set aside, once', () => {
    expect(outcomeProblem(rescuing, outcome(['hera']))).toBeNull();
    expect(outcomeProblem(rescuing, outcome(['hera', 'hera']))).toMatch(/comes back once/);
    expect(outcomeProblem(rescuing, outcome(['earl']))).toMatch(/Only a survivor set aside/);
    // Every one named, not just some of them.
    expect(outcomeProblem(rescuing, outcome(['hera', 'earl']))).toMatch(
      /Only a survivor set aside/,
    );
    expect(outcomeProblem(rescuing, outcome(['june', 'hera']))).toBeNull();
  });

  it('warns when nobody on the team is their Tier — a Hero only by a Hero (pg. 31)', () => {
    // Team 2 is Ruby alone, a Leader.
    expect(strangerWarning(rescuing, outcome(['hera']))).toMatch(/Tier 4 or higher/);
    expect(strangerWarning(rescuing, outcome())).toBeNull();
    // Only the ones brought back count, not everybody set aside.
    expect(strangerWarning(rescuing, outcome(['june']))).toBeNull();
  });

  it('writes who came back only when somebody did', () => {
    const counts = {
      endCondition: null,
      strangers: [],
      vehiclesOnArea: 0,
      materialsCarriedOut: 0,
      startingZombies: 0,
      zombiesLeft: 0,
      survivorsExited: 0,
      allIncapacitated: false,
      vehiclesDrivenOff: 0,
      wounds: [],
    };
    const choice = { team: 2, mission: 'rescue-strangers' } as const;

    expect(outcomeOf(choice, { ...counts, returned: ['hera'] })).toMatchObject({
      returned: ['hera'],
    });
    expect(outcomeOf(choice, { ...counts, returned: [] })).not.toHaveProperty('returned');
    expect(outcomeOf(choice, counts)).not.toHaveProperty('returned');
  });
});

/**
 * #236, R2. The First Mission's team is a record once the mission is played,
 * and the question is the one Select Mission already asked of a team's choice.
 */
describe('missionPlayed', () => {
  const firstTurn = (log: readonly LogEntry[] = []) =>
    playing({
      turn: 1,
      step: 'tactical-mission',
      log: [
        at(1, { kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
        ...log,
      ],
    });
  const ended = (endCondition: number | null) =>
    at(1, { kind: 'first-mission-resolved', team: 1, endCondition, strangers: [] });

  it('is false before the outcome is recorded', () => {
    expect(missionPlayed(firstTurn(), 1)).toBe(false);
  });

  it('is true once it is', () => {
    expect(missionPlayed(firstTurn([ended(2)]), 1)).toBe(true);
  });

  it('is false for a failed First Mission, which turn 1 plays again (R21)', () => {
    expect(missionPlayed(firstTurn([ended(null)]), 1)).toBe(false);
  });

  it('asks about the team it names', () => {
    expect(missionPlayed(firstTurn([ended(2)]), 2)).toBe(false);
  });
});
