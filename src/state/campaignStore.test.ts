import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PHASES, createNewCampaign } from '../engine/campaign';
import type { Campaign } from '../engine/campaign';
import { createSurvivor, recruitSurvivor } from '../engine/survivor';
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
    { type: 'campaign/startingCommunityBuiltSet', built: true },
    { type: 'survivor/added', name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    { type: 'survivor/recruited', name: 'Carla Proust', tier: 3, roll: 6, id: OTHER_SURVIVOR_ID },
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
    { type: 'campaign/startingCommunityBuiltSet', built: true },
    { type: 'survivor/added', name: 'Earl Rhodes', tier: 4, id: SURVIVOR_ID },
    { type: 'survivor/recruited', name: 'Carla Proust', tier: 3, roll: 6, id: OTHER_SURVIVOR_ID },
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

describe('campaign/startingCommunityBuiltSet', () => {
  it('records the answer both ways, changing nothing else', () => {
    const before = createNewCampaign('Cedar Hollow', FIXED);

    expect(before.startingCommunityBuilt).toBe(false);

    const built = expectOpen(
      campaignReducer(openState(before), {
        type: 'campaign/startingCommunityBuiltSet',
        built: true,
      }),
    );
    expect(built).toEqual({ ...before, startingCommunityBuilt: true });

    const unbuilt = expectOpen(
      campaignReducer(openState(built), {
        type: 'campaign/startingCommunityBuiltSet',
        built: false,
      }),
    );
    expect(unbuilt).toEqual(before);
  });
});

describe('survivor/recruited', () => {
  it('adds the recruit the rulebook’s own example produces', () => {
    const campaign = expectOpen(
      campaignReducer(openState(), {
        type: 'survivor/recruited',
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
      name: 'Earl Rhodes',
      tier: 4,
      id: SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/recruited',
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
      id: SURVIVOR_ID,
      skill: 'scavenge',
    });
    expect(survivor(levelled)?.skills.scavenge).toBe(1);
    expect(survivor(levelled)?.xp).toBe(19);

    const faster = campaignReducer(start, {
      type: 'survivor/commonSkillBought',
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
      id: SURVIVOR_ID,
      skill: 'defense',
    });

    expect(survivor(after)).toEqual(survivor(broke));
  });

  it('promotes a survivor, spending the price and rebuilding their stats', () => {
    const after = campaignReducer(withCitizen(6), {
      type: 'survivor/tierBought',
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
      id: SURVIVOR_ID,
      raise: null,
    });

    expect(survivor(after)).toEqual(survivor(before));
  });

  it('spends nobody else’s experience', () => {
    let state = campaignReducer(withCitizen(20), {
      type: 'survivor/added',
      name: 'Earl Rhodes',
      tier: 4,
      id: OTHER_SURVIVOR_ID,
    });
    state = campaignReducer(state, {
      type: 'survivor/commonSkillBought',
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
    const state = campaignReducer(openState(), { type: 'base/claimed', base: 'hobby-farm' });

    // Nothing but the id and an empty slot record: the layout, the built-in
    // facilities and the clearing projects are rules, and they stay in the data.
    expect(expectOpen(state).base).toEqual({ id: 'hobby-farm', slots: {} });
  });

  it('refuses to replace a base that is already claimed', () => {
    const claimed = campaignReducer(openState(), { type: 'base/claimed', base: 'hobby-farm' });
    const built = {
      status: 'open' as const,
      campaign: {
        ...expectOpen(claimed),
        base: { id: 'hobby-farm' as const, slots: { 'front-yard': { cleared: true as const } } },
      },
    };

    const again = campaignReducer(built, { type: 'base/claimed', base: 'distillery' });

    // Moving house is the Claim a New Base mission (Phase 4). Allowing it here
    // would drop every slot the player had built into, in one dispatch.
    expect(expectOpen(again).base).toEqual({
      id: 'hobby-farm',
      slots: { 'front-yard': { cleared: true } },
    });
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, { type: 'base/claimed', base: 'hobby-farm' }),
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
      campaignReducer(farm(), { type: 'slot/cleared', slot: 'ruined-chicken-coop', labor: 2 }),
    );

    expect(campaign.base?.slots['ruined-chicken-coop']).toEqual({ cleared: true });
    expect(campaign.materials.hardware).toBe(3);
  });

  it('does nothing when the clearing is blocked', () => {
    const before = farm();
    const state = campaignReducer(before, {
      type: 'slot/cleared',
      slot: 'ruined-chicken-coop',
      labor: 1,
    });

    expect(expectOpen(state)).toEqual(expectOpen(before));
  });

  it('does nothing when no campaign is open', () => {
    expect(
      campaignReducer(INITIAL_CAMPAIGN_STATE, {
        type: 'slot/cleared',
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
