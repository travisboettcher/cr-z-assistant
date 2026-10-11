import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type ProjectOrder } from './campaign';
import { withProjectCancelled, withProjectOrdered } from './projects';

/** See `roundTrip.property.test.ts` for why the seed is fixed rather than random. */
const RUNS = { seed: 20260920, numRuns: 500 } as const;

/**
 * A Hobby Farm with a Garden built into the front yard, which is the shape the
 * Greenhouse discount needs: an upgrade whose price depends on what else is on
 * order for the same slot (pp. 72–73).
 */
const farm = (): Campaign => ({
  ...createNewCampaign('Cedar Hollow', {
    id: '11111111-2222-3333-4444-555555555555',
    createdAt: '2026-09-20T00:00:00.000Z',
  }),
  turn: 3,
  materials: { food: 0, fuel: 0, hardware: 20, rare: 0 },
  base: {
    id: 'hobby-farm',
    slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } },
  },
});

/**
 * Orders whose prices move under each other, which is what the property is
 * about. The Fence and the Greenhouse are the pair from #165 — a queued Fence
 * discounts a Greenhouse ordered behind it — and the other three are ordinary
 * flat-priced orders mixed in so the sequences are not all one slot.
 */
const ORDERS: readonly ProjectOrder[] = [
  { kind: 'upgrade', slot: 'front-yard', upgrade: 'fence' },
  { kind: 'upgrade', slot: 'front-yard', upgrade: 'greenhouse' },
  { kind: 'upgrade', slot: 'front-yard', upgrade: 'herb-plot' },
  { kind: 'facility', slot: 'back-yard', facility: 'watchtower' },
  { kind: 'clearing', slot: 'ruined-chicken-coop' },
];

type Step = { readonly order: number } | { readonly cancel: number };

const stepArbitrary = fc.oneof(
  fc.record({ order: fc.integer({ min: 0, max: ORDERS.length - 1 }) }),
  fc.record({ cancel: fc.integer({ min: 0, max: 99 }) }),
);

/**
 * Applies one step, ignoring legality.
 *
 * Deliberately below `checkOrder`: the claim is about the arithmetic of
 * charging and refunding, and it has to hold for the queues Z1-7's override can
 * produce as much as for the legal ones. Nothing here can spend Hardware the
 * community does not have either, which is a check `project/ordered` makes and
 * this property does not need.
 */
function apply(campaign: Campaign, step: Step): Campaign {
  if ('order' in step) {
    return withProjectOrdered(campaign, {
      ...(ORDERS[step.order] as ProjectOrder),
      orderedOnTurn: campaign.turn,
    });
  }

  return campaign.projects.length === 0
    ? campaign
    : withProjectCancelled(campaign, step.cancel % campaign.projects.length);
}

/** Cancels what is left, oldest first, until the queue is empty. */
function drained(campaign: Campaign): Campaign {
  let working = campaign;

  while (working.projects.length > 0) {
    working = withProjectCancelled(working, 0);
  }

  return working;
}

/**
 * #165's acceptance, as a claim rather than an example.
 *
 * `orders.test.ts` covers "is one already queued" for all three verbs and the
 * Labor pricing, and nothing in it asserted anything across a *queue mutation*
 * — which is exactly where the bug lived. A sequence of orders and
 * cancellations is the one thing that moves a queued project's index, and its
 * price moved with it.
 */
describe('ordering and cancelling', () => {
  it('leaves the stores exactly as it found them once the queue is empty', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { maxLength: 12 }), (steps) => {
        const start = farm();
        const end = drained(steps.reduce(apply, start));

        expect(end.projects).toEqual([]);
        expect(end.materials).toEqual(start.materials);
      }),
      RUNS,
    );
  });

  /**
   * The same claim one step in: a project's refund is the number it was
   * charged, whatever the queue did afterwards. Stated over `charged` directly
   * because that is the fact the refund reads, and a test that only checked the
   * totals could be satisfied by two errors cancelling out.
   */
  it('refunds each order the number it was charged', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { maxLength: 12 }), (steps) => {
        const queue = steps.reduce(apply, farm());

        for (const [at, project] of queue.projects.entries()) {
          const after = withProjectCancelled(queue, at);

          expect(after.materials.hardware - queue.materials.hardware).toBe(
            project.charged.hardware,
          );
        }
      }),
      RUNS,
    );
  });
});
