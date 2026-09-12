import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { createSurvivor } from './survivor';
import {
  exhaustion,
  foodRequired,
  hunger,
  hungerIfFedNow,
  hungerPenalty,
  penaltyFor,
  survivorsFed,
  withSurvivorsFed,
} from './feeding';
import type { LogEntry } from './log';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

/** A community of `count` survivors, all of one Tier. */
function community(
  count: number,
  tier: 1 | 2 | 3 | 4,
  food = 0,
  base: Base | null = null,
): Campaign {
  const survivors: Survivor[] = Array.from({ length: count }, (_, at) =>
    createSurvivor(`Survivor ${String(at)}`, tier, { id: `survivor-${String(at)}` }),
  );

  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    survivors,
    materials: { food, fuel: 0, hardware: 0, rare: 0 },
    base,
  };
}

const fed = (turn: number, required: number, short: number): LogEntry => ({
  turn,
  phase: 'management',
  at: AT,
  event: { kind: 'survivors-fed', required, hunger: short },
});

const withLog = (campaign: Campaign, log: readonly LogEntry[]): Campaign => ({ ...campaign, log });

describe('foodRequired', () => {
  /** Tiers 1 and 2 eat one, Tiers 3 and 4 eat two (pg. 22). */
  it('counts what each Tier eats, not how many survivors there are', () => {
    expect(foodRequired(community(5, 1))).toBe(5);
    expect(foodRequired(community(5, 2))).toBe(5);
    expect(foodRequired(community(5, 3))).toBe(10);
    expect(foodRequired(community(5, 4))).toBe(10);
  });

  it('is nothing for a community with nobody in it', () => {
    expect(foodRequired(community(0, 1))).toBe(0);
  });
});

describe('hungerIfFedNow', () => {
  it('is the shortfall between what is needed and what is stored', () => {
    expect(hungerIfFedNow(community(5, 4, 4))).toBe(6);
  });

  it('is nothing when there is enough, and never negative', () => {
    expect(hungerIfFedNow(community(5, 4, 10))).toBe(0);
    expect(hungerIfFedNow(community(5, 4, 99))).toBe(0);
  });
});

describe('hunger', () => {
  it('is nothing for a community that has never eaten', () => {
    expect(hunger(community(5, 4, 0))).toBe(0);
  });

  it('is what the last Feed step recorded, not what the stores say now', () => {
    // Empty stores and ten required, but the community went only four short
    // when it actually ate. A live subtraction would say ten.
    expect(hunger(withLog(community(5, 4, 0), [fed(3, 10, 4)]))).toBe(4);
  });

  /**
   * The penalty lasts "until the next Management Phase" (pg. 22), which is
   * three phases of the following turn — so `hunger` reads the most recent
   * entry rather than this turn's.
   */
  it('carries last turn’s shortfall into this turn, until this turn eats', () => {
    const carried = withLog(community(5, 4, 0), [fed(2, 10, 6)]);

    expect(hunger(carried)).toBe(6);
    expect(hunger(withLog(carried, [fed(2, 10, 6), fed(3, 10, 1)]))).toBe(1);
  });

  it('ignores other events entirely', () => {
    const other: LogEntry = { turn: 3, phase: 'management', at: AT, event: { kind: 'turn-began' } };

    expect(hunger(withLog(community(5, 4), [other]))).toBe(0);
  });
});

describe('the hunger penalty', () => {
  /**
   * Ruling 1: a starvation threshold, not a tax. The community absorbs a
   * shortfall up to its head count and every point past that costs a stat.
   */
  it('fires only once the shortfall passes the head count', () => {
    expect(penaltyFor(5, 5)).toBe(0);
    expect(penaltyFor(6, 5)).toBe(1);
    expect(penaltyFor(10, 5)).toBe(5);
  });

  it('is never negative, however well fed the community is', () => {
    expect(penaltyFor(0, 5)).toBe(0);
  });

  /**
   * The striking consequence, recorded as a claim rather than left to be
   * rediscovered: a Tier 1–2 community cannot reach the threshold at all,
   * because it eats one each and Hunger is capped at what it eats.
   */
  it('can never fire for a community that eats one each', () => {
    const starving = withLog(community(5, 1, 0), [fed(3, 5, 5)]);

    expect(hunger(starving)).toBe(5);
    expect(hungerPenalty(starving)).toBe(0);
  });

  it('does fire for a community that eats two each', () => {
    expect(hungerPenalty(withLog(community(5, 4, 0), [fed(3, 10, 10)]))).toBe(5);
  });

  it('is nothing for a community that has never eaten', () => {
    expect(hungerPenalty(community(5, 4, 0))).toBe(0);
  });
});

describe('exhaustion', () => {
  it('is nothing without a base, because nobody has a bed either way', () => {
    // Five survivors and nowhere to sleep is five Exhaustion, not zero.
    expect(exhaustion(community(5, 1))).toBe(5);
  });

  it('is the survivors a base cannot sleep', () => {
    // The Small Town Home ships two Bunk Rooms, two beds apiece (pg. 54, 71).
    const home: Base = { id: 'small-town-home', slots: {} };

    expect(exhaustion(community(5, 1, 0, home))).toBe(1);
    expect(exhaustion(community(4, 1, 0, home))).toBe(0);
  });

  it('is never negative, however many beds are spare', () => {
    expect(exhaustion(community(1, 1, 0, { id: 'small-town-home', slots: {} }))).toBe(0);
  });

  /** Live rather than recorded: fixing the shortfall clears it at once. */
  it('answers from the base as it is now, with no residue from a worse turn', () => {
    const crowded = community(5, 1, 0, { id: 'small-town-home', slots: {} });
    const roomier: Campaign = {
      ...crowded,
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'bunk-room', builtOnTurn: 1 } } },
      },
    };

    expect(exhaustion(crowded)).toBe(1);
    expect(exhaustion(roomier)).toBe(0);
  });
});

describe('survivorsFed', () => {
  it('is false before the step has run', () => {
    expect(survivorsFed(community(5, 4))).toBe(false);
  });

  it('is true once this turn has an entry', () => {
    expect(survivorsFed(withLog(community(5, 4), [fed(3, 10, 0)]))).toBe(true);
  });

  it('ignores last turn’s entry, which `hunger` still reads', () => {
    const carried = withLog(community(5, 4), [fed(2, 10, 6)]);

    expect(survivorsFed(carried)).toBe(false);
    expect(hunger(carried)).toBe(6);
  });
});

describe('withSurvivorsFed', () => {
  it('takes what the community eats out of the stores', () => {
    expect(withSurvivorsFed(community(5, 4, 12)).materials.food).toBe(2);
  });

  it('takes everything there is when there is not enough, and stops at empty', () => {
    expect(withSurvivorsFed(community(5, 4, 4)).materials.food).toBe(0);
  });

  it('leaves the other materials and the roster alone', () => {
    const before = community(5, 4, 12);
    const after = withSurvivorsFed(before);

    expect({ ...after, materials: before.materials }).toEqual(before);
  });
});
