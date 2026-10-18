import { describe, expect, it } from 'vitest';
import { submitMadnessRecovered } from './advancementForms';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import type { LogEntry } from './log';
import {
  hasLounge,
  loungePool,
  madnessAwards,
  madnessRecovered,
  recoveringFromMadness,
} from './lounge';
import { outstanding } from './outstanding';
import { checkAssignment } from './planning';
import { createSurvivor } from './survivor';
import { generatingFlatUtility } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

/** The Small Town Home with a Lounge in each Bunk Room asked for. */
const lounges = (rooms: readonly string[]): Base => ({
  id: 'small-town-home',
  slots: Object.fromEntries(rooms.map((room) => [room, { upgrades: ['lounge'] }])),
});

const earl = (madness: number): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  madness,
});
const carla = (madness: number): Survivor => ({
  ...createSurvivor('Carla Proust', 3, { id: 'carla' }),
  madness,
});

/** Turn 3's Heal Wounds in a Cosmic Horror campaign, one Lounge, Earl and Carla recovering. */
function recovering(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'heal-wounds',
    origin: 'cosmic-horror',
    base: lounges(['bunk-room-1']),
    survivors: [earl(3), carla(1)],
    assignments: { earl: { task: 'madness-recovery' }, carla: { task: 'madness-recovery' } },
    ...overrides,
  };
}

const shares = (campaign: Campaign) =>
  madnessAwards(campaign).map(({ survivor, madness }) => [survivor.id, madness]);

describe('the Lounge’s points (pg. 68; R110)', () => {
  it('are 2 a Lounge, 4 with Power, and none without one', () => {
    expect(loungePool(recovering())).toBe(2);
    expect(loungePool(recovering({ base: lounges(['bunk-room-1', 'bunk-room-2']) }))).toBe(4);
    expect(loungePool(recovering({ base: null }))).toBe(0);
    expect(hasLounge(recovering({ base: { id: 'small-town-home', slots: {} } }))).toBe(false);
    expect(hasLounge(recovering())).toBe(true);
    // A Power point on the Bunk Room, backed by a Solar Panel.
    const powered = generatingFlatUtility(
      recovering({
        base: {
          id: 'small-town-home',
          slots: { 'bunk-room-1': { upgrades: ['lounge'], power: true } },
        },
      }),
      'power',
    );
    expect(loungePool(powered)).toBe(4);
  });

  it('are shared equally among those assigned, never more than they carry', () => {
    expect(shares(recovering())).toEqual([
      ['earl', 1],
      ['carla', 1],
    ]);
    expect(shares(recovering({ base: lounges(['bunk-room-1', 'bunk-room-2']) }))).toEqual([
      ['earl', 3],
      ['carla', 1],
    ]);
    expect(shares(recovering({ survivors: [earl(0), carla(5)] }))).toEqual([['carla', 2]]);
    expect(shares(recovering({ survivors: [earl(0), carla(0)] }))).toEqual([]);
  });

  it('reach only those assigned to Madness Recovery, from last turn’s Planning', () => {
    const resting = recovering({
      assignments: { earl: { task: 'rest' }, carla: { task: 'madness-recovery' } },
    });

    expect(recoveringFromMadness(resting).map((survivor) => survivor.id)).toEqual(['carla']);
    expect(shares(resting)).toEqual([['carla', 1]]);

    const planned: LogEntry = {
      turn: 3,
      phase: 'planning',
      at: AT,
      event: { kind: 'planning-began', cleared: { earl: { task: 'madness-recovery' } } },
    };
    const cleared = recovering({ step: 'assign-facility-staff', assignments: {}, log: [planned] });

    expect(recoveringFromMadness(cleared).map((survivor) => survivor.id)).toEqual(['earl']);
  });
});

describe('handing it out at Heal Wounds (R110)', () => {
  it('takes the Madness off, an entry each, once a turn', () => {
    const before = recovering();

    expect(outstanding(before).map((one) => one.says)).toContain(
      'The Lounge’s Madness Recovery hasn’t been handed out.',
    );

    const result = submitMadnessRecovered(before, AT);
    if (!result.ok) throw new Error(result.problem);
    const after = result.campaign;

    expect(after.survivors.map((survivor) => survivor.madness)).toEqual([2, 0]);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'madness-recovered', survivor: 'earl', name: 'Earl Rhodes', madness: 1 },
      { kind: 'madness-recovered', survivor: 'carla', name: 'Carla Proust', madness: 1 },
    ]);
    expect(madnessRecovered(after)).toBe(true);
    expect(madnessRecovered({ ...after, turn: 4 })).toBe(false);
    expect(outstanding(after).map((one) => one.says)).not.toContain(
      'The Lounge’s Madness Recovery hasn’t been handed out.',
    );
    expect(submitMadnessRecovered(after, AT)).toEqual({
      ok: false,
      problem: 'This turn’s Madness Recovery is done.',
    });
  });

  it('is refused outside the Advancement Phase, and with nothing to hand out', () => {
    expect(submitMadnessRecovered(recovering({ step: 'check-for-rot' }), AT)).toEqual({
      ok: false,
      problem: 'Madness Recovery is handed out in the Advancement Phase.',
    });
    expect(submitMadnessRecovered(recovering({ base: null }), AT)).toEqual({
      ok: false,
      problem: 'Nobody has Madness the Lounge can take off this turn.',
    });
    expect(outstanding(recovering({ base: null })).map((one) => one.says)).not.toContain(
      'The Lounge’s Madness Recovery hasn’t been handed out.',
    );
  });
});

describe('assigning Madness Recovery (pg. 21; R110)', () => {
  const codes = (campaign: Campaign) =>
    checkAssignment(campaign, 'earl', { task: 'madness-recovery' }).warnings.map(
      (warning) => warning.code,
    );
  const planning = (overrides: Partial<Campaign> = {}) =>
    recovering({ step: 'assign-rest-and-healing', assignments: {}, ...overrides });

  it('warns without a Lounge, outside Cosmic Horror, or with no Madness to lose', () => {
    expect(codes(planning())).toEqual([]);
    expect(codes(planning({ base: null }))).toEqual(['no-lounge']);
    expect(codes(planning({ origin: 'viral' }))).toEqual(['not-this-origin']);
    expect(codes(planning({ survivors: [earl(0), carla(1)] }))).toEqual(['no-madness']);
  });
});
