import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Project } from './campaign';
import {
  completeProjects,
  dueProjects,
  isDue,
  laborAvailable,
  laborCommitted,
  projectCost,
  queuedFor,
  withProjectCancelled,
  withProjectOrdered,
} from './projects';
import { laborPool } from './assignments';
import { projectTeamWorth } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

/** A community on turn 3 with Hardware, a project team, and a base to work on. */
function community(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
    base: { id: 'hobby-farm', slots: {} },
    ...projectTeamWorth(6),
    ...overrides,
  };
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
