import { describe, expect, it } from 'vitest';
import { clearingProject } from './base';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { checkClearing, clearingYield } from './clearing';
import { projectTeamWorth } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function campaignWith(base: Base | null, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    materials: { food: 1, fuel: 2, hardware: 3, rare: 4 },
    // A project team big enough that Labor is never the thing under test. The
    // pool is the summed Tier levels of whoever is on it (pg. 20), so the tests
    // that *are* about Labor override this with a smaller one.
    ...projectTeamWorth(9),
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
    expect(clearingProject(campaignWith(farm()), 'ruined-chicken-coop')).toMatchObject({});
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
    expect(checkClearing(campaignWith(farm()), { slot: 'ruined-chicken-coop' })).toEqual({
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
    ['a campaign with no base', campaignWith(null), 'ruined-chicken-coop', 'no-base'],
    ['a slot this base does not have', campaignWith(farm()), 'wine-cellar', 'no-such-slot'],
    ['a slot with nothing blocking it', campaignWith(farm()), 'front-yard', 'nothing-to-clear'],
    [
      'a slot already cleared',
      campaignWith(farm({ 'ruined-chicken-coop': { cleared: true } })),
      'ruined-chicken-coop',
      'already-cleared',
    ],
    [
      'too little Labor',
      campaignWith(farm(), { ...projectTeamWorth(1) }),
      'ruined-chicken-coop',
      'not-enough-labor',
    ],
  ])('refuses %s, with nothing to override', (_label, campaign, slot, expected) => {
    const check = checkClearing(campaign, { slot });

    expect(codes(check.blockers)).toEqual([expected]);
    expect(check.warnings).toEqual([]);
  });

  it('affords a project that costs exactly the Labor available', () => {
    // The boundary, because `<` and `<=` differ only here — so the team has to
    // be worth exactly the coop's two Labor rather than the comfortable nine.
    const exact = campaignWith(farm(), { ...projectTeamWorth(2) });

    expect(checkClearing(exact, { slot: 'ruined-chicken-coop' }).blockers).toEqual([]);
  });
});
