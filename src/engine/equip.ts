/**
 * Equip Mission Team: what each survivor going out carries (pg. 18; R35, R38,
 * R40; Z5-4).
 *
 * ## Who, and where from
 *
 * The survivors going out this turn — `deployed`, so a team that chose no
 * mission while others did stays home, and an opt-out equips nobody. Items
 * move between the base's Inventory and those survivors, either way, and
 * between them (R38). Anybody else keeps what they hold and takes nothing.
 *
 * Shoddy gear is not in the Inventory at all (R35). Anybody with a skill an
 * item is used with takes the shoddy one free, and setting it down again
 * returns it to nowhere: the base never holds one.
 *
 * ## Refused, and warned
 *
 * Refused where the book says it cannot be: no slot free (pp. 14, 38, 44), an
 * item whose skill the survivor lacks and the book says cannot be equipped
 * without it (pg. 44), a second of one piece of protective gear (R40), and an
 * item the catalogue has no slot count for yet, which later parts of Phase 5
 * settle. A weapon carried by somebody without its skill is only a warning:
 * the book says a skill is needed to *use* one (pg. 8), not to carry it.
 *
 * What a mission uses up is Z5-5's, recorded with its outcome.
 */

import { EQUIPMENT, ITEM_IDS, type Grade, type ItemId, type ItemRules } from '../data/equipment';
import type { Campaign, Item, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { allItems, rulesOf, slotsInUse } from './equipment';
import { hungerPenalty } from './feeding';
import type { ItemHolder } from './log';
import { deployed } from './missions';
import { inventorySlots } from './survivor';
import { phaseOf } from './turn';

export type EquipCode =
  | 'phase'
  | 'no-such-item'
  | 'id-taken'
  | 'not-going'
  | 'already-there'
  | 'unsettled'
  | 'not-free'
  | 'needs-skill'
  | 'worn-already'
  | 'no-slots'
  | 'cannot-use';

/** Where an item goes: to somebody going out, or back where it came from. */
export type EquipTarget = 'base' | { readonly survivor: string };

/**
 * One move at Equip Mission Team: an item that exists going somewhere, or a
 * shoddy one taken up free, with the id it will have (R35).
 */
export type EquipMove =
  | { readonly kind: 'move'; readonly id: string; readonly to: EquipTarget }
  | {
      readonly kind: 'take-shoddy';
      readonly id: string;
      readonly item: ItemId;
      readonly survivor: string;
    };

/** Who is equipped this turn: everybody going out (R38). */
export function equippable(campaign: Campaign): readonly Survivor[] {
  return deployed(campaign);
}

/** Who holds an item: the base, a survivor on the roster, or nobody. */
export function holderOf(campaign: Campaign, id: string): 'base' | Survivor | undefined {
  if (campaign.inventory.some((item) => item.id === id)) return 'base';

  return campaign.survivors.find((survivor) => survivor.items.some((item) => item.id === id));
}

/**
 * The shoddy items a survivor may take up free: each that comes in shoddy and
 * is used with, or needs, a skill they have (pp. 9–11, 37; R35).
 */
export function shoddyOffers(survivor: Survivor): readonly ItemId[] {
  return ITEM_IDS.filter((id) => {
    const rules: ItemRules = EQUIPMENT[id];
    const grades: readonly Grade[] = rules.grades;
    // An item is used with skills or needs one, never both (`rules.test`).
    const skills = rules.uses ?? (rules.needs === undefined ? [] : [rules.needs]);

    return grades.includes('shoddy') && skills.some((skill) => skill in survivor.skills);
  });
}

/** The item a move is about, as it is or as it will be. */
function movedItem(campaign: Campaign, move: EquipMove): Item | undefined {
  if (move.kind === 'take-shoddy') {
    return Object.hasOwn(EQUIPMENT, move.item)
      ? { id: move.id, item: move.item, grade: 'shoddy' }
      : undefined;
  }

  return allItems(campaign).find((item) => item.id === move.id);
}

/** Whether a survivor can take an item, and whether they should (pp. 14, 38, 44; R40). */
function receivingViolations(
  campaign: Campaign,
  survivor: Survivor,
  item: Item,
): Pick<Check<EquipCode>, 'blockers' | 'warnings'> {
  const rules = rulesOf(item);
  const blockers: Violation<EquipCode>[] = [];
  const warnings: Violation<EquipCode>[] = [];

  if (rules.slots === null) {
    blockers.push({
      code: 'unsettled',
      message: 'The app can’t hand this item out yet.',
      pages: rules.pages,
    });
  }

  if (rules.needs !== undefined && !(rules.needs in survivor.skills)) {
    blockers.push({
      code: 'needs-skill',
      message: `${survivor.name} doesn’t have the skill this item needs.`,
      pages: 44,
    });
  }

  if (rules.kind === 'protective' && survivor.items.some((held) => held.item === item.item)) {
    blockers.push({
      code: 'worn-already',
      message: `${survivor.name} already wears one.`,
      pages: 45,
    });
  }

  const after = { ...survivor, items: [...survivor.items, item] };
  if (
    slotsInUse(after) > slotsInUse(survivor) &&
    slotsInUse(after) > inventorySlots(after, hungerPenalty(campaign))
  ) {
    blockers.push({
      code: 'no-slots',
      message: `${survivor.name} has no Inventory Slot free for it.`,
      pages: 14,
    });
  }

  if (rules.uses !== undefined && !rules.uses.some((skill) => skill in survivor.skills)) {
    warnings.push({
      code: 'cannot-use',
      message: `${survivor.name} can carry it, but has no skill to use it with.`,
      pages: 8,
    });
  }

  return { blockers, warnings };
}

/** A target as one string: `base`, or the survivor's id. */
const targetId = (target: EquipTarget): string => (target === 'base' ? 'base' : target.survivor);

const blocked = (code: EquipCode, message: string, pages: number | string): Check<EquipCode> => ({
  blockers: [{ code, message, pages }],
  warnings: [],
});

/**
 * Whether a move may be made at Equip Mission Team, and what it should be
 * warned about. The first thing that makes the move meaningless is the only
 * blocker returned; past that, every reason the survivor cannot take the item.
 */
export function equipCheck(campaign: Campaign, move: EquipMove): Check<EquipCode> {
  if (phaseOf(campaign.step) !== 'mission') {
    return blocked('phase', 'Move items at Equip the Mission Team, in the Mission Phase.', 18);
  }

  const item = movedItem(campaign, move);
  if (item === undefined) return blocked('no-such-item', 'There is no such item.', 18);

  const going = equippable(campaign);
  const isGoing = (survivor: Survivor) => going.some((one) => one.id === survivor.id);

  if (move.kind === 'take-shoddy') {
    if (allItems(campaign).some((held) => held.id === move.id)) {
      return blocked('id-taken', 'An item already has that id.', 18);
    }
  } else {
    const from = holderOf(campaign, move.id);

    if (from === undefined) {
      return blocked('not-going', 'Whoever holds that item isn’t on the roster to give it.', 18);
    }
    if (from !== 'base' && !isGoing(from)) {
      return blocked('not-going', `${from.name} isn’t going out, and keeps what they hold.`, 18);
    }
    if ((from === 'base' ? 'base' : from.id) === targetId(move.to)) {
      return blocked(
        'already-there',
        from === 'base'
          ? 'That item is in the base’s Inventory already.'
          : `${from.name} has it already.`,
        18,
      );
    }
    if (move.to === 'base') return { blockers: [], warnings: [] };
  }

  const id = move.kind === 'take-shoddy' ? move.survivor : targetId(move.to);
  const survivor = campaign.survivors.find((one) => one.id === id);

  if (survivor === undefined || !isGoing(survivor)) {
    return blocked('not-going', 'Only somebody going out this turn is equipped.', 18);
  }

  if (move.kind === 'take-shoddy' && !shoddyOffers(survivor).includes(move.item)) {
    return blocked(
      'not-free',
      `That isn’t free gear for ${survivor.name}. Shoddy gear comes free with a skill it’s used with.`,
      37,
    );
  }

  return receivingViolations(campaign, survivor, item);
}

/**
 * The campaign with a move made, and the two ends of it for the log. Assumes
 * `equipCheck` has passed: a shoddy item set down goes to nobody (R35).
 */
export function withEquipMove(
  campaign: Campaign,
  move: EquipMove,
): {
  readonly campaign: Campaign;
  readonly item: Item;
  readonly from: ItemHolder;
  readonly to: ItemHolder;
} {
  // Present: `equipCheck` found it.
  const item = movedItem(campaign, move) as Item;
  // Nobody holds shoddy gear being taken up: its id is new.
  const holder = holderOf(campaign, item.id);
  const from: ItemHolder =
    holder === undefined || holder === 'base'
      ? item.grade === 'shoddy'
        ? 'free'
        : 'base'
      : { survivor: holder.id, name: holder.name };
  const target = move.kind === 'take-shoddy' ? move.survivor : targetId(move.to);

  const without = (items: readonly Item[]) => items.filter((held) => held.id !== item.id);
  const toBase = target === 'base' && item.grade !== 'shoddy';

  const survivors = campaign.survivors.map((survivor) => ({
    ...survivor,
    items: survivor.id === target ? [...without(survivor.items), item] : without(survivor.items),
  }));

  const receiver = campaign.survivors.find((one) => one.id === target);
  const to: ItemHolder =
    receiver !== undefined
      ? { survivor: receiver.id, name: receiver.name }
      : toBase
        ? 'base'
        : 'free';

  return {
    campaign: {
      ...campaign,
      inventory: toBase ? [...without(campaign.inventory), item] : without(campaign.inventory),
      survivors,
    },
    item,
    from,
    to,
  };
}
