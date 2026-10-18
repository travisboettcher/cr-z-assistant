/**
 * The `Campaign` — the single object the whole app reads and writes.
 *
 * **Derived values are never stored here.** Only primitive facts persist: turn
 * number, assignments, inventory, stats, skill levels. Hunger, Exhaustion,
 * Unrest, Siege Threat and every Skill Score are recomputed on demand, because
 * the hunger stat penalty retroactively changes Skill Scores for the turn and
 * makes any cached value wrong. If you are tempted to add a field that can be
 * calculated from other fields, write a function in this directory instead.
 *
 * The shape grows a phase at a time. `survivors` became real in Phase 1, `base`
 * in Phase 2 and `log` in Phase 3 — each through the migration chain in
 * `src/persistence`, which exists precisely to make those changes survivable
 * for a campaign already in progress.
 */

import type { BaseId } from '../data/bases';
import type { Grade, ItemId, VehicleTier } from '../data/equipment';
import type { Cost, FacilityId, UpgradeId } from '../data/facilities';
import type { Materials } from '../data/materials';
import type { StoryTrait } from '../data/traits';
import type { StoryMissionId } from '../data/missions';
import type { CampaignOrigin } from '../data/origins';
import type { D10Result } from '../data/dice';
import type { Skill, Stat } from '../data/skills';
import type { Tier } from '../data/tiers';
import type { TurnStepId } from '../data/turn';
import { FIRST_STEP_OF_TURN } from './turn';
import type { LogEntry } from './log';

/**
 * Bumped whenever the persisted shape of `Campaign` changes. Lives here rather
 * than in `src/persistence` because the field lives on this type and
 * persistence may import from the engine, never the reverse.
 *
 * Bumping this without adding a matching migration step and fixture fails the
 * guard test in `src/persistence`.
 */
export const CURRENT_SCHEMA_VERSION = 22;

/** A survivor's four stat values (pg. 8). */
export type Stats = Record<Stat, number>;

/**
 * The skills a survivor has, and at what level.
 *
 * **Partial on purpose.** A Rookie has one skill, not twenty of which nineteen
 * are absent — how many skills a survivor holds is itself a rule (skill slots =
 * Tier, pg. 7), and counting the entries of this record is how that rule is
 * checked. A full record of twenty zeroes would make "has the skill at level 0"
 * and "does not have the skill" the same state, and they are not.
 */
export type SkillLevels = Partial<Record<Skill, number>>;

/**
 * One survivor.
 *
 * **Primitive facts only.** Skill Score, max HP, Inventory Slots and labor are all
 * computable from what is here plus the tables in `src/data`, so none of them
 * appear — the hunger penalty in Phase 3 changes every Skill Score for a turn,
 * and a stored one would be wrong the moment it did.
 *
 * Equipment, traits and assignments are absent for a different reason: their
 * rules are Phases 5, 7 and 3. Adding fields for them now would be designing
 * shapes before the rules that constrain them exist.
 */
export interface Survivor {
  id: string;

  name: string;

  tier: Tier;

  stats: Stats;

  skills: SkillLevels;

  /** Score, not level — Move has no governing stat (pg. 9). */
  move: number;

  /** Score, not level, for the same reason. */
  defense: number;

  /** Max HP is the Tier and is derived; this is the survivor's current health. */
  currentHp: number;

  /**
   * Infection, under the Viral origin (pg. 123).
   *
   * **Stored, and on every survivor.** A zombie's damage adds it on a mission,
   * and unlike a mission's wounds it does not go away when the mission ends:
   * it carries into the next one, so a campaign that did not keep it would hand
   * every survivor a clean slate the book never gives. At 10 the survivor is
   * incapacitated whatever their Health, which is what `isDown` reads.
   *
   * A number on every survivor rather than an optional one on Viral survivors,
   * because an absent field and a zero would be the same fact spelled two ways
   * — the reason `SlotState` writes nothing rather than `false`. Outside a
   * Viral campaign nothing raises it, so it stays 0 and nothing reads a
   * difference (#176).
   */
  infection: number;

  /**
   * Madness, under the Cosmic Horror origin (pg. 124; Z7-7). Stored on every
   * survivor, as Infection is, and for the same reason: a horror check adds it
   * on a mission and it carries from one to the next. The Lounge takes it away
   * (R110); at 13 or more the survivor goes Lost at Departures (R106). Zero
   * outside a Cosmic Horror campaign, and for every save from before v22.
   */
  madness: number;

  xp: number;

  /**
   * What the survivor carries, each item in an Inventory Slot (pp. 14, 18;
   * Z5-2).
   *
   * **Kept between missions and turns**: the book has a survivor at the base
   * leave with "all the items in their Inventory" and come back with them
   * (pp. 23, 124), so a survivor's items are theirs until moved. Shoddy items
   * are here too when carried (R35), though the base never holds one.
   * Empty for every survivor in a save from before v16.
   */
  items: readonly Item[];

  /**
   * The Story Trait held, or `null` (pg. 88; R84; Z7-1). One at a time: a new
   * one replaces it (R85). `null` for every survivor in a save from before
   * v19, and for anybody a story has not reached.
   */
  storyTrait: StoryTrait | null;

  /**
   * A Veteran, which a Tier 3 becomes on promotion to Hero and keeps beside any
   * story trait (pp. 87–88; R85). Apart from `storyTrait` for that reason.
   */
  veteran: boolean;

  /**
   * The bond group a Bonded survivor belongs to, counted from 1, or `null`
   * (pp. 88, 90–91; R84). Bondmates share a group, and only a Bonded survivor
   * has one: losing the trait loses the bond, since the book bonds nobody who
   * lacks it.
   */
  bondGroup: number | null;

  /**
   * The story missions attached to the survivor, each with the turn it was
   * attached, in that order (pp. 87, 90, 96; R116; Z7-2). Any number at once,
   * and each story attached to one survivor at a time (R136). Empty for every
   * survivor in a save from before v19.
   */
  stories: readonly AttachedStory[];

  /**
   * Rot Resistant, which an Inoculation gives at a Medical Clinic and which
   * takes 1 Infection off at the start of every Advancement Phase (pp. 48,
   * 140; R96, R97; Z7-5). Core, whether or not the Toolkit's traits are in
   * use: it is how the equipment works. `false` for every survivor in a save
   * from before v20.
   */
  rotResistant: boolean;
}

/** A story mission attached to a survivor, and when (pg. 87; R116, R118). */
export interface AttachedStory {
  readonly mission: StoryMissionId;
  readonly attachedOnTurn: number;
}

/**
 * One item the community owns: an entry in the equipment catalogue, at a
 * grade (pp. 37–53; Z5-2).
 *
 * **An instance, with an id**, because two standard pistols are two things —
 * one in the base Inventory and one on a survivor — and the history follows
 * each. No state beyond what it is: nothing on an item lasts past a mission
 * (R37), so an item either exists or it does not.
 */
export interface Item {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
}

/**
 * An item traded for in the Planning Phase and not yet arrived (pp. 19, 21;
 * R53; Z5-9): paid for when it was ordered, in the Inventory at the next Add
 * Facilities and Upgrades.
 *
 * The id is the one the item will have, chosen when it is ordered, as a built
 * item's is. What was paid is kept on the order because it is a fact of the
 * day, as a project's charge is: there is no cancelling (R53), but the log
 * and a reader of the order both have it.
 */
/**
 * One item a Rare Items trade is for (pp. 21, 43, 83–84; R58, R59; Z5-10): a
 * Rare Item Table roll's item, with the dice that found it on the trader's
 * list, the id it will have, and the Food and Fuel set aside for it.
 *
 * Each item carries its own share of the set-aside pile because the outcome
 * returns the materials of the items not traded (R22): kept per item, what
 * comes back is a fact rather than a split worked out afterwards.
 */
export interface RareTradeItem {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
  readonly subtable: D10Result;
  readonly entry: D10Result;
  readonly food: number;
  readonly fuel: number;
}

/**
 * A Rare Items trade under way (pp. 21, 83–84; R57–R61; Z5-10): made in a
 * Planning Phase, its materials set aside outside storage, and resolved by the
 * next Mission Phase's first mission, the Rare Goods Trader.
 */
export interface RareTrade {
  readonly madeOnTurn: number;
  /** In priority order: the trader takes them one a round, first first (pg. 84). */
  readonly items: readonly RareTradeItem[];
}

/**
 * A vehicle the community holds (pp. 49, 52–53; R62; Z5-11): its Tier, which
 * fixes its slots, a label the player gives it, whether it is a boat, and the
 * vehicle upgrade fitted to it for good, if one is.
 *
 * Nothing about a mission is kept: whether it is working is the mission's, and
 * it holds nothing between missions (R62, R69). No Health, which the core rules
 * do not give it.
 */
export interface Vehicle {
  readonly id: string;
  readonly tier: VehicleTier;
  readonly label: string;
  /** A boat, which deploys only in water (pg. 52). */
  readonly water: boolean;
  /**
   * Tier 4's split of its 20 slots, as the Inventory Slots its owner chose;
   * the rest are Passenger Slots (pg. 53). Absent below Tier 4, whose slots
   * are fixed.
   */
  readonly inventorySlots?: number;
  /** The vehicle upgrade fitted to it (R67), the item itself. */
  readonly upgrade?: Item;
}

export interface TradeOrder {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
  readonly food: number;
  readonly fuel: number;
  readonly orderedOnTurn: number;
}

/**
 * A facility the player has built into a slot.
 *
 * Built-in facilities are **not** recorded here — they are in the base's own
 * layout in `src/data/bases.ts`, and copying one into the save would give the
 * same fact two homes that could disagree.
 */
export interface BuiltFacility {
  readonly facility: FacilityId;

  /**
   * The campaign turn it went up on.
   *
   * A primitive fact — *when this happened* — and the only way the rule that an
   * upgrade may not be built the same turn as its facility (pg. 54) survives a
   * reload. Nothing else in a campaign records it.
   */
  readonly builtOnTurn: number;
}

/**
 * What the player has done to one Facility Slot.
 *
 * Everything permanent about a slot — its Indoor/Outdoor kind, whether it
 * starts empty, built-in or full of rubble — belongs to the base layout and is
 * read from there. This holds only what a player changed, so a slot nobody has
 * touched has no entry at all.
 *
 * Every field is optional and absent means the same as false, which is the one
 * spelling this shape allows: `power: false` and no `power` key would otherwise
 * be the same state written two ways, and the exporter would have to pick one
 * anyway.
 */
export interface SlotState {
  /** Set once a clearing project has been paid for (pg. 54). */
  readonly cleared?: true;

  /** A facility built into this slot. Absent where the base ships a built-in. */
  readonly built?: BuiltFacility;

  /**
   * Upgrades the player has added, in the order they were built, on top of
   * whatever the base layout already ships in this slot.
   *
   * A list rather than a set: repeats are legal and count separately against
   * the cap of three, so two Extra Beds are two upgrades and not one.
   */
  readonly upgrades?: readonly UpgradeId[];

  /**
   * Power and Water assigned to this slot's facility for the turn (pg. 20, 67).
   *
   * Stored, unlike the pool they come out of: how much a base generates is
   * arithmetic over its facilities and gets recomputed, but *where the player
   * put it* is a decision. One point covers the facility and all its upgrades,
   * so this is a flag and not a count. Clearing them each Planning Phase is
   * Phase 3's job; until then an assignment simply stands.
   */
  readonly power?: true;
  readonly water?: true;

  /**
   * Rare upgrades installed in this slot's facility (pg. 49; R47; Z5-8): the
   * items themselves, out of the Inventory. Each stands on the facility as the
   * upgrade it counts as, outside the cap of three, and goes with the facility.
   * Absent where none is, which is every save from before v17.
   */
  readonly installed?: readonly Item[];
}

/**
 * The community's base.
 *
 * **Primitive facts only**, and thin on purpose: the slot list, each slot's
 * kind, the built-in facilities and the clearing projects are all rules, and
 * they live in `src/data/bases.ts`. What persists is which base was claimed and
 * what the player has since done to it. Storage caps, bed counts, utility pools
 * and production are all computed from the two together.
 */
export interface Base {
  /**
   * Which base from the roster in `src/data/bases.ts`.
   *
   * A catalogue id, not a generated one — the type says which. It is a field
   * rather than a fixed part of the campaign because Claim a New Base (Phase 4)
   * replaces it, and nothing anywhere may cache a value derived from it.
   */
  readonly id: BaseId;

  /**
   * Slot id to what the player has done to it, for the slots they have touched.
   *
   * **Partial on purpose**, exactly as `SkillLevels` is. An untouched slot is
   * absent rather than present-and-empty, so "nothing has happened here" has
   * one spelling; and a slot id that is not in the base's layout is a damaged
   * save rather than a slot.
   */
  readonly slots: Readonly<Record<string, SlotState>>;
}

/**
 * What one survivor is doing this turn (pg. 20–21).
 *
 * **A survivor may have only one assignment per campaign turn**, and that rule
 * is why this is a union rather than a bag of flags: two tasks at once is
 * unrepresentable rather than merely invalid, the same move that put upgrades
 * inside their facility instead of in a flat list. There is no check to forget
 * and no state to repair.
 *
 * `task` rather than `kind` for the discriminant, because the rule the book
 * states is about tasks and a type reads best in the words of the rule it
 * enforces.
 */
export type Assignment =
  /** Working a facility, which produces its output for the turn (pg. 20). */
  | { readonly task: 'staff'; readonly slot: string }
  /** On the project team, contributing Tier levels to the Labor pool (pg. 20). */
  | { readonly task: 'project' }
  /**
   * Resting: one Health point, usable only by them (pg. 19, 21).
   *
   * Kept apart from `healing` because they are two rules that happen to share a
   * Planning step. Rest generates a point locked to the survivor who rested;
   * healing draws on a pool a Medical Clinic distributes equally. Only one
   * survivor may rest per turn, and any number may be healed.
   */
  | { readonly task: 'rest' }
  /**
   * Being healed from the pool the Medical Clinic's staff generates (pg. 21),
   * or, under the Viral origin, given an Inoculation from the base's
   * Inventory there instead, by its id (pg. 48; R97, R143; Z7-5).
   */
  | { readonly task: 'healing'; readonly inoculation?: string }
  /**
   * Recovering from Madness in the Lounge, under the Cosmic Horror origin, in
   * place of resting or healing (pp. 21, 68; R110; Z7-7).
   */
  | { readonly task: 'madness-recovery' }
  /**
   * On a mission team, for the mission next turn (pg. 21).
   *
   * Carries a team number from the day it lands. Phase 3 only ever wrote 1;
   * since Z4-2 Planning splits the mission survivors between any number of
   * teams (pg. 21), and Select Mission chooses each team's mission. The field
   * cost nothing until then and saved a migration.
   */
  | { readonly task: 'mission'; readonly team: number }
  /**
   * Scavenging in place of the mission the community opted out of (pg. 17).
   *
   * An assignment like any other, and deliberately not a flag somewhere else:
   * the book says the scavenger must have **no other assignment**, which is
   * exactly what belonging to this union already means. A flag would have made
   * the one-task rule something to remember rather than something to type.
   */
  | { readonly task: 'scavenging' };

/**
 * A project the community has ordered but not yet finished (pp. 20, 19).
 *
 * Projects are **ordered during the Planning Phase and completed in the next
 * Advancement Phase**, which is what makes a turn's Labor a decision rather
 * than a formality. Until Z3-11 the app built everything the instant the button
 * was pressed, because no phase existed to order it in.
 *
 * `orderedOnTurn` is the load-bearing field and the reason nothing else has to
 * be stored: it says which turn's Labor paid for this, so "what is left to
 * spend" is arithmetic over the queue rather than a running total somebody has
 * to remember to decrement. It is also what decides when the project is due —
 * the Advancement Phase after the one it was ordered in.
 *
 * Three kinds because the book has three, and they are one union because the
 * queue is one queue: a slot with a clearing project ordered for it cannot also
 * have a facility ordered into it, and a union makes that one question.
 */
export type ProjectOrder =
  | { readonly kind: 'facility'; readonly slot: string; readonly facility: FacilityId }
  | { readonly kind: 'upgrade'; readonly slot: string; readonly upgrade: UpgradeId }
  | { readonly kind: 'clearing'; readonly slot: string };

/**
 * The order plus the turn it was placed on.
 *
 * An intersection rather than three members each repeating `orderedOnTurn`,
 * which also gives the screens a name for the half they can supply: a dialog
 * knows what it is ordering and has no business naming the turn, so
 * `project/ordered` carries a `ProjectOrder` and the reducer stamps the rest.
 *
 * Not yet in the queue: an order becomes a `Project` when `withProjectOrdered`
 * charges it and stamps what it took.
 */
export type PlacedOrder = ProjectOrder & { readonly orderedOnTurn: number };

/**
 * A queued project, carrying **what it was actually charged**.
 *
 * The one thing about an order that cannot be recomputed later. A project's
 * price depends on what was queued ahead of it — a Greenhouse ordered onto a
 * Garden with a Fence already on order costs a Hardware less (pp. 72–73) — so
 * cancelling an *earlier* order changes what a later one would cost today,
 * while what it cost on the day is fixed and gone from the stores.
 *
 * Deriving the refund instead minted and destroyed Hardware: order a Fence,
 * order a discounted Greenhouse behind it, cancel the Fence, cancel the
 * Greenhouse, and the community ends an empty queue one Hardware richer than it
 * started (#165). Two Greenhouses onto a built-in Garden lose one the same way.
 *
 * So the charge is recorded rather than re-derived, which makes "a project
 * refunds exactly what it was charged" true by construction rather than by two
 * functions agreeing. `charged.labor` is the same fact for the Labor the order
 * committed — never spent, but counted against the pool the same way, and it
 * drifts under a queue mutation for the same reason.
 */
export type Project = PlacedOrder & { readonly charged: Cost };

export interface Campaign {
  /** Which version of the persisted shape this campaign was written in. */
  schemaVersion: number;

  id: string;

  name: string;

  /** ISO 8601. */
  createdAt: string;

  /** 1-based. The first campaign turn is turn 1, not turn 0. */
  turn: number;

  /**
   * Where in the turn the campaign is (pg. 17).
   *
   * **A step, not a phase**, and the phase is derived from it by `phaseOf` in
   * `src/engine/turn.ts` — a step belongs to exactly one phase, so storing both
   * would be a redundant pair that can disagree.
   *
   * The step rather than the phase because three Management Phase steps are
   * destructive: Check for Rot removes survivors, Feed subtracts Food, Check
   * Storage destroys the surplus (pg. 22–23). A campaign that resumed at
   * "somewhere in the Management Phase" after a closed tab could not know which
   * of those had already run, and doing one twice costs a player their
   * community.
   */
  step: TurnStepId;

  /**
   * The campaign's origin, or absent for one not using an origin.
   *
   * The only optional field on the persisted shape, and the reason
   * `migrations.test.ts` knows which keys may legitimately be missing.
   */
  origin?: CampaignOrigin;

  materials: Materials;

  /**
   * What the community has ordered and not yet finished (pp. 20, 19).
   *
   * **Ordered**, so an array rather than a record: the book calls it a queue,
   * and two projects for the same slot in the same turn have a first and a
   * second. Empty at the top of every campaign and for every save written
   * before v10 — what a campaign had already built was already built, and
   * inventing a queue from it would be claiming work that is finished is still
   * to do.
   */
  projects: readonly Project[];

  survivors: readonly Survivor[];

  /**
   * Survivors who have left the community without leaving the campaign
   * (R31): a Hero sent away when a move lowers the Hero cap (pg. 54).
   *
   * **Kept whole**, with Tier, experience and everything else on their sheet,
   * because the book lets them come back as themselves rather than as somebody
   * new (pp. 54, 86). Off the roster, so nothing counts them — not beds, Food,
   * Labor nor the Hero cap — and nobody here holds a task.
   *
   * Empty for every campaign until a move sends somebody away, and for every
   * save written before v15, which had nowhere to put them.
   */
  setAside: readonly Survivor[];

  /**
   * Survivors gone Lost to Madness (pp. 23, 124; R106; Z7-7), kept whole with
   * what they carried, because a rescued one comes back as themselves (R109).
   * Off the roster, like the set-aside. Empty for every save from before v22.
   */
  lost: readonly Survivor[];

  /**
   * The base's Inventory: the items the community owns that nobody is carrying
   * (pp. 18, 54; Z5-2).
   *
   * No cap: Check Storage counts materials only (pg. 23). Never a shoddy item,
   * which is free and unlimited and so is not owned (R35). Empty for every
   * save from before v16.
   */
  inventory: readonly Item[];

  /**
   * Rare Item Table rolls owed at the next Add Materials to Storage step
   * (R49; Z5-7): the Rare a save from before v17 held in storage, one roll
   * each. Zero for every campaign since, where a 10 is rolled on the table in
   * the step that rolls it.
   */
  rareRollsOwed: number;

  /**
   * Items traded for and on their way (R53; Z5-9), oldest first. Empty for
   * every save from before v18, which could not trade.
   */
  trades: readonly TradeOrder[];

  /**
   * A Rare Items trade under way (R57–R61; Z5-10), or `null` for none, as
   * every save from before v18 has.
   */
  rareTrade: RareTrade | null;

  /**
   * The vehicles the community holds (R62; Z5-11), in the order they came.
   * Campaign-wide rather than the base's, so a move takes them along (R77).
   * Empty for every save from before v18.
   */
  vehicles: readonly Vehicle[];

  /**
   * The zombies held in the base's Containment (pg. 69; R103–R105; Z7-6):
   * one for each won Bring It On Home while a Containment stood (R146), kept
   * until the base is lost by a move or an overrun. Zero for every save from
   * before v21.
   */
  heldZombies: number;

  /**
   * The Medical Supply tokens the base keeps (pg. 107; R131; Z7-6), each 1
   * Labor toward a medical build. Outside the storage caps, and where the
   * Inventory goes on a move (R147). Zero for every save from before v21.
   */
  medicalSupplies: number;

  /**
   * Whether the player has finished assembling their starting community.
   *
   * A starting community is built from ten Tier levels (pg. 13), and that rule
   * stops applying once play begins — field recruits push a community past ten
   * perfectly legally. Nothing else in a campaign says when the building is
   * over, so the player says it, and this records the answer.
   *
   * A decision, not a derived value: it cannot be worked out from the roster,
   * the turn or the phase, which is why it is stored rather than computed.
   */
  startingCommunityBuilt: boolean;

  /**
   * The community's base, or `null` for a campaign that has not claimed one.
   *
   * Null is a real answer, not a missing value: a campaign before its first
   * base is the state the Start a New Community and Claim a New Base missions
   * resolve. A base with no slots would be a different thing entirely.
   */
  base: Base | null;

  /**
   * What each survivor is doing this turn, for the ones who have been given
   * something to do.
   *
   * **Partial on purpose**, exactly as `Base.slots` and `SkillLevels` are: an
   * unassigned survivor is absent rather than present-with-nothing, so "nobody
   * has said yet" has one spelling — and it is the commonest state at the start
   * of a Planning Phase, not an edge case.
   *
   * Keyed by survivor id, so one survivor cannot hold two tasks (pg. 20) by
   * construction. Cleared at the top of each Planning Phase, which is why a
   * single field serves the three moments that read it: the Advancement Phase
   * of the next turn runs *before* that clearing and the Management Phase of
   * this one runs after it, so "the current assignments" is already the right
   * answer at all three.
   */
  assignments: Readonly<Record<string, Assignment>>;

  /**
   * Everything that has happened, oldest first.
   *
   * **Append-only.** Nothing in the app removes or edits an entry, and the
   * store has no action that could; a log that can be rewritten records what
   * someone last decided had happened rather than what did. See
   * [`log.ts`](./log.ts) for what earns an entry and what deliberately does
   * not.
   */
  log: readonly LogEntry[];
}

/**
 * Values a caller may pin instead of letting the factory generate them.
 *
 * `crypto.randomUUID()` and the current time are the only impure things
 * creating a campaign needs. Taking them as arguments keeps this module honest
 * about the engine's purity rule and lets tests assert on exact values rather
 * than working around a moving clock.
 */
export interface NewCampaignOptions {
  id?: string;
  /** ISO 8601. */
  createdAt?: string;
}

/** An empty campaign, ready for its first Mission Phase. */
export function createNewCampaign(name: string, options: NewCampaignOptions = {}): Campaign {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: options.id ?? crypto.randomUUID(),
    name,
    createdAt: options.createdAt ?? new Date().toISOString(),
    turn: 1,
    step: FIRST_STEP_OF_TURN,
    // All zero. Starting material counts are a rule, and Phase 0 ships none.
    materials: { food: 0, fuel: 0, hardware: 0 },
    // The horde has never come for a community that has not played a turn.
    // Nothing ordered: a community's first Planning Phase is where a queue
    // starts.
    projects: [],
    survivors: [],
    setAside: [],
    lost: [],
    inventory: [],
    rareRollsOwed: 0,
    trades: [],
    rareTrade: null,
    vehicles: [],
    heldZombies: 0,
    medicalSupplies: 0,
    // False, so a new campaign gets the ten-tier-level check while it is being
    // built. The v2 → v3 migration deliberately answers `true` instead — see
    // the step in `src/persistence/migrations.ts` for why the two differ.
    startingCommunityBuilt: false,
    base: null,
    assignments: {},
    log: [],
  };
}

/**
 * Everybody the campaign keeps: the community, the set-aside and the Lost
 * (R31, R106). What one of them holds, an item, a story or a bond group, is
 * taken whether or not they are here.
 */
export function keptSurvivors(campaign: Campaign): readonly Survivor[] {
  return [...campaign.survivors, ...campaign.setAside, ...campaign.lost];
}
