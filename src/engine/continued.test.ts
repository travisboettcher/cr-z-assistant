import { describe, expect, it } from 'vitest';
import type { TurnStepId } from '../data/turn';
import { siegeLaborBonus } from './assignments';
import { createNewCampaign, type Campaign } from './campaign';
import { continuedFrom, continuedProblem, withContinued } from './continued';
import { campaignReducer } from '../state/campaignStore';
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

describe('what a campaign can be picked up with (#210)', () => {
  const start = (history: Partial<ContinuedHistory> = {}, turn = 6) => ({
    turn,
    history: { turnsSinceSiege: 2, ...history },
  });

  it('takes a turn from 2, and a siege count no longer than the turns played', () => {
    expect(continuedProblem(start(), undefined)).toBeNull();
    expect(continuedProblem(start({ turnsSinceSiege: 1 }, 2), undefined)).toBeNull();
    expect(continuedProblem(start({}, 1), undefined)).toBe(
      'A campaign is picked up at turn 2 or later.',
    );
    expect(continuedProblem(start({}, 2.5), undefined)).toMatch(/turn 2 or later/);
    expect(continuedProblem(start({ turnsSinceSiege: 6 }), undefined)).toBe(
      'The turns since the last siege are a whole number from 0 to 5.',
    );
    expect(continuedProblem(start({ turnsSinceSiege: -1 }), undefined)).toMatch(/from 0 to 5/);
    expect(continuedProblem(start({ turnsSinceSiege: 1.5 }), undefined)).toMatch(/from 0 to 5/);
  });

  it('wants whole numbers for a siege and last turn’s Feed', () => {
    expect(continuedProblem(start({ siegeCalledAt: 11 }), undefined)).toBeNull();
    expect(continuedProblem(start({ siegeCalledAt: -2 }), undefined)).toBeNull();
    expect(continuedProblem(start({ siegeCalledAt: 1.5 }), undefined)).toBe(
      'The Siege Threat is a whole number.',
    );
    expect(continuedProblem(start({ fed: { hunger: 3, population: 2 } }), undefined)).toBeNull();
    expect(continuedProblem(start({ fed: { hunger: 0, population: 2 } }), undefined)).toBe(
      'Last turn’s shortfall and head count are whole numbers, 1 or more.',
    );
    expect(continuedProblem(start({ fed: { hunger: 3, population: 0 } }), undefined)).toMatch(
      /head count/,
    );
  });

  it('takes each of the five stories once', () => {
    expect(continuedProblem(start({ storiesDone: ['left-behind-1'] }), undefined)).toBeNull();
    expect(
      continuedProblem(start({ storiesDone: ['left-behind-1', 'left-behind-1'] }), undefined),
    ).toBe('Each story is finished once.');
    expect(continuedProblem(start({ storiesDone: ['left-behind-2a'] }), undefined)).toMatch(
      /finished once/,
    );
  });

  it('keeps each origin’s history to its origin', () => {
    const magic = {
      spellsSeen: ['teleport'],
      graveyardDone: true,
      necromancerWins: 2,
      necromancerKilled: true,
      discountsUsed: 2,
    } as const;

    expect(continuedProblem(start(magic), 'magic')).toBeNull();
    expect(continuedProblem(start(magic), 'viral')).toBe(
      'Only a Magic campaign has spells and The Necromancer.',
    );
    for (const one of [
      { spellsSeen: [] },
      { graveyardDone: true },
      { necromancerWins: 0 },
      { necromancerKilled: true },
      { discountsUsed: 0 },
    ] as const) {
      expect(continuedProblem(start(one), undefined)).toMatch(/Only a Magic campaign/);
    }
    expect(continuedProblem(start({ spellsSeen: ['teleport', 'teleport'] }), 'magic')).toBe(
      'Each spell is seen once.',
    );
    expect(continuedProblem(start({ necromancerWins: -1 }), 'magic')).toBe(
      'The Necromancer’s wins and discounts are whole numbers, 0 or more.',
    );
    expect(continuedProblem(start({ discountsUsed: 1.5 }), 'magic')).toMatch(/whole numbers/);
    expect(continuedProblem(start({ necromancerWins: 1, discountsUsed: 2 }), 'magic')).toBe(
      'No more discounts are spent than The Necromancer was won.',
    );
    expect(continuedProblem(start({ discountsUsed: 1 }), 'magic')).toMatch(/No more discounts/);

    expect(continuedProblem(start({ containmentHardware: 3 }), 'viral')).toBeNull();
    expect(continuedProblem(start({ containmentHardware: 0 }), 'viral')).toBeNull();
    expect(continuedProblem(start({ containmentHardware: 3 }), 'magic')).toBe(
      'Only a Viral campaign has Containment.',
    );
    expect(continuedProblem(start({ containmentHardware: -1 }), 'viral')).toBe(
      'Containment’s Hardware is a whole number, 0 or more.',
    );
  });

  it('starts the campaign at that turn’s Select Mission, its community taken as it stands', () => {
    const picked = withContinued(
      createNewCampaign('Cedar Hollow'),
      start({ hordeForced: true }),
      AT,
    );

    expect(picked).toMatchObject({ turn: 6, step: 'select-mission', startingCommunityBuilt: true });
    expect(picked.log).toEqual([
      {
        turn: 6,
        phase: 'mission',
        at: AT,
        event: { kind: 'campaign-continued', turnsSinceSiege: 2, hordeForced: true },
      },
    ]);
  });
});

describe('the store’s campaign/continued (#210)', () => {
  const action = (turn: number) =>
    ({
      type: 'campaign/continued',
      name: 'Cedar Hollow',
      id: 'x',
      createdAt: AT,
      origin: 'viral',
      traitsEnabled: true,
      start: { turn, history: { turnsSinceSiege: 1, containmentHardware: 3 } },
      at: AT,
    }) as const;

  it('opens the campaign at its turn, started and picked up there', () => {
    const state = campaignReducer({ status: 'empty' }, action(4));
    if (state.status !== 'open') throw new Error('not opened');

    expect(state.campaign).toMatchObject({
      turn: 4,
      step: 'select-mission',
      origin: 'viral',
      traitsEnabled: true,
    });
    expect(state.campaign.log.map(({ turn, event }) => [turn, event.kind])).toEqual([
      [4, 'campaign-started'],
      [4, 'campaign-continued'],
    ]);
    expect(containmentUnlock(state.campaign)).toEqual({ hardware: 3 });
  });

  it('opens nothing for answers it can’t take', () => {
    expect(campaignReducer({ status: 'empty' }, action(1))).toEqual({ status: 'empty' });
  });
});
