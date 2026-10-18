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
  baseOverrun,
  hordeCame,
  hordeChecked,
  hordeForced,
  siegeCounterChange,
  siegeCalledOn,
  siegeDue,
  siegeThreat,
  siegeThreatTerms,
  siegeTriggered,
  towersWithoutTheSkill,
  turnsSinceLastSiege,
  type CounterOutcome,
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

/** A Siege Defense's outcome, recorded in the Mission Phase of `turn`. */
const defended = (turn: number, zombiesLeft: number, survivorsExited = 0): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: { kind: 'siege-defense-resolved', zombiesLeft, survivorsExited },
});

/** A Thin the Herd's outcome, recorded in the Mission Phase of `turn`. */
const thinned = (
  turn: number,
  startingZombies: number,
  zombiesLeft: number,
  survivorsExited = 0,
  allIncapacitated = false,
): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: {
    kind: 'thin-the-herd-resolved',
    startingZombies,
    zombiesLeft,
    survivorsExited,
    allIncapacitated,
  },
});

const outcomeOf = (entry: LogEntry): CounterOutcome => entry.event as CounterOutcome;

describe('turnsSinceLastSiege', () => {
  it('counts from the first turn for a community with no outcome behind it', () => {
    expect(turnsSinceLastSiege(community({ turn: 1 }))).toBe(0);
    expect(turnsSinceLastSiege(community({ turn: 5 }))).toBe(4);
  });

  /**
   * The ruling, pinned (pp. 81, 86). The counter used to go back to 0 on the
   * turn a siege was fought; the book resets it on how a mission *ends*. A
   * siege called, and a siege played with nothing recorded, move nothing.
   */
  it('is not reset by a siege being called or fought', () => {
    // Called on turn 3, fought on turn 4.
    expect(turnsSinceLastSiege(called(3, 4))).toBe(3);
    expect(turnsSinceLastSiege(called(3, 7))).toBe(6);
  });

  it('goes back to 0 on a Siege Defense that left no zombie, and counts on from there', () => {
    const clean = (now: number) => community({ turn: now, log: [rolled(3, true), defended(4, 0)] });

    expect(turnsSinceLastSiege(clean(4))).toBe(0);
    expect(turnsSinceLastSiege(clean(7))).toBe(3);
  });

  /** No reset is stated for a siege fought with zombies still standing. */
  it('keeps counting through a Siege Defense that left zombies, overrun or not', () => {
    const held = community({ turn: 6, log: [rolled(3, true), defended(4, 2)] });
    const overrun = community({ turn: 6, log: [rolled(3, true), defended(4, 2, 1)] });

    expect(turnsSinceLastSiege(held)).toBe(5);
    expect(turnsSinceLastSiege(overrun)).toBe(5);
  });

  it('goes back to 0 on a Thin the Herd that left no zombie', () => {
    expect(turnsSinceLastSiege(community({ turn: 5, log: [thinned(5, 8, 0)] }))).toBe(0);
    expect(turnsSinceLastSiege(community({ turn: 6, log: [thinned(5, 8, 0)] }))).toBe(1);
  });

  /**
   * Seven turns since play began is 3½ halved, and the counter is whole turns.
   * Rounded down — the book does not say, and an odd count is the case that
   * tells floor from ceiling and from rounding.
   */
  it('is halved, rounding down, by a Thin the Herd that thinned it enough', () => {
    expect(turnsSinceLastSiege(community({ turn: 8, log: [thinned(8, 8, 3, 1)] }))).toBe(3);
    expect(turnsSinceLastSiege(community({ turn: 10, log: [thinned(8, 8, 3, 1)] }))).toBe(5);
  });

  it('is left alone by a Thin the Herd that did not', () => {
    // Exactly half left is not fewer than half.
    expect(turnsSinceLastSiege(community({ turn: 8, log: [thinned(8, 6, 3, 1)] }))).toBe(7);
    // Nobody got out over the edge.
    expect(turnsSinceLastSiege(community({ turn: 8, log: [thinned(8, 8, 3, 0)] }))).toBe(7);
  });

  /** Each outcome sees the count as it stood on its own turn. */
  it('folds every outcome in order', () => {
    const both = community({ turn: 11, log: [defended(4, 0), thinned(9, 8, 1, 2)] });

    // 0 on turn 4, 5 by turn 9 and halved to 2, then two more turns.
    expect(turnsSinceLastSiege(both)).toBe(4);
  });

  it('ignores a check, called or not', () => {
    expect(turnsSinceLastSiege(community({ turn: 5, log: [rolled(3, false)] }))).toBe(4);
  });
});

describe('siegeCounterChange', () => {
  it('resets on no zombie left, whichever mission', () => {
    expect(siegeCounterChange(outcomeOf(defended(4, 0, 2)))).toBe('reset');
    expect(siegeCounterChange(outcomeOf(thinned(4, 8, 0, 0, true)))).toBe('reset');
  });

  it('halves only a Thin the Herd with somebody out and fewer than half left', () => {
    expect(siegeCounterChange(outcomeOf(thinned(4, 3, 1, 1)))).toBe('halved');
    expect(siegeCounterChange(outcomeOf(thinned(4, 6, 3, 1)))).toBe('none');
    expect(siegeCounterChange(outcomeOf(thinned(4, 8, 1, 0)))).toBe('none');
  });

  /**
   * A Siege Defense has no halving, whatever else its entry carries. A save is
   * checked for the fields an entry must have, not for ones it must not, so a
   * hand-edited file can put a starting count on a siege — and it means
   * nothing there.
   */
  it('never halves a Siege Defense', () => {
    const stray = { ...outcomeOf(defended(4, 1, 1)), startingZombies: 8 } as CounterOutcome;

    expect(siegeCounterChange(stray)).toBe('none');
  });
});

describe('baseOverrun', () => {
  it('is a Siege Defense that left a zombie and got somebody out', () => {
    expect(baseOverrun(outcomeOf(defended(4, 2, 1)))).toBe(true);
  });

  it('needs both halves', () => {
    expect(baseOverrun(outcomeOf(defended(4, 0, 1)))).toBe(false);
    expect(baseOverrun(outcomeOf(defended(4, 2, 0)))).toBe(false);
  });

  it('is never a Thin the Herd', () => {
    expect(baseOverrun(outcomeOf(thinned(4, 8, 2, 1)))).toBe(false);
  });
});

describe('hordeForced', () => {
  it('is false for a community that has thinned nothing', () => {
    expect(hordeForced(community())).toBe(false);
  });

  it('is true after a Thin the Herd that put everybody down', () => {
    expect(hordeForced(community({ log: [rolled(2, false), thinned(3, 8, 6, 0, true)] }))).toBe(
      true,
    );
  });

  it('is false after one that did not', () => {
    expect(hordeForced(community({ log: [thinned(3, 8, 6, 0, false)] }))).toBe(false);
  });

  /** "The next time it is made" — once made, it is spent. */
  it('is spent by the next roll', () => {
    expect(hordeForced(community({ log: [thinned(3, 8, 6, 0, true), rolled(3, true)] }))).toBe(
      false,
    );
  });

  /** As with `siegeCounterChange`: a field means nothing on the wrong kind. */
  it('reads the flag on a Thin the Herd only', () => {
    const stray: LogEntry = {
      ...defended(3, 2),
      event: { ...outcomeOf(defended(3, 2)), allIncapacitated: true } as CounterOutcome,
    };

    expect(hordeForced(community({ log: [stray] }))).toBe(false);
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

  /** Each zombie held in Containment adds 1 a turn (pg. 69; R103; Z7-6). */
  it('adds 1 for each zombie held in Containment', () => {
    expect(siegeThreatTerms(community())['held-zombies']).toBe(0);
    expect(siegeThreatTerms(community({ heldZombies: 3 }))['held-zombies']).toBe(3);
    expect(siegeThreat(community({ heldZombies: 3 }))).toBe(siegeThreat(community()) + 3);
  });

  it('has an entry for every term there is', () => {
    expect(Object.keys(siegeThreatTerms(community())).sort()).toEqual([
      'base-features',
      'held-zombies',
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
  /**
   * Only a horde check calls a siege. A save is checked for the fields an
   * entry must have and not for ones it must not, so a hand-edited file can
   * put a `siege` flag on anything — and it means nothing there.
   */
  it('reads the flag on a horde check only', () => {
    const stray: LogEntry = {
      ...defended(3, 2),
      event: { ...outcomeOf(defended(3, 2)), siege: true } as unknown as CounterOutcome,
    };

    expect(siegeDue(community({ turn: 4, log: [stray] }))).toBe(false);
  });

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

/** The Threat a siege is sized from (pg. 85; #198). */
describe('siegeCalledOn', () => {
  const at = (turn: number, threat: number, siege: boolean): LogEntry => ({
    ...rolled(turn, siege),
    event: { kind: 'horde-checked', roll: 5, threat, siege },
  });

  it('is the Threat on the check that called this turn’s siege', () => {
    expect(siegeCalledOn(community({ turn: 4, log: [at(2, 9, true), at(3, 7, true)] }))).toBe(7);
    // Past whatever else the turn wrote before its check.
    const before: LogEntry = { ...rolled(3, false), event: { kind: 'phase-entered' } };
    expect(siegeCalledOn(community({ turn: 4, log: [before, at(3, 7, true)] }))).toBe(7);
  });

  it('is nothing on the turn of the check, the turn after next, or when none was called', () => {
    expect(siegeCalledOn(community({ turn: 3, log: [at(3, 7, true)] }))).toBeNull();
    expect(siegeCalledOn(community({ turn: 5, log: [at(3, 7, true)] }))).toBeNull();
    expect(siegeCalledOn(community({ turn: 4, log: [at(3, 7, false)] }))).toBeNull();
  });

  it('agrees with siegeDue', () => {
    for (const campaign of [called(3), called(3, 4), called(3, 5)]) {
      expect(siegeCalledOn(campaign) !== null).toBe(siegeDue(campaign));
    }
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

  /**
   * And it resets where the book puts the reset — on the siege's outcome, in
   * the next turn's Mission Phase (pg. 86) — not on the call, and not on the
   * siege merely being played.
   */
  it('resets on the turn the siege ends clean, and only then', () => {
    const called = community({ turn: 5, log: [rolled(5, true)] });
    const fought: Campaign = { ...called, turn: 6 };
    const clean: Campaign = { ...fought, log: [...fought.log, defended(6, 0)] };

    expect(turnsSinceLastSiege(called)).toBe(4);
    expect(turnsSinceLastSiege(fought)).toBe(5);
    expect(turnsSinceLastSiege(clean)).toBe(0);
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

  /**
   * A Tier 4's Dexterity is 3; Long Guns at level 3 is 6, and the shoddy gun she
   * holds when she carries no better takes 1 off: a Score of 5 (pg. 14).
   */
  const lookout = () => ({
    ...createSurvivor('Nell Haig', 4, { id: 'lookout' }),
    skills: { 'long-guns': 3 },
  });

  it('takes its lookout’s best Score off the threat', () => {
    const empty = tower();
    const watched = staffedWith(empty, 'front-yard', [lookout()]);

    // Dexterity 3 plus Long Guns 3, less 1 for the shoddy gun she holds free (pg. 14).
    expect(siegeThreatTerms(watched)['watched-from-above']).toBe(-5);
    // The tower is staffed now, so the facility count adds one — and the
    // reduction is what the facility is for.
    expect(siegeThreat(watched)).toBe(siegeThreat(empty) + 1 - 5);
  });

  it('takes nothing off while nobody is watching', () => {
    expect(siegeThreatTerms(tower())['watched-from-above']).toBe(0);
  });

  /** It can take the whole threat below zero, which the sum does not clamp. */
  it('can make a community safer than an empty one', () => {
    // With a quality rifle the Score is 7 (pg. 8; Z5-3).
    const armed = {
      ...lookout(),
      items: [{ id: 'rifle', item: 'rifle', grade: 'quality' } as const],
    };

    expect(siegeThreat(staffedWith(tower(), 'front-yard', [armed]))).toBeLessThan(0);
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
