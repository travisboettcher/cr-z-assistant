/**
 * The campaign store — the only place campaign state changes.
 *
 * This module is a plain reducer: `(state, action) => state`. It imports no
 * React and touches no DOM, so it can be tested as a function. That is the
 * point of the story. The previous attempt at this app kept its rules inside
 * DOM-update callbacks, which meant changing a number required hunting through
 * render code; the structural answer is that the UI only renders and
 * dispatches, and every state change lands here as an action.
 *
 * Two rules this module holds itself to:
 *
 * 1. **Nothing derived is stored.** The reducer only ever writes fields that
 *    already exist on `Campaign`, and never caches a value computable from
 *    other fields. Derived values are functions in `src/engine`.
 * 2. **No impurity.** Anything the reducer cannot compute — a fresh UUID, the
 *    current time — arrives on the action, captured by the caller at dispatch
 *    time. `createNewCampaign` was built to accept exactly those two values for
 *    this reason, so this module builds on it rather than inlining a second
 *    campaign factory.
 *
 * **A form is the engine's, not the store's** (#179). Where an action is a
 * form — a guard, a change and the entries that record it — the composition
 * is one function in `src/engine/*Forms.ts`, and the case here hands it the
 * campaign, the action's fields and the action's `at` through `submitted`.
 * The store's share is the open-or-empty question and keeping the campaign as
 * it was on a refusal. What is left written out below is the corrections,
 * which have no guard and no entry, and the project cases (see the note above
 * `project/ordered`).
 */

import type { BaseId } from '../data/bases';
import type { Utility } from '../data/facilities';
import type { Material } from '../data/materials';
import type { Grade, ItemId } from '../data/equipment';
import type { MissionId, OverrunOption } from '../data/missions';
import type { D10Result } from '../data/dice';
import type { FieldRecruitTier } from '../data/recruitTable';
import type { CommonSkill, Skill, Stat } from '../data/skills';
import type { Tier } from '../data/tiers';
import {
  cancellable,
  completeProjects,
  laborShortfall,
  siegeLaborShortfall,
  withProjectCancelled,
  withProjectOrdered,
} from '../engine/projects';
import { builtEvent, builtOf, checkOrder, orderedEvent } from '../engine/orders';
import { withUtilityToggled } from '../engine/utilities';
import { createNewCampaign } from '../engine/campaign';
import { logged } from '../engine/log';
import { reverse, type AdvanceBy } from '../engine/turn';
import type { MaterialRoll } from '../engine/materials';
import {
  submitBaseMove,
  submitCommonSkill,
  submitConversion,
  submitHaul,
  submitHealing,
  submitNewSkill,
  submitPromotion,
  submitSkillLevel,
  submitXpAward,
} from '../engine/advancementForms';
import type { MissionOutcome } from '../engine/missions';
import type { EquipMove } from '../engine/equip';
import {
  submitMissionOutcome,
  submitMissionSelection,
  submitOverrunContinuation,
  submitMissionSkip,
  submitStandIn,
  submitEquipMove,
  submitItemsSpent,
} from '../engine/missionForms';
import {
  submitAdvance,
  submitBaseClaim,
  submitItemAdded,
  submitItemRemoved,
  submitNewSurvivor,
  submitRecruit,
  submitRemoval,
  submitReturn,
  submitStartingCommunity,
  submitStrangerJoined,
} from '../engine/campaignForms';
import { withoutAssignment } from '../engine/assignments';
import type { FormResult } from '../engine/forms';
import {
  submitDeparture,
  submitFeeding,
  submitHordeCheck,
  submitRotCheck,
  submitStorageCheck,
  submitTeamReduction,
} from '../engine/managementForms';
import type { XpSource } from '../data/turn';
import type {
  Assignment,
  Campaign,
  Project,
  ProjectOrder,
  Stats,
  Survivor,
} from '../engine/campaign';

/**
 * The app boots with nothing loaded, and Z0-7's empty state renders off that
 * fact, so "no campaign open" has to be representable rather than faked with a
 * blank campaign.
 *
 * Modelled as a discriminated union rather than `Campaign | null` because the
 * union makes the empty case impossible to skip: `state.campaign` does not
 * exist until `status === 'open'` narrows it, whereas a nullable field is one
 * `campaign?.name` away from a component silently rendering nothing when it
 * should be showing the empty state. It also leaves room for a future
 * `'loading'` or `'failed'` status as an added member instead of a second
 * nullable field that has to be kept consistent with the first.
 */
export type CampaignState =
  { readonly status: 'empty' } | { readonly status: 'open'; readonly campaign: Campaign };

/** What the app boots into: nothing loaded. */
export const INITIAL_CAMPAIGN_STATE: CampaignState = { status: 'empty' };

/**
 * The action surface.
 *
 * `campaign/*` actions act on the campaign; `survivor/*` on one member of it.
 * The second namespace is deliberate — `campaign/survivorAdded` reads worse
 * than it reasons.
 *
 * There is still no "close campaign" action: nothing goes from open back to
 * empty without immediately opening another campaign, and an action with no
 * caller is a guess about the future.
 *
 * ## `at` marks the actions that get logged
 *
 * An action carrying `at` — an ISO 8601 timestamp captured by the caller at the
 * click — is one this reducer records in `campaign.log`. An action without one
 * is one the log deliberately ignores. That is not a coincidence dressed up as
 * a rule: the log is the only thing here that needs a clock, the reducer cannot
 * read one and stay pure, so the two facts are the same fact and the type says
 * so.
 *
 * **What earns an entry: what happened to the community — its people, its base,
 * its turn.** What does not: corrections to how any of that was written down.
 * Setting a survivor's health, fixing a material count, renaming someone or the
 * campaign, moving a point of Power around during planning — every one of those
 * is the player repairing the record rather than something that happened, and a
 * history full of repairs buries the history. `campaignStore.test.ts` walks the
 * union and requires every member to be one or the other, so a new action
 * cannot slip through unclassified.
 */
export type CampaignAction =
  /**
   * Start a new campaign, discarding whatever was open.
   *
   * `id` and `createdAt` are required, not optional: they are the impure part
   * of creating a campaign, and taking them from the caller is what keeps this
   * reducer a pure function. The UI generates them at the click.
   */
  | {
      readonly type: 'campaign/started';
      readonly name: string;
      readonly id: string;
      readonly createdAt: string;
      readonly at: string;
    }
  /**
   * Adopt an already-parsed campaign — the output of `parseCampaignFile` on
   * import (Z0-9) or of the localStorage restore (Z0-10). Validation and
   * migration belong to `src/persistence`; by the time a campaign reaches the
   * store it is a valid `Campaign` and the store just holds it.
   */
  | { readonly type: 'campaign/loaded'; readonly campaign: Campaign }
  | { readonly type: 'campaign/renamed'; readonly name: string }
  /**
   * Move forward through the turn: one step, or on to the next phase.
   *
   * **Carries no destination.** The order of the turn is a rule and the reducer
   * reads it from `src/engine/turn.ts`, so a screen can offer the wrong button
   * but cannot invent a turn that runs Management before Planning. That is why
   * the two actions this replaced — a `phaseSet` that took any phase and a
   * `turnAdvanced` that took none — are gone rather than kept alongside it.
   *
   * Off the end of the Management Phase, this is what ends a turn.
   */
  | { readonly type: 'turn/advanced'; readonly by: AdvanceBy; readonly at: string }
  /**
   * Move back one step, within this turn.
   *
   * Unlogged, by the rule the log already holds: pressing Next once too often
   * and stepping back is a correction to the record, not something that
   * happened to the community. It stops at the first step of the turn — going
   * back into the turn before would claim to undo materials spent, Health
   * distributed and survivors lost, and it cannot.
   */
  | { readonly type: 'turn/reversed' }
  /**
   * Record whether the starting community is finished.
   *
   * A toggle rather than a one-way "done" action: it turns off a rule, and a
   * control that turns a rule off permanently on one misplaced thumb is a door
   * that should not close.
   */
  | {
      readonly type: 'campaign/startingCommunityBuiltSet';
      readonly built: boolean;
      readonly at: string;
    }
  /**
   * Add a survivor to the community.
   *
   * `id` is required for the same reason `campaign/started` requires one: a
   * UUID is the impure part, so the UI captures it at the click and the reducer
   * stays a pure function of its arguments.
   */
  | {
      readonly type: 'survivor/added';
      readonly name: string;
      readonly tier: Tier;
      readonly id: string;
      readonly at: string;
    }
  /**
   * Add a survivor brought back from a mission.
   *
   * Carries the d10 result (pg. 15) for the same reason it carries the id: the
   * roll is the impure part, so the UI does it — or the player types in what
   * their physical die showed — and the reducer stays a pure function.
   */
  | {
      readonly type: 'survivor/recruited';
      readonly name: string;
      readonly tier: FieldRecruitTier;
      /**
       * Absent for a Rookie, whose single skill is never randomly generated
       * (pg. 7). The form does not offer the die at that Tier, and the entry
       * this writes does not claim one was thrown — the log cannot be edited,
       * so a roll recorded there is permanent whether or not it did anything.
       */
      readonly roll?: D10Result;
      readonly id: string;
      readonly at: string;
    }
  | { readonly type: 'survivor/renamed'; readonly id: string; readonly name: string }
  /**
   * Set a survivor's current health.
   *
   * Only *current* health — max HP is the Tier and is derived, so there is
   * nothing to set. Wounds come from the Mission Layer, which the app does not
   * simulate; since Z4-4 they arrive with the mission's outcome
   * (`mission/resolved`), which sets Health and logs it. This stays the
   * unlogged correction for fixing a mistake, and does not rewrite what the
   * outcome recorded.
   */
  | { readonly type: 'survivor/hpSet'; readonly id: string; readonly currentHp: number }
  /**
   * Set a survivor's Infection (pg. 123).
   *
   * The same correction as Health, for the same reason: Infection is gained
   * from a zombie's damage on a mission, which the tracker does not run, so the
   * table types in what happened. Only a Viral campaign's sheet offers it; the
   * reducer does not ask, because the field is on every survivor and a 0 set
   * on a campaign that never raises it changes nothing (#176).
   */
  | { readonly type: 'survivor/infectionSet'; readonly id: string; readonly infection: number }
  /**
   * Replace a survivor's four stat values wholesale.
   *
   * The whole record rather than one stat, because assigning a value to a stat
   * swaps it with whichever stat held it (`withStatValue`) — one assignment is
   * always two changes, and sending them separately would let a render land
   * between the halves with a stat array the Tier never hands out.
   */
  | { readonly type: 'survivor/statsSet'; readonly id: string; readonly stats: Stats }
  /** Take a skill, at level 0 — skills all start there (pg. 8). */
  | { readonly type: 'survivor/skillAdded'; readonly id: string; readonly skill: Skill }
  | { readonly type: 'survivor/skillRemoved'; readonly id: string; readonly skill: Skill }
  /**
   * Set a survivor's experience balance.
   *
   * Typed in by hand this phase. XP is awarded for missions and by the Training
   * Room, both of which are the Phase 3 Advancement Phase; until that lands the
   * player says what happened at the table, exactly as they do for health.
   */
  | { readonly type: 'survivor/xpSet'; readonly id: string; readonly xp: number }
  /**
   * Spend XP on the **next** level of a skill the survivor already has.
   *
   * There is no action that sets a level, which is what makes "skills cannot be
   * gained out of order" (pg. 18) unrepresentable rather than validated. The
   * three purchase actions carry no price: the cost is a rule, so
   * `src/engine/advancement` works it out and re-checks the purchase itself.
   */
  | {
      readonly type: 'survivor/skillLevelBought';
      readonly id: string;
      readonly skill: Skill;
      readonly at: string;
    }
  | {
      readonly type: 'survivor/commonSkillBought';
      readonly id: string;
      readonly skill: CommonSkill;
      readonly at: string;
    }
  /**
   * Promote a survivor one Tier, rebuilding their stat array.
   *
   * `raise` is the stat the player chose to lift off 0, and is required rather
   * than optional: pg. 18 gives that choice to the player whenever more than
   * one stat sits at 0, which is two promotions out of three. `null` says there
   * was nothing to choose — the engine re-checks that and promotes nobody if
   * there was.
   */
  | {
      readonly type: 'survivor/tierBought';
      readonly id: string;
      readonly raise: Stat | null;
      readonly at: string;
    }
  | { readonly type: 'survivor/removed'; readonly id: string; readonly at: string }
  /**
   * Claims a base for a community that has none.
   *
   * Carries the base's id and nothing else: everything about the base — its
   * slots, their kinds, the facilities it ships — is in `src/data/bases.ts`,
   * so claiming copies nothing and there is nothing here to fall out of sync
   * with the rules. What the player does to it afterwards is recorded per slot.
   */
  | { readonly type: 'base/claimed'; readonly base: BaseId; readonly at: string }
  /**
   * Builds a facility into a slot, spending its Hardware.
   *
   * Carried no Labor since Z3-5: the pool is the project team's and the
   * campaign knows who is on it, so the cost is checked against a number the
   * reducer works out rather than one the UI passes in.
   */
  /**
   * Sets one material count by hand.
   *
   * It was the only way to get a Hardware into a community before Phase 3 gave
   * the Advancement and Management Phases somewhere to produce and spend them
   * — a base screen whose Build button could never be pressed is the "nothing
   * is usable until everything works" failure the delivery plan exists to
   * avoid. It stays now for the reason Phase 1's XP field stays: the table is
   * the authority, and a player correcting the record should not have to walk
   * a turn backwards to do it.
   *
   * No cap is enforced, and that is now a decision rather than a gap. Check
   * Storage (pg. 23) is a Management Phase step this app does model since
   * Z3-10, and what it does with a haul over the cap is lose the surplus *at
   * that step* — so a count typed above the cap is a real state the campaign
   * passes through, and refusing it here would be enforcing the rule one phase
   * early.
   */
  | { readonly type: 'campaign/materialSet'; readonly material: Material; readonly count: number }
  /**
   * Put this turn's haul in storage — the mission's rolls plus what the base
   * made (pg. 18–19).
   *
   * Carries the rolls rather than the total, so the arithmetic that turns a
   * die into a material stays in `materials.ts` where the substitution rule
   * lives. A screen that worked out the total itself would be a second copy of
   * the rule that a substitution *changes* a roll rather than adding one.
   *
   * `scavenged` is the one thing about the haul the campaign cannot work out:
   * a scavenger without the Scavenge skill brings back one material of a type
   * the *player* picks (pg. 17). With the skill it is one of each and this is
   * ignored, and with nobody scavenging there is nothing to pick.
   *
   * Refused when this turn already has the entry: the step is destructive and
   * the walk can go back over it.
   */
  | {
      readonly type: 'advancement/materialsAdded';
      readonly rolls: readonly MaterialRoll[];
      readonly scavenged?: Material;
      readonly at: string;
    }
  /**
   * Run one facility or upgrade's conversion (pg. 19, 72–73).
   *
   * Named by where it lives rather than by what it trades: a base can hold two
   * Kitchens, each with its own Gas Range and its own per-turn allowance, and
   * "2 Fuel for 1 Food" does not say which one was used.
   *
   * Refused when the materials are not there or the book's cap for this turn
   * is spent. Both are blockers rather than warnings — a store cannot go
   * negative, and a stated cap is a rule rather than advice.
   */
  | {
      readonly type: 'advancement/materialsConverted';
      readonly slot: string;
      readonly source: string;
      readonly at: string;
    }
  /**
   * Feed the community, in the Management Phase's second step (pg. 22).
   *
   * Carries nothing but the clock. What is eaten and what the shortfall comes
   * to are `feeding.ts`'s to work out, and the entry it leaves behind is the
   * only record of the Hunger — eating is destructive, so afterwards nothing
   * can recompute it.
   *
   * Refused when this turn already has an entry.
   */
  | { readonly type: 'management/survivorsFed'; readonly at: string }
  /**
   * Lose whatever is over the base's caps (pg. 23).
   *
   * Refused when this turn already has an entry: the step destroys materials
   * and the walk can go back over it.
   */
  | { readonly type: 'management/storageChecked'; readonly at: string }
  /**
   * Roll against the horde (pg. 23).
   *
   * The roll comes from the table. Refused when this turn already has an
   * entry — a second roll is a second chance at a siege, and the walk offers
   * one every time a player steps back.
   */
  | { readonly type: 'management/hordeChecked'; readonly roll: D10Result; readonly at: string }
  /**
   * A mission team's mission, chosen at Select Mission (pg. 17; Z4-2).
   *
   * The team is the Planning Phase's; this names its mission, and the material
   * type a Gather Materials team takes its remainder in (pg. 80). Choosing
   * again for the same team replaces the choice. Refused for whatever
   * `selectionProblem` says.
   */
  | {
      readonly type: 'mission/selected';
      readonly team: number;
      readonly mission: MissionId;
      readonly material?: Material;
      readonly base?: BaseId;
      readonly at: string;
    }
  /**
   * Move into the base this turn's claim won, sending these Heroes away
   * (R25, R31, R32; Z4-8).
   */
  | { readonly type: 'advancement/moved'; readonly leaving: readonly string[]; readonly at: string }
  /** An item put into the base's Inventory by hand, with its fresh id (Z5-2). */
  | {
      readonly type: 'inventory/itemAdded';
      readonly id: string;
      readonly item: ItemId;
      readonly grade: Grade;
      readonly at: string;
    }
  /** An item taken out of the base's Inventory by hand (Z5-2). */
  | { readonly type: 'inventory/itemRemoved'; readonly id: string; readonly at: string }
  /** An item moved at Equip Mission Team, or shoddy gear taken up free (Z5-4). */
  | { readonly type: 'mission/itemMoved'; readonly move: EquipMove; readonly at: string }
  /** What a team's mission used up or lost, by item id (Z5-5). */
  | {
      readonly type: 'mission/itemsSpent';
      readonly team: number;
      readonly items: readonly string[];
      readonly at: string;
    }
  /** A survivor set aside, brought back this turn, rejoins (R31; Z4-11). */
  | {
      readonly type: 'advancement/survivorReturned';
      readonly survivor: string;
      readonly at: string;
    }
  /**
   * How the community goes on from a base its Siege Defense overran, and the
   * base that way claims (pg. 86; R27; Z4-9).
   */
  | {
      readonly type: 'mission/overrunContinued';
      readonly option: OverrunOption;
      /** Absent for leaving the survivors behind, whose base is chosen later (R31). */
      readonly base?: BaseId;
      readonly at: string;
    }
  /** The community opts out of this turn's mission (pg. 17). */
  | { readonly type: 'mission/skipped'; readonly at: string }
  /**
   * Record how a team's mission ended (pp. 77–86; Z4-3), and the Health — and
   * in a Viral campaign the Infection — its members came home with (Z4-4).
   *
   * The counts the table made at the end of the mission, and nothing worked
   * out from them: what they do to the turns since the last siege is
   * `siege.ts`'s, read back from the entry this writes. The wounds are set on
   * the roster as well. Refused for whatever `submitMissionOutcome` refuses.
   */
  | { readonly type: 'mission/resolved'; readonly outcome: MissionOutcome; readonly at: string }
  /**
   * Fill a place this turn's siege emptied with a fit mission-team survivor,
   * or leave it empty again with `by: null` (pg. 23, the FAQ's "Siege Defense
   * and Labor"; #183).
   *
   * `survivor` is the casualty whose place it is — the place is the subject,
   * and who fills it is the choice. Checked against `standInProblem` here
   * rather than trusted from the screen.
   */
  | {
      readonly type: 'mission/stoodIn';
      readonly survivor: string;
      readonly by: string | null;
      readonly at: string;
    }
  /**
   * Send one survivor away (pg. 23).
   *
   * Carries who, because a tie is the player's choice. Not guarded against
   * repeats: the pressure is recomputed after each departure, and a community
   * still over the threshold with somebody still to lose genuinely loses them.
   */
  | { readonly type: 'management/departed'; readonly survivor: string; readonly at: string }
  /**
   * Take one survivor off the mission team, because Exhaustion is above its
   * size (pg. 23).
   *
   * Its own action rather than `assignment/cleared`, which is what the screen
   * used to dispatch: that one is an ordinary edit with no record and no
   * guard, so the step offered the same removal until the team was empty.
   */
  | { readonly type: 'management/teamReduced'; readonly survivor: string; readonly at: string }
  /**
   * Resolve one survivor's Rot check (pg. 22).
   *
   * The roll comes from the table, like a field recruit's. `bitten` is the
   * survivor the player picked to take the bite, or null where nobody else is
   * being healed — the book does not say who is bitten when more than one is,
   * so the choice is the table's. *Whether* somebody is bitten is not: a failed
   * check with a candidate and no free Restraints that names nobody is refused
   * (`checkBite`, #189).
   *
   * Not guarded against repeats: a survivor who turns is removed, so the
   * second press has nobody to check. Passing twice is a second entry in the
   * history and nothing else, which is a correction rather than a consequence.
   */
  | {
      readonly type: 'management/rotChecked';
      readonly survivor: string;
      readonly roll: D10Result;
      readonly bitten: string | null;
      readonly at: string;
    }
  /**
   * Share out a turn's Health, in the Heal Wounds step (pg. 19).
   *
   * Carries the clock, and **what each award is spent on, never how big it
   * is**: who gets how many points is `healing.ts`'s to work out from the
   * assignments and the base, and a screen that sent a distribution would be a
   * second copy of the equal-shares rule.
   *
   * `infection` is the player's one decision here under the Viral origin —
   * how many of an award's points remove Infection instead of closing a wound
   * (pg. 19, 123) — keyed by `awardKey`. Absent means Health first, which is
   * every campaign that is not Viral. The reducer holds each number to
   * `infectionRange` rather than trusting it.
   *
   * Refused when this turn already has an entry — the step raises Health and
   * the walk can go back over it.
   */
  | {
      readonly type: 'advancement/woundsHealed';
      readonly at: string;
      readonly infection?: Readonly<Record<string, number>>;
    }
  /**
   * Give a survivor one XP from one of the four sources (pg. 18).
   *
   * One survivor and one point per action, because that is how the book hands
   * it out — a Teacher "assigns 1 XP to as many survivors as" their Score
   * (pg. 12) — and because both 2-XP caps count per survivor per source. A
   * bulk award would have to take the caps apart again on the way in.
   *
   * Refused when `checkXpAward` blocks it, and the reducer asks rather than
   * trusting the caller: same posture as the three advancement purchases.
   */
  | {
      readonly type: 'advancement/xpAwarded';
      readonly survivor: string;
      readonly source: XpSource;
      readonly at: string;
    }
  /**
   * A stranger this turn's missions rescued joins the community, at
   * Advancement Step 2 (pg. 19; Z4-5).
   *
   * Names the rescue — the team whose outcome counted the stranger and their
   * place in its list — rather than carrying a Tier: the Tier is the
   * outcome's, and a screen that could send one could change it. The id and
   * the roll arrive here for the reason `survivor/recruited`'s do.
   */
  | {
      readonly type: 'advancement/strangerJoined';
      readonly team: number;
      readonly stranger: number;
      readonly name: string;
      /** Absent where the stranger's Tier does not roll for a skill (pg. 7). */
      readonly roll?: D10Result;
      readonly id: string;
      readonly at: string;
    }
  /**
   * Give a survivor a task for this turn, replacing whatever they had.
   *
   * Replacing rather than adding, and there is no action that adds: one task
   * per survivor (pg. 20) is the shape of `Campaign.assignments`, so a second
   * task is unrepresentable rather than refused.
   *
   * Unlogged, like `utility/toggled` and for the same reason. Assignments move
   * around several times while a turn is being planned; what is worth recording
   * is the Planning Phase the table settled on, and that entry belongs to the
   * phase's own step rather than to each change on the way there.
   */
  | {
      readonly type: 'assignment/set';
      readonly survivor: string;
      readonly assignment: Assignment;
    }
  /** Take a survivor's task away, leaving them unassigned. */
  | { readonly type: 'assignment/cleared'; readonly survivor: string }
  /**
   * Order a project into the queue, spending its Hardware (pg. 20).
   *
   * **Not built: ordered.** Since Z3-11 the base changes in the *next*
   * Advancement Phase, which is the rule that makes a turn's Labor a decision.
   * The three actions this replaced applied their work the instant they were
   * dispatched, because no phase existed to order it in.
   *
   * `orderedOnTurn` is filled in by the reducer rather than carried, because it
   * is the campaign's own turn and a screen that could name a different one
   * could order a project into the past.
   */
  | {
      readonly type: 'project/ordered';
      readonly project: ProjectOrder;
      readonly at: string;
    }
  /**
   * Take one project back out of the queue, and its Hardware with it.
   *
   * By position, because two identical Gas Ranges ordered for the same Kitchen
   * in one turn are two orders — see `withProjectCancelled`.
   */
  | { readonly type: 'project/cancelled'; readonly at: number; readonly when: string }
  /**
   * Drop the project a departure left unpaid for (pg. 23).
   *
   * Shaped like `project/cancelled` and kept apart from it, because what
   * happens to the campaign is the same and what happened at the table is not:
   * one is a player changing their mind and this is the rule taking a project
   * away, leaving them only the choice of which. The log says which of the two
   * it was, and the log cannot be edited.
   */
  | { readonly type: 'management/projectUnfinished'; readonly at: number; readonly when: string }
  /**
   * Drop one of last turn's orders that this turn's siege left unpaid for
   * (pg. 23, the FAQ's "Siege Defense and Labor"; #183).
   *
   * Its own action rather than a widened `management/projectUnfinished`,
   * because the two guard different orders for different reasons: that one
   * may only touch this turn's, and this one only last turn's — the orders the
   * team the siege took somebody off was paying for. Both write the same
   * `project-unfinished` entry, because at the table they are the same thing:
   * the rule taking a project away and leaving only the choice of which.
   */
  | { readonly type: 'advancement/projectUnfinished'; readonly at: number; readonly when: string }
  /**
   * Finish everything the last Planning Phase ordered (pg. 19).
   *
   * Refused while this turn's siege has left those orders short: finishing
   * them all would be building with Labor the team no longer has.
   */
  | { readonly type: 'advancement/projectsCompleted'; readonly at: string }
  /**
   * Puts a point of Power or Water on a slot, or takes it off.
   *
   * Carried the staffed Utilities Score until Z3-5, for the reason the three
   * projects carried Labor. Both halves of the pool are derived now.
   */
  | { readonly type: 'utility/toggled'; readonly slot: string; readonly utility: Utility };

export function campaignReducer(state: CampaignState, action: CampaignAction): CampaignState {
  switch (action.type) {
    case 'campaign/started':
      return {
        status: 'open',
        campaign: logged(
          createNewCampaign(action.name, { id: action.id, createdAt: action.createdAt }),
          action.at,
          { kind: 'campaign-started', name: action.name },
        ),
      };

    case 'campaign/loaded':
      return { status: 'open', campaign: action.campaign };

    case 'campaign/renamed':
      return withCampaign(state, (campaign) => ({ ...campaign, name: action.name }));

    case 'turn/advanced':
      return submitted(state, (campaign) => submitAdvance(campaign, action.by, action.at));

    case 'turn/reversed':
      return withCampaign(state, (campaign) => {
        const back = reverse(campaign.step);

        return back === null ? campaign : { ...campaign, step: back };
      });

    case 'campaign/startingCommunityBuiltSet':
      return submitted(state, (campaign) =>
        submitStartingCommunity(campaign, action.built, action.at),
      );

    case 'survivor/added':
      return submitted(state, (campaign) =>
        submitNewSurvivor(
          campaign,
          { id: action.id, name: action.name, tier: action.tier },
          action.at,
        ),
      );

    case 'survivor/recruited':
      return submitted(state, (campaign) =>
        submitRecruit(
          campaign,
          { id: action.id, name: action.name, tier: action.tier, roll: action.roll },
          action.at,
        ),
      );

    /**
     * Renaming is by id rather than by index: the roster is reordered by
     * removals, and a stale index renames the wrong person.
     */
    case 'survivor/renamed':
      return editSurvivor(state, action.id, (survivor) => ({ ...survivor, name: action.name }));

    case 'survivor/hpSet':
      return editSurvivor(state, action.id, (survivor) => ({
        ...survivor,
        currentHp: action.currentHp,
      }));

    case 'survivor/infectionSet':
      return editSurvivor(state, action.id, (survivor) => ({
        ...survivor,
        infection: action.infection,
      }));

    case 'survivor/statsSet':
      return editSurvivor(state, action.id, (survivor) => ({ ...survivor, stats: action.stats }));

    case 'survivor/skillAdded':
      return submitted(state, (campaign) =>
        submitNewSkill(campaign, { survivor: action.id, skill: action.skill }),
      );

    /**
     * Removed, not zeroed. A skill at level 0 is one the survivor *has* and is
     * spending a slot on; deleting the key is what gives the slot back.
     */
    case 'survivor/skillRemoved':
      return editSurvivor(state, action.id, (survivor) => {
        // A fresh copy is mutated rather than the stored record, so the reducer
        // stays pure; the rest-destructuring idiom for this reads worse and
        // leaves an unused binding behind.
        const skills = { ...survivor.skills };
        delete skills[action.skill];

        return { ...survivor, skills };
      });

    case 'survivor/xpSet':
      return editSurvivor(state, action.id, (survivor) => ({ ...survivor, xp: action.xp }));

    /*
     * The three purchases carry no price and the store asks no question: each
     * form re-runs its own purchase check in the engine, so this reducer cannot
     * spend XP the survivor does not have by forgetting to ask — there is
     * nothing here to forget. A refused purchase leaves no entry, because a log
     * of attempts is not a log of a campaign.
     */
    case 'survivor/skillLevelBought':
      return submitted(state, (campaign) =>
        submitSkillLevel(campaign, { survivor: action.id, skill: action.skill }, action.at),
      );

    case 'survivor/commonSkillBought':
      return submitted(state, (campaign) =>
        submitCommonSkill(campaign, { survivor: action.id, skill: action.skill }, action.at),
      );

    case 'survivor/tierBought':
      return submitted(state, (campaign) =>
        submitPromotion(campaign, { survivor: action.id, raise: action.raise }, action.at),
      );

    /*
     * Refused for a community that already has a base. The screen does not
     * offer the action once one is claimed, so the engine's refusal is a
     * backstop rather than the guard a player meets — and the screen is the
     * wrong place for the only thing standing between a mis-dispatch and a
     * wiped base.
     */
    case 'base/claimed':
      return submitted(state, (campaign) => submitBaseClaim(campaign, action.base, action.at));

    case 'campaign/materialSet':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        materials: { ...campaign.materials, [action.material]: action.count },
      }));

    case 'advancement/materialsAdded':
      return submitted(state, (campaign) =>
        submitHaul(campaign, { rolls: action.rolls, scavenged: action.scavenged }, action.at),
      );

    case 'advancement/materialsConverted':
      return submitted(state, (campaign) =>
        submitConversion(campaign, { slot: action.slot, source: action.source }, action.at),
      );

    case 'management/survivorsFed':
      return submitted(state, (campaign) => submitFeeding(campaign, action.at));

    case 'management/storageChecked':
      return submitted(state, (campaign) => submitStorageCheck(campaign, action.at));

    case 'management/hordeChecked':
      return submitted(state, (campaign) => submitHordeCheck(campaign, action.roll, action.at));

    case 'mission/selected':
      return submitted(state, (campaign) =>
        submitMissionSelection(
          campaign,
          {
            team: action.team,
            mission: action.mission,
            ...(action.material === undefined ? {} : { material: action.material }),
            ...(action.base === undefined ? {} : { base: action.base }),
          },
          action.at,
        ),
      );

    case 'mission/skipped':
      return submitted(state, (campaign) => submitMissionSkip(campaign, action.at));

    case 'mission/resolved':
      return submitted(state, (campaign) =>
        submitMissionOutcome(campaign, action.outcome, action.at),
      );

    case 'mission/stoodIn':
      return submitted(state, (campaign) =>
        submitStandIn(campaign, { survivor: action.survivor, by: action.by }, action.at),
      );

    case 'management/departed':
      return submitted(state, (campaign) => submitDeparture(campaign, action.survivor, action.at));

    case 'management/teamReduced':
      return submitted(state, (campaign) =>
        submitTeamReduction(campaign, action.survivor, action.at),
      );

    case 'management/rotChecked':
      return submitted(state, (campaign) =>
        submitRotCheck(
          campaign,
          { survivor: action.survivor, roll: action.roll, bitten: action.bitten },
          action.at,
        ),
      );

    case 'advancement/woundsHealed':
      return submitted(state, (campaign) =>
        submitHealing(campaign, action.infection ?? {}, action.at),
      );

    case 'advancement/xpAwarded':
      return submitted(state, (campaign) =>
        submitXpAward(campaign, { survivor: action.survivor, source: action.source }, action.at),
      );

    case 'advancement/strangerJoined':
      return submitted(state, (campaign) =>
        submitStrangerJoined(
          campaign,
          {
            id: action.id,
            team: action.team,
            stranger: action.stranger,
            name: action.name,
            roll: action.roll,
          },
          action.at,
        ),
      );

    /*
     * The five project cases from here to `advancement/projectsCompleted` are
     * the one family of forms #179 leaves composed in the store. How an order
     * is priced and what an entry says it built moved into
     * `src/engine/orders.ts` on their own (#188), written at the same time as
     * #179, and lifting the cases alongside would have been two changes to the
     * same lines at once. They take the shape of the rest in a follow-up.
     */

    /**
     * Delegates wholesale, the way the three advancement purchases do.
     * `withFacilityBuilt` re-runs its own check and returns the campaign
     * unchanged when anything blocks the build, so this reducer cannot spend
     * Hardware the community does not have by forgetting to ask — there is
     * nothing here to forget.
     */
    case 'project/ordered':
      return withCampaign(state, (campaign) => {
        const project = { ...action.project, orderedOnTurn: campaign.turn };

        // Asked here rather than trusted from the screen, exactly as the three
        // actions this replaced did: the check knows what is already queued
        // and what Labor is left, and a stale screen does not.
        if (checkOrder(campaign, project).blockers.length > 0) return campaign;

        return logged(withProjectOrdered(campaign, project), action.at, orderedEvent(project));
      });

    /**
     * Guarded like its sibling below, and for the reason the app's own ruling
     * gives: cancelling is a decision taken back **within the phase that made
     * it**. Nothing enforced that, so last turn's order was cancelled during
     * the next turn's Mission Phase for a full refund (#148).
     *
     * What came back is the difference the cancellation made to the stores,
     * rather than the project re-priced: the two can only ever agree if one of
     * them is the other, and the price depends on what is standing in the slot
     * and on what else is on order for it.
     */
    case 'project/cancelled':
      return withCampaign(state, (campaign) => {
        if (!cancellable(campaign, action.at)) return campaign;

        // `cancellable` has already established that the position holds one, so
        // the assertion is the typechecker's price for a lookup that cannot
        // miss — the same trade `xpPool` makes. A second `=== undefined` guard
        // here would be a line no test could tell from its absence.
        const project = campaign.projects[action.at] as Project;
        const cancelled = withProjectCancelled(campaign, action.at);

        return logged(cancelled, action.when, {
          kind: 'project-cancelled',
          slot: project.slot,
          hardware: cancelled.materials.hardware - campaign.materials.hardware,
          ...builtOf(project),
        });
      });

    /**
     * Guarded twice, and both guards are the rule rather than defensive
     * padding. Nothing may be dropped while the queue still fits the pool —
     * that would be a player cancelling an order and the log calling it a
     * departure's doing — and only *this* turn's orders can be, because last
     * turn's were paid for by a team that has already been reassigned and a
     * shortfall now cannot reach back for them.
     */
    case 'management/projectUnfinished':
      return withCampaign(state, (campaign) => {
        if (laborShortfall(campaign) === 0) return campaign;

        const project = campaign.projects[action.at];
        if (project === undefined || project.orderedOnTurn !== campaign.turn) return campaign;

        return logged(withProjectCancelled(campaign, action.at), action.when, {
          kind: 'project-unfinished',
          slot: project.slot,
          // The same number the cancellation records, off the same order: this
          // step shares `withProjectCancelled`, so it hands back the same
          // Hardware and the entry should say so (#173).
          hardware: project.charged.hardware,
          ...builtOf(project),
        });
      });

    /**
     * Guarded twice, like its sibling above, and the guards are the mirror of
     * its: a shortfall the siege made, and one of *last* turn's orders. The
     * siege is the one thing that reaches back that far, because it is fought
     * before this turn's Planning Phase reassigns the team that paid for them
     * (`siegeLaborShortfall`).
     */
    case 'advancement/projectUnfinished':
      return withCampaign(state, (campaign) => {
        if (siegeLaborShortfall(campaign) === 0) return campaign;

        const project = campaign.projects[action.at];
        if (project === undefined || project.orderedOnTurn !== campaign.turn - 1) return campaign;

        return logged(withProjectCancelled(campaign, action.at), action.when, {
          kind: 'project-unfinished',
          slot: project.slot,
          hardware: project.charged.hardware,
          ...builtOf(project),
        });
      });

    case 'mission/overrunContinued':
      return submitted(state, (campaign) =>
        submitOverrunContinuation(campaign, action.option, action.base, action.at),
      );

    case 'inventory/itemAdded':
      return submitted(state, (campaign) =>
        submitItemAdded(
          campaign,
          { id: action.id, item: action.item, grade: action.grade },
          action.at,
        ),
      );

    case 'mission/itemMoved':
      return submitted(state, (campaign) => submitEquipMove(campaign, action.move, action.at));

    case 'mission/itemsSpent':
      return submitted(state, (campaign) =>
        submitItemsSpent(campaign, action.team, action.items, action.at),
      );

    case 'inventory/itemRemoved':
      return submitted(state, (campaign) => submitItemRemoved(campaign, action.id, action.at));

    case 'advancement/survivorReturned':
      return submitted(state, (campaign) => submitReturn(campaign, action.survivor, action.at));

    case 'advancement/moved':
      return submitted(state, (campaign) => submitBaseMove(campaign, action.leaving, action.at));

    case 'advancement/projectsCompleted':
      return withCampaign(state, (campaign) => {
        // Not while the siege has left them short. The screen offers the
        // choice in place of the button; this is the same refusal for a
        // dispatch that did not come from it.
        if (siegeLaborShortfall(campaign) > 0) return campaign;

        const { campaign: finished, completed } = completeProjects(campaign);

        // One entry per project that actually landed — a project dropped for a
        // slot that filled under it says nothing, rather than claiming a
        // Workshop that is not there. Folded rather than pushed, because
        // `logged` stamps against the campaign it appends to.
        return completed.reduce(
          (so_far, project) => logged(so_far, action.at, builtEvent(project)),
          finished,
        );
      });

    case 'assignment/set':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        assignments: { ...campaign.assignments, [action.survivor]: action.assignment },
      }));

    case 'assignment/cleared':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        assignments: withoutAssignment(campaign.assignments, action.survivor),
      }));

    case 'utility/toggled':
      return withCampaign(state, (campaign) =>
        withUtilityToggled(campaign, { slot: action.slot, utility: action.utility }),
      );

    case 'survivor/removed':
      return submitted(state, (campaign) => submitRemoval(campaign, action.id, action.at));

    default:
      return assertNever(action);
  }
}

/**
 * Applies an edit to the open campaign, or does nothing when none is open.
 *
 * Editing actions dispatched against the empty state are a UI bug, not a user
 * error, so they are ignored rather than thrown: dispatch is fire-and-forget
 * and a throw from a reducer takes the whole render tree down mid-campaign.
 * Returning the *same* state reference keeps React from re-rendering over a
 * no-op.
 */
/**
 * Applies an edit to one survivor, found by id.
 *
 * By id rather than by index throughout: removals reorder the roster, so an
 * index captured a render ago edits whoever moved into the slot. An id that is
 * not on the roster changes nothing — the survivor may have been removed
 * between a control rendering and being pressed.
 */
function editSurvivor(
  state: CampaignState,
  id: string,
  edit: (survivor: Survivor) => Survivor,
): CampaignState {
  return withCampaign(state, (campaign) => ({
    ...campaign,
    survivors: campaign.survivors.map((survivor) =>
      survivor.id === id ? edit(survivor) : survivor,
    ),
  }));
}

function withCampaign(state: CampaignState, edit: (campaign: Campaign) => Campaign): CampaignState {
  if (state.status !== 'open') {
    return state;
  }
  return { status: 'open', campaign: edit(state.campaign) };
}

/**
 * Submits a turn form to the engine, and keeps the campaign as it was when the
 * form is refused (#179).
 *
 * The whole of what is left of a form in this module. The guard, the change and
 * the entry are the engine's (`src/engine/forms.ts`); the store's part is the
 * open-or-empty question `withCampaign` answers, and the refusal's `problem` is
 * dropped here, because a log of attempts is not a log of a campaign and the
 * screen already said why the button was not offered.
 */
function submitted(
  state: CampaignState,
  submit: (campaign: Campaign) => FormResult,
): CampaignState {
  return withCampaign(state, (campaign) => {
    const result = submit(campaign);

    return result.ok ? result.campaign : campaign;
  });
}

/**
 * Makes an unhandled action a compile error rather than a silent no-op, so
 * adding a member to `CampaignAction` cannot ship without a matching case.
 */
function assertNever(action: never): never {
  throw new Error(`Unhandled campaign action: ${JSON.stringify(action)}`);
}
