/**
 * The project queue — ordered in the Planning Phase, finished in the next
 * Advancement Phase (pp. 20, 19).
 *
 * ## What building *is*, changed
 *
 * Phase 2 shipped building as something that happened the instant the button
 * was pressed, because no phase existed to order it in. It does now, and the
 * rule is the one that makes a turn's Labor a decision rather than a formality:
 * you order this turn, you get it next turn, and whatever Labor you did not
 * spend is gone (pg. 20).
 *
 * So the three verbs Phase 2 put on a slot card — build, upgrade, clear — are
 * one verb here. They differ in what they cost and what they leave behind, not
 * in when they happen.
 *
 * ## `orderedOnTurn` is why nothing else is stored
 *
 * It answers both questions the rule asks. **Which turn's Labor paid for this**,
 * so what is left to spend is arithmetic over the queue rather than a running
 * total somebody has to remember to decrement — and a total like that would be
 * a derived value on the persisted shape, which this repo does not do. And
 * **when the project is due**: the Advancement Phase of any turn after the one
 * it was ordered in.
 *
 * ## Hardware is spent on ordering; Labor is merely counted
 *
 * Hardware is a material and leaves the stores when the order is placed (pg.
 * 20), so a community cannot queue five Workshops on one Workshop's worth of
 * it. Labor is not a material and has nowhere to leave from — it is a property
 * of who is on the project team this turn — so it is *checked* against what the
 * queue has already committed rather than deducted from anything.
 *
 * That difference is also what makes cancelling straightforward: the Hardware
 * comes back, and the Labor was never gone.
 *
 * Pure, like the rest of `src/engine`.
 */

import { FACILITIES, type Facility, type Upgrade } from '../data/facilities';
import { laborPool } from './assignments';
import { clearingProject, occupantAt } from './base';
import type { Campaign, Project } from './campaign';

/** What one project costs, whichever of the three kinds it is. */
export function projectCost(
  campaign: Campaign,
  project: Project,
): { readonly hardware: number; readonly labor: number } {
  if (project.kind === 'facility') {
    return (FACILITIES[project.facility] as Facility).cost;
  }

  if (project.kind === 'upgrade') {
    const upgrade = upgradeIn(campaign, project.slot, project.upgrade);

    // Nothing, for an upgrade of a facility that is no longer there. A queue is
    // a record of what was ordered and the base can change under it — Z1-7's
    // override lets a player clear a slot with an upgrade queued for it — and
    // charging for an upgrade that cannot happen would be worse than charging
    // nothing.
    return upgrade?.cost ?? NOTHING;
  }

  const clearing = clearingProject(campaign, project.slot);

  return { hardware: 0, labor: clearing?.labor ?? 0 };
}

const NOTHING = { hardware: 0, labor: 0 } as const;

function upgradeIn(campaign: Campaign, slot: string, id: string): Upgrade | undefined {
  return occupantAt(campaign, slot)?.facility.upgrades.find((candidate) => candidate.id === id);
}

/** One queued project and where it sits, which is how it is cancelled. */
export interface QueuedProject {
  readonly at: number;
  readonly project: Project;
}

/**
 * Everything queued for one slot, in the order it was ordered in, each carrying
 * its position in the whole queue.
 *
 * The position rather than the project alone, because a screen showing a slot's
 * orders is the screen that cancels them and `withProjectCancelled` cancels by
 * position — and a position within the slot's own list is not that number.
 */
export function queuedFor(campaign: Campaign, slot: string): readonly QueuedProject[] {
  return campaign.projects
    .map((project, at) => ({ at, project }))
    .filter((queued) => queued.project.slot === slot);
}

/**
 * The Labor this turn's orders have already committed (pg. 20).
 *
 * Only *this* turn's: last turn's projects were paid for by last turn's project
 * team, and they are still in the queue until the Advancement Phase finishes
 * them.
 */
export function laborCommitted(campaign: Campaign): number {
  return campaign.projects
    .filter((project) => project.orderedOnTurn === campaign.turn)
    .reduce((total, project) => total + projectCost(campaign, project).labor, 0);
}

/**
 * The Labor still available to order with.
 *
 * What the project team generates, less what this turn has already committed.
 * Can go negative where a save was hand-edited or a survivor left the team
 * after an order — which is a state to report rather than to hide.
 */
export function laborAvailable(campaign: Campaign): number {
  return laborPool(campaign) - laborCommitted(campaign);
}

/** Whether this project is finished at the start of this turn's Advancement Phase. */
export function isDue(campaign: Campaign, project: Project): boolean {
  return project.orderedOnTurn < campaign.turn;
}

/** Everything the Advancement Phase is about to finish (pg. 19). */
export function dueProjects(campaign: Campaign): readonly Project[] {
  return campaign.projects.filter((project) => isDue(campaign, project));
}

/**
 * No "already completed" guard, unlike every other destructive step in this
 * phase — and none is needed. `completeProjects` takes what it finished off
 * the queue, so a second press has nothing due and changes nothing. The guard
 * the other steps need exists because they spend a resource that is still
 * there to spend again; this one consumes the only thing it reads.
 */

/**
 * The campaign with a project ordered: Hardware spent, queue appended.
 *
 * Appended rather than inserted, because the queue is ordered and an order
 * placed second was placed second.
 */
export function withProjectOrdered(campaign: Campaign, project: Project): Campaign {
  const cost = projectCost(campaign, project);

  return {
    ...campaign,
    materials: { ...campaign.materials, hardware: campaign.materials.hardware - cost.hardware },
    projects: [...campaign.projects, project],
  };
}

/**
 * The campaign with one queued project cancelled and its Hardware returned.
 *
 * **The Hardware comes back**, which the book does not say either way and this
 * app rules on: an order is a decision made on a screen within a phase, and a
 * decision a player cannot take back is a trap rather than a rule. Labor needs
 * no refund because it was never spent — `laborCommitted` simply stops counting
 * a project that is no longer in the queue.
 *
 * Cancels by position rather than by value: two identical Gas Ranges ordered
 * for the same Kitchen in one turn are two orders, and cancelling "the Gas
 * Range" would have to pick one anyway.
 */
export function withProjectCancelled(campaign: Campaign, at: number): Campaign {
  const project = campaign.projects[at];
  if (project === undefined) return campaign;

  const cost = projectCost(campaign, project);

  return {
    ...campaign,
    materials: { ...campaign.materials, hardware: campaign.materials.hardware + cost.hardware },
    projects: campaign.projects.filter((_, index) => index !== at),
  };
}

/**
 * Everything the Advancement Phase finishes, and the campaign it leaves behind
 * (pg. 19).
 *
 * The three kinds land in three different places on the base, and none of them
 * costs anything here: the Hardware went when the order was placed and the
 * Labor was spent by a project team that has since been reassigned.
 *
 * A clearing project's yield arrives here rather than at ordering, which is the
 * one place the timing visibly matters: the rubble is not cleared until the
 * work is done, so the materials in it are not in the stores until then.
 *
 * Projects that are due but can no longer happen — a facility ordered into a
 * slot something else now occupies — are dropped rather than applied. The queue
 * is a record of what was ordered, not a promise the base will still have room.
 *
 * Returns the pair rather than just the campaign, which is why it is not named
 * `with…`: the caller writing the history has to know which projects were
 * dropped, or a log would claim a Workshop was built into a slot that turned it
 * away. Nothing about *which* were dropped can be recovered afterwards — the
 * queue is empty of due projects either way — and re-deriving it would mean
 * running the same slot-by-slot walk twice.
 */
export function completeProjects(campaign: Campaign): {
  readonly campaign: Campaign;
  readonly completed: readonly Project[];
} {
  const base = campaign.base;
  if (base === null) return { campaign, completed: [] };

  let slots = base.slots;
  let materials = campaign.materials;
  const completed: Project[] = [];

  for (const project of dueProjects(campaign)) {
    const state = slots[project.slot] ?? {};
    const occupied =
      occupantAt({ ...campaign, base: { ...base, slots } }, project.slot) !== undefined;

    if (project.kind === 'facility') {
      if (occupied) continue;

      slots = {
        ...slots,
        [project.slot]: {
          ...state,
          built: { facility: project.facility, builtOnTurn: campaign.turn },
        },
      };
    } else if (project.kind === 'upgrade') {
      if (!occupied) continue;

      slots = {
        ...slots,
        [project.slot]: { ...state, upgrades: [...(state.upgrades ?? []), project.upgrade] },
      };
    } else {
      const clearing = clearingProject(campaign, project.slot);
      if (clearing === undefined) continue;

      materials = { ...materials };
      // `yields` is optional on the type and present on all three projects the
      // roster has, so the guard is unexercised by data rather than
      // unnecessary: a project that gives nothing back is a shape the book
      // allows. A mutant that drops the `?.` survives for that reason, exactly
      // as it did in `withSlotCleared` before this replaced it.
      for (const [material, amount] of Object.entries(clearing.yields?.materials ?? {})) {
        materials[material as keyof typeof materials] += amount;
      }

      slots = { ...slots, [project.slot]: { ...state, cleared: true } };
    }

    completed.push(project);
  }

  return {
    campaign: {
      ...campaign,
      materials,
      base: { ...base, slots },
      projects: campaign.projects.filter((project) => !isDue(campaign, project)),
    },
    completed,
  };
}
