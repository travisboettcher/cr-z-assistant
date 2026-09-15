import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { logged, type CampaignEventKind, type LogEntry } from './log';
import { CAMPAIGN_EVENT_SAMPLES, SAMPLED_EVENT_KINDS } from '../test/logSamples';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-08T21:00:00.000Z';
const LATER = '2026-09-08T22:30:00.000Z';

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), ...overrides };
}

describe('logged', () => {
  it('stamps the turn and phase the campaign is in right now', () => {
    const after = logged(campaign({ turn: 4, step: 'check-for-rot' }), AT, { kind: 'turn-began' });

    expect(after.log).toEqual([
      { turn: 4, phase: 'management', at: AT, event: { kind: 'turn-began' } },
    ]);
  });

  /**
   * The ordering the store depends on: it changes the campaign and *then*
   * records it, so an entry for a turn that has just begun is filed under the
   * new turn rather than the one that ended. Stamping from the argument rather
   * than from anything the caller passes is what makes that work — and what
   * would break silently if this read a turn off the event instead.
   */
  it('reads the turn from the campaign it is handed, not from an earlier one', () => {
    const before = campaign({ turn: 4 });
    const advanced = { ...before, turn: 5 };

    expect(logged(advanced, AT, { kind: 'turn-began' }).log[0]?.turn).toBe(5);
    expect(logged(before, AT, { kind: 'turn-began' }).log[0]?.turn).toBe(4);
  });

  it('appends to the end, after everything already there', () => {
    const first: LogEntry = {
      turn: 1,
      phase: 'mission',
      at: AT,
      event: { kind: 'campaign-started', name: 'Cedar Hollow' },
    };

    const after = logged(campaign({ log: [first] }), LATER, {
      kind: 'base-claimed',
      base: 'hobby-farm',
    });

    expect(after.log).toHaveLength(2);
    expect(after.log[0]).toEqual(first);
    expect(after.log[1]).toEqual({
      turn: 1,
      phase: 'mission',
      at: LATER,
      event: { kind: 'base-claimed', base: 'hobby-farm' },
    });
  });

  it('changes nothing else about the campaign', () => {
    const before = campaign({ turn: 2, materials: { food: 3, fuel: 1, hardware: 0, rare: 0 } });

    const after = logged(before, AT, { kind: 'phase-entered' });

    expect({ ...after, log: before.log }).toEqual(before);
  });

  /**
   * Frozen rather than merely compared afterwards: a spread that reached for
   * `push` would pass an equality check against a copy taken too late, and
   * fail here at the point the mutation happens.
   */
  it('leaves the campaign it was given untouched', () => {
    const before = campaign();
    Object.freeze(before);
    Object.freeze(before.log);

    expect(() => logged(before, AT, { kind: 'turn-began' })).not.toThrow();
    expect(before.log).toEqual([]);
  });
});

describe('the event samples', () => {
  /**
   * The samples are only worth anything if they are complete, and "complete"
   * cannot be checked against a type at runtime — so it is checked against a
   * `Record` over the kinds, which *is* exhaustive at compile time. An event
   * added to `log.ts` fails here twice over: the record below will not compile
   * without a line, and the set comparison fails without a sample.
   */
  const EVERY_KIND: Record<CampaignEventKind, true> = {
    'campaign-started': true,
    'phase-entered': true,
    'turn-began': true,
    'starting-community-settled': true,
    'planning-began': true,
    'materials-added': true,
    'materials-converted': true,
    'xp-awarded': true,
    'health-restored': true,
    'survivors-fed': true,
    'rot-checked': true,
    'bite-restrained': true,
    'survivor-bitten': true,
    'storage-checked': true,
    'facility-ordered': true,
    'upgrade-ordered': true,
    'clearing-ordered': true,
    'project-cancelled': true,
    'project-unfinished': true,
    'horde-checked': true,
    'survivor-added': true,
    'survivor-recruited': true,
    'survivor-left': true,
    'survivor-departed': true,
    'mission-team-reduced': true,
    'survivor-promoted': true,
    'skill-level-bought': true,
    'common-skill-bought': true,
    'base-claimed': true,
    'base-stocked': true,
    'facility-built': true,
    'upgrade-built': true,
    'slot-cleared': true,
  };

  it('covers every kind of event there is', () => {
    expect([...SAMPLED_EVENT_KINDS].sort()).toEqual(Object.keys(EVERY_KIND).sort());
  });

  it('carries at least one sample per kind', () => {
    expect(CAMPAIGN_EVENT_SAMPLES.length).toBeGreaterThanOrEqual(SAMPLED_EVENT_KINDS.size);
  });
});
