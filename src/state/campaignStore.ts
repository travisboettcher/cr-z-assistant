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
 */

import type { BaseId } from '../data/bases';
import type { Utility } from '../data/facilities';
import type { Material } from '../data/materials';
import type { D10Result } from '../data/dice';
import type { FieldRecruitTier } from '../data/recruitTable';
import { MIN_SKILL_LEVEL, type CommonSkill, type Skill, type Stat } from '../data/skills';
import type { Tier } from '../data/tiers';
import { withCommonSkillBought, withSkillLevelBought, withTierBought } from '../engine/advancement';
import { completeProjects, withProjectCancelled, withProjectOrdered } from '../engine/projects';
import { builtEvent, checkOrder, orderedEvent } from '../engine/orders';
import { suppliedOccupants, withUtilityToggled } from '../engine/utilities';
import { createNewCampaign } from '../engine/campaign';
import { logged, type CampaignEvent } from '../engine/log';
import { advance, reverse, type AdvanceBy } from '../engine/turn';
import { FIRST_PLANNING_STEP, planningHasBegun, withPlanningReset } from '../engine/planning';
import {
  baseProduction,
  combined,
  materialsAdded,
  recovered,
  withMaterialsAdded,
  type MaterialRoll,
} from '../engine/materials';
import { checkConversion, conversions, withConversion } from '../engine/conversions';
import { checkXpAward, withXpAwarded } from '../engine/experience';
import { healthAwards, withWoundsHealed, woundsHealed } from '../engine/healing';
import { foodRequired, hungerIfFedNow, survivorsFed, withSurvivorsFed } from '../engine/feeding';
import { rotCheckResolved, rotOutcome, rotTarget, withRotApplied } from '../engine/rot';
import { overCap, storageChecked, withStorageChecked } from '../engine/storage';
import { hordeChecked, siegeThreat, siegeTriggered } from '../engine/siege';
import { departureCandidates, someoneDeparted, withDeparture } from '../engine/departures';
import { missionTeam, missionTeamReduced } from '../engine/assignments';
import { storageCaps } from '../engine/base';
import { ROT_BITE_DAMAGE } from '../data/turn';
import { XP_AWARD, type XpSource } from '../data/turn';
import type { Assignment, Campaign, ProjectOrder, Stats, Survivor } from '../engine/campaign';
import { createSurvivor, recruitSurvivor } from '../engine/survivor';

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
      readonly roll: D10Result;
      readonly id: string;
      readonly at: string;
    }
  | { readonly type: 'survivor/renamed'; readonly id: string; readonly name: string }
  /**
   * Set a survivor's current health.
   *
   * Only *current* health — max HP is the Tier and is derived, so there is
   * nothing to set. Wounds come from the Mission Layer, which the app does not
   * simulate, so until the Advancement Phase lands this is how a wound gets
   * recorded: the player types what happened at the table.
   */
  | { readonly type: 'survivor/hpSet'; readonly id: string; readonly currentHp: number }
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
   * Materials are produced and spent by the Advancement and Management Phases,
   * which are Phase 3. Until then nothing in the app can put a single Hardware
   * into a community — and a base screen whose Build button can never be
   * pressed is the "nothing is usable until everything works" failure the
   * delivery plan exists to avoid. So the player types what is on their
   * worksheet, exactly as Phase 1 let them type XP.
   *
   * No cap is enforced. Check Storage is a Management Phase step (pg. 23) and
   * over-storage has consequences this app does not model yet; refusing the
   * number would be inventing a rule rather than recording one.
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
   * Refused when this turn already has the entry: the step is destructive and
   * the walk can go back over it.
   */
  | {
      readonly type: 'advancement/materialsAdded';
      readonly rolls: readonly MaterialRoll[];
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
   * so the choice is the table's.
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
   * Carries nothing but the clock: who gets what is `healing.ts`'s to work
   * out from the assignments and the base, and a screen that sent a
   * distribution would be a second copy of the equal-shares rule.
   *
   * Refused when this turn already has an entry — the step raises Health and
   * the walk can go back over it.
   */
  | { readonly type: 'advancement/woundsHealed'; readonly at: string }
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
  /** Finish everything the last Planning Phase ordered (pg. 19). */
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

    /**
     * Moves, then records — so an entry lands in the phase or turn just
     * entered rather than the one left behind.
     *
     * A move that ends the turn logs `turn-began` and nothing else, though it
     * enters a new phase as well: "turn 4 began" already says the Mission Phase
     * is open, and two entries for one press would be the log narrating rather
     * than recording. A move inside a phase logs nothing at all — nineteen
     * entries a turn for pressing Next is a history nobody can read.
     */
    case 'turn/advanced':
      return withCampaign(state, (campaign) => {
        const move = advance(campaign.step, action.by);
        const moved: Campaign = move.endsTurn
          ? { ...campaign, step: move.step, turn: campaign.turn + 1 }
          : { ...campaign, step: move.step };

        /*
         * Entering the Planning Phase clears last turn's tasks and utility
         * points (pg. 20, 67) — but only once a turn. `planningHasBegun` reads
         * the log for this turn's own entry, so stepping back into the
         * Advancement Phase and forward again lands here a second time and
         * changes nothing. The walk exists to let a table correct itself, and
         * a correction that destroyed the planning just done would be the
         * opposite of that.
         */
        if (move.step === FIRST_PLANNING_STEP && !planningHasBegun(moved)) {
          /*
           * The entry carries what it cleared. Everything the Advancement
           * Phase reads about the turn just played — who went on the mission,
           * who staffed the Kitchen, who was resting — lived only in
           * `assignments`, and this is the step that empties them. Skipping
           * forward to Planning from an unfinished Advancement step therefore
           * destroyed the turn's own facts, and stepping back showed a turn
           * where nobody had done anything (issue #95). Written here rather
           * than read back from anywhere, because after this line the only
           * copy is gone.
           */
          return logged(withPlanningReset(moved), action.at, {
            kind: 'planning-began',
            cleared: moved.assignments,
          });
        }

        if (move.endsTurn) return logged(moved, action.at, { kind: 'turn-began' });
        if (move.entersPhase) return logged(moved, action.at, { kind: 'phase-entered' });

        return moved;
      });

    case 'turn/reversed':
      return withCampaign(state, (campaign) => {
        const back = reverse(campaign.step);

        return back === null ? campaign : { ...campaign, step: back };
      });

    case 'campaign/startingCommunityBuiltSet':
      return withCampaign(state, (campaign) =>
        campaign.startingCommunityBuilt === action.built
          ? campaign
          : logged({ ...campaign, startingCommunityBuilt: action.built }, action.at, {
              kind: 'starting-community-settled',
              built: action.built,
            }),
      );

    case 'survivor/added':
      return withCampaign(state, (campaign) =>
        logged(
          {
            ...campaign,
            survivors: [
              ...campaign.survivors,
              createSurvivor(action.name, action.tier, { id: action.id }),
            ],
          },
          action.at,
          {
            kind: 'survivor-added',
            survivor: action.id,
            name: action.name,
            tier: action.tier,
          },
        ),
      );

    /**
     * Renaming is by id rather than by index: the roster is reordered by
     * removals, and a stale index renames the wrong person.
     */
    case 'survivor/recruited':
      return withCampaign(state, (campaign) =>
        logged(
          {
            ...campaign,
            survivors: [
              ...campaign.survivors,
              recruitSurvivor(action.name, action.tier, action.roll, { id: action.id }),
            ],
          },
          action.at,
          {
            kind: 'survivor-recruited',
            survivor: action.id,
            name: action.name,
            tier: action.tier,
            roll: action.roll,
          },
        ),
      );

    case 'survivor/renamed':
      return editSurvivor(state, action.id, (survivor) => ({ ...survivor, name: action.name }));

    case 'survivor/hpSet':
      return editSurvivor(state, action.id, (survivor) => ({
        ...survivor,
        currentHp: action.currentHp,
      }));

    case 'survivor/statsSet':
      return editSurvivor(state, action.id, (survivor) => ({ ...survivor, stats: action.stats }));

    case 'survivor/skillAdded':
      return editSurvivor(state, action.id, (survivor) => ({
        ...survivor,
        skills: { ...survivor.skills, [action.skill]: MIN_SKILL_LEVEL },
      }));

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

    /**
     * The three purchases delegate wholesale. Each `with*Bought` re-runs its own
     * price and legality check and **returns the survivor unchanged** when the
     * purchase is blocked, so this reducer cannot spend XP the survivor does not
     * have by forgetting to ask — there is nothing here to forget.
     *
     * That same unchanged return is what `editSurvivorLogged` reads to decide
     * whether anything happened. A refused purchase leaves no entry, because a
     * log of attempts is not a log of a campaign.
     */
    case 'survivor/skillLevelBought':
      return editSurvivorLogged(state, action.id, action.at, (survivor) => {
        const bought = withSkillLevelBought(survivor, action.skill);
        if (bought === survivor) return null;

        return {
          survivor: bought,
          event: {
            kind: 'skill-level-bought',
            survivor: survivor.id,
            name: survivor.name,
            skill: action.skill,
            // The level reached, read off the result rather than worked out
            // here: what a purchase buys is `advancement.ts`'s to say.
            level: bought.skills[action.skill] ?? 0,
          },
        };
      });

    case 'survivor/commonSkillBought':
      return editSurvivorLogged(state, action.id, action.at, (survivor) => {
        const bought = withCommonSkillBought(survivor, action.skill);
        if (bought === survivor) return null;

        return {
          survivor: bought,
          event: {
            kind: 'common-skill-bought',
            survivor: survivor.id,
            name: survivor.name,
            skill: action.skill,
            score: bought[action.skill],
          },
        };
      });

    case 'survivor/tierBought':
      return editSurvivorLogged(state, action.id, action.at, (survivor) => {
        const promoted = withTierBought(survivor, action.raise);
        if (promoted === survivor) return null;

        return {
          survivor: promoted,
          event: {
            kind: 'survivor-promoted',
            survivor: survivor.id,
            name: survivor.name,
            tier: promoted.tier,
          },
        };
      });

    /**
     * **Refuses a base for a community that already has one.**
     *
     * Moving house is the Claim a New Base mission, and it carries questions
     * this action has no answer for — what Inventory comes along, and which
     * Hero leaves when the new base's Tier caps them lower (pg. 54). Those are
     * Phase 4's. Replacing the base here would drop every slot the player has
     * built into, silently, in one dispatch.
     *
     * The screen does not offer the action once a base is claimed, so this is
     * a backstop rather than the guard a player meets. It is here because the
     * screen is the wrong place for the only thing standing between a
     * mis-dispatch and a wiped base.
     */
    case 'base/claimed':
      return withCampaign(state, (campaign) => {
        // Refuses a base for a community that already has one: replacing a base
        // is Claim a New Base, which is a mission and Phase 4's.
        if (campaign.base !== null) return campaign;

        const base = { id: action.base, slots: {} };

        /*
         * **The first base arrives full** (pg. 19, 54). A community that
         * reaches one stocks every capped material to its maximum; a *later*
         * base starts with only what was carried over, and that is Phase 4's
         * Claim a New Base. Only the first is in scope, and `base === null`
         * above is exactly what makes this the first.
         *
         * It matters more than it sounds: a starting community of ten Tier
         * points eats six Food a turn against a Tier 1 cap of four, so
         * beginning at zero rather than four changes the whole opening — and
         * it is the pressure the opening is designed around. The app already
         * knew the caps and showed "0 / 4" beside them.
         */
        // The caps of the base as it stands the moment it is claimed. Since
        // #127 that is a question about the roster as well as the layout —
        // a facility whose Power is not backed does not raise a cap — so the
        // occupants are resolved against the campaign the claim produces
        // rather than read off the layout alone.
        const claimed = { ...campaign, base };
        const caps = storageCaps(base, suppliedOccupants(claimed));
        const stocked = { ...campaign.materials, ...caps };

        return logged(
          logged({ ...claimed, materials: stocked }, action.at, {
            kind: 'base-claimed',
            base: action.base,
          }),
          action.at,
          { kind: 'base-stocked', ...caps },
        );
      });

    case 'campaign/materialSet':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        materials: { ...campaign.materials, [action.material]: action.count },
      }));

    case 'advancement/materialsAdded':
      return withCampaign(state, (campaign) => {
        if (materialsAdded(campaign)) return campaign;

        const adding = combined(recovered(action.rolls), baseProduction(campaign));

        return logged(withMaterialsAdded(campaign, adding), action.at, {
          kind: 'materials-added',
          ...adding,
        });
      });

    case 'advancement/materialsConverted':
      return withCampaign(state, (campaign) => {
        const conversion = conversions(campaign).find(
          (candidate) => candidate.slot === action.slot && candidate.source.id === action.source,
        );

        if (conversion === undefined) return campaign;
        if (checkConversion(campaign, conversion).blockers.length > 0) return campaign;

        return logged(withConversion(campaign, conversion), action.at, {
          kind: 'materials-converted',
          slot: conversion.slot,
          source: conversion.source.id,
          spent: conversion.exchange.spend,
          gained: conversion.exchange.gain as Partial<Record<Material, number>>,
        });
      });

    case 'management/survivorsFed':
      return withCampaign(state, (campaign) => {
        if (survivorsFed(campaign)) return campaign;

        return logged(withSurvivorsFed(campaign), action.at, {
          kind: 'survivors-fed',
          required: foodRequired(campaign),
          hunger: hungerIfFedNow(campaign),
          // The head count at the moment of eating, because the penalty is
          // fixed here and held until the next Management Phase (pg. 22).
          population: campaign.survivors.length,
        });
      });

    case 'management/storageChecked':
      return withCampaign(state, (campaign) => {
        if (storageChecked(campaign)) return campaign;

        const spilled = overCap(campaign);

        return logged(withStorageChecked(campaign), action.at, {
          kind: 'storage-checked',
          ...spilled,
        });
      });

    case 'management/hordeChecked':
      return withCampaign(state, (campaign) => {
        if (hordeChecked(campaign)) return campaign;

        const threat = siegeThreat(campaign);
        const siege = siegeTriggered(action.roll, threat);

        // The entry is the whole record: a siege called on this turn is fought
        // on the next, which `siege.ts` works out from the turn stamped here.
        // Nothing is written onto the campaign, because a forward-dated field
        // beside it destroyed the previous siege's turn — and with it the
        // Siege Threat term that Departures reads two steps later.
        return logged(campaign, action.at, {
          kind: 'horde-checked',
          roll: action.roll,
          threat,
          siege,
        });
      });

    case 'management/departed':
      return withCampaign(state, (campaign) => {
        // The rule sends one (pg. 23). Nothing in the campaign says it has
        // happened — a departure lowers the very pressure it was measured
        // against, so re-deriving `someoneIsLeaving` afterwards answers a
        // different question. Hence the log, like every other step here.
        if (someoneDeparted(campaign)) return campaign;

        // Asked of *this* campaign rather than trusted from the screen.
        const leaving = departureCandidates(campaign).find(
          (candidate) => candidate.id === action.survivor,
        );
        if (leaving === undefined) return campaign;

        return logged(withDeparture(campaign, action.survivor), action.at, {
          kind: 'survivor-departed',
          survivor: leaving.id,
          name: leaving.name,
          tier: leaving.tier,
        });
      });

    case 'management/teamReduced':
      return withCampaign(state, (campaign) => {
        // One survivor, once (pg. 23). Exhaustion does not fall when they come
        // off the team, so without the record the step offers the same removal
        // until the team is empty.
        if (missionTeamReduced(campaign)) return campaign;

        const tired = missionTeam(campaign).find((candidate) => candidate.id === action.survivor);
        if (tired === undefined) return campaign;

        return logged(
          { ...campaign, assignments: withoutAssignment(campaign.assignments, action.survivor) },
          action.at,
          { kind: 'mission-team-reduced', survivor: tired.id, name: tired.name },
        );
      });

    case 'management/rotChecked':
      return withCampaign(state, (campaign) => {
        // Per survivor rather than per step: this one resolves a check for each
        // survivor at 0 Health, so "already done" is a question about a person.
        if (rotCheckResolved(campaign, action.survivor)) return campaign;

        const survivor = campaign.survivors.find((candidate) => candidate.id === action.survivor);
        if (survivor === undefined) return campaign;

        const outcome = rotOutcome(campaign, action.survivor, action.roll, action.bitten);

        // The check itself is recorded whether it passed or failed: a step that
        // only wrote down the deaths would read as though nobody else had been
        // in danger.
        const checked = logged(withRotApplied(campaign, outcome), action.at, {
          kind: 'rot-checked',
          survivor: survivor.id,
          name: survivor.name,
          roll: action.roll,
          target: rotTarget(campaign),
          passed: outcome.turned === null,
        });

        if (outcome.turned === null) return checked;

        const turned = logged(checked, action.at, {
          kind: 'survivor-left',
          survivor: outcome.turned.id,
          name: outcome.turned.name,
          tier: outcome.turned.tier,
        });

        if (outcome.bitten === null) return turned;

        const bitten = logged(turned, action.at, {
          kind: 'survivor-bitten',
          survivor: outcome.bitten.survivor.id,
          name: outcome.bitten.survivor.name,
          damage: ROT_BITE_DAMAGE,
        });

        if (!outcome.bitten.dies) return bitten;

        return logged(bitten, action.at, {
          kind: 'survivor-left',
          survivor: outcome.bitten.survivor.id,
          name: outcome.bitten.survivor.name,
          tier: outcome.bitten.survivor.tier,
        });
      });

    case 'advancement/woundsHealed':
      return withCampaign(state, (campaign) => {
        if (woundsHealed(campaign)) return campaign;

        const awards = healthAwards(campaign);

        // One entry per survivor, so the history says who recovered rather
        // than what the Clinic made. Folded rather than pushed, because
        // `logged` stamps each entry against the campaign it is appending to.
        return awards.reduce(
          (healing, award) =>
            logged(healing, action.at, {
              kind: 'health-restored',
              survivor: award.survivor.id,
              name: award.survivor.name,
              health: award.health,
              source: award.source,
            }),
          withWoundsHealed(campaign, awards),
        );
      });

    /**
     * Through the same helper as the three advancement purchases, which is
     * what it is: a survivor gains something and the log says so. The check is
     * asked here rather than trusted from the screen — a pool that has run out
     * is a blocker, and awarding past it would invent XP.
     */
    case 'advancement/xpAwarded':
      return editSurvivorLogged(state, action.survivor, action.at, (survivor, campaign) => {
        if (checkXpAward(campaign, action.survivor, action.source).blockers.length > 0) return null;

        return {
          survivor: withXpAwarded(survivor, XP_AWARD),
          event: {
            kind: 'xp-awarded',
            survivor: survivor.id,
            name: survivor.name,
            amount: XP_AWARD,
            source: action.source,
          },
        };
      });

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

    case 'project/cancelled':
      return withCampaign(state, (campaign) => {
        const project = campaign.projects[action.at];
        if (project === undefined) return campaign;

        return logged(withProjectCancelled(campaign, action.at), action.when, {
          kind: 'project-cancelled',
          slot: project.slot,
        });
      });

    case 'advancement/projectsCompleted':
      return withCampaign(state, (campaign) => {
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

    /**
     * Reads the survivor before removing them, because the entry has to outlive
     * the roster: once they are gone their name is the only thing left to
     * render, and it is nowhere else in the campaign. An id that is not on the
     * roster removes nobody and records nothing.
     */
    case 'survivor/removed':
      return withCampaign(state, (campaign) => {
        const leaving = campaign.survivors.find((survivor) => survivor.id === action.id);
        if (leaving === undefined) return campaign;

        return logged(
          {
            ...campaign,
            survivors: campaign.survivors.filter((survivor) => survivor.id !== action.id),
            // Their task goes with them. An assignment keyed by an id nobody
            // holds is a damaged save, and it is the kind of orphan that
            // survives a file and breaks a screen three turns later.
            assignments: withoutAssignment(campaign.assignments, action.id),
          },
          action.at,
          {
            kind: 'survivor-left',
            survivor: leaving.id,
            name: leaving.name,
            tier: leaving.tier,
          },
        );
      });

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
/**
 * The assignments, minus one survivor's.
 *
 * A fresh copy with the key deleted, so the reducer stays pure. Written out
 * rather than rest-destructured because the idiom for a computed key leaves an
 * unused binding behind, which is the same call `survivor/skillRemoved` makes.
 *
 * Deleting a key the record does not have is a no-op, so there is no guard for
 * that case. There was one — an early return that kept the record's identity
 * when nothing changed — and a mutation run showed it surviving every test,
 * because `withCampaign` builds a new state object regardless and nothing
 * anywhere observes whether this particular record kept its reference.
 */
function withoutAssignment(
  assignments: Readonly<Record<string, Assignment>>,
  survivor: string,
): Readonly<Record<string, Assignment>> {
  const remaining = { ...assignments };
  delete remaining[survivor];

  return remaining;
}

/**
 * Applies an edit to one survivor and records what it did, or does neither.
 *
 * The edit returns `null` for "nothing happened", which is how a refused
 * purchase leaves the campaign — and the log — untouched. It returns the event
 * alongside the new survivor rather than the store working one out afterwards,
 * because the interesting fields (the level reached, the Tier reached) are on
 * the *result*, and the name is on the survivor as they were before.
 */
function editSurvivorLogged(
  state: CampaignState,
  id: string,
  at: string,
  // The campaign as well as the survivor, for the edits whose rules are about
  // the community rather than the person — an XP pool belongs to the turn.
  edit: (
    survivor: Survivor,
    campaign: Campaign,
  ) => { survivor: Survivor; event: CampaignEvent } | null,
): CampaignState {
  return withCampaign(state, (campaign) => {
    const found = campaign.survivors.find((survivor) => survivor.id === id);
    if (found === undefined) return campaign;

    const done = edit(found, campaign);
    if (done === null) return campaign;

    return logged(
      {
        ...campaign,
        survivors: campaign.survivors.map((survivor) =>
          survivor.id === id ? done.survivor : survivor,
        ),
      },
      at,
      done.event,
    );
  });
}

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
 * Makes an unhandled action a compile error rather than a silent no-op, so
 * adding a member to `CampaignAction` cannot ship without a matching case.
 */
function assertNever(action: never): never {
  throw new Error(`Unhandled campaign action: ${JSON.stringify(action)}`);
}
