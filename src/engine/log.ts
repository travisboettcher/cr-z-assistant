/**
 * The campaign log — what happened, in the order it happened.
 *
 * A placeholder on `Campaign` since Phase 0, and the first thing Phase 3 makes
 * real, because the app already does a dozen things worth recording and none of
 * them left a trace.
 *
 * ## Entries are structured, never sentences
 *
 * An entry holds *what happened* as typed fields. It does not hold "Earl Rhodes
 * was promoted to tier 3" — that is prose, and prose is the one shape that
 * serves exactly one reader. Three want this data: the log screen, the markdown
 * export in Phase 8, and an undo that will need to know what it is undoing.
 * Rendering lives in `src/ui/logLabels.ts`, so the export is a second reader of
 * the same fields rather than a second format to keep in sync.
 *
 * ## Append-only, and nothing here removes an entry
 *
 * There is no `withEntryRemoved`. A log that can be edited is not a record of
 * what happened, it is a record of what someone last decided had happened.
 * Undo, when Phase 8 brings it, appends the undoing.
 *
 * ## What is logged, and what deliberately is not
 *
 * **The log records what happened to the community — its people, its base, and
 * its turn.** It does not record corrections to how any of that was written
 * down. Setting a survivor's Health, fixing a material count and renaming
 * someone are all the player repairing the record, and a history full of
 * repairs buries the history. `campaignStore.ts` carries the full list, with an
 * exhaustive test that every action is one or the other.
 *
 * ## Survivor events carry a name as well as an id
 *
 * The name because a survivor who has left the community is gone from the
 * roster, and their name is all that is left to render. The id because names
 * repeat, and "Earl was promoted" is ambiguous in a community with two of them.
 * Both are as they were **at the time**: a later rename does not rewrite what
 * the log already says, which is the point of a log.
 */

import type { BaseId } from '../data/bases';
import type { D10Result } from '../data/dice';
import type { Grade, ItemId, VehicleTier } from '../data/equipment';
import type { FacilityId, UpgradeId } from '../data/facilities';
import type { Material, Materials } from '../data/materials';
import type { MissionId, OverrunOption } from '../data/missions';
import type { CommonSkill, Skill } from '../data/skills';
import type { FieldRecruitTier } from '../data/recruitTable';
import type { Tier } from '../data/tiers';
import type { CampaignPhase, HealthSource, XpSource } from '../data/turn';
import { phaseOf } from './turn';
// Type-only, and the other half of a deliberate pair: `campaign.ts` imports
// `LogEntry` from here. Both directions are erased at compile time, so there is
// no runtime cycle — and the alternative, a third module holding one of them,
// would separate `Campaign` from the shape of its own field.
import type { Assignment, Campaign, Item, RareTradeItem, Vehicle } from './campaign';

/**
 * One team member as a mission left them, carried on its outcome (#178, Z4-4).
 *
 * **Health at the end, not Health lost.** The end value is what the
 * survivor's card says when the table counts (pg. 7), and it is what recording
 * the outcome sets the roster to; a loss would have to be added to a number
 * the roster may already have been corrected away from. `infection` is the
 * same for the Viral origin's Infection (pg. 123): present on every wound a
 * Viral campaign records, and on none anywhere else, because an absent field
 * and a zero would be the same fact spelled two ways — the reason the
 * survivor's own `infection` is a number on everybody rather than optional.
 *
 * Carries the name beside the id, like every other entry about a person, and
 * as it was at the time: the survivor may have walked out by the time anybody
 * reads the history back.
 *
 * **Load-bearing for the siege**: `fellInTheSiege` and `standInCandidates`
 * read who a Siege Defense left at 0 Health off these, rather than off Health
 * as the roster has it now (R17's October 2026 amendment).
 */
export interface MissionWound {
  readonly survivor: string;
  readonly name: string;
  readonly health: number;
  readonly infection?: number;
}

/** What the player had added to one slot of a base an overrun destroyed (Z4-10). */
export interface RebuildSlot {
  readonly slot: string;
  /** A facility the player built there; absent for an empty slot or a built-in. */
  readonly facility?: FacilityId;
  /** The upgrades on whatever stood there, a built-in facility's included. */
  readonly upgrades: readonly UpgradeId[];
}

/**
 * Materials as an entry written before schema v17 may hold them: with the Rare
 * count the app kept until a 10 became an item (R49). History keeps it.
 */
export type HistoricMaterials = Materials & { readonly rare?: number };

/** One item a mission used up or lost, and who had it (Z5-5). */
export interface SpentItem {
  readonly id: string;
  readonly item: ItemId;
  readonly grade: Grade;
  readonly survivor: string;
  readonly name: string;
}

/**
 * One end of an item's move (Z5-4): the base's Inventory, the free supply of
 * shoddy gear (R35), or a survivor, named as they were.
 */
export type ItemHolder = 'base' | 'free' | { readonly survivor: string; readonly name: string };

/**
 * A vehicle Retrieve New Vehicles drove off (pg. 82; R63; Z5-11): the vehicle
 * as it joins, and the setup d10 that gave its Tier, which the player may have
 * lowered.
 */
export interface RetrievedVehicle extends Omit<Vehicle, 'upgrade'> {
  readonly roll: D10Result;
}

/** Why a Rare Items trade was lost before its mission settled it (pp. 21, 23; R59, R60). */
export const RARE_TRADE_LOSSES = ['siege', 'other-mission', 'no-mission'] as const;

export type RareTradeLoss = (typeof RARE_TRADE_LOSSES)[number];

/** Why a `survivor-left` entry's survivor left (#201). */
export const LEAVING_CAUSES = ['turned', 'bitten', 'removed'] as const;

export type LeavingCause = (typeof LEAVING_CAUSES)[number];

/**
 * One thing that happened.
 *
 * Ids are past tense and hyphenated rather than mirroring the action names that
 * produce them: an action is a request and an entry is a record, and several
 * actions can produce the same record later without renaming history. `at` and
 * the campaign's turn live on the entry rather than in here, because every
 * event answers those two the same way.
 */
export type CampaignEvent =
  | { readonly kind: 'campaign-started'; readonly name: string }
  /**
   * Carries no fields: which phase was entered is the entry's own `phase`,
   * because an entry is stamped *after* the change. Repeating it inside the
   * event would be two places to disagree.
   */
  | { readonly kind: 'phase-entered' }
  /** The turn that has just begun, which is also the entry's own turn. */
  | { readonly kind: 'turn-began' }
  | { readonly kind: 'starting-community-settled'; readonly built: boolean }
  /**
   * The Planning Phase cleared last turn's tasks and utility points (pg. 20).
   *
   * **Load-bearing twice over, and it used to carry nothing.**
   * `planningHasBegun` reads it back so the clearing happens once a turn,
   * which is what lets the walk go backwards and forwards without destroying
   * the planning just done.
   *
   * `cleared` is the other half, and the note that used to sit here — "how
   * many assignments went is not a fact about the campaign so much as about
   * the turn before it" — had it exactly backwards. Who went on the mission,
   * who staffed the Kitchen and who was resting are the facts the *Advancement
   * Phase* is reading, and they lived only in `assignments`, which this step
   * empties. So skipping forward to Planning from an unfinished Advancement
   * step destroyed them, and stepping back showed a turn where nobody had done
   * anything (issue #95). Recording what was cleared is the same move as
   * `survivors-fed` carrying its own Hunger: the entry keeps the number the
   * step was read against.
   *
   * Optional because entries written before this existed do not have it, and
   * a turn whose Planning has not begun has nothing to record. A reader with
   * neither falls back to the live assignments, which is where they still are.
   */
  | { readonly kind: 'planning-began'; readonly cleared?: Record<string, Assignment> }
  /**
   * A turn's materials went into storage (pg. 18–19).
   *
   * Carries the four amounts rather than the rolls that produced them: the
   * rolls are a die on a table, the amounts are what happened to the
   * community. Amounts may be negative — a facility that eats Food (pg. 55)
   * can outweigh what was recovered — which is why they are not counts.
   *
   * **Load-bearing**, like `planning-began`: `materialsAdded` reads it back so
   * a walk that goes back over the step cannot hand out the haul twice.
   */
  | {
      readonly kind: 'materials-added';
      readonly food: number;
      readonly fuel: number;
      readonly hardware: number;
      /** Rare, on an entry written before v17 made a 10 an item (R49). */
      readonly rare?: number;
    }
  /**
   * The horde arrived, and the community fought it (pg. 23, 85).
   *
   * Two sieges over a twenty-turn campaign left **no trace in the log at all**:
   * a history could say the horde had been rolled for and could not say whether
   * the siege it called was ever fought, only that `turnsSinceLastSiege` had
   * reset (#167). The log is otherwise a complete record, which made this a
   * conspicuous hole rather than a small one.
   *
   * Carries the names because pg. 85 deploys *everybody* — the one turn where
   * who went out is a fact about the whole community rather than a team
   * somebody picked, and the roster it names can have changed by the time
   * anybody reads it back.
   *
   * Not load-bearing: `siegeDue` reads the previous turn's `horde-checked`
   * entry, so this records what happened rather than deciding it.
   */
  | { readonly kind: 'siege-fought'; readonly names: readonly string[] }
  /**
   * A survivor scavenged instead of going on the mission (pg. 17).
   *
   * Its own entry rather than a line folded into `materials-added`, because the
   * two answer different questions: that one is what went into storage, and
   * this one is what a survivor's whole turn was worth. A community that skips
   * a mission pays for the decision with both, and a history that recorded only
   * the total could not tell a player whether scavenging had been worth it.
   *
   * Carries the name beside the id, like every other entry about a person: the
   * survivor may have walked out by the time anybody reads it back.
   *
   * Not load-bearing. `materials-added` is what keeps the step from running
   * twice, and this is written in the same breath as that one.
   */
  | {
      readonly kind: 'materials-scavenged';
      readonly survivor: string;
      readonly name: string;
      readonly food: number;
      readonly fuel: number;
      readonly hardware: number;
      /** Rare, on an entry written before v17 (R49). */
      readonly rare?: number;
    }
  /**
   * A facility or upgrade traded materials for other materials (pg. 19, 72–73).
   *
   * **Load-bearing**, like the two above: where the book states a cap per turn
   * — the Generator's and the Well Pump's 3 — this is what counts against it,
   * so the entry carries the slot and the source rather than only the amounts.
   * Two Kitchens with a Gas Range each are two allowances, and a counter on
   * the campaign would be one more thing to clear at the top of a turn.
   *
   * The spend is recorded as it was paid rather than as a negative amount: a
   * player reading the history wants "2 Fuel for 1 Food", which is a trade,
   * not a pair of unrelated movements.
   */
  | {
      readonly kind: 'materials-converted';
      readonly slot: string;
      /** The facility or upgrade whose table row this is. */
      readonly source: string;
      readonly spent: Partial<Record<Material, number>>;
      readonly gained: Partial<Record<Material, number>>;
    }
  /**
   * XP went to a survivor, from one of the four sources pg. 18 names.
   *
   * **Load-bearing**: the pools and both 2-XP caps are the difference between
   * what the rules offer and what this turn's entries account for, so an entry
   * missing here is XP the app would offer twice.
   */
  /**
   * The community ate, and went this far short (pg. 22).
   *
   * **Load-bearing twice over.** `survivorsFed` reads it to keep the step from
   * running twice, and `hunger` reads the most recent one to know what the
   * community is going short by — which feeding cannot recompute afterwards,
   * because eating is destructive and four Food against ten required looks
   * afterwards exactly like nine against ten.
   */
  | {
      readonly kind: 'survivors-fed';
      readonly required: number;
      readonly hunger: number;
      /**
       * The head count the shortfall was measured against (pg. 22, R1).
       *
       * Recorded because the penalty is fixed at this step and held until the
       * next Management Phase, so a departure later in the same turn must not
       * re-price it. Optional only because entries written before this was
       * recorded do not carry it and cannot be given it honestly.
       */
      readonly population?: number;
    }
  /**
   * A survivor at 0 Health made their Rot check (pg. 22).
   *
   * Every check, passed or failed, because the roll and the target are what a
   * player will want to look back at — and a step that only recorded the
   * failures would read as though nobody else had been in danger.
   */
  | {
      readonly kind: 'rot-checked';
      readonly survivor: string;
      readonly name: string;
      readonly roll: D10Result;
      readonly target: number;
      readonly passed: boolean;
    }
  /**
   * A set of Restraints held a turning survivor, so nobody was bitten (pg. 69).
   *
   * **Load-bearing**, like `planning-began` and `materials-added`:
   * `restraintsFree` counts these back to know how many sets a turn has left,
   * because a turning that was held leaves no other trace — the survivor is
   * gone either way and the only difference is a bite that did not happen.
   */
  | { readonly kind: 'bite-restrained'; readonly survivor: string; readonly name: string }
  /** A turning survivor bit somebody being healed beside them (pg. 22). */
  | {
      readonly kind: 'survivor-bitten';
      readonly survivor: string;
      readonly name: string;
      readonly damage: number;
    }
  /**
   * The lowest-Tier survivor walked out at Departures (pg. 23).
   *
   * Its own kind rather than the `survivor-left` a Rot death writes, and the
   * distinction is load-bearing rather than editorial: `someoneDeparted` reads
   * it to keep the step from running twice, and a Rot death in the same phase
   * would otherwise look exactly like a departure that had already happened.
   * It reads better too — somebody who walked out and somebody who turned in
   * the night did not leave the community the same way.
   */
  | {
      readonly kind: 'survivor-departed';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
    }
  /**
   * Exhaustion took a survivor off the mission team at Assign Beds (pg. 23).
   *
   * Recorded because it is the only thing that stops the step offering the
   * same removal again — the rule takes **one** survivor off, and Exhaustion
   * does not fall when they go, so nothing in the campaign says it has already
   * happened.
   */
  | {
      readonly kind: 'mission-team-reduced';
      readonly survivor: string;
      readonly name: string;
    }
  /**
   * A project was ordered in the Planning Phase (pg. 20).
   *
   * Three kinds, mirroring the three `*-built` entries the Advancement Phase
   * writes when they finish — so a campaign's history reads "ordered a
   * Workshop for the Garage" on one turn and "built a Workshop in the Garage"
   * on the next, which is what actually happened. Collapsing the six into
   * three would have made a turn's history say a thing was built twice.
   */
  | { readonly kind: 'facility-ordered'; readonly slot: string; readonly facility: FacilityId }
  | { readonly kind: 'upgrade-ordered'; readonly slot: string; readonly upgrade: UpgradeId }
  | { readonly kind: 'clearing-ordered'; readonly slot: string }
  /**
   * A queued project was cancelled before it was finished, and its Hardware
   * came back.
   *
   * The amount is carried rather than left to be re-derived: the project is out
   * of the queue by the time anybody reads this, and what it cost depended on
   * what was standing in the slot and what else was on order for it. A history
   * that said "cancelled" without saying what came back was the one thing the
   * September playtest found the screen never mentioning (#148).
   *
   * Optional, like `survivors-fed`'s `population` and for the same reason:
   * entries written before it was recorded cannot be given one honestly, so
   * they keep the sentence they have always read.
   *
   * `built` is the facility or upgrade id, the way `materials-converted` names
   * its `source` — one field for either, because `builtThingLabel` resolves
   * both and a clearing is the case with nothing to name. Order and built
   * entries have always named the project; these two named only the slot, so
   * "The Back Yard project went unfinished" was ambiguous the moment two were
   * queued there (#151).
   */
  | {
      readonly kind: 'project-cancelled';
      readonly slot: string;
      readonly hardware?: number;
      readonly built?: string;
    }
  /**
   * A queued project went unfinished when the Labor behind it walked out (pg.
   * 23).
   *
   * Its own kind rather than a second `project-cancelled`, because the log is
   * permanent and uneditable and the two are different things that happened: a
   * cancellation is a player changing their mind, and this is a rule taking
   * the choice away and leaving them only the choice of which. A history that
   * called this one cancelling would say the player did something they did not
   * do.
   *
   * The Hardware comes back, exactly as it does on a cancellation. The book
   * does not say, and this follows the ruling already made there: the work was
   * never done, and materials a community still has are materials it still
   * has.
   */
  | {
      readonly kind: 'project-unfinished';
      readonly slot: string;
      // The Hardware the order had spent, which comes back here exactly as it
      // does on a cancellation — the two share `withProjectCancelled`. Recorded
      // for the same reason that one records it: the entry said only that the
      // Labor had left while the stores moved 1 → 3, so the history and the
      // cancel button two screens away contradicted each other (#173).
      readonly hardware?: number;
      readonly built?: string;
    }
  /**
   * The stores were trimmed to the base's caps (pg. 23).
   *
   * Carries what was **lost**, not what is left: the counts that remain are on
   * the campaign, and a history worth reading says what the turn cost. Rare is
   * absent because the book gives it no cap (pg. 54), so it is never trimmed.
   *
   * **Load-bearing**: `storageChecked` reads it so the walk cannot spill the
   * same stores twice.
   */
  | {
      readonly kind: 'storage-checked';
      readonly food: number;
      readonly fuel: number;
      readonly hardware: number;
    }
  /**
   * The horde was checked, and either came or did not (pg. 23).
   *
   * The threat as well as the roll, because the threat is four terms deep and
   * a player looking back at a siege wants to know how close it had been.
   *
   * **Load-bearing**: `hordeChecked` reads it so the roll is not made twice in
   * one turn.
   */
  | {
      readonly kind: 'horde-checked';
      readonly roll: D10Result;
      readonly threat: number;
      readonly siege: boolean;
    }
  /**
   * A mission team's mission, chosen at Select Mission (pg. 17; Z4-2).
   *
   * **The team is the Planning Phase's**: pg. 21 splits the survivors assigned
   * to missions between any number of teams at Planning Step 4, and
   * each `mission` assignment already carries its team's number. This entry
   * names the mission that team plays. On a siege turn the team is the whole
   * community, as team 1 (pg. 85).
   *
   * **The latest entry for a team is its choice**, so choosing again is
   * appending again, as `stood-in` does, and a `mission-skipped` after it
   * clears it. `names` is who was on the team when it chose, for a reader of
   * the history: the roster it names can have changed by the time anybody
   * looks, which is why `siege-fought` carries names too. `material` is the
   * type a Gather Materials team takes its remainder in (pg. 80), and is
   * present for that mission only; `base` is the base a Claim a New Base team
   * is claiming (pg. 78; Z4-7), present for that mission only, and absent on
   * a Claim chosen before Z4-7.
   *
   * **Load-bearing**: `missions.ts` reads it back for who went out, which
   * mission XP and the haul's substitutions are counted from.
   */
  | {
      readonly kind: 'mission-selected';
      readonly team: number;
      readonly mission: MissionId;
      readonly names: readonly string[];
      readonly material?: Material;
      readonly base?: BaseId;
    }
  /**
   * The community opted out of this turn's mission (pg. 17).
   *
   * Clears any team's choice before it, and a selection after it takes the
   * opt-out back. Load-bearing for the same reader as `mission-selected`:
   * nobody went out.
   */
  | { readonly kind: 'mission-skipped' }
  /**
   * How a Siege Defense ended, as the table counted it (pg. 86).
   *
   * The two counts the mission's rewards read and nothing else: whether any
   * zombie was left on the mission area, and whether anybody got out over the
   * map edge. What they come to — the turns since the last siege back to 0, or
   * the base overrun — is `siege.ts`'s to work out, because a verdict written
   * into the entry would be a second copy of the rule that could disagree with
   * the first.
   *
   * **Load-bearing**: `turnsSinceLastSiege` reads these back. Since v12 a
   * siege being *fought* resets nothing; its outcome does.
   */
  | {
      readonly kind: 'siege-defense-resolved';
      readonly zombiesLeft: number;
      readonly survivorsExited: number;
      /** The team that played it; absent on entries written before Z4-3. */
      readonly team?: number;
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * How a Thin the Herd ended (pg. 81).
   *
   * The starting count as well, because one of its rewards is measured against
   * it: fewer than half of them left halves the turns since the last siege.
   * And whether every survivor on it went down, which the book answers by
   * making the next Siege Threat roll succeed on its own — read back by
   * `hordeForced`.
   */
  | {
      readonly kind: 'thin-the-herd-resolved';
      readonly startingZombies: number;
      readonly zombiesLeft: number;
      readonly survivorsExited: number;
      readonly allIncapacitated: boolean;
      /** The team that played it; absent on entries written before Z4-3. */
      readonly team?: number;
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * How the First Mission ended (pg. 77; Z4-3): which numbered end condition
   * was met, or `null` for none, and the Tier of each stranger brought out.
   *
   * Like #175's two outcomes, **the counts and nothing worked out from them**:
   * success is an end condition met, and a failure — none met — is what R21
   * reads to reopen Select Mission. The strangers join the community at
   * Advancement Step 2 (pg. 19), which is Z4-5's to read back.
   */
  | {
      readonly kind: 'first-mission-resolved';
      readonly team: number;
      readonly endCondition: number | null;
      readonly strangers: readonly FieldRecruitTier[];
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * How a Claim a New Base ended (pg. 79; Z4-3). As the First Mission's, and
   * the working vehicles left on the mission area. What a won claim does to the
   * base is `claim.ts`'s and `move.ts`'s, read back from this entry (Z4-8).
   */
  | {
      readonly kind: 'claim-a-new-base-resolved';
      readonly team: number;
      readonly endCondition: number | null;
      readonly strangers: readonly FieldRecruitTier[];
      readonly vehiclesOnArea: number;
      /**
       * Whether a claim after an overrun, of the overrun base's own type, was
       * played on the same map — the condition for recovering half the stores
       * and the free rebuild (pg. 86; R29). A fact the table states, since the
       * app keeps no map. Present for that claim only.
       */
      readonly sameMap?: boolean;
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /** How many materials a Gather Materials team carried off the map (pg. 80; Z4-3). */
  | {
      readonly kind: 'gather-materials-resolved';
      readonly team: number;
      readonly materialsCarriedOut: number;
      /** A stranger its setup may place on the area (pg. 79). */
      readonly strangers: readonly FieldRecruitTier[];
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * How many vehicles a Retrieve New Vehicles team repaired and drove off
   * (pg. 82; Z4-3), and since Z5-11 what each was: the vehicles that joined
   * the community. Absent on an entry from before, which added none.
   */
  | {
      readonly kind: 'retrieve-new-vehicles-resolved';
      readonly team: number;
      readonly vehiclesDrivenOff: number;
      readonly retrieved?: readonly RetrievedVehicle[];
      /** A stranger its setup may place on the area (pg. 81). */
      readonly strangers: readonly FieldRecruitTier[];
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /** The Tier of each stranger a Rescue Strangers team brought out (pg. 83; Z4-3). */
  | {
      readonly kind: 'rescue-strangers-resolved';
      readonly team: number;
      readonly strangers: readonly FieldRecruitTier[];
      /**
       * Set-aside survivors this mission brought back, by id, who rejoin as
       * themselves rather than as new strangers (R31; Z4-11). Absent when
       * nobody set aside was placed, which is most missions.
       */
      readonly returned?: readonly string[];
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * How many survivors a Rare Goods Trader team got out over the map edge
   * (pg. 84; Z4-3), which decides whether its trade arrives — Phase 5's, and
   * R22's.
   */
  | {
      readonly kind: 'rare-goods-trader-resolved';
      readonly team: number;
      readonly survivorsExited: number;
      /**
       * How many of the trade's items the trader handed over, first in priority
       * first (pg. 84; Z5-10). Absent when no trade was under way, and on every
       * entry from before one could be.
       */
      readonly itemsTraded?: number;
      /** A stranger its setup may place on the area (pg. 84). */
      readonly strangers: readonly FieldRecruitTier[];
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * A story, origin or Road Trip mission was played (Z4-3). Which one, by
   * which team, and since Z4-4 the Health it came home with; its rewards are
   * Phase 7's, so nothing more is counted.
   */
  | {
      readonly kind: 'mission-played';
      readonly team: number;
      readonly mission: MissionId;
      /** Each team member's Health at the end; absent before Z4-4. See `MissionWound`. */
      readonly wounds?: readonly MissionWound[];
    }
  /**
   * A mission-team survivor took the place of a worker this turn's Siege
   * Defense left at 0 Health — or, with nobody named, the place was left empty
   * again (pg. 23, the FAQ's "Siege Defense and Labor"; #183).
   *
   * **The fallen worker is the subject**, because the entry is about their
   * place: who fills it is the choice, and "nobody" is one of the answers. So
   * `survivor` and `name` are always the casualty's, and `by` and `byName` are
   * the stand-in's when there is one. A record rather than an edit to
   * `assignments`, for two reasons: the pairing is the rule — a substitute
   * takes one casualty's place, not a seat anywhere — and the assignments
   * it would edit are cleared by this turn's Planning Phase, which a stand-in
   * has to outlive for the Advancement Phase behind it to read.
   *
   * **Load-bearing**: `standIns` reads the latest entry for each casualty, so
   * choosing again is appending again, and the log stays append-only.
   */
  | {
      readonly kind: 'stood-in';
      readonly survivor: string;
      readonly name: string;
      readonly by?: string;
      readonly byName?: string;
    }
  /**
   * Health went to a survivor, in the Heal Wounds step (pg. 19).
   *
   * One entry per survivor rather than one for the step, because who was
   * healed is the part a player reads their history for — "the Clinic made
   * four" says nothing about the turn.
   *
   * **Load-bearing**: `woundsHealed` reads it back so a walk that goes back
   * over the step cannot heal a community twice on one Clinic.
   */
  | {
      readonly kind: 'health-restored';
      readonly survivor: string;
      readonly name: string;
      /** Every Health point received, whatever it was spent on. */
      readonly health: number;
      readonly source: HealthSource;
      /**
       * How many of those points removed Infection instead of closing a wound
       * (pg. 19, 123; #176).
       *
       * Absent where none did — which is every entry written before Infection
       * was stored, and every entry a campaign that is not Viral writes — so
       * an old entry still reads as what it was: all of it Health. A count of
       * the *points*, because that is the player's decision; the Health they
       * restored is `health` less this.
       */
      readonly infection?: number;
    }
  | {
      readonly kind: 'xp-awarded';
      readonly survivor: string;
      readonly name: string;
      readonly amount: number;
      readonly source: XpSource;
    }
  | {
      readonly kind: 'survivor-added';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
    }
  | {
      readonly kind: 'survivor-recruited';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
      /**
       * The d10 that chose their first skill (pg. 15) — part of the story.
       *
       * Absent for a Rookie, who does not roll for one at all (pg. 7). It used
       * to be recorded anyway, from a control the form should not have been
       * offering, and the entry then said a die had chosen a skill the survivor
       * did not have. The log is append-only by design, so a sentence that was
       * never true stayed true-looking forever.
       */
      readonly roll?: D10Result;
    }
  /**
   * A stranger rescued on this turn's missions joined the community, at
   * Advancement Step 2 (pg. 19; Z4-5).
   *
   * **`team` and `stranger` name which rescue this fulfils**: the mission team
   * whose outcome counted the stranger, and the stranger's position in that
   * outcome's `strangers`, from 0. That pair is what `strangersWaiting` reads
   * back, so a walk that goes back over the step offers nobody twice — and it
   * is the log rather than a flag on the campaign, because whether a rescue
   * has been answered is a fact about what happened, like every other step's.
   *
   * Its own kind rather than a field on `survivor-recruited`, for two reasons.
   * A stranger's Tier is the outcome's rather than the form's — a Rookie,
   * Citizen or Leader, never a Hero (pg. 7; R24). And "has this stranger
   * joined" is then a question about one kind of entry, not about which
   * recruits happened to carry the field.
   *
   * The Tier and the roll as `survivor-recruited` carries them: the Tier as it
   * was on joining, and the d10 only where one chose a skill (pp. 7, 15).
   */
  | {
      readonly kind: 'stranger-joined';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
      readonly team: number;
      readonly stranger: number;
      readonly roll?: D10Result;
    }
  /**
   * A survivor gone from the roster, and why (#201): `turned` at a Rot check,
   * `bitten` to death by one who turned (pg. 22), or `removed` by hand from the
   * roster. Absent on an entry written before the cause was recorded, which
   * reads as it always did — inventing one would be writing history.
   */
  | {
      readonly kind: 'survivor-left';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
      readonly cause?: LeavingCause;
    }
  | {
      readonly kind: 'survivor-promoted';
      readonly survivor: string;
      readonly name: string;
      /** The Tier reached, not the one left. */
      readonly tier: Tier;
    }
  | {
      readonly kind: 'skill-level-bought';
      readonly survivor: string;
      readonly name: string;
      readonly skill: Skill;
      /** The level reached. */
      readonly level: number;
    }
  /**
   * Kept apart from `skill-level-bought` rather than folded in behind a wider
   * `skill` field: Move and Defense have no governing stat and buy a *Score*
   * where the twenty governed skills buy a *level* (pg. 9). Two rules that
   * happen to cost XP are still two rules.
   */
  | {
      readonly kind: 'common-skill-bought';
      readonly survivor: string;
      readonly name: string;
      readonly skill: CommonSkill;
      /** The Score reached. */
      readonly score: number;
    }
  | { readonly kind: 'base-claimed'; readonly base: BaseId }
  /**
   * An item put into the base's Inventory by hand (Z5-2), for a table bringing
   * a campaign in part-way through or correcting it. Items that arrive by the
   * rules — built, found, traded — have entries of their own (Phase 5, parts 2
   * and 3).
   */
  | {
      readonly kind: 'item-added';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
    }
  /**
   * An item the project team built (pp. 20–21; Z5-6), into the base's
   * Inventory at once, and what it cost: the Labor is read back by
   * `laborCommitted`, since nothing else records it.
   */
  /**
   * An item found on the Rare Item Table (pg. 43; Z5-7), into the base's
   * Inventory, with the two dice that found it: for a material roll of 10, or
   * a roll a save from before v17 owed (R49).
   */
  /**
   * Items a base handed over (pp. 62, 66; R45, R46; Z5-8): the Regional
   * Firehouse's Turnout Gear on moving in, or the Outdoor Sports Shop's four
   * weapons when its Inventory slot is cleared, which names the slot.
   */
  | {
      readonly kind: 'equipment-handed-over';
      readonly base: BaseId;
      readonly slot?: string;
      readonly items: readonly Item[];
    }
  /**
   * A rare upgrade taken out of the base's Inventory and installed in the
   * facility in this slot (pg. 49; R47; Z5-8).
   */
  | {
      readonly kind: 'rare-upgrade-installed';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly slot: string;
    }
  | {
      readonly kind: 'item-found';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly subtable: D10Result;
      readonly entry: D10Result;
    }
  | {
      readonly kind: 'item-built';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly hardware: number;
      readonly labor: number;
    }
  /**
   * An item traded for in the Planning Phase (pg. 21; R51–R53; Z5-9): the id it
   * will have, and the Food and Fuel paid at once. It arrives next turn, with a
   * `trade-arrived` entry of its own, so the two read as two things that
   * happened, as a project's order and its building do.
   */
  | {
      readonly kind: 'trade-ordered';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly food: number;
      readonly fuel: number;
    }
  /** A traded item in the Inventory, at Add Facilities and Upgrades (pg. 19; Z5-9). */
  | {
      readonly kind: 'trade-arrived';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
    }
  /**
   * A Rare Items trade made in the Planning Phase (pg. 21; R57–R59; Z5-10):
   * each item in priority order, with the dice that found it on the trader's
   * list and the Food and Fuel set aside for it.
   */
  | { readonly kind: 'rare-trade-made'; readonly items: readonly RareTradeItem[] }
  /**
   * A trade cancelled before its mission, and the set-aside materials lost
   * with it (pp. 21, 23; R59, R60): a siege called, another mission chosen
   * first, or no mission at all.
   */
  | {
      readonly kind: 'rare-trade-lost';
      readonly reason: RareTradeLoss;
      readonly items: readonly Item[];
      readonly food: number;
      readonly fuel: number;
    }
  /**
   * A trade the Rare Goods Trader's outcome settled (pg. 84; R22, R61): what
   * arrived, what was traded and lost with nobody out, and the Food and Fuel
   * that came back for the items not traded.
   */
  | {
      readonly kind: 'rare-trade-closed';
      readonly arrived: readonly Item[];
      readonly lost: readonly Item[];
      readonly food: number;
      readonly fuel: number;
    }
  /** A vehicle added by hand, for a campaign brought in part-way or a correction (Z5-11). */
  | { readonly kind: 'vehicle-added'; readonly vehicle: Omit<Vehicle, 'upgrade'> }
  /** A vehicle taken out by hand, its upgrade with it (Z5-11). */
  | {
      readonly kind: 'vehicle-removed';
      readonly id: string;
      readonly label: string;
      readonly tier: VehicleTier;
    }
  /** A vehicle upgrade fitted from the Inventory, for good (pg. 49; R67; Z5-11). */
  | {
      readonly kind: 'vehicle-upgrade-fitted';
      readonly vehicle: string;
      readonly label: string;
      readonly item: Item;
    }
  /** A rare item sold from the Inventory, and what it brought in (pp. 21, 37; R54; Z5-9). */
  | {
      readonly kind: 'item-sold';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly food: number;
      readonly fuel: number;
    }
  /** An item taken out of the base's Inventory by hand (Z5-2). */
  | {
      readonly kind: 'item-removed';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
    }
  /**
   * An item moved at Equip Mission Team (pg. 18; R38; Z5-4): from the base's
   * Inventory, a survivor, or — for shoddy gear — the free supply every
   * survivor with the skill has (R35), to another of those. Each end names the
   * survivor as they were, for a history that outlives them.
   */
  /**
   * What a team's mission used up or lost (pp. 40, 45–48; R37; Z5-5): the
   * disposables thrown, the one-mission gear that goes whatever happens, and
   * anything the table says was lost. Each is gone from its survivor.
   */
  | { readonly kind: 'items-spent'; readonly team: number; readonly items: readonly SpentItem[] }
  | {
      readonly kind: 'item-moved';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly from: ItemHolder;
      readonly to: ItemHolder;
    }
  /**
   * How the community goes on from a base its Siege Defense overran (pg. 86;
   * Z4-9): the player's decision, written beside the outcome rather than on it,
   * because an outcome is what the table counted.
   *
   * **Load-bearing**: `overrun.ts` reads it for which mission the turn plays
   * next (R27). The latest one wins, so trying again after a continuation
   * failed (R28) is a second entry.
   */
  | { readonly kind: 'overrun-continued'; readonly option: OverrunOption }
  /**
   * The community left its survivors behind after an overrun, to begin again
   * with new characters (pg. 86; R31; Z4-11). Every survivor named was set
   * aside, whole, and may return through a later Rescue Strangers mission.
   */
  | {
      readonly kind: 'community-abandoned';
      readonly setAside: readonly { readonly survivor: string; readonly name: string }[];
    }
  /**
   * A set-aside survivor rejoined the community at Advancement Step 2, as
   * themselves, after a Rescue Strangers outcome named them (pp. 19, 54, 86;
   * R31; Z4-11).
   */
  | { readonly kind: 'survivor-returned'; readonly survivor: string; readonly name: string }
  /**
   * The community moved into the base a Claim a New Base won (pp. 19, 54, 79;
   * Z4-8), at the end of that turn's Advancement Phase (R25).
   *
   * **Load-bearing**: `baseMoved` reads it so the move happens once. `from` is
   * the base left behind, with everything built in it, for a reader of the
   * history; `setAside` is every Hero the new base could not hold, one for each
   * over its Tier (pg. 54; R32), each named as the roster had them — empty when
   * the Heroes fit, which is most moves.
   */
  | {
      readonly kind: 'base-moved';
      readonly from: BaseId;
      readonly to: BaseId;
      readonly setAside: readonly { readonly survivor: string; readonly name: string }[];
      /**
       * What was in storage once the community moved, for a move after an
       * overrun, which keeps half the stores, none, or a first base's stock
       * (R29, R30; Z4-9). Absent for a normal claim, whose stores move as they
       * are.
       */
      readonly stores?: HistoricMaterials;
      /**
       * What the player had added to each slot of the base an overrun
       * destroyed, for a move into the same type on the same map, which may
       * build each of them again without Hardware (pg. 86; R29; Z4-10).
       * Absent for every other move.
       */
      readonly rebuild?: readonly RebuildSlot[];
    }
  /**
   * A community's first base arrived stocked to its caps (pg. 19, 54).
   *
   * Its own entry rather than a clause on `base-claimed`, because it is a
   * second thing that happened and a player who finds four Food they did not
   * enter deserves to see where they came from. Only ever written for the
   * first base: a later one starts with what was carried over (pg. 54), which
   * is why `base-moved` writes none.
   */
  | {
      readonly kind: 'base-stocked';
      readonly food: number;
      readonly fuel: number;
      readonly hardware: number;
    }
  | { readonly kind: 'facility-built'; readonly slot: string; readonly facility: FacilityId }
  | { readonly kind: 'upgrade-built'; readonly slot: string; readonly upgrade: UpgradeId }
  | { readonly kind: 'slot-cleared'; readonly slot: string };

/** Every event id, so a switch over them can be checked for holes. */
export type CampaignEventKind = CampaignEvent['kind'];

/**
 * One entry: when, in campaign time and in wall-clock time, and what.
 *
 * Both clocks, because they answer different questions. The turn and phase are
 * the campaign's own time and are what a player reads — "turn 3, Planning". The
 * timestamp is the session's, and is what makes a log exported to a play
 * journal line up with the evening it was played.
 */
export interface LogEntry {
  /** The campaign turn the entry was stamped in. 1-based, like `Campaign.turn`. */
  readonly turn: number;

  readonly phase: CampaignPhase;

  /**
   * ISO 8601, captured by the caller at dispatch time.
   *
   * The engine cannot read a clock and stay pure, so the time arrives on the
   * action — the same arrangement `createNewCampaign` has for `createdAt` and a
   * new survivor's id. **An action that carries a time is an action that gets
   * logged**, and one that does not is one the log deliberately ignores; the
   * action union is where that shows.
   */
  readonly at: string;

  readonly event: CampaignEvent;
}

/**
 * The campaign with one more entry on the end.
 *
 * Stamps the turn and phase from the campaign **as it is now**, so a caller
 * that advances the turn and then logs gets an entry filed under the turn that
 * has just begun. That ordering is deliberate and the store relies on it:
 * change the world first, then record it.
 */
export function logged(campaign: Campaign, at: string, event: CampaignEvent): Campaign {
  return {
    ...campaign,
    log: [
      ...campaign.log,
      // The phase, not the step. An entry is read as "turn 3, Planning", and
      // stamping which of Planning's four steps it happened in would be more
      // precision than anyone reading their own history wants.
      { turn: campaign.turn, phase: phaseOf(campaign.step), at, event },
    ],
  };
}
