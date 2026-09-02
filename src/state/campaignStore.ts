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

import { MIN_SKILL_LEVEL, type Skill } from '../data/skills';
import type { Tier } from '../data/tiers';
import { createNewCampaign } from '../engine/campaign';
import type { Campaign, CampaignPhase, Stats, Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';

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
 * Five `campaign/*` actions from Phase 0 and three `survivor/*` from Phase 1.
 * The second namespace is deliberate: those act on a member of the campaign
 * rather than on the campaign itself, and `campaign/survivorAdded` reads worse
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
  | { readonly type: 'survivor/renamed'; readonly id: string; readonly name: string }
  /**
   * Set a survivor's current health.
   *
   * Only *current* health — max HP is the Tier and is derived, so there is
   * nothing to set. Wounds come from the tactical layer, which the app does not
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
  /** Take a skill, at level 0 — skills all start there (pg. 41). */
  | { readonly type: 'survivor/skillAdded'; readonly id: string; readonly skill: Skill }
  | { readonly type: 'survivor/skillRemoved'; readonly id: string; readonly skill: Skill }
  | { readonly type: 'survivor/removed'; readonly id: string };

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
