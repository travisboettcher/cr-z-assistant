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

import { createNewCampaign } from '../engine/campaign';
import type { Campaign, CampaignPhase } from '../engine/campaign';

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
 * The whole action surface for Phase 0.
 *
 * Deliberately four actions. Survivors, bases, facilities and materials
 * arithmetic are Phase 1+ and ship no rules here, so inventing actions for them
 * now would mean designing rules-shaped events before the rules exist. There is
 * also no "close campaign" action: nothing in Phase 0 goes from open back to
 * empty without immediately opening another campaign, and an action with no
 * caller is a guess about the future.
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
  | { readonly type: 'campaign/turnAdvanced' };

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
