import { describe, expect, it } from 'vitest';
import { FACILITIES, type Exchange, type Facility, type Upgrade } from '../data/facilities';
import { MATERIALS } from '../data/materials';
import { createNewCampaign, type Campaign } from './campaign';
import {
  checkConversion,
  conversions,
  gainedBy,
  spentBy,
  timesConverted,
  withConversion,
  type Conversion,
} from './conversions';
import type { LogEntry } from './log';
import { generatingUtilities } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-11T09:00:00.000Z';

/**
 * A Hobby Farm on turn 3 whose built-in Kitchen carries a Gas Range: 2 Fuel for
 * 1 Food, with no per-turn cap in the book.
 */
function withGasRange(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    materials: { food: 0, fuel: 4, hardware: 0, rare: 0 },
    base: { id: 'hobby-farm', slots: { kitchen: { upgrades: ['gas-range'] } } },
    ...overrides,
  };
}

const gasRange = (campaign: Campaign): Conversion => {
  const found = conversions(campaign).find(({ source }) => source.id === 'gas-range');
  if (found === undefined) throw new Error('the fixture has no Gas Range');

  return found;
};

const converted = (turn: number, slot: string, source: string): LogEntry => ({
  turn,
  phase: 'advancement',
  at: AT,
  event: { kind: 'materials-converted', slot, source, spent: { fuel: 2 }, gained: { food: 1 } },
});

describe('conversions', () => {
  it('is empty for a campaign with no base', () => {
    expect(conversions(createNewCampaign('Cedar Hollow', FIXED))).toEqual([]);
  });

  it('offers the trade an upgrade brings, named by where it lives', () => {
    const [only, ...rest] = conversions(withGasRange());

    expect(rest).toEqual([]);
    expect(only?.slot).toBe('kitchen');
    expect(only?.source.id).toBe('gas-range');
    expect(spentBy(only as Conversion)).toEqual({ food: 0, fuel: 2, hardware: 0, rare: 0 });
    expect(gainedBy(only as Conversion)).toEqual({ food: 1, fuel: 0, hardware: 0, rare: 0 });
  });

  /**
   * A facility whose required utilities are unmet produces no effect at all
   * (pg. 54), and a trade it cannot run is not a trade on offer. The Biofuel Lab
   * needs Power *and* Water.
   */
  it('does not offer a trade from something switched off for want of a utility', () => {
    const campaign = generatingUtilities(
      withGasRange({
        base: {
          id: 'hobby-farm',
          slots: { kitchen: { upgrades: ['gas-range', 'biofuel-lab'], power: true } },
        },
      }),
      1,
      'utility-station',
    );

    expect(conversions(campaign).map(({ source }) => source.id)).toEqual(['gas-range']);
  });

  /**
   * The same slot, the same two flags, and nobody in the Station — so neither
   * point is backed and the Lab is switched off for want of the Power the base
   * is not making. `conversions` asked the stored flags until R2-H1 (#139),
   * which made this campaign and the one above indistinguishable.
   */
  it('does not offer it when nothing is generating the points it is assigned', () => {
    const campaign = withGasRange({
      base: {
        id: 'hobby-farm',
        slots: {
          kitchen: { upgrades: ['gas-range', 'biofuel-lab'], power: true, water: true },
        },
      },
    });

    expect(conversions(campaign).map(({ source }) => source.id)).toEqual(['gas-range']);
  });

  it('offers it once both are supplied', () => {
    const campaign = generatingUtilities(
      withGasRange({
        base: {
          id: 'hobby-farm',
          slots: {
            kitchen: { upgrades: ['gas-range', 'biofuel-lab'], power: true, water: true },
          },
        },
      }),
      2,
      'utility-station',
    );

    expect(conversions(campaign).map(({ source }) => source.id)).toEqual([
      'gas-range',
      'biofuel-lab',
    ]);
  });

  /**
   * The Generator and the Well Pump spend Fuel for a point of Power or Water,
   * and the Planning Phase's utility step owns those — a point bought here
   * would be cleared by this same turn's Planning Phase one phase later.
   */
  it('does not offer a trade that buys a utility', () => {
    const campaign = withGasRange({
      base: {
        id: 'hobby-farm',
        slots: {
          'garden-1': {
            built: { facility: 'utility-station', builtOnTurn: 1 },
            upgrades: ['generator'],
          },
        },
      },
    });

    expect(conversions(campaign)).toEqual([]);
  });

  /**
   * The guard on that decision. Two trades in the catalogue buy a utility and
   * both are marked; a third added without a decision about which step runs it
   * fails here rather than shipping as data nothing reads — which is exactly
   * how `exchange` sat unread from Phase 2 to issue #108.
   */
  it('knows every trade in the catalogue that is not this step’s', () => {
    const everyExchange: (readonly [string, Exchange])[] = Object.values(FACILITIES).flatMap(
      (facility) =>
        ([facility, ...facility.upgrades] as readonly (Facility | Upgrade)[]).flatMap((entry) =>
          (entry.effects.exchange ?? []).map((exchange) => [entry.id, exchange] as const),
        ),
    );

    const buysAUtility = everyExchange.filter(
      ([, exchange]) =>
        !Object.keys(exchange.gain).every((output) =>
          (MATERIALS as readonly string[]).includes(output),
        ),
    );

    expect(buysAUtility.map(([id]) => id)).toEqual(['generator', 'well-pump']);
  });
});

describe('checkConversion', () => {
  it('allows a trade the storage can pay for', () => {
    const campaign = withGasRange();

    expect(checkConversion(campaign, gasRange(campaign))).toEqual({ blockers: [], warnings: [] });
  });

  /**
   * A blocker rather than a warning, and the one place this phase refuses: the
   * book has no rule for a store at −2, and the honest fix for a wrong count is
   * to correct the count.
   */
  it('refuses a trade the storage cannot pay for', () => {
    const campaign = withGasRange({ materials: { food: 0, fuel: 1, hardware: 0, rare: 0 } });
    const check = checkConversion(campaign, gasRange(campaign));

    expect(check.blockers.map(({ code }) => code)).toEqual(['not-enough-materials']);
    expect(check.warnings).toEqual([]);
  });

  it('does not cap a trade the book does not cap', () => {
    const campaign = withGasRange({
      log: [converted(3, 'kitchen', 'gas-range'), converted(3, 'kitchen', 'gas-range')],
    });

    expect(timesConverted(campaign, gasRange(campaign))).toBe(2);
    expect(checkConversion(campaign, gasRange(campaign)).blockers).toEqual([]);
  });

  it('counts only this turn’s trades against a cap', () => {
    const campaign = withGasRange({ log: [converted(2, 'kitchen', 'gas-range')] });

    expect(timesConverted(campaign, gasRange(campaign))).toBe(0);
  });

  /**
   * No material trade in the catalogue states a cap — the two that do are the
   * Generator's and the Well Pump's, and those belong to the Planning Phase's
   * utility step. So the rule is exercised against a trade built here rather
   * than one looked up, because a stated cap is a rule and the step that
   * eventually runs those two should not have to reimplement it.
   */
  it('refuses a trade whose stated cap is spent this turn', () => {
    const campaign = withGasRange({ log: [converted(3, 'kitchen', 'gas-range')] });
    const capped: Conversion = {
      ...gasRange(campaign),
      exchange: { spend: { fuel: 2 }, gain: { food: 1 }, maxPerTurn: 1 },
    };

    expect(checkConversion(campaign, capped).blockers.map(({ code }) => code)).toEqual([
      'no-conversions-left',
    ]);
  });

  it('allows one more while the cap has room', () => {
    const campaign = withGasRange({ log: [converted(3, 'kitchen', 'gas-range')] });
    const capped: Conversion = {
      ...gasRange(campaign),
      exchange: { spend: { fuel: 2 }, gain: { food: 1 }, maxPerTurn: 2 },
    };

    expect(checkConversion(campaign, capped).blockers).toEqual([]);
  });

  it('counts only this slot’s trades, because each allowance is its own', () => {
    const campaign = withGasRange({ log: [converted(3, 'bunk-room-1', 'gas-range')] });

    expect(timesConverted(campaign, gasRange(campaign))).toBe(0);
  });
});

describe('withConversion', () => {
  it('takes the spend out and puts the gain in', () => {
    const campaign = withGasRange();

    expect(withConversion(campaign, gasRange(campaign)).materials).toEqual({
      food: 1,
      fuel: 2,
      hardware: 0,
      rare: 0,
    });
  });

  it('changes nothing else about the campaign', () => {
    const campaign = withGasRange();
    const after = withConversion(campaign, gasRange(campaign));

    expect({ ...after, materials: campaign.materials }).toEqual(campaign);
  });
});
