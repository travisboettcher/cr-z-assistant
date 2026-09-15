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
import type { Violation } from './checks';
import { planningHasBegun } from './planning';

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
 * The Labor this turn has to spend, which is nobody's until the Planning Phase
 * says whose (pg. 20).
 *
 * `laborPool` reads `assignments`, and outside the Planning Phase those belong
 * to the turn *before* this one — a survivor takes one task per turn and the
 * Planning Phase is what clears the last lot. That is the same field
 * `beforePlanning` exists to read from the other end: the Advancement Phase
 * wants last turn's team because it is settling up last turn's work, and this
 * wants nothing from them at all, because their Labor was spent on the turn
 * they were assigned.
 *
 * Without this the pool simply persisted. A 2-Labor team assigned in turn 2 was
 * still funding orders in turn 3's Mission Phase — a whole turn of building for
 * free, every turn, which is half of issue #97. The other half is `laborPool`
 * never being spent down, and `laborCommitted` above is that one.
 *
 * So: zero until this turn's Planning Phase has begun. Not "outside the
 * Planning Phase" — the Management Phase follows it and its team is still this
 * turn's — and `planningHasBegun` is the same record the walk itself reads to
 * clear the tasks once.
 */
export function laborThisTurn(campaign: Campaign): number {
  return planningHasBegun(campaign) ? laborPool(campaign) : 0;
}

/**
 * The Labor still available to order with.
 *
 * What this turn's project team generates, less what this turn has already
 * committed. Can go negative, and one way is a rule rather than a damaged save:
 * a survivor who leaves at Departures takes their Tier off a pool the queue has
 * already spent (pg. 23). `laborShortfall` is that state named.
 */
export function laborAvailable(campaign: Campaign): number {
  return laborThisTurn(campaign) - laborCommitted(campaign);
}

/**
 * How much Labor this turn's queue is short, or zero (pg. 23).
 *
 * Only ever non-zero after the pool shrinks under an order already placed —
 * which is what a departing project-team member does, and what a player does
 * to themselves by stepping back and taking somebody off the team after
 * ordering. The queue is not wrong —
 * every order in it was affordable when it was placed — so this is not a
 * validation failure but the rule's own consequence, waiting for the player to
 * say which project does not get finished.
 */
export function laborShortfall(campaign: Campaign): number {
  return Math.max(0, -laborAvailable(campaign));
}

/**
 * This turn's orders, each with its position in the queue.
 *
 * The positions, because these are offered to be dropped and
 * `withProjectCancelled` drops by position. Only this turn's: last turn's
 * orders were paid for by a team that has already been reassigned, and a
 * shortfall here cannot reach back and unfinish them.
 */
export function orderedThisTurn(campaign: Campaign): readonly QueuedProject[] {
  return campaign.projects
    .map((project, at) => ({ at, project }))
    .filter((queued) => queued.project.orderedOnTurn === campaign.turn);
}

/**
 * The refusal all three verbs give when a project's Labor is not there.
 *
 * One function rather than the same four lines in `build`, `upgrade` and
 * `clearing` — which was tolerable while they said one thing and stopped being
 * so when they had two to say. A pool this turn has spent down and a pool that
 * is not this turn's yet are both "not enough Labor" to the typechecker and
 * different sentences to a player, and the second one is useless without its
 * reason: a base panel reading zero beside a project team on screen is the
 * question, not the answer.
 *
 * `undefined` for nothing wrong, so a caller pushes what it gets rather than
 * asking twice. `pages` is where *this* cost is written down and stays the
 * caller's — a facility's is the cost table, a clearing project's is the base
 * chapter — while the reason that has nothing to do with the cost cites the
 * rule it is actually about.
 */
export function laborRefusal(
  campaign: Campaign,
  labor: number,
  pages: number | string,
): Violation<'not-enough-labor'> | undefined {
  const available = laborAvailable(campaign);

  // A project that costs no Labor is refused by neither: there is nothing to
  // take from a pool that is not this turn's.
  if (available >= labor) return undefined;

  if (!planningHasBegun(campaign)) {
    return {
      code: 'not-enough-labor',
      message: `Costs ${String(labor)} Labor, and this turn’s project team is assigned in the Planning Phase — last turn’s does not pay for this turn’s work.`,
      pages: 20,
    };
  }

  return {
    code: 'not-enough-labor',
    message: `Costs ${String(labor)} Labor and ${String(available)} is available.`,
    pages,
  };
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
