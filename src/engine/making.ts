/**
 * Building equipment (pp. 20–21, 40–42, 63; R34, R43, R44, R48; Z5-6).
 *
 * The project team builds equipment at Planning Step 2 alongside facilities,
 * from the same Labor (pg. 20), but an item is finished the moment its Labor
 * and Hardware are paid: it goes into the base's Inventory at once and can be
 * equipped the same turn. Any number a turn, while the materials and Labor
 * last (pg. 21). So there is no queue entry; the `item-built` entry is the
 * record, and `laborCommitted` reads its Labor back.
 *
 * What may be built is the catalogue's row (`EQUIPMENT[…].build`): every
 * facility and Workshop upgrade it names standing — one on order does not
 * count — and any Power or Water it names supplied this turn to one of those
 * facilities (R44). Never shoddy (R35).
 *
 * Pure, like the rest of `src/engine`.
 */

import { BASES } from '../data/bases';
import {
  EQUIPMENT,
  ITEM_IDS,
  type BuildRequirement,
  type Grade,
  type ItemId,
  type ItemRules,
  type PricedBuild,
  type PricedGrade,
} from '../data/equipment';
import type { Utility } from '../data/facilities';
import type { Skill } from '../data/skills';
import type { Occupant } from './base';
import type { Campaign } from './campaign';
import type { Check, Violation } from './checks';
import { allItems } from './equipment';
import { laborRefusal, orderable } from './projects';
import { suppliedOccupants } from './utilities';

/** The standard weapons the enchanted melee weapon can be built on (pg. 40). */
export const ENCHANTABLE = ['blunt', 'bladed', 'heavy'] as const;

export type Enchantable = (typeof ENCHANTABLE)[number];

/** One item to build, with the id it will have. */
export interface BuildOrder {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;

  /** For the enchanted melee weapon: the standard weapon it is built on (pg. 40). */
  readonly enchants?: Enchantable;
}

export type BuildCode =
  | 'outside-the-planning-phase'
  | 'no-such-item'
  | 'not-built'
  | 'no-such-grade'
  | 'other-origin'
  | 'needs-a-weapon'
  | 'facility-missing'
  | 'upgrade-missing'
  | 'utility-missing'
  | 'not-enough-hardware'
  | 'not-enough-labor'
  | 'id-taken';

/** What an item costs to build, in Hardware and Labor. */
export interface BuildCost {
  readonly hardware: number;
  readonly labor: number;
}

/**
 * The priced row an order is built from: its own, or for the enchanted melee
 * weapon the standard weapon it enchants (pg. 40).
 */
function pricedRow(order: BuildOrder): PricedBuild | undefined {
  const rules: ItemRules = EQUIPMENT[order.item];
  const build = rules.build;

  if (build === undefined) return undefined;
  if (build.kind === 'priced') return build;

  if (order.enchants === undefined) return undefined;

  // Every weapon it can be built on has a priced row (`making.test`).
  return EQUIPMENT[order.enchants].build as PricedBuild;
}

/**
 * Whether the base's Blacksmithing Tools halve this item's Labor: a weapon
 * used with one of the skills they name (pg. 63; R43). A weapon, so not the
 * throwing axe, a disposable, nor ammunition, used with no skill at all.
 */
function blacksmithed(campaign: Campaign, rules: ItemRules): boolean {
  const base = campaign.base;
  if (base === null || rules.kind !== 'weapon') return false;

  return BASES[base.id].specials.some(
    (special) =>
      special.id === 'blacksmithing-tools' &&
      (rules.uses ?? []).some((skill) =>
        (special.halvesLaborForWeaponSkills as readonly Skill[]).includes(skill),
      ),
  );
}

/**
 * What an order costs, or `undefined` for one that cannot be priced: an item
 * that is never built, a grade it is not built in, or an enchanted weapon with
 * nothing to enchant. Blacksmithing Tools halve the Labor, rounding up (R43).
 */
export function buildCost(campaign: Campaign, order: BuildOrder): BuildCost | undefined {
  if (!Object.hasOwn(EQUIPMENT, order.item)) return undefined;
  if (!buildGrades(order.item).includes(order.grade)) return undefined;

  const row = pricedRow(order);
  if (row === undefined) return undefined;

  // Present: `buildGrades` offers only a grade the row prices, and the
  // enchanted melee weapon's base weapons all price standard (`making.test`).
  const hardware = row.hardware[order.grade as PricedGrade] as number;

  const rules: ItemRules = EQUIPMENT[order.item];
  const labor = blacksmithed(campaign, rules) ? Math.ceil(row.labor / 2) : row.labor;

  return { hardware, labor };
}

/**
 * The items this campaign could ever build, in catalogue order: those with a
 * row in the tables, of no origin or of the campaign's own (pp. 37, 41–42).
 * Whether one can be built now is `buildCheck`'s.
 */
export function buildableItems(campaign: Campaign): readonly ItemId[] {
  return ITEM_IDS.filter((id) => {
    const rules: ItemRules = EQUIPMENT[id];

    return (
      rules.build !== undefined && (rules.origin === undefined || rules.origin === campaign.origin)
    );
  });
}

/**
 * The grades an item is built in: those its row prices, never shoddy (R35),
 * and never a quality weapon, which is found or traded (pg. 37; R34). The
 * weapon tables' quality column goes unbuilt.
 */
export function buildGrades(item: ItemId): readonly Grade[] {
  const rules: ItemRules = EQUIPMENT[item];
  const build = rules.build;

  if (build === undefined) return [];
  if (build.kind === 'as-base-weapon') return ['standard'];

  return (['standard', 'quality'] as const).filter(
    (grade) =>
      build.hardware[grade] !== undefined && !(rules.kind === 'weapon' && grade === 'quality'),
  );
}

/** The facilities standing at the base that satisfy a row's facilities and upgrades. */
function standing(occupants: readonly Occupant[], requires: BuildRequirement) {
  const named = occupants.filter(
    (occupant) =>
      (requires.facilities ?? []).includes(occupant.facility.id) ||
      occupant.upgrades.some((upgrade) => (requires.upgrades ?? []).includes(upgrade.id)),
  );

  return {
    named,
    missingFacilities: (requires.facilities ?? []).filter(
      (facility) => !occupants.some((occupant) => occupant.facility.id === facility),
    ),
    missingUpgrades: (requires.upgrades ?? []).filter(
      (upgrade) =>
        !occupants.some((occupant) => occupant.upgrades.some((held) => held.id === upgrade)),
    ),
  };
}

/** Whether one of these facilities is supplied this utility this turn (R44). */
function supplied(named: readonly Occupant[], utility: Utility): boolean {
  return named.some((occupant) => occupant[utility]);
}

/**
 * Everything wrong with building this, now. All blockers: none of it is a rule
 * a table may wave through, and spending Hardware or Labor the community does
 * not have is arithmetic rather than a house rule.
 */
export function buildCheck(campaign: Campaign, order: BuildOrder): Check<BuildCode> {
  const refuse = (code: BuildCode, message: string, pages: number | string = 41) => ({
    blockers: [{ code, message, pages }],
    warnings: [],
  });

  // R14: an order is placed in the Planning Phase.
  if (!orderable(campaign)) {
    return refuse('outside-the-planning-phase', 'Equipment is built in the Planning Phase.', 20);
  }

  if (!Object.hasOwn(EQUIPMENT, order.item))
    return refuse('no-such-item', 'There is no such item.');

  const rules: ItemRules = EQUIPMENT[order.item];
  const build = rules.build;

  if (build === undefined) return refuse('not-built', 'This item is found or traded, never built.');

  if (rules.origin !== undefined && rules.origin !== campaign.origin) {
    return refuse('other-origin', 'That item belongs to another Origin of the Rot.', 37);
  }

  if (build.kind === 'as-base-weapon' && order.enchants === undefined) {
    return refuse('needs-a-weapon', 'It is built on a standard weapon: say which.', 40);
  }

  const cost = buildCost(campaign, order);
  if (cost === undefined) {
    return rules.kind === 'weapon' && order.grade === 'quality'
      ? refuse('no-such-grade', 'A quality weapon is found or traded, never built.', 37)
      : refuse('no-such-grade', 'It is not built in that grade.');
  }

  if (allItems(campaign).some((item) => item.id === order.id)) {
    return refuse('id-taken', 'An item already has that id.', 18);
  }

  const blockers: Violation<BuildCode>[] = [];
  const { named, missingFacilities, missingUpgrades } = standing(
    suppliedOccupants(campaign),
    build.requires,
  );

  if (missingFacilities.length > 0) {
    blockers.push({
      code: 'facility-missing',
      message: 'The base has no standing facility this is built in.',
      pages: '41–42',
    });
  }

  if (missingUpgrades.length > 0) {
    blockers.push({
      code: 'upgrade-missing',
      message: 'The base’s Workshop lacks the upgrade this is built with.',
      pages: '41, 71–72',
    });
  }

  if ((build.requires.utilities ?? []).some((utility) => !supplied(named, utility))) {
    blockers.push({
      code: 'utility-missing',
      message: 'The facility this is built in is not supplied the Power or Water it needs.',
      pages: '41–42, 67',
    });
  }

  if (cost.hardware > campaign.materials.hardware) {
    blockers.push({
      code: 'not-enough-hardware',
      message: `Costs ${String(cost.hardware)} Hardware and ${String(campaign.materials.hardware)} is stored.`,
      pages: 20,
    });
  }

  const labor = laborRefusal(campaign, cost.labor, 20);
  if (labor !== undefined) blockers.push(labor);

  return { blockers, warnings: [] };
}

/**
 * The campaign with an order built: its Hardware spent and the item in the
 * base's Inventory (pp. 20–21). Assumes `buildCheck` passed; its Labor is
 * counted from the entry the form writes.
 */
export function withItemBuilt(campaign: Campaign, order: BuildOrder, cost: BuildCost): Campaign {
  return {
    ...campaign,
    materials: { ...campaign.materials, hardware: campaign.materials.hardware - cost.hardware },
    inventory: [...campaign.inventory, { id: order.id, item: order.item, grade: order.grade }],
  };
}
