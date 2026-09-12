import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import { createSurvivor } from './survivor';
import {
  departureCandidates,
  departurePressure,
  someoneIsLeaving,
  withDeparture,
} from './departures';
import { hunger, unrest } from './feeding';
import { siegeThreat } from './siege';
import type { LogEntry } from './log';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

function community(
  survivors: readonly Survivor[] = [],
  overrides: Partial<Campaign> = {},
): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors, ...overrides };
}

/** A roster of `count` Tier 1 survivors, which is `count` Exhaustion with no base. */
const crowd = (count: number): Survivor[] =>
  Array.from({ length: count }, (_, at) =>
    createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
  );

describe('departurePressure', () => {
  it('is Unrest plus Siege Threat', () => {
    // Eight survivors and no base: eight Exhaustion, no Hunger, and two turns
    // of quiet.
    const campaign = community(crowd(8));

    expect(unrest(campaign)).toBe(8);
    expect(siegeThreat(campaign)).toBe(2);
    expect(departurePressure(campaign)).toBe(10);
  });
});

describe('someoneIsLeaving', () => {
  it('is false below ten and true at it', () => {
    expect(someoneIsLeaving(community(crowd(7)))).toBe(false);
    expect(someoneIsLeaving(community(crowd(8)))).toBe(true);
  });
});

describe('departureCandidates', () => {
  it('is nobody while the community holds together', () => {
    expect(departureCandidates(community(crowd(7)))).toEqual([]);
  });

  it('is the lowest Tier on the roster', () => {
    const mixed = [...crowd(7), createSurvivor('Earl Rhodes', 4, { id: 'earl' })];

    expect(departureCandidates(community(mixed)).map((survivor) => survivor.tier)).toEqual(
      Array.from({ length: 7 }, () => 1),
    );
  });

  /**
   * A tie is the player's choice, which is why this returns a list: inventing a
   * tiebreak — first on the roster, lowest Health, most recently added — would
   * be this app making up a rule the book deliberately leaves to the table.
   */
  it('returns everybody who ties at the bottom, and nobody above them', () => {
    // Two Citizens are the lowest Tier here; the eight Heroes above them are
    // not candidates however many of them there are.
    const tied = [
      ...Array.from({ length: 8 }, (_, at) =>
        createSurvivor(`Hero ${String(at)}`, 4, { id: `hero-${String(at)}` }),
      ),
      createSurvivor('Ada Poole', 2, { id: 'ada' }),
      createSurvivor('Nell Haig', 2, { id: 'nell' }),
    ];

    expect(departureCandidates(community(tied)).map((survivor) => survivor.id)).toEqual([
      'ada',
      'nell',
    ]);
  });

  /** A survivor at 0 Health can neither leave nor be chosen (pg. 23). */
  it('passes over a survivor at 0 Health, however low their Tier', () => {
    const dying = { ...createSurvivor('Marcus Webb', 1, { id: 'webb' }), currentHp: 0 };
    const campaign = community([
      dying,
      ...Array.from({ length: 8 }, (_, at) =>
        createSurvivor(`Hero ${String(at)}`, 4, { id: `hero-${String(at)}` }),
      ),
    ]);

    expect(someoneIsLeaving(campaign)).toBe(true);
    expect(departureCandidates(campaign).map((survivor) => survivor.id)).not.toContain('webb');
  });

  it('is nobody at all when everybody left standing is at 0 Health', () => {
    const campaign = community(
      Array.from({ length: 9 }, (_, at) => ({
        ...createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
        currentHp: 0,
      })),
    );

    expect(someoneIsLeaving(campaign)).toBe(true);
    expect(departureCandidates(campaign)).toEqual([]);
  });
});

describe('withDeparture', () => {
  const assigned = (): Campaign => {
    const survivors = crowd(9);
    const assignments: Record<string, Assignment> = {
      'survivor-0': { task: 'staff', slot: 'kitchen' },
      'survivor-1': { task: 'project' },
    };

    return community(survivors, {
      assignments,
      base: { id: 'small-town-home', slots: {} },
    });
  };

  it('takes the survivor off the roster', () => {
    expect(
      withDeparture(assigned(), 'survivor-0').survivors.map((survivor) => survivor.id),
    ).not.toContain('survivor-0');
  });

  it('takes their assignment with them, and leaves everybody else’s', () => {
    expect(withDeparture(assigned(), 'survivor-0').assignments).toEqual({
      'survivor-1': { task: 'project' },
    });
  });

  it('leaves the campaign alone when nobody matches', () => {
    const before = assigned();

    expect(withDeparture(before, 'nobody')).toEqual(before);
  });

  /**
   * The ordering trap the plan named before it could be discovered. A survivor
   * leaving retroactively unstaffs whatever they were working and shrinks the
   * project team — both terms of the Siege Threat that Check the Horde rolled
   * against two steps earlier. Nothing may cache it.
   */
  it('lowers the Siege Threat it was itself measured against', () => {
    const before = assigned();
    const after = withDeparture(before, 'survivor-0');

    expect(siegeThreat(after)).toBe(siegeThreat(before) - 1);
    expect(departurePressure(after)).toBeLessThan(departurePressure(before));
  });
});

/**
 * The cascade, from one Food to a survivor walking out — the single regression
 * test this whole phase is most worth having.
 *
 * Every link is a different module: `feeding` turns Food into Hunger, Hunger
 * plus Exhaustion into Unrest, `siege` totals the threat, and `departures`
 * reads the sum. One number at the top moves all of it, and nothing between
 * them is stored.
 */
describe('one Food, all the way down', () => {
  const AFTER_FEEDING = (short: number): LogEntry => ({
    turn: 3,
    phase: 'management',
    at: AT,
    event: { kind: 'survivors-fed', required: 9, hunger: short },
  });

  /**
   * Nine Tier 1 survivors in a base that sleeps four: five Exhaustion. Two
   * turns of quiet is a Siege Threat of two. That is seven before Hunger —
   * three short of the threshold.
   */
  const community9 = (short: number): Campaign =>
    community(crowd(9), {
      base: { id: 'small-town-home', slots: {} },
      log: [AFTER_FEEDING(short)],
    });

  it('holds together two Food short, and loses somebody three short', () => {
    const fed = community9(2);

    expect(hunger(fed)).toBe(2);
    expect(unrest(fed)).toBe(7);
    expect(departurePressure(fed)).toBe(9);
    expect(someoneIsLeaving(fed)).toBe(false);

    const hungrier = community9(3);

    expect(hunger(hungrier)).toBe(3);
    expect(unrest(hungrier)).toBe(8);
    expect(departurePressure(hungrier)).toBe(10);
    expect(someoneIsLeaving(hungrier)).toBe(true);
    expect(departureCandidates(hungrier)).toHaveLength(9);
  });

  it('stops losing people the moment somebody has gone', () => {
    // One departure takes the head count to eight, which takes Exhaustion to
    // four and the pressure back under the threshold.
    const after = withDeparture(community9(3), 'survivor-0');

    expect(departurePressure(after)).toBe(9);
    expect(someoneIsLeaving(after)).toBe(false);
  });
});
