/**
 * The Rare Items trade and the Rare Goods Trader (pp. 21, 23, 43, 83–84;
 * R22, R57–R61; Z5-10).
 *
 * One trade in two halves (R57). In a Planning Phase, with a mission team
 * assigned to go, the community rolls the trader's list: as many Rare Item
 * Table rolls as every survivor's Scout Score plus Cooperation (R58). The app
 * asks only for the rolls the player wants to buy from, in priority order, each
 * with the Food and Fuel set aside for it; the set-aside pile leaves storage
 * and Check Storage at once (R59).
 *
 * The next Mission Phase's first mission must be the Rare Goods Trader (R60).
 * Choosing another, skipping the mission, or a siege called at that turn's
 * Check the Horde loses the materials and cancels the trade. The mission's
 * outcome says how many items the trader handed over, first in priority first
 * (pg. 84). With a survivor out they arrive at once; with nobody out they and
 * their materials are lost. Either way the materials of the items not traded
 * come back (R22, R61).
 *
 * Pure, like the rest of `src/engine`.
 */

import type { D10Result } from '../data/dice';
import type { Campaign, Item, RareTrade, RareTradeItem } from './campaign';
import type { Check, Violation } from './checks';
import { idTaken } from './equipment';
import { hungerPenalty } from './feeding';
import { rareItemFor } from './finding';
import { logged, type RareTradeLoss } from './log';
import { rareTradeDue, turnMissions } from './missions';
import { orderable } from './projects';
import { skillScore, statValue } from './survivor';
import { phaseOf } from './turn';

/** One roll the player chose from the trader's list, and what is set aside for it. */
export interface RareTradePick {
  readonly id: string;
  readonly subtable: D10Result;
  readonly entry: D10Result;
  readonly food: number;
  readonly fuel: number;
}

export type RareTradeCode =
  | 'outside-the-planning-phase'
  | 'trade-under-way'
  | 'no-mission-team'
  | 'nothing-chosen'
  | 'too-many'
  | 'wrong-payment'
  | 'not-enough-food'
  | 'not-enough-fuel'
  | 'id-taken';

/**
 * How many rolls the trader's list has: every survivor's Scout Score plus their
 * Cooperation, added together (pg. 21; R58). A survivor without Scout adds
 * their Cooperation alone.
 */
export function rareTradeRolls(campaign: Campaign): number {
  const penalty = hungerPenalty(campaign);

  return campaign.survivors.reduce(
    (total, survivor) =>
      total +
      (skillScore(survivor, 'scout', penalty) ?? 0) +
      statValue(survivor, 'cooperation', penalty),
    0,
  );
}

/** A pick as the item it buys, at the trader's price (pg. 43). */
export function tradeItemFor(pick: RareTradePick): RareTradeItem {
  const { item, grade } = rareItemFor(pick.subtable, pick.entry);

  return { ...pick, item, grade };
}

/** What a pick costs: the Rare Item Table's price for it (pg. 43; R55). */
export function pickPrice(pick: Pick<RareTradePick, 'subtable' | 'entry'>): number {
  return rareItemFor(pick.subtable, pick.entry).price;
}

/** Food and Fuel set aside for these items, together. */
export function setAside(items: readonly Pick<RareTradeItem, 'food' | 'fuel'>[]): {
  readonly food: number;
  readonly fuel: number;
} {
  return items.reduce(
    (total, item) => ({ food: total.food + item.food, fuel: total.fuel + item.fuel }),
    { food: 0, fuel: 0 },
  );
}

/** Everything wrong with making this trade, now. All blockers. */
export function rareTradeCheck(
  campaign: Campaign,
  picks: readonly RareTradePick[],
): Check<RareTradeCode> {
  const refuse = (code: RareTradeCode, message: string, pages: number | string = 21) => ({
    blockers: [{ code, message, pages }],
    warnings: [],
  });

  if (!orderable(campaign)) {
    return refuse('outside-the-planning-phase', 'Make Rare Items trades in the Planning Phase.');
  }
  if (campaign.rareTrade !== null) {
    return refuse('trade-under-way', 'A Rare Items trade is already under way.');
  }
  // The team assigned now, for next turn's mission: `missionTeams` reads the
  // teams that went out this turn.
  if (
    !campaign.survivors.some((survivor) => campaign.assignments[survivor.id]?.task === 'mission')
  ) {
    return refuse('no-mission-team', 'A mission team goes to trade. Assign one first.');
  }
  if (picks.length === 0) {
    return refuse('nothing-chosen', 'Choose an item from the trader’s list.');
  }

  const rolls = rareTradeRolls(campaign);
  if (picks.length > rolls) {
    return refuse(
      'too-many',
      `The trader’s list has ${String(rolls)} rolls, and ${String(picks.length)} are chosen.`,
    );
  }

  const unpaid = picks.findIndex(
    (pick) =>
      !Number.isInteger(pick.food) ||
      pick.food < 0 ||
      pick.fuel < 0 ||
      pick.food + pick.fuel !== pickPrice(pick),
  );
  if (unpaid !== -1) {
    return refuse(
      'wrong-payment',
      `Set aside ${String(pickPrice(picks[unpaid] as RareTradePick))} in Food and Fuel for item ${String(unpaid + 1)}.`,
      43,
    );
  }

  const ids = picks.map((pick) => pick.id);
  if (ids.some((id, at) => idTaken(campaign, id) || ids.indexOf(id) !== at)) {
    return refuse('id-taken', 'An item already has that id.', 18);
  }

  const { food, fuel } = setAside(picks);
  const blockers: Violation<RareTradeCode>[] = [];

  if (food > campaign.materials.food) {
    blockers.push({
      code: 'not-enough-food',
      message: `It sets aside ${String(food)} Food, but the base has ${String(campaign.materials.food)}.`,
      pages: 21,
    });
  }
  if (fuel > campaign.materials.fuel) {
    blockers.push({
      code: 'not-enough-fuel',
      message: `It sets aside ${String(fuel)} Fuel, but the base has ${String(campaign.materials.fuel)}.`,
      pages: 21,
    });
  }

  return { blockers, warnings: [] };
}

/** The campaign with the trade made and its materials set aside. Assumes the check passed. */
export function withRareTradeMade(campaign: Campaign, picks: readonly RareTradePick[]): Campaign {
  const items = picks.map(tradeItemFor);
  const { food, fuel } = setAside(items);
  const trade: RareTrade = { madeOnTurn: campaign.turn, items };

  return {
    ...campaign,
    materials: {
      ...campaign.materials,
      food: campaign.materials.food - food,
      fuel: campaign.materials.fuel - fuel,
    },
    rareTrade: trade,
  };
}

/**
 * Whether a trade waits on this Mission Phase's first choice: made on an
 * earlier turn, and no team has chosen a mission yet (R60).
 */
export function rareTradeBinds(campaign: Campaign): boolean {
  return (
    rareTradeDue(campaign) &&
    phaseOf(campaign.step) === 'mission' &&
    turnMissions(campaign).choices.length === 0
  );
}

/** What an item of the trade is, as the Inventory holds it. */
function asItem(item: RareTradeItem): Item {
  return { id: item.id, item: item.item, grade: item.grade };
}

/**
 * The campaign with its trade cancelled and the set-aside materials lost
 * (pp. 21, 23; R59, R60), and an entry saying why. Unchanged without a trade.
 */
export function withRareTradeLost(campaign: Campaign, at: string, reason: RareTradeLoss): Campaign {
  const trade = campaign.rareTrade;
  if (trade === null) return campaign;

  return logged({ ...campaign, rareTrade: null }, at, {
    kind: 'rare-trade-lost',
    reason,
    items: trade.items.map(asItem),
    ...setAside(trade.items),
  });
}

/**
 * The campaign with its trade settled by the Rare Goods Trader's outcome
 * (pg. 84; R22, R61): the first `traded` items arrive if anybody got out, and
 * are lost with their materials if nobody did; every other item's materials
 * come back to storage.
 */
export function withRareTradeSettled(
  campaign: Campaign,
  traded: number,
  survivorsExited: number,
  at: string,
): Campaign {
  // Present: an outcome naming items traded is refused without a trade under
  // way (`missionOutcomeProblem`), and only such an outcome settles one.
  const trade = campaign.rareTrade as RareTrade;
  const handed = trade.items.slice(0, traded).map(asItem);
  const back = setAside(trade.items.slice(traded));
  const success = survivorsExited > 0;

  return logged(
    {
      ...campaign,
      rareTrade: null,
      inventory: success ? [...campaign.inventory, ...handed] : campaign.inventory,
      materials: {
        ...campaign.materials,
        food: campaign.materials.food + back.food,
        fuel: campaign.materials.fuel + back.fuel,
      },
    },
    at,
    {
      kind: 'rare-trade-closed',
      arrived: success ? handed : [],
      lost: success ? [] : handed,
      ...back,
    },
  );
}
