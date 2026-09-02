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

import type { Tier } from '../data/tiers';
import { createNewCampaign } from '../engine/campaign';
import type { Campaign, CampaignPhase } from '../engine/campaign';
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
      return withCampaign(state, (campaign) => ({
        ...campaign,
        survivors: campaign.survivors.map((survivor) =>
          survivor.id === action.id ? { ...survivor, name: action.name } : survivor,
        ),
      }));

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
