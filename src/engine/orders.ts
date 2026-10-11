/**
 * Ordering a project, and what the campaign's history says about it.
 *
 * A thin module on purpose. `projects.ts` owns the queue — what is in it, what
 * it costs, when it is due — and the three Phase 2 modules still own what may
 * go in a slot. This is where the two meet, and it is separate from both
 * because `build.ts` reads `laborAvailable` from `projects.ts`: putting the
 * three checks back into `projects.ts` would close that into a cycle.
 *
 * ## Six event kinds for three verbs, and why
 *
 * A project is ordered on one turn and finished on the next, and both are
 * things that happened. A campaign's history reads "ordered a Workshop for the
 * Garage" and then, a turn later, "built a Workshop in the Garage" — which is
 * what a player did. Three events reused for both would have made a turn's
 * history claim the same thing twice.
 *
 * Pure, like the rest of `src/engine`.
 */

import { buildableFacilities, checkBuild } from './build';
import { checkClearing } from './clearing';
import { checkUpgrade, upgradesFor } from './upgrade';
import { layoutOf } from './base';
import type { Campaign, PlacedOrder, Project, ProjectOrder } from './campaign';
import { orderable, type Pricing } from './projects';
import type { Check } from './checks';
import type { CampaignEvent } from './log';
import { suppliedOccupants } from './utilities';

/**
 * Everything wrong with ordering this project.
 *
 * One question with three answers, delegated to the three modules that have
 * always known them. What Z3-11 changed is underneath: all three now price
 * against `laborAvailable` rather than the raw pool, so a second order in one
 * turn is measured by what the first one left.
 *
 * The codes are widened to `string` here, because the three verbs became one
 * and a caller rendering a refusal does not care which of the three closed sets
 * it came from. Each module keeps its own union, which is what stops a build
 * violation being returned from an upgrade check.
 *
 * ## Two questions, and `pricing` picks one (#188)
 *
 * Unpriced, this is the question the reducer asks before `project/ordered`
 * lands: **may this be placed now?** Two parts of that answer are about *now*
 * rather than about the order — R14's phase, and whose Labor pays, which is
 * nobody's until this turn's Planning Phase has begun (`laborThisTurn`).
 *
 * Priced, it is a quote: **what is wrong with this order against a team worth
 * this much Labor?** Both *now* parts give way. The pool is the caller's, and
 * R14 is not asked, because R14 is about when an order is placed and a caller
 * that has named its own pool is not placing anything — it is asking, during
 * the Advancement Phase, what the Planning Phase to come could afford, and
 * every answer to that would otherwise be "not in this phase". Everything else
 * is still asked of the campaign as it stands: the Hardware in the stores, the
 * slot, the queue, and the Labor the queue has committed this turn.
 *
 * **Placing an order is exactly as strict as it was.** The reducer calls this
 * without `pricing`, and must: a dispatch carries an order and nothing else,
 * so there is no pool on it to pass. The screens ask unpriced too, and
 * `SlotAction` asks `orderable` again on its own account. The cost of the
 * split is that a priced check coming back clean is not permission — only the
 * unpriced one is that, which is what it has always been.
 *
 * Takes a `ProjectOrder` rather than a `PlacedOrder`: none of the three checks
 * reads `orderedOnTurn` — an order is placed on whatever turn is current, and
 * it is the reducer that stamps it — so a menu of orders not yet placed can be
 * put to it without inventing one. A `PlacedOrder` still is one.
 */
export function checkOrder(
  campaign: Campaign,
  project: ProjectOrder,
  pricing?: Pricing,
): Check<string> {
  // R14, ahead of the three: an order placed outside the Planning Phase is one
  // nothing can take back, so this refuses rather than warning. A blocker is
  // not overridable — `permitted` unlocks warnings only — which is what makes
  // it the right shape for a rule whose whole point is that the state it
  // produces has no way out (#171). Not asked of a quote; see above.
  if (pricing === undefined && !orderable(campaign)) {
    return {
      blockers: [
        {
          code: 'outside-the-planning-phase',
          message: 'Projects are ordered in the Planning Phase.',
          pages: 20,
        },
      ],
      warnings: [],
    };
  }

  if (project.kind === 'facility') {
    return checkBuild(campaign, { slot: project.slot, facility: project.facility }, pricing);
  }

  if (project.kind === 'upgrade') {
    return checkUpgrade(campaign, { slot: project.slot, upgrade: project.upgrade }, pricing);
  }

  return checkClearing(campaign, { slot: project.slot }, pricing);
}

/** One order this base could place, and everything wrong with placing it. */
export interface OrderOption {
  readonly order: ProjectOrder;
  readonly check: Check<string>;
}

/**
 * Every order this base could place, each put to `checkOrder` (#188).
 *
 * The walk the slot map has always done, in the engine where anything can ask
 * it. A card in `BaseSlotMap` reads its slot's state and offers one verb's
 * picker: an occupied slot offers `upgradesFor` it (`UpgradeFacility`), an
 * empty or cleared one offers `buildableFacilities` (`BuildFacility`), and
 * rubble offers to clear it (`ClearSlot`). These are the same three branches,
 * in the same order, over `layoutOf` — so "what could this base build?" is one
 * call rather than a fourth copy of the walk.
 *
 * **Refused orders are listed, not dropped.** The check is the answer, and a
 * menu that left out a Workshop because the stores are short would hide the
 * one sentence the player needs. What is *not* listed is what no screen offers
 * either: an origin's facilities in a campaign not running it, which
 * `buildableFacilities` has always filtered, and an upgrade the facility
 * standing in the slot does not have.
 *
 * In layout order, then catalogue order within a slot, which is the order the
 * cards and their pickers show them in. Each upgrade the facility offers once,
 * including those already installed, because repeats are legal and count
 * separately against the cap — the check is what says when one is too many.
 *
 * Occupancy is read from `suppliedOccupants`, the list the slot map reads: the
 * lint rule keeps the raw one away from here, and which slots hold something is
 * the same answer either way — supply resolves a slot's Power and Water, never
 * whether a facility stands in it.
 *
 * `pricing` is `checkOrder`'s, passed to every option. Unpriced and outside the
 * Planning Phase, every option carries R14's refusal and nothing else: the list
 * is still the list, and the phase is what refuses it.
 *
 * **The screens are left reading their own pickers.** Each asks about one slot
 * and one choice at a time, and needs the catalogue entry to label it —
 * filtering the whole base's list back down to that would be a longer road to
 * the same `checkBuild` or `checkUpgrade` call.
 */
export function orderOptions(campaign: Campaign, pricing?: Pricing): readonly OrderOption[] {
  const base = campaign.base;
  if (base === null) return [];

  const standing = suppliedOccupants(campaign);

  return layoutOf(base)
    .flatMap((slot): readonly ProjectOrder[] => {
      if (standing.some((occupant) => occupant.slotId === slot.id)) {
        return upgradesFor(campaign, slot.id).map((upgrade) => ({
          kind: 'upgrade',
          slot: slot.id,
          upgrade: upgrade.id,
        }));
      }

      // A cleared slot is an ordinary empty slot of its kind, which is what the
      // slot card's `buildable` says too.
      if (slot.state === 'empty' || base.slots[slot.id]?.cleared === true) {
        return buildableFacilities(campaign).map((facility) => ({
          kind: 'facility',
          slot: slot.id,
          facility: facility.id,
        }));
      }

      if (slot.state === 'clearing-project') return [{ kind: 'clearing', slot: slot.id }];

      // A built-in slot with nothing standing in it, which no shipped base has:
      // the slot card offers it nothing, and neither does this.
      return [];
    })
    .map((order) => ({ order, check: checkOrder(campaign, order, pricing) }));
}

/** What the log says when a project is ordered (pg. 20). */
export function orderedEvent(project: PlacedOrder): CampaignEvent {
  if (project.kind === 'facility') {
    return { kind: 'facility-ordered', slot: project.slot, facility: project.facility };
  }

  if (project.kind === 'upgrade') {
    return { kind: 'upgrade-ordered', slot: project.slot, upgrade: project.upgrade };
  }

  return { kind: 'clearing-ordered', slot: project.slot };
}

/** What the log says when it is finished, a turn later (pg. 19). */
export function builtEvent(project: Project): CampaignEvent {
  if (project.kind === 'facility') {
    return { kind: 'facility-built', slot: project.slot, facility: project.facility };
  }

  if (project.kind === 'upgrade') {
    return { kind: 'upgrade-built', slot: project.slot, upgrade: project.upgrade };
  }

  return { kind: 'slot-cleared', slot: project.slot };
}

/**
 * What a project was, for the two entries that record it leaving the queue
 * without being built — `project-cancelled` and `project-unfinished`.
 *
 * Spread rather than returned as a field, because `exactOptionalPropertyTypes`
 * makes an explicit `built: undefined` a different thing from an absent one —
 * and absent is what a clearing writes, having nothing to name. One id for
 * either kind, the way `materials-converted` names its `source`.
 *
 * Here beside `orderedEvent` and `builtEvent` rather than private to the
 * reducer, where it started: it is the third thing the log says about a
 * project, and anything that writes either entry needs it (#188).
 */
export function builtOf(project: Project): { readonly built?: string } {
  if (project.kind === 'facility') return { built: project.facility };
  if (project.kind === 'upgrade') return { built: project.upgrade };

  return {};
}
