import { describe, expect, it } from 'vitest';
import type { TurnStepId } from '../data/turn';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor, recruitSurvivor } from './survivor';
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
} from './campaignForms';
import type { LogEntry } from './log';
import { strangersWaiting } from './strangers';
import { expectAccepted, expectRefused } from '../test/forms';

/**
 * The forms that belong to no single phase, on their own, without the store
 * (#179). The reducer's suite still walks each of these through
 * `campaignReducer`, and is what says the move changed nothing.
 */

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-11T09:00:00.000Z';

const opened = (step: TurnStepId, turn = 1): Campaign => ({
  ...createNewCampaign('Cedar Hollow', FIXED),
  turn,
  step,
});

const kinds = (campaign: Campaign) => campaign.log.map((entry) => entry.event.kind);

describe('submitAdvance', () => {
  it('moves one step inside a phase and records nothing', () => {
    const before = opened('check-for-rot');

    expect(submitAdvance(before, 'step', AT)).toEqual({
      ok: true,
      campaign: { ...before, step: 'feed-your-survivors' },
    });
  });

  it('records the crossing into a new phase, stamped in the phase entered', () => {
    const after = submitAdvance(opened('tactical-mission'), 'step', AT).campaign;

    expect(after.step).toBe('character-advancement');
    expect(after.log).toEqual([
      { turn: 1, phase: 'advancement', at: AT, event: { kind: 'phase-entered' } },
    ]);
  });

  it('clears last turn’s tasks entering the Planning Phase, and says what it cleared', () => {
    const before: Campaign = {
      ...opened('add-facilities-and-upgrades', 3),
      survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
      assignments: { earl: { task: 'project' } },
    };

    const after = submitAdvance(before, 'step', AT).campaign;

    expect(after.assignments).toEqual({});
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'planning-began', cleared: { earl: { task: 'project' } } },
    ]);
  });

  /**
   * Stepping back into the Advancement Phase and forward again re-enters the
   * Planning Phase as an ordinary crossing: the planning just done survives.
   */
  it('does not clear a second time in the same turn', () => {
    const once = submitAdvance(opened('add-facilities-and-upgrades', 3), 'step', AT).campaign;
    const replanned: Campaign = {
      ...once,
      step: 'add-facilities-and-upgrades',
      survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
      assignments: { earl: { task: 'rest' } },
    };

    const after = submitAdvance(replanned, 'step', AT).campaign;

    expect(after.assignments).toEqual({ earl: { task: 'rest' } });
    expect(kinds(after)).toEqual(['planning-began', 'phase-entered']);
  });

  it('ends the turn off the end of the Management Phase, with one entry', () => {
    const after = submitAdvance(opened('departures', 3), 'phase', AT).campaign;

    expect(after.turn).toBe(4);
    expect(after.log).toEqual([
      { turn: 4, phase: 'mission', at: AT, event: { kind: 'turn-began' } },
    ]);
  });

  /** #167: the siege the horde called is written down the moment its turn opens. */
  it('records the siege a new turn is fought on, and who fought it', () => {
    const before: Campaign = {
      ...opened('departures', 2),
      survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
      log: [
        {
          turn: 2,
          phase: 'management',
          at: AT,
          event: { kind: 'horde-checked', roll: 10, threat: 6, siege: true },
        },
      ],
    };

    const after = submitAdvance(before, 'step', AT).campaign;

    expect(kinds(after)).toEqual(['horde-checked', 'turn-began', 'siege-fought']);
    expect(after.log.at(-1)?.event).toEqual({ kind: 'siege-fought', names: ['Earl Rhodes'] });
  });
});

describe('submitBaseClaim', () => {
  it('claims the base, stocks it to its caps, and records both', () => {
    const after = expectAccepted(
      submitBaseClaim(createNewCampaign('Cedar Hollow', FIXED), 'small-town-home', AT),
    );

    expect(after.base).toEqual({ id: 'small-town-home', slots: {} });
    expect(after.materials).toEqual({ food: 4, fuel: 4, hardware: 4 });
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'base-claimed', base: 'small-town-home' },
      { kind: 'base-stocked', food: 4, fuel: 4, hardware: 4 },
    ]);
  });

  it('refuses a second base', () => {
    const once = expectAccepted(
      submitBaseClaim(createNewCampaign('Cedar Hollow', FIXED), 'small-town-home', AT),
    );

    expect(expectRefused(submitBaseClaim(once, 'greasy-spoon', AT))).toMatch(/already has a base/);
  });
});

describe('submitStartingCommunity', () => {
  it('records the answer when it changes', () => {
    const after = expectAccepted(
      submitStartingCommunity(createNewCampaign('Cedar Hollow', FIXED), true, AT),
    );

    expect(after.startingCommunityBuilt).toBe(true);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'starting-community-settled', built: true },
    ]);
  });

  it('refuses an answer it already holds, so the press writes nothing', () => {
    expect(
      expectRefused(submitStartingCommunity(createNewCampaign('Cedar Hollow', FIXED), false, AT)),
    ).toMatch(/already/);
  });
});

describe('submitNewSurvivor', () => {
  it('adds them as built, under the id the caller made', () => {
    const after = expectAccepted(
      submitNewSurvivor(
        createNewCampaign('Cedar Hollow', FIXED),
        { id: 'earl', name: 'Earl Rhodes', tier: 4 },
        AT,
      ),
    );

    expect(after.survivors).toEqual([createSurvivor('Earl Rhodes', 4, { id: 'earl' })]);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-added', survivor: 'earl', name: 'Earl Rhodes', tier: 4 },
    ]);
  });
});

describe('submitRecruit', () => {
  it('adds the recruit and settles the starting community, saying so', () => {
    const after = expectAccepted(
      submitRecruit(
        createNewCampaign('Cedar Hollow', FIXED),
        { id: 'carla', name: 'Carla Proust', tier: 3, roll: 6 },
        AT,
      ),
    );

    expect(after.survivors).toEqual([recruitSurvivor('Carla Proust', 3, 6, { id: 'carla' })]);
    expect(after.startingCommunityBuilt).toBe(true);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-recruited', survivor: 'carla', name: 'Carla Proust', tier: 3, roll: 6 },
      { kind: 'starting-community-settled', built: true },
    ]);
  });

  /** A Rookie throws no die, and the entry does not claim one. */
  it('records no roll that was not made, and settles nothing already settled', () => {
    const after = expectAccepted(
      submitRecruit(
        { ...createNewCampaign('Cedar Hollow', FIXED), startingCommunityBuilt: true },
        { id: 'pip', name: 'Pip', tier: 1 },
        AT,
      ),
    );

    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-recruited', survivor: 'pip', name: 'Pip', tier: 1 },
    ]);
  });
});

/**
 * Every reader that finds a survivor by id takes the first match, so a second
 * survivor under one id would be unreachable (#204).
 */
describe('a new survivor’s id', () => {
  const earl = createSurvivor('Earl Rhodes', 4, { id: 'earl' });
  const away = createSurvivor('Hera Okafor', 4, { id: 'hera' });
  const community = {
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [earl],
    setAside: [away],
  };

  it('is refused when somebody on the roster or set aside has it', () => {
    for (const id of ['earl', 'hera']) {
      expect(
        expectRefused(submitNewSurvivor(community, { id, name: 'Ruby Vance', tier: 1 }, AT)),
      ).toBe('Somebody in the community already has that id.');
      expect(expectRefused(submitRecruit(community, { id, name: 'Ruby Vance', tier: 1 }, AT))).toBe(
        'Somebody in the community already has that id.',
      );
    }
  });

  it('is refused when empty', () => {
    expect(
      expectRefused(submitNewSurvivor(community, { id: '', name: 'Ruby Vance', tier: 1 }, AT)),
    ).toBe('A new survivor needs an id.');
  });

  it('is taken when nobody has it', () => {
    expect(
      expectAccepted(submitNewSurvivor(community, { id: 'ruby', name: 'Ruby Vance', tier: 1 }, AT))
        .survivors,
    ).toHaveLength(2);
  });
});

describe('submitStrangerJoined', () => {
  const rescued = (team: number, strangers: readonly (1 | 2 | 3)[]): LogEntry => ({
    turn: 3,
    phase: 'mission',
    at: AT,
    event: { kind: 'rescue-strangers-resolved', team, strangers },
  });

  /** Turn 3's Create New Survivors, after two teams each rescued somebody. */
  const twoRescues = (): Campaign => ({
    ...opened('create-new-survivors', 3),
    startingCommunityBuilt: true,
    log: [rescued(1, [2]), rescued(2, [1])],
  });

  it('adds the stranger at the Tier the outcome counted, and names the rescue', () => {
    const after = expectAccepted(
      submitStrangerJoined(
        twoRescues(),
        { id: 'carla', team: 1, stranger: 0, name: 'Carla Proust', roll: 6 },
        AT,
      ),
    );

    // A six is Archery (pg. 15).
    expect(after.survivors).toEqual([recruitSurvivor('Carla Proust', 2, 6, { id: 'carla' })]);
    expect(after.log.slice(2)).toEqual([
      {
        turn: 3,
        phase: 'advancement',
        at: AT,
        event: {
          kind: 'stranger-joined',
          survivor: 'carla',
          name: 'Carla Proust',
          tier: 2,
          team: 1,
          stranger: 0,
          roll: 6,
        },
      },
    ]);
  });

  it('refuses an id somebody already has (#204)', () => {
    const first = expectAccepted(
      submitStrangerJoined(twoRescues(), { id: 'carla', team: 1, stranger: 0, name: 'Carla' }, AT),
    );

    expect(
      expectRefused(
        submitStrangerJoined(first, { id: 'carla', team: 2, stranger: 0, name: 'Pip' }, AT),
      ),
    ).toBe('Somebody in the community already has that id.');
  });

  /** The acceptance: two strangers rescued by two teams are two survivors, each once. */
  it('takes each of two teams’ strangers once, and then neither again', () => {
    const first = expectAccepted(
      submitStrangerJoined(twoRescues(), { id: 'carla', team: 1, stranger: 0, name: 'Carla' }, AT),
    );
    const both = expectAccepted(
      submitStrangerJoined(first, { id: 'pip', team: 2, stranger: 0, name: 'Pip' }, AT),
    );

    expect(both.survivors.map((survivor) => [survivor.name, survivor.tier])).toEqual([
      ['Carla', 2],
      ['Pip', 1],
    ]);
    expect(strangersWaiting(both)).toEqual([]);
    expect(
      expectRefused(
        submitStrangerJoined(both, { id: 'again', team: 1, stranger: 0, name: 'Carla' }, AT),
      ),
    ).toMatch(/already joined/);
  });

  /** Gone back over: stepping back and forward through the step changes nothing it read. */
  it('does not offer a stranger again after the walk goes back over the step', () => {
    const joined = expectAccepted(
      submitStrangerJoined(twoRescues(), { id: 'carla', team: 1, stranger: 0, name: 'Carla' }, AT),
    );
    const walkedBack = submitAdvance(
      { ...submitAdvance(joined, 'step', AT).campaign, step: 'character-advancement' },
      'step',
      AT,
    ).campaign;

    expect(walkedBack.step).toBe('create-new-survivors');
    expect(strangersWaiting(walkedBack)).toEqual([{ team: 2, stranger: 0, tier: 1 }]);
  });

  /** Proof play has begun, for the reason a field recruit is (pg. 13). */
  it('settles a starting community still being built, saying so once', () => {
    const after = expectAccepted(
      submitStrangerJoined(
        { ...twoRescues(), startingCommunityBuilt: false },
        { id: 'pip', team: 2, stranger: 0, name: 'Pip' },
        AT,
      ),
    );

    expect(after.startingCommunityBuilt).toBe(true);
    expect(kinds(after).slice(2)).toEqual(['stranger-joined', 'starting-community-settled']);
  });

  /** A Rookie throws no die, and the entry does not claim one. */
  it('records no roll that was not made', () => {
    const after = expectAccepted(
      submitStrangerJoined(twoRescues(), { id: 'pip', team: 2, stranger: 0, name: 'Pip' }, AT),
    );

    expect(after.log.at(-1)?.event).toEqual({
      kind: 'stranger-joined',
      survivor: 'pip',
      name: 'Pip',
      tier: 1,
      team: 2,
      stranger: 0,
    });
    expect(after.log.at(-1)?.event).not.toHaveProperty('roll');
  });

  it('refuses what `strangerProblem` refuses, and changes nothing', () => {
    expect(
      expectRefused(
        submitStrangerJoined(
          { ...twoRescues(), step: 'tactical-mission' },
          { id: 'carla', team: 1, stranger: 0, name: 'Carla' },
          AT,
        ),
      ),
    ).toMatch(/Advancement/);
    expect(
      expectRefused(
        submitStrangerJoined(twoRescues(), { id: 'x', team: 1, stranger: 1, name: 'X' }, AT),
      ),
    ).toMatch(/no such stranger/i);
  });
});

describe('submitRemoval', () => {
  const community = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
      createSurvivor('Carla Proust', 3, { id: 'carla' }),
    ],
    assignments: { earl: { task: 'rest' }, carla: { task: 'project' } },
  });

  it('takes them and their task off the roster, and keeps their name in the log', () => {
    const after = expectAccepted(submitRemoval(community(), 'earl', AT));

    expect(after.survivors.map((survivor) => survivor.id)).toEqual(['carla']);
    expect(after.assignments).toEqual({ carla: { task: 'project' } });
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-left', survivor: 'earl', name: 'Earl Rhodes', tier: 4 },
    ]);
  });

  it('refuses somebody who is not on the roster', () => {
    expect(expectRefused(submitRemoval(community(), 'nobody', AT))).toMatch(/community/);
  });
});

/** A survivor set aside rejoins as themselves (pp. 19, 86; R31; Z4-11). */
describe('submitReturn', () => {
  const hera = createSurvivor('Hera Okafor', 4, { id: 'hera' });
  const broughtBack = (built: boolean): Campaign => ({
    ...opened('create-new-survivors', 3),
    startingCommunityBuilt: built,
    setAside: [hera],
    log: [
      {
        turn: 3,
        phase: 'mission',
        at: AT,
        event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
      },
      {
        turn: 3,
        phase: 'mission',
        at: AT,
        event: { kind: 'rescue-strangers-resolved', team: 1, strangers: [], returned: ['hera'] },
      },
    ],
  });

  it('puts them back on the roster, and says who', () => {
    const after = expectAccepted(submitReturn(broughtBack(true), 'hera', AT));

    expect(after.survivors).toEqual([hera]);
    expect(after.setAside).toEqual([]);
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'survivor-returned',
      survivor: 'hera',
      name: 'Hera Okafor',
    });
  });

  it('settles a starting community still being built, as a stranger joining does', () => {
    expect(kinds(expectAccepted(submitReturn(broughtBack(false), 'hera', AT))).slice(-2)).toEqual([
      'survivor-returned',
      'starting-community-settled',
    ]);
  });

  it('refuses with the engine’s reason', () => {
    expect(expectRefused(submitReturn(broughtBack(true), 'june', AT))).toMatch(
      /brought back this turn/,
    );
  });
});

/** Items put into and taken out of the base's Inventory by hand (Z5-2). */
describe('submitItemAdded and submitItemRemoved', () => {
  it('adds the item, and says so', () => {
    const after = expectAccepted(
      submitItemAdded(
        opened('assign-project-team', 3),
        { id: 'item-1', item: 'pistol', grade: 'standard' },
        AT,
      ),
    );

    expect(after.inventory).toEqual([{ id: 'item-1', item: 'pistol', grade: 'standard' }]);
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'item-added',
      id: 'item-1',
      item: 'pistol',
      grade: 'standard',
    });
  });

  it('takes the item out, and says what it was', () => {
    const stocked = {
      ...opened('assign-project-team', 3),
      inventory: [
        { id: 'item-1', item: 'pistol', grade: 'standard' },
        { id: 'item-2', item: 'binoculars', grade: 'quality' },
      ],
    } satisfies Campaign;
    const after = expectAccepted(submitItemRemoved(stocked, 'item-2', AT));

    expect(after.inventory).toEqual([{ id: 'item-1', item: 'pistol', grade: 'standard' }]);
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'item-removed',
      id: 'item-2',
      item: 'binoculars',
      grade: 'quality',
    });
  });

  it('refuses with the engine’s reasons', () => {
    expect(
      expectRefused(
        submitItemAdded(opened('select-mission'), { id: 'x', item: 'pistol', grade: 'shoddy' }, AT),
      ),
    ).toMatch(/R35/);
    expect(expectRefused(submitItemRemoved(opened('select-mission'), 'nothing', AT))).toMatch(
      /Only an item in the base/,
    );
  });
});
