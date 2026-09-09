import { describe, expect, it } from 'vitest';
import type { CampaignPhase, TurnStepId } from '../data/turn';
import { TURN_SEQUENCE } from '../engine/turn';
import { createNewCampaign } from '../engine/campaign';
import type { Campaign } from '../engine/campaign';
import type { CampaignEvent, LogEntry } from '../engine/log';
import { createSurvivor, recruitSurvivor } from '../engine/survivor';
import { INITIAL_CAMPAIGN_STATE, campaignReducer } from './campaignStore';
import type { CampaignAction, CampaignState } from './campaignStore';

/**
 * A fixed dispatch time, so an entry the log stamps is a value a test can
 * assert on rather than a moving clock. Every logged action carries one — see
 * the note on `at` in `campaignStore.ts`.
 */
const AT = '2026-09-08T21:00:00.000Z';

/**
 * One log entry, stamped at `AT`, filed where the campaign was when it
 * happened. Written out rather than reaching for `logged` so that a test says
 * what it expects instead of asking the code under test what it should have
 * produced.
 */
function entry(turn: number, phase: CampaignPhase, event: CampaignEvent): LogEntry {
  return { turn, phase, at: AT, event };
}

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
    at: AT,
    name: 'Cedar Hollow',
    id: FIXED.id,
    createdAt: FIXED.createdAt,
  };

  it('opens a fresh campaign from the empty state, with the start recorded', () => {
    const campaign = expectOpen(campaignReducer(INITIAL_CAMPAIGN_STATE, start));

    expect(campaign).toEqual({
      ...createNewCampaign('Cedar Hollow', FIXED),
      log: [entry(1, 'mission', { kind: 'campaign-started', name: 'Cedar Hollow' })],
    });
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
    const turnFive: Campaign = { ...imported, turn: 5, step: 'assign-project-team' };

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

describe('walking the turn', () => {
  const opened = (step: TurnStepId, turn = 1): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn,
    step,
  });

  it('moves one step, recording nothing inside a phase', () => {
    const before = opened('check-for-rot');

    const after = expectOpen(
      campaignReducer(openState(before), { type: 'turn/advanced', by: 'step', at: AT }),
    );

    // Nineteen entries a turn for pressing Next is a history nobody reads.
    expect(after).toEqual({ ...before, step: 'feed-your-survivors' });
  });

  it('records the crossing when a step opens a new phase', () => {
    const before = opened('tactical-mission');

    const after = expectOpen(
      campaignReducer(openState(before), { type: 'turn/advanced', by: 'step', at: AT }),
    );

    // Stamped after the move, so the entry sits in the phase just entered.
    expect(after).toEqual({
      ...before,
      step: 'character-advancement',
      log: [entry(1, 'advancement', { kind: 'phase-entered' })],
    });
  });

  it('skips the rest of a phase without leaving the order', () => {
    const before = opened('character-advancement');

    const after = expectOpen(
      campaignReducer(openState(before), { type: 'turn/advanced', by: 'phase', at: AT }),
    );

    // Past four unfinished Advancement steps and into the first Planning one —
    // forward, and not reachable any other way than in order.
    expect(after).toEqual({
      ...before,
      step: 'assign-facility-staff',
      log: [entry(1, 'planning', { kind: 'phase-entered' })],
    });
  });

  it.each(['step', 'phase'] as const)(
    'ends the turn off the end of the Management Phase, by %s',
    (by) => {
      const before = opened('departures', 3);

      const after = expectOpen(
        campaignReducer(openState(before), { type: 'turn/advanced', by, at: AT }),
      );

      expect(after).toEqual({
        ...before,
        turn: 4,
        step: 'select-mission',
        // One entry, not two. "Turn 4 began" already says the Mission Phase is
        // open, and a `phase-entered` beside it would be the log narrating.
        log: [entry(4, 'mission', { kind: 'turn-began' })],
      });
    },
  );

  it('offers no way to reach a phase out of order', () => {
    // The whole reason `turn/advanced` carries no destination. Walking a turn
    // from its first step must visit all nineteen, in the book's order — there
    // is no action that could skip backwards or sideways into one.
    let state = openState(opened('select-mission'));
    const visited: TurnStepId[] = ['select-mission'];

    for (let move = 0; move < TURN_SEQUENCE.length - 1; move += 1) {
      state = campaignReducer(state, { type: 'turn/advanced', by: 'step', at: AT });
      visited.push(expectOpen(state).step);
    }

    expect(visited).toEqual(TURN_SEQUENCE);
  });

  it('steps back within the turn, and records nothing for doing so', () => {
    const before = opened('assign-beds', 2);

    const after = expectOpen(campaignReducer(openState(before), { type: 'turn/reversed' }));

    // A correction to the record, not something that happened — the same rule
    // that keeps a rename out of the log.
    expect(after).toEqual({ ...before, step: 'feed-your-survivors' });
  });

  it('refuses to step back out of the turn it is in', () => {
    // The turn that ended took materials, Health and sometimes survivors with
    // it, and "back" cannot put those back.
    const before = opened('select-mission', 4);

    const after = expectOpen(campaignReducer(openState(before), { type: 'turn/reversed' }));

    expect(after).toEqual(before);
    expect(after.turn).toBe(4);
  });

  it('comes back to where it started after a step forward and a step back', () => {
    const before = opened('feed-your-survivors', 2);

    const forward = campaignReducer(openState(before), {
      type: 'turn/advanced',
      by: 'step',
      at: AT,
    });
    const back = expectOpen(campaignReducer(forward, { type: 'turn/reversed' }));

    expect(back.step).toBe(before.step);
    expect(back.turn).toBe(before.turn);
  });
});

describe('the survivor actions', () => {
  /** An open campaign with two survivors already on the roster. */
  function withRoster(): CampaignState {
    let state = openState();
    state = campaignReducer(state, {
      type: 'survivor/added',
      at: AT,
      name: 'Earl Rhodes',
      tier: 4,
      id: SURVIVOR_ID,
    });
    return campaignReducer(state, {
      type: 'survivor/added',
      at: AT,
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
      campaignReducer(withRoster(), { type: 'survivor/removed', at: AT, id: SURVIVOR_ID }),
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
    { type: 'turn/advanced', at: AT, by: 'step' },
    { type: 'turn/reversed' },
    { type: 'campaign/startingCommunityBuiltSet', at: AT, built: true },
    { type: 'survivor/added', at: AT, name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    {
      type: 'survivor/recruited',
      at: AT,
      name: 'Carla Proust',
      tier: 3,
      roll: 6,
      id: OTHER_SURVIVOR_ID,
    },
    { type: 'survivor/renamed', id: SURVIVOR_ID, name: 'Earl Rhodes Jr' },
    { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 1 },
    { type: 'survivor/removed', at: AT, id: SURVIVOR_ID },
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
    {
      type: 'campaign/started',
      at: AT,
      name: 'Millbrook',
      id: OTHER.id,
      createdAt: OTHER.createdAt,
    },
    { type: 'campaign/loaded', campaign: createNewCampaign('Imported', OTHER) },
    { type: 'campaign/renamed', name: 'Millbrook' },
    { type: 'turn/advanced', at: AT, by: 'phase' },
    { type: 'campaign/startingCommunityBuiltSet', at: AT, built: true },
    { type: 'survivor/added', at: AT, name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    {
      type: 'survivor/recruited',
      at: AT,
      name: 'Carla Proust',
      tier: 3,
      roll: 6,
      id: OTHER_SURVIVOR_ID,
    },
    { type: 'survivor/renamed', id: SURVIVOR_ID, name: 'Earl Rhodes Jr' },
    { type: 'survivor/hpSet', id: SURVIVOR_ID, currentHp: 1 },
    { type: 'survivor/removed', at: AT, id: SURVIVOR_ID },
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

describe('campaign/startingCommunityBuiltSet', () => {
  it('records the answer both ways, changing nothing else', () => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    expect(before.startingCommunityBuilt).toBe(false);

    const built = expectOpen(
      campaignReducer(openState(before), {
        type: 'campaign/startingCommunityBuiltSet',
        at: AT,
        built: true,
      }),
    );
    expect(built).toEqual({
      ...before,
      startingCommunityBuilt: true,
      log: [entry(1, 'mission', { kind: 'starting-community-settled', built: true })],
    });

    const unbuilt = expectOpen(
      campaignReducer(openState(built), {
        type: 'campaign/startingCommunityBuiltSet',
        at: AT,
        built: false,
      }),
    );
    // Back to where it started, except the log — which is the point of an
    // append-only log: a reversal is a second thing that happened, not the
    // undoing of the first.
    expect(unbuilt).toEqual({
      ...before,
      log: [
        entry(1, 'mission', { kind: 'starting-community-settled', built: true }),
        entry(1, 'mission', { kind: 'starting-community-settled', built: false }),
      ],
    });
  });

  it('records nothing for an answer the campaign already gives', () => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    const after = expectOpen(
      campaignReducer(openState(before), {
        type: 'campaign/startingCommunityBuiltSet',
        at: AT,
        built: before.startingCommunityBuilt,
      }),
    );

    expect(after).toEqual(before);
  });
});

describe('survivor/recruited', () => {
  it('adds the recruit the rulebook’s own example produces', () => {
    const campaign = expectOpen(
      campaignReducer(openState(), {
        type: 'survivor/recruited',
        at: AT,
        name: 'Carla Proust',
        tier: 3,
        roll: 6,
        id: SURVIVOR_ID,
      }),
    );

    // A six is Archery (pg. 15).
    expect(campaign.survivors[0]).toEqual(
      recruitSurvivor('Carla Proust', 3, 6, { id: SURVIVOR_ID }),
    );
    expect(Object.keys(campaign.survivors[0]?.skills ?? {})).toEqual(['archery']);
  });

  it('appends to the roster like any other arrival', () => {
    let state = campaignReducer(openState(), {
      type: 'survivor/added',
      at: AT,
      name: 'Earl Rhodes',
      tier: 4,
      id: SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/recruited',
      at: AT,
      name: 'Carla Proust',
      tier: 3,
      roll: 6,
      id: OTHER_SURVIVOR_ID,
    });

    expect(expectOpen(state).survivors.map((s) => s.name)).toEqual(['Earl Rhodes', 'Carla Proust']);
  });
});

describe('spending experience', () => {
  /** A Citizen with two skills, six XP, and both stats already assigned. */
  function withCitizen(xp: number): CampaignState {
    let state = campaignReducer(openState(), {
      type: 'survivor/added',
      at: AT,
      name: 'Marcus Webb',
      tier: 2,
      id: SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/skillAdded',
      id: SURVIVOR_ID,
      skill: 'scavenge',
    });

    return campaignReducer(state, { type: 'survivor/xpSet', id: SURVIVOR_ID, xp });
  }

  function survivor(state: CampaignState) {
    return expectOpen(state).survivors[0];
  }

  it('records an experience balance the player types in', () => {
    expect(survivor(withCitizen(6))?.xp).toBe(6);
  });

  /**
   * The reducer delegates the price to the engine, so this is where the two
   * cost shapes have to still be distinct after going through the store: one
   * skill level and one point of Move, bought by the same survivor out of the
   * same balance.
   */
  it('charges a skill level its level and a point of move its score', () => {
    const start = withCitizen(20);

    const levelled = campaignReducer(start, {
      type: 'survivor/skillLevelBought',
      at: AT,
      id: SURVIVOR_ID,
      skill: 'scavenge',
    });
    expect(survivor(levelled)?.skills.scavenge).toBe(1);
    expect(survivor(levelled)?.xp).toBe(19);

    const faster = campaignReducer(start, {
      type: 'survivor/commonSkillBought',
      at: AT,
      id: SURVIVOR_ID,
      skill: 'move',
    });
    expect(survivor(faster)?.move).toBe(7);
    expect(survivor(faster)?.xp).toBe(13);
  });

  /**
   * The reducer never checks a price itself, so this is really a test that it
   * cannot: a blocked purchase comes back as the same survivor, from the engine.
   */
  it('refuses a purchase the survivor cannot pay for', () => {
    const broke = withCitizen(0);

    const after = campaignReducer(broke, {
      type: 'survivor/commonSkillBought',
      at: AT,
      id: SURVIVOR_ID,
      skill: 'defense',
    });

    expect(survivor(after)).toEqual(survivor(broke));
  });

  it('promotes a survivor, spending the price and rebuilding their stats', () => {
    const after = campaignReducer(withCitizen(6), {
      type: 'survivor/tierBought',
      at: AT,
      id: SURVIVOR_ID,
      // A Citizen is 2/1/0/0, so which zero becomes the Leader's 1 is the
      // player's (pg. 18) and rides on the action.
      raise: 'intelligence',
    });

    expect(survivor(after)?.tier).toBe(3);
    expect(survivor(after)?.xp).toBe(0);
    expect(survivor(after)?.stats.intelligence).toBe(1);
    expect(Object.values(survivor(after)?.stats ?? {}).sort()).toEqual([0, 1, 2, 3]);
  });

  /**
   * The reducer cannot promote past the question, for the same reason it cannot
   * overspend: `withTierBought` re-runs the check and hands the survivor back.
   */
  it('promotes nobody when the zero-stat choice has not been made', () => {
    const before = withCitizen(6);
    const after = campaignReducer(before, {
      type: 'survivor/tierBought',
      at: AT,
      id: SURVIVOR_ID,
      raise: null,
    });

    expect(survivor(after)).toEqual(survivor(before));
  });

  it('spends nobody else’s experience', () => {
    let state = campaignReducer(withCitizen(20), {
      type: 'survivor/added',
      at: AT,
      name: 'Earl Rhodes',
      tier: 4,
      id: OTHER_SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/commonSkillBought',
      at: AT,
      id: SURVIVOR_ID,
      skill: 'move',
    });

    const earl = expectOpen(state).survivors[1];
    expect(earl?.move).toBe(6);
    expect(earl?.xp).toBe(0);
  });
});

/**
 * Two actions that had no reducer test at all until mutation testing said so
 * (issue #40).
 *
 * Both were exercised only through the character sheet, so deleting their case
 * from this reducer broke nothing in `src/state`'s own suite — which is exactly
 * the gap the pure-layer mutation run was scoped to expose. A rule that only
 * breaks when rendered is a rule nobody can check without a DOM.
 */
describe('the actions only the sheet was testing', () => {
  function withSurvivor(): CampaignState {
    return campaignReducer(openState(), {
      type: 'survivor/added',
      at: AT,
      name: 'Earl Rhodes',
      tier: 4,
      id: SURVIVOR_ID,
    });
  }

  /**
   * The whole record at once, because assigning one stat swaps it with whoever
   * held that value — one assignment is always two changes, and sending them
   * separately would let a render land on a stat array no tier hands out.
   */
  it('survivor/statsSet replaces the four stat values', () => {
    const stats = { strength: 1, dexterity: 2, intelligence: 3, cooperation: 4 };

    const after = campaignReducer(withSurvivor(), {
      type: 'survivor/statsSet',
      id: SURVIVOR_ID,
      stats,
    });

    expect(expectOpen(after).survivors[0]?.stats).toEqual(stats);
  });

  it('survivor/statsSet leaves everything else about the survivor alone', () => {
    const before = expectOpen(withSurvivor()).survivors[0];
    const stats = { strength: 4, dexterity: 3, intelligence: 2, cooperation: 1 };

    const after = expectOpen(
      campaignReducer(withSurvivor(), { type: 'survivor/statsSet', id: SURVIVOR_ID, stats }),
    ).survivors[0];

    expect(after).toEqual({ ...before, stats });
  });

  /**
   * Removed, not zeroed. A skill at level 0 is one the survivor *has* and is
   * spending a tier slot on; deleting the key is what gives the slot back, and
   * `skillSlotsAreFull` counts keys.
   */
  it('survivor/skillRemoved deletes the key rather than zeroing it', () => {
    let state = campaignReducer(withSurvivor(), {
      type: 'survivor/skillAdded',
      id: SURVIVOR_ID,
      skill: 'archery',
    });
    expect(expectOpen(state).survivors[0]?.skills).toEqual({ archery: 0 });

    state = campaignReducer(state, {
      type: 'survivor/skillRemoved',
      id: SURVIVOR_ID,
      skill: 'archery',
    });

    expect(expectOpen(state).survivors[0]?.skills).toEqual({});
    expect('archery' in (expectOpen(state).survivors[0]?.skills ?? {})).toBe(false);
  });

  it('survivor/skillRemoved keeps the survivor’s other skills', () => {
    let state = withSurvivor();
    for (const skill of ['archery', 'tactics', 'carry'] as const) {
      state = campaignReducer(state, { type: 'survivor/skillAdded', id: SURVIVOR_ID, skill });
    }

    state = campaignReducer(state, {
      type: 'survivor/skillRemoved',
      id: SURVIVOR_ID,
      skill: 'tactics',
    });

    expect(Object.keys(expectOpen(state).survivors[0]?.skills ?? {})).toEqual(['archery', 'carry']);
  });

  it('survivor/skillRemoved does not touch a skill the survivor never had', () => {
    const before = expectOpen(withSurvivor()).survivors[0];

    const after = campaignReducer(withSurvivor(), {
      type: 'survivor/skillRemoved',
      id: SURVIVOR_ID,
      skill: 'stealth',
    });

    expect(expectOpen(after).survivors[0]).toEqual(before);
  });
});

/**
 * Creation and recruitment coincide at tier 4, which is why every earlier
 * `survivor/added` test could not tell them apart (issue #40).
 *
 * A Hero's skill is never randomly generated (pg. 7), so `recruitSurvivor`
 * and `createSurvivor` return the same Hero — and every test above adds a tier
 * 4. Handing `survivor/added` to the recruit path therefore changed nothing
 * anybody was checking. At tier 2 the two genuinely differ: a recruit rolls a
 * skill and a created survivor arrives with empty slots.
 */
describe('a survivor added rather than recruited', () => {
  it('arrives with no skills at a tier where recruits would roll one', () => {
    const campaign = expectOpen(
      campaignReducer(openState(), {
        type: 'survivor/added',
        at: AT,
        name: 'Marcus Webb',
        tier: 2,
        id: SURVIVOR_ID,
      }),
    );

    expect(campaign.survivors[0]).toEqual(createSurvivor('Marcus Webb', 2, { id: SURVIVOR_ID }));
    expect(campaign.survivors[0]?.skills).toEqual({});
  });

  /** The contrast, from the same tier: a recruit at 2 does come with a skill. */
  it('unlike a recruit at the same tier, who comes with the skill they rolled', () => {
    const campaign = expectOpen(
      campaignReducer(openState(), {
        type: 'survivor/recruited',
        at: AT,
        name: 'Marcus Webb',
        tier: 2,
        roll: 6,
        id: SURVIVOR_ID,
      }),
    );

    expect(campaign.survivors[0]?.skills).toEqual({ archery: 0 });
  });
});

describe('base/claimed', () => {
  it('claims a base for a community that has none', () => {
    const state = campaignReducer(openState(), {
      type: 'base/claimed',
      at: AT,
      base: 'hobby-farm',
    });

    // Nothing but the id and an empty slot record: the layout, the built-in
    // facilities and the clearing projects are rules, and they stay in the data.
    expect(expectOpen(state).base).toEqual({ id: 'hobby-farm', slots: {} });
  });

  it('refuses to replace a base that is already claimed', () => {
    const claimed = campaignReducer(openState(), {
      type: 'base/claimed',
      at: AT,
      base: 'hobby-farm',
    });
    const built = {
      status: 'open' as const,
      campaign: {
        ...expectOpen(claimed),
        base: { id: 'hobby-farm' as const, slots: { 'front-yard': { cleared: true as const } } },
      },
    };

    const again = campaignReducer(built, { type: 'base/claimed', at: AT, base: 'distillery' });

    // Moving house is the Claim a New Base mission (Phase 4). Allowing it here
    // would drop every slot the player had built into, in one dispatch.
    expect(expectOpen(again).base).toEqual({
      id: 'hobby-farm',
      slots: { 'front-yard': { cleared: true } },
    });
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, { type: 'base/claimed', at: AT, base: 'hobby-farm' }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('facility/built', () => {
  /** A claimed base with Hardware to spend, on a turn worth recording. */
  function withBase(): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
      turn: 3,
      base: { id: 'small-town-home', slots: {} },
    });
  }

  it('builds the facility and spends its Hardware', () => {
    const state = campaignReducer(withBase(), {
      type: 'facility/built',
      at: AT,
      slot: 'garage',
      facility: 'workshop',
      labor: 2,
    });
    const campaign = expectOpen(state);

    expect(campaign.base?.slots.garage).toEqual({
      built: { facility: 'workshop', builtOnTurn: 3 },
    });
    expect(campaign.materials.hardware).toBe(6);
  });

  it('does nothing when the build is blocked', () => {
    // Delegated wholesale to `withFacilityBuilt`, which re-runs its own check —
    // so the reducer cannot spend Hardware by forgetting to ask.
    const before = withBase();
    const state = campaignReducer(before, {
      type: 'facility/built',
      at: AT,
      slot: 'kitchen',
      facility: 'workshop',
      labor: 2,
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'facility/built',
        at: AT,
        slot: 'garage',
        facility: 'workshop',
        labor: 2,
      }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('campaign/materialSet', () => {
  it('sets one material and leaves the other three alone', () => {
    const state = campaignReducer(openState(), {
      type: 'campaign/materialSet',
      material: 'hardware',
      count: 7,
    });

    expect(expectOpen(state).materials).toEqual({ food: 0, fuel: 0, hardware: 7, rare: 0 });
  });

  it('records a count over any cap, because Check Storage is not this app’s yet', () => {
    // A Tier 1 base stores 4 Hardware (pg. 54). Refusing the number here would
    // be inventing a consequence the Management Phase owns (pg. 23).
    const state = campaignReducer(openState(), {
      type: 'campaign/materialSet',
      material: 'food',
      count: 99,
    });

    expect(expectOpen(state).materials.food).toBe(99);
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'campaign/materialSet',
        material: 'food',
        count: 3,
      }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('upgrade/built', () => {
  const kitchen = (): CampaignState =>
    openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
      turn: 3,
      base: { id: 'small-town-home', slots: {} },
    });

  it('adds the upgrade and spends its Hardware', () => {
    const state = campaignReducer(kitchen(), {
      type: 'upgrade/built',
      at: AT,
      slot: 'kitchen',
      upgrade: 'gas-range',
      labor: 2,
    });
    const campaign = expectOpen(state);

    expect(campaign.base?.slots.kitchen?.upgrades).toEqual(['gas-range']);
    expect(campaign.materials.hardware).toBe(7);
  });

  it('does nothing when the upgrade is blocked', () => {
    const before = kitchen();
    // A Spotlight belongs to a Watchtower, not a Kitchen.
    const state = campaignReducer(before, {
      type: 'upgrade/built',
      at: AT,
      slot: 'kitchen',
      upgrade: 'spotlight',
      labor: 2,
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'upgrade/built',
        at: AT,
        slot: 'kitchen',
        upgrade: 'gas-range',
        labor: 2,
      }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('slot/cleared', () => {
  const farm = (): CampaignState =>
    openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      materials: { food: 0, fuel: 0, hardware: 1, rare: 0 },
      base: { id: 'hobby-farm', slots: {} },
    });

  it('clears the slot and credits what the project yields', () => {
    const campaign = expectOpen(
      campaignReducer(farm(), {
        type: 'slot/cleared',
        at: AT,
        slot: 'ruined-chicken-coop',
        labor: 2,
      }),
    );

    expect(campaign.base?.slots['ruined-chicken-coop']).toEqual({ cleared: true });
    expect(campaign.materials.hardware).toBe(3);
  });

  it('does nothing when the clearing is blocked', () => {
    const before = farm();
    const state = campaignReducer(before, {
      type: 'slot/cleared',
      at: AT,
      slot: 'ruined-chicken-coop',
      labor: 1,
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'slot/cleared',
        at: AT,
        slot: 'ruined-chicken-coop',
        labor: 2,
      }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('utility/toggled', () => {
  const powered = (): CampaignState =>
    openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      base: { id: 'small-town-home', slots: {} },
    });

  it('puts a point on the slot and takes it back off', () => {
    const on = campaignReducer(powered(), {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
      staffed: 1,
    });

    expect(expectOpen(on).base?.slots.kitchen?.water).toBe(true);

    const off = campaignReducer(on, {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
      staffed: 1,
    });

    expect(expectOpen(off).base?.slots.kitchen?.water).toBeUndefined();
  });

  it('does nothing when the base cannot generate the point', () => {
    const before = powered();
    const state = campaignReducer(before, {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
      staffed: 0,
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'utility/toggled',
        slot: 'kitchen',
        utility: 'water',
        staffed: 1,
      }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

/**
 * Every action, classified: does it earn a line in the campaign's history, and
 * exactly which line?
 *
 * **The `Record` is half the point.** Keyed by the action union's own `type`, so
 * an action added to the store without a decision here does not merely go
 * untested — it fails the typecheck. The log's rule (what happened to the
 * community, never a correction to how it was written down) is only as good as
 * the guarantee that somebody applied it to every action, and that guarantee is
 * this line rather than a reviewer's attention.
 *
 * **Carrying the whole expected entry is the other half.** An earlier draft
 * held a `logs: boolean` and asserted the log's *length*, which passes just as
 * happily when every event is built empty or with the wrong survivor's name in
 * it — sixteen mutants survived saying exactly that. A count is not an
 * assertion about a record; the record is.
 *
 * Each case carries an action that genuinely *does* something in `rich()`, and
 * the test asserts that too: an action that changed nothing would satisfy
 * "records nothing" for entirely the wrong reason.
 */
describe('what earns a line in the log', () => {
  const LOGGED_SURVIVOR = '6b1f0a9c-77d2-4e35-91b8-0d4c2a5e83f7';
  const DECOY = '0f3d8b51-4a26-4c19-b73e-8e5109cf2a64';

  /**
   * One campaign rich enough that every action below changes it: a claimed
   * base with rubble in one slot, an empty outdoor slot, Hardware to spend, a
   * turn late enough to build on, and a Citizen with skills and XP.
   *
   * **The Citizen is second on the roster, behind a survivor nothing touches.**
   * Every lookup in the store is a `find` by id, and with a roster of one, a
   * `find` that ignored its predicate entirely would return the right person
   * anyway. Two mutants lived in exactly that gap.
   */
  function rich(): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      // The last step of the Mission Phase, so that one step forward crosses
      // into the next phase and one step back has somewhere to go. Both turn
      // actions would otherwise be no-ops here and pass for the wrong reason.
      step: 'tactical-mission',
      materials: { food: 1, fuel: 1, hardware: 9, rare: 0 },
      survivors: [
        createSurvivor('Ruby Vance', 1, { id: DECOY }),
        {
          ...createSurvivor('Marcus Webb', 2, { id: LOGGED_SURVIVOR }),
          skills: { archery: 0 },
          xp: 20,
        },
      ],
      base: { id: 'hobby-farm', slots: {} },
    });
  }

  /** The survivor fields every survivor event carries, as `rich()` has them. */
  const WEBB = { survivor: LOGGED_SURVIVOR, name: 'Marcus Webb' } as const;

  interface Policy {
    readonly action: CampaignAction;
    /** The entry it must leave behind, or `null` for what the log ignores. */
    readonly entry: LogEntry | null;
    /** For the one action that needs a campaign without a base. */
    readonly state?: CampaignState;
  }

  const POLICY: Record<CampaignAction['type'], Policy> = {
    'campaign/started': {
      action: { type: 'campaign/started', at: AT, name: 'Millbrook', id: 'x', createdAt: AT },
      // A new campaign, so turn 1 rather than `rich()`'s turn 3.
      entry: entry(1, 'mission', { kind: 'campaign-started', name: 'Millbrook' }),
    },
    'turn/advanced': {
      // `rich()` sits on the last step of the Mission Phase, so one step
      // forward crosses into the Advancement Phase. Stamped after the move, so
      // the entry sits in the phase just entered.
      action: { type: 'turn/advanced', at: AT, by: 'step' },
      entry: entry(3, 'advancement', { kind: 'phase-entered' }),
    },
    // Stepping back is a correction to the record, like a rename.
    'turn/reversed': { action: { type: 'turn/reversed' }, entry: null },
    'campaign/startingCommunityBuiltSet': {
      action: { type: 'campaign/startingCommunityBuiltSet', at: AT, built: true },
      entry: entry(3, 'mission', { kind: 'starting-community-settled', built: true }),
    },
    'survivor/added': {
      action: { type: 'survivor/added', at: AT, name: 'Ruby Vance', tier: 1, id: 'ruby' },
      entry: entry(3, 'mission', {
        kind: 'survivor-added',
        survivor: 'ruby',
        name: 'Ruby Vance',
        tier: 1,
      }),
    },
    'survivor/recruited': {
      action: {
        type: 'survivor/recruited',
        at: AT,
        name: 'Carla Proust',
        tier: 2,
        roll: 6,
        id: 'carla',
      },
      entry: entry(3, 'mission', {
        kind: 'survivor-recruited',
        survivor: 'carla',
        name: 'Carla Proust',
        tier: 2,
        roll: 6,
      }),
    },
    'survivor/removed': {
      action: { type: 'survivor/removed', at: AT, id: LOGGED_SURVIVOR },
      entry: entry(3, 'mission', { kind: 'survivor-left', ...WEBB, tier: 2 }),
    },
    'survivor/tierBought': {
      action: { type: 'survivor/tierBought', at: AT, id: LOGGED_SURVIVOR, raise: 'intelligence' },
      // The Tier reached, not the one left behind.
      entry: entry(3, 'mission', { kind: 'survivor-promoted', ...WEBB, tier: 3 }),
    },
    'survivor/skillLevelBought': {
      action: { type: 'survivor/skillLevelBought', at: AT, id: LOGGED_SURVIVOR, skill: 'archery' },
      // Level 1: Marcus holds Archery at 0, and a purchase buys the next one.
      entry: entry(3, 'mission', {
        kind: 'skill-level-bought',
        ...WEBB,
        skill: 'archery',
        level: 1,
      }),
    },
    'survivor/commonSkillBought': {
      action: { type: 'survivor/commonSkillBought', at: AT, id: LOGGED_SURVIVOR, skill: 'move' },
      // A Score, not a level: Move starts at 6 for everyone (pg. 9).
      entry: entry(3, 'mission', {
        kind: 'common-skill-bought',
        ...WEBB,
        skill: 'move',
        score: 7,
      }),
    },
    'base/claimed': {
      action: { type: 'base/claimed', at: AT, base: 'small-town-home' },
      state: openState(),
      entry: entry(1, 'mission', { kind: 'base-claimed', base: 'small-town-home' }),
    },
    'facility/built': {
      action: {
        type: 'facility/built',
        at: AT,
        slot: 'front-yard',
        facility: 'watchtower',
        labor: 3,
      },
      entry: entry(3, 'mission', {
        kind: 'facility-built',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
    },
    'upgrade/built': {
      action: { type: 'upgrade/built', at: AT, slot: 'kitchen', upgrade: 'gas-range', labor: 2 },
      entry: entry(3, 'mission', {
        kind: 'upgrade-built',
        slot: 'kitchen',
        upgrade: 'gas-range',
      }),
    },
    'slot/cleared': {
      action: { type: 'slot/cleared', at: AT, slot: 'ruined-chicken-coop', labor: 2 },
      entry: entry(3, 'mission', { kind: 'slot-cleared', slot: 'ruined-chicken-coop' }),
    },

    // Below: everything the log deliberately ignores.

    // Which file is open is a fact about this browser tab, not about the
    // campaign — and the campaign arriving brings its own log with it.
    'campaign/loaded': {
      action: { type: 'campaign/loaded', campaign: createNewCampaign('Millbrook', FIXED) },
      entry: null,
    },
    // Renaming fixes a label. Nothing happened to the community.
    'campaign/renamed': { action: { type: 'campaign/renamed', name: 'Millbrook' }, entry: null },
    'survivor/renamed': {
      action: { type: 'survivor/renamed', id: LOGGED_SURVIVOR, name: 'Marc Webb' },
      entry: null,
    },
    // Health, stats, skills held and XP are all hand-entry standing in for
    // phases that do not exist yet. When the Advancement Phase awards XP and
    // the Management Phase deals damage, *those* are what earn an entry.
    'survivor/hpSet': {
      action: { type: 'survivor/hpSet', id: LOGGED_SURVIVOR, currentHp: 1 },
      entry: null,
    },
    'survivor/statsSet': {
      action: {
        type: 'survivor/statsSet',
        id: LOGGED_SURVIVOR,
        stats: { strength: 1, dexterity: 2, intelligence: 0, cooperation: 0 },
      },
      entry: null,
    },
    'survivor/skillAdded': {
      action: { type: 'survivor/skillAdded', id: LOGGED_SURVIVOR, skill: 'stealth' },
      entry: null,
    },
    'survivor/skillRemoved': {
      action: { type: 'survivor/skillRemoved', id: LOGGED_SURVIVOR, skill: 'archery' },
      entry: null,
    },
    'survivor/xpSet': {
      action: { type: 'survivor/xpSet', id: LOGGED_SURVIVOR, xp: 4 },
      entry: null,
    },
    'campaign/materialSet': {
      action: { type: 'campaign/materialSet', material: 'food', count: 5 },
      entry: null,
    },
    // Assignments move around several times while a turn is being planned, for
    // the same reason Power and Water do below: what is worth recording is the
    // Planning Phase the table settled on, not each change on the way there.
    'assignment/set': {
      action: {
        type: 'assignment/set',
        survivor: LOGGED_SURVIVOR,
        assignment: { task: 'project' },
      },
      entry: null,
    },
    'assignment/cleared': {
      // Needs somebody to un-assign: `rich()` starts a turn the way every turn
      // starts, with nobody assigned, so clearing there would change nothing
      // and pass for the wrong reason.
      action: { type: 'assignment/cleared', survivor: LOGGED_SURVIVOR },
      state: openState({
        ...expectOpen(rich()),
        assignments: { [LOGGED_SURVIVOR]: { task: 'rest' } },
      }),
      entry: null,
    },
    // Power and Water move around several times while a turn is being planned.
    // The turn's assignment is worth recording; the fiddling is not, and that
    // entry belongs to the Planning Phase step rather than to each toggle.
    'utility/toggled': {
      action: { type: 'utility/toggled', slot: 'kitchen', utility: 'water', staffed: 2 },
      entry: null,
    },
  };

  for (const [type, policy] of Object.entries(POLICY)) {
    it(`${policy.entry === null ? 'ignores' : 'records'} ${type}`, () => {
      const state = policy.state ?? rich();
      const before = expectOpen(state);

      const after = expectOpen(campaignReducer(state, policy.action));

      // The guard against a vacuous pass: an action that did nothing would
      // satisfy `ignores` for the wrong reason entirely.
      expect(after).not.toEqual(before);

      // Every starting state here has an empty log, so the whole log is the
      // assertion rather than a diff against what was already there.
      expect(after.log).toEqual(policy.entry === null ? [] : [policy.entry]);
    });
  }

  /**
   * The refusals, which are the other half of "the log holds what happened".
   *
   * Each of these delegates to an engine function that returns what it was
   * given when a blocker stops it, and the store reads that reference to decide
   * whether anything happened. Without these, a store that logged the *attempt*
   * would pass every test above.
   */
  describe('records nothing for an action that was refused', () => {
    /** Marcus with no XP: every purchase below is unaffordable. */
    function broke(): CampaignState {
      const state = rich();
      const campaign = expectOpen(state);

      return openState({
        ...campaign,
        survivors: campaign.survivors.map((survivor) =>
          survivor.id === LOGGED_SURVIVOR ? { ...survivor, xp: 0 } : survivor,
        ),
      });
    }

    it.each([
      [
        'a skill level nobody can afford',
        { type: 'survivor/skillLevelBought', at: AT, id: LOGGED_SURVIVOR, skill: 'archery' },
      ],
      [
        'a Move score nobody can afford',
        { type: 'survivor/commonSkillBought', at: AT, id: LOGGED_SURVIVOR, skill: 'move' },
      ],
      [
        'a promotion nobody can afford',
        { type: 'survivor/tierBought', at: AT, id: LOGGED_SURVIVOR, raise: 'intelligence' },
      ],
    ] as const)('%s', (_label, action) => {
      const before = expectOpen(broke());
      const after = expectOpen(campaignReducer(broke(), action));

      expect(after).toEqual(before);
      expect(after.log).toEqual([]);
    });

    it('a survivor who is not on the roster', () => {
      const before = expectOpen(rich());
      const after = expectOpen(
        campaignReducer(rich(), { type: 'survivor/removed', at: AT, id: 'nobody' }),
      );

      expect(after).toEqual(before);
    });

    it('a build the community cannot pay for', () => {
      const poor = openState({
        ...expectOpen(rich()),
        materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      });
      const before = expectOpen(poor);

      const after = expectOpen(
        campaignReducer(poor, {
          type: 'facility/built',
          at: AT,
          slot: 'front-yard',
          facility: 'watchtower',
          labor: 3,
        }),
      );

      expect(after).toEqual(before);
      expect(after.log).toEqual([]);
    });
  });

  /**
   * Append-only, checked as a prefix rather than as a length.
   *
   * A log that grew by one entry while quietly rewriting an older one would
   * pass every count above. Nothing in the store can do that today — there is
   * no action that edits an entry — and this is what keeps it true.
   */
  it('only ever grows, leaving what it already said alone', () => {
    let state = rich();
    const seen: LogEntry[] = [];

    for (const [type, policy] of Object.entries(POLICY)) {
      // The two that replace the campaign rather than change it. A new or
      // imported campaign brings its own history, and it would be wrong for
      // this one's to survive into it — so they are not counterexamples to
      // append-only, they are a different operation.
      if (type === 'campaign/started' || type === 'campaign/loaded') continue;
      if (policy.state !== undefined) continue;

      state = campaignReducer(state, policy.action);
      const { log } = expectOpen(state);

      expect(log.slice(0, seen.length)).toEqual(seen);
      seen.push(...log.slice(seen.length));
    }

    // And the run did record something, so the prefix check had entries to be
    // a claim about.
    expect(seen.length).toBeGreaterThan(0);
  });
});

/**
 * One task per survivor (pg. 20), which is a *shape* here rather than a check.
 *
 * `Campaign.assignments` is keyed by survivor id, so a second task overwrites
 * the first and two-at-once is unrepresentable. These tests are what stops that
 * claim from being merely asserted in a comment.
 */
describe('assignments', () => {
  const EARL = '11111111-aaaa-4bbb-8ccc-000000000001';
  const CARLA = '22222222-aaaa-4bbb-8ccc-000000000002';

  function withPair(assignments: Campaign['assignments'] = {}): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      survivors: [
        createSurvivor('Earl Rhodes', 4, { id: EARL }),
        createSurvivor('Carla Proust', 3, { id: CARLA }),
      ],
      assignments,
    });
  }

  it('starts a turn with nobody assigned', () => {
    expect(createNewCampaign('Cedar Hollow', FIXED).assignments).toEqual({});
  });

  it('gives a survivor a task', () => {
    const after = expectOpen(
      campaignReducer(withPair(), {
        type: 'assignment/set',
        survivor: EARL,
        assignment: { task: 'staff', slot: 'kitchen' },
      }),
    );

    expect(after.assignments).toEqual({ [EARL]: { task: 'staff', slot: 'kitchen' } });
  });

  it('replaces a task rather than adding one, because a survivor has only one', () => {
    const state = campaignReducer(withPair(), {
      type: 'assignment/set',
      survivor: EARL,
      assignment: { task: 'staff', slot: 'kitchen' },
    });

    const after = expectOpen(
      campaignReducer(state, {
        type: 'assignment/set',
        survivor: EARL,
        assignment: { task: 'project' },
      }),
    );

    // Not two entries, and not a list of one: the record is keyed by survivor,
    // so there is no shape in which Earl is staffing *and* on the project team.
    expect(after.assignments).toEqual({ [EARL]: { task: 'project' } });
  });

  it('leaves everybody else where they are', () => {
    const after = expectOpen(
      campaignReducer(withPair({ [CARLA]: { task: 'rest' } }), {
        type: 'assignment/set',
        survivor: EARL,
        assignment: { task: 'scavenging' },
      }),
    );

    expect(after.assignments).toEqual({
      [CARLA]: { task: 'rest' },
      [EARL]: { task: 'scavenging' },
    });
  });

  it('takes a task away without touching anyone else', () => {
    const after = expectOpen(
      campaignReducer(
        withPair({ [EARL]: { task: 'project' }, [CARLA]: { task: 'mission', team: 1 } }),
        { type: 'assignment/cleared', survivor: EARL },
      ),
    );

    // Absent, not present-and-empty: unassigned has one spelling.
    expect(after.assignments).toEqual({ [CARLA]: { task: 'mission', team: 1 } });
    expect(EARL in after.assignments).toBe(false);
  });

  it('changes nothing when clearing a survivor who has no task', () => {
    const before = withPair({ [CARLA]: { task: 'rest' } });

    const after = expectOpen(
      campaignReducer(before, { type: 'assignment/cleared', survivor: EARL }),
    );

    expect(after).toEqual(expectOpen(before));
  });

  /**
   * The orphan that survives a save and breaks a screen three turns later.
   *
   * An assignment keyed by an id nobody holds is a damaged save by
   * `saveFile.ts`'s reckoning, so the store must never write one — and removing
   * a survivor is the only way it could.
   */
  it('takes a survivor’s task with them when they leave the community', () => {
    const before = withPair({
      [EARL]: { task: 'staff', slot: 'kitchen' },
      [CARLA]: { task: 'rest' },
    });

    const after = expectOpen(
      campaignReducer(before, { type: 'survivor/removed', at: AT, id: EARL }),
    );

    expect(after.survivors.map((survivor) => survivor.id)).toEqual([CARLA]);
    expect(after.assignments).toEqual({ [CARLA]: { task: 'rest' } });
  });

  it('leaves the assignments alone when the removal removes nobody', () => {
    const before = withPair({ [EARL]: { task: 'rest' } });

    const after = expectOpen(
      campaignReducer(before, { type: 'survivor/removed', at: AT, id: 'nobody' }),
    );

    expect(after).toEqual(expectOpen(before));
  });
});
