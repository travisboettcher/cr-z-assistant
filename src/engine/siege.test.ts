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
  towersWithoutTheSkill,
  turnsSinceLastSiege,
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

/**
 * A Check the Horde entry. `siege: true` calls a Siege Defense for the turn
 * *after* this one — which is the whole of what the campaign records about
 * sieges since v11, and the reason nothing is stored beside it.
 */
const rolled = (turn: number, siege: boolean): LogEntry => ({
  turn,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 5, threat: 2, siege },
});

/** A campaign whose horde check called a siege on `turn`. */
const called = (turn: number, now = turn): Campaign =>
  community({ turn: now, log: [rolled(turn, true)] });

describe('turnsSinceLastSiege', () => {
  it('counts from the first turn for a community the horde has never found', () => {
    expect(turnsSinceLastSiege(community({ turn: 1 }))).toBe(0);
    expect(turnsSinceLastSiege(community({ turn: 5 }))).toBe(4);
  });

  it('counts from the siege once there has been one', () => {
    // Called on turn 3, so fought on turn 4, and it is now turn 7.
    expect(turnsSinceLastSiege(called(3, 7))).toBe(3);
  });

  it('is nothing on the turn a siege is fought', () => {
    expect(turnsSinceLastSiege(called(3, 4))).toBe(0);
  });

  /**
   * **The playtest bug, pinned.** Between the check that calls a siege and the
   * turn it is fought on, nothing has happened yet — so the term must keep
   * counting from the *previous* siege. It went to 0 instead, inside the same
   * Management Phase that had just rolled against it, and Departures two steps
   * later tested a pressure lower than the horde was measured by.
   *
   * A single stored field could not do this: writing the coming siege's turn
   * destroyed the last one's.
   */
  it('keeps counting from the last siege fought while another is still coming', () => {
    const coming = community({ turn: 6, log: [rolled(2, true), rolled(6, true)] });

    // Fought on turn 3; the turn-6 call is for turn 7 and has not happened.
    expect(turnsSinceLastSiege(coming)).toBe(3);
  });

  it('ignores a check that called no siege', () => {
    expect(turnsSinceLastSiege(community({ turn: 5, log: [rolled(3, false)] }))).toBe(4);
  });

  /** Two sieges: the most recent one that has actually been fought. */
  it('counts from the latest siege fought, not the first', () => {
    const twice = community({ turn: 9, log: [rolled(1, true), rolled(5, true)] });

    expect(turnsSinceLastSiege(twice)).toBe(3);
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
      'watched-from-above',
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

describe('siegeDue', () => {
  it('is not due on the turn the horde was checked', () => {
    expect(siegeDue(called(3))).toBe(false);
  });

  it('is due on the turn after', () => {
    expect(siegeDue(called(3, 4))).toBe(true);
    expect(siegeDue(called(3, 5))).toBe(false);
  });

  it('is never due for a community that has not been called on', () => {
    expect(siegeDue(community({ turn: 3, log: [rolled(2, false)] }))).toBe(false);
  });
});

describe('hordeCame', () => {
  it('is false for a community the horde has never found', () => {
    expect(hordeCame(community())).toBe(false);
  });

  it('is true on the turn the check called one for the next', () => {
    expect(hordeCame(called(3))).toBe(true);
  });

  it('is false again on the turn the siege is fought', () => {
    expect(hordeCame(called(3, 4))).toBe(false);
  });

  it('is false once the siege is behind the community', () => {
    expect(hordeCame(called(3, 6))).toBe(false);
  });

  /**
   * The distinction both functions exist for. On the turn of the check the
   * horde has come and nothing is yet *due*; on the turn after, the reverse.
   * A screen that used one for the other reads the turn wrong in both.
   */
  it('is the opposite reading of the same entry that `siegeDue` reads', () => {
    expect(hordeCame(called(3))).toBe(true);
    expect(siegeDue(called(3))).toBe(false);

    expect(hordeCame(called(3, 4))).toBe(false);
    expect(siegeDue(called(3, 4))).toBe(true);
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

/**
 * #103's acceptance, as one test: the Siege Threat that step 6 rolls against is
 * the one step 7 tests.
 *
 * The two steps are two reads of the same function a moment apart, and the only
 * thing that used to move between them was the check writing a forward-dated
 * turn onto the campaign. The playtest watched the pressure fall 12 → 8 inside
 * one Management Phase, which saved a survivor from leaving.
 */
describe('a siege called at step 6 and the threat step 7 reads', () => {
  const quiet = (): Campaign =>
    community({ turn: 5, base: { id: 'small-town-home', slots: {} } }, [
      createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
    ]);

  it('is the same number before and after the horde is checked', () => {
    const before = quiet();
    const after: Campaign = { ...before, log: [...before.log, rolled(5, true)] };

    expect(siegeThreat(after)).toBe(siegeThreat(before));
  });

  it('still resets on the turn the siege is actually fought', () => {
    const called = community({ turn: 5, log: [rolled(5, true)] });
    const fought: Campaign = { ...called, turn: 6 };

    expect(turnsSinceLastSiege(called)).toBe(4);
    expect(turnsSinceLastSiege(fought)).toBe(0);
  });

  /** And starts counting again from the siege, not from the start of play. */
  it('counts from the siege on the turns after it', () => {
    expect(turnsSinceLastSiege(community({ turn: 8, log: [rolled(5, true)] }))).toBe(2);
  });
});

/**
 * #98's acceptance: the Watchtower's whole purpose reaching the total.
 *
 * The slot card computed the `−best score` line correctly from the day it
 * shipped; nothing summed it. So staffing one **raised** Siege Threat by 1 —
 * the staffed-facility count charged for it and the reduction never arrived.
 */
describe('a staffed Watchtower', () => {
  const tower = (): Campaign =>
    community({
      turn: 5,
      base: {
        id: 'small-town-home',
        slots: { 'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } } },
      },
    });

  /** A Tier 4's Dexterity is 3; Long Guns at level 3 is a Score of 6. */
  const lookout = () => ({
    ...createSurvivor('Nell Haig', 4, { id: 'lookout' }),
    skills: { 'long-guns': 3 },
  });

  it('takes its lookout’s best Score off the threat', () => {
    const empty = tower();
    const watched = staffedWith(empty, 'front-yard', [lookout()]);

    expect(siegeThreatTerms(watched)['watched-from-above']).toBe(-6);
    // The tower is staffed now, so the facility count adds one — and the
    // reduction is what the facility is for.
    expect(siegeThreat(watched)).toBe(siegeThreat(empty) + 1 - 6);
  });

  it('takes nothing off while nobody is watching', () => {
    expect(siegeThreatTerms(tower())['watched-from-above']).toBe(0);
  });

  /** It can take the whole threat below zero, which the sum does not clamp. */
  it('can make a community safer than an empty one', () => {
    expect(siegeThreat(staffedWith(tower(), 'front-yard', [lookout()]))).toBeLessThan(0);
  });

  /**
   * "+0 watched" is what an empty tower gives and what a tower full of people
   * who cannot shoot gives, and only one of those is a mistake the player can
   * fix — a distinction `facilityProduction` has drawn since Z3-6 and nothing
   * asked for (#143).
   */
  describe('whose lookout has none of the four skills', () => {
    const useless = () => ({
      ...createSurvivor('Ruby Vance', 4, { id: 'ruby' }),
      skills: { rationing: 3 },
    });

    it('is named, so the player can see which tower to fix', () => {
      expect(towersWithoutTheSkill(staffedWith(tower(), 'front-yard', [useless()]))).toEqual([
        'front-yard',
      ]);
    });

    it('says nothing about a tower somebody can watch from', () => {
      expect(towersWithoutTheSkill(staffedWith(tower(), 'front-yard', [lookout()]))).toEqual([]);
    });

    it('says nothing about an empty tower, which is not a mistake', () => {
      expect(towersWithoutTheSkill(tower())).toEqual([]);
    });

    /** A staffed Kitchen has no watch to lack a skill for. */
    it('says nothing about a facility that does not watch', () => {
      const kitchen = community({
        turn: 5,
        base: { id: 'small-town-home', slots: {} },
      });

      expect(towersWithoutTheSkill(staffedWith(kitchen, 'kitchen', [useless()]))).toEqual([]);
    });

    it('says nothing for a campaign with no base', () => {
      expect(towersWithoutTheSkill(community())).toEqual([]);
    });
  });
});
