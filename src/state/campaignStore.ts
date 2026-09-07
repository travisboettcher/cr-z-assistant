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
import type { FacilityId, UpgradeId } from '../data/facilities';
import type { Material } from '../data/materials';
import type { D10Result, FieldRecruitTier } from '../data/recruitTable';
import { MIN_SKILL_LEVEL, type CommonSkill, type Skill, type Stat } from '../data/skills';
import type { Tier } from '../data/tiers';
import { withCommonSkillBought, withSkillLevelBought, withTierBought } from '../engine/advancement';
import { withFacilityBuilt } from '../engine/build';
import { withUpgradeBuilt } from '../engine/upgrade';
import { createNewCampaign } from '../engine/campaign';
import type { Campaign, CampaignPhase, Stats, Survivor } from '../engine/campaign';
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
 * Bases, facilities and materials arithmetic are still absent — inventing
 * actions for them now would mean designing rules-shaped events before the
 * rules exist. There is also still no "close campaign" action: nothing goes
 * from open back to empty without immediately opening another campaign, and an
 * action with no caller is a guess about the future.
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
    }
  /**
   * Adopt an already-parsed campaign — the output of `parseCampaignFile` on
   * import (Z0-9) or of the localStorage restore (Z0-10). Validation and
   * migration belong to `src/persistence`; by the time a campaign reaches the
   * store it is a valid `Campaign` and the store just holds it.
   */
  | { readonly type: 'campaign/loaded'; readonly campaign: Campaign }
  | { readonly type: 'campaign/renamed'; readonly name: string }
  | { readonly type: 'campaign/phaseSet'; readonly phase: CampaignPhase }
  | { readonly type: 'campaign/turnAdvanced' }
  /**
   * Record whether the starting community is finished.
   *
   * A toggle rather than a one-way "done" action: it turns off a rule, and a
   * control that turns a rule off permanently on one misplaced thumb is a door
   * that should not close.
   */
  | { readonly type: 'campaign/startingCommunityBuiltSet'; readonly built: boolean }
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
  | { readonly type: 'survivor/skillLevelBought'; readonly id: string; readonly skill: Skill }
  | {
      readonly type: 'survivor/commonSkillBought';
      readonly id: string;
      readonly skill: CommonSkill;
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
  | { readonly type: 'survivor/tierBought'; readonly id: string; readonly raise: Stat | null }
  | { readonly type: 'survivor/removed'; readonly id: string }
  /**
   * Claims a base for a community that has none.
   *
   * Carries the base's id and nothing else: everything about the base — its
   * slots, their kinds, the facilities it ships — is in `src/data/bases.ts`,
   * so claiming copies nothing and there is nothing here to fall out of sync
   * with the rules. What the player does to it afterwards is recorded per slot.
   */
  | { readonly type: 'base/claimed'; readonly base: BaseId }
  /**
   * Builds a facility into a slot, spending its Hardware.
   *
   * `labor` rides on the action because there is nowhere to read it from: the
   * pool is the project team's and that is Phase 3. It is the same shape as the
   * recruit roll — a value the UI captures and the reducer is handed, so the
   * reducer stays a pure function of its arguments.
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
  | {
      readonly type: 'facility/built';
      readonly slot: string;
      readonly facility: FacilityId;
      readonly labor: number;
    }
  /** Adds an upgrade to whatever stands in the slot. `labor` rides along for the same reason. */
  | {
      readonly type: 'upgrade/built';
      readonly slot: string;
      readonly upgrade: UpgradeId;
      readonly labor: number;
    };

export function campaignReducer(state: CampaignState, action: CampaignAction): CampaignState {
  switch (action.type) {
    case 'campaign/started':
      return {
        status: 'open',
        campaign: createNewCampaign(action.name, { id: action.id, createdAt: action.createdAt }),
      };

    case 'campaign/loaded':
      return { status: 'open', campaign: action.campaign };

    case 'campaign/renamed':
      return withCampaign(state, (campaign) => ({ ...campaign, name: action.name }));

    case 'campaign/phaseSet':
      return withCampaign(state, (campaign) => ({ ...campaign, phase: action.phase }));

    /**
     * Increments the turn and nothing else. Resetting the phase alongside it
     * would be a claim about how a turn begins, which is turn-engine work
     * (Phase 3) and a rule — and rules do not live in the store. Callers set
     * the phase explicitly.
     */
    case 'campaign/turnAdvanced':
      return withCampaign(state, (campaign) => ({ ...campaign, turn: campaign.turn + 1 }));

    case 'campaign/startingCommunityBuiltSet':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        startingCommunityBuilt: action.built,
      }));

    case 'survivor/added':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        survivors: [
          ...campaign.survivors,
          createSurvivor(action.name, action.tier, { id: action.id }),
        ],
      }));

    /**
     * Renaming is by id rather than by index: the roster is reordered by
     * removals, and a stale index renames the wrong person.
     */
    case 'survivor/recruited':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        survivors: [
          ...campaign.survivors,
          recruitSurvivor(action.name, action.tier, action.roll, { id: action.id }),
        ],
      }));

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
     * price and legality check and returns the survivor unchanged when the
     * purchase is blocked, so this reducer cannot spend XP the survivor does not
     * have by forgetting to ask — there is nothing here to forget.
     */
    case 'survivor/skillLevelBought':
      return editSurvivor(state, action.id, (survivor) =>
        withSkillLevelBought(survivor, action.skill),
      );

    case 'survivor/commonSkillBought':
      return editSurvivor(state, action.id, (survivor) =>
        withCommonSkillBought(survivor, action.skill),
      );

    case 'survivor/tierBought':
      return editSurvivor(state, action.id, (survivor) => withTierBought(survivor, action.raise));

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
      return withCampaign(state, (campaign) =>
        campaign.base === null ? { ...campaign, base: { id: action.base, slots: {} } } : campaign,
      );

    case 'campaign/materialSet':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        materials: { ...campaign.materials, [action.material]: action.count },
      }));

    /**
     * Delegates wholesale, the way the three advancement purchases do.
     * `withFacilityBuilt` re-runs its own check and returns the campaign
     * unchanged when anything blocks the build, so this reducer cannot spend
     * Hardware the community does not have by forgetting to ask — there is
     * nothing here to forget.
     */
    case 'facility/built':
      return withCampaign(state, (campaign) =>
        withFacilityBuilt(campaign, {
          slot: action.slot,
          facility: action.facility,
          labor: action.labor,
        }),
      );

    case 'upgrade/built':
      return withCampaign(state, (campaign) =>
        withUpgradeBuilt(campaign, {
          slot: action.slot,
          upgrade: action.upgrade,
          labor: action.labor,
        }),
      );

    case 'survivor/removed':
      return withCampaign(state, (campaign) => ({
        ...campaign,
        survivors: campaign.survivors.filter((survivor) => survivor.id !== action.id),
      }));

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
 * Makes an unhandled action a compile error rather than a silent no-op, so
 * adding a member to `CampaignAction` cannot ship without a matching case.
 */
function assertNever(action: never): never {
  throw new Error(`Unhandled campaign action: ${JSON.stringify(action)}`);
}
