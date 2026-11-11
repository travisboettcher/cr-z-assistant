import { describe, expect, it } from 'vitest';
import type { TurnStepId } from '../data/turn';
import { siegeLaborBonus } from './assignments';
import { createNewCampaign, type Campaign } from './campaign';
import { continuedFrom } from './continued';
import { hungerPenalty, planningPenalty } from './feeding';
import type { ContinuedHistory, LogEntry } from './log';
import { mysticLibraryUnlocked, necromancerKilled, necromancerWins } from './magicMissions';
import { hordeForced, siegeCalledOn, siegeDue, turnsSinceLastSiege } from './siege';
import { spellDiscountsLeft, spellsSeen } from './spells';
import { createSurvivor } from './survivor';
import { storiesDone } from './traits';
import { containmentUnlock } from './viralMissions';

const AT = '2026-11-11T09:00:00.000Z';

const continued = (history: Partial<ContinuedHistory> = {}): LogEntry => ({
  turn: 6,
  phase: 'mission',
  at: AT,
  event: { kind: 'campaign-continued', turnsSinceSiege: 3, ...history },
});

/** A campaign picked up at turn 6's Select Mission, with these entries after its first. */
const pickedUp = (
  history: Partial<ContinuedHistory> = {},
  overrides: Partial<Campaign> = {},
  later: readonly LogEntry[] = [],
): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 6,
  step: 'select-mission',
  log: [continued(history), ...later],
  ...overrides,
});

const at = (campaign: Campaign, turn: number, step: TurnStepId = 'select-mission'): Campaign => ({
  ...campaign,
  turn,
  step,
});

describe('the entry a campaign picked up partway starts with (#210)', () => {
  it('is found with its turn, and nothing is found without one', () => {
    expect(continuedFrom(pickedUp({ hordeForced: true }))).toEqual({
      turn: 6,
      history: { kind: 'campaign-continued', turnsSinceSiege: 3, hordeForced: true },
    });
    expect(continuedFrom(createNewCampaign('Cedar Hollow'))).toBeUndefined();
  });
});

describe('the siege counter picks up where it stood (pg. 23)', () => {
  it('counts on from the entered count, and from turn 1 without one', () => {
    expect(turnsSinceLastSiege(pickedUp())).toBe(3);
    expect(turnsSinceLastSiege(at(pickedUp(), 8))).toBe(5);
    expect(turnsSinceLastSiege(at(createNewCampaign('Cedar Hollow'), 6))).toBe(5);
  });

  it('is reset by a Siege Defense played after it', () => {
    const cleared: LogEntry = {
      turn: 7,
      phase: 'mission',
      at: AT,
      event: {
        kind: 'siege-defense-resolved',
        team: 1,
        zombiesLeft: 0,
        survivorsExited: 0,
      },
    };

    expect(turnsSinceLastSiege(at(pickedUp({}, {}, [cleared]), 8))).toBe(1);
  });
});

describe('a siege called before it was picked up (pg. 85)', () => {
  it('is fought on its first turn, at the Siege Threat it was called at', () => {
    const called = pickedUp({ siegeCalledAt: 11 });

    expect(siegeDue(called)).toBe(true);
    expect(siegeCalledOn(called)).toBe(11);
    expect(siegeDue(at(called, 7))).toBe(false);
    expect(siegeCalledOn(at(called, 7))).toBeNull();
    expect(siegeDue(pickedUp())).toBe(false);
    expect(siegeCalledOn(pickedUp())).toBeNull();
  });
});

describe('a forced horde roll brought in (pg. 81)', () => {
  it('holds until the next horde check, and not after', () => {
    const checked: LogEntry = {
      turn: 6,
      phase: 'management',
      at: AT,
      event: { kind: 'horde-checked', roll: 4, threat: 9, siege: true },
    };

    expect(hordeForced(pickedUp({ hordeForced: true }))).toBe(true);
    expect(hordeForced(pickedUp({ hordeForced: true }, {}, [checked]))).toBe(false);
    expect(hordeForced(pickedUp())).toBe(false);
  });
});

describe('last turn’s clean siege adds its Labor on the first turn (pg. 86)', () => {
  it('gives each of the project team a point, that turn only', () => {
    const team = {
      survivors: [
        createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
        createSurvivor('Carla Proust', 2, { id: 'carla' }),
      ],
      assignments: { earl: { task: 'project' }, carla: { task: 'project' } },
    } as const;

    expect(siegeLaborBonus(pickedUp({ siegeCleared: true }, team))).toBe(2);
    expect(siegeLaborBonus(at(pickedUp({ siegeCleared: true }, team), 7))).toBe(0);
    expect(siegeLaborBonus(pickedUp({}, team))).toBe(0);
  });
});

describe('last turn’s Feed runs its penalty into the first turn (R1)', () => {
  it('holds until the first turn’s Management Phase, at the head count it was fed at', () => {
    const short = pickedUp({ fed: { hunger: 6, population: 4 } });

    expect(hungerPenalty(short)).toBe(6);
    expect(planningPenalty(at(short, 6, 'assign-facility-staff'))).toBe(6);
    expect(hungerPenalty(at(short, 6, 'check-for-rot'))).toBe(0);
    expect(hungerPenalty(at(short, 7))).toBe(0);
    // Nothing at all when the community went short by no more than its head count.
    expect(hungerPenalty(pickedUp({ fed: { hunger: 4, population: 4 } }))).toBe(0);
    expect(hungerPenalty(pickedUp())).toBe(0);
  });
});

describe('the stories finished before it (R116)', () => {
  it('are finished here too', () => {
    expect([
      ...storiesDone(pickedUp({ storiesDone: ['left-behind-1', 'sentimental-value'] })),
    ]).toEqual(['left-behind-1', 'sentimental-value']);
    expect(storiesDone(pickedUp()).size).toBe(0);
  });
});

describe('Magic’s history (R112, R123, R124, R153)', () => {
  it('unlocks the Library, counts The Necromancer, and knows the spells seen', () => {
    const magic = pickedUp(
      {
        spellsSeen: ['teleport'],
        graveyardDone: true,
        necromancerWins: 2,
        necromancerKilled: true,
        discountsUsed: 1,
      },
      { origin: 'magic' },
    );

    expect(mysticLibraryUnlocked(magic)).toBe(true);
    expect(necromancerWins(magic)).toBe(2);
    expect(necromancerKilled(magic)).toBe(true);
    expect(spellDiscountsLeft(magic)).toBe(1);
    expect(spellsSeen(magic)).toEqual(['teleport']);

    const none = pickedUp({}, { origin: 'magic' });
    expect(mysticLibraryUnlocked(none)).toBe(false);
    expect(necromancerWins(none)).toBe(0);
    expect(necromancerKilled(none)).toBe(false);
    expect(spellDiscountsLeft(none)).toBe(0);
    expect(spellsSeen(none)).toEqual([]);
  });
});

describe('Viral’s Containment (Z7-6)', () => {
  it('is unlocked at the Hardware entered, and not without it', () => {
    expect(containmentUnlock(pickedUp({ containmentHardware: 3 }, { origin: 'viral' }))).toEqual({
      hardware: 3,
    });
    expect(containmentUnlock(pickedUp({}, { origin: 'viral' }))).toBeNull();
  });
});
