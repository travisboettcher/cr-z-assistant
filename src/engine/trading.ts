/**
 * Trading in the Planning Phase (pp. 19, 21, 37, 41–43; R51–R56; Z5-9).
 *
 * Buying is the Build/Trade Equipment project at Planning Step 2 (pg. 20),
 * paid in any mix of Food and Fuel, and needs nobody, no Labor and no facility
 * (R52). What can be bought is ordinary equipment in a grade the equipment
 * tables price for trade (R51), at that price (R55): never a rare item, which
 * comes from a trader, and never a quality weapon, whose row prints no trade
 * price. The Food and Fuel go at once, and the item arrives at the next Add
 * Facilities and Upgrades, wherever the community is then (R53). There is no
 * cancelling.
 *
 * Selling is for rare items only, at the Rare Item Table's price less two,
 * paid at once in the player's mix of Food and Fuel (R54), over the cap if it
 * comes to that: Check Storage takes the excess, and the form warns (R56).
 *
 * Pure, like the rest of `src/engine`.
 */

import {
  EQUIPMENT,
  ITEM_IDS,
  RARE_ITEM_TABLE,
  RARE_SALE_DISCOUNT,
  type Grade,
  type GradePrices,
  type ItemId,
  type ItemKind,
  type ItemRules,
  type PricedGrade,
  type RareItemEntry,
} from '../data/equipment';
import { STORED_MATERIALS } from '../data/materials';
import type { Campaign, Item, TradeOrder } from './campaign';
import type { Check, Violation } from './checks';
import { idTaken } from './equipment';
import { logged } from './log';
import { orderable } from './projects';
import { overCap } from './storage';

/** The kinds the Rare Item Table holds, bought only from a trader (R51). */
const RARE_KINDS: readonly ItemKind[] = [
  'rare-equipment',
  'rare-weapon',
  'rare-upgrade',
  'vehicle-upgrade',
];

/** What Food and Fuel pay for a trade, or what a sale brings in. */
export interface Payment {
  readonly food: number;
  readonly fuel: number;
}

/** One item to trade for, with the id it will have, and how it is paid for. */
export interface TradeRequest extends Payment {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
}

export type TradeCode =
  | 'outside-the-planning-phase'
  | 'no-such-item'
  | 'not-traded'
  | 'other-origin'
  | 'no-such-grade'
  | 'wrong-payment'
  | 'not-enough-food'
  | 'not-enough-fuel'
  | 'id-taken';

export type SaleCode =
  | 'outside-the-planning-phase'
  | 'not-in-the-inventory'
  | 'not-rare'
  | 'wrong-payment'
  | 'over-storage-cap';

/** The grades an item is bought in at Planning: those its row prices for trade (R51). */
export function tradeGrades(item: ItemId): readonly PricedGrade[] {
  const rules: ItemRules = EQUIPMENT[item];
  if (RARE_KINDS.includes(rules.kind)) return [];

  return (['standard', 'quality'] as const).filter((grade) => rules.trade?.[grade] !== undefined);
}

/** What it costs to buy at Planning, or `undefined` for what is not bought there (R51, R55). */
export function tradePrice(item: ItemId, grade: Grade): number | undefined {
  if (!(tradeGrades(item) as readonly Grade[]).includes(grade)) return undefined;

  // Present: `tradeGrades` offers only a grade the row prices for trade.
  const rules: ItemRules = EQUIPMENT[item];

  return (rules.trade as GradePrices)[grade as PricedGrade];
}

/** The items this campaign can ever buy at Planning, in catalogue order. */
export function tradeableItems(campaign: Campaign): readonly ItemId[] {
  return ITEM_IDS.filter((id) => {
    const { origin }: ItemRules = EQUIPMENT[id];

    return tradeGrades(id).length > 0 && (origin === undefined || origin === campaign.origin);
  });
}

/**
 * Whether a payment is whole Food and Fuel adding up to this price. Whole Food
 * and a whole price leave the Fuel whole too, so only the Food is asked.
 */
function pays(payment: Payment, price: number): boolean {
  return (
    Number.isInteger(payment.food) &&
    payment.food >= 0 &&
    payment.fuel >= 0 &&
    payment.food + payment.fuel === price
  );
}

/** Everything wrong with trading for this, now. All blockers: none of it is a rule to wave. */
export function tradeCheck(campaign: Campaign, request: TradeRequest): Check<TradeCode> {
  const refuse = (code: TradeCode, message: string, pages: number | string = 21) => ({
    blockers: [{ code, message, pages }],
    warnings: [],
  });

  if (!orderable(campaign)) {
    return refuse('outside-the-planning-phase', 'Trade for equipment in the Planning Phase.');
  }

  if (!Object.hasOwn(EQUIPMENT, request.item))
    return refuse('no-such-item', 'There is no such item.');

  const rules: ItemRules = EQUIPMENT[request.item];

  if (tradeGrades(request.item).length === 0) {
    return refuse(
      'not-traded',
      RARE_KINDS.includes(rules.kind)
        ? 'A rare item is bought from the Rare Goods Trader.'
        : 'It has no trade price.',
      37,
    );
  }

  if (rules.origin !== undefined && rules.origin !== campaign.origin) {
    return refuse('other-origin', 'That item belongs to another Origin of the Rot.', 37);
  }

  const price = tradePrice(request.item, request.grade);
  if (price === undefined) {
    return refuse('no-such-grade', 'It isn’t traded for in that grade.', '41–42');
  }

  if (!pays(request, price)) {
    return refuse('wrong-payment', `It costs ${String(price)}, paid in Food and Fuel.`);
  }

  if (idTaken(campaign, request.id)) {
    return refuse('id-taken', 'An item already has that id.', 18);
  }

  const blockers: Violation<TradeCode>[] = [];

  if (request.food > campaign.materials.food) {
    blockers.push({
      code: 'not-enough-food',
      message: `It takes ${String(request.food)} Food, but the base has ${String(campaign.materials.food)}.`,
      pages: 21,
    });
  }

  if (request.fuel > campaign.materials.fuel) {
    blockers.push({
      code: 'not-enough-fuel',
      message: `It takes ${String(request.fuel)} Fuel, but the base has ${String(campaign.materials.fuel)}.`,
      pages: 21,
    });
  }

  return { blockers, warnings: [] };
}

/**
 * The campaign with the trade paid for and the item on its way. Assumes
 * `tradeCheck` passed.
 */
export function withTradeOrdered(campaign: Campaign, request: TradeRequest): Campaign {
  const order: TradeOrder = {
    id: request.id,
    item: request.item,
    grade: request.grade,
    food: request.food,
    fuel: request.fuel,
    orderedOnTurn: campaign.turn,
  };

  return {
    ...campaign,
    materials: {
      ...campaign.materials,
      food: campaign.materials.food - request.food,
      fuel: campaign.materials.fuel - request.fuel,
    },
    trades: [...campaign.trades, order],
  };
}

/** The trades arriving at this turn's Add Facilities and Upgrades: every one ordered before it. */
export function dueTrades(campaign: Campaign): readonly TradeOrder[] {
  return campaign.trades.filter((trade) => trade.orderedOnTurn < campaign.turn);
}

/**
 * The campaign with every due trade in the Inventory, a `trade-arrived` entry
 * each, in the order they were placed. Unchanged when nothing is due, so a
 * second press does nothing.
 */
export function withTradesArrived(campaign: Campaign, at: string): Campaign {
  const due = dueTrades(campaign);

  return due.reduce(
    (so_far, trade) =>
      logged(
        {
          ...so_far,
          inventory: [...so_far.inventory, { id: trade.id, item: trade.item, grade: trade.grade }],
          trades: so_far.trades.filter((one) => one.id !== trade.id),
        },
        at,
        { kind: 'trade-arrived', id: trade.id, item: trade.item, grade: trade.grade },
      ),
    campaign,
  );
}

/** The Rare Item Table's entry for this item at this grade, if it has one (pg. 43). */
function rareEntry(item: Pick<Item, 'item' | 'grade'>): RareItemEntry | undefined {
  return Object.values(RARE_ITEM_TABLE)
    .flat()
    .find((entry: RareItemEntry) => entry.item === item.item && entry.grade === item.grade);
}

/** What a rare item sells for, or `undefined` for an item that is not one (R54). */
export function salePrice(item: Pick<Item, 'item' | 'grade'>): number | undefined {
  const entry = rareEntry(item);

  return entry === undefined ? undefined : entry.price - RARE_SALE_DISCOUNT;
}

/** The rare items in the base's Inventory, which are what can be sold. */
export function saleableItems(campaign: Campaign): readonly Item[] {
  return campaign.inventory.filter((item) => salePrice(item) !== undefined);
}

/**
 * Everything wrong with selling this item for this payment, now. Storage
 * overfilling is a warning only (R56): the sale stands, and Check Storage
 * takes the excess.
 */
export function saleCheck(campaign: Campaign, id: string, payment: Payment): Check<SaleCode> {
  const refuse = (code: SaleCode, message: string, pages: number | string = 21) => ({
    blockers: [{ code, message, pages }],
    warnings: [],
  });

  if (!orderable(campaign)) {
    return refuse('outside-the-planning-phase', 'Sell rare items in the Planning Phase.');
  }

  const item = campaign.inventory.find((held) => held.id === id);
  if (item === undefined) {
    return refuse('not-in-the-inventory', 'Only an item in the base’s Inventory can be sold.');
  }

  const price = salePrice(item);
  if (price === undefined) return refuse('not-rare', 'Only a rare item can be sold.', 37);

  if (!pays(payment, price)) {
    return refuse('wrong-payment', `It sells for ${String(price)}, in Food and Fuel.`);
  }

  const sold = withItemSold(campaign, id, payment);
  const spilled = overCap(sold);

  // In the words the haul's warning uses, for the same reason (pg. 23).
  return {
    blockers: [],
    warnings: STORED_MATERIALS.filter((material) => spilled[material] > 0).map((material) => {
      const after = sold.materials[material];

      return {
        code: 'over-storage-cap',
        message: `${String(after)} ${material} is over this base’s ${String(after - spilled[material])}. It stays until Check Storage, in the Management Phase.`,
        pages: 23,
      };
    }),
  };
}

/** The campaign with the item gone and its price in storage. Assumes `saleCheck` passed. */
export function withItemSold(campaign: Campaign, id: string, payment: Payment): Campaign {
  return {
    ...campaign,
    inventory: campaign.inventory.filter((held) => held.id !== id),
    materials: {
      ...campaign.materials,
      food: campaign.materials.food + payment.food,
      fuel: campaign.materials.fuel + payment.fuel,
    },
  };
}
