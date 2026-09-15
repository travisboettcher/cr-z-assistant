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
  awardedThisTurn,
  checkXpAward,
  missionTeaching,
  trainingRoomXp,
  withXpAwarded,
  xpPool,
  xpPools,
} from './experience';
import type { LogEntry } from './log';
import { XP_SOURCES, type XpSource } from '../data/turn';
import { staffedWith } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-11T09:00:00.000Z';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A survivor with a Skill Score of exactly `score` in one skill.
 *
 * A Score is the governing stat plus the level (pg. 8), and every skill here is
 * governed by Cooperation — so the stat carries the number and the level stays
 * at zero.
 */
function scored(id: string, name: string, skill: 'teaching', score: number): Survivor {
  return {
    ...createSurvivor(name, 4, { id }),
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
    skills: { [skill]: 0 },
  };
}

function community(
  assignments: Record<string, Assignment> = {},
  survivors: readonly Survivor[] = [
    createSurvivor('Earl Rhodes', 4, { id: EARL }),
    createSurvivor('Carla Proust', 3, { id: CARLA }),
  ],
  base: Base | null = null,
): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors, assignments, base };
}

function awarded(source: XpSource, survivor: string, turn = 3, amount = 1): LogEntry {
  return {
    turn,
    phase: 'advancement',
    at: AT,
    event: { kind: 'xp-awarded', survivor, name: 'Somebody', amount, source },
  };
}

const withLog = (campaign: Campaign, log: readonly LogEntry[]): Campaign => ({ ...campaign, log });

const onTheMission: Assignment = { task: 'mission', team: 1 };

describe('missionTeaching', () => {
  it('sums Teaching across the mission team', () => {
    const campaign = community({ earl: onTheMission, carla: onTheMission }, [
      scored(EARL, 'Earl Rhodes', 'teaching', 2),
      scored(CARLA, 'Carla Proust', 'teaching', 3),
    ]);

    expect(missionTeaching(campaign)).toBe(5);
  });

  it('ignores a Teacher who stayed at the base', () => {
    const campaign = community({ earl: onTheMission, carla: { task: 'project' } }, [
      scored(EARL, 'Earl Rhodes', 'teaching', 2),
      scored(CARLA, 'Carla Proust', 'teaching', 3),
    ]);

    expect(missionTeaching(campaign)).toBe(2);
  });

  it('is nothing when nobody on the team has the skill', () => {
    expect(missionTeaching(community({ earl: onTheMission }))).toBe(0);
  });
});

describe('trainingRoomXp', () => {
  const farm = (): Base => ({ id: 'hobby-farm', slots: {} });

  const withTrainingRoom = (): Base => ({
    id: 'hobby-farm',
    slots: { 'front-yard': { built: { facility: 'training-room', builtOnTurn: 1 } } },
  });

  it('is nothing without a base', () => {
    expect(trainingRoomXp(community())).toBe(0);
  });

  it('is nothing from a Training Room with nobody in it', () => {
    expect(trainingRoomXp(community({}, undefined, withTrainingRoom()))).toBe(0);
  });

  it('is the staff’s Teaching Score, halved for want of Power', () => {
    const teacher = scored('teacher', 'Nell Haig', 'teaching', 3);
    const campaign = staffedWith(community({}, [], withTrainingRoom()), 'front-yard', [teacher]);

    // Halved rounds up (pg. 72): a Score of 3 without Power is 2.
    expect(trainingRoomXp(campaign)).toBe(2);
  });

  /**
   * A Training Room's upgrades make XP that can only be spent on skills
   * governed by one stat (pg. 73), and a survivor's `xp` is a single number
   * with no stat on it. Counting those lines here would launder restricted XP
   * into unrestricted XP, which is more generous than the book.
   */
  it('leaves out XP restricted to a stat, which this app cannot yet hold', () => {
    const base: Base = {
      id: 'hobby-farm',
      slots: {
        'front-yard': {
          built: { facility: 'training-room', builtOnTurn: 1 },
          upgrades: ['weight-room'],
        },
      },
    };

    expect(trainingRoomXp(community({}, [], base))).toBe(0);
  });

  it('is nothing from a base with no Training Room at all', () => {
    expect(trainingRoomXp(community({}, undefined, farm()))).toBe(0);
  });
});

describe('awardedThisTurn', () => {
  const log = [
    awarded('mission', EARL),
    awarded('mission', CARLA),
    awarded('mission-teaching', EARL),
    awarded('mission', EARL, 2),
  ];

  it('counts everything this turn when asked for nothing in particular', () => {
    expect(awardedThisTurn(withLog(community(), log))).toBe(3);
  });

  it('narrows to one source', () => {
    expect(awardedThisTurn(withLog(community(), log), 'mission')).toBe(2);
  });

  it('narrows to one survivor within one source', () => {
    expect(awardedThisTurn(withLog(community(), log), 'mission', EARL)).toBe(1);
    expect(awardedThisTurn(withLog(community(), log), 'mission-teaching', EARL)).toBe(1);
  });

  it('counts the amount rather than the entry', () => {
    expect(awardedThisTurn(withLog(community(), [awarded('mission', EARL, 3, 2)]), 'mission')).toBe(
      2,
    );
  });

  it('ignores other kinds of event entirely', () => {
    const other: LogEntry = {
      turn: 3,
      phase: 'advancement',
      at: AT,
      event: { kind: 'turn-began' },
    };

    expect(awardedThisTurn(withLog(community(), [other]))).toBe(0);
  });
});

describe('xpPools', () => {
  it('returns all four, in the order the book awards them', () => {
    expect(xpPools(community()).map((pool) => pool.source)).toEqual([...XP_SOURCES]);
  });

  it('carries the page each source’s rule is printed on', () => {
    expect(
      Object.fromEntries(xpPools(community()).map((pool) => [pool.source, pool.pages])),
    ).toEqual({
      mission: 18,
      discretionary: 18,
      'mission-teaching': 12,
      'training-room': 70,
    });
  });

  it('gives the mission team one XP each', () => {
    const pool = xpPool(community({ earl: onTheMission }), 'mission');

    expect(pool.total).toBe(1);
    expect(pool.eligible.map((survivor) => survivor.id)).toEqual([EARL]);
    expect(pool.capPerSurvivor).toBe(1);
  });

  it('gives a community that went nowhere no mission XP at all', () => {
    expect(xpPool(community(), 'mission').total).toBe(0);
  });

  /**
   * pg. 12. The point is *replaced*, not topped up — so the discretionary pool
   * is one only while nobody who went out can teach, and the moment somebody
   * can it is zero and the Teacher's pool holds the XP instead.
   */
  it('takes the discretionary point away when a Teacher was on the mission', () => {
    const withTeacher = community({ earl: onTheMission }, [
      scored(EARL, 'Earl Rhodes', 'teaching', 2),
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ]);

    expect(xpPool(withTeacher, 'discretionary').total).toBe(0);
    expect(xpPool(withTeacher, 'mission-teaching').total).toBe(2);

    const withoutTeacher = community({ earl: onTheMission });

    expect(xpPool(withoutTeacher, 'discretionary').total).toBe(1);
    expect(xpPool(withoutTeacher, 'mission-teaching').total).toBe(0);
  });

  it('lets a Teacher teach anybody, and caps each of them at two', () => {
    const campaign = community({ earl: onTheMission }, [
      scored(EARL, 'Earl Rhodes', 'teaching', 4),
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ]);
    const pool = xpPool(campaign, 'mission-teaching');

    expect(pool.eligible.map((survivor) => survivor.id)).toEqual([EARL, CARLA]);
    expect(pool.capPerSurvivor).toBe(2);
  });

  /** pg. 70: a Training Room teaches the survivors who stayed behind. */
  it('offers the Training Room only to survivors who were not on the mission', () => {
    const pool = xpPool(community({ earl: onTheMission }), 'training-room');

    expect(pool.eligible.map((survivor) => survivor.id)).toEqual([CARLA]);
    expect(pool.capPerSurvivor).toBe(2);
  });

  it('reads what has been handed out off this turn’s log', () => {
    const campaign = withLog(community({ earl: onTheMission, carla: onTheMission }), [
      awarded('mission', EARL),
      awarded('mission', CARLA, 2),
    ]);

    expect(xpPool(campaign, 'mission').awarded).toBe(1);
  });
});

describe('checkXpAward', () => {
  const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

  /**
   * The opposite posture to `planning.ts`, on purpose: a pool with nothing in
   * it is the app having nothing to give, not a rule a table may play past.
   */
  it('warns about nothing, ever — everything here is a blocker', () => {
    const check = checkXpAward(community(), CARLA, 'mission');

    expect(check.warnings).toEqual([]);
    expect(check.blockers.length).toBeGreaterThan(0);
  });

  it('lets a survivor take the point that is there for them', () => {
    expect(checkXpAward(community({ earl: onTheMission }), EARL, 'mission')).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  /**
   * The sentence and the page as well as the code, because the two blockers
   * that can fire for different sources say different things — and a check
   * that only compared codes would agree with every one of them.
   */
  it('blocks a survivor who did not go from the mission’s XP, and says why', () => {
    const [refusal] = checkXpAward(community({ earl: onTheMission }), CARLA, 'mission').blockers;

    expect(refusal?.code).toBe('not-eligible');
    expect(refusal?.message).toBe('Only survivors who went on the mission earn its XP.');
    expect(refusal?.pages).toBe(18);
  });

  it('blocks a survivor who did go from the Training Room’s, and says why', () => {
    const [refusal] = checkXpAward(
      community({ earl: onTheMission }),
      EARL,
      'training-room',
    ).blockers;

    expect(refusal?.code).toBe('not-eligible');
    expect(refusal?.message).toBe('A Training Room teaches the survivors who stayed behind.');
    expect(refusal?.pages).toBe(70);
  });

  it('blocks once the pool is spent', () => {
    const campaign = withLog(community({ earl: onTheMission }), [awarded('mission', EARL)]);

    expect(codes(checkXpAward(campaign, EARL, 'mission').blockers)).toContain(
      'nothing-left-in-the-pool',
    );
  });

  /**
   * The Teaching cap is per survivor, so a pool with plenty left in it still
   * refuses a third point to the same person (pg. 12).
   */
  it('blocks a survivor at the cap while the pool still holds XP', () => {
    const campaign = withLog(
      community({ earl: onTheMission }, [
        scored(EARL, 'Earl Rhodes', 'teaching', 4),
        createSurvivor('Carla Proust', 3, { id: CARLA }),
      ]),
      [awarded('mission-teaching', CARLA), awarded('mission-teaching', CARLA)],
    );

    expect(xpPool(campaign, 'mission-teaching').awarded).toBe(2);

    const [refusal] = checkXpAward(campaign, CARLA, 'mission-teaching').blockers;

    expect(refusal?.code).toBe('at-the-cap');
    expect(refusal?.message).toContain('2 XP');
    // The Teacher's cap is pg. 12; the Training Room's identical 2 is pg. 70,
    // and the two are separate rules that must not cite each other's page.
    expect(refusal?.pages).toBe(12);

    // The pool is not the problem: somebody else may still take from it.
    expect(checkXpAward(campaign, EARL, 'mission-teaching').blockers).toEqual([]);
  });

  it('does not count another source against the cap', () => {
    const campaign = withLog(community({ earl: onTheMission }), [
      awarded('mission', EARL),
      awarded('discretionary', EARL),
    ]);

    // Two XP to Earl this turn, and neither came from the Training Room.
    const [refusal] = checkXpAward(campaign, CARLA, 'training-room').blockers;

    expect(refusal?.code).toBe('nothing-left-in-the-pool');
    expect(refusal?.pages).toBe(70);
  });

  it('cites the Training Room’s own page when a survivor hits its cap', () => {
    const teaching = staffedWith(
      community({}, [createSurvivor('Carla Proust', 3, { id: CARLA })], {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'training-room', builtOnTurn: 1 } } },
      }),
      'front-yard',
      [scored('teacher', 'Nell Haig', 'teaching', 8)],
    );
    const campaign = withLog(teaching, [
      awarded('training-room', CARLA),
      awarded('training-room', CARLA),
    ]);

    const [refusal] = checkXpAward(campaign, CARLA, 'training-room').blockers;

    expect(refusal?.code).toBe('at-the-cap');
    expect(refusal?.pages).toBe(70);
  });

  it('reports every reason at once', () => {
    // Carla did not go, and there is no mission XP to take either way.
    expect(codes(checkXpAward(community(), CARLA, 'mission').blockers)).toEqual([
      'not-eligible',
      'nothing-left-in-the-pool',
    ]);
  });
});

describe('withXpAwarded', () => {
  const earl = () => createSurvivor('Earl Rhodes', 4, { id: EARL });

  it('adds to what they already had rather than replacing it', () => {
    expect(withXpAwarded({ ...earl(), xp: 7 }, 2).xp).toBe(9);
  });

  it('starts from nothing for a survivor who has spent everything', () => {
    expect(withXpAwarded(earl(), 1).xp).toBe(1);
  });

  it('changes nothing else about them', () => {
    const before = { ...earl(), xp: 7 };

    expect({ ...withXpAwarded(before, 2), xp: before.xp }).toEqual(before);
  });
});

/**
 * Playtest finding M5: an empty pool said the wrong *why*, twice, and both
 * times the roster on the same screen contradicted it.
 *
 * The reason is keyed on the reason now rather than on the source, which is the
 * whole of the fix — one sentence per source had to cover every way a pool
 * could come out at zero.
 */
describe('why a pool is empty', () => {
  const reason = (campaign: Campaign, source: XpSource) => xpPool(campaign, source).emptyBecause;

  /** A survivor with nothing that teaches, on the mission team. */
  const went = (survivors: readonly Survivor[]): Campaign =>
    community(
      Object.fromEntries(survivors.map((survivor) => [survivor.id, onTheMission])),
      survivors,
    );

  it('is nothing at all for a pool with something in it', () => {
    const team = went([createSurvivor('Earl Rhodes', 4, { id: EARL })]);

    expect(xpPool(team, 'mission').total).toBeGreaterThan(0);
    expect(reason(team, 'mission')).toBeUndefined();
  });

  it('says nobody went when there is no mission team', () => {
    expect(reason(community(), 'mission')).toBe('nobody-went');
  });

  /**
   * The first wrong message. A Rookie with Teaching at level 0 and Cooperation
   * 0 has a Score of 0, so a Teacher on the team read as no Teacher — and the
   * screen said nobody on the team had Teaching while somebody did.
   */
  it('tells a Teacher with no Score from no Teacher at all', () => {
    const scoreless: Survivor = {
      ...createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 0 },
      skills: { teaching: 0 },
    };

    expect(reason(went([scoreless]), 'mission-teaching')).toBe('score-is-nothing');
    expect(reason(went([createSurvivor('Earl Rhodes', 4, { id: EARL })]), 'mission-teaching')).toBe(
      'nobody-qualifies',
    );
  });

  /**
   * The second. A Training Room staffed by somebody whose only skill is
   * Rationing produces no XP and is not "no staffed Training Room".
   */
  it('tells an unstaffed Training Room from a wrongly staffed one', () => {
    const room: Base = {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'training-room', builtOnTurn: 1 } } },
    };
    const empty = community({}, [createSurvivor('Earl Rhodes', 4, { id: EARL })], room);

    expect(reason(empty, 'training-room')).toBe('nowhere-to-teach');

    const wrong = staffedWith(empty, 'garage', [
      { ...createSurvivor('Nell Haig', 4, { id: 'nell' }), skills: { rationing: 0 } },
    ]);

    expect(reason(wrong, 'training-room')).toBe('wrong-person');
  });
});
