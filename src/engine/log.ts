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
import type { FacilityId, UpgradeId } from '../data/facilities';
import type { Material } from '../data/materials';
import type { CommonSkill, Skill } from '../data/skills';
import type { Tier } from '../data/tiers';
import type { CampaignPhase, HealthSource, XpSource } from '../data/turn';
import { phaseOf } from './turn';
// Type-only, and the other half of a deliberate pair: `campaign.ts` imports
// `LogEntry` from here. Both directions are erased at compile time, so there is
// no runtime cycle — and the alternative, a third module holding one of them,
// would separate `Campaign` from the shape of its own field.
import type { Assignment, Campaign } from './campaign';

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
      readonly rare: number;
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
       * The head count the shortfall was measured against (pg. 22, ruling 1).
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
   * A set of Restraints held a turning survivor, so nobody was bitten (pp. 72–73).
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
  | { readonly kind: 'project-unfinished'; readonly slot: string; readonly built?: string }
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
      readonly health: number;
      readonly source: HealthSource;
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
  | {
      readonly kind: 'survivor-left';
      readonly survivor: string;
      readonly name: string;
      readonly tier: Tier;
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
   * A community's first base arrived stocked to its caps (pg. 19, 54).
   *
   * Its own entry rather than a clause on `base-claimed`, because it is a
   * second thing that happened and a player who finds four Food they did not
   * enter deserves to see where they came from. Only ever written for the
   * first base: a later one starts with what was carried over, which is Phase
   * 4's Claim a New Base.
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
