import { describe, expect, it } from 'vitest';
import type { CampaignPhase, TurnStepId } from '../data/turn';
import { TURN_SEQUENCE } from '../engine/turn';
import { createNewCampaign } from '../engine/campaign';
import type { Campaign, ProjectOrder } from '../engine/campaign';
import { laborAvailable, laborShortfall } from '../engine/projects';
import { anythingOverCap, withStorageChecked } from '../engine/storage';
import type { CampaignEvent, LogEntry } from '../engine/log';
import { createSurvivor, recruitSurvivor } from '../engine/survivor';
import { generatingUtilities, projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { INITIAL_CAMPAIGN_STATE, campaignReducer } from './campaignStore';
import type { CampaignAction, CampaignState } from './campaignStore';
import { queued as onOrder } from '../test/queued';

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
    //
    // One entry, not two. "Started planning" already says the Planning Phase
    // is open, the same way "turn 4 began" says the Mission Phase is.
    // `cleared` is an empty record rather than absent: this campaign has
    // nobody assigned to anything, and "the step ran and there was nothing to
    // clear" is a different fact from "no step has run".
    expect(after).toEqual({
      ...before,
      step: 'assign-facility-staff',
      log: [entry(1, 'planning', { kind: 'planning-began', cleared: {} })],
    });
  });

  describe('entering the Planning Phase', () => {
    /** A turn mid-flight, with last turn's tasks and utility points still on. */
    function planned(step: TurnStepId): Campaign {
      return {
        ...opened(step, 3),
        survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
        assignments: { earl: { task: 'project' } },
        base: {
          id: 'small-town-home',
          slots: { kitchen: { water: true }, garage: { upgrades: ['gas-range'], power: true } },
        },
      };
    }

    it('clears last turn’s tasks and utility points, and nothing else', () => {
      const before = planned('add-facilities-and-upgrades');

      const after = expectOpen(
        campaignReducer(openState(before), { type: 'turn/advanced', by: 'step', at: AT }),
      );

      expect(after.assignments).toEqual({});
      // The Gas Range stays; only the point of Power goes. A slot whose one
      // record was a utility goes away entirely, because absent is what
      // untouched means.
      expect(after.base?.slots).toEqual({ garage: { upgrades: ['gas-range'] } });

      // The entry carries what it cleared, because after this step there is no
      // other copy and the Advancement Phase behind it is still entitled to
      // read it (issue #95).
      expect(after.log.at(-1)?.event).toEqual({
        kind: 'planning-began',
        cleared: { earl: { task: 'project' } },
      });
    });

    it('does not clear again when the walk steps back and forward', () => {
      // The move the walk exists for: somebody presses Next once too often,
      // steps back, and comes forward again. Re-clearing here would destroy the
      // planning they had just done.
      let state = openState(planned('add-facilities-and-upgrades'));
      state = campaignReducer(state, { type: 'turn/advanced', by: 'step', at: AT });

      state = campaignReducer(state, {
        type: 'assignment/set',
        survivor: 'earl',
        assignment: { task: 'rest' },
      });
      state = campaignReducer(state, { type: 'turn/reversed' });
      state = campaignReducer(state, { type: 'turn/advanced', by: 'step', at: AT });

      const after = expectOpen(state);
      expect(after.assignments).toEqual({ earl: { task: 'rest' } });
      expect(after.log.filter((line) => line.event.kind === 'planning-began')).toHaveLength(1);
    });

    it('clears again on the next turn', () => {
      let state = openState(planned('add-facilities-and-upgrades'));
      state = campaignReducer(state, { type: 'turn/advanced', by: 'step', at: AT });
      state = campaignReducer(state, {
        type: 'assignment/set',
        survivor: 'earl',
        assignment: { task: 'rest' },
      });

      // Round the rest of the turn and back into planning: Management, then
      // the turn ends into Mission, then Advancement, then Planning again.
      for (let move = 0; move < 4; move += 1) {
        state = campaignReducer(state, { type: 'turn/advanced', by: 'phase', at: AT });
      }

      const after = expectOpen(state);
      expect(after.turn).toBe(4);
      expect(after.assignments).toEqual({});
      expect(after.log.filter((line) => line.event.kind === 'planning-began')).toHaveLength(2);
    });

    it('clears a campaign with no base without reaching for one', () => {
      const before: Campaign = { ...planned('add-facilities-and-upgrades'), base: null };

      const after = expectOpen(
        campaignReducer(openState(before), { type: 'turn/advanced', by: 'step', at: AT }),
      );

      expect(after.assignments).toEqual({});
      expect(after.base).toBeNull();
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

  /**
   * A Rookie's single skill is never randomly generated (pg. 7), so no roll is
   * sent and none is recorded. The log cannot be edited, and it used to say a
   * die had chosen a skill the survivor did not have.
   */
  it('records no roll for a Rookie, because none was thrown', () => {
    const campaign = expectOpen(
      campaignReducer(openState(), {
        type: 'survivor/recruited',
        at: AT,
        name: 'Ruby Vance',
        tier: 1,
        id: SURVIVOR_ID,
      }),
    );

    expect(campaign.survivors[0]?.skills).toEqual({});
    expect(campaign.log[0]?.event).toEqual({
      kind: 'survivor-recruited',
      survivor: SURVIVOR_ID,
      name: 'Ruby Vance',
      tier: 1,
    });
    expect(campaign.log[0]?.event).not.toHaveProperty('roll');
  });

  /**
   * The ten-tier-level budget is a rule about *building* a starting community
   * (pg. 13). Somebody found on a mission is proof the campaign is past that,
   * and the playtest was told its community "spends 11" for doing the thing
   * Rescue Strangers exists to do.
   */
  it('settles the starting community, because finding somebody means play began', () => {
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

    expect(campaign.startingCommunityBuilt).toBe(true);
    // Said out loud, where the player can see a switch thrown on their behalf.
    expect(campaign.log.at(-1)?.event).toEqual({
      kind: 'starting-community-settled',
      built: true,
    });
  });

  it('says it once, and not again for the next recruit', () => {
    let state = campaignReducer(openState(), {
      type: 'survivor/recruited',
      at: AT,
      name: 'Carla Proust',
      tier: 3,
      roll: 6,
      id: SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/recruited',
      at: AT,
      name: 'Ruby Vance',
      tier: 1,
      id: OTHER_SURVIVOR_ID,
    });

    const settlings = expectOpen(state).log.filter(
      (logged) => logged.event.kind === 'starting-community-settled',
    );

    expect(settlings).toHaveLength(1);
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

describe('project/ordered', () => {
  /** A claimed base with Hardware to spend and a project team to spend Labor. */
  function withBase(): CampaignState {
    return openState(
      withPlanningBegun({
        ...createNewCampaign('Cedar Hollow', FIXED),
        materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
        turn: 3,
        // The phase orders are placed in (R14, #171).
        step: 'assign-project-team',
        base: { id: 'small-town-home', slots: {} },
        ...projectTeamWorth(5),
      }),
    );
  }

  const order = (project: ProjectOrder): CampaignAction => ({
    type: 'project/ordered',
    at: AT,
    project,
  });

  it('queues the project against this turn and spends its Hardware', () => {
    const campaign = expectOpen(
      campaignReducer(
        withBase(),
        order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
      ),
    );

    expect(campaign.projects).toEqual([
      onOrder(
        { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
        { hardware: 3, labor: 2 },
      ),
    ]);
    expect(campaign.materials.hardware).toBe(6);
  });

  /** The whole point of the queue: nothing lands on the base until next turn. */
  it('leaves the base exactly as it found it', () => {
    const campaign = expectOpen(
      campaignReducer(
        withBase(),
        order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
      ),
    );

    expect(campaign.base?.slots).toEqual({});
  });

  /**
   * #140, driven through the store, which is where the Hardware was actually
   * lost: both orders passed a check that read installed state, both paid, one
   * landed, and `completeProjects` dropped the other with no log entry and no
   * refund. The reducer refuses anything with a blocker, so the fix at the
   * validator is the fix here.
   */
  it('refuses a second facility for a slot already on order, and keeps the Hardware', () => {
    const once = campaignReducer(
      withBase(),
      order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
    );
    const twice = expectOpen(
      campaignReducer(once, order({ kind: 'facility', slot: 'garage', facility: 'training-room' })),
    );

    expect(twice.projects).toHaveLength(1);
    expect(twice.materials.hardware).toBe(6);
    expect(twice.log.filter((entry) => entry.event.kind === 'facility-ordered')).toHaveLength(1);
  });

  it('stamps the turn the order was placed on rather than trusting the screen', () => {
    // Turn 7's own Planning Phase, because a team assigned on turn 3 funds
    // nothing on turn 7 — which is the rule `laborThisTurn` enforces and the
    // reason this fixture carries two `planning-began` entries.
    const later = openState(withPlanningBegun({ ...expectOpen(withBase()), turn: 7 }));
    const campaign = expectOpen(
      campaignReducer(later, order({ kind: 'facility', slot: 'garage', facility: 'workshop' })),
    );

    expect(campaign.projects[0]?.orderedOnTurn).toBe(7);
  });

  /**
   * Issue #97's other half, driven through the store. A team assigned last turn
   * is still on the campaign — tasks expire at the top of the next Planning
   * Phase (pg. 20), not at the end of the turn they were given in — and before
   * this it paid for anything ordered in the meantime.
   */
  it('refuses an order made before this turn assigned a project team', () => {
    const notYet = openState({ ...expectOpen(withBase()), log: [] });
    const after = campaignReducer(
      notYet,
      order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
    );

    expect(expectOpen(after)).toEqual(expectOpen(notYet));
  });

  it('does nothing when the order is blocked', () => {
    // Delegated wholesale to `checkOrder`, which the reducer re-runs — so it
    // cannot spend Hardware by forgetting to ask.
    const before = withBase();
    const state = campaignReducer(
      before,
      order({ kind: 'facility', slot: 'kitchen', facility: 'workshop' }),
    );

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  /**
   * The arithmetic the queue exists for. Two Workshops cost four Labor and this
   * team makes three, so the second order is refused by what the first one
   * committed rather than by anything stored.
   */
  it('prices the second order against what the first one left', () => {
    const thin = openState(
      withPlanningBegun({ ...expectOpen(withBase()), ...projectTeamWorth(3) }),
    );
    const once = campaignReducer(
      thin,
      order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
    );
    const twice = campaignReducer(
      once,
      order({ kind: 'facility', slot: 'front-yard', facility: 'workshop' }),
    );

    expect(expectOpen(twice).projects).toHaveLength(1);
    expect(expectOpen(twice).materials.hardware).toBe(6);
  });

  /**
   * **#171.** The reducer's half of R14: the screen refuses, and so does this,
   * because a stale screen is exactly what the check here exists to catch.
   */
  it('refuses an order placed outside the Planning Phase, and keeps the Hardware', () => {
    const late = openState({ ...expectOpen(withBase()), step: 'check-storage' });
    const after = expectOpen(
      campaignReducer(late, order({ kind: 'facility', slot: 'garage', facility: 'workshop' })),
    );

    expect(after.projects).toEqual([]);
    expect(after.materials.hardware).toBe(9);
    expect(after.log).toEqual(expectOpen(late).log);
  });

  it('orders an upgrade and a clearing by the same action', () => {
    const farm = openState(
      withPlanningBegun({
        ...createNewCampaign('Cedar Hollow', FIXED),
        materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
        turn: 3,
        step: 'assign-project-team',
        base: { id: 'hobby-farm', slots: {} },
        ...projectTeamWorth(9),
      }),
    );
    const upgraded = campaignReducer(
      farm,
      order({ kind: 'upgrade', slot: 'kitchen', upgrade: 'gas-range' }),
    );
    const cleared = campaignReducer(
      upgraded,
      order({ kind: 'clearing', slot: 'ruined-chicken-coop' }),
    );

    expect(expectOpen(cleared).projects).toEqual([
      onOrder(
        { kind: 'upgrade', slot: 'kitchen', upgrade: 'gas-range', orderedOnTurn: 3 },
        { hardware: 2, labor: 1 },
      ),
      onOrder(
        { kind: 'clearing', slot: 'ruined-chicken-coop', orderedOnTurn: 3 },
        { hardware: 0, labor: 2 },
      ),
    ]);
    // The Gas Range's two Hardware; a clearing project costs none.
    expect(expectOpen(cleared).materials.hardware).toBe(7);
  });

  /** A clearing pays out when the work is done, not when it is ordered. */
  it('credits nothing for a clearing project until it is finished', () => {
    const farm = openState(
      withPlanningBegun({
        ...createNewCampaign('Cedar Hollow', FIXED),
        materials: { food: 0, fuel: 0, hardware: 1, rare: 0 },
        turn: 3,
        base: { id: 'hobby-farm', slots: {} },
        ...projectTeamWorth(5),
      }),
    );

    expect(
      expectOpen(campaignReducer(farm, order({ kind: 'clearing', slot: 'ruined-chicken-coop' })))
        .materials.hardware,
    ).toBe(1);
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(
        INITIAL_CAMPAIGN_STATE,
        order({ kind: 'facility', slot: 'garage', facility: 'workshop' }),
      ),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('project/cancelled', () => {
  /**
   * Two orders in the queue, so cancelling by position has a wrong answer —
   * standing in the step that places them, which is also the only step that may
   * take them back (#148).
   */
  /** A community in the Planning Phase with an empty queue and Hardware to spend. */
  function queueable(step: TurnStepId = 'assign-project-team'): CampaignState {
    return openState(
      withPlanningBegun({
        ...createNewCampaign('Cedar Hollow', FIXED),
        materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
        turn: 3,
        step,
        base: { id: 'small-town-home', slots: {} },
        ...projectTeamWorth(9),
      }),
    );
  }

  /**
   * Two orders placed, and the turn then standing wherever the caller asks.
   *
   * **Placed in the Planning Phase whatever `step` says**, because R14 confines
   * ordering to it and the walk is how a campaign gets anywhere else (#171).
   * A fixture that ordered from the later step would now be building a state
   * no campaign can reach, and the cancel guard it exists to exercise would
   * never be the thing under test.
   */
  function ordered(step: TurnStepId = 'assign-project-team'): CampaignState {
    const one = campaignReducer(queueable(), {
      type: 'project/ordered',
      at: AT,
      project: { kind: 'facility', slot: 'garage', facility: 'workshop' },
    });

    const two = campaignReducer(one, {
      type: 'project/ordered',
      at: AT,
      project: { kind: 'facility', slot: 'front-yard', facility: 'watchtower' },
    });

    return openState({ ...expectOpen(two), step });
  }

  it('takes the named order out and gives its Hardware back', () => {
    const campaign = expectOpen(
      campaignReducer(ordered(), { type: 'project/cancelled', at: 0, when: AT }),
    );

    expect(campaign.projects.map((project) => project.slot)).toEqual(['front-yard']);
    // Nine, less three each for the Workshop and the Watchtower, and the
    // Workshop's three returned.
    expect(campaign.materials.hardware).toBe(6);
  });

  /**
   * The guard, at the reducer. Both halves of it: a turn that has closed, and a
   * phase this turn has moved past. Last turn's order was cancelled during the
   * next turn's Mission Phase for a full refund (#148).
   */
  it.each([
    ['a phase the turn has moved past', ordered('check-storage'), 3],
    ['a turn that has closed', ordered('assign-project-team'), 4],
  ])('refuses a cancellation from %s', (_label, state, turn) => {
    const moved = openState({ ...expectOpen(state), turn });
    const after = expectOpen(
      campaignReducer(moved, { type: 'project/cancelled', at: 0, when: AT }),
    );

    expect(after.projects).toHaveLength(2);
    expect(after.materials.hardware).toBe(3);
    expect(after.log.filter((entry) => entry.event.kind === 'project-cancelled')).toEqual([]);
  });

  /**
   * The storage-cap consequence the issue flags as unconfirmed. It is
   * reachable — the walk lets a player step back into the Planning Phase after
   * Check Storage has run, and a refund lands after the clamp — and it is not
   * hidden or permanent: the stores read as over the cap immediately, and the
   * next turn's Check Storage takes it back. Nothing extra guards it, and this
   * is the test that says so rather than a comment claiming it cannot happen.
   */
  it('leaves a refund over the cap visible, for the next turn’s check to take', () => {
    const checked = openState({
      ...expectOpen(ordered('check-storage')),
      // A Small Town Home's Hardware cap is 4, and the two orders spent 6 of 9.
      materials: { food: 0, fuel: 0, hardware: 4, rare: 0 },
      log: [
        ...expectOpen(ordered('check-storage')).log,
        {
          turn: 3,
          phase: 'management',
          at: AT,
          event: { kind: 'storage-checked', food: 0, fuel: 0, hardware: 0 },
        },
      ],
    });

    // Step back into the phase that ordered it, which is the only way here.
    const back = openState({ ...expectOpen(checked), step: 'assign-project-team' });
    const after = expectOpen(campaignReducer(back, { type: 'project/cancelled', at: 0, when: AT }));

    expect(after.materials.hardware).toBe(7);
    expect(anythingOverCap(after)).toBe(true);
    expect(withStorageChecked(after).materials.hardware).toBe(4);
  });

  /**
   * The three kinds each name themselves differently, and a clearing has
   * nothing to name — so the entry carries one id for either of the two that
   * do, the way `materials-converted` carries its `source` (#151).
   */
  it.each([
    [
      'an upgrade',
      { kind: 'upgrade' as const, slot: 'kitchen', upgrade: 'gas-range' as const },
      'gas-range',
    ],
    [
      'a facility',
      { kind: 'facility' as const, slot: 'garage', facility: 'workshop' as const },
      'workshop',
    ],
  ])('says what %s was when it leaves the queue', (_label, project, built) => {
    // From an empty queue, so neither slot is one the fixture has already
    // spoken for: a second facility on order for a slot is refused (#140), and
    // what this is about is the entry the cancellation writes.
    const placed = campaignReducer(queueable(), { type: 'project/ordered', at: AT, project });
    const after = expectOpen(
      campaignReducer(placed, { type: 'project/cancelled', at: 0, when: AT }),
    );

    expect(after.log.at(-1)?.event).toMatchObject({ kind: 'project-cancelled', built });
  });

  /** A clearing is the case with nothing to name, and says so by saying less. */
  it('names nothing for a clearing, which has nothing to name', () => {
    const farm = openState({
      ...expectOpen(ordered()),
      base: { id: 'hobby-farm', slots: {} },
      projects: [],
    });
    const placed = campaignReducer(farm, {
      type: 'project/ordered',
      at: AT,
      project: { kind: 'clearing', slot: 'ruined-chicken-coop' },
    });
    const after = expectOpen(
      campaignReducer(placed, { type: 'project/cancelled', at: 0, when: AT }),
    );

    // `toStrictEqual`, because the whole point of spreading rather than
    // returning a field is that the key is *absent* rather than undefined —
    // and `toEqual` cannot tell those apart.
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'project-cancelled',
      slot: 'ruined-chicken-coop',
      hardware: 0,
    });
  });

  it('cancels the one at that position rather than the first it finds', () => {
    const campaign = expectOpen(
      campaignReducer(ordered(), { type: 'project/cancelled', at: 1, when: AT }),
    );

    expect(campaign.projects.map((project) => project.slot)).toEqual(['garage']);
  });

  /** Labor was never deducted, so a cancellation frees it by arithmetic alone. */
  it('gives back the Labor the order had committed', () => {
    const before = expectOpen(ordered());
    const after = expectOpen(
      campaignReducer(ordered(), { type: 'project/cancelled', at: 0, when: AT }),
    );

    expect(laborAvailable(after)).toBe(laborAvailable(before) + 2);
  });

  it('does nothing for a position the queue does not have', () => {
    const before = ordered();

    expect(campaignReducer(before, { type: 'project/cancelled', at: 4, when: AT })).toEqual(before);
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, { type: 'project/cancelled', at: 0, when: AT }),
    ).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

/**
 * The other end of a departure (pg. 23). The leaver's Tier has already come off
 * the pool — they are off the project team the moment they walk — so what is
 * left to do is choose which order that Labor was paying for, and these are the
 * rules about what may be chosen.
 */
describe('management/projectUnfinished', () => {
  /** Two Workshops ordered on four Labor, and then two of it walks out. */
  function short(): CampaignState {
    const ordered = openState(
      withPlanningBegun({
        ...createNewCampaign('Cedar Hollow', FIXED),
        materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
        turn: 3,
        step: 'departures',
        base: { id: 'small-town-home', slots: {} },
        projects: [
          onOrder(
            { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
            { hardware: 3, labor: 2 },
          ),
          onOrder(
            { kind: 'facility', slot: 'front-yard', facility: 'workshop', orderedOnTurn: 3 },
            { hardware: 3, labor: 2 },
          ),
        ],
        ...projectTeamWorth(4),
      }),
    );

    return openState({ ...expectOpen(ordered), ...projectTeamWorth(2) });
  }

  const unfinish = (at: number): CampaignAction => ({
    type: 'management/projectUnfinished',
    at,
    when: AT,
  });

  it('drops the named order and gives its Hardware back', () => {
    const before = expectOpen(short());
    const after = expectOpen(campaignReducer(short(), unfinish(1)));

    expect(laborShortfall(before)).toBe(2);
    expect(after.projects.map((project) => project.slot)).toEqual(['garage']);
    expect(laborShortfall(after)).toBe(0);

    // The number the order carries, not one priced again — this step shares
    // `withProjectCancelled` with `project/cancelled`, so #165's guarantee is
    // the same guarantee here and reading it off the order says so.
    expect(after.materials.hardware).toBe(
      before.materials.hardware + (before.projects[1]?.charged.hardware ?? 0),
    );
  });

  it('writes a line that says what it was rather than a cancellation', () => {
    const after = expectOpen(campaignReducer(short(), unfinish(0)));

    // Named as well as placed: two Workshops are queued here, and "the Garage
    // project" alone was the ambiguity the playtest wrote up (#151).
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'project-unfinished',
      slot: 'garage',
      built: 'workshop',
    });
  });

  /**
   * A player who simply wants an order back has `project/cancelled` for it, and
   * the log would call that a departure's doing.
   */
  it('does nothing while the turn’s Labor still covers its queue', () => {
    const affordable = openState({ ...expectOpen(short()), ...projectTeamWorth(4) });

    expect(campaignReducer(affordable, unfinish(0))).toEqual(affordable);
  });

  /**
   * Last turn's orders were paid for by a team that has since been reassigned,
   * so a shortfall now cannot reach back for them.
   */
  it('does nothing to an order from an earlier turn', () => {
    const before = openState({
      ...expectOpen(short()),
      projects: [
        ...expectOpen(short()).projects,
        onOrder(
          { kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: 2 },
          { hardware: 3, labor: 2 },
        ),
      ],
    });

    // Still short, so it is the turn stamp doing the refusing rather than the
    // guard above it — which is what the first version of this test proved
    // instead, by giving the turn nothing to be short of.
    expect(laborShortfall(expectOpen(before))).toBe(2);
    expect(campaignReducer(before, unfinish(2))).toEqual(before);
  });

  it('does nothing for a position the queue does not have', () => {
    const before = short();

    expect(campaignReducer(before, unfinish(4))).toEqual(before);
  });

  it('does nothing when no campaign is open', () => {
    expect(campaignReducer(INITIAL_CAMPAIGN_STATE, unfinish(0))).toEqual(INITIAL_CAMPAIGN_STATE);
  });
});

describe('advancement/projectsCompleted', () => {
  /** A queue ordered on turn 2, seen from turn 3's Advancement Phase. */
  function due(): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      turn: 3,
      base: { id: 'hobby-farm', slots: {} },
      projects: [
        onOrder(
          { kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: 2 },
          { hardware: 3, labor: 2 },
        ),
        onOrder(
          { kind: 'clearing', slot: 'ruined-chicken-coop', orderedOnTurn: 2 },
          { hardware: 0, labor: 2 },
        ),
      ],
    });
  }

  const finish: CampaignAction = { type: 'advancement/projectsCompleted', at: AT };

  it('puts every due project on the base and empties the queue', () => {
    const campaign = expectOpen(campaignReducer(due(), finish));

    expect(campaign.base?.slots['front-yard']).toEqual({
      built: { facility: 'watchtower', builtOnTurn: 3 },
    });
    expect(campaign.base?.slots['ruined-chicken-coop']).toEqual({ cleared: true });
    expect(campaign.projects).toEqual([]);
  });

  /** The clearing's yield arrives here, a turn after it was ordered. */
  it('credits what a clearing project gave back', () => {
    expect(expectOpen(campaignReducer(due(), finish)).materials.hardware).toBe(2);
  });

  it('leaves this turn’s own orders in the queue', () => {
    const mixed = openState({
      ...expectOpen(due()),
      projects: [
        onOrder(
          { kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: 2 },
          { hardware: 3, labor: 2 },
        ),
        onOrder(
          { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
          { hardware: 3, labor: 2 },
        ),
      ],
    });
    const campaign = expectOpen(campaignReducer(mixed, finish));

    expect(campaign.projects).toEqual([
      onOrder(
        { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
        { hardware: 3, labor: 2 },
      ),
    ]);
    expect(campaign.base?.slots.garage).toBeUndefined();
  });

  /**
   * The log must not claim a Workshop that is not there. The Garage filled
   * under the order — Z1-7's override lets a player build into a slot a queued
   * project wanted — so the project is dropped and says nothing.
   */
  it('says nothing about a project the base no longer has room for', () => {
    const taken = openState({
      ...expectOpen(due()),
      base: {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 2 } } },
      },
      projects: [
        onOrder(
          { kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: 2 },
          { hardware: 3, labor: 2 },
        ),
      ],
    });
    const campaign = expectOpen(campaignReducer(taken, finish));

    expect(campaign.base?.slots['front-yard']?.built?.facility).toBe('garden');
    expect(campaign.projects).toEqual([]);
    expect(campaign.log).toEqual([]);
  });

  it('writes one entry per project, in the order they were ordered', () => {
    expect(
      expectOpen(campaignReducer(due(), finish)).log.map((written) => written.event.kind),
    ).toEqual(['facility-built', 'slot-cleared']);
  });

  /** Nothing is spent here, so a second press has nothing left to find. */
  it('changes nothing the second time, because the first emptied the queue', () => {
    const once = campaignReducer(due(), finish);

    expect(campaignReducer(once, finish)).toEqual(once);
  });

  it('does nothing when nothing is due', () => {
    const before = openState({ ...expectOpen(due()), projects: [] });

    expect(campaignReducer(before, finish)).toEqual(before);
  });

  it('does nothing when no campaign is open', () => {
    expect(campaignReducer(INITIAL_CAMPAIGN_STATE, finish)).toEqual(INITIAL_CAMPAIGN_STATE);
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

describe('utility/toggled', () => {
  /** A base whose staffed Station generates one point to spend. */
  const powered = (score = 1): CampaignState =>
    openState(
      generatingUtilities(
        { ...createNewCampaign('Cedar Hollow', FIXED), base: { id: 'small-town-home', slots: {} } },
        score,
      ),
    );

  it('puts a point on the slot and takes it back off', () => {
    const on = campaignReducer(powered(), {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
    });

    expect(expectOpen(on).base?.slots.kitchen?.water).toBe(true);

    const off = campaignReducer(on, {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
    });

    expect(expectOpen(off).base?.slots.kitchen?.water).toBeUndefined();
  });

  it('does nothing when the base cannot generate the point', () => {
    // Somebody in the Station, generating nothing.
    const before = powered(0);
    const state = campaignReducer(before, {
      type: 'utility/toggled',
      slot: 'kitchen',
      utility: 'water',
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'utility/toggled',
        slot: 'kitchen',
        utility: 'water',
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
/**
 * The three Management steps the September playtest could press twice.
 *
 * Feed, Check Storage, Check the Horde, Add Materials and Heal Wounds all
 * opened with a guard from the day they shipped. These three did not, and each
 * one is destructive: Departures sends a survivor away, the Rot check can kill
 * two, and the Exhaustion penalty empties a mission team.
 *
 * They are here rather than only in the UI because a guard in the reducer is
 * what makes the rule true — a screen that hides the button is a screen, and
 * the action is still dispatchable.
 */
/**
 * pg. 19, 54: a community's first base starts at the maximum of every capped
 * material. A *later* base starts with only what was carried over, which is
 * Phase 4's Claim a New Base — and `base === null` is exactly what makes this
 * the first.
 */
describe('base/claimed stocks the first base', () => {
  const empty = (): CampaignState => openState(createNewCampaign('Cedar Hollow', FIXED));

  const claim = (base: 'small-town-home' | 'greasy-spoon'): CampaignAction => ({
    type: 'base/claimed',
    at: AT,
    base,
  });

  it('fills every capped material to its cap', () => {
    const after = expectOpen(campaignReducer(empty(), claim('small-town-home')));

    expect(after.materials).toEqual({ food: 4, fuel: 4, hardware: 4, rare: 0 });
  });

  /** Rare has no cap (pg. 54), so nothing is invented for it. */
  it('leaves Rare alone, which the book gives no cap', () => {
    const after = expectOpen(campaignReducer(empty(), claim('greasy-spoon')));

    expect(after.materials.rare).toBe(0);
    expect(after.materials.food).toBe(6);
  });

  it('records the stocking, so found materials have a source', () => {
    const after = expectOpen(campaignReducer(empty(), claim('small-town-home')));

    expect(after.log.map((written) => written.event.kind)).toEqual([
      'base-claimed',
      'base-stocked',
    ]);
  });

  /**
   * The rule is about the *first* base. Replacing one is Claim a New Base and
   * is refused here entirely, so there is no second stocking to get wrong —
   * but the refusal is what makes that true, and it is worth pinning.
   */
  it('does nothing at all for a community that already has a base', () => {
    const once = campaignReducer(empty(), claim('small-town-home'));

    expect(campaignReducer(once, claim('greasy-spoon'))).toEqual(once);
  });
});

describe('the steps that may only run once a turn', () => {
  const AT2 = '2026-09-08T22:00:00.000Z';
  const WEBB = '6b1f0a9c-77d2-4e35-91b8-0d4c2a5e83f7';
  const RUBY = '0f3d8b51-4a26-4c19-b73e-8e5109cf2a64';

  /** Nine Tier 1 survivors and no base: nine Unrest, two turns of quiet. */
  const crowd = (): CampaignState =>
    openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      survivors: Array.from({ length: 9 }, (_, at) =>
        createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
      ),
    });

  describe('management/departed', () => {
    const send = (survivor: string, at: string): CampaignAction => ({
      type: 'management/departed',
      survivor,
      at,
    });

    it('sends one survivor away', () => {
      const after = expectOpen(campaignReducer(crowd(), send('survivor-0', AT)));

      expect(after.survivors).toHaveLength(8);
    });

    /**
     * Pressure stays over the threshold after the first departure here — eight
     * survivors is eight Unrest, plus two turns of quiet is ten — so the step
     * would have gone on offering names. The playtest saw two leave in one
     * step, and a four-person community offered three.
     */
    it('refuses a second departure in the same turn, however high the pressure', () => {
      const once = campaignReducer(crowd(), send('survivor-0', AT));
      const twice = campaignReducer(once, send('survivor-1', AT2));

      expect(expectOpen(twice)).toEqual(expectOpen(once));
      expect(expectOpen(twice).survivors).toHaveLength(8);
    });

    it('lets the next turn send somebody away again', () => {
      const once = expectOpen(campaignReducer(crowd(), send('survivor-0', AT)));
      const later = campaignReducer(openState({ ...once, turn: 4 }), send('survivor-1', AT2));

      expect(expectOpen(later).survivors).toHaveLength(7);
    });

    /**
     * The guard reads `survivor-departed`, so a Rot death — which writes
     * `survivor-left` in the same phase — must not cancel the step.
     */
    it('is not blocked by somebody dying of Rot in the same phase', () => {
      const died = openState({
        ...expectOpen(crowd()),
        log: [
          {
            turn: 3,
            phase: 'management',
            at: AT,
            event: {
              kind: 'survivor-left',
              survivor: 'survivor-8',
              name: 'Survivor 8',
              tier: 1,
            },
          },
        ],
      });

      expect(expectOpen(campaignReducer(died, send('survivor-0', AT2))).survivors).toHaveLength(8);
    });
  });

  describe('management/rotChecked', () => {
    const dying = (): CampaignState =>
      openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [
          { ...createSurvivor('Ruby Vance', 2, { id: RUBY }), currentHp: 0 },
          { ...createSurvivor('Marcus Webb', 2, { id: WEBB }), currentHp: 0 },
        ],
      });

    const check = (survivor: string, roll: 1 | 10, at: string): CampaignAction => ({
      type: 'management/rotChecked',
      survivor,
      roll,
      bitten: null,
      at,
    });

    /**
     * The exact shape the playtest saw: passing at 10, then dying at 1. A
     * natural 10 always succeeds and a natural 1 always fails (pg. 8), so the
     * second press is a second answer to a question already answered.
     */
    it('refuses a second check for the same survivor', () => {
      const passed = campaignReducer(dying(), check(WEBB, 10, AT));
      const again = campaignReducer(passed, check(WEBB, 1, AT2));

      expect(expectOpen(again)).toEqual(expectOpen(passed));
      expect(expectOpen(again).survivors).toHaveLength(2);
    });

    /** Per survivor, not per step: everybody at 0 Health gets their own check. */
    it('still checks the other survivor at 0 Health', () => {
      const passed = campaignReducer(dying(), check(WEBB, 10, AT));
      const both = campaignReducer(passed, check(RUBY, 1, AT2));

      expect(expectOpen(both).survivors.map((survivor) => survivor.id)).toEqual([WEBB]);
    });

    /**
     * A Clinic with one set of Restraints and two survivors turning (pg. 72):
     * the first is held, the second bites, because a set holds one apiece.
     * The count comes off the log, so the reducer has to write the entry for
     * the second check to be priced against it.
     */
    describe('with Restraints in the Clinic', () => {
      const clinic = (): CampaignState =>
        openState({
          ...expectOpen(dying()),
          survivors: [
            ...expectOpen(dying()).survivors,
            createSurvivor('Nell Haig', 2, { id: 'nell' }),
          ],
          assignments: {
            [RUBY]: { task: 'healing' },
            [WEBB]: { task: 'healing' },
            nell: { task: 'healing' },
          },
          base: {
            id: 'small-town-home',
            slots: {
              garage: {
                built: { facility: 'medical-clinic', builtOnTurn: 1 },
                upgrades: ['restraints'],
              },
            },
          },
        });

      const bite = (survivor: string, bitten: string | null, at: string): CampaignAction => ({
        type: 'management/rotChecked',
        survivor,
        roll: 1,
        bitten,
        at,
      });

      it('writes the hold down instead of the bite', () => {
        const after = expectOpen(campaignReducer(clinic(), bite(WEBB, 'nell', AT)));

        expect(after.log.map((entry) => entry.event.kind)).toEqual([
          'rot-checked',
          'survivor-left',
          'bite-restrained',
        ]);
        // Held, not spared: the survivor still turns, and Nell keeps both her
        // points of Health.
        expect(after.survivors.map((survivor) => survivor.id)).toEqual([RUBY, 'nell']);
        expect(after.survivors.find((survivor) => survivor.id === 'nell')?.currentHp).toBe(2);
      });

      it('has nothing left for the second survivor to turn', () => {
        const held = campaignReducer(clinic(), bite(WEBB, 'nell', AT));
        const after = expectOpen(campaignReducer(held, bite(RUBY, 'nell', AT2)));

        expect(after.log.map((entry) => entry.event.kind)).toEqual([
          'rot-checked',
          'survivor-left',
          'bite-restrained',
          'rot-checked',
          'survivor-left',
          'survivor-bitten',
        ]);
        expect(after.survivors.find((survivor) => survivor.id === 'nell')?.currentHp).toBe(1);
      });
    });
  });

  describe('management/teamReduced', () => {
    /** Six survivors, no base, so Exhaustion is six against a team of two. */
    const tired = (): CampaignState =>
      openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: Array.from({ length: 6 }, (_, at) =>
          createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
        ),
        assignments: {
          'survivor-0': { task: 'mission', team: 1 },
          'survivor-1': { task: 'mission', team: 1 },
        },
      });

    const take = (survivor: string, at: string): CampaignAction => ({
      type: 'management/teamReduced',
      survivor,
      at,
    });

    it('takes one survivor off the mission team', () => {
      const after = expectOpen(campaignReducer(tired(), take('survivor-0', AT)));

      expect(after.assignments['survivor-0']).toBeUndefined();
      expect(after.assignments['survivor-1']).toEqual({ task: 'mission', team: 1 });
    });

    /**
     * Taking somebody off does not lower the Exhaustion that called for it —
     * beds and population are unchanged — so without the guard the condition
     * stays true and the step empties the team.
     */
    it('refuses a second removal in the same turn', () => {
      const once = campaignReducer(tired(), take('survivor-0', AT));
      const twice = campaignReducer(once, take('survivor-1', AT2));

      expect(expectOpen(twice)).toEqual(expectOpen(once));
    });

    it('does nothing for somebody who is not on the mission team', () => {
      const before = tired();

      expect(campaignReducer(before, take('survivor-5', AT))).toEqual(before);
    });

    it('does nothing when no campaign is open', () => {
      expect(campaignReducer(INITIAL_CAMPAIGN_STATE, take('survivor-0', AT))).toEqual(
        INITIAL_CAMPAIGN_STATE,
      );
    });
  });
});

describe('what earns a line in the log', () => {
  const LOGGED_SURVIVOR = '6b1f0a9c-77d2-4e35-91b8-0d4c2a5e83f7';
  const DECOY = '0f3d8b51-4a26-4c19-b73e-8e5109cf2a64';
  const LABORERS = projectTeamWorth(4);

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
        // The project team, because since Z3-5 the Labor pool is its summed
        // Tier levels (pg. 20) — three of the actions below are projects and
        // would be refused for want of it.
        ...LABORERS.survivors,
      ],
      assignments: LABORERS.assignments,
      base: { id: 'hobby-farm', slots: {} },
    });
  }

  /** `rich()` with one Watchtower already in the queue, ordered on `turn`. */
  function queued(turn: number): CampaignState {
    return openState({
      ...expectOpen(rich()),
      projects: [
        onOrder(
          { kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: turn },
          { hardware: 3, labor: 2 },
        ),
      ],
    });
  }

  /** The survivor fields every survivor event carries, as `rich()` has them. */
  const WEBB = { survivor: LOGGED_SURVIVOR, name: 'Marcus Webb' } as const;

  /**
   * What `rich()`'s base makes on its own, with nobody working anything.
   *
   * The Hobby Farm's built-in Garden is a flat Food and so is the Fence built
   * into it (pg. 54, 71); its Kitchen and Utility Station are staffed
   * facilities and make nothing empty. Written out rather than computed,
   * because a table that called `baseProduction` to describe what
   * `baseProduction` produced would agree with any answer it gave.
   */
  const HOBBY_FARM_PRODUCTION = { food: 2, fuel: 0, hardware: 0, rare: 0 } as const;

  interface Policy {
    readonly action: CampaignAction;
    /**
     * The entry it must leave behind, or `null` for what the log ignores.
     *
     * A list where one action is two things that happened — claiming a base
     * also stocks it — because "what earns a line" is a claim about the whole
     * log the action leaves, not about its first line.
     */
    readonly entry: LogEntry | readonly LogEntry[] | null;
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
      // Already settled, so this leaves the one entry. A recruit into a
      // community still being built settles it as well, and that second entry
      // has its own test below.
      state: openState({ ...expectOpen(rich()), startingCommunityBuilt: true }),
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
      // Two things happened: the community claimed a base, and its first base
      // arrived stocked to its caps (pg. 19). A Tier 1 base stores four of
      // each.
      entry: [
        entry(1, 'mission', { kind: 'base-claimed', base: 'small-town-home' }),
        entry(1, 'mission', { kind: 'base-stocked', food: 4, fuel: 4, hardware: 4 }),
      ],
    },
    'project/ordered': {
      // Its own campaign, standing in the step that orders. `rich()` is in the
      // Mission Phase, and a turn's Labor is not there to spend until its
      // Planning Phase has assigned the team that generates it (pg. 20).
      state: openState(withPlanningBegun({ ...expectOpen(rich()), step: 'assign-project-team' })),
      action: {
        type: 'project/ordered',
        at: AT,
        project: { kind: 'facility', slot: 'front-yard', facility: 'watchtower' },
      },
      // Ordered, not built: the Watchtower is a turn away, and the entry says
      // which of the two happened.
      entry: entry(3, 'planning', {
        kind: 'facility-ordered',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
    },
    'project/cancelled': {
      // In the step that placed the order, which is the only one that may take
      // it back (#148) — and a Watchtower's 3 Hardware is what comes back.
      state: openState(
        withPlanningBegun({ ...expectOpen(queued(3)), step: 'assign-project-team' }),
      ),
      action: { type: 'project/cancelled', at: 0, when: AT },
      entry: entry(3, 'planning', {
        kind: 'project-cancelled',
        slot: 'front-yard',
        hardware: 3,
        built: 'watchtower',
      }),
    },
    'management/projectUnfinished': {
      // The Watchtower ordered on turn 3, and nobody left on the project team
      // to pay its two Labor — which is the state a departure leaves behind
      // (pg. 23). Standing in the step that offers the choice.
      state: openState(
        withPlanningBegun({
          ...expectOpen(queued(3)),
          assignments: {},
          step: 'departures',
        }),
      ),
      action: { type: 'management/projectUnfinished', at: 0, when: AT },
      entry: entry(3, 'management', {
        kind: 'project-unfinished',
        slot: 'front-yard',
        built: 'watchtower',
      }),
    },
    'advancement/projectsCompleted': {
      // Ordered last turn, so this turn's Advancement Phase finishes it.
      state: queued(2),
      action: { type: 'advancement/projectsCompleted', at: AT },
      entry: entry(3, 'mission', {
        kind: 'facility-built',
        slot: 'front-yard',
        facility: 'watchtower',
      }),
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
    'advancement/materialsAdded': {
      // Two rolls: a 4 is Food, and a 7 that Mechanics forces to Hardware
      // anyway — the substitution is exercised here so the entry proves the
      // reducer went through `materials.ts` rather than counting dice itself.
      action: {
        type: 'advancement/materialsAdded',
        at: AT,
        rolls: [{ roll: 4 }, { roll: 7, forced: { skill: 'mechanics', material: 'hardware' } }],
      },
      entry: entry(3, 'mission', {
        kind: 'materials-added',
        food: HOBBY_FARM_PRODUCTION.food + 1,
        fuel: HOBBY_FARM_PRODUCTION.fuel,
        hardware: HOBBY_FARM_PRODUCTION.hardware + 1,
        rare: HOBBY_FARM_PRODUCTION.rare,
      }),
    },
    'advancement/materialsConverted': {
      // Its own campaign: `rich()` holds one Fuel and a Gas Range trades two.
      // The Hobby Farm's built-in Kitchen is where the upgrade goes.
      state: openState({
        ...expectOpen(rich()),
        materials: { food: 0, fuel: 2, hardware: 0, rare: 0 },
        base: { id: 'hobby-farm', slots: { kitchen: { upgrades: ['gas-range'] } } },
      }),
      action: {
        type: 'advancement/materialsConverted',
        at: AT,
        slot: 'kitchen',
        source: 'gas-range',
      },
      entry: entry(3, 'mission', {
        kind: 'materials-converted',
        slot: 'kitchen',
        source: 'gas-range',
        spent: { fuel: 2 },
        gained: { food: 1 },
      }),
    },
    'management/survivorsFed': {
      // Its own campaign, because `rich()` has Food and a roster that eats less
      // than it holds — the entry would record no Hunger and the interesting
      // half of this event would go untested.
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [createSurvivor('Marcus Webb', 4, { id: LOGGED_SURVIVOR })],
        materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      }),
      action: { type: 'management/survivorsFed', at: AT },
      // A Hero eats two (pg. 22), and there is nothing to eat. The head count
      // rides along, because the penalty is fixed here and must not be
      // re-priced by a departure later in the turn.
      entry: entry(3, 'mission', {
        kind: 'survivors-fed',
        required: 2,
        hunger: 2,
        population: 1,
      }),
    },
    'management/storageChecked': {
      // The Greasy Spoon stores six Food; this campaign holds eight.
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        materials: { food: 8, fuel: 0, hardware: 0, rare: 0 },
        base: { id: 'greasy-spoon', slots: {} },
      }),
      action: { type: 'management/storageChecked', at: AT },
      entry: entry(3, 'mission', { kind: 'storage-checked', food: 2, fuel: 0, hardware: 0 }),
    },
    'management/hordeChecked': {
      // No base and nobody assigned, on turn 3: three terms are zero and the
      // fourth is the two turns since play began.
      state: openState({ ...createNewCampaign('Cedar Hollow', FIXED), turn: 3 }),
      action: { type: 'management/hordeChecked', at: AT, roll: 9 },
      entry: entry(3, 'mission', { kind: 'horde-checked', roll: 9, threat: 2, siege: false }),
    },
    'management/departed': {
      // Six Exhaustion with no base to sleep in is six Unrest, which with two
      // turns of quiet is over the threshold of ten.
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [
          createSurvivor('Ruby Vance', 4, { id: DECOY }),
          ...Array.from({ length: 8 }, (_, at) =>
            createSurvivor(`Crowd ${String(at)}`, 4, { id: `crowd-${String(at)}` }),
          ),
          createSurvivor('Marcus Webb', 1, { id: LOGGED_SURVIVOR }),
        ],
      }),
      action: { type: 'management/departed', at: AT, survivor: LOGGED_SURVIVOR },
      // Its own kind, not the `survivor-left` a Rot death writes: the guard
      // reads this entry, and a Rot death in the same phase would otherwise
      // read as a departure that had already happened.
      entry: entry(3, 'mission', {
        kind: 'survivor-departed',
        ...WEBB,
        tier: 1,
      }),
    },
    'management/teamReduced': {
      // Marcus is on the mission team, and there are no beds anywhere, so
      // Exhaustion is the whole head count and comfortably above the team's one.
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [
          createSurvivor('Ruby Vance', 4, { id: DECOY }),
          createSurvivor('Marcus Webb', 2, { id: LOGGED_SURVIVOR }),
        ],
        assignments: { [LOGGED_SURVIVOR]: { task: 'mission', team: 1 } },
      }),
      action: { type: 'management/teamReduced', at: AT, survivor: LOGGED_SURVIVOR },
      entry: entry(3, 'mission', { kind: 'mission-team-reduced', ...WEBB }),
    },
    'management/rotChecked': {
      // A survivor at 0 Health who passes: one entry, nobody removed. The
      // failing path removes people and is tested on its own below, where the
      // several entries it writes can be asserted in order.
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [{ ...createSurvivor('Marcus Webb', 2, { id: LOGGED_SURVIVOR }), currentHp: 0 }],
      }),
      action: {
        type: 'management/rotChecked',
        at: AT,
        survivor: LOGGED_SURVIVOR,
        roll: 10,
        bitten: null,
      },
      entry: entry(3, 'mission', {
        kind: 'rot-checked',
        ...WEBB,
        roll: 10,
        target: 12,
        passed: true,
      }),
    },
    'advancement/woundsHealed': {
      // Its own campaign, because `rich()` has nobody wounded and nobody
      // healing — the step would be a no-op there and "records nothing" would
      // pass for entirely the wrong reason. A resting survivor with a wound
      // needs no base at all: the point is their own (pg. 21).
      state: openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        survivors: [{ ...createSurvivor('Marcus Webb', 2, { id: LOGGED_SURVIVOR }), currentHp: 1 }],
        assignments: { [LOGGED_SURVIVOR]: { task: 'rest' } },
      }),
      action: { type: 'advancement/woundsHealed', at: AT },
      entry: entry(3, 'mission', {
        kind: 'health-restored',
        ...WEBB,
        health: 1,
        source: 'rest',
      }),
    },
    'advancement/xpAwarded': {
      // The discretionary point (pg. 18): one XP, anybody, and `rich()` has no
      // mission team so no Teacher has taken it away.
      action: {
        type: 'advancement/xpAwarded',
        at: AT,
        survivor: LOGGED_SURVIVOR,
        source: 'discretionary',
      },
      entry: entry(3, 'mission', {
        kind: 'xp-awarded',
        ...WEBB,
        amount: 1,
        source: 'discretionary',
      }),
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
      // Needs a pool: the staffed half comes from somebody working a Utility
      // Station, and the Hobby Farm has one built in.
      action: { type: 'utility/toggled', slot: 'kitchen', utility: 'water' },
      state: openState(generatingUtilities(expectOpen(rich()), 2, 'utility-station')),
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

      // The whole log, not the tail: what the action appended *and* that it
      // left everything already there alone. Most starting states here open
      // with an empty log and a few do not — one has to have reached the
      // Planning Phase before it can order a project — so the assertion is
      // written against what the state came in with rather than against
      // nothing.
      const expected =
        policy.entry === null ? [] : Array.isArray(policy.entry) ? policy.entry : [policy.entry];

      expect(after.log).toEqual([...before.log, ...expected]);
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

    it('an order the community cannot pay for', () => {
      const poor = openState({
        ...expectOpen(rich()),
        materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      });
      const before = expectOpen(poor);

      const after = expectOpen(
        campaignReducer(poor, {
          type: 'project/ordered',
          at: AT,
          project: { kind: 'facility', slot: 'front-yard', facility: 'watchtower' },
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

/**
 * The two Advancement Phase actions, and the three refusals that make them
 * safe to walk backwards over.
 *
 * Both steps are destructive — one puts materials in storage, the other hands
 * out XP — and the turn walk lets a player step back across either. The guards
 * below are what stop a second press from doubling a turn's haul, and each is
 * a branch that a test asserting only the happy path leaves standing.
 */
describe('the Advancement Phase steps', () => {
  const EARL = '11111111-aaaa-4bbb-8ccc-000000000001';
  const CARLA = '22222222-aaaa-4bbb-8ccc-000000000002';

  /** Earl went on the mission; Carla stayed at the base. */
  function afterAMission(): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      step: 'character-advancement',
      survivors: [
        createSurvivor('Earl Rhodes', 4, { id: EARL }),
        createSurvivor('Carla Proust', 3, { id: CARLA }),
      ],
      assignments: { [EARL]: { task: 'mission', team: 1 } },
    });
  }

  const add = (rolls: readonly { roll: 4 | 7 }[]) =>
    ({ type: 'advancement/materialsAdded', at: AT, rolls }) as const;

  it('puts a turn’s haul in storage', () => {
    const after = expectOpen(campaignReducer(afterAMission(), add([{ roll: 4 }, { roll: 7 }])));

    expect(after.materials).toEqual({ food: 1, fuel: 0, hardware: 1, rare: 0 });
  });

  it('refuses a second helping in the same turn', () => {
    const once = campaignReducer(afterAMission(), add([{ roll: 4 }]));
    const twice = campaignReducer(once, add([{ roll: 4 }]));

    expect(expectOpen(twice).materials.food).toBe(1);
    expect(expectOpen(twice).log).toHaveLength(1);
  });

  it('lets the next turn have its own', () => {
    const once = expectOpen(campaignReducer(afterAMission(), add([{ roll: 4 }])));
    const next = campaignReducer(openState({ ...once, turn: 4 }), add([{ roll: 4 }]));

    expect(expectOpen(next).materials.food).toBe(2);
  });

  /**
   * **#163.** The whole feature was here except the payout: a community that
   * skipped its mission to scavenge walked to this step and received nothing,
   * with no screen saying so.
   */
  describe('what a scavenger brings back', () => {
    const scavenging = (skills: Partial<Record<'scavenge', number>>) =>
      openState({
        ...createNewCampaign('Cedar Hollow', FIXED),
        turn: 3,
        step: 'add-materials-to-storage',
        survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: EARL }), skills }],
        assignments: { [EARL]: { task: 'scavenging' } },
      });

    it('adds one of every material for a survivor with the skill', () => {
      const after = expectOpen(campaignReducer(scavenging({ scavenge: 0 }), add([])));

      expect(after.materials).toEqual({ food: 1, fuel: 1, hardware: 1, rare: 1 });
    });

    it('adds one of the chosen material for a survivor without it', () => {
      const after = expectOpen(
        campaignReducer(scavenging({}), {
          type: 'advancement/materialsAdded',
          at: AT,
          rolls: [],
          scavenged: 'rare',
        }),
      );

      expect(after.materials).toEqual({ food: 0, fuel: 0, hardware: 0, rare: 1 });
    });

    /** Nothing chosen is nothing found, and the log says so rather than lying. */
    it('adds nothing for an unskilled scavenger nobody chose for', () => {
      const after = expectOpen(campaignReducer(scavenging({}), add([])));

      expect(after.materials).toEqual({ food: 0, fuel: 0, hardware: 0, rare: 0 });
      expect(after.log.map((entry) => entry.event.kind)).toEqual([
        'materials-added',
        'materials-scavenged',
      ]);
    });

    it('records what was scavenged, and by whom', () => {
      const after = expectOpen(campaignReducer(scavenging({ scavenge: 0 }), add([{ roll: 4 }])));

      expect(after.log.map((entry) => entry.event)).toEqual([
        { kind: 'materials-added', food: 2, fuel: 1, hardware: 1, rare: 1 },
        {
          kind: 'materials-scavenged',
          survivor: EARL,
          name: 'Earl Rhodes',
          food: 1,
          fuel: 1,
          hardware: 1,
          rare: 1,
        },
      ]);
    });

    it('writes no scavenging line for a turn nobody scavenged', () => {
      const after = expectOpen(campaignReducer(afterAMission(), add([{ roll: 4 }])));

      expect(after.log.map((entry) => entry.event.kind)).toEqual(['materials-added']);
    });
  });

  it('heals a turn’s wounds once, and refuses to do it twice', () => {
    // A Hero at 1 of 4, so one point of rest leaves them wounded. A survivor
    // the first press filled up would be untouched by the second whether or
    // not the guard was there, and the test would pass for the wrong reason.
    const hurt = openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      survivors: [{ ...createSurvivor('Marcus Webb', 4, { id: EARL }), currentHp: 1 }],
      assignments: { [EARL]: { task: 'rest' } },
    });

    const once = campaignReducer(hurt, { type: 'advancement/woundsHealed', at: AT });
    const twice = campaignReducer(once, { type: 'advancement/woundsHealed', at: AT });

    expect(expectOpen(once).survivors[0]?.currentHp).toBe(2);
    expect(expectOpen(twice).survivors[0]?.currentHp).toBe(2);
    expect(expectOpen(twice).log).toHaveLength(1);
  });

  it('gives a survivor the XP their pool holds', () => {
    const after = expectOpen(
      campaignReducer(afterAMission(), {
        type: 'advancement/xpAwarded',
        at: AT,
        survivor: EARL,
        source: 'mission',
      }),
    );

    expect(after.survivors.find((survivor) => survivor.id === EARL)?.xp).toBe(1);
  });

  it('refuses an award the rules block, and records nothing', () => {
    // Carla was not on the mission, so the mission's XP is not hers to take.
    const after = campaignReducer(afterAMission(), {
      type: 'advancement/xpAwarded',
      at: AT,
      survivor: CARLA,
      source: 'mission',
    });

    expect(expectOpen(after).survivors.find((survivor) => survivor.id === CARLA)?.xp).toBe(0);
    expect(expectOpen(after).log).toEqual([]);
  });

  it('refuses to empty a pool twice for the same survivor', () => {
    const award = {
      type: 'advancement/xpAwarded',
      at: AT,
      survivor: EARL,
      source: 'mission',
    } as const;
    const twice = campaignReducer(campaignReducer(afterAMission(), award), award);

    expect(expectOpen(twice).survivors.find((survivor) => survivor.id === EARL)?.xp).toBe(1);
    expect(expectOpen(twice).log).toHaveLength(1);
  });

  it('says nothing about a survivor the community does not hold', () => {
    const before = afterAMission();

    expect(
      campaignReducer(before, {
        type: 'advancement/xpAwarded',
        at: AT,
        survivor: 'nobody',
        source: 'discretionary',
      }),
    ).toEqual(before);
  });
});

/**
 * The Management Phase's two steps, and the branch that removes people.
 *
 * **Two survivors in every fixture, and the one being checked is second.**
 * The reducer finds them by id, and with a roster of one a `find` that
 * ignored its predicate would return the right person anyway — the gap two
 * mutants lived in during Z3-2 and one more lived in here.
 */
describe('the Management Phase', () => {
  const CHECKED = '6b1f0a9c-77d2-4e35-91b8-0d4c2a5e83f7';
  const DECOY = '0f3d8b51-4a26-4c19-b73e-8e5109cf2a64';

  /** A Citizen at 0 Health in the Clinic, with somebody being healed beside them. */
  function dying(bystanderHp: number): CampaignState {
    return openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      survivors: [
        { ...createSurvivor('Ruby Vance', 4, { id: DECOY }), currentHp: bystanderHp },
        { ...createSurvivor('Marcus Webb', 2, { id: CHECKED }), currentHp: 0 },
      ],
      assignments: { [DECOY]: { task: 'healing' }, [CHECKED]: { task: 'healing' } },
    });
  }

  const check = (roll: 1 | 10, bitten: string | null) =>
    ({
      type: 'management/rotChecked',
      at: AT,
      survivor: CHECKED,
      roll,
      bitten,
    }) as const;

  it('refuses a second helping of Food in the same turn', () => {
    const hungry = openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      survivors: [createSurvivor('Marcus Webb', 4, { id: CHECKED })],
      materials: { food: 9, fuel: 0, hardware: 0, rare: 0 },
    });

    const once = campaignReducer(hungry, { type: 'management/survivorsFed', at: AT });
    const twice = campaignReducer(once, { type: 'management/survivorsFed', at: AT });

    // A Hero eats two, so nine becomes seven and stays there.
    expect(expectOpen(twice).materials.food).toBe(7);
    expect(expectOpen(twice).log).toHaveLength(1);
  });

  it('refuses to spill the same stores twice in one turn', () => {
    const overflowing = openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      materials: { food: 9, fuel: 0, hardware: 0, rare: 0 },
      base: { id: 'greasy-spoon', slots: {} },
    });

    const once = campaignReducer(overflowing, { type: 'management/storageChecked', at: AT });
    const twice = campaignReducer(once, { type: 'management/storageChecked', at: AT });

    // Down to the Greasy Spoon's six, and no further on a second press.
    expect(expectOpen(twice).materials.food).toBe(6);
    expect(expectOpen(twice).log).toHaveLength(1);
  });

  it('refuses a second roll against the horde in one turn', () => {
    const quiet = openState({ ...createNewCampaign('Cedar Hollow', FIXED), turn: 3 });

    // A 10 against a threat of 2 is short of sixteen; a second roll would be a
    // second chance at a siege, which is what the guard is for.
    const once = campaignReducer(quiet, { type: 'management/hordeChecked', at: AT, roll: 10 });
    const twice = campaignReducer(once, { type: 'management/hordeChecked', at: AT, roll: 10 });

    expect(expectOpen(twice).log).toHaveLength(1);
  });

  /**
   * The candidates are recomputed from the campaign in front of the reducer, so
   * a survivor the rules would not send away cannot be sent away by a stale
   * screen — or by a second press after the first departure took the pressure
   * back under the threshold.
   */
  it('refuses to send away somebody the rules do not offer', () => {
    const crowded = openState({
      ...createNewCampaign('Cedar Hollow', FIXED),
      turn: 3,
      survivors: [
        createSurvivor('Ruby Vance', 4, { id: DECOY }),
        ...Array.from({ length: 8 }, (_, at) =>
          createSurvivor(`Crowd ${String(at)}`, 4, { id: `crowd-${String(at)}` }),
        ),
        createSurvivor('Marcus Webb', 1, { id: CHECKED }),
      ],
    });

    // Ruby is a Hero and Marcus a Rookie, so only Marcus is on the list.
    expect(
      campaignReducer(crowded, { type: 'management/departed', at: AT, survivor: DECOY }),
    ).toEqual(crowded);

    const once = campaignReducer(crowded, {
      type: 'management/departed',
      at: AT,
      survivor: CHECKED,
    });

    expect(expectOpen(once).survivors).toHaveLength(9);
    expect(expectOpen(once).log).toHaveLength(1);
  });

  it('says nothing about a Rot check on somebody the community does not hold', () => {
    const before = dying(2);

    expect(campaignReducer(before, { ...check(1, null), survivor: 'nobody' })).toEqual(before);
  });

  it('records a check that holds, and removes nobody', () => {
    const after = expectOpen(campaignReducer(dying(2), check(10, DECOY)));

    expect(after.survivors).toHaveLength(2);
    expect(after.log.map((line) => line.event)).toEqual([
      {
        kind: 'rot-checked',
        survivor: CHECKED,
        name: 'Marcus Webb',
        roll: 10,
        target: 12,
        passed: true,
      },
    ]);
  });

  it('records a check that fails, and the survivor who left with it', () => {
    const after = expectOpen(campaignReducer(dying(2), check(1, null)));

    expect(after.survivors.map((survivor) => survivor.id)).toEqual([DECOY]);
    expect(after.log.map((line) => line.event)).toEqual([
      {
        kind: 'rot-checked',
        survivor: CHECKED,
        name: 'Marcus Webb',
        roll: 1,
        target: 12,
        passed: false,
      },
      { kind: 'survivor-left', survivor: CHECKED, name: 'Marcus Webb', tier: 2 },
    ]);
  });

  it('records the bite as well, where somebody takes one and lives', () => {
    const after = expectOpen(campaignReducer(dying(2), check(1, DECOY)));

    expect(after.survivors).toEqual([
      { ...createSurvivor('Ruby Vance', 4, { id: DECOY }), currentHp: 1 },
    ]);
    expect(after.log.map((line) => line.event)).toEqual([
      {
        kind: 'rot-checked',
        survivor: CHECKED,
        name: 'Marcus Webb',
        roll: 1,
        target: 12,
        passed: false,
      },
      { kind: 'survivor-left', survivor: CHECKED, name: 'Marcus Webb', tier: 2 },
      { kind: 'survivor-bitten', survivor: DECOY, name: 'Ruby Vance', damage: 1 },
    ]);
  });

  /** The worst case: one failed check, two survivors gone, four entries. */
  it('records both departures where the bite finishes them', () => {
    const after = expectOpen(campaignReducer(dying(1), check(1, DECOY)));

    expect(after.survivors).toEqual([]);
    expect(after.assignments).toEqual({});
    expect(after.log.map((line) => line.event)).toEqual([
      {
        kind: 'rot-checked',
        survivor: CHECKED,
        name: 'Marcus Webb',
        roll: 1,
        target: 12,
        passed: false,
      },
      { kind: 'survivor-left', survivor: CHECKED, name: 'Marcus Webb', tier: 2 },
      { kind: 'survivor-bitten', survivor: DECOY, name: 'Ruby Vance', damage: 1 },
      { kind: 'survivor-left', survivor: DECOY, name: 'Ruby Vance', tier: 4 },
    ]);
  });
});
