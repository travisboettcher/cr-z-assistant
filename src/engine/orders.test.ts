import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Project } from './campaign';
import { builtEvent, checkOrder, orderedEvent } from './orders';
import { withProjectOrdered } from './projects';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function community(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
    base: { id: 'hobby-farm', slots: {} },
    ...projectTeamWorth(6),
    ...overrides,
  });
}

const WORKSHOP: Project = {
  kind: 'facility',
  slot: 'front-yard',
  facility: 'workshop',
  orderedOnTurn: 3,
};
const GAS_RANGE: Project = {
  kind: 'upgrade',
  slot: 'kitchen',
  upgrade: 'gas-range',
  orderedOnTurn: 3,
};
const COOP: Project = { kind: 'clearing', slot: 'ruined-chicken-coop', orderedOnTurn: 3 };

describe('checkOrder', () => {
  it('permits each of the three verbs when nothing is wrong', () => {
    for (const project of [WORKSHOP, GAS_RANGE, COOP]) {
      expect(checkOrder(community(), project).blockers).toEqual([]);
    }
  });

  it('asks the module that owns the verb, and reports its codes', () => {
    const poor = community({ materials: { food: 0, fuel: 0, hardware: 0, rare: 0 } });

    expect(checkOrder(poor, WORKSHOP).blockers.map((blocker) => blocker.code)).toEqual([
      'not-enough-hardware',
    ]);
    expect(checkOrder(poor, GAS_RANGE).blockers.map((blocker) => blocker.code)).toEqual([
      'not-enough-hardware',
    ]);
  });

  it('reports a clearing’s own refusal rather than a build’s', () => {
    const tired = community({ ...projectTeamWorth(1) });

    expect(checkOrder(tired, COOP).blockers.map((blocker) => blocker.code)).toEqual([
      'not-enough-labor',
    ]);
  });

  it('passes a warning through without turning it into a refusal', () => {
    // A Garden needs an outdoor slot and the Hobby Farm's kitchen is indoor.
    const check = checkOrder(community(), {
      kind: 'facility',
      slot: 'kitchen',
      facility: 'garden',
      orderedOnTurn: 3,
    });

    expect(check.warnings.map((warning) => warning.code)).toContain('wrong-slot-kind');
  });

  /**
   * The arithmetic Z3-11 put underneath all three checks. The first order
   * commits Labor that the second is measured against, so a team that could
   * afford either alone can afford only one.
   */
  it('prices an order against what the queue has already committed', () => {
    const thin = community({ ...projectTeamWorth(3) });

    expect(checkOrder(thin, WORKSHOP).blockers).toEqual([]);

    const ordered = withProjectOrdered(thin, WORKSHOP);

    expect(
      checkOrder(ordered, { ...WORKSHOP, slot: 'back-yard' }).blockers.map(
        (blocker) => blocker.code,
      ),
    ).toEqual(['not-enough-labor']);
  });
});

describe('orderedEvent and builtEvent', () => {
  /**
   * Six kinds for three verbs. A campaign's history reads "ordered a Workshop"
   * and then, a turn later, "built a Workshop" — and a single event reused for
   * both would have made one turn claim the same thing twice.
   */
  it('say ordered and built about the same project', () => {
    expect(orderedEvent(WORKSHOP)).toEqual({
      kind: 'facility-ordered',
      slot: 'front-yard',
      facility: 'workshop',
    });
    expect(builtEvent(WORKSHOP)).toEqual({
      kind: 'facility-built',
      slot: 'front-yard',
      facility: 'workshop',
    });
  });

  it('say both about an upgrade', () => {
    expect(orderedEvent(GAS_RANGE)).toEqual({
      kind: 'upgrade-ordered',
      slot: 'kitchen',
      upgrade: 'gas-range',
    });
    expect(builtEvent(GAS_RANGE)).toEqual({
      kind: 'upgrade-built',
      slot: 'kitchen',
      upgrade: 'gas-range',
    });
  });

  it('say both about a clearing', () => {
    expect(orderedEvent(COOP)).toEqual({
      kind: 'clearing-ordered',
      slot: 'ruined-chicken-coop',
    });
    expect(builtEvent(COOP)).toEqual({ kind: 'slot-cleared', slot: 'ruined-chicken-coop' });
  });

  it('never give two kinds of project the same event', () => {
    const kinds = [WORKSHOP, GAS_RANGE, COOP].flatMap((project) => [
      orderedEvent(project).kind,
      builtEvent(project).kind,
    ]);

    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
