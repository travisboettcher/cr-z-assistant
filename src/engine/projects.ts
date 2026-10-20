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

import { FACILITIES, type Cost, type Facility, type UpgradeId } from '../data/facilities';
import { laborOf, laborPool } from './assignments';
import type { Occupant } from './base';
import { clearingProject, occupantAt, replacedBy, upgradeCost } from './base';
import type { ItemId } from '../data/equipment';
import type { Campaign, Item, PlacedOrder, Project, ProjectOrder } from './campaign';
import { chosenWeapons, weaponsProblem } from './handover';
import type { Violation } from './checks';
import { planningHasBegun } from './planning';
import { projectTeamThatWorked, siegeDefended } from './siegeWork';
import { freeRebuild } from './rebuild';
import { phaseOf } from './turn';
import { necromancerKilled } from './magicMissions';
import { containmentUnlock } from './viralMissions';

/**
 * Whether one of these is already on order for this slot.
 *
 * The queue holds orders, not results, so "is there a facility here" and "is a
 * facility *coming* here" are different questions and the validators only ever
 * asked the first (#140). Two facilities ordered into one slot in a single
 * Planning Phase both took their Hardware; one landed, and `completeProjects`
 * dropped the other where it stood.
 */
export function queuedKindFor(campaign: Campaign, slot: string, kind: Project['kind']): boolean {
  return queuedFor(campaign, slot).some((queued) => queued.project.kind === kind);
}

/**
 * The upgrade orders standing for this slot, by id.
 *
 * For the two messages that count: a cap reached by orders rather than by
 * building reads differently, and a player who cannot see the queue in the
 * number cannot tell a full facility from one they have just filled.
 *
 * Ids rather than catalogue entries, and deliberately unresolved: an order for
 * an upgrade the facility does not offer still occupies a place in the queue,
 * and a count that quietly dropped it would disagree with the list the player
 * can see on the slot card.
 */
export function queuedUpgradesFor(campaign: Campaign, slot: string): readonly UpgradeId[] {
  return queuedFor(campaign, slot).flatMap(({ project }) =>
    project.kind === 'upgrade' ? [project.upgrade] : [],
  );
}

/**
 * The facility in this slot as everything already queued for it will leave it.
 *
 * Four checks and a price all ask one question — *what will be standing here
 * when this order lands* — and every one of them answered it from installed
 * state alone. So four Herb Plots fitted into three upgrade slots, two
 * Greenhouses sat on one Garden against `maxPerFacility: 1`, and both were
 * quoted the Fence-replacement discount for a Fence there is only one of.
 *
 * Everything queued counts, with no way to ask for part of the queue. It took a
 * `before` position while a refund was priced from the queue, so that
 * cancelling the first of two Greenhouses could not hand back the discounted
 * price for the one that paid full. A refund is now the number the order
 * carries (#165), and the only caller left is the quote, which takes the lot.
 *
 * The upgrade rule here is `completeProjects`' one, deliberately: an order that
 * excludes something installed takes it off, so the second copy of an upgrade
 * finds the exclusion already spent.
 */
export function occupantAwaiting(campaign: Campaign, slot: string): Occupant | undefined {
  const standing = occupantAt(campaign, slot);

  // A facility on order is not something to upgrade: `checkUpgrade` refuses an
  // empty slot before it gets here, and an order against a facility that has
  // not been built is one the queue cannot promise.
  if (standing === undefined) return undefined;

  return queuedFor(campaign, slot).reduce((occupant, { project }) => {
    // The kind test is the typechecker's rather than the rule's, and a mutant
    // that drops it survives: a clearing or a facility order carries no
    // `upgrade`, so the lookup below finds nothing and returns the occupant
    // unchanged — the same answer by a longer road.
    if (project.kind !== 'upgrade') return occupant;

    const ordered = occupant.facility.upgrades.find(
      (candidate) => candidate.id === project.upgrade,
    );
    if (ordered === undefined) return occupant;

    const gone = replacedBy(occupant, ordered);

    return {
      ...occupant,
      upgrades: [...occupant.upgrades.filter((installed) => !gone.includes(installed)), ordered],
    };
  }, standing);
}

/**
 * What ordering this project *now* would cost — every quote a screen shows.
 *
 * Everything already queued counts as ahead of it, which is what makes the
 * second Greenhouse ordered onto one Garden cost the catalogue price: the
 * first one has spoken for the Fence.
 *
 * A quote, and only that. What a project in the queue *was* charged is
 * `queuedCost`, which reads the number back rather than asking again — see
 * `Project.charged`.
 */
export function projectCost(campaign: Campaign, project: ProjectOrder): Cost {
  const cost = withNecromancerLabor(campaign, project, costOf(campaign, project));

  // Putting back what an overrun destroyed spends no resources; the Labor and
  // the turn it takes are unchanged (pg. 86; R29; Z4-10).
  return freeRebuild(campaign, project) ? { hardware: 0, labor: cost.labor } : cost;
}

/**
 * What the project at this position in the queue was charged.
 *
 * **Read back, not recomputed.** This used to price the project at its own
 * position in the queue, which is right only while the queue does not move:
 * cancelling an earlier order shifts every later project's index, so a later
 * project was refunded against a different set of orders-ahead-of-it than it
 * was charged against, and the difference was Hardware created or destroyed
 * (#165).
 *
 * Nothing for a position the queue does not have.
 */
export function queuedCost(campaign: Campaign, at: number): Cost {
  return campaign.projects[at]?.charged ?? NOTHING;
}

/**
 * The catalogue price of an order against the base as it stands, with
 * everything currently queued counted as ahead of it.
 *
 * One `before` no longer, because there is only one question left to ask: the
 * quote. The refund stopped being a second, differently-priced call when the
 * charge became a recorded fact.
 */
function costOf(campaign: Campaign, project: ProjectOrder): Cost {
  if (project.kind === 'facility') {
    return (FACILITIES[project.facility] as Facility).cost;
  }

  if (project.kind === 'upgrade') {
    const occupant = occupantAwaiting(campaign, project.slot);
    // Nothing, for an upgrade of a facility that is no longer there. A queue is
    // a record of what was ordered and the base can change under it — Z1-7's
    // override lets a player clear a slot with an upgrade queued for it — and
    // charging for an upgrade that cannot happen would be worse than charging
    // nothing.
    //
    // Priced against the slot rather than off the catalogue, because a
    // Greenhouse ordered onto a Fence costs a Hardware less than one ordered
    // onto a bare Garden (pp. 72–73). Asked once, at the order, and recorded:
    // the argument that the Fence is still there because nothing can take it
    // off until this project finishes is true of the *base* and false of the
    // queue, which cancellation moves under itself (#165).
    // Two guards rather than one `||`, and resolved in this order rather than
    // through an optional chain: an `occupant?.` would make the first check
    // redundant with the second, which is a line no test can tell from its
    // absence.
    if (occupant === undefined) return NOTHING;

    const upgrade = occupant.facility.upgrades.find(
      (candidate) => candidate.id === project.upgrade,
    );
    if (upgrade === undefined) return NOTHING;

    const cost = upgradeCost(occupant, upgrade);

    // Containment's Hardware, changed by the Experimental Data that unlocked it
    // (R122, R144). Never below nothing, as a replacement discount isn't.
    return upgrade.id === 'containment'
      ? {
          ...cost,
          hardware: Math.max(0, cost.hardware + (containmentUnlock(campaign)?.hardware ?? 0)),
        }
      : cost;
  }

  const clearing = clearingProject(campaign, project.slot);

  return { hardware: 0, labor: clearing?.labor ?? 0 };
}

const NOTHING = { hardware: 0, labor: 0 } as const;

/**
 * A Mystic Library, or an upgrade to one, at 1 Labor less once the
 * Necromancer is killed (R124, R153; Z7-9), never below none.
 */
function withNecromancerLabor(campaign: Campaign, project: ProjectOrder, cost: Cost): Cost {
  const library =
    (project.kind === 'facility' && project.facility === 'mystic-library') ||
    (project.kind === 'upgrade' &&
      occupantAwaiting(campaign, project.slot)?.facility.id === 'mystic-library');

  return library && necromancerKilled(campaign)
    ? { ...cost, labor: Math.max(0, cost.labor - 1) }
    : cost;
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
  return queuedLaborThisTurn(campaign) + equipmentLaborThisTurn(campaign);
}

/** What this turn's queue has committed of this turn's Labor. */
function queuedLaborThisTurn(campaign: Campaign): number {
  return campaign.projects.reduce(
    (total, project) =>
      project.orderedOnTurn === campaign.turn ? total + project.charged.labor : total,
    0,
  );
}

/**
 * What this turn's equipment has spent of this turn's Labor (pp. 20–21; Z5-6).
 *
 * Read off the `item-built` entries, because a built item is finished the
 * moment it is paid for and leaves nothing in the queue to read: the entry is
 * the only record of what it cost. One budget with the queue, so every reader
 * of `laborCommitted` sees the same number.
 */
export function equipmentLaborThisTurn(campaign: Campaign): number {
  return campaign.log.reduce(
    (total, entry) =>
      entry.turn === campaign.turn && entry.event.kind === 'item-built'
        ? total + entry.event.labor
        : total,
    0,
  );
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
 * Whether this turn's project team has Labor and none of it is committed yet:
 * no project ordered and no item built (pg. 20; #235).
 *
 * Deliberately not "some Labor is left". A table that orders one project and
 * leaves a point spare has decided, the way a community banking its
 * discretionary XP has, and owing that every turn would teach a player to press
 * through the warning that matters. A team assigned and nothing ordered at all
 * is the turn's building lost without a word, which is what a play-through hit.
 */
export function projectTeamIdle(campaign: Campaign): boolean {
  return laborThisTurn(campaign) > 0 && laborCommitted(campaign) === 0;
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
 * say which project does not get finished. Equipment built this turn counts
 * against the pool but is never unbuilt (R48).
 */
export function laborShortfall(campaign: Campaign): number {
  // Never more than the queue can give back: an item already built stays built
  // (R48), so a shortfall only equipment accounts for is forgiven.
  return Math.max(0, Math.min(queuedLaborThisTurn(campaign), -laborAvailable(campaign)));
}

/**
 * How much Labor last turn's orders are short, because this turn's siege took
 * somebody off the team that paid for them (pg. 23, the FAQ's "Siege Defense
 * and Labor"; #183).
 *
 * **The one shortfall that reaches back a turn**, and the reason is when a
 * siege is fought. `management/projectUnfinished` refuses last turn's orders
 * because they "were paid for by a team that has already been reassigned" —
 * true at Departures, which runs after this turn's Planning Phase. A siege is
 * fought in the Mission Phase, *before* it: the team the previous Planning
 * Phase assigned is still the team, its orders have not landed yet, and a
 * survivor reduced to 0 Health takes their Labor off it (`siegeWork.ts`). So
 * the rule pg. 23 gives a departure — the Tier comes off the unused Labor, and
 * a project goes unfinished if that runs it negative — is the rule here, one
 * turn's orders earlier.
 *
 * Measured against the pool that team generated **on its own turn**, which is
 * why `laborOf` takes one: the base's share, and a point each if the turn
 * before *that* ended in a clean siege, both belong to the turn the team was
 * assigned. A casualty takes their point off with their Tier, as a leaver does.
 *
 * Zero on any turn without a recorded Siege Defense, so nothing about an
 * ordinary turn moves. It does not ask who caused a shortfall: one left over
 * from last turn's own Departures, unresolved, is counted too, because the
 * question is whether the team that is left can pay for what is about to land.
 */
export function siegeLaborShortfall(campaign: Campaign): number {
  if (!siegeDefended(campaign)) return 0;

  const lastTurn = campaign.turn - 1;
  const owed = orderedLastTurn(campaign).reduce(
    (total, { project }) => total + project.charged.labor,
    0,
  );

  return Math.max(0, owed - laborOf(campaign, projectTeamThatWorked(campaign), lastTurn));
}

/**
 * Last turn's orders still in the queue, each with its position — the ones a
 * siege's shortfall can leave unfinished, and only those.
 */
export function orderedLastTurn(campaign: Campaign): readonly QueuedProject[] {
  return campaign.projects
    .map((project, at) => ({ at, project }))
    .filter((queued) => queued.project.orderedOnTurn === campaign.turn - 1);
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
 * A Labor pool to price an order against, in place of this turn's (#188).
 *
 * **It replaces the pool, not what is left of it.** `laborAvailable` is two
 * questions subtracted: what this turn's project team generates, which is only
 * ever known once this turn's Planning Phase has begun, and what this turn's
 * orders have already committed, which is arithmetic over the queue. A caller
 * naming a pool answers the first one for itself — "what could a 4-Labor team
 * afford?", asked during the Advancement Phase about the Planning Phase to come
 * — and the second is still the queue's, so a second order is measured by what
 * the first one left exactly as it is when nobody names a pool (Z3-11).
 *
 * An object of one field rather than a bare number, so a call site reads
 * `{ labor: 4 }` and not a `4` that could be Hardware.
 */
export interface Pricing {
  readonly labor: number;
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
 *
 * Given a `pricing`, the pool is the caller's and the second sentence is never
 * said: "this turn's team is not assigned yet" is an answer about *now*, and a
 * caller who named a pool has asked about a team that is not this turn's on
 * purpose (#188).
 */
export function laborRefusal(
  campaign: Campaign,
  labor: number,
  pages: number | string,
  pricing?: Pricing,
): Violation<'not-enough-labor'> | undefined {
  const available =
    pricing === undefined ? laborAvailable(campaign) : pricing.labor - laborCommitted(campaign);

  // A project that costs no Labor is refused by neither: there is nothing to
  // take from a pool that is not this turn's.
  if (available >= labor) return undefined;

  if (pricing === undefined && !planningHasBegun(campaign)) {
    return {
      code: 'not-enough-labor',
      message: `Costs ${String(labor)} Labor, and this turn’s project team is assigned in the Planning Phase. Last turn’s team doesn’t pay for this turn’s work.`,
      pages: 20,
    };
  }

  return {
    code: 'not-enough-labor',
    message: `Costs ${String(labor)} Labor, but only ${String(available)} is available.`,
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
export function withProjectOrdered(campaign: Campaign, project: PlacedOrder): Campaign {
  // Quoted and recorded in one place, so the number the community paid and the
  // number written on the order cannot be two different numbers.
  const charged = projectCost(campaign, project);

  return {
    ...campaign,
    materials: { ...campaign.materials, hardware: campaign.materials.hardware - charged.hardware },
    projects: [...campaign.projects, { ...project, charged }],
  };
}

/**
 * Whether an order may be placed at all right now
 * ([R14](../../docs/rulings.md#r14--ordering-is-confined-to-the-planning-phase)).
 *
 * **The Planning Phase, and only it.** There is no equipment ordering anywhere
 * outside Planning Step 2 (pg. 20): build and trade are project-team
 * activities, and nothing in the Management Phase's seven steps touches them.
 *
 * `cancellable`'s other half, and written beside it because the two are one
 * decision. Cancelling was guarded to the phase that placed the order (#148)
 * and ordering was not, so an order placed in the Management Phase — or by
 * stepping back into this turn's Advancement Phase — could never be withdrawn:
 * the slot card read "Cancelled in the Planning Phase that ordered it" with no
 * Planning Phase left, and next turn's refused it on `orderedOnTurn` (#171).
 *
 * The turn needs no test here, unlike `cancellable`: an order is placed on
 * whatever turn is current, and it is the *taking back* that can reach into a
 * turn that has closed.
 */
export function orderable(campaign: Campaign): boolean {
  return phaseOf(campaign.step) === 'planning';
}

/**
 * Whether this order can still be taken back.
 *
 * **Within the phase that placed it**, which is what the app's own ruling says
 * cancelling is: "an order is a decision made on a screen within a phase, and a
 * decision a player cannot take back is a trap rather than a rule". Nothing
 * enforced the sentence, so last turn's order was cancelled during the next
 * turn's Mission Phase for a full refund (#148) — a decision from a turn that
 * has closed, paid for by a project team since reassigned.
 *
 * Its sibling `management/projectUnfinished` has guarded exactly this since it
 * was written; this is the same guard, plus the phase.
 */
export function cancellable(campaign: Campaign, at: number): boolean {
  const project = campaign.projects[at];

  return (
    project !== undefined &&
    project.orderedOnTurn === campaign.turn &&
    phaseOf(campaign.step) === 'planning'
  );
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

  // The number it was charged, read off the order rather than priced again —
  // which is what makes the refund equal to the spend however much the queue
  // has moved since (#165).
  return {
    ...campaign,
    materials: {
      ...campaign.materials,
      hardware: campaign.materials.hardware + project.charged.hardware,
    },
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
/**
 * The weapons a due clearing asks the player to choose before it finishes:
 * the Outdoor Sports Shop's Inventory, and how many (pg. 62; R45; Z5-8).
 */
export function weaponsOwed(
  campaign: Campaign,
): { readonly slot: string; readonly count: number } | null {
  for (const project of dueProjects(campaign)) {
    if (project.kind !== 'clearing') continue;

    const equipment = clearingProject(campaign, project.slot)?.yields?.equipment;
    if (equipment !== undefined) return { slot: project.slot, count: equipment.count };
  }

  return null;
}

export function completeProjects(
  campaign: Campaign,
  weapons: readonly ItemId[] = [],
): {
  readonly campaign: Campaign;
  readonly completed: readonly Project[];
  /** What a cleared slot handed over: the Outdoor Sports Shop's weapons (R45; Z5-8). */
  readonly handedOver: { readonly slot: string; readonly items: readonly Item[] } | null;
} {
  const base = campaign.base;
  if (base === null) return { campaign, completed: [], handedOver: null };

  let handedOver: { readonly slot: string; readonly items: readonly Item[] } | null = null;
  const waiting: Project[] = [];

  let slots = base.slots;
  let materials = campaign.materials;
  const completed: Project[] = [];

  for (const project of dueProjects(campaign)) {
    const state = slots[project.slot] ?? {};
    // The occupant rather than a boolean, because the upgrade branch below
    // needs what is standing there and not only whether anything is.
    const standing = occupantAt({ ...campaign, base: { ...base, slots } }, project.slot);

    if (project.kind === 'facility') {
      if (standing !== undefined) continue;

      slots = {
        ...slots,
        [project.slot]: {
          ...state,
          built: { facility: project.facility, builtOnTurn: campaign.turn },
        },
      };
    } else if (project.kind === 'upgrade') {
      if (standing === undefined) continue;

      /*
       * An upgrade that excludes one already installed replaces it (pp. 72–73):
       * the Greenhouse stands where the Fence stood, and the Fence comes off
       * here rather than at ordering, because until the work is done the Fence
       * is still what the Garden has.
       *
       * Read against the base as it stands now, not as it stood when the order
       * was placed — which is the same reason the whole loop re-checks the
       * slot rather than trusting the queue. An upgrade the facility does not
       * offer replaces nothing and still goes on, which is what a queue
       * outliving a rebuilt slot has always done.
       *
       * The empty fallback survives mutation, in the same family as the four
       * in `base.ts`: the filter below keeps only installed upgrades this list
       * does *not* name, so a junk id injected into it names nothing and
       * removes nothing.
       */
      const ordered = standing.facility.upgrades.find(
        (candidate) => candidate.id === project.upgrade,
      );
      const gone =
        ordered === undefined ? [] : replacedBy(standing, ordered).map((upgrade) => upgrade.id);

      slots = {
        ...slots,
        [project.slot]: {
          ...state,
          upgrades: [
            ...(state.upgrades ?? []).filter((installed) => !gone.includes(installed)),
            project.upgrade,
          ],
        },
      };
    } else {
      const clearing = clearingProject(campaign, project.slot);
      if (clearing === undefined) continue;

      // Rubble is cleared once. `checkClearing` refuses a second order now
      // (#140), but a save written before it did — or edited since — can hold
      // two, and the yield is paid here: the Pews gave up their 4 Hardware
      // twice, and the log said "Cleared the Pews 2." for both.
      if (state.cleared === true) continue;

      // The Outdoor Sports Shop's Inventory hands over weapons the player
      // chooses (R45), so it waits for the choice rather than finishing
      // without one.
      const equipment = clearing.yields?.equipment;
      if (equipment !== undefined) {
        if (weaponsProblem(weapons, equipment.count) !== null) {
          waiting.push(project);
          continue;
        }
        handedOver = { slot: project.slot, items: chosenWeapons(campaign, weapons) };
      }

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
      // A due project that did not land is dropped, as it always was, but for
      // one waiting on its weapons, which stays due until they are chosen.
      projects: campaign.projects.filter(
        (project) => !isDue(campaign, project) || waiting.includes(project),
      ),
    },
    completed,
    handedOver,
  };
}
