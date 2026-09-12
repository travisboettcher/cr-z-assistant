/**
 * Check Storage — the fifth step of the Management Phase (pg. 23).
 *
 * Material counts above the base's cap are lost down to it. Phase 2 computed
 * the caps and deliberately refused nothing — a build that would overflow the
 * stores was allowed, and the base sheet said "Over the cap" rather than
 * preventing it. This is the step that was waiting: the loss happens here, a
 * whole phase after the materials arrived, which is why Z3-7 reports an
 * overflowing haul and stores all of it anyway.
 *
 * **Rare has no cap** (pg. 54), so it is never trimmed. `STORED_MATERIALS` is
 * narrower than `MATERIALS` for exactly this reason and doing the arithmetic
 * over the wrong one would invent a limit the book does not have.
 *
 * A community with no base has nowhere to overflow: no base, no caps, nothing
 * lost. That reads as generous and is the only coherent answer — the caps are
 * a property of the base, and there is not one.
 *
 * Pure, like the rest of `src/engine`.
 */

import { STORED_MATERIALS, type StoredMaterial } from '../data/materials';
import { storageCaps } from './base';
import type { Campaign } from './campaign';

/** How much of each capped material is above the cap, and would be lost. */
export function overCap(campaign: Campaign): Record<StoredMaterial, number> {
  const base = campaign.base;
  const spilled: Record<StoredMaterial, number> = { hardware: 0, food: 0, fuel: 0 };

  if (base === null) return spilled;

  const caps = storageCaps(base);

  for (const material of STORED_MATERIALS) {
    spilled[material] = Math.max(0, campaign.materials[material] - caps[material]);
  }

  return spilled;
}

/** Whether anything at all would be lost, which is what the step turns on. */
export function anythingOverCap(campaign: Campaign): boolean {
  const spilled = overCap(campaign);

  return STORED_MATERIALS.some((material) => spilled[material] > 0);
}

/** Whether this turn's Check Storage has already run. */
export function storageChecked(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'storage-checked',
  );
}

/**
 * The campaign with every capped material brought down to its cap.
 *
 * Down to the cap and no further, which is the whole rule: a store two over is
 * left holding exactly its cap rather than being emptied.
 */
export function withStorageChecked(campaign: Campaign): Campaign {
  const spilled = overCap(campaign);
  const materials = { ...campaign.materials };

  for (const material of STORED_MATERIALS) {
    materials[material] -= spilled[material];
  }

  return { ...campaign, materials };
}
