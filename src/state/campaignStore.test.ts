import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PHASES, createNewCampaign } from '../engine/campaign';
import type { Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { INITIAL_CAMPAIGN_STATE, campaignReducer } from './campaignStore';
import type { CampaignAction, CampaignState } from './campaignStore';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const OTHER = { id: '99999999-8888-7777-6666-555555555555', createdAt: '2026-09-01T00:00:00.000Z' };
const SURVIVOR_ID = 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53';
const OTHER_SURVIVOR_ID = 'd2c93a75-1e48-4f60-b8d7-5a3e0c96f41b';

/** An open state to run editing actions against. */
function openState(campaign: Campaign = createNewCampaign('Cedar Hollow', FIXED)): CampaignState {
  return { status: 'open', campaign };
}

/** Narrows to the open case so a test can read `.campaign` without a cast. */
function expectOpen(state: CampaignState): Campaign {
  if (state.status !== 'open') {
    throw new Error(`expected an open campaign, got "${state.status}"`);
  }
  return state.campaign;
}

describe('INITIAL_CAMPAIGN_STATE', () => {
  it('boots with no campaign open', () => {
    expect(INITIAL_CAMPAIGN_STATE).toEqual({ status: 'empty' });
  });
});

describe('campaign/started', () => {
  const start: CampaignAction = {
    type: 'campaign/started',
    name: 'Cedar Hollow',
    id: FIXED.id,
    createdAt: FIXED.createdAt,
  };

  it('opens a fresh campaign from the empty state', () => {
    const campaign = expectOpen(campaignReducer(INITIAL_CAMPAIGN_STATE, start));

    expect(campaign).toEqual(createNewCampaign('Cedar Hollow', FIXED));
  });

  it('takes its id and timestamp from the action rather than generating them', () => {
    const campaign = expectOpen(campaignReducer(INITIAL_CAMPAIGN_STATE, start));

    expect(campaign.id).toBe(FIXED.id);
    expect(campaign.createdAt).toBe(FIXED.createdAt);
  });

  /**
   * The reason `id` and `createdAt` are on the action at all. A reducer that
   * called `crypto.randomUUID()` would be untestable without stubbing globals,
   * and would give a different result for the same inputs — which is exactly
   * the property the rest of the app relies on.
   */
  it('is deterministic for the same action', () => {
    expect(campaignReducer(INITIAL_CAMPAIGN_STATE, start)).toEqual(
      campaignReducer(INITIAL_CAMPAIGN_STATE, start),
    );
  });

  it('replaces a campaign that is already open', () => {
    const existing = openState();

    const campaign = expectOpen(
      campaignReducer(existing, { ...start, name: 'Millbrook', ...OTHER }),
    );

    expect(campaign.name).toBe('Millbrook');
    expect(campaign.id).toBe(OTHER.id);
  });
});

describe('campaign/loaded', () => {
  const imported = createNewCampaign('Imported', OTHER);

  it('adopts an imported campaign from the empty state', () => {
    const state = campaignReducer(INITIAL_CAMPAIGN_STATE, {
      type: 'campaign/loaded',
      campaign: imported,
    });

    expect(expectOpen(state)).toEqual(imported);
  });

  it('replaces a campaign that is already open', () => {
    const state = campaignReducer(openState(), { type: 'campaign/loaded', campaign: imported });

    expect(expectOpen(state).id).toBe(OTHER.id);
  });

  /**
   * Validation and migration live in `src/persistence`; the store deliberately
   * re-checks nothing, so a loaded campaign must survive verbatim rather than
   * being normalised on the way in.
   */
  it('stores the campaign verbatim', () => {
    const turnFive: Campaign = { ...imported, turn: 5, phase: 'planning' };

    const state = campaignReducer(INITIAL_CAMPAIGN_STATE, {
      type: 'campaign/loaded',
      campaign: turnFive,
    });

    expect(expectOpen(state)).toEqual(turnFive);
  });
});

describe('campaign/renamed', () => {
  it('changes only the name', () => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    const after = expectOpen(
      campaignReducer(openState(before), { type: 'campaign/renamed', name: 'Millbrook' }),
    );

    expect(after).toEqual({ ...before, name: 'Millbrook' });
  });
});

describe('campaign/phaseSet', () => {
  it.each(CAMPAIGN_PHASES)('moves the campaign to the %s phase', (phase) => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    const after = expectOpen(
      campaignReducer(openState(before), { type: 'campaign/phaseSet', phase }),
    );

    expect(after).toEqual({ ...before, phase });
  });
});

describe('campaign/turnAdvanced', () => {
  it('increments the turn by one', () => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    const after = expectOpen(campaignReducer(openState(before), { type: 'campaign/turnAdvanced' }));

    expect(after.turn).toBe(before.turn + 1);
  });

  /**
   * Pinned on purpose. Sending the campaign back to the Mission Phase on a new
   * turn is a claim about turn structure — a rule, and Phase 0 ships none.
   * If that behaviour is ever wanted it belongs in the Phase 3 turn engine.
   */
  it('leaves the phase alone', () => {
    const midTurn: Campaign = { ...createNewCampaign('Cedar Hollow', FIXED), phase: 'management' };

    const after = expectOpen(
      campaignReducer(openState(midTurn), { type: 'campaign/turnAdvanced' }),
    );

    expect(after).toEqual({ ...midTurn, turn: midTurn.turn + 1 });
  });
});

describe('the survivor actions', () => {
  /** An open campaign with two survivors already on the roster. */
  function withRoster(): CampaignState {
    let state = openState();
    state = campaignReducer(state, {
      type: 'survivor/added',
      name: 'Earl Rhodes',
      tier: 4,
      id: SURVIVOR_ID,
    });
    return campaignReducer(state, {
      type: 'survivor/added',
      name: 'Carla Proust',
      tier: 3,
      id: OTHER_SURVIVOR_ID,
    });
  }

  it('adds a survivor built from the tier the caller asked for', () => {
    const campaign = expectOpen(withRoster());

    expect(campaign.survivors).toHaveLength(2);
    expect(campaign.survivors[0]).toEqual(createSurvivor('Earl Rhodes', 4, { id: SURVIVOR_ID }));
  });

  it('appends rather than reordering, so the roster reads in the order it was built', () => {
    const campaign = expectOpen(withRoster());

    expect(campaign.survivors.map((survivor) => survivor.name)).toEqual([
      'Earl Rhodes',
      'Carla Proust',
    ]);
  });

  /**
   * By id, not by index. Removing someone reorders the array, and an index
   * captured before that renames whoever moved into the slot.
   */
  it('renames the survivor with the matching id and leaves the rest alone', () => {
    const campaign = expectOpen(
      campaignReducer(withRoster(), {
        type: 'survivor/renamed',
        id: OTHER_SURVIVOR_ID,
        name: 'Carla P.',
      }),
    );

    expect(campaign.survivors.map((survivor) => survivor.name)).toEqual([
      'Earl Rhodes',
      'Carla P.',
    ]);
  });

  it('ignores a rename for an id that is not on the roster', () => {
    const before = expectOpen(withRoster());
    const after = expectOpen(
      campaignReducer(withRoster(), {
        type: 'survivor/renamed',
        id: 'not-a-survivor',
        name: 'Nobody',
      }),
    );

    expect(after.survivors).toEqual(before.survivors);
  });

  it('sets current health without touching anything else about the survivor', () => {
    const before = expectOpen(withRoster()).survivors[0];
    const after = expectOpen(
      campaignReducer(withRoster(), { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 1 }),
    ).survivors[0];

    expect(after).toEqual({ ...before, currentHp: 1 });
  });

  /**
   * Zero is a real state, not a missing value: a survivor at 0 HP faces a rot
   * check in the Management Phase rather than being gone from the roster.
   */
  it('accepts zero health', () => {
    const campaign = expectOpen(
      campaignReducer(withRoster(), { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 0 }),
    );

    expect(campaign.survivors[0]?.currentHp).toBe(0);
    expect(campaign.survivors).toHaveLength(2);
  });

  it('removes only the named survivor', () => {
    const campaign = expectOpen(
      campaignReducer(withRoster(), { type: 'survivor/removed', id: SURVIVOR_ID }),
    );

    expect(campaign.survivors.map((survivor) => survivor.name)).toEqual(['Carla Proust']);
  });

  /**
   * The reason the roster is worth having at all: what goes in comes back out
   * of the save file unchanged.
   */
  it('produces survivors that survive a JSON round trip', () => {
    const campaign = expectOpen(withRoster());
    const restored: Campaign = JSON.parse(JSON.stringify(campaign));

    expect(restored.survivors).toEqual(campaign.survivors);
  });
});

/**
 * Editing actions dispatched with nothing open are a UI bug, not a user-facing
 * error. Ignoring them keeps a stray dispatch from taking down the render tree
 * mid-campaign, and returning the identical reference keeps React from
 * re-rendering over a no-op.
 */
describe('editing actions against the empty state', () => {
  const editingActions: readonly CampaignAction[] = [
    { type: 'campaign/renamed', name: 'Millbrook' },
    { type: 'campaign/phaseSet', phase: 'planning' },
    { type: 'campaign/turnAdvanced' },
    { type: 'survivor/added', name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    { type: 'survivor/renamed', id: SURVIVOR_ID, name: 'Earl Rhodes Jr' },
    { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 1 },
    { type: 'survivor/removed', id: SURVIVOR_ID },
  ];

  for (const action of editingActions) {
    it(`ignores ${action.type} and returns the same state reference`, () => {
      expect(campaignReducer(INITIAL_CAMPAIGN_STATE, action)).toBe(INITIAL_CAMPAIGN_STATE);
    });
  }
});

/**
 * The acceptance criterion for the whole story: the reducer is a pure function.
 * Every action is replayed against a frozen state, and the state is compared
 * against a clone taken beforehand — so both a direct write and a nested one
 * fail here rather than surfacing later as a campaign that changed under a
 * component that never dispatched anything.
 */
describe('purity', () => {
  const allActions: readonly CampaignAction[] = [
    { type: 'campaign/started', name: 'Millbrook', id: OTHER.id, createdAt: OTHER.createdAt },
    { type: 'campaign/loaded', campaign: createNewCampaign('Imported', OTHER) },
    { type: 'campaign/renamed', name: 'Millbrook' },
    { type: 'campaign/phaseSet', phase: 'advancement' },
    { type: 'campaign/turnAdvanced' },
    { type: 'survivor/added', name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    { type: 'survivor/renamed', id: SURVIVOR_ID, name: 'Earl Rhodes Jr' },
    { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 1 },
    { type: 'survivor/removed', id: SURVIVOR_ID },
  ];

  for (const action of allActions) {
    it(`does not mutate its input for ${action.type}`, () => {
      const state = openState();
      const before = structuredClone(state);
      deepFreeze(state);

      campaignReducer(state, action);

      expect(state).toEqual(before);
    });

    it(`returns a new state object for ${action.type}`, () => {
      const state = openState();

      expect(campaignReducer(state, action)).not.toBe(state);
    });
  }

  it('throws on an action it does not recognise rather than silently ignoring it', () => {
    const bogus = { type: 'campaign/exploded' } as unknown as CampaignAction;

    expect(() => campaignReducer(openState(), bogus)).toThrow(/Unhandled campaign action/);
  });
});

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
}
