import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Project } from './campaign';
import type { UpgradeId } from '../data/facilities';
import {
  completeProjects,
  dueProjects,
  isDue,
  laborAvailable,
  laborCommitted,
  laborRefusal,
  laborShortfall,
  cancellable,
  laborThisTurn,
  orderedThisTurn,
  projectCost,
  queuedCost,
  queuedFor,
  withProjectCancelled,
  withProjectOrdered,
} from './projects';
import { laborPool } from './assignments';
import { upgradeOrder } from './upgrade';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

/** A community on turn 3 with Hardware, a project team, and a base to work on. */
function community(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
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
};
const GAS_RANGE: Project = {
  kind: 'upgrade',
  slot: 'kitchen',
  upgrade: 'gas-range',
  orderedOnTurn: 3,
};
const COOP: Project = { kind: 'clearing', slot: 'ruined-chicken-coop', orderedOnTurn: 3 };

describe('projectCost', () => {
  it('is the facility’s own cost for a build', () => {
    expect(projectCost(community(), WORKSHOP)).toEqual({ hardware: 3, labor: 2 });
  });

  it('is the upgrade’s own cost for an upgrade', () => {
    expect(projectCost(community(), GAS_RANGE)).toEqual({ hardware: 2, labor: 1 });
  });

  /** Clearing is Labor and nothing else: rubble does not cost Hardware. */
  it('is the slot’s Labor and no Hardware for a clearing', () => {
    expect(projectCost(community(), COOP)).toEqual({ hardware: 0, labor: 2 });
  });

  /**
   * A queue is a record of what was ordered and the base can change under it —
   * Z1-7's override lets a player clear a slot an upgrade was queued for — and
   * charging for an upgrade that cannot happen would be worse than charging
   * nothing.
   */
  it('is nothing for an upgrade of a facility that is no longer there', () => {
    const gone = community({ base: { id: 'small-town-home', slots: {} } });

    expect(projectCost(gone, { ...GAS_RANGE, slot: 'garage' })).toEqual({ hardware: 0, labor: 0 });
  });

  it('is nothing for an upgrade the facility does not take', () => {
    expect(projectCost(community(), { ...GAS_RANGE, upgrade: 'spotlight' })).toEqual({
      hardware: 0,
      labor: 0,
    });
  });

  it('is nothing for a clearing of a slot with nothing to clear', () => {
    expect(projectCost(community(), { ...COOP, slot: 'front-yard' })).toEqual({
      hardware: 0,
      labor: 0,
    });
  });
});

describe('queuedFor', () => {
  const queued = (): Campaign => community({ projects: [WORKSHOP, GAS_RANGE, COOP] });

  it('is only the orders for that slot', () => {
    expect(queuedFor(queued(), 'kitchen').map(({ project }) => project)).toEqual([GAS_RANGE]);
  });

  /** The position in the whole queue, which is what cancels an order. */
  it('carries each order’s place in the queue rather than in the slot’s own list', () => {
    expect(queuedFor(queued(), 'ruined-chicken-coop').map(({ at }) => at)).toEqual([2]);
  });

  it('is nothing for a slot with nothing on order', () => {
    expect(queuedFor(queued(), 'garage')).toEqual([]);
  });

  it('keeps two orders for one slot, in the order they were placed', () => {
    const twice = community({ projects: [GAS_RANGE, { ...GAS_RANGE, upgrade: 'refrigerator' }] });

    expect(queuedFor(twice, 'kitchen').map(({ project }) => project.kind)).toEqual([
      'upgrade',
      'upgrade',
    ]);
  });
});

describe('laborCommitted and laborAvailable', () => {
  it('are nothing and the whole pool for an empty queue', () => {
    const empty = community();

    expect(laborCommitted(empty)).toBe(0);
    expect(laborAvailable(empty)).toBe(laborPool(empty));
  });

  it('add up this turn’s orders', () => {
    // A Workshop is 2 Labor and a Gas Range 1.
    const campaign = community({ projects: [WORKSHOP, GAS_RANGE] });

    expect(laborCommitted(campaign)).toBe(3);
    expect(laborAvailable(campaign)).toBe(3);
  });

  /**
   * Last turn's projects were paid for by last turn's project team, and they
   * are still in the queue until the Advancement Phase finishes them.
   */
  it('ignore an order from an earlier turn, though it is still queued', () => {
    const campaign = community({ projects: [{ ...WORKSHOP, orderedOnTurn: 2 }] });

    expect(campaign.projects).toHaveLength(1);
    expect(laborCommitted(campaign)).toBe(0);
    expect(laborAvailable(campaign)).toBe(6);
  });

  /**
   * A state to report rather than to hide: a hand-edited save, or a survivor
   * taken off the team after the order was placed.
   */
  it('can leave less than nothing available', () => {
    const campaign = community({ projects: [WORKSHOP, WORKSHOP, WORKSHOP, WORKSHOP] });

    expect(laborAvailable(campaign)).toBe(-2);
  });
});

describe('laborThisTurn', () => {
  it('is what the project team generates once this turn has planned', () => {
    expect(laborThisTurn(community())).toBe(6);
  });

  /**
   * The other half of issue #97, and the half that leaked across a turn
   * boundary. Assignments live until the top of the next Planning Phase clears
   * them (pg. 20), so a campaign in its Mission or Advancement Phase is still
   * carrying last turn's team — and before this, that team's Labor funded a
   * whole turn of building for free, every turn.
   */
  it('is nothing before this turn’s Planning Phase, whoever is still assigned', () => {
    const lastTurns = { ...community(), log: [] };

    // The team is right there on the campaign, and worth nothing to this turn.
    expect(lastTurns.assignments).toEqual(community().assignments);
    expect(laborThisTurn(lastTurns)).toBe(0);
    expect(laborAvailable(lastTurns)).toBe(0);
  });

  it('reads this turn’s Planning and not another turn’s', () => {
    const planned = community();
    const later = { ...planned, turn: planned.turn + 1 };

    expect(laborThisTurn(later)).toBe(0);
  });
});

describe('laborShortfall', () => {
  it('is nothing while the queue fits the pool', () => {
    expect(laborShortfall(community())).toBe(0);
    expect(laborShortfall(community({ projects: [WORKSHOP, GAS_RANGE] }))).toBe(0);
  });

  /**
   * What a departure leaves behind (pg. 23): a Tier comes off the turn's unused
   * Labor, and there was not enough unused Labor to take it from.
   */
  it('is what the queue is over by once the pool shrinks under it', () => {
    const ordered = community({ projects: [WORKSHOP, WORKSHOP, WORKSHOP] });
    const short = { ...ordered, ...projectTeamWorth(4) };

    expect(laborShortfall(ordered)).toBe(0);
    expect(laborShortfall(short)).toBe(2);
  });

  it('is nothing rather than everything before this turn has planned', () => {
    expect(laborShortfall({ ...community(), log: [] })).toBe(0);
  });
});

describe('orderedThisTurn', () => {
  it('carries each order’s position in the whole queue', () => {
    const campaign = community({ projects: [{ ...WORKSHOP, orderedOnTurn: 2 }, GAS_RANGE] });

    expect(orderedThisTurn(campaign)).toEqual([{ at: 1, project: GAS_RANGE }]);
  });

  it('is empty for a turn that has ordered nothing', () => {
    expect(orderedThisTurn(community())).toEqual([]);
  });
});

describe('laborRefusal', () => {
  it('is nothing at all when the Labor is there', () => {
    expect(laborRefusal(community(), 6, 54)).toBeUndefined();
  });

  it('names what is left when the turn has spent it down', () => {
    const spent = community({ projects: [WORKSHOP, WORKSHOP] });

    expect(laborRefusal(spent, 3, '72–73')).toEqual({
      code: 'not-enough-labor',
      message: 'Costs 3 Labor and 2 is available.',
      pages: '72–73',
    });
  });

  /**
   * A different sentence for a different zero. "0 is available" beside a
   * project team the roster is still showing reads as a bug rather than as a
   * step not yet walked to, which is the whole reason this is not one message
   * with a number in it.
   */
  it('names the step instead when the pool is not this turn’s', () => {
    const refusal = laborRefusal({ ...community(), log: [] }, 2, '72–73');

    expect(refusal?.message).toMatch(/assigned in the Planning Phase/i);
    expect(refusal?.pages).toBe(20);
  });

  it('refuses nothing for a project that costs no Labor, planned or not', () => {
    expect(laborRefusal({ ...community(), log: [] }, 0, 54)).toBeUndefined();
  });
});

describe('isDue and dueProjects', () => {
  it('is not due on the turn it was ordered', () => {
    expect(isDue(community(), WORKSHOP)).toBe(false);
  });

  it('is due on any turn after', () => {
    expect(isDue(community(), { ...WORKSHOP, orderedOnTurn: 2 })).toBe(true);
    expect(isDue(community({ turn: 9 }), { ...WORKSHOP, orderedOnTurn: 2 })).toBe(true);
  });

  it('sorts the queue into what finishes now and what waits', () => {
    const campaign = community({ projects: [{ ...WORKSHOP, orderedOnTurn: 2 }, GAS_RANGE] });

    expect(dueProjects(campaign)).toEqual([{ ...WORKSHOP, orderedOnTurn: 2 }]);
  });
});

/**
 * The Greenhouse is the only upgrade in the catalogue that excludes another,
 * and the book prices *replacing* a Fence with one a Hardware cheaper (pg. 72)
 * — so ordering it onto a Fence is the ordinary way to get one, and the Fence
 * comes off when the work is done rather than when the order is placed.
 */
/**
 * R2-M8 (#148). The app rules that cancelling is a decision taken back within
 * the phase that made it, and nothing enforced the sentence: last turn's order
 * was cancelled during the next turn's Mission Phase for a full refund.
 */
describe('cancellable', () => {
  const queued = (turn: number, step: Campaign['step']): Campaign =>
    community({ turn, step, projects: [{ ...WORKSHOP, orderedOnTurn: turn }] });

  it('is true in the Planning Phase of the turn that ordered it', () => {
    expect(cancellable(queued(3, 'assign-project-team'), 0)).toBe(true);
    expect(cancellable(queued(3, 'assign-mission-team'), 0)).toBe(true);
  });

  it('is false anywhere else in the same turn', () => {
    for (const step of ['select-mission', 'heal-wounds', 'check-storage'] as const) {
      expect([step, cancellable(queued(3, step), 0)]).toEqual([step, false]);
    }
  });

  it('is false for an order from a turn that has closed', () => {
    const lastTurn = community({
      turn: 4,
      step: 'assign-project-team',
      projects: [{ ...WORKSHOP, orderedOnTurn: 3 }],
    });

    expect(cancellable(lastTurn, 0)).toBe(false);
  });

  it('is false for a position the queue does not have', () => {
    expect(cancellable(queued(3, 'assign-project-team'), 7)).toBe(false);
  });
});

describe('replacing an upgrade', () => {
  const GREENHOUSE: Project = {
    kind: 'upgrade',
    slot: 'front-yard',
    upgrade: 'greenhouse',
    orderedOnTurn: 2,
  };

  /**
   * A Garden the player built, so its upgrades are exactly the ones named —
   * unlike the Hobby Farm's own Garden, which arrives with a Fence in the
   * layout and is the subject of its own test below.
   */
  const fenced = (upgrades: readonly UpgradeId[] = ['fence']): Campaign =>
    community({
      base: {
        id: 'hobby-farm',
        slots: {
          'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: [...upgrades] },
        },
      },
      projects: [GREENHOUSE],
    });

  it('prices it a Hardware under the catalogue over what it replaces', () => {
    // `queuedCost` rather than `projectCost`: the Greenhouse in these fixtures
    // is already the first order, and asking what it would cost to order *now*
    // is a different question with a different answer — see the two below.
    expect(queuedCost(fenced(), 0)).toEqual({ hardware: 3, labor: 4 });
    expect(queuedCost(fenced([]), 0)).toEqual({ hardware: 4, labor: 4 });
  });

  /**
   * There is one Fence, so there is one discount (#140). Both copies were
   * quoted "3 Hardware · Replaces the Fence", and two 4-Hardware upgrades came
   * to 6 — with the second one's screen naming a Fence the first had already
   * spoken for.
   */
  it('discounts the first order for the Fence and not the second', () => {
    const queued = fenced();

    expect(projectCost(queued, GREENHOUSE)).toEqual({ hardware: 4, labor: 4 });
    expect(upgradeOrder(queued, { slot: 'front-yard', upgrade: 'greenhouse' })).toEqual({
      cost: { hardware: 4, labor: 4 },
      replaces: [],
    });

    // And the refund is what was charged, each at its own position.
    const both = { ...queued, projects: [...queued.projects, GREENHOUSE] };

    expect(queuedCost(both, 0)).toEqual({ hardware: 3, labor: 4 });
    expect(queuedCost(both, 1)).toEqual({ hardware: 4, labor: 4 });
  });

  it('prices nothing for a position the queue does not have', () => {
    expect(queuedCost(fenced(), 7)).toEqual({ hardware: 0, labor: 0 });
  });

  /**
   * Two ways the slot can have changed under a queued upgrade, both of which
   * the pricing walks through before it can say "nothing": Z1-7's override
   * clears a slot out from under an order, and a rebuilt slot offers a
   * different facility's upgrades entirely.
   */
  it('prices nothing for an upgrade whose slot has changed under it', () => {
    const gone = community({
      base: { id: 'hobby-farm', slots: {} },
      projects: [{ ...GREENHOUSE, slot: 'back-yard' }],
    });

    // Both forms: the refund for the order already placed, and the quote for
    // another one — which is the form that has to walk the queue rather than
    // skip it, and so the form that finds nothing standing to walk over.
    expect(queuedCost(gone, 0)).toEqual({ hardware: 0, labor: 0 });
    expect(projectCost(gone, { ...GREENHOUSE, slot: 'back-yard' })).toEqual({
      hardware: 0,
      labor: 0,
    });

    const GAS_RANGE_OUTSIDE: Project = {
      kind: 'upgrade',
      slot: 'front-yard',
      upgrade: 'gas-range',
      orderedOnTurn: 2,
    };

    const swapped = community({
      base: {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } },
      },
      projects: [GAS_RANGE_OUTSIDE],
    });

    expect(queuedCost(swapped, 0)).toEqual({ hardware: 0, labor: 0 });
    expect(projectCost(swapped, GAS_RANGE_OUTSIDE)).toEqual({ hardware: 0, labor: 0 });
  });

  it('takes the Fence off when the work is done, and nothing else with it', () => {
    const { campaign, completed } = completeProjects(fenced(['fence', 'herb-plot']));

    expect(completed).toEqual([GREENHOUSE]);
    expect(campaign.base?.slots['front-yard']?.upgrades).toEqual(['herb-plot', 'greenhouse']);
  });

  it('leaves the Fence standing until then', () => {
    expect(fenced().base?.slots['front-yard']?.upgrades).toEqual(['fence']);
  });

  /** A Garden with no Fence takes the Greenhouse and loses nothing. */
  it('replaces nothing where there was nothing to replace', () => {
    const { campaign } = completeProjects(fenced([]));

    expect(campaign.base?.slots['front-yard']?.upgrades).toEqual(['greenhouse']);
  });

  /**
   * The Hobby Farm's Garden comes Fenced (pg. 54), and a Fence in the layout is
   * as much a Fence as one the community built — `occupants` resolves both into
   * one list, which is the whole reason it exists.
   */
  it('replaces a Fence the base itself came with', () => {
    const farm = community({
      base: { id: 'hobby-farm', slots: {} },
      projects: [{ ...GREENHOUSE, slot: 'garden' }],
    });

    expect(queuedCost(farm, 0)).toEqual({ hardware: 3, labor: 4 });
  });

  /**
   * A queue can outlive the slot it was ordered for: Z1-7's override lets a
   * player clear a slot and build something else into it, and the Gas Range
   * queued for the Kitchen is then an upgrade the Garden standing there does
   * not offer. It replaces nothing and still goes on, which is what the queue
   * has always done with a slot that changed under it.
   */
  it('replaces nothing for an upgrade the facility does not offer', () => {
    const swapped = community({
      base: {
        id: 'hobby-farm',
        slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } },
      },
      projects: [{ kind: 'upgrade', slot: 'front-yard', upgrade: 'gas-range', orderedOnTurn: 2 }],
    });

    const { campaign } = completeProjects(swapped);

    expect(campaign.base?.slots['front-yard']?.upgrades).toEqual(['gas-range']);
  });

  /**
   * Two Fences is a state only an override reaches — `one-per-facility` is a
   * warning — and the discount follows the rule per upgrade replaced rather
   * than capping at one, because that is what the field says it is.
   */
  it('discounts once for each Fence it takes off', () => {
    expect(queuedCost(fenced(['fence', 'fence']), 0)).toEqual({ hardware: 2, labor: 4 });
  });
});

describe('withProjectOrdered', () => {
  it('appends to the queue and spends the Hardware', () => {
    const after = withProjectOrdered(community(), WORKSHOP);

    expect(after.projects).toEqual([WORKSHOP]);
    expect(after.materials.hardware).toBe(6);
  });

  it('appends rather than inserts, because an order placed second was second', () => {
    const after = withProjectOrdered(withProjectOrdered(community(), WORKSHOP), GAS_RANGE);

    expect(after.projects).toEqual([WORKSHOP, GAS_RANGE]);
  });

  /** Hardware leaves the stores; Labor has nowhere to leave from. */
  it('leaves the base and the project team exactly as it found them', () => {
    const before = community();
    const after = withProjectOrdered(before, WORKSHOP);

    expect(after.base).toEqual(before.base);
    expect(after.assignments).toEqual(before.assignments);
    expect(laborPool(after)).toBe(laborPool(before));
  });

  it('spends nothing for a clearing project', () => {
    expect(withProjectOrdered(community(), COOP).materials.hardware).toBe(9);
  });
});

describe('withProjectCancelled', () => {
  const queued = (): Campaign => community({ projects: [WORKSHOP, GAS_RANGE] });

  it('takes the order at that position out and gives its Hardware back', () => {
    const after = withProjectCancelled(queued(), 0);

    expect(after.projects).toEqual([GAS_RANGE]);
    expect(after.materials.hardware).toBe(12);
  });

  it('cancels the one at that position rather than the first it finds', () => {
    expect(withProjectCancelled(queued(), 1).projects).toEqual([WORKSHOP]);
  });

  /** Labor needs no refund, because it was never spent. */
  it('frees the Labor the order had committed, by arithmetic alone', () => {
    expect(laborAvailable(withProjectCancelled(queued(), 0))).toBe(laborAvailable(queued()) + 2);
  });

  it('leaves the campaign alone for a position the queue does not have', () => {
    const before = queued();

    expect(withProjectCancelled(before, 4)).toBe(before);
    expect(withProjectCancelled(before, -1)).toBe(before);
  });

  /**
   * Two identical orders for one slot are two orders, which is why this cancels
   * by position: "the Gas Range" would have to pick one anyway.
   */
  it('takes exactly one of two identical orders', () => {
    const twice = community({ projects: [GAS_RANGE, GAS_RANGE] });

    expect(withProjectCancelled(twice, 0).projects).toEqual([GAS_RANGE]);
  });
});

describe('completeProjects', () => {
  /** The same three projects, ordered last turn, seen from this one. */
  const lastTurn = (...projects: readonly Project[]): Campaign =>
    community({ projects: projects.map((project) => ({ ...project, orderedOnTurn: 2 })) });

  it('builds a facility, and stamps the turn it went up', () => {
    const { campaign } = completeProjects(lastTurn(WORKSHOP));

    expect(campaign.base?.slots['front-yard']).toEqual({
      built: { facility: 'workshop', builtOnTurn: 3 },
    });
  });

  it('adds an upgrade to what the facility already has', () => {
    const { campaign } = completeProjects(lastTurn(GAS_RANGE));

    expect(campaign.base?.slots.kitchen?.upgrades).toEqual(['gas-range']);
  });

  /**
   * The one place the timing visibly matters: the rubble is not cleared until
   * the work is done, so the materials in it are not in the stores until then.
   */
  it('clears a slot and credits the yield here rather than at ordering', () => {
    const ordered = withProjectOrdered(community(), COOP);
    expect(ordered.materials.hardware).toBe(9);

    const { campaign } = completeProjects({
      ...ordered,
      projects: [{ ...COOP, orderedOnTurn: 2 }],
    });

    expect(campaign.base?.slots['ruined-chicken-coop']).toEqual({ cleared: true });
    expect(campaign.materials.hardware).toBe(11);
  });

  it('reports everything it finished', () => {
    const { completed } = completeProjects(lastTurn(WORKSHOP, GAS_RANGE));

    expect(completed).toEqual([
      { ...WORKSHOP, orderedOnTurn: 2 },
      { ...GAS_RANGE, orderedOnTurn: 2 },
    ]);
  });

  it('empties the due half of the queue and leaves this turn’s orders in it', () => {
    const mixed = community({
      projects: [{ ...WORKSHOP, orderedOnTurn: 2 }, GAS_RANGE],
    });
    const { campaign } = completeProjects(mixed);

    expect(campaign.projects).toEqual([GAS_RANGE]);
  });

  it('changes nothing the second time, because the first emptied the queue', () => {
    const once = completeProjects(lastTurn(WORKSHOP)).campaign;
    const twice = completeProjects(once);

    expect(twice.campaign).toEqual(once);
    expect(twice.completed).toEqual([]);
  });

  it('does nothing for a campaign with no base', () => {
    const none = community({ base: null, projects: [{ ...WORKSHOP, orderedOnTurn: 2 }] });
    const after = completeProjects(none);

    expect(after.campaign).toBe(none);
    expect(after.completed).toEqual([]);
  });

  describe('a project the base no longer has room for', () => {
    it('drops a build into a slot something else now occupies', () => {
      const taken = community({
        base: {
          id: 'hobby-farm',
          slots: { 'front-yard': { built: { facility: 'garden', builtOnTurn: 2 } } },
        },
        projects: [{ ...WORKSHOP, orderedOnTurn: 2 }],
      });
      const { campaign, completed } = completeProjects(taken);

      expect(campaign.base?.slots['front-yard']?.built?.facility).toBe('garden');
      expect(completed).toEqual([]);
      expect(campaign.projects).toEqual([]);
    });

    it('drops an upgrade of a facility that is no longer there', () => {
      const empty = community({
        base: { id: 'small-town-home', slots: {} },
        projects: [{ ...GAS_RANGE, slot: 'garage', orderedOnTurn: 2 }],
      });
      const { campaign, completed } = completeProjects(empty);

      expect(campaign.base?.slots.garage).toBeUndefined();
      expect(completed).toEqual([]);
    });

    it('drops a clearing of a slot with nothing to clear', () => {
      const nothing = community({
        projects: [{ ...COOP, slot: 'front-yard', orderedOnTurn: 2 }],
      });
      const { campaign, completed } = completeProjects(nothing);

      expect(campaign.base?.slots['front-yard']).toBeUndefined();
      expect(completed).toEqual([]);
    });

    /**
     * Two builds for one slot, both ordered last turn. The first takes the
     * slot and the second finds it occupied — so the walk has to see what the
     * projects before it did rather than the base it started from.
     */
    it('drops the second of two builds for the same slot', () => {
      const both = community({
        projects: [
          { ...WORKSHOP, orderedOnTurn: 2 },
          { ...WORKSHOP, facility: 'watchtower', orderedOnTurn: 2 },
        ],
      });
      const { campaign, completed } = completeProjects(both);

      expect(campaign.base?.slots['front-yard']?.built?.facility).toBe('workshop');
      expect(completed).toHaveLength(1);
    });

    /**
     * The same slot, the same walk, and the rubble is cleared once (#140). Two
     * clearings for one slot both paid out: the Rural Church's Pews took
     * Hardware from 19 to 23 and the log printed "Cleared the Pews 2." twice.
     * `checkClearing` refuses the second order now, and this is the other end
     * of it — a save holding two is still a save this has to open.
     */
    it('pays a slot’s rubble out once however many clearings are due for it', () => {
      const twice = community({
        materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
        projects: [
          { ...COOP, orderedOnTurn: 2 },
          { ...COOP, orderedOnTurn: 2 },
        ],
      });
      const { campaign, completed } = completeProjects(twice);

      // The coop yields 2 Hardware, and there is one coop.
      expect(campaign.materials.hardware).toBe(2);
      expect(campaign.base?.slots['ruined-chicken-coop']?.cleared).toBe(true);
      expect(completed).toHaveLength(1);
    });

    /**
     * The other direction: a build and then an upgrade of it, both due. The
     * upgrade finds the facility the build just put there, so the same walk
     * has to work forwards as well as backwards.
     */
    it('upgrades a facility the same walk has just built', () => {
      const both = community({
        base: { id: 'small-town-home', slots: {} },
        projects: [
          { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 },
          { kind: 'upgrade', slot: 'garage', upgrade: 'metal-shop', orderedOnTurn: 2 },
        ],
      });
      const { campaign, completed } = completeProjects(both);

      expect(campaign.base?.slots.garage).toEqual({
        built: { facility: 'workshop', builtOnTurn: 3 },
        upgrades: ['metal-shop'],
      });
      expect(completed).toHaveLength(2);
    });
  });
});
