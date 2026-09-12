import { describe, expect, it } from 'vitest';
import {
  createNewCampaign,
  type Assignment,
  type Base,
  type Campaign,
  type Survivor,
} from './campaign';
import { createSurvivor } from './survivor';
import {
  hordeCame,
  hordeChecked,
  siegeDue,
  siegeThreat,
  siegeThreatTerms,
  siegeTriggered,
  turnsSinceLastSiege,
  withSiegeCalled,
} from './siege';
import type { LogEntry } from './log';
import { staffedWith } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

function community(
  overrides: Partial<Campaign> = {},
  survivors: readonly Survivor[] = [],
  assignments: Record<string, Assignment> = {},
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    survivors,
    assignments,
    ...overrides,
  };
}

describe('turnsSinceLastSiege', () => {
  it('counts from the first turn for a community the horde has never found', () => {
    expect(turnsSinceLastSiege(community({ turn: 1 }))).toBe(0);
    expect(turnsSinceLastSiege(community({ turn: 5 }))).toBe(4);
  });

  it('counts from the siege once there has been one', () => {
    expect(turnsSinceLastSiege(community({ turn: 7, lastSiegeTurn: 4 }))).toBe(3);
  });

  it('is nothing on the turn a siege is fought', () => {
    expect(turnsSinceLastSiege(community({ turn: 4, lastSiegeTurn: 4 }))).toBe(0);
  });

  /**
   * Between the check that calls a siege and the turn it is fought on,
   * `lastSiegeTurn` is in the future. "Minus one turns since" would *lower*
   * the Siege Threat that the Departures step two steps later reads.
   */
  it('is nothing, never negative, while a siege is still coming', () => {
    expect(turnsSinceLastSiege(community({ turn: 4, lastSiegeTurn: 5 }))).toBe(0);
  });
});

describe('siegeThreatTerms', () => {
  const withStaff = () => {
    const worker = createSurvivor('Nell Haig', 4, { id: 'worker' });

    return staffedWith(community({ base: { id: 'small-town-home', slots: {} } }), 'kitchen', [
      worker,
    ]);
  };

  it('counts a staffed facility, and only once however many are in it', () => {
    const one = withStaff();
    const two = staffedWith(one, 'kitchen', [createSurvivor('Ada Poole', 4, { id: 'other' })]);

    expect(siegeThreatTerms(one)['staffed-facilities']).toBe(1);
    expect(siegeThreatTerms(two)['staffed-facilities']).toBe(1);
  });

  /** The head count, not the Labor: a Hero and a Rookie are two, not five. */
  it('counts the project team by heads rather than by Tier', () => {
    const team = community({}, [
      createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
      createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
    ]);

    expect(
      siegeThreatTerms({
        ...team,
        assignments: { earl: { task: 'project' }, ruby: { task: 'project' } },
      })['project-team'],
    ).toBe(2);
  });

  it('is nothing from a base a community has not claimed', () => {
    expect(siegeThreatTerms(community())['base-features']).toBe(0);
  });

  /** The Renaissance Festival's Curtain Wall is −3 a turn (pg. 73). */
  it('takes the base’s own features, which can be negative', () => {
    const walled: Base = { id: 'renaissance-festival', slots: {} };

    expect(siegeThreatTerms(community({ base: walled }))['base-features']).toBeLessThan(0);
  });

  it('has an entry for every term there is', () => {
    expect(Object.keys(siegeThreatTerms(community())).sort()).toEqual([
      'base-features',
      'project-team',
      'staffed-facilities',
      'turns-since-last-siege',
    ]);
  });
});

describe('siegeThreat', () => {
  it('adds the four terms with no weighting', () => {
    const busy = staffedWith(
      community({ turn: 5, base: { id: 'small-town-home', slots: {} } }, [
        createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
      ]),
      'kitchen',
      [createSurvivor('Nell Haig', 4, { id: 'worker' })],
    );
    const campaign: Campaign = {
      ...busy,
      assignments: { ...busy.assignments, earl: { task: 'project' } },
    };

    // One staffed facility, one on the project team, nothing from the Small
    // Town Home, and four turns of quiet.
    expect(siegeThreat(campaign)).toBe(1 + 1 + 0 + 4);
  });

  /**
   * Not clamped. A quiet community that has built for defence and staffed
   * nothing is genuinely safer, and a floor would be a rule the book has not
   * printed.
   */
  it('can come out negative for a base built to keep the horde off', () => {
    expect(
      siegeThreat(community({ turn: 1, base: { id: 'renaissance-festival', slots: {} } })),
    ).toBeLessThan(0);
  });
});

describe('siegeTriggered', () => {
  it('triggers at sixteen and not at fifteen', () => {
    expect(siegeTriggered(6, 10)).toBe(true);
    expect(siegeTriggered(5, 10)).toBe(false);
  });

  it('can trigger on the threat alone, with the worst roll there is', () => {
    expect(siegeTriggered(1, 15)).toBe(true);
  });

  it('cannot trigger on the best roll against nothing', () => {
    expect(siegeTriggered(10, 0)).toBe(false);
  });
});

describe('siegeDue and withSiegeCalled', () => {
  it('calls the siege for the turn after the check', () => {
    expect(withSiegeCalled(community({ turn: 3 })).lastSiegeTurn).toBe(4);
  });

  it('is not due on the turn the horde was checked', () => {
    expect(siegeDue(withSiegeCalled(community({ turn: 3 })))).toBe(false);
  });

  it('is due on the turn after', () => {
    const called = withSiegeCalled(community({ turn: 3 }));

    expect(siegeDue({ ...called, turn: 4 })).toBe(true);
    expect(siegeDue({ ...called, turn: 5 })).toBe(false);
  });

  it('is never due for a community that has not been called on', () => {
    expect(siegeDue(community({ turn: 3 }))).toBe(false);
  });

  it('changes nothing else about the campaign', () => {
    const before = community({ turn: 3 });

    expect({ ...withSiegeCalled(before), lastSiegeTurn: before.lastSiegeTurn }).toEqual(before);
  });
});

describe('hordeCame', () => {
  it('is false for a community the horde has never found', () => {
    expect(hordeCame(community())).toBe(false);
  });

  it('is true on the turn the check called one for the next', () => {
    expect(hordeCame(withSiegeCalled(community({ turn: 3 })))).toBe(true);
  });

  it('is false again on the turn the siege is fought', () => {
    expect(hordeCame(community({ turn: 4, lastSiegeTurn: 4 }))).toBe(false);
  });

  it('is false once the siege is behind the community', () => {
    expect(hordeCame(community({ turn: 6, lastSiegeTurn: 4 }))).toBe(false);
  });

  /**
   * The distinction both functions exist for. On the turn of the check the
   * horde has come and nothing is yet *due*; on the turn after, the reverse.
   * A screen that used one for the other reads the turn wrong in both.
   */
  it('is the opposite reading of the field `siegeDue` reads', () => {
    const called = withSiegeCalled(community({ turn: 3 }));

    expect(hordeCame(called)).toBe(true);
    expect(siegeDue(called)).toBe(false);

    expect(hordeCame({ ...called, turn: 4 })).toBe(false);
    expect(siegeDue({ ...called, turn: 4 })).toBe(true);
  });
});

describe('hordeChecked', () => {
  const checked = (turn: number): LogEntry => ({
    turn,
    phase: 'management',
    at: AT,
    event: { kind: 'horde-checked', roll: 5, threat: 2, siege: false },
  });

  it('is false before the roll', () => {
    expect(hordeChecked(community())).toBe(false);
  });

  it('is true once this turn has been rolled for', () => {
    expect(hordeChecked(community({ log: [checked(3)] }))).toBe(true);
  });

  it('ignores another turn’s roll', () => {
    expect(hordeChecked(community({ log: [checked(2)] }))).toBe(false);
  });

  it('ignores this turn’s other events', () => {
    const other: LogEntry = { turn: 3, phase: 'management', at: AT, event: { kind: 'turn-began' } };

    expect(hordeChecked(community({ log: [other] }))).toBe(false);
  });
});
