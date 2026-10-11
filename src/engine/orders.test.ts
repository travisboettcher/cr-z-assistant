import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Project } from './campaign';
import { builtEvent, checkOrder, orderedEvent } from './orders';
import { permitted } from './checks';
import type { TurnStepId } from '../data/turn';
import { cancellable, orderable, withProjectOrdered } from './projects';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { queued } from '../test/queued';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function community(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    // In the phase orders are placed in, which R14 confines them to: every
    // question below this one is about what else is wrong with an order, and a
    // campaign standing anywhere else answers only the phase (#171).
    step: 'assign-project-team',
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
  charged: { hardware: 3, labor: 2 },
};
const GAS_RANGE: Project = {
  kind: 'upgrade',
  slot: 'kitchen',
  upgrade: 'gas-range',
  orderedOnTurn: 3,
  charged: { hardware: 2, labor: 1 },
};
const COOP: Project = {
  kind: 'clearing',
  slot: 'ruined-chicken-coop',
  orderedOnTurn: 3,
  charged: { hardware: 0, labor: 2 },
};

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
   * **Contract 2 of #138**, and the regression test for all four of R2-H2's
   * symptoms at once: every verb consults the queue, not only installed state.
   *
   * Written as a `Record` over `Project['kind']` on purpose. A fourth verb
   * added to the union does not quietly inherit the old bug — it fails to
   * compile until somebody says what a second order of it looks like and what
   * refusing one says. That is the only part of this a comment could not do,
   * and a comment is what the contract was for two phases.
   *
   * The two destructive ones are blockers; the two the base can hold in a
   * shape the book merely disallows are warnings, which is how this app has
   * always split the two — a facility ordered twice into one slot destroys
   * Hardware, and a fourth upgrade is a rule a table may play past.
   */
  it.each(
    Object.entries({
      facility: {
        campaign: community(),
        project: WORKSHOP,
        code: 'facility-on-order',
        refusal: 'blockers',
      },
      // The Fence is one of the two upgrades the catalogue caps per facility,
      // so a second one is a repeat the rules have an opinion about.
      upgrade: {
        campaign: community({
          base: {
            id: 'hobby-farm',
            slots: { 'back-yard': { built: { facility: 'garden', builtOnTurn: 1 } } },
          },
        }),
        project: queued({ kind: 'upgrade', slot: 'back-yard', upgrade: 'fence', orderedOnTurn: 3 }),
        code: 'one-per-facility',
        refusal: 'warnings',
      },
      clearing: {
        campaign: community(),
        project: COOP,
        code: 'clearing-on-order',
        refusal: 'blockers',
      },
    } satisfies Record<
      Project['kind'],
      {
        campaign: Campaign;
        project: Project;
        code: string;
        refusal: 'blockers' | 'warnings';
      }
    >),
  )('says something about a second %s ordered for the same slot', (_kind, expected) => {
    const first = checkOrder(expected.campaign, expected.project);

    expect(first.blockers).toEqual([]);
    expect(first.warnings).toEqual([]);

    const again = checkOrder(
      withProjectOrdered(expected.campaign, expected.project),
      expected.project,
    );

    expect(again[expected.refusal].map((violation) => violation.code)).toContain(expected.code);
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

/**
 * **#171, and R14.** `cancellable` was guarded to the phase that placed the
 * order and `project/ordered` was not, so an order could be placed where it
 * could never be withdrawn: the slot card read "Cancelled in the Planning Phase
 * that ordered it" with no Planning Phase left this turn, and next turn's
 * refused it on `orderedOnTurn`.
 *
 * The guard and its inverse are one decision, so the pairing is asserted in
 * both directions rather than each half on its own.
 */
describe('when an order may be placed', () => {
  const PLANNING: readonly TurnStepId[] = [
    'assign-facility-staff',
    'assign-project-team',
    'assign-rest-and-healing',
    'assign-mission-team',
  ];

  const ELSEWHERE: readonly TurnStepId[] = [
    'select-mission',
    'tactical-mission',
    'character-advancement',
    'add-facilities-and-upgrades',
    'check-for-rot',
    'feed-your-survivors',
    'departures',
  ];

  it.each(PLANNING)('is permitted at %s, which is a Planning step', (step) => {
    expect(orderable(community({ step }))).toBe(true);
    expect(checkOrder(community({ step }), WORKSHOP).blockers).toEqual([]);
  });

  it.each(ELSEWHERE)('is refused at %s, which is not', (step) => {
    expect(orderable(community({ step }))).toBe(false);
    expect(checkOrder(community({ step }), WORKSHOP).blockers.map((one) => one.code)).toEqual([
      'outside-the-planning-phase',
    ]);
  });

  /**
   * A blocker rather than a warning, which is the whole point: `permitted`
   * unlocks warnings only, so Z1-7's override cannot wave this one through into
   * a state with no way out.
   */
  it('refuses rather than warning, so no override reaches it', () => {
    const late = community({ step: 'check-storage' });

    expect(checkOrder(late, WORKSHOP).warnings).toEqual([]);
    expect(permitted(checkOrder(late, WORKSHOP), true)).toBe(false);
  });

  /**
   * The pairing, in both directions and on the same campaign: every step that
   * may place an order may take it back, and no step may do one without the
   * other. That is what makes it one decision rather than two guards that
   * happen to agree today.
   */
  it.each([...PLANNING, ...ELSEWHERE])('may cancel at %s exactly where it may order', (step) => {
    const one = withProjectOrdered(community({ step: 'assign-project-team' }), WORKSHOP);
    const standing = { ...one, step };

    expect(cancellable(standing, 0)).toBe(orderable(standing));
  });
});
