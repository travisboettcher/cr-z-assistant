import { describe, expect, it } from 'vitest';
import type { TurnStepId } from '../data/turn';
import { createNewCampaign, type Campaign } from './campaign';
import { createSurvivor, recruitSurvivor } from './survivor';
import {
  submitAdvance,
  submitBaseClaim,
  submitNewSurvivor,
  submitRecruit,
  submitRemoval,
  submitStartingCommunity,
} from './campaignForms';
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
    expect(after.materials).toEqual({ food: 4, fuel: 4, hardware: 4, rare: 0 });
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
    const after = submitNewSurvivor(
      createNewCampaign('Cedar Hollow', FIXED),
      { id: 'earl', name: 'Earl Rhodes', tier: 4 },
      AT,
    ).campaign;

    expect(after.survivors).toEqual([createSurvivor('Earl Rhodes', 4, { id: 'earl' })]);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-added', survivor: 'earl', name: 'Earl Rhodes', tier: 4 },
    ]);
  });
});

describe('submitRecruit', () => {
  it('adds the recruit and settles the starting community, saying so', () => {
    const after = submitRecruit(
      createNewCampaign('Cedar Hollow', FIXED),
      { id: 'carla', name: 'Carla Proust', tier: 3, roll: 6 },
      AT,
    ).campaign;

    expect(after.survivors).toEqual([recruitSurvivor('Carla Proust', 3, 6, { id: 'carla' })]);
    expect(after.startingCommunityBuilt).toBe(true);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-recruited', survivor: 'carla', name: 'Carla Proust', tier: 3, roll: 6 },
      { kind: 'starting-community-settled', built: true },
    ]);
  });

  /** A Rookie throws no die, and the entry does not claim one. */
  it('records no roll that was not made, and settles nothing already settled', () => {
    const after = submitRecruit(
      { ...createNewCampaign('Cedar Hollow', FIXED), startingCommunityBuilt: true },
      { id: 'pip', name: 'Pip', tier: 1 },
      AT,
    ).campaign;

    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-recruited', survivor: 'pip', name: 'Pip', tier: 1 },
    ]);
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
