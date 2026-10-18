import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { goingLost } from './departures';
import { submitDeparture, submitGoneLost } from './managementForms';
import { outstanding } from './outstanding';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const AXE = { id: 'axe', item: 'bladed', grade: 'standard' } as const;

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  madness: 13,
  items: [AXE],
  ...overrides,
});
const carla = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Carla Proust', 3, { id: 'carla' }),
  madness: 12,
  ...overrides,
});
const ruby = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
  ...overrides,
});

/** Turn 3's Departures in a Cosmic Horror campaign. */
function departing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'departures',
    origin: 'cosmic-horror',
    survivors: [earl(), carla(), ruby()],
    assignments: { earl: { task: 'project' }, carla: { task: 'project' } },
    ...overrides,
  };
}

const ids = (survivors: readonly Survivor[]) => survivors.map((survivor) => survivor.id);

describe('who goes Lost (pp. 23, 124; R106, R107)', () => {
  it('is everybody at 13 or more Madness, in a Cosmic Horror campaign', () => {
    expect(ids(goingLost(departing()))).toEqual(['earl']);
    expect(ids(goingLost(departing({ survivors: [earl(), carla({ madness: 20 })] })))).toEqual([
      'earl',
      'carla',
    ]);
    expect(goingLost(departing({ origin: 'viral' }))).toEqual([]);
    const { origin, ...none } = departing();
    void origin;
    expect(goingLost(none)).toEqual([]);
  });

  it('is nobody who is down (R107)', () => {
    expect(goingLost(departing({ survivors: [earl({ currentHp: 0 }), carla()] }))).toEqual([]);
  });
});

describe('going Lost at Departures (R106)', () => {
  it('takes them off the roster onto the Lost, with what they carry and without their task', () => {
    const result = submitGoneLost(departing(), AT);
    if (!result.ok) throw new Error(result.problem);
    const after = result.campaign;

    expect(ids(after.survivors)).toEqual(['carla', 'ruby']);
    expect(ids(after.lost)).toEqual(['earl']);
    expect(after.lost[0]?.items).toEqual([AXE]);
    expect(after.assignments).toEqual({ carla: { task: 'project' } });
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-lost', survivor: 'earl', name: 'Earl Rhodes', madness: 13, items: [AXE] },
    ]);
    expect(goingLost(after)).toEqual([]);
  });

  it('writes no items for somebody carrying none, and adds to the Lost already kept', () => {
    const earlier = createSurvivor('June Park', 2, { id: 'june' });
    const result = submitGoneLost(
      departing({ survivors: [earl({ items: [] }), carla()], lost: [earlier] }),
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(ids(result.campaign.lost)).toEqual(['june', 'earl']);
    expect(result.campaign.log.at(-1)?.event).not.toHaveProperty('items');
  });

  it('is owed at Departures, and refused anywhere else or with nobody to go', () => {
    expect(outstanding(departing()).map((one) => one.says)).toContain(
      'Somebody at 13 or more Madness hasn’t gone Lost.',
    );
    expect(submitGoneLost(departing({ step: 'check-the-horde' }), AT)).toEqual({
      ok: false,
      problem: 'Survivors go Lost at Departures.',
    });
    expect(submitGoneLost(departing({ survivors: [carla()] }), AT)).toEqual({
      ok: false,
      problem: 'Nobody here is going Lost to Madness.',
    });
  });

  it('comes before the Unrest check, which waits for them (R106)', () => {
    expect(submitDeparture(departing(), 'ruby', AT)).toEqual({
      ok: false,
      problem: 'Those going Lost to Madness leave first.',
    });
  });
});
