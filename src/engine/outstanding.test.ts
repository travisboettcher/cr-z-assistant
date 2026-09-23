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
