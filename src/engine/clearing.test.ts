import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { checkClearing, clearingProject, clearingYield, withSlotCleared } from './clearing';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function campaignWith(base: Base | null, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    materials: { food: 1, fuel: 2, hardware: 3, rare: 4 },
    turn: 4,
    base,
    ...overrides,
  };
}

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

/** The Hobby Farm's ruined chicken coop is 2 Labor and yields 2 Hardware. */
const farm = (slots: Base['slots'] = {}): Base => ({ id: 'hobby-farm', slots });

/** The Outdoor Sports Shop's Inventory slot yields equipment instead. */
const shop = (slots: Base['slots'] = {}): Base => ({ id: 'outdoor-sports-shop', slots });

describe('clearingProject', () => {
  it('finds the project on a blocked slot and nothing on the others', () => {
    expect(clearingProject(campaignWith(farm()), 'ruined-chicken-coop')).toMatchObject({
      labor: 2,
    });
    // An empty slot and a built-in one both have no project, and neither is a
    // missing slot — the distinction the check below reports differently.
    expect(clearingProject(campaignWith(farm()), 'front-yard')).toBeUndefined();
    expect(clearingProject(campaignWith(farm()), 'kitchen')).toBeUndefined();
    // And a slot the base does not have at all, which is a third thing again.
    expect(clearingProject(campaignWith(farm()), 'wine-cellar')).toBeUndefined();
  });

  it('finds nothing for a campaign with no base', () => {
    expect(clearingProject(campaignWith(null), 'ruined-chicken-coop')).toBeUndefined();
  });
});

describe('clearingYield', () => {
  it('lists only the materials a project actually gives', () => {
    // Two Hardware and nothing else: a check that returned every material with
    // a zero would pass a length assertion but read wrong on screen.
    expect(clearingYield(campaignWith(farm()), 'ruined-chicken-coop')).toEqual([['hardware', 2]]);
  });

  it('lists nothing for a project that yields only equipment', () => {
    expect(clearingYield(campaignWith(shop()), 'inventory')).toEqual([]);
  });

  it('lists nothing for a slot with no project at all', () => {
    expect(clearingYield(campaignWith(farm()), 'front-yard')).toEqual([]);
  });
});

describe('checkClearing', () => {
  it('finds nothing wrong with a project the community can pay for', () => {
    expect(checkClearing(campaignWith(farm()), { slot: 'ruined-chicken-coop', labor: 2 })).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  /**
   * Every way clearing can fail, each naming its own reason, and every one of
   * them with no warning to override.
   *
   * The code is asserted rather than merely the count: five refusals that all
   * said the same thing would pass a length check, and the whole point of
   * telling "no rubble here" from "no such slot" is that they send a reader to
   * different places.
   */
  it.each([
    ['a campaign with no base', campaignWith(null), 'ruined-chicken-coop', 9, 'no-base'],
    ['a slot this base does not have', campaignWith(farm()), 'wine-cellar', 9, 'no-such-slot'],
    ['a slot with nothing blocking it', campaignWith(farm()), 'front-yard', 9, 'nothing-to-clear'],
    [
      'a slot already cleared',
      campaignWith(farm({ 'ruined-chicken-coop': { cleared: true } })),
      'ruined-chicken-coop',
      9,
      'already-cleared',
    ],
    ['too little Labor', campaignWith(farm()), 'ruined-chicken-coop', 1, 'not-enough-labor'],
  ])('refuses %s, with nothing to override', (_label, campaign, slot, labor, expected) => {
    const check = checkClearing(campaign, { slot, labor });

    expect(codes(check.blockers)).toEqual([expected]);
    expect(check.warnings).toEqual([]);
  });

  it('affords a project that costs exactly the Labor available', () => {
    // The boundary, because `<` and `<=` differ only here.
    expect(
      checkClearing(campaignWith(farm()), { slot: 'ruined-chicken-coop', labor: 2 }).blockers,
    ).toEqual([]);
  });
});

describe('withSlotCleared', () => {
  it('records the clearing and adds what it yields', () => {
    const after = withSlotCleared(campaignWith(farm()), {
      slot: 'ruined-chicken-coop',
      labor: 2,
    });

    expect(after.base?.slots['ruined-chicken-coop']).toEqual({ cleared: true });
    // Only Hardware moves; a project that credited every material would show up
    // in the three that did not change.
    expect(after.materials).toEqual({ food: 1, fuel: 2, hardware: 5, rare: 4 });
  });

  it('adds nothing for a project whose yield this version cannot hold', () => {
    // The Outdoor Sports Shop's Inventory slot gives four standard weapons, and
    // Phase 5 owns the item catalogue. The clearing still happens.
    const after = withSlotCleared(campaignWith(shop()), { slot: 'inventory', labor: 2 });

    expect(after.base?.slots.inventory).toEqual({ cleared: true });
    expect(after.materials).toEqual({ food: 1, fuel: 2, hardware: 3, rare: 4 });
  });

  it('keeps what else the slot recorded', () => {
    const after = withSlotCleared(campaignWith(farm({ 'ruined-chicken-coop': { power: true } })), {
      slot: 'ruined-chicken-coop',
      labor: 2,
    });

    expect(after.base?.slots['ruined-chicken-coop']).toEqual({ power: true, cleared: true });
  });

  it('refuses a blocked clearing and changes nothing at all', () => {
    const poor = campaignWith(farm());

    expect(withSlotCleared(poor, { slot: 'ruined-chicken-coop', labor: 0 })).toBe(poor);
  });

  it('does nothing to a slot with no project, or a campaign with no base', () => {
    const noProject = campaignWith(farm());
    const noBase = campaignWith(null);

    expect(withSlotCleared(noProject, { slot: 'front-yard', labor: 9 })).toBe(noProject);
    expect(withSlotCleared(noBase, { slot: 'ruined-chicken-coop', labor: 9 })).toBe(noBase);
  });

  it('clears once and refuses the second time', () => {
    const once = withSlotCleared(campaignWith(farm()), { slot: 'ruined-chicken-coop', labor: 2 });
    const twice = withSlotCleared(once, { slot: 'ruined-chicken-coop', labor: 2 });

    // Otherwise the yield is a Hardware fountain.
    expect(twice).toBe(once);
    expect(twice.materials.hardware).toBe(5);
  });
});
