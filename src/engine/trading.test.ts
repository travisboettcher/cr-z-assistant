import { describe, expect, it } from 'vitest';
import type { ItemId } from '../data/equipment';
import { withPlanningBegun } from '../test/campaigns';
import { createNewCampaign, type Base, type Campaign, type Item } from './campaign';
import { submitItemBuilt, submitItemSold, submitTradeOrdered } from './campaignForms';
import { outstanding } from './outstanding';
import {
  dueTrades,
  saleableItems,
  saleCheck,
  salePrice,
  tradeableItems,
  tradeCheck,
  tradeGrades,
  tradePrice,
  withTradesArrived,
  type TradeRequest,
} from './trading';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-15T09:00:00.000Z';

/** Turn 3's Assign Project Team at the Hobby Farm, with Food and Fuel to spend. */
function trading(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'assign-project-team',
    base: { id: 'hobby-farm', slots: {} } as Base,
    materials: { food: 4, fuel: 4, hardware: 0 },
    ...overrides,
  });
}

const request = (overrides: Partial<TradeRequest> = {}): TradeRequest => ({
  id: 'bought',
  item: 'pistol',
  grade: 'standard',
  food: 2,
  fuel: 4,
  ...overrides,
});

const messages = (campaign: Campaign, asked: TradeRequest) =>
  tradeCheck(campaign, asked).blockers.map((one) => one.message);

function accepted(result: ReturnType<typeof submitTradeOrdered>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

describe('what the Planning trade buys (pp. 21, 37, 41–43; R51, R55)', () => {
  it('prices ordinary equipment in the grades its row prices for trade', () => {
    expect(tradeGrades('pistol')).toEqual(['standard']);
    expect(tradePrice('pistol', 'standard')).toBe(6);
    // The equipment table's price for the tool belt, not the Quality Item subtable's 6 (R55).
    expect(tradeGrades('tool-belt')).toEqual(['standard', 'quality']);
    expect(tradePrice('tool-belt', 'quality')).toBe(8);
  });

  it('never a quality weapon, a shoddy item, or a rare one', () => {
    expect(tradePrice('pistol', 'quality')).toBeUndefined();
    expect(tradePrice('pistol', 'shoddy')).toBeUndefined();
    expect(tradeGrades('riot-shield')).toEqual([]);
    // It has a price, the trader's, which the Planning trade never asks.
    expect(tradePrice('riot-shield', 'standard')).toBeUndefined();
    expect(tradeGrades('car-roof-rack')).toEqual([]);
  });

  it('offers no rare item, and an origin’s items only to that origin', () => {
    const plain = tradeableItems(trading());

    expect(plain).toContain('pistol');
    expect(plain).not.toContain('riot-shield');
    expect(plain).not.toContain('disinfectant');
    expect(tradeableItems(trading({ origin: 'viral' }))).toContain('disinfectant');
    expect(tradeableItems(trading({ origin: 'viral' }))).toContain('pistol');
  });
});

describe('a trade at Planning (pp. 19, 21; R52, R53)', () => {
  it('is refused outside the Planning Phase, and for what is not traded for', () => {
    expect(messages(trading({ step: 'heal-wounds' }), request())).toEqual([
      'Equipment is traded for in the Planning Phase.',
    ]);
    expect(messages(trading(), request({ item: 'laser' as ItemId }))).toEqual([
      'There is no such item.',
    ]);
    expect(messages(trading(), request({ item: 'riot-shield' }))).toEqual([
      'A rare item is bought from the Rare Goods Trader (R51).',
    ]);
    expect(messages(trading(), request({ item: 'disinfectant' }))).toEqual([
      'That item belongs to another Origin of the Rot.',
    ]);
    expect(messages(trading(), request({ grade: 'quality' }))).toEqual([
      'It is not traded for in that grade.',
    ]);
  });

  it('names an item with no trade price at all', () => {
    // Magic items print "–" for trade (pg. 41), so none is bought.
    expect(
      messages(trading({ origin: 'magic' }), request({ item: 'enchanted-melee-weapon' })),
    ).toEqual(['It has no trade price.']);
  });

  it('takes its whole price in Food and Fuel, in whole numbers', () => {
    for (const payment of [
      { food: 2, fuel: 3 },
      { food: -1, fuel: 7 },
      { food: 1.5, fuel: 4.5 },
      { food: 7, fuel: -1 },
    ]) {
      expect(messages(trading(), request(payment))).toEqual(['It costs 6, paid in Food and Fuel.']);
    }
    expect(messages(trading(), request({ food: 6, fuel: 0 }))).toEqual([
      'It takes 6 Food and the base has 4.',
    ]);
    expect(messages(trading(), request({ food: 0, fuel: 6 }))).toEqual([
      'It takes 6 Fuel and the base has 4.',
    ]);
    expect(messages(trading({ materials: { food: 1, fuel: 1, hardware: 0 } }), request())).toEqual([
      'It takes 2 Food and the base has 1.',
      'It takes 4 Fuel and the base has 1.',
    ]);
    expect(messages(trading(), request())).toEqual([]);
  });

  it('trades for an origin’s own item, and any other, under that origin', () => {
    const viral = trading({ origin: 'viral' });

    expect(messages(viral, request())).toEqual([]);
    expect(messages(viral, request({ item: 'disinfectant', food: 2, fuel: 2 }))).toEqual([]);
  });

  it('is never a warning: everything wrong with it blocks', () => {
    expect(tradeCheck(trading(), request()).warnings).toEqual([]);
    expect(tradeCheck(trading({ step: 'heal-wounds' }), request()).warnings).toEqual([]);
    expect(
      tradeCheck(trading({ materials: { food: 0, fuel: 0, hardware: 0 } }), request()).warnings,
    ).toEqual([]);
  });

  it('needs nobody and no Labor (R52)', () => {
    expect(trading().assignments).toEqual({});
    expect(messages(trading(), request())).toEqual([]);
  });

  it('pays at once, and the item waits on the order rather than in the Inventory', () => {
    const after = accepted(submitTradeOrdered(trading(), request(), AT));

    expect(after.materials).toEqual({ food: 2, fuel: 0, hardware: 0 });
    expect(after.inventory).toEqual([]);
    expect(after.trades).toEqual([
      { id: 'bought', item: 'pistol', grade: 'standard', food: 2, fuel: 4, orderedOnTurn: 3 },
    ]);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'trade-ordered',
      id: 'bought',
      item: 'pistol',
      grade: 'standard',
      food: 2,
      fuel: 4,
    });
    expect(submitTradeOrdered(trading({ step: 'heal-wounds' }), request(), AT).ok).toBe(false);
  });

  it('takes an id no item has, held or on its way', () => {
    const held = trading({ inventory: [{ id: 'bought', item: 'bow', grade: 'standard' }] });
    const ordered = accepted(submitTradeOrdered(trading(), request(), AT));

    expect(messages(held, request())).toEqual(['An item already has that id.']);
    expect(messages(ordered, request({ id: 'other', item: 'trap', food: 2, fuel: 0 }))).toEqual([]);
    expect(
      messages(ordered, request({ food: 0, fuel: 0, item: 'trap', grade: 'standard' })),
    ).toEqual(['It costs 2, paid in Food and Fuel.']);
    expect(messages(ordered, request({ item: 'trap', food: 2, fuel: 0 }))).toEqual([
      'An item already has that id.',
    ]);
    // A build is refused the same id too.
    const built = submitItemBuilt(ordered, { id: 'bought', item: 'blunt', grade: 'standard' }, AT);
    expect(built.ok ? null : built.problem).toBe('An item already has that id.');
  });
});

describe('a trade arriving (pg. 19; R53)', () => {
  /** Turn 3's order, a turn on at Add Facilities and Upgrades. */
  const nextTurn = (): Campaign => ({
    ...accepted(submitTradeOrdered(trading(), request(), AT)),
    turn: 4,
    step: 'add-facilities-and-upgrades',
  });

  it('is not due the turn it was ordered', () => {
    expect(dueTrades(accepted(submitTradeOrdered(trading(), request(), AT)))).toEqual([]);
    expect(dueTrades(nextTurn()).map((trade) => trade.id)).toEqual(['bought']);
  });

  /** The acceptance: ordered on turn 3, in the Inventory at turn 4's step, not before. */
  it('lands in the Inventory with an entry of its own, once', () => {
    const arrived = withTradesArrived(nextTurn(), AT);
    const pistol: Item = { id: 'bought', item: 'pistol', grade: 'standard' };

    expect(arrived.inventory).toEqual([pistol]);
    expect(arrived.trades).toEqual([]);
    expect(arrived.log.at(-1)?.event).toEqual({ kind: 'trade-arrived', ...pistol });
    expect(withTradesArrived(arrived, AT)).toBe(arrived);
  });

  it('leaves a trade placed this turn on order', () => {
    const placed = {
      ...request({ id: 'later', item: 'trap', food: 2, fuel: 0 }),
      orderedOnTurn: 4,
    };
    const both: Campaign = { ...nextTurn(), trades: [...nextTurn().trades, placed] };

    expect(withTradesArrived(both, AT).trades).toEqual([placed]);
  });

  it('is owed until it has arrived', () => {
    const says = (campaign: Campaign) => outstanding(campaign).map((one) => one.says);

    expect(says(nextTurn())).toContain('Items traded for last turn have not arrived.');
    expect(says(withTradesArrived(nextTurn(), AT))).not.toContain(
      'Items traded for last turn have not arrived.',
    );
  });
});

describe('selling a rare item (pp. 21, 37, 43; R54, R56)', () => {
  const shield: Item = { id: 'shield', item: 'riot-shield', grade: 'standard' };
  const pistol: Item = { id: 'pistol', item: 'pistol', grade: 'standard' };
  const belt: Item = { id: 'belt', item: 'tool-belt', grade: 'quality' };

  it('sells a rare item at the Rare Item Table’s price less two, and nothing else', () => {
    expect(salePrice(shield)).toBe(8);
    // A quality tool belt is on the Quality Item subtable at 6 (pg. 43).
    expect(salePrice(belt)).toBe(4);
    expect(salePrice(pistol)).toBeUndefined();
    expect(salePrice({ item: 'tool-belt', grade: 'standard' })).toBeUndefined();
    expect(saleableItems(trading({ inventory: [shield, pistol, belt] }))).toEqual([shield, belt]);
  });

  it('is refused outside Planning, for an item not in the Inventory, or not rare', () => {
    const campaign = trading({ inventory: [shield, pistol] });
    const refusal = (on: Campaign, id: string, food: number, fuel: number) =>
      saleCheck(on, id, { food, fuel }).blockers.map((one) => one.message);

    expect(refusal({ ...campaign, step: 'heal-wounds' }, 'shield', 8, 0)).toEqual([
      'A rare item is sold in the Planning Phase.',
    ]);
    expect(refusal(campaign, 'nothing', 8, 0)).toEqual([
      'Only an item in the base’s Inventory can be sold.',
    ]);
    expect(refusal(campaign, 'pistol', 4, 0)).toEqual(['Only a rare item can be sold (R54).']);
    expect(refusal(campaign, 'shield', 5, 4)).toEqual(['It sells for 8, in Food and Fuel.']);
    expect(refusal(campaign, 'shield', 5, 3)).toEqual([]);
    expect(saleCheck(campaign, 'pistol', { food: 4, fuel: 0 }).warnings).toEqual([]);
  });

  it('pays at once, in the mix chosen, and the item is gone', () => {
    const result = submitItemSold(
      trading({ inventory: [pistol, shield] }),
      'shield',
      { food: 3, fuel: 5 },
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.inventory).toEqual([pistol]);
    expect(result.campaign.materials).toEqual({ food: 7, fuel: 9, hardware: 0 });
    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'item-sold',
      ...shield,
      food: 3,
      fuel: 5,
    });
    expect(submitItemSold(trading(), 'shield', { food: 8, fuel: 0 }, AT).ok).toBe(false);
  });

  /** R56: over the cap is warned of, and the sale stands; Check Storage takes the excess. */
  it('warns when it overfills storage, and sells anyway', () => {
    const full = trading({ inventory: [shield], materials: { food: 4, fuel: 0, hardware: 0 } });
    const check = saleCheck(full, 'shield', { food: 8, fuel: 0 });

    expect(check.blockers).toEqual([]);
    expect(check.warnings.map((one) => one.message)).toEqual([
      '12 food is over this base’s 7. Check Storage is a Management step, so it keeps until then.',
    ]);
    expect(submitItemSold(full, 'shield', { food: 8, fuel: 0 }, AT).ok).toBe(true);
    expect(saleCheck(full, 'shield', { food: 0, fuel: 8 }).warnings).toHaveLength(1);
  });
});
