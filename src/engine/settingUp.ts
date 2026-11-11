/**
 * Setting up a campaign picked up partway: its base and last turn's orders
 * (#210; `docs/continue-campaign.md`).
 *
 * While a campaign is set up, the base is placed as it stands rather than
 * built: a facility or an upgrade goes in free, dated the turn before, and a
 * mis-placed one comes out again. Last turn's orders go on the queue as
 * already paid, ordered the turn before, so this turn's Advancement finishes
 * them as it would any order. Everything a build or an order is checked for
 * still applies except what it costs: the Hardware and Labor were spent at
 * the table.
 *
 * No entries: these are the campaign as it stood, entered, as the sheet's own
 * edits are.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { UpgradeId } from '../data/facilities';
import type { FacilityId } from '../data/facilities';
import { checkBuild } from './build';
import type { Campaign, ProjectOrder, SlotState } from './campaign';
import { settingUp } from './continued';
import { accepted, blockedBy, refused, type FormResult } from './forms';
import { checkOrder } from './orders';
import { checkUpgrade } from './upgrade';

/** What a build or an order costs, which setting up has paid already. */
const COSTS: readonly string[] = ['not-enough-hardware', 'not-enough-labor'];

/** A check without its costs. */
function withoutCosts<C extends { readonly blockers: readonly { readonly code: string }[] }>(
  check: C,
): C {
  return { ...check, blockers: check.blockers.filter((one) => !COSTS.includes(one.code)) };
}

/** The campaign with one slot changed. Assumes a base. */
function withSlot(
  campaign: Campaign,
  slot: string,
  change: (state: SlotState) => SlotState,
): Campaign {
  const base = campaign.base as NonNullable<Campaign['base']>;

  return {
    ...campaign,
    base: { ...base, slots: { ...base.slots, [slot]: change(base.slots[slot] ?? {}) } },
  };
}

const NOT_SETTING_UP =
  'The base is placed like this only while a campaign picked up partway is set up.';

/**
 * Place a facility in a slot while setting up, free and built the turn
 * before (#210). A slot that needed clearing was cleared to build it.
 */
export function submitFacilityPlaced(
  campaign: Campaign,
  slot: string,
  facility: FacilityId,
): FormResult {
  if (!settingUp(campaign)) return refused(NOT_SETTING_UP);

  const check = withoutCosts(checkBuild(campaign, { slot, facility }));
  const cleared = {
    ...check,
    blockers: check.blockers.filter((one) => one.code !== 'slot-not-cleared'),
  };
  const problem = blockedBy(cleared);
  if (problem !== null) return refused(problem);

  return accepted(
    withSlot(campaign, slot, (state) => ({
      ...state,
      cleared: true,
      built: { facility, builtOnTurn: campaign.turn - 1 },
    })),
  );
}

/** Put an upgrade on a slot's facility while setting up, free (#210). */
export function submitUpgradePlaced(
  campaign: Campaign,
  slot: string,
  upgrade: UpgradeId,
): FormResult {
  if (!settingUp(campaign)) return refused(NOT_SETTING_UP);

  const problem = blockedBy(withoutCosts(checkUpgrade(campaign, { slot, upgrade })));
  if (problem !== null) return refused(problem);

  return accepted(
    withSlot(campaign, slot, (state) => ({
      ...state,
      upgrades: [...(state.upgrades ?? []), upgrade],
    })),
  );
}

/**
 * Take what was placed in a slot out again while setting up (#210): its
 * facility and upgrades, and its clearing. A built-in the base ships with is
 * the layout's and stays.
 */
export function submitSlotEmptied(campaign: Campaign, slot: string): FormResult {
  if (!settingUp(campaign)) return refused(NOT_SETTING_UP);
  if (campaign.base?.slots[slot] === undefined) return refused('Nothing is placed in that slot.');

  const base = campaign.base;
  const kept = Object.fromEntries(Object.entries(base.slots).filter(([id]) => id !== slot));

  return accepted({ ...campaign, base: { ...base, slots: kept } });
}

/**
 * Put one of last turn's orders on the queue while setting up, already paid
 * and ordered the turn before, so this turn's Advancement finishes it (#210).
 */
export function submitOrderCarried(campaign: Campaign, project: ProjectOrder): FormResult {
  if (!settingUp(campaign)) {
    return refused(
      'Last turn’s orders are entered only while a campaign picked up partway is set up.',
    );
  }

  // Quoted rather than placed, so the Planning Phase's own rule (R14) asks
  // nothing of an order already placed at the table.
  const problem = blockedBy(withoutCosts(checkOrder(campaign, project, { labor: Infinity })));
  if (problem !== null) return refused(problem);

  return accepted({
    ...campaign,
    projects: [
      ...campaign.projects,
      { ...project, orderedOnTurn: campaign.turn - 1, charged: { hardware: 0, labor: 0 } },
    ],
  });
}
