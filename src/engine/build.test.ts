import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { buildableFacilities, checkBuild } from './build';
import { projectTeamWorth } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

/** A campaign with a base, plenty of Hardware, and a turn worth pointing at. */
function campaignWith(base: Base | null, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    materials: { food: 0, fuel: 0, hardware: 20, rare: 0 },
    // A project team big enough that Labor is never the thing under test. The
    // pool is the summed Tier levels of whoever is on it (pg. 20), so the tests
    // that *are* about Labor override this with a smaller one.
    ...projectTeamWorth(9),
    turn: 4,
    base,
    ...overrides,
  };
}

const smallTownHome = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

describe('checkBuild', () => {
  it('finds nothing wrong with a facility that fits', () => {
    // The Small Town Home's garage is an indoor slot; a Workshop needs no
    // particular kind and costs 3 Hardware and 2 Labor.
    const check = checkBuild(campaignWith(smallTownHome()), {
      slot: 'garage',
      facility: 'workshop',
    });

    expect(check).toEqual({ blockers: [], warnings: [] });
  });

  it('refuses a slot that already holds something', () => {
    const check = checkBuild(campaignWith(smallTownHome()), {
      slot: 'kitchen',
      facility: 'workshop',
    });

    expect(codes(check.blockers)).toContain('slot-occupied');
  });

  it('refuses a slot whose rubble has not been cleared, and allows it once it has', () => {
    const blocked = checkBuild(campaignWith({ id: 'hobby-farm', slots: {} }), {
      slot: 'ruined-chicken-coop',
      facility: 'garden',
    });
    const cleared = checkBuild(
      campaignWith({ id: 'hobby-farm', slots: { 'ruined-chicken-coop': { cleared: true } } }),
      { slot: 'ruined-chicken-coop', facility: 'garden' },
    );

    expect(codes(blocked.blockers)).toContain('slot-not-cleared');
    expect(cleared.blockers).toEqual([]);
  });

  it('refuses a build the community cannot pay for, in either currency', () => {
    const poor = campaignWith(smallTownHome(), {
      materials: { food: 0, fuel: 0, hardware: 1, rare: 0 },
      ...projectTeamWorth(1),
    });

    const check = checkBuild(poor, { slot: 'garage', facility: 'workshop' });

    expect(codes(check.blockers)).toEqual(['not-enough-hardware', 'not-enough-labor']);
    // Affordability is never a warning: there is no override for arithmetic.
    expect(check.warnings).toEqual([]);
  });

  it('warns rather than refuses when the slot is the wrong kind', () => {
    // A Garden needs an outdoor slot; the garage is indoor.
    const check = checkBuild(campaignWith(smallTownHome()), {
      slot: 'garage',
      facility: 'garden',
    });

    expect(check.blockers).toEqual([]);
    expect(codes(check.warnings)).toEqual(['wrong-slot-kind']);
  });

  it('warns about an origin this campaign is not running, and stops once it is', () => {
    const none = checkBuild(campaignWith(smallTownHome()), {
      slot: 'garage',
      facility: 'mystic-library',
    });
    const magic = checkBuild(campaignWith(smallTownHome(), { origin: 'magic' }), {
      slot: 'garage',
      facility: 'mystic-library',
    });

    expect(codes(none.warnings)).toContain('origin-locked');
    expect(codes(magic.warnings)).not.toContain('origin-locked');
    // The mission gate outlives the origin gate: Phase 4 owns which mission.
    expect(codes(magic.warnings)).toEqual(['mission-locked']);
  });

  it('refuses a campaign with no base, and a slot the base does not have', () => {
    // The whole shape, not just the blockers: neither of these is a rule the
    // player may wave through, so both must come back with nothing to override.
    const none = checkBuild(campaignWith(null), {
      slot: 'garage',
      facility: 'workshop',
    });
    const missing = checkBuild(campaignWith(smallTownHome()), {
      slot: 'wine-cellar',
      facility: 'workshop',
    });

    expect(codes(none.blockers)).toEqual(['no-base']);
    expect(none.warnings).toEqual([]);
    expect(codes(missing.blockers)).toEqual(['no-such-slot']);
    expect(missing.warnings).toEqual([]);
  });

  it('affords a build that costs exactly what the community holds', () => {
    // The boundary, asserted because `<` and `<=` differ only here: a Workshop
    // costs 3 Hardware and 2 Labor, and exactly enough is enough.
    const exact = campaignWith(smallTownHome(), {
      materials: { food: 0, fuel: 0, hardware: 3, rare: 0 },
      ...projectTeamWorth(2),
    });

    expect(checkBuild(exact, { slot: 'garage', facility: 'workshop' })).toEqual({
      blockers: [],
      warnings: [],
    });
  });
});

describe('buildableFacilities', () => {
  it('leaves out the facilities of an origin this campaign is not running', () => {
    const ids = buildableFacilities(campaignWith(smallTownHome())).map((facility) => facility.id);

    expect(ids).not.toContain('mystic-library');
    expect(ids).toContain('workshop');
  });

  it('offers an origin’s own facility to a campaign running it', () => {
    const ids = buildableFacilities(campaignWith(smallTownHome(), { origin: 'magic' })).map(
      (facility) => facility.id,
    );

    expect(ids).toContain('mystic-library');
  });
});
