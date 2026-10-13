/**
 * A siege turn whose Siege Defense overran the base, for the tests of how a
 * community goes on from one (pg. 86; #182, Z4-9).
 *
 * Turn 4, at Play the Mission, on a Hobby Farm: turn 3's Check the Horde
 * called the siege, the whole community fought it as team 1, and it ended with
 * zombies on the area and somebody out over the map edge. `after` appends what
 * the test is about.
 */

import type { BaseId } from '../data/bases';
import type { OverrunOption } from '../data/missions';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { CampaignEvent, LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';

export const OVERRUN_EARL = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
export const OVERRUN_RUBY = createSurvivor('Ruby Vance', 3, { id: 'ruby' });

/** An entry in turn 4's Mission Phase. */
export const inMission = (event: CampaignEvent): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event,
});

/** The siege, its selection and an outcome that overran the base. */
export const OVERRUN_LOG: readonly LogEntry[] = [
  {
    turn: 3,
    phase: 'management',
    at: AT,
    event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
  },
  inMission({ kind: 'mission-selected', team: 1, mission: 'siege-defense', names: [] }),
  inMission({ kind: 'siege-defense-resolved', zombiesLeft: 2, survivorsExited: 1, team: 1 }),
];

export function overrun(after: readonly LogEntry[] = [], overrides: Partial<Campaign> = {}) {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    materials: { food: 7, fuel: 3, hardware: 5, rare: 1 },
    base: { id: 'hobby-farm', slots: {} },
    survivors: [OVERRUN_EARL, OVERRUN_RUBY],
    log: [...OVERRUN_LOG, ...after],
    ...overrides,
  } satisfies Campaign as Campaign;
}

/** The way on, and team 1's selection of the mission it plays. */
export const wentOn = (option: OverrunOption, base: BaseId): readonly LogEntry[] => [
  inMission({ kind: 'overrun-continued', option }),
  inMission({
    kind: 'mission-selected',
    team: 1,
    mission: option === 'claim' ? 'claim-a-new-base' : 'first-mission',
    names: [],
    base,
  }),
];

/** The continuation's outcome: won on end condition 1, or failed. */
export const continued = (option: OverrunOption, won: boolean, sameMap?: boolean): LogEntry =>
  inMission(
    option === 'claim'
      ? {
          kind: 'claim-a-new-base-resolved',
          team: 1,
          endCondition: won ? 1 : null,
          strangers: [],
          vehiclesOnArea: 0,
          ...(sameMap === undefined ? {} : { sameMap }),
        }
      : { kind: 'first-mission-resolved', team: 1, endCondition: won ? 1 : null, strangers: [] },
  );
