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
import type { CommonSkill, Skill } from '../data/skills';
import type { Tier } from '../data/tiers';
import type { CampaignPhase, HealthSource, XpSource } from '../data/turn';
import { phaseOf } from './turn';
// Type-only, and the other half of a deliberate pair: `campaign.ts` imports
// `LogEntry` from here. Both directions are erased at compile time, so there is
// no runtime cycle — and the alternative, a third module holding one of them,
// would separate `Campaign` from the shape of its own field.
import type { Campaign } from './campaign';

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
   * Carries nothing: which turn is the entry's own, and how many assignments
   * went is not a fact about the campaign so much as about the turn before it.
   * **This entry is load-bearing rather than decorative** — `planningHasBegun`
   * reads it back to make sure the clearing happens once a turn, so stepping
   * back and forward through the walk cannot destroy the planning just done.
   */
  | { readonly kind: 'planning-began' }
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
   * XP went to a survivor, from one of the four sources pg. 18 names.
   *
   * **Load-bearing**: the pools and both 2-XP caps are the difference between
   * what the rules offer and what this turn's entries account for, so an entry
   * missing here is XP the app would offer twice.
   */
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
      /** The d10 that chose their first skill (pg. 15) — part of the story. */
      readonly roll: D10Result;
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
