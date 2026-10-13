/**
 * Rebuilding an overrun base without spending resources (pg. 86; R29; #182,
 * Z4-10).
 *
 * A community that reclaims the base its Siege Defense overran — the same type,
 * on the same map — finds every facility and upgrade it had added destroyed,
 * and may build each again without spending resources. Labor and the turn the
 * work takes are unchanged, and nothing sets a deadline (R29).
 *
 * **A property of the slot, not a credit.** The same type means the same slot
 * ids, so the move that follows such a claim records what stood in each slot
 * (`base-moved`'s `rebuild`), and ordering that facility or upgrade into that
 * slot again costs no Hardware until it has been built once. Read off the log,
 * like everything else that happened.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { Campaign, ProjectOrder } from './campaign';
import type { CampaignEvent, RebuildSlot } from './log';

/**
 * One facility or upgrade in one slot, as a single comparable value, so an
 * order, a finished build and what the overrun destroyed are compared alike.
 * `null` for anything else, which nothing can rebuild.
 *
 * The `null`s here, and the guards on an absent facility below, are for the
 * typechecker as much as the rule: a key that is not one of a destroyed
 * slot's keys matches nothing either way, so a mutation run that removes one
 * finds nothing changed. That is expected, not a gap in the tests.
 */
function keyOf(order: ProjectOrder): string | null {
  switch (order.kind) {
    case 'facility':
      return `facility:${order.slot}:${order.facility}`;
    case 'upgrade':
      return `upgrade:${order.slot}:${order.upgrade}`;
    default:
      return null;
  }
}

/** The key of what a finished build put up, or `null` for any other entry. */
function builtKey(event: CampaignEvent): string | null {
  switch (event.kind) {
    case 'facility-built':
      return keyOf({ kind: 'facility', slot: event.slot, facility: event.facility });
    case 'upgrade-built':
      return keyOf({ kind: 'upgrade', slot: event.slot, upgrade: event.upgrade });
    default:
      return null;
  }
}

/** Every facility and upgrade one destroyed slot may put back. */
function keysOf(slot: RebuildSlot): readonly string[] {
  return [
    ...(slot.facility === undefined ? [] : [`facility:${slot.slot}:${slot.facility}`]),
    ...slot.upgrades.map((upgrade) => `upgrade:${slot.slot}:${upgrade}`),
  ];
}

/**
 * What the latest move left free to rebuild, and where in the log it was — or
 * nothing, when the latest move was not an overrun reclaim, or there was none.
 */
function reclaim(
  campaign: Campaign,
): { readonly rebuild: readonly RebuildSlot[]; readonly at: number } | undefined {
  let found: { readonly rebuild: readonly RebuildSlot[]; readonly at: number } | undefined;

  campaign.log.forEach(({ event }, at) => {
    if (event.kind === 'base-moved') {
      found = event.rebuild === undefined ? undefined : { rebuild: event.rebuild, at };
    }
  });

  return found;
}

/**
 * Whether this order is a free rebuild: something the overrun destroyed in
 * this very slot, not built again since the move, and not already on order —
 * the order that is takes the free rebuild, and a second would pay (pg. 86;
 * R29).
 */
export function freeRebuild(campaign: Campaign, order: ProjectOrder): boolean {
  const key = keyOf(order);
  const found = reclaim(campaign);
  if (key === null || found === undefined) return false;

  return (
    found.rebuild.some((slot) => keysOf(slot).includes(key)) &&
    !campaign.log.slice(found.at + 1).some((entry) => builtKey(entry.event) === key) &&
    !campaign.projects.some((queued) => keyOf(queued) === key)
  );
}

/** Every free rebuild still open, slot by slot, for the screens to name. */
export function rebuildsOpen(campaign: Campaign): readonly RebuildSlot[] {
  return (reclaim(campaign)?.rebuild ?? []).flatMap((slot) => {
    const facility = slot.facility;
    const upgrades = slot.upgrades.filter((upgrade) =>
      freeRebuild(campaign, { kind: 'upgrade', slot: slot.slot, upgrade }),
    );
    const open =
      facility !== undefined &&
      freeRebuild(campaign, { kind: 'facility', slot: slot.slot, facility });

    return open || upgrades.length > 0
      ? [{ slot: slot.slot, ...(open ? { facility } : {}), upgrades }]
      : [];
  });
}
