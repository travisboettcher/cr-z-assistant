/**
 * A project in a queue, for a test that is not about what it cost.
 *
 * From v12 every queued project carries the charge it was placed at, because a
 * refund is that number read back rather than a price computed again (#165).
 * Most tests that put a project in a queue are asking something else entirely —
 * whether a validator sees it, whether the Advancement Phase lands it, whether
 * a second order into the same slot is refused — and a cost literal in those
 * reads as though the assertion depended on it.
 *
 * So this says "queued, at a price nothing here looks at" once. A test that
 * *is* about the charge writes the number out, which is then the only number
 * in the file and obviously the subject.
 */

import type { Cost } from '../data/facilities';
import type { PlacedOrder, Project } from '../engine/campaign';

const UNPRICED: Cost = { hardware: 0, labor: 0 };

export function queued(order: PlacedOrder, charged: Cost = UNPRICED): Project {
  return { ...order, charged };
}
