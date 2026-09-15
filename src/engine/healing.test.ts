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
  beingHealed,
  checkHealing,
  goingSpare,
  healingPool,
  healthAwards,
  resting,
  room,
  sharedEqually,
  withWoundsHealed,
  woundsHealed,
} from './healing';
import type { LogEntry } from './log';
import { staffedWith } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-11T09:00:00.000Z';

/** A survivor at a given Health. A Hero by default, so their maximum is 4 (pg. 7). */
function wounded(id: string, name: string, currentHp: number, tier: 1 | 2 | 3 | 4 = 4): Survivor {
  return { ...createSurvivor(name, tier, { id }), currentHp };
}

function community(
  survivors: readonly Survivor[] = [],
  assignments: Record<string, Assignment> = {},
  base: Base | null = null,
): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, survivors, assignments, base };
}

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

const shares = (awards: readonly { survivor: Survivor; health: number }[]) =>
  Object.fromEntries(awards.map((award) => [award.survivor.id, award.health]));

describe('room', () => {
  it('is the gap between where a survivor is and their Tier’s maximum', () => {
    // A Hero's maximum is 4 (pg. 7).
    expect(room(wounded('a', 'Earl', 1))).toBe(3);
    expect(room(wounded('a', 'Earl', 4))).toBe(0);
  });

  /**
   * Health is typed in and Z1-7's override lets a roster break the rules on
   * purpose, so a survivor above their maximum is a state the app can hold.
   * "Minus two rooms" is not a number any distribution should reason about.
   */
  it('is nothing at all for a survivor above their maximum, never a negative', () => {
    expect(room(wounded('a', 'Earl', 9))).toBe(0);
  });
});

describe('sharedEqually', () => {
  it('gives everybody a first point before anybody gets a second', () => {
    const three = [wounded('a', 'A', 0), wounded('b', 'B', 0), wounded('c', 'C', 0)];

    expect(shares(sharedEqually(three, 4))).toEqual({ a: 2, b: 1, c: 1 });
  });

  it('shares a pool that divides evenly, evenly', () => {
    const two = [wounded('a', 'A', 0), wounded('b', 'B', 0)];

    expect(shares(sharedEqually(two, 4))).toEqual({ a: 2, b: 2 });
  });

  /**
   * The reason this is an algorithm rather than a division. Four points across
   * a survivor who needs one and a survivor who needs three is 1 and 3, not
   * 2 and 2 — and a division would have overhealed the first by one and left
   * the second a point short.
   */
  it('leaves a survivor who fills up and gives the rest to the others', () => {
    const pair = [wounded('nearly', 'Nearly Well', 3), wounded('badly', 'Badly Hurt', 1)];

    expect(shares(sharedEqually(pair, 4))).toEqual({ nearly: 1, badly: 3 });
  });

  it('leaves the surplus unspent rather than overhealing', () => {
    const one = [wounded('a', 'A', 3)];

    expect(shares(sharedEqually(one, 10))).toEqual({ a: 1 });
  });

  it('says nothing about a survivor who gets nothing', () => {
    const pair = [wounded('full', 'Full', 4), wounded('hurt', 'Hurt', 3)];

    expect(sharedEqually(pair, 1).map((award) => award.survivor.id)).toEqual(['hurt']);
  });

  it('hands out nothing from an empty pool, or to nobody', () => {
    expect(sharedEqually([wounded('a', 'A', 0)], 0)).toEqual([]);
    expect(sharedEqually([], 5)).toEqual([]);
  });

  it('marks every share as coming from the facility pool', () => {
    expect(sharedEqually([wounded('a', 'A', 0)], 1)[0]?.source).toBe('facility');
  });
});

describe('healingPool', () => {
  const clinic = (): Base => ({
    id: 'small-town-home',
    slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
  });

  it('is nothing without a base', () => {
    expect(healingPool(community())).toBe(0);
  });

  it('is nothing from a Clinic with nobody in it', () => {
    expect(healingPool(community([], {}, clinic()))).toBe(0);
  });

  it('is the staff’s Medicine Score, halved for want of Water', () => {
    const medic = {
      ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
      skills: { medicine: 0 },
    };

    // Halved rounds up (pg. 72): a Score of 3 without Water is 2.
    expect(healingPool(staffedWith(community([], {}, clinic()), 'garage', [medic]))).toBe(2);
  });

  it('counts only Health, and not the other things a base produces', () => {
    // A Garden makes a Food and nothing else (pg. 55). A pool that summed
    // every production line would call that a point of Health.
    const garden: Base = {
      id: 'small-town-home',
      slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } },
    };

    expect(healingPool(community([], {}, garden))).toBe(0);
  });

  it('counts a flat Health line from an upgrade with nobody staffing anything', () => {
    // A Herb Plot on a Garden makes a Health and eats a Food (pg. 71).
    const herbs: Base = {
      id: 'small-town-home',
      slots: {
        'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: ['herb-plot'] },
      },
    };

    expect(healingPool(community([], {}, herbs))).toBe(1);
  });
});

describe('healthAwards', () => {
  const withClinic = (score: number) => {
    const medic = {
      ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
      skills: { medicine: 0 },
      // Water, so the Score is not halved — the pool's size is the point here.
    };

    return staffedWith(
      community(
        [],
        {},
        {
          id: 'small-town-home',
          slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, water: true } },
        },
      ),
      'garage',
      [medic],
    );
  };

  it('gives a resting survivor one point of their own', () => {
    const campaign = community([wounded('a', 'A', 1)], { a: { task: 'rest' } });

    expect(healthAwards(campaign)).toEqual([
      { survivor: campaign.survivors[0], health: 1, source: 'rest' },
    ]);
  });

  /**
   * A resting survivor's point never joins the shared pool (pg. 21), which is
   * why this is two lists rather than one distribution over everybody.
   */
  it('keeps the resting point out of the shared pool', () => {
    const base = withClinic(2);
    const campaign: Campaign = {
      ...base,
      survivors: [
        ...base.survivors,
        wounded('rester', 'Rester', 0),
        wounded('healed', 'Healed', 0),
      ],
      assignments: {
        ...base.assignments,
        rester: { task: 'rest' },
        healed: { task: 'healing' },
      },
    };

    // Two in the pool, and all of it goes to the one being healed; the rester
    // gets their own one on top.
    expect(
      healthAwards(campaign).map((award) => [award.survivor.id, award.health, award.source]),
    ).toEqual([
      ['healed', 2, 'facility'],
      ['rester', 1, 'rest'],
    ]);
  });

  it('says nothing about a resting survivor with nothing to heal', () => {
    const campaign = community([wounded('a', 'A', 4)], { a: { task: 'rest' } });

    expect(healthAwards(campaign)).toEqual([]);
  });

  it('ignores everybody the Planning Phase put on something else', () => {
    const base = withClinic(4);
    const campaign: Campaign = {
      ...base,
      survivors: [...base.survivors, wounded('worker', 'Worker', 0)],
      assignments: { ...base.assignments, worker: { task: 'project' } },
    };

    expect(healthAwards(campaign)).toEqual([]);
  });
});

describe('beingHealed and resting', () => {
  const campaign = community([wounded('a', 'A', 1), wounded('b', 'B', 1), wounded('c', 'C', 1)], {
    a: { task: 'healing' },
    b: { task: 'rest' },
    c: { task: 'project' },
  });

  it('each answer only their own task', () => {
    expect(beingHealed(campaign).map((survivor) => survivor.id)).toEqual(['a']);
    expect(resting(campaign).map((survivor) => survivor.id)).toEqual(['b']);
  });
});

describe('goingSpare and checkHealing', () => {
  const herbs = (): Base => ({
    id: 'small-town-home',
    slots: {
      'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: ['herb-plot'] },
    },
  });

  it('is nothing when the wounded can take the whole pool', () => {
    const campaign = community([wounded('a', 'A', 0)], { a: { task: 'healing' } }, herbs());

    expect(goingSpare(campaign)).toBe(0);
    expect(checkHealing(campaign).warnings).toEqual([]);
  });

  /**
   * Only one survivor may rest a turn (pg. 21). The Planning Phase warns rather
   * than refuses, which is a deliberate ruling — but this step then paid both
   * points out in silence, a phase and four steps later, where nobody was
   * looking at that warning any more.
   */
  it('says when more than one survivor is resting, where the points are paid', () => {
    const campaign = community([wounded('a', 'A', 0), wounded('b', 'B', 0)], {
      a: { task: 'rest' },
      b: { task: 'rest' },
    });
    const check = checkHealing(campaign);

    expect(codes(check.warnings)).toEqual(['more-than-one-resting']);
    expect(check.blockers).toEqual([]);
    // Still paid: the rule is warned about, not enforced, and both awards stand.
    expect(healthAwards(campaign).map((award) => award.survivor.id)).toEqual(['a', 'b']);
  });

  it('says nothing about a single rester', () => {
    const campaign = community([wounded('a', 'A', 0)], { a: { task: 'rest' } });

    expect(checkHealing(campaign).warnings).toEqual([]);
  });

  it('reports Health nobody can take, and never blocks', () => {
    const campaign = community([wounded('a', 'A', 4)], { a: { task: 'healing' } }, herbs());
    const check = checkHealing(campaign);

    expect(goingSpare(campaign)).toBe(1);
    expect(codes(check.warnings)).toEqual(['health-going-spare']);
    expect(check.blockers).toEqual([]);
  });

  /**
   * A different sentence, because it is a different mistake: a pool nobody was
   * assigned to is a Planning Phase the player can still go back and fix.
   */
  it('says so differently when nobody was assigned to healing at all', () => {
    const campaign = community([wounded('a', 'A', 0)], {}, herbs());
    const check = checkHealing(campaign);

    expect(codes(check.warnings)).toEqual(['nothing-to-share']);
    expect(check.warnings[0]?.message).toContain('nobody assigned');
  });

  it('says nothing when there is no pool and nobody waiting for one', () => {
    // Both halves of the warning's condition are false here. A check that
    // asked only "is anybody assigned to healing" would announce that nothing
    // is going spare out of a pool that does not exist.
    expect(checkHealing(community([wounded('a', 'A', 0)]))).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  it('says nothing at all when there is no pool', () => {
    expect(
      checkHealing(community([wounded('a', 'A', 0)], { a: { task: 'healing' } })).warnings,
    ).toEqual([]);
  });
});

describe('woundsHealed', () => {
  const healed = (turn: number): LogEntry => ({
    turn,
    phase: 'advancement',
    at: AT,
    event: { kind: 'health-restored', survivor: 'a', name: 'A', health: 1, source: 'facility' },
  });

  const withLog = (log: readonly LogEntry[]): Campaign => ({ ...community(), log });

  it('is false before the step has run', () => {
    expect(woundsHealed(withLog([]))).toBe(false);
  });

  it('is true once this turn has an entry', () => {
    expect(woundsHealed(withLog([healed(3)]))).toBe(true);
  });

  it('ignores the same entry from another turn', () => {
    expect(woundsHealed(withLog([healed(2)]))).toBe(false);
  });

  it('ignores other events from this turn', () => {
    expect(
      woundsHealed(
        withLog([{ turn: 3, phase: 'advancement', at: AT, event: { kind: 'turn-began' } }]),
      ),
    ).toBe(false);
  });
});

describe('withWoundsHealed', () => {
  const pair = () => community([wounded('a', 'A', 1), wounded('b', 'B', 2)]);

  it('raises the Health of the survivors named and nobody else', () => {
    const before = pair();
    const after = withWoundsHealed(before, [
      { survivor: before.survivors[0] as Survivor, health: 2, source: 'facility' },
    ]);

    expect(after.survivors.map((survivor) => survivor.currentHp)).toEqual([3, 2]);
  });

  /**
   * A survivor can be on both lists — resting and being healed is a state Z3-6
   * warns about rather than refuses — and both points have to land.
   */
  it('adds up two awards to the same survivor', () => {
    const both = pair();
    const earl = both.survivors[0] as Survivor;
    const after = withWoundsHealed(both, [
      { survivor: earl, health: 1, source: 'facility' },
      { survivor: earl, health: 1, source: 'rest' },
    ]);

    expect(after.survivors[0]?.currentHp).toBe(3);
  });

  it('leaves everything else about the campaign alone', () => {
    const before = pair();
    const after = withWoundsHealed(before, []);

    expect(after).toEqual(before);
  });
});
