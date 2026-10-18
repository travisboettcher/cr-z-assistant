/**
 * Reading a save file back — the import half of the round trip.
 *
 * Every failure here reaches someone standing next to a table with miniatures
 * on it, holding a tablet, part-way through a campaign. So nothing throws and
 * nothing leaks a `SyntaxError`: each way this can go wrong gets a sentence
 * that says what to do about it.
 *
 * Validation is hand-rolled rather than a schema library. `Campaign` is a dozen
 * fields, and a schema would have to be kept in sync with the type *and* with
 * every migration — more surface than it saves at this size. Phases 2 and 3
 * have since made the shape genuinely wide, and the two tables below are the
 * first place it starts to look like a schema written longhand. Still not worth
 * a library: what a table buys here is the exhaustive `Record` over the event
 * kinds, which is a typecheck a schema would have to be told about.
 */

import { BASES } from '../data/bases';
import { FACILITIES, facilityOfUpgrade, type UpgradeId } from '../data/facilities';
import { COMMON_SKILLS, SKILL_STATS, STATS } from '../data/skills';
import { D10_RESULTS } from '../data/dice';
import { TIERS } from '../data/tiers';
import { MATERIALS } from '../data/materials';
import { EQUIPMENT, GRADES, VEHICLE_TIERS, type ItemId } from '../data/equipment';
import { MISSIONS, OVERRUN_OPTIONS, STORY_MISSION_IDS } from '../data/missions';
import { FIELD_RECRUITABLE_TIERS } from '../data/recruitTable';
import { CAMPAIGN_ORIGINS } from '../data/origins';
import { CAMPAIGN_PHASES, HEALTH_SOURCES, XP_SOURCES } from '../data/turn';
import type { Assignment, Campaign, Project } from '../engine/campaign';
import { STORY_TRAITS } from '../data/traits';
import {
  LEAVING_CAUSES,
  RARE_TRADE_LOSSES,
  STORY_ITEM_SOURCES,
  type CampaignEventKind,
} from '../engine/log';
import { TURN_SEQUENCE } from '../engine/turn';
import { migrate, type MigrationErrorReason } from './migrations';

/**
 * Why a file could not be opened.
 *
 * `MigrationErrorReason` is spliced in rather than restated so that a reason
 * added to the migration chain later widens this union automatically — a
 * hand-copied list would go stale the first time the chain grew a new failure.
 */
export type SaveFileErrorReason =
  'unreadable-file' | 'invalid-json' | 'not-a-campaign' | 'damaged-campaign' | MigrationErrorReason;

export interface SaveFileError {
  readonly reason: SaveFileErrorReason;

  /** A sentence for a person holding a tablet mid-campaign, not a stack trace. */
  readonly message: string;
}

/** A discriminated result, for the same reason `MigrationResult` is one. */
export type SaveFileResult =
  | { readonly ok: true; readonly campaign: Campaign }
  | { readonly ok: false; readonly error: SaveFileError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a catalogue actually has an entry under this name.
 *
 * **`Object.hasOwn`, never `in`.** `in` walks the prototype chain, so
 * `'toString' in FACILITIES` is `true` and a save file naming a facility
 * `toString` sails through validation — after which the screen that looks it up
 * gets `Function.prototype.toString` and either renders nonsense or throws
 * somewhere far from here. The names to worry about are ordinary strings a
 * person could type into a file by hand or by accident: `constructor`,
 * `toString`, `valueOf`.
 *
 * This module's contract is that a damaged file comes back as a sentence, never
 * as an exception, and `in` is the one thing in it that quietly broke that.
 */
function isKeyOf(catalogue: object, key: string): boolean {
  return Object.hasOwn(catalogue, key);
}

/** Whether a value names a survivor by id and by the name they had, as every reference does. */
function isRef(one: unknown): one is Record<string, unknown> {
  return (
    isRecord(one) &&
    typeof one.survivor === 'string' &&
    one.survivor !== '' &&
    typeof one.name === 'string'
  );
}

/** Whether a field is absent, or passes its check. */
function optional(field: unknown, check: (one: unknown) => boolean): boolean {
  return field === undefined || check(field);
}

const isD10 = (one: unknown) => D10_RESULTS.some((result) => result === one);

/** A story's attachment: a story mission, and who it went to. */
const isAttachment = (one: unknown) =>
  isRef(one) && STORY_MISSION_IDS.some((id) => id === one.mission);

/** What a story gave a new survivor's build (Z7-4): a skill, Dexterity, and an item. */
function isStoryBuild(one: unknown): boolean {
  return (
    isRecord(one) &&
    typeof one.skill === 'string' &&
    isKeyOf(SKILL_STATS, one.skill) &&
    isRecord(one.stat) &&
    isCountFromZero(one.stat.dexterity) &&
    describeItemProblem({ id: 'build', ...(isRecord(one.item) ? one.item : {}) }) === null
  );
}

/** One item a story gave (Z7-4): an item, how it came, and who holds it if anybody. */
function isStoryItem(one: unknown): boolean {
  return (
    describeItemProblem(one) === null &&
    isRecord(one) &&
    STORY_ITEM_SOURCES.some((source) => source === one.from) &&
    (one.survivor === undefined || isRef(one)) &&
    optional(one.subtable, isD10) &&
    optional(one.entry, isD10)
  );
}

/** A Viral mission's counts, as `ViralRecord` shapes them: only its own fields, each optional. */
function isViralRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const counts = ['investigated', 'zombiesLeft', 'supplies'] as const;
  const flags = ['brokenCage', 'held'] as const;

  return (
    Object.keys(value).every((key) => ([...counts, ...flags] as readonly string[]).includes(key)) &&
    counts.every((key) => optional(value[key], isCountFromZero)) &&
    flags.every((key) => optional(value[key], (flag) => typeof flag === 'boolean'))
  );
}

/** A story's record, as `StoryRecord` shapes it. */
function isStoryRecord(value: unknown): boolean {
  if (!isRef(value)) return false;

  const { attached, joins } = value;

  return (
    typeof value.result === 'string' &&
    value.result !== '' &&
    optional(value.xp, isCountFromOne) &&
    optional(value.trait, (trait) => STORY_TRAITS.some((each) => each === trait)) &&
    optional(value.bondGroup, isCountFromOne) &&
    optional(value.stays, (stays) => stays === true) &&
    optional(attached, isAttachment) &&
    optional(
      joins,
      (one) =>
        isRecord(one) &&
        TIERS.some((tier) => tier === one.tier) &&
        optional(one.bondGroup, isCountFromOne) &&
        optional(one.xp, isCountFromOne) &&
        optional(one.build, isStoryBuild),
    ) &&
    // What Z7-4 added: the things an ending gives.
    optional(value.alsoAttached, (list) => Array.isArray(list) && list.every(isAttachment)) &&
    optional(value.items, (list) => Array.isArray(list) && list.every(isStoryItem)) &&
    optional(value.food, isCountFromOne) &&
    optional(value.vehicle, (one) => describeVehicleProblem(one) === null) &&
    optional(value.jaded, isRef) &&
    optional(value.resources, isCountFromZero)
  );
}

function isCountFromOne(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isCountFromZero(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Names the first thing structurally wrong with one survivor, or `null`.
 *
 * **Shape only — never legality.** Whether a Tier 2 survivor is allowed three
 * skills, or a level-4 one, is a rule, and Z1-7 lets a player override those
 * rules deliberately. A campaign that was saved with an override in it is a
 * campaign this must still open; refusing it here would make the override a
 * feature that silently destroys the save that used it.
 *
 * So: is `tier` one of the four Tiers, are the stats present and countable, are
 * the skill keys skills that exist. Not: is any of it a legal survivor.
 */
/**
 * What is wrong with one item, or `null` (Z5-2): an id, an entry in the
 * catalogue, and a grade that entry exists in (pg. 37).
 */
function describeItemProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t an item';
  if (typeof value.id !== 'string' || value.id === '') return 'has no id';
  if (typeof value.item !== 'string' || !isKeyOf(EQUIPMENT, value.item)) {
    return `is an item this version doesn’t know: ${String(value.item)}`;
  }

  const grades: readonly unknown[] = EQUIPMENT[value.item as ItemId].grades;
  if (!grades.includes(value.grade))
    return `is ${String(value.item)} in a grade it doesn’t come in`;

  return null;
}

/** The first problem with a list of items, naming which, or `null`. */
function describeItemsProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'isn’t a list';

  for (const [index, item] of value.entries()) {
    const problem = describeItemProblem(item);
    if (problem !== null) return `item ${String(index + 1)} of ${String(value.length)} ${problem}`;
  }

  return null;
}

/**
 * A trade on its way (Z5-9): an item, as the Inventory's are, with what was
 * paid and the turn it was ordered on.
 */
function describeTradesProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'isn’t a list';

  for (const [index, trade] of value.entries()) {
    const which = `trade ${String(index + 1)} of ${String(value.length)}`;
    const problem = describeItemProblem(trade);
    if (problem !== null) return `${which} ${problem}`;

    const { food, fuel, orderedOnTurn } = trade as Record<string, unknown>;
    if (!isCountFromZero(food) || !isCountFromZero(fuel))
      return `${which} doesn’t say what it cost`;
    if (!isCountFromOne(orderedOnTurn)) return `${which} doesn’t say which turn it was ordered on`;
  }

  return null;
}

/**
 * The items of a Rare Items trade (Z5-10): each an item, as the Inventory's
 * are, with the two dice that found it and the Food and Fuel set aside for it.
 */
function describeRareTradeItemsProblem(value: unknown): string | null {
  if (!Array.isArray(value)) return 'isn’t a list';

  for (const [index, item] of value.entries()) {
    const which = `item ${String(index + 1)} of ${String(value.length)}`;
    const problem = describeItemProblem(item);
    if (problem !== null) return `${which} ${problem}`;

    const { subtable, entry, food, fuel } = item as Record<string, unknown>;
    if (!EVENT_FIELD_CHECKS.roll(subtable) || !EVENT_FIELD_CHECKS.roll(entry)) {
      return `${which} doesn’t say which roll found it`;
    }
    if (!isCountFromZero(food) || !isCountFromZero(fuel)) {
      return `${which} doesn’t say what was set aside for it`;
    }
  }

  return null;
}

/**
 * A vehicle (Z5-11): an id, a Tier, a label, whether it is a boat, and where
 * they are written, Tier 4's split and its upgrade. Shape only: whether the
 * split suits the Tier is the engine's, as everywhere here.
 */
function describeVehicleProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t a vehicle';
  if (typeof value.id !== 'string' || value.id === '') return 'has no id';
  if (!VEHICLE_TIERS.some((tier) => tier === value.tier)) return 'has no Tier from 1 to 4';
  if (typeof value.label !== 'string') return 'has no label';
  if (typeof value.water !== 'boolean') return 'doesn’t say whether it is a boat';
  if (value.inventorySlots !== undefined && !isCountFromZero(value.inventorySlots)) {
    return 'has an unreadable split of its slots';
  }
  if (value.upgrade !== undefined) {
    const problem = describeItemProblem(value.upgrade);
    if (problem !== null) return `has an upgrade that ${problem}`;
  }

  return null;
}

/** Vehicles, each as `describeVehicleProblem` reads one, and its setup roll where `rolled`. */
function describeVehiclesProblem(value: unknown, rolled = false): string | null {
  if (!Array.isArray(value)) return 'isn’t a list';

  for (const [index, vehicle] of value.entries()) {
    const which = `vehicle ${String(index + 1)} of ${String(value.length)}`;
    const problem = describeVehicleProblem(vehicle);
    if (problem !== null) return `${which} ${problem}`;
    if (rolled && !EVENT_FIELD_CHECKS.roll((vehicle as Record<string, unknown>).roll)) {
      return `${which} doesn’t say what its Tier rolled`;
    }
  }

  return null;
}

/** A Rare Items trade under way (Z5-10), or `null` for none. */
function describeRareTradeProblem(value: unknown): string | null {
  if (value === null) return null;
  if (!isRecord(value)) return 'isn’t a trade';
  if (!isCountFromOne(value.madeOnTurn)) return 'doesn’t say which turn it was made on';

  return describeRareTradeItemsProblem(value.items);
}

function describeSurvivorProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t a survivor';

  if (typeof value.id !== 'string' || value.id === '') return 'has no id';
  if (typeof value.name !== 'string') return 'has no name';
  if (!TIERS.some((tier) => tier === value.tier)) {
    return `has a Tier that isn’t one of ${TIERS.join(', ')}`;
  }

  const stats: unknown = value.stats;
  if (!isRecord(stats)) return 'has no stats';
  for (const stat of STATS) {
    if (!isCountFromZero(stats[stat])) return `has no ${stat} score`;
  }

  const skills: unknown = value.skills;
  if (!isRecord(skills)) return 'has no skill list';
  for (const [skill, level] of Object.entries(skills)) {
    if (!isKeyOf(SKILL_STATS, skill)) return `has a skill this version doesn’t know: ${skill}`;
    if (!isCountFromZero(level)) return `has an unreadable level for ${skill}`;
  }

  if (!isCountFromZero(value.move)) return 'has no move score';
  if (!isCountFromZero(value.defense)) return 'has no defense score';
  if (!isCountFromZero(value.currentHp)) return 'has unreadable health';
  // Any count, not capped at 10: a survivor at 10 is down rather than gone
  // (pg. 123), and what is above it is a table's typing, not a damaged file.
  if (!isCountFromZero(value.infection)) return 'has unreadable infection';
  // Any count too: at 13 a survivor goes Lost at Departures (R106), and what is
  // above it is the table's count until then.
  if (!isCountFromZero(value.madness)) return 'has unreadable madness';
  if (!isCountFromZero(value.xp)) return 'has unreadable experience';

  // What they carry (Z5-2). A current-version survivor with no list is damaged
  // rather than old: the v15 → v16 step is what fills it in.
  const items = describeItemsProblem(value.items);
  if (items !== null) return `carries a list that ${items}`;

  // Their Story Trait, Veteran and bond group (Z7-1). A bond group only on a
  // Bonded survivor, since nobody else can be bonded (R84).
  if (value.storyTrait !== null && !STORY_TRAITS.some((trait) => trait === value.storyTrait)) {
    return 'has a story trait that isn’t one of the five';
  }
  if (typeof value.veteran !== 'boolean') return 'doesn’t say whether they are a Veteran';
  if (value.bondGroup !== null && !isCountFromOne(value.bondGroup)) {
    return 'has an unreadable bond group';
  }
  if ((value.bondGroup !== null) !== (value.storyTrait === 'bonded')) {
    return value.bondGroup === null
      ? 'is Bonded with no bond group'
      : 'has a bond group without being Bonded';
  }

  // The stories attached to them (Z7-2), each a story mission and its turn.
  if (!Array.isArray(value.stories)) return 'has no list of stories';
  for (const story of value.stories as unknown[]) {
    if (!isRecord(story)) return 'has a story that isn’t a story';
    if (!STORY_MISSION_IDS.some((id) => id === story.mission)) {
      return 'has a story that isn’t a story mission';
    }
    if (!isCountFromOne(story.attachedOnTurn)) return 'has a story with no turn it was attached';
  }

  // Rot Resistant (Z7-5), yes or no.
  if (typeof value.rotResistant !== 'boolean') {
    return 'doesn’t say whether they are Rot Resistant';
  }

  return null;
}

/**
 * Names the first thing structurally wrong with one slot's state, or `null`.
 *
 * **Shape only, exactly as `describeSurvivorProblem` is.** Whether the upgrade
 * belongs to the facility it sits on, whether the facility fits the slot's
 * kind, whether there are more than three upgrades — those are rules, and
 * Z2-5 and Z2-6 let a player override them on purpose. A save written with an
 * override in it has to open, or the override becomes a feature that destroys
 * the campaign that used it.
 *
 * So: does the facility exist, does the upgrade exist, is the turn a turn. Not:
 * is any of it a legal base.
 */
function describeSlotProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t a slot';

  if (value.cleared !== undefined && value.cleared !== true) {
    return 'records something other than cleared for its clearing project';
  }

  const built: unknown = value.built;
  if (built !== undefined) {
    if (!isRecord(built)) return 'has an unreadable facility';
    if (typeof built.facility !== 'string' || !isKeyOf(FACILITIES, built.facility)) {
      return `holds a facility this version doesn’t know: ${String(built.facility)}`;
    }
    if (!isCountFromOne(built.builtOnTurn)) return 'doesn’t say which turn it was built on';
  }

  const upgrades: unknown = value.upgrades;
  if (upgrades !== undefined) {
    if (!Array.isArray(upgrades)) return 'has an unreadable upgrade list';
    for (const upgrade of upgrades) {
      if (typeof upgrade !== 'string' || facilityOfUpgrade(upgrade as UpgradeId) === undefined) {
        return `has an upgrade this version doesn’t know: ${String(upgrade)}`;
      }
    }
  }

  for (const utility of ['power', 'water'] as const) {
    if (value[utility] !== undefined && value[utility] !== true) {
      return `records something other than assigned for its ${utility}`;
    }
  }

  // Rare upgrades installed here (R47; Z5-8): items, each one installed.
  if (value.installed !== undefined) {
    const installed = describeItemsProblem(value.installed);
    if (installed !== null) return `has installed items where ${installed}`;
    if (
      (value.installed as readonly { readonly item: ItemId }[]).some(
        (item) => EQUIPMENT[item.item].kind !== 'rare-upgrade',
      )
    ) {
      return 'has an item installed that isn’t a rare upgrade';
    }
  }

  return null;
}

/**
 * Names the first thing structurally wrong with a base, or `null`.
 *
 * A slot id that is not in the claimed base's layout is a damaged save rather
 * than a slot the app has not heard of: `Base.slots` is keyed by the layout in
 * `src/data/bases.ts`, so a key outside it refers to nothing and no later phase
 * could render or reason about it.
 */
function describeBaseProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'its base isn’t a base';

  if (typeof value.id !== 'string' || !isKeyOf(BASES, value.id)) {
    return `its base is one this version doesn’t know: ${String(value.id)}`;
  }

  const slots: unknown = value.slots;
  if (!isRecord(slots)) return 'its base has no slots';

  const layout = BASES[value.id as keyof typeof BASES].slots;

  for (const [id, state] of Object.entries(slots)) {
    if (!layout.some((slot) => slot.id === id)) {
      return `its base has a slot the ${value.id} doesn’t have: ${id}`;
    }

    const problem = describeSlotProblem(state);
    if (problem !== null) return `the ${id} slot of its base ${problem}`;
  }

  return null;
}

/**
 * How to check one field of a log event, by the field's name.
 *
 * Shared across events rather than written per kind, because the vocabulary is
 * small and the same `slot` means the same thing whether a facility went up in
 * it or the rubble came out. Two names for skills, though — a governed skill
 * and a common skill are different sets (pg. 9), and one checker covering both
 * would accept `move` where only the twenty are legal.
 */
const EVENT_FIELD_CHECKS = {
  id: (value: unknown) => typeof value === 'string' && value !== '',
  name: (value: unknown) => typeof value === 'string',
  count: isCountFromZero,
  countFromOne: isCountFromOne,
  // Materials added in a turn can come out negative: a facility that eats Food
  // (pg. 55) can outweigh what the mission recovered.
  amount: (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value),
  xpSource: (value: unknown) => XP_SOURCES.some((source) => source === value),
  healthSource: (value: unknown) => HEALTH_SOURCES.some((source) => source === value),
  flag: (value: unknown) => typeof value === 'boolean',
  // For a field an older entry legitimately does not carry. Absent is a real
  // answer here and a damaged one everywhere else, which is why it is its own
  // check rather than a flag on the loop below.
  optionalCount: (value: unknown) => value === undefined || isCountFromZero(value),
  // The Rare an entry written before v17 counted (R49): any whole amount, or
  // absent on every entry since.
  optionalAmount: (value: unknown) =>
    value === undefined || (typeof value === 'number' && Number.isSafeInteger(value)),
  // The same shape for an id: what a cancelled or unfinished project was, on
  // entries written since they started saying. Not checked against the
  // catalogue, for the reason `optionalAssignments` is not checked against the
  // roster — this is history, and a save can name a facility a later edition
  // renamed.
  optionalId: (value: unknown) =>
    value === undefined || (typeof value === 'string' && value !== ''),
  // The same shape for a name, beside an optional id: a stand-in's, on an
  // entry that may record that nobody stands in at all (#183).
  optionalName: (value: unknown) => value === undefined || typeof value === 'string',
  // Everybody who deployed to a Siege Defense, by name (pg. 85). A list rather
  // than a count, and of names rather than ids, because it is a record for a
  // reader: a community that fought a siege is the roster as it stood, and the
  // survivors in it may be gone by the time anybody looks.
  names: (value: unknown) =>
    Array.isArray(value) && value.every((one) => typeof one === 'string' && one !== ''),
  // What a `planning-began` entry cleared, or nothing at all for one written
  // before it carried anything. Deliberately **not** checked against the roster
  // the way the campaign's own `assignments` are: this is history, and the turn
  // it records can name somebody who has since walked out (pg. 23) or been
  // taken off by hand.
  optionalAssignments: (value: unknown) =>
    value === undefined ||
    (isRecord(value) &&
      Object.values(value).every((one) => describeAssignmentProblem(one) === null)),
  tier: (value: unknown) => TIERS.some((tier) => tier === value),
  // A trade's two halves: some of the three materials, each a whole count of
  // one or more. Partial because a trade names only what it moves, and every
  // amount positive because the entry records the spend as it was paid rather
  // than as a negative — "2 Fuel for 1 Food" is one trade, not two movements.
  materialAmounts: (value: unknown) =>
    isRecord(value) &&
    Object.entries(value).every(
      ([material, amount]) =>
        (MATERIALS as readonly string[]).includes(material) && isCountFromOne(amount),
    ),
  roll: (value: unknown) => D10_RESULTS.some((result) => result === value),
  // A Rookie is recruited without one (pg. 7), and an entry written before the
  // form stopped offering the die carries one that did nothing. Both are
  // readable campaigns; only a roll that is not a d10 result is damage.
  optionalRoll: (value: unknown) =>
    value === undefined || D10_RESULTS.some((result) => result === value),
  skill: (value: unknown) => typeof value === 'string' && isKeyOf(SKILL_STATS, value),
  commonSkill: (value: unknown) => COMMON_SKILLS.some((skill) => skill === value),
  base: (value: unknown) => typeof value === 'string' && isKeyOf(BASES, value),
  facility: (value: unknown) => typeof value === 'string' && isKeyOf(FACILITIES, value),
  mission: (value: unknown) => typeof value === 'string' && isKeyOf(MISSIONS, value),
  // The team an outcome ends; absent on a Siege Defense or Thin the Herd
  // recorded before Z4-3, which was the turn's only team.
  optionalTeam: (value: unknown) => value === undefined || isCountFromOne(value),
  // Each team member's Health at the end, and Infection in a Viral campaign
  // (Z4-4); absent on every outcome written before. Shape only: not held to
  // the roster or to anybody's maximum, for the reason `optionalAssignments`
  // is not — this is history, and the survivor it names may have left, or
  // been promoted, since. Infection is any count, as on the survivor, and so
  // is Madness in a Cosmic Horror campaign (Z7-7).
  optionalWounds: (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (wound) =>
          isRecord(wound) &&
          typeof wound.survivor === 'string' &&
          wound.survivor !== '' &&
          typeof wound.name === 'string' &&
          isCountFromZero(wound.health) &&
          (wound.infection === undefined || isCountFromZero(wound.infection)) &&
          (wound.madness === undefined || isCountFromZero(wound.madness)),
      )),
  // Which numbered end condition was met, or `null` for none (pp. 77, 79).
  // Which numbers a mission has is the engine's to check, not a file's.
  endCondition: (value: unknown) => value === null || isCountFromOne(value),
  // The Tier of each stranger brought out, in the order the table counted them:
  // a Rookie, Citizen or Leader, since a Hero is never rescued (pg. 7; R24).
  tiers: (value: unknown) =>
    Array.isArray(value) &&
    value.every((one) => FIELD_RECRUITABLE_TIERS.some((tier) => tier === one)),
  // Gather Materials' remainder type (pg. 80), and absent for every other
  // mission. Which mission asks for one is the engine's to check, not a file's.
  optionalMaterial: (value: unknown) =>
    value === undefined || (MATERIALS as readonly unknown[]).includes(value),
  // The base a Claim a New Base team is claiming (pg. 78; Z4-7), and absent
  // for every other mission and for a Claim chosen before Z4-7.
  // Survivors named by id and by the name they had, as the wounds are: a list,
  // each with both, and the name may be anything a player typed.
  survivorRefs: (value: unknown) =>
    Array.isArray(value) &&
    value.every(
      (one) =>
        isRecord(one) &&
        typeof one.survivor === 'string' &&
        one.survivor !== '' &&
        typeof one.name === 'string',
    ),
  // What was in storage after a move that followed an overrun (R29, R30): all
  // three materials, each a whole count from zero, or absent for any other move.
  // An entry from before v17 also counts Rare (R49), which is history and kept.
  optionalStores: (value: unknown) =>
    value === undefined ||
    (isRecord(value) && MATERIALS.every((material) => isCountFromZero(value[material]))),
  // What a reclaimed base may build again for free (Z4-10): a slot each, with a
  // facility from the catalogue or none, and upgrades from it. Whether the
  // slot is the base's is the engine's to read, as a project's slot is.
  optionalRebuild: (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (one) =>
          isRecord(one) &&
          typeof one.slot === 'string' &&
          one.slot !== '' &&
          (one.facility === undefined ||
            (typeof one.facility === 'string' && isKeyOf(FACILITIES, one.facility))) &&
          Array.isArray(one.upgrades) &&
          one.upgrades.every(
            (upgrade) =>
              typeof upgrade === 'string' && facilityOfUpgrade(upgrade as UpgradeId) !== undefined,
          ),
      )),
  // Survivors named by id alone: who a Rescue Strangers mission brought back.
  optionalIds: (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) && value.every((one) => typeof one === 'string' && one !== '')),
  // An item in the catalogue, and one of the three grades (Z5-2). Whether the
  // item comes in that grade is the item's own check, on the Inventory.
  itemId: (value: unknown) => typeof value === 'string' && isKeyOf(EQUIPMENT, value),
  grade: (value: unknown) => GRADES.some((grade) => grade === value),
  // What a mission used up (Z5-5): each item by id, catalogue entry and grade,
  // and who had it. History, so not held to the roster.
  spentItems: (value: unknown) =>
    Array.isArray(value) &&
    value.every(
      (one) =>
        isRecord(one) &&
        typeof one.id === 'string' &&
        one.id !== '' &&
        typeof one.item === 'string' &&
        isKeyOf(EQUIPMENT, one.item) &&
        GRADES.some((grade) => grade === one.grade) &&
        typeof one.survivor === 'string' &&
        one.survivor !== '' &&
        typeof one.name === 'string',
    ),
  // Items a base handed over (Z5-8), each checked as an Inventory item is.
  items: (value: unknown) => describeItemsProblem(value) === null,
  trades: (value: unknown) => describeTradesProblem(value) === null,
  optionalItems: (value: unknown) => value === undefined || describeItemsProblem(value) === null,
  rareTradeItems: (value: unknown) => describeRareTradeItemsProblem(value) === null,
  item: (value: unknown) => describeItemProblem(value) === null,
  vehicle: (value: unknown) => describeVehicleProblem(value) === null,
  vehicles: (value: unknown) => describeVehiclesProblem(value) === null,
  vehicleTier: (value: unknown) => VEHICLE_TIERS.some((tier) => tier === value),
  optionalRetrieved: (value: unknown) =>
    value === undefined || describeVehiclesProblem(value, true) === null,
  rareTradeLoss: (value: unknown) => RARE_TRADE_LOSSES.some((reason) => reason === value),
  // One end of an item's move (Z5-4): the base, the free shoddy supply, or a
  // survivor by id and name. Not held to the roster, since this is history.
  holder: (value: unknown) =>
    value === 'base' ||
    value === 'free' ||
    (isRecord(value) &&
      typeof value.survivor === 'string' &&
      value.survivor !== '' &&
      typeof value.name === 'string'),
  optionalFlag: (value: unknown) => value === undefined || typeof value === 'boolean',
  optionalTrue: (value: unknown) => value === undefined || value === true,
  optionalItemId: (value: unknown) =>
    value === undefined || (typeof value === 'string' && value !== ''),
  optionalCountFromOne: (value: unknown) => value === undefined || isCountFromOne(value),
  optionalStoryMission: (value: unknown) =>
    value === undefined || STORY_MISSION_IDS.some((id) => id === value),
  // A story's ending and what it gave (Z7-3), absent on any other mission and
  // before. Shape only, as the wounds are: history, not held to the roster or
  // to the story's own endings, which the rules data may later change.
  optionalStoryRecord: (value: unknown) => value === undefined || isStoryRecord(value),
  optionalStoryBuild: (value: unknown) => value === undefined || isStoryBuild(value),
  // A Viral mission's counts (Z7-6), absent on any other mission and before.
  optionalViralRecord: (value: unknown) => value === undefined || isViralRecord(value),
  // Why a survivor left (#201), absent on an entry from before it was recorded.
  optionalLeavingCause: (value: unknown) =>
    value === undefined || LEAVING_CAUSES.some((cause) => cause === value),
  overrunOption: (value: unknown) => OVERRUN_OPTIONS.some((option) => option === value),
  optionalBase: (value: unknown) =>
    value === undefined || (typeof value === 'string' && isKeyOf(BASES, value)),
  upgrade: (value: unknown) =>
    typeof value === 'string' && facilityOfUpgrade(value as UpgradeId) !== undefined,
} as const;

type EventFieldCheck = keyof typeof EVENT_FIELD_CHECKS;

/**
 * The fields each kind of event carries, and how to check each one.
 *
 * A full `Record` over the event kinds, so an event added to `log.ts` without a
 * line here fails the typecheck rather than sailing through validation
 * unchecked — the same guarantee `inFileOrder` gives the campaign's own fields.
 * `phase-entered` and `turn-began` carry nothing: which phase, and which turn,
 * are the entry's own.
 */
const EVENT_FIELDS: Record<
  CampaignEventKind,
  readonly (readonly [field: string, check: EventFieldCheck])[]
> = {
  'campaign-started': [['name', 'name']],
  'phase-entered': [],
  'turn-began': [],
  'starting-community-settled': [['built', 'flag']],
  'planning-began': [['cleared', 'optionalAssignments']],
  'siege-fought': [['names', 'names']],
  'materials-scavenged': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['food', 'count'],
    ['fuel', 'count'],
    ['hardware', 'count'],
    ['rare', 'optionalCount'],
  ],
  'materials-added': [
    ['food', 'amount'],
    ['fuel', 'amount'],
    ['hardware', 'amount'],
    ['rare', 'optionalAmount'],
  ],
  'materials-converted': [
    ['slot', 'id'],
    ['source', 'id'],
    ['spent', 'materialAmounts'],
    ['gained', 'materialAmounts'],
  ],
  'survivors-fed': [
    ['required', 'count'],
    ['hunger', 'count'],
    // Recorded since the hunger penalty stopped being re-priced by a later
    // departure; entries written before that do not carry it.
    ['population', 'optionalCount'],
  ],
  'rot-checked': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['roll', 'roll'],
    ['target', 'amount'],
    ['passed', 'flag'],
  ],
  // The Viral origin's Infection check (Z7-5): against Infection from 1, with
  // the community's Medicine, which a Score can make any whole number.
  'infection-checked': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['roll', 'roll'],
    ['infection', 'countFromOne'],
    ['bonus', 'amount'],
    ['passed', 'flag'],
  ],
  'survivor-inoculated': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['item', 'id'],
  ],
  'infection-resisted': [
    ['survivor', 'id'],
    ['name', 'name'],
  ],
  'madness-recovered': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['madness', 'countFromOne'],
  ],
  'infection-contained': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['infection', 'countFromOne'],
  ],
  'bite-restrained': [
    ['survivor', 'id'],
    ['name', 'name'],
  ],
  'survivor-bitten': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['damage', 'countFromOne'],
  ],
  'facility-ordered': [
    ['slot', 'id'],
    ['facility', 'facility'],
  ],
  'upgrade-ordered': [
    ['slot', 'id'],
    ['upgrade', 'upgrade'],
  ],
  'clearing-ordered': [['slot', 'id']],
  'project-cancelled': [
    ['slot', 'id'],
    // Recorded since the history started saying what came back, and what it
    // was; entries written before that do not carry either.
    ['hardware', 'optionalCount'],
    ['built', 'optionalId'],
  ],
  'project-unfinished': [
    ['slot', 'id'],
    // As above, and for the same reason: the refund is the same one.
    ['hardware', 'optionalCount'],
    ['built', 'optionalId'],
  ],
  'stood-in': [
    ['survivor', 'id'],
    ['name', 'name'],
    // Absent where the place was left empty again — choosing "nobody" is an
    // answer, and the latest entry is the one that counts.
    ['by', 'optionalId'],
    ['byName', 'optionalName'],
  ],
  'storage-checked': [
    ['food', 'count'],
    ['fuel', 'count'],
    ['hardware', 'count'],
  ],
  'horde-checked': [
    ['roll', 'roll'],
    ['threat', 'amount'],
    ['siege', 'flag'],
  ],
  'mission-selected': [
    ['team', 'countFromOne'],
    ['mission', 'mission'],
    ['names', 'names'],
    ['material', 'optionalMaterial'],
    ['base', 'optionalBase'],
  ],
  'mission-skipped': [],
  'siege-defense-resolved': [
    ['zombiesLeft', 'count'],
    ['survivorsExited', 'count'],
    ['team', 'optionalTeam'],
    ['wounds', 'optionalWounds'],
  ],
  'thin-the-herd-resolved': [
    ['startingZombies', 'count'],
    ['zombiesLeft', 'count'],
    ['survivorsExited', 'count'],
    ['allIncapacitated', 'flag'],
    ['team', 'optionalTeam'],
    ['wounds', 'optionalWounds'],
  ],
  'first-mission-resolved': [
    ['team', 'countFromOne'],
    ['endCondition', 'endCondition'],
    ['strangers', 'tiers'],
    ['wounds', 'optionalWounds'],
  ],
  'claim-a-new-base-resolved': [
    ['team', 'countFromOne'],
    ['endCondition', 'endCondition'],
    ['strangers', 'tiers'],
    ['vehiclesOnArea', 'count'],
    ['sameMap', 'optionalFlag'],
    ['wounds', 'optionalWounds'],
  ],
  'gather-materials-resolved': [
    ['team', 'countFromOne'],
    ['materialsCarriedOut', 'count'],
    ['strangers', 'tiers'],
    ['wounds', 'optionalWounds'],
  ],
  'retrieve-new-vehicles-resolved': [
    ['team', 'countFromOne'],
    ['vehiclesDrivenOff', 'count'],
    ['retrieved', 'optionalRetrieved'],
    ['strangers', 'tiers'],
    ['wounds', 'optionalWounds'],
  ],
  'rescue-strangers-resolved': [
    ['team', 'countFromOne'],
    ['strangers', 'tiers'],
    ['returned', 'optionalIds'],
    ['wounds', 'optionalWounds'],
  ],
  'rare-goods-trader-resolved': [
    ['team', 'countFromOne'],
    ['survivorsExited', 'count'],
    ['itemsTraded', 'optionalCount'],
    ['strangers', 'tiers'],
    ['wounds', 'optionalWounds'],
  ],
  'mission-played': [
    ['team', 'countFromOne'],
    ['mission', 'mission'],
    ['wounds', 'optionalWounds'],
    ['story', 'optionalStoryRecord'],
    ['viral', 'optionalViralRecord'],
  ],
  'health-restored': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['health', 'countFromOne'],
    ['source', 'healthSource'],
    // Recorded since a point could remove Infection instead (#176); entries
    // written before that, and every one outside a Viral campaign, do not
    // carry it.
    ['infection', 'optionalCount'],
  ],
  'xp-awarded': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['amount', 'countFromOne'],
    ['source', 'xpSource'],
  ],
  'survivor-added': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
  ],
  'survivor-recruited': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    ['roll', 'optionalRoll'],
  ],
  'stranger-joined': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    // Which rescue this answers: the team whose outcome counted the stranger,
    // and their place in its list from 0 (Z4-5). Whether that outcome exists
    // is the engine's to ask, as an outcome's team is.
    ['team', 'countFromOne'],
    ['stranger', 'count'],
    ['roll', 'optionalRoll'],
    // What a story gave a survivor it brought (Z7-3), absent for any other.
    ['bondGroup', 'optionalCountFromOne'],
    ['xp', 'optionalCountFromOne'],
    ['build', 'optionalStoryBuild'],
  ],
  'survivor-left': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    ['cause', 'optionalLeavingCause'],
    ['team', 'optionalTeam'],
    ['lost', 'optionalItems'],
  ],
  'survivor-departed': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    ['items', 'optionalItems'],
  ],
  'survivor-lost': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['madness', 'countFromOne'],
    ['items', 'optionalItems'],
  ],
  'mission-team-reduced': [
    ['survivor', 'id'],
    ['name', 'name'],
  ],
  'veteran-healed': [
    ['veteran', 'id'],
    ['veteranName', 'name'],
    ['survivor', 'id'],
    ['name', 'name'],
  ],
  'survivor-promoted': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    // What a promotion gave (Z7-2), absent on an entry from before it did.
    ['story', 'optionalStoryMission'],
    ['veteran', 'optionalTrue'],
  ],
  'skill-level-bought': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['skill', 'skill'],
    ['level', 'count'],
  ],
  'common-skill-bought': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['skill', 'commonSkill'],
    ['score', 'count'],
  ],
  'base-claimed': [['base', 'base']],
  'base-moved': [
    ['from', 'base'],
    ['to', 'base'],
    ['setAside', 'survivorRefs'],
    ['stores', 'optionalStores'],
    ['rebuild', 'optionalRebuild'],
  ],
  'overrun-continued': [['option', 'overrunOption']],
  'item-added': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
  ],
  'item-removed': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
  ],
  'items-spent': [
    ['team', 'countFromOne'],
    ['items', 'spentItems'],
  ],
  'equipment-handed-over': [
    ['base', 'base'],
    ['slot', 'optionalId'],
    ['items', 'items'],
  ],
  'rare-upgrade-installed': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['slot', 'id'],
  ],
  'item-found': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['subtable', 'roll'],
    ['entry', 'roll'],
  ],
  'item-built': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['hardware', 'count'],
    ['labor', 'count'],
    // Medical Supply tokens that paid some of it (R131; Z7-6), absent for none.
    ['supplies', 'optionalCountFromOne'],
  ],
  // Vehicles (Z5-11).
  'vehicle-added': [['vehicle', 'vehicle']],
  'vehicle-removed': [
    ['id', 'id'],
    ['label', 'name'],
    ['tier', 'vehicleTier'],
  ],
  'vehicle-upgrade-fitted': [
    ['vehicle', 'id'],
    ['label', 'name'],
    ['item', 'item'],
  ],
  // What a move out of an overrun base lost (Z5-13).
  'overrun-lost': [
    ['items', 'items'],
    ['vehicles', 'vehicles'],
    ['trades', 'trades'],
  ],
  // Vehicles on a mission (Z5-12).
  'vehicle-taken': [
    ['team', 'countFromOne'],
    ['vehicle', 'id'],
    ['label', 'name'],
    ['tier', 'vehicleTier'],
    ['fuel', 'count'],
  ],
  'vehicle-left-home': [
    ['team', 'countFromOne'],
    ['vehicle', 'id'],
    ['label', 'name'],
    ['fuel', 'count'],
  ],
  'vehicles-brought-home': [
    ['team', 'countFromOne'],
    ['lost', 'vehicles'],
  ],
  // The Rare Items trade (Z5-10).
  'rare-trade-made': [['items', 'rareTradeItems']],
  'rare-trade-lost': [
    ['reason', 'rareTradeLoss'],
    ['items', 'items'],
    ['food', 'count'],
    ['fuel', 'count'],
  ],
  'rare-trade-closed': [
    ['arrived', 'items'],
    ['lost', 'items'],
    ['food', 'count'],
    ['fuel', 'count'],
  ],
  // Trading (Z5-9): what was paid or brought in, each a count.
  'trade-ordered': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['food', 'count'],
    ['fuel', 'count'],
  ],
  'trade-arrived': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
  ],
  'item-sold': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['food', 'count'],
    ['fuel', 'count'],
  ],
  'item-moved': [
    ['id', 'id'],
    ['item', 'itemId'],
    ['grade', 'grade'],
    ['from', 'holder'],
    ['to', 'holder'],
  ],
  'community-abandoned': [['setAside', 'survivorRefs']],
  'survivor-returned': [
    ['survivor', 'id'],
    ['name', 'name'],
  ],
  'base-stocked': [
    ['food', 'count'],
    ['fuel', 'count'],
    ['hardware', 'count'],
  ],
  'facility-built': [
    ['slot', 'id'],
    ['facility', 'facility'],
  ],
  'upgrade-built': [
    ['slot', 'id'],
    ['upgrade', 'upgrade'],
  ],
  'slot-cleared': [['slot', 'id']],
};

/**
 * Names the first thing structurally wrong with one log entry, or `null`.
 *
 * **Shape only, exactly as the survivor and slot checks are** — but the reason
 * differs, and it is worth being clear about. There is no "illegal log entry" to
 * be permissive about: a log records what happened, and what happened happened.
 * What this defends against is a file that was hand-edited or truncated, where
 * accepting an entry whose fields are missing would put `undefined` into a line
 * of someone's campaign history rather than saying the file is damaged.
 *
 * An unknown `kind` is the interesting case, and it is reported rather than
 * skipped: it means either a damaged file or a save from a newer version, and
 * `migrate` has already ruled out the second by the time this runs.
 */
function describeLogEntryProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t a log entry';

  if (!isCountFromOne(value.turn)) return 'doesn’t say which turn it happened in';
  // No `typeof` guard, unlike the timestamp below. Strict equality against a
  // list of four strings already rejects everything that is not one of them,
  // and JSON has no value that is `===` a string without being one. A mutation
  // run said so first: the guard's mutant was equivalent, which is another way
  // of saying the guard did nothing.
  if (!CAMPAIGN_PHASES.some((phase) => phase === value.phase)) {
    return `happened in a phase that isn’t one of ${CAMPAIGN_PHASES.join(', ')}`;
  }
  // Here the `typeof` half *is* load-bearing: `Date.parse` coerces, so a bare
  // `2026` in a file parses as a perfectly good date and would sail through on
  // its own — and then render as 1970 on the history screen.
  if (typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) {
    return 'has a time that is missing or unreadable';
  }

  const event: unknown = value.event;
  if (!isRecord(event)) return 'doesn’t say what happened';

  const kind = event.kind;
  // `typeof` again load-bearing, and for a stranger reason: `Object.hasOwn`
  // coerces its key, so `["turn-began"]` — which JSON can express — stringifies
  // to a name this table has.
  if (typeof kind !== 'string' || !isKeyOf(EVENT_FIELDS, kind)) {
    return `records something this version doesn’t know about: ${String(kind)}`;
  }

  for (const [field, check] of EVENT_FIELDS[kind as CampaignEventKind]) {
    if (!EVENT_FIELD_CHECKS[check](event[field])) return `has an unreadable ${field}`;
  }

  return null;
}

/**
 * The tasks a survivor can be given, and the extra field each carries.
 *
 * A full `Record` over the union's own tag, so a task added to `Assignment`
 * without a line here fails the typecheck rather than sailing through
 * validation unchecked — the same guarantee `EVENT_FIELDS` gives log entries.
 * The four with no extra field are `null` rather than absent, so "this task
 * carries nothing" is stated rather than inferred from a missing key.
 */
const ASSIGNMENT_FIELDS: Record<Assignment['task'], readonly [string, EventFieldCheck] | null> = {
  staff: ['slot', 'id'],
  project: null,
  rest: null,
  // The Inoculation given there instead, by id (Z7-5), or none.
  healing: ['inoculation', 'optionalItemId'],
  mission: ['team', 'countFromOne'],
  scavenging: null,
  'madness-recovery': null,
};

/**
 * Names the first thing structurally wrong with one survivor's assignment, or
 * `null`.
 *
 * **Shape only, and the line is in a different place here than for a slot.**
 * That a survivor is staffing a facility that does not exist, or resting at
 * full Health, or on a mission team while injured, are all *rules* (pg. 20–21)
 * — Z3-6 reports them and a player may be mid-way through fixing one when they
 * save. What this refuses is an assignment that refers to nothing: a task this
 * version has never heard of, or a Staff assignment that does not say where.
 */
function describeAssignmentProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t an assignment';

  const task = value.task;
  if (typeof task !== 'string' || !isKeyOf(ASSIGNMENT_FIELDS, task)) {
    return `is a task this version doesn’t know: ${String(task)}`;
  }

  const field = ASSIGNMENT_FIELDS[task as Assignment['task']];
  if (field !== null && !EVENT_FIELD_CHECKS[field[1]](value[field[0]])) {
    return `has an unreadable ${field[0]}`;
  }

  return null;
}

/**
 * The fields each kind of project carries, and how to check each one.
 *
 * A full `Record` over the kinds, so a project kind added to `campaign.ts`
 * without a line here fails the typecheck rather than sailing through
 * validation unchecked — the same guarantee `EVENT_FIELDS` gives log events.
 * Every kind carries a slot, the turn it was ordered on and what it was
 * charged; only two carry anything else.
 */
const PROJECT_FIELDS: Record<
  Project['kind'],
  readonly (readonly [field: string, check: EventFieldCheck])[]
> = {
  facility: [['facility', 'facility']],
  upgrade: [['upgrade', 'upgrade']],
  clearing: [],
};

/**
 * Names the first thing structurally wrong with one queued project, or `null`.
 *
 * **Shape, not legality**, like everything else here. A project queued for a
 * slot the base does not have, or for a facility the slot could not hold, is a
 * rule the screens report rather than a damaged file — and Z1-7's override
 * means a campaign can genuinely hold one. What this refuses is a project that
 * refers to nothing: a kind this version has never heard of, or a facility id
 * that is not in the catalogue.
 */
/**
 * A recorded `Cost` — the pair of numbers a queued project carries.
 *
 * Both required and neither negative: an order that took no Hardware records a
 * zero, which is a different fact from a file that does not say.
 */
function isCost(value: unknown): boolean {
  return isRecord(value) && isCountFromZero(value.hardware) && isCountFromZero(value.labor);
}

function describeProjectProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'isn’t a project';

  const kind = value.kind;
  if (typeof kind !== 'string' || !isKeyOf(PROJECT_FIELDS, kind)) {
    return `is a kind of project this version doesn’t know: ${String(kind)}`;
  }

  if (!EVENT_FIELD_CHECKS.id(value.slot)) return 'doesn’t say which slot it is for';
  if (!isCountFromOne(value.orderedOnTurn)) return 'doesn’t say which turn it was ordered on';
  // From v12. Required rather than optional, because the migration fills it in
  // for every older save: a queued project with no charge on it would be one
  // the refund has to guess at, which is the whole of #165.
  if (!isCost(value.charged)) return 'doesn’t say what it was charged';

  for (const [field, check] of PROJECT_FIELDS[kind as Project['kind']]) {
    if (!EVENT_FIELD_CHECKS[check](value[field])) return `has an unreadable ${field}`;
  }

  return null;
}

/**
 * Names the first thing wrong with a would-be current-shape `Campaign`, or
 * `null` if there is nothing wrong with it.
 *
 * Phrases are written to slot into "…is not a complete campaign: <problem>.",
 * because "invalid field: phase" tells someone mid-campaign nothing they can
 * act on. Order matters only in that the first problem found is the one
 * reported — a file with several is rarely worth enumerating.
 *
 * This describes the shape as it is *today*. When a later phase gives `log` a
 * real type, this function changes in the same commit as the migration step
 * that fills it in; those two drifting apart is exactly the failure the guard
 * test in `migrations.test.ts` is watching for.
 */
function describeCampaignProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'it isn’t a campaign object';

  if (!isCountFromOne(value.schemaVersion)) return 'its save-format version is missing or invalid';
  if (typeof value.id !== 'string' || value.id === '') return 'it has no campaign id';
  if (typeof value.name !== 'string') return 'it has no campaign name';
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return 'its creation date is missing or unreadable';
  }
  if (!isCountFromOne(value.turn)) return 'its turn number is missing or isn’t a whole turn';
  // The step, not the phase: a campaign records where in the turn it is and the
  // phase is derived from that. Named rather than listed in the message —
  // nineteen step ids is not a sentence anyone reads.
  if (!TURN_SEQUENCE.some((step) => step === value.step)) {
    return 'it doesn’t say where in the turn it is, or names a step this version doesn’t know';
  }

  // Absent is legal and means a campaign not using an origin, so only a present
  // value is checked — and a present one has to be a name this build knows,
  // because Phase 2 gates facilities on it and an unknown origin would quietly
  // hide them.
  if (value.origin !== undefined && !CAMPAIGN_ORIGINS.some((origin) => origin === value.origin)) {
    return `its origin isn’t one of ${CAMPAIGN_ORIGINS.join(', ')}`;
  }

  const materials: unknown = value.materials;
  if (!isRecord(materials)) return 'its material counts are missing';
  for (const material of MATERIALS) {
    const count: unknown = materials[material];
    // Finite, but deliberately not bounded or forced to a whole number: how
    // many of a material a campaign may hold is a rule, and Phase 0 ships none.
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      return `its ${material} count is missing or isn’t a number`;
    }
  }

  if (!Array.isArray(value.survivors)) return 'its survivor list is missing';
  for (const [index, survivor] of value.survivors.entries()) {
    const problem = describeSurvivorProblem(survivor);
    // Positional rather than by name, because a survivor whose name is the
    // damaged field cannot be pointed at by it.
    if (problem !== null) return `survivor ${index + 1} of ${value.survivors.length} ${problem}`;
  }

  // Checked as the roster is, because they are survivors and come back as
  // themselves (R31). Nobody may be in both: one id would then name two people.
  if (!Array.isArray(value.setAside)) return 'its list of survivors set aside is missing';
  for (const [index, survivor] of value.setAside.entries()) {
    const problem = describeSurvivorProblem(survivor);
    if (problem !== null) {
      return `set-aside survivor ${index + 1} of ${value.setAside.length} ${problem}`;
    }
    // A record with a string id by now: `describeSurvivorProblem` checked both.
    const { id } = survivor as { readonly id: string };
    if (value.survivors.some((one) => isRecord(one) && one.id === id)) {
      return `it has somebody both in the community and set aside: ${id}`;
    }
  }

  // The Lost (R106; Z7-7), checked as the set-aside are, and nobody in two lists.
  if (!Array.isArray(value.lost)) return 'its list of the Lost is missing';
  for (const [index, survivor] of value.lost.entries()) {
    const problem = describeSurvivorProblem(survivor);
    if (problem !== null) return `Lost survivor ${index + 1} of ${value.lost.length} ${problem}`;

    const { id } = survivor as { readonly id: string };
    if (
      [...value.survivors, ...(value.setAside as unknown[])].some(
        (one) => isRecord(one) && one.id === id,
      )
    ) {
      return `it has somebody both Lost and elsewhere: ${id}`;
    }
  }

  // The Rare Item Table rolls a v16 save's Rare became (R49; Z5-7).
  if (!isCountFromZero(value.rareRollsOwed)) return 'it doesn’t say how many Rare rolls it owes';

  // Containment's held zombies and the Medical Supply tokens (R103, R131; Z7-6).
  if (!isCountFromZero(value.heldZombies))
    return 'it doesn’t say how many zombies Containment holds';
  if (!isCountFromZero(value.medicalSupplies)) {
    return 'it doesn’t say how many Medical Supply tokens it keeps';
  }

  // The base's Inventory (Z5-2), which never holds a shoddy item: shoddy gear
  // is free and unlimited, so nobody owns one (R35).
  const inventory = describeItemsProblem(value.inventory);
  if (inventory !== null) return `its Inventory ${inventory}`;
  if (
    (value.inventory as readonly { readonly grade: unknown }[]).some(
      (item) => item.grade === 'shoddy',
    )
  ) {
    return 'its Inventory holds a shoddy item, which nobody owns';
  }

  const trades = describeTradesProblem(value.trades);
  if (trades !== null) return `its trades on order: ${trades}`;

  const rareTrade = describeRareTradeProblem(value.rareTrade);
  if (rareTrade !== null) return `its Rare Items trade ${rareTrade}`;

  // Its vehicles (Z5-11), one id each.
  const vehicles = describeVehiclesProblem(value.vehicles);
  if (vehicles !== null) return `its vehicles: ${vehicles}`;
  const vehicleIds = (value.vehicles as readonly { readonly id: string }[]).map((one) => one.id);
  const twice = vehicleIds.find((id, at) => vehicleIds.indexOf(id) !== at);
  if (twice !== undefined) return `it holds two vehicles with one id: ${twice}`;

  if (typeof value.startingCommunityBuilt !== 'boolean') {
    return 'it doesn’t say whether its starting community is finished';
  }

  // Null is a campaign that has not claimed a base, which is a real state and
  // not a missing field — so only a present base is checked.
  if (value.base !== null) {
    const problem = describeBaseProblem(value.base);
    if (problem !== null) return problem;
  }

  // One id names one thing, wherever it is held: the base's Inventory, a
  // survivor, or a facility it is installed in (Z5-8). Asked once the base is
  // known to be readable.
  const installed =
    value.base === null
      ? []
      : Object.values(
          (value.base as { readonly slots: Record<string, { readonly installed?: unknown }> })
            .slots,
        ).flatMap((slot) => (slot.installed ?? []) as readonly { readonly id: string }[]);
  const held = [
    ...(value.inventory as readonly { readonly id: string }[]),
    ...[
      ...(value.survivors as readonly { readonly items: readonly { readonly id: string }[] }[]),
      ...(value.setAside as readonly { readonly items: readonly { readonly id: string }[] }[]),
      ...(value.lost as readonly { readonly items: readonly { readonly id: string }[] }[]),
    ].flatMap((survivor) => survivor.items),
    ...installed,
    // An item on its way from a trade has its id already (Z5-9), and so does
    // one a Rare Items trade is for (Z5-10).
    ...(value.trades as readonly { readonly id: string }[]),
    ...((value.rareTrade as { readonly items: readonly { readonly id: string }[] } | null)?.items ??
      []),
    // And an upgrade fitted to a vehicle (Z5-11).
    ...(value.vehicles as readonly { readonly upgrade?: { readonly id: string } }[]).flatMap(
      (vehicle) => (vehicle.upgrade === undefined ? [] : [vehicle.upgrade]),
    ),
  ];
  const ids = held.map((item) => item.id);
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated !== undefined) return `it holds two items with one id: ${repeated}`;

  // A story is attached to one survivor at a time (R136), the set-aside and Lost included.
  const stories = [
    ...(value.survivors as readonly {
      readonly stories: readonly { readonly mission: string }[];
    }[]),
    ...(value.setAside as readonly { readonly stories: readonly { readonly mission: string }[] }[]),
    ...(value.lost as readonly { readonly stories: readonly { readonly mission: string }[] }[]),
  ].flatMap((survivor) => survivor.stories.map((story) => story.mission));
  const shared = stories.find((mission, at) => stories.indexOf(mission) !== at);
  if (shared !== undefined) return `two survivors hold one story: ${shared}`;

  const assignments: unknown = value.assignments;
  if (!isRecord(assignments)) return 'it doesn’t say what its survivors are doing';
  for (const [id, assignment] of Object.entries(assignments)) {
    // An assignment keyed by an id nobody on the roster has refers to nothing —
    // the same reasoning that makes a slot id outside the base's layout a
    // damaged save rather than a slot this version has not heard of.
    if (!value.survivors.some((survivor) => isRecord(survivor) && survivor.id === id)) {
      return `it assigns a task to somebody who isn’t in the community: ${id}`;
    }

    const problem = describeAssignmentProblem(assignment);
    if (problem !== null) return `the task it gives to ${id} ${problem}`;
  }

  if (!Array.isArray(value.projects)) return 'its project queue is missing';
  for (const [index, project] of value.projects.entries()) {
    const problem = describeProjectProblem(project);
    // Positional, like log entries: a project whose damaged field is the one
    // that says what it is cannot be pointed at by what it is.
    if (problem !== null) {
      return `project ${index + 1} of ${value.projects.length} ${problem}`;
    }
  }

  if (!Array.isArray(value.log)) return 'its campaign log is missing';
  for (const [index, entry] of value.log.entries()) {
    const problem = describeLogEntryProblem(entry);
    // Positional, like survivors: an entry whose damaged field is the one that
    // says what happened cannot be pointed at by what happened.
    if (problem !== null) return `log entry ${index + 1} of ${value.log.length} ${problem}`;
  }

  return null;
}

function failure(reason: SaveFileErrorReason, message: string): SaveFileResult {
  return { ok: false, error: { reason, message } };
}

/**
 * Turns the text of an exported `.json` into a `Campaign`.
 *
 * The pipeline is parse → shape → `migrate` → shape again, and the two shape
 * checks are deliberately different checks:
 *
 * - **Before** `migrate`, only "is this a JSON object at all?". It cannot ask
 *   for a single field, because a v1 file opened by a v4 build is *supposed* to
 *   be missing fields — bringing it forward is the migration chain's whole job.
 *   Checking the current field list here would reject every save the chain
 *   exists to rescue.
 * - **After** `migrate`, the full current-shape check, because that is the
 *   contract `migrations.ts` states it is trusting this function to hold up:
 *   its closing cast asserts what the chain is responsible for producing, not
 *   what has been proven about the bytes on disk.
 *
 * Version reading sits between the two and is `migrate`'s alone — it already
 * range-checks `schemaVersion` and already writes the two error messages worth
 * writing for it, so those are forwarded verbatim rather than reworded here.
 */
export function parseCampaignFile(text: string): SaveFileResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    // The underlying `SyntaxError` ("Unexpected end of JSON input") is dropped
    // on purpose: it describes a byte offset, and the reader needs a file.
    return failure(
      'invalid-json',
      'This file couldn’t be read. It may have been cut short while saving, or edited by ' +
        'hand — try exporting the campaign again, or open a different file.',
    );
  }

  if (!isRecord(parsed)) {
    return failure(
      'not-a-campaign',
      'This file isn’t a County Road Z campaign. Campaign saves are the .json files this ' +
        'app exports — check you picked the right one.',
    );
  }

  const migrated = migrate(parsed);

  if (!migrated.ok) {
    // Forwarded as-is. `migrate` owns versioning, so it owns how a missing or
    // future version is explained; rewording it here would mean two places to
    // keep good.
    return { ok: false, error: migrated.error };
  }

  const problem = describeCampaignProblem(migrated.campaign);

  if (problem !== null) {
    return failure(
      'damaged-campaign',
      `This file says it is a County Road Z campaign, but it isn’t complete: ${problem}. ` +
        'It may have been edited or damaged since it was saved.',
    );
  }

  return { ok: true, campaign: migrated.campaign };
}

/**
 * Reads a picked or dropped file and parses it.
 *
 * Separate from `parseCampaignFile` because reading a `File` is the one part of
 * import that touches the platform: the text is already in memory by the time
 * the parser sees it. Keeping the read here means the UI branches on a single
 * result shape instead of juggling a promise rejection and a result.
 *
 * `unreadable-file` is a distinct reason from `not-a-campaign` on purpose. A
 * file the browser could not read at all — revoked permission, a device
 * unplugged mid-read, a directory picked by mistake — is a different problem
 * from a file that read fine and turned out to be something else, and the two
 * want different things from the reader.
 */
// Stryker disable all: reading the Blob is platform glue. The `unreadable-file`
// branch needs a `Blob` whose `text()` rejects, which is a stub of the platform
// rather than a case a real file reaches, and the path that matters — pick a
// file, get a campaign or a readable refusal — is driven end to end in
// `e2e/round-trip.spec.ts` against a real file input. Everything downstream of
// the read is `parseCampaignFile`, which is mutated and at 100% on its logic.
export async function readCampaignFile(file: Blob): Promise<SaveFileResult> {
  let text: string;

  try {
    text = await file.text();
  } catch {
    return failure(
      'unreadable-file',
      'This file couldn’t be read. If it is on a drive or a phone, check it is still ' +
        'connected, then pick it again.',
    );
  }

  return parseCampaignFile(text);
}
// Stryker restore all
