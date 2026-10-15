/**
 * What the community owns and what its survivors carry (pp. 14, 18, 37–53;
 * #177, Z5-2).
 *
 * The catalogue is `src/data/equipment.ts`; this is what an item in the
 * campaign comes to — how many Inventory Slots a survivor has filled, what
 * their carried items add to their slots, and what may be added to the base's
 * Inventory by hand. Equipping a mission team is Z5-4's and the Skill Score's
 * item term Z5-3's; both read what is here.
 *
 * Pure, like the rest of `src/engine`.
 */

import {
  EQUIPMENT,
  GRADE_MODIFIER,
  GRADES,
  ITEM_IDS,
  type Grade,
  type ItemId,
  type ItemRules,
} from '../data/equipment';
import type { CommonSkill, Skill } from '../data/skills';
import type { Campaign, Item, Survivor } from './campaign';

/** An item's catalogue entry. */
export function rulesOf(item: Item): ItemRules {
  return EQUIPMENT[item.item];
}

/**
 * The slots one item takes. An item the book gives no slot count is counted as
 * none here: none of them can be carried yet, which Z5-4's guard keeps true.
 */
function slotsOf(item: Item): number {
  return rulesOf(item).slots ?? 0;
}

/**
 * How many of a survivor's Inventory Slots their items fill (pp. 14, 38, 44).
 *
 * A tactical holster carries one pistol or revolver without a slot (pg. 51), so
 * the first such weapon is not counted while one is carried.
 */
export function slotsInUse(survivor: Survivor): number {
  const holsters = survivor.items.filter((item) => item.item === 'tactical-holster').length;
  let holstered = 0;

  return survivor.items.reduce((total, item) => {
    if (holstered < holsters && (item.item === 'pistol' || item.item === 'revolver')) {
      holstered += 1;
      return total;
    }

    return total + slotsOf(item);
  }, 0);
}

/**
 * What a survivor's carried items add to their Inventory Slots: the ultralight
 * backpack's two and tactical armor's one (pg. 51). A backpack adds through the
 * Carry Score instead (pp. 10, 44), which is the Score's item term (Z5-3).
 */
export function itemInventorySlots(survivor: Survivor): number {
  return survivor.items.reduce(
    (total, item) => total + (rulesOf(item).adds?.[item.grade]?.inventorySlots ?? 0),
    0,
  );
}

/** Whether this item comes in this grade (pg. 37). */
function comesIn(item: ItemId, grade: Grade): boolean {
  const grades: readonly Grade[] = EQUIPMENT[item].grades;

  return grades.includes(grade);
}

/** The item and grade a hand-added item is, and the fresh id the caller made for it. */
export interface NewItem {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
}

/**
 * Why this item cannot be added to the base's Inventory by hand, or `null` if it
 * can (Z5-2).
 *
 * For a table bringing a campaign in part-way through, or correcting the count,
 * as the materials editor is. An item the catalogue has, in a grade it comes in
 * — never shoddy, which nobody owns (R35) — usable in this campaign's origin
 * (pg. 37), with an id nothing else holds.
 */
export function newItemProblem(campaign: Campaign, item: NewItem): string | null {
  if (!Object.hasOwn(EQUIPMENT, item.item)) return 'There is no such item.';
  if (!GRADES.includes(item.grade)) return 'There is no such grade.';
  if (item.grade === 'shoddy') return 'Shoddy gear is free, and the Inventory holds none (R35).';
  if (!comesIn(item.item, item.grade)) return 'That item doesn’t come in that grade.';

  const origin = rulesOf(item).origin;
  if (origin !== undefined && origin !== campaign.origin) {
    return 'That item belongs to another Origin of the Rot.';
  }

  if (idTaken(campaign, item.id)) return 'An item already has that id.';

  return null;
}

/**
 * Every item the campaign holds: the base's, the roster's, the set-aside's,
 * the rare upgrades installed in its facilities (Z5-8), and the upgrades
 * fitted to its vehicles (Z5-11).
 */
export function allItems(campaign: Campaign): readonly Item[] {
  return [
    ...campaign.inventory,
    ...[...campaign.survivors, ...campaign.setAside].flatMap((survivor) => survivor.items),
    ...Object.values(campaign.base?.slots ?? {}).flatMap((slot) => slot.installed ?? []),
    ...campaign.vehicles.flatMap((vehicle) =>
      vehicle.upgrade === undefined ? [] : [vehicle.upgrade],
    ),
  ];
}

/**
 * Whether a new item may not have this id: one the campaign holds has it, or
 * one on its way from a trade will (Z5-9), or one a Rare Items trade is for
 * (Z5-10).
 */
export function idTaken(campaign: Campaign, id: string): boolean {
  return [...allItems(campaign), ...campaign.trades, ...(campaign.rareTrade?.items ?? [])].some(
    (held) => held.id === id,
  );
}

/** Why this item cannot be taken out of the base's Inventory by hand, or `null`. */
export function removalProblem(campaign: Campaign, id: string): string | null {
  return campaign.inventory.some((item) => item.id === id)
    ? null
    : 'Only an item in the base’s Inventory can be taken out of it here.';
}

/**
 * The skills a survivor always holds a shoddy item for, free: every skill an
 * item that comes in shoddy is used with — the six weapon skills, and Tinker
 * for its tool belt (pp. 9–11, 37). Traps gives free shoddy traps too, but a
 * trap is set rather than used with a Score, so Traps is not among them.
 */
const SHODDY_SKILLS: ReadonlySet<Skill> = new Set(
  ITEM_IDS.flatMap((id) => {
    const rules: ItemRules = EQUIPMENT[id];
    return rules.grades.includes('shoddy') ? (rules.uses ?? []) : [];
  }),
);

/** Whether every survivor with the skill holds a shoddy item for it free (pp. 9–11, 37). */
export function holdsShoddyFree(skill: Skill): boolean {
  return SHODDY_SKILLS.has(skill);
}

/**
 * The carried items whose fixed bonuses count: one of each catalogue entry, the
 * best grade of it (R40). Different items stack; a second set of reinforced
 * clothing, or a second pair of binoculars, is not a different item.
 */
function bonusItems(survivor: Survivor): readonly Item[] {
  const best = new Map<ItemId, Item>();

  for (const item of survivor.items) {
    const held = best.get(item.item);
    if (held === undefined || GRADE_MODIFIER[item.grade] > GRADE_MODIFIER[held.grade]) {
      best.set(item.item, item);
    }
  }

  return [...best.values()];
}

/** What one item adds outright to a Score. */
function addedBy(item: Item, skill: Skill | CommonSkill): number {
  return rulesOf(item).adds?.[item.grade]?.scores?.[skill] ?? 0;
}

/** The carried items whose fixed bonuses move a Score, for the screen that names them. */
export function itemsAddingTo(survivor: Survivor, skill: Skill | CommonSkill): readonly Item[] {
  return bonusItems(survivor).filter((item) => addedBy(item, skill) !== 0);
}

/** What carried items add outright to one Score: their fixed bonuses, stacked (R39, R40). */
function bonusTo(survivor: Survivor, skill: Skill | CommonSkill): number {
  return bonusItems(survivor).reduce((total, item) => total + addedBy(item, skill), 0);
}

/**
 * The best item a survivor carries for a skill, by grade, or `undefined` —
 * for the screen that names it. The first carried, of two equally good, so
 * the name does not change while nothing else does.
 */
export function bestItemFor(survivor: Survivor, skill: Skill): Item | undefined {
  return survivor.items
    .filter((item) => rulesOf(item).uses?.includes(skill) === true)
    .reduce<Item | undefined>(
      (best, item) =>
        best === undefined || GRADE_MODIFIER[item.grade] > GRADE_MODIFIER[best.grade] ? item : best,
      undefined,
    );
}

/**
 * The Item term of a Skill Score (pp. 8, 14; Z5-3): the grade of the best item
 * the survivor carries that is used with the skill, or the shoddy −1 for a
 * skill whose item every survivor holds free and none better is carried; plus
 * every fixed bonus their carried items give it (R39, R40).
 *
 * The best rather than the one used, because the book's term is the item in
 * hand and the sheet cannot know which that will be: it shows what the
 * survivor could do with the best they carry.
 */
export function itemTerm(survivor: Survivor, skill: Skill): number {
  const best = bestItemFor(survivor, skill);
  const grade =
    best !== undefined
      ? GRADE_MODIFIER[best.grade]
      : holdsShoddyFree(skill)
        ? GRADE_MODIFIER.shoddy
        : 0;

  return grade + bonusTo(survivor, skill);
}

/**
 * The cap a carried item puts on a Score, or `undefined`: the tool belt's on
 * Stealth (pg. 44). The first found, since the tool belt is the only item that
 * caps anything and every grade of it caps alike (`rules.test` holds both).
 */
export function itemCap(survivor: Survivor, skill: Skill): number | undefined {
  return survivor.items.map((item) => rulesOf(item).caps?.[skill]).find((cap) => cap !== undefined);
}

/**
 * Move or Defense with what is worn (pp. 9, 45, 51; Z5-3): the Score bought
 * with experience, plus reinforced clothing's and tactical armor's Defense and
 * less a standard shield's or clothing's Move. Never below zero.
 */
export function commonSkillScore(survivor: Survivor, skill: CommonSkill): number {
  return Math.max(0, survivor[skill] + bonusTo(survivor, skill));
}
