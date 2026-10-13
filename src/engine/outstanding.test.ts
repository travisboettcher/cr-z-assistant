import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import type { LogEntry } from './log';
import { outstanding } from './outstanding';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { queued } from '../test/queued';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

const entry = (event: LogEntry['event'], turn = 3): LogEntry => ({
  turn,
  phase: 'management',
  at: AT,
  event,
});

/**
 * A turn 3 with nothing outstanding, which is the fixture every case below
 * moves one step away from. Everything that records itself has been recorded,
 * so a test that asserts one entry is asserting about the thing it changed.
 */
function settled(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'check-the-horde',
    survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
    materials: { food: 2, fuel: 0, hardware: 0, rare: 0 },
    base: { id: 'small-town-home', slots: {} },
    log: [
      entry({ kind: 'materials-added', food: 0, fuel: 0, hardware: 0, rare: 0 }),
      entry({ kind: 'survivors-fed', required: 2, hunger: 0, population: 1 }),
      entry({ kind: 'horde-checked', roll: 2, threat: 0, siege: false }),
    ],
    ...overrides,
  };
}

const steps = (campaign: Campaign) => outstanding(campaign).map((owed) => owed.step);

describe('outstanding', () => {
  it('is empty for a turn that has done everything it records', () => {
    expect(outstanding(settled())).toEqual([]);
  });

  it('names the haul that never went into storage', () => {
    const skipped = settled({
      log: settled().log.filter((held) => held.event.kind !== 'materials-added'),
    });

    expect(steps(skipped)).toEqual(['add-materials-to-storage']);
    expect(outstanding(skipped)[0]?.says).toContain('haul');
  });

  it('names a community that has not eaten', () => {
    const hungry = settled({
      log: settled().log.filter((held) => held.event.kind !== 'survivors-fed'),
    });

    expect(steps(hungry)).toEqual(['feed-your-survivors']);
  });

  it('names a horde nobody checked for', () => {
    const quiet = settled({
      log: settled().log.filter((held) => held.event.kind !== 'horde-checked'),
    });

    expect(steps(quiet)).toEqual(['check-the-horde']);
  });

  /**
   * A siege the horde called is the one mission the app knows was played, and
   * its outcome is what decides whether the turns since the last siege go back
   * to 0 (pg. 86) — so leaving it out is not neutral.
   */
  it('names a Siege Defense whose outcome is not recorded', () => {
    const besieged = settled({
      log: [entry({ kind: 'horde-checked', roll: 9, threat: 9, siege: true }, 2), ...settled().log],
    });
    const chosen = settled({
      log: [
        ...besieged.log,
        entry({ kind: 'mission-selected', team: 1, mission: 'siege-defense', names: [] }),
      ],
    });
    const recorded = settled({
      log: [
        ...chosen.log,
        entry({ kind: 'siege-defense-resolved', zombiesLeft: 2, survivorsExited: 0 }),
      ],
    });

    expect(steps(chosen)).toEqual(['tactical-mission']);
    expect(steps(recorded)).toEqual([]);
  });

  it('names a mission team with no mission chosen (pg. 17; Z4-2)', () => {
    const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
    const assigned = settled({
      survivors: [earl],
      assignments: { earl: { task: 'mission', team: 1 } },
    });
    const chosen = settled({
      ...assigned,
      log: [
        ...assigned.log,
        entry({ kind: 'mission-selected', team: 1, mission: 'thin-the-herd', names: [] }),
      ],
    });
    const skipped = settled({
      ...assigned,
      log: [...assigned.log, entry({ kind: 'mission-skipped' })],
    });

    const played = settled({
      ...chosen,
      log: [
        ...chosen.log,
        entry({
          kind: 'thin-the-herd-resolved',
          team: 1,
          startingZombies: 6,
          zombiesLeft: 0,
          survivorsExited: 1,
          allIncapacitated: false,
        }),
      ],
    });

    expect(steps(assigned)).toEqual(['select-mission']);
    // Chosen, so its outcome is owed (Z4-3), and recorded, nothing is.
    expect(steps(chosen)).toEqual(['tactical-mission']);
    expect(steps(played)).toEqual([]);
    expect(steps(skipped)).toEqual([]);
  });

  it('owes the First Mission again when no end condition was met (R21)', () => {
    const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
    const failed = settled({
      turn: 1,
      survivors: [earl],
      assignments: { earl: { task: 'mission', team: 1 } },
      log: [
        ...settled().log.map((logged) => ({ ...logged, turn: 1 })),
        entry({ kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }, 1),
        entry({ kind: 'first-mission-resolved', team: 1, endCondition: null, strangers: [] }, 1),
      ],
    });

    expect(steps(failed)).toEqual(['select-mission']);
  });

  /**
   * Z4-5: every stranger the turn's outcomes counted joins at Advancement
   * Step 2 (pg. 19), and the walk owes the step until each one has.
   */
  /** Z4-8: a claim won this turn owes the move at the last Advancement step (R25). */
  describe('a base claimed', () => {
    const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
    const claiming = settled({
      survivors: [earl],
      assignments: { earl: { task: 'mission', team: 1 } },
      log: [
        ...settled().log,
        entry({
          kind: 'mission-selected',
          team: 1,
          mission: 'claim-a-new-base',
          names: [],
          base: 'distillery',
        }),
        entry({
          kind: 'claim-a-new-base-resolved',
          team: 1,
          endCondition: 1,
          strangers: [],
          vehiclesOnArea: 0,
        }),
      ],
    });

    it('owes the move until it is made', () => {
      expect(outstanding(claiming)).toEqual([
        {
          step: 'add-facilities-and-upgrades',
          says: 'The community has not moved into the base its claim won.',
        },
      ]);

      const moved = settled({
        ...claiming,
        log: [
          ...claiming.log,
          entry({ kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] }),
        ],
      });
      expect(steps(moved)).toEqual([]);
    });
  });

  describe('rescued strangers', () => {
    const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
    const ruby = createSurvivor('Ruby Vance', 3, { id: 'ruby' });
    const rescuing = settled({
      survivors: [earl, ruby],
      assignments: { earl: { task: 'mission', team: 1 }, ruby: { task: 'mission', team: 2 } },
      log: [
        ...settled().log,
        entry({ kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] }),
        entry({ kind: 'mission-selected', team: 2, mission: 'rescue-strangers', names: [] }),
        entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2] }),
        entry({ kind: 'rescue-strangers-resolved', team: 2, strangers: [1] }),
      ],
    });
    const joined = (stranger: number, team: number): LogEntry =>
      entry({
        kind: 'stranger-joined',
        survivor: `new-${String(team)}`,
        name: 'Somebody',
        tier: 1,
        team,
        stranger,
      });

    it('owes the step for two strangers nobody has added, and says how many', () => {
      expect(outstanding(rescuing)).toEqual([
        {
          step: 'create-new-survivors',
          says: '2 rescued strangers have not joined the community.',
        },
      ]);
    });

    it('says so of the one stranger left', () => {
      const one = settled({ ...rescuing, log: [...rescuing.log, joined(0, 2)] });

      expect(outstanding(one)).toEqual([
        { step: 'create-new-survivors', says: 'A rescued stranger has not joined the community.' },
      ]);
    });

    it('owes nothing once every stranger has joined', () => {
      const both = settled({ ...rescuing, log: [...rescuing.log, joined(0, 1), joined(0, 2)] });

      expect(steps(both)).toEqual([]);
    });

    /** Last turn's rescues were last turn's step, and the turn that owed them is over. */
    it('owes nothing for a stranger an earlier turn rescued', () => {
      const earlier = settled({
        log: [
          ...settled().log,
          entry({ kind: 'rescue-strangers-resolved', team: 1, strangers: [2] }, 2),
        ],
      });

      expect(steps(earlier)).toEqual([]);
    });
  });

  it('names a survivor at 0 Health whose check has not run', () => {
    const dying = settled({
      survivors: [{ ...createSurvivor('Earl Rhodes', 4, { id: 'earl' }), currentHp: 0 }],
    });

    expect(steps(dying)).toContain('check-for-rot');
  });

  /** A check that ran is not owed, however the survivor came out of it. */
  it('says nothing about a survivor who already checked and held', () => {
    const held = settled({
      survivors: [{ ...createSurvivor('Earl Rhodes', 4, { id: 'earl' }), currentHp: 0 }],
      log: [
        ...settled().log,
        entry({
          kind: 'rot-checked',
          survivor: 'earl',
          name: 'Earl Rhodes',
          roll: 10,
          target: 12,
          passed: true,
        }),
      ],
    });

    expect(steps(held)).not.toContain('check-for-rot');
  });

  it('names Health that was never handed out, and not a turn with none to hand', () => {
    const wounded = settled({
      survivors: [{ ...createSurvivor('Earl Rhodes', 4, { id: 'earl' }), currentHp: 1 }],
      assignments: { earl: { task: 'rest' } },
    });

    expect(steps(wounded)).toContain('heal-wounds');
    // Nobody wounded, nobody resting: the step has nothing to resolve.
    expect(steps(settled())).not.toContain('heal-wounds');
  });

  /**
   * Check Storage records itself whether or not anything spills, so "it did not
   * run" is not the question — "something would be lost and nothing stopped it"
   * is. Warning every turn would teach a player to press through the warning
   * that matters.
   */
  it('names storage only when something is over its cap', () => {
    const overflowing = settled({ materials: { food: 99, fuel: 0, hardware: 0, rare: 0 } });

    expect(steps(overflowing)).toContain('check-storage');
    expect(steps(settled())).not.toContain('check-storage');
  });

  it('names projects that were due and did not land', () => {
    const due = settled({
      projects: [
        queued({ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 }),
      ],
    });

    expect(steps(due)).toContain('add-facilities-and-upgrades');
  });

  /**
   * #147: the shortfall is not a step, and it is here for the same reason the
   * steps are — the turn boundary forgave it, and every over-ordered project
   * completed in the next Advancement Phase.
   */
  it('names a Labor shortfall, and says how much', () => {
    const short = withPlanningBegun({
      ...settled(),
      ...projectTeamWorth(1),
      step: 'departures',
      // Charged with its Labor, because that is the number the shortfall is
      // measured against: a Workshop commits 2 against a pool of 1.
      projects: [
        queued(
          { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
          { hardware: 3, labor: 2 },
        ),
      ],
    });

    const owed = outstanding(short).find((entry) => entry.says.includes('Labor short'));

    expect(owed?.step).toBe('departures');
    expect(owed?.says).toContain('1 Labor short');
  });

  /**
   * #183: a siege's casualty takes their Labor off the team that paid for last
   * turn's orders, before those orders land — the same question, one turn
   * earlier, at the step that would otherwise finish them all.
   */
  it('names last turn’s orders a siege left short', () => {
    const team = projectTeamWorth(1);
    const besieged = settled({
      survivors: team.survivors.map((survivor) => ({ ...survivor, currentHp: 0 })),
      assignments: team.assignments,
      projects: [
        queued(
          { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 },
          { hardware: 3, labor: 1 },
        ),
      ],
      log: [
        ...settled().log,
        entry({ kind: 'siege-defense-resolved', zombiesLeft: 0, survivorsExited: 0 }),
      ],
    });

    const owed = outstanding(besieged).find((entry) => entry.says.includes('after the siege'));

    expect(owed?.step).toBe('add-facilities-and-upgrades');
    expect(owed?.says).toContain('1 Labor short');
  });

  /**
   * Exhaustion carries the pressure here: eleven survivors and four beds is
   * eight, plus the base's own Siege Threat, which clears the threshold of ten
   * without a Labor shortfall to arrange.
   */
  describe('somebody leaving', () => {
    const crowded = (log: readonly LogEntry[] = []): Campaign =>
      settled({
        step: 'departures',
        survivors: Array.from({ length: 12 }, (_, index) =>
          createSurvivor(`Survivor ${String(index + 1)}`, 1, { id: `s${String(index + 1)}` }),
        ),
        log: [...settled().log, ...log],
      });

    it('is owed until they have gone', () => {
      expect(steps(crowded())).toContain('departures');
    });

    it('is not owed once the log says they did', () => {
      const gone = crowded([
        entry({ kind: 'survivor-departed', survivor: 's1', name: 'Survivor 1', tier: 1 }),
      ]);

      expect(steps(gone)).not.toContain('departures');
    });

    it('is not owed while nobody is under enough pressure to leave', () => {
      expect(steps(settled())).not.toContain('departures');
    });

    /**
     * #192: over the threshold, and every survivor down — a siege's defenders
     * at 0 Health, say. Nobody can be chosen (pg. 23), so a step owed here
     * could never be taken and the turn reported it forever.
     */
    it('is not owed when everybody is at 0 Health', () => {
      const down = crowded();
      const fallen = {
        ...down,
        survivors: down.survivors.map((survivor) => ({ ...survivor, currentHp: 0 })),
      };

      expect(steps(fallen)).not.toContain('departures');
    });

    /** Down is R18's `isDown`, so 10 Infection with Health left counts as well. */
    it('is not owed when everybody is down on Infection', () => {
      const down = crowded();
      const fevered: Campaign = {
        ...down,
        origin: 'viral',
        survivors: down.survivors.map((survivor) => ({ ...survivor, infection: 10 })),
      };

      expect(steps(fevered)).not.toContain('departures');
    });

    /** One survivor standing is somebody to send, however many are down. */
    it('is owed while one survivor is still standing', () => {
      const down = crowded();
      const one = {
        ...down,
        survivors: down.survivors.map((survivor, index) =>
          index === 0 ? survivor : { ...survivor, currentHp: 0 },
        ),
      };

      expect(steps(one)).toContain('departures');
    });
  });

  it('reads in the order the walk runs the steps', () => {
    const nothing = settled({ log: [], materials: { food: 0, fuel: 0, hardware: 0, rare: 0 } });

    expect(steps(nothing)).toEqual([
      'add-materials-to-storage',
      'feed-your-survivors',
      'check-the-horde',
    ]);
  });
});
