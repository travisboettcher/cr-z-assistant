import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { checkUpgrade, upgradesFor, withUpgradeBuilt } from './upgrade';
import { projectTeamWorth } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

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

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

/** The Small Town Home's kitchen is a built-in the base leaves upgradable. */
const home = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

describe('upgradesFor', () => {
  it('lists every upgrade the facility offers, installed ones included', () => {
    // Repeats are legal and count separately, so hiding an installed upgrade
    // would hide a legal build.
    const base = home({ 'bunk-room-1': { upgrades: ['extra-bed'] } });
    const ids = upgradesFor(campaignWith(base), 'bunk-room-1').map((upgrade) => upgrade.id);

    expect(ids).toEqual(['extra-bed', 'loft', 'lounge']);
  });

  it('lists nothing for a slot with nothing in it', () => {
    expect(upgradesFor(campaignWith(home()), 'garage')).toEqual([]);
  });

  it('lists nothing for a campaign with no base, rather than reaching for one', () => {
    expect(upgradesFor(campaignWith(null), 'kitchen')).toEqual([]);
  });
});

describe('checkUpgrade', () => {
  it('finds nothing wrong with an upgrade a facility can take', () => {
    const check = checkUpgrade(campaignWith(home()), {
      slot: 'kitchen',
      upgrade: 'gas-range',
    });

    expect(check).toEqual({ blockers: [], warnings: [] });
  });

  it('refuses an empty slot and an upgrade of another facility', () => {
    const empty = checkUpgrade(campaignWith(home()), {
      slot: 'garage',
      upgrade: 'gas-range',
    });
    const foreign = checkUpgrade(campaignWith(home()), {
      slot: 'kitchen',
      upgrade: 'spotlight',
    });

    expect(codes(empty.blockers)).toEqual(['nothing-to-upgrade']);
    expect(empty.warnings).toEqual([]);
    // Not a house rule the app can honour: `occupants` drops a misfiled
    // upgrade, so it would sit in the save contributing nothing.
    expect(codes(foreign.blockers)).toEqual(['not-this-facility']);
    expect(foreign.warnings).toEqual([]);
  });

  it('refuses an upgrade the community cannot pay for', () => {
    const poor = campaignWith(home(), {
      materials: { food: 0, fuel: 0, hardware: 1, rare: 0 },
      ...projectTeamWorth(0),
    });

    const check = checkUpgrade(poor, { slot: 'kitchen', upgrade: 'gas-range' });

    expect(codes(check.blockers)).toEqual(['not-enough-hardware', 'not-enough-labor']);
    expect(check.warnings).toEqual([]);
  });

  it('warns on the turn the facility went up, and stops on the next', () => {
    const built = campaignWith(
      home({ garage: { built: { facility: 'kitchen', builtOnTurn: 4 } } }),
    );

    expect(codes(checkUpgrade(built, { slot: 'garage', upgrade: 'gas-range' }).warnings)).toEqual([
      'built-this-turn',
    ]);

    // The same campaign a turn later.
    expect(
      checkUpgrade({ ...built, turn: 5 }, { slot: 'garage', upgrade: 'gas-range' }).warnings,
    ).toEqual([]);
  });

  it('never blocks a built-in on the same-turn rule, because it was never built', () => {
    // `builtOnTurn` is null for a facility the base came with, so the rule has
    // nothing to compare against on any turn.
    expect(
      checkUpgrade(campaignWith(home()), { slot: 'kitchen', upgrade: 'gas-range' }).warnings,
    ).toEqual([]);
  });

  it('warns at the cap of three, and lets a rare upgrade past it', () => {
    const full = campaignWith(
      home({ kitchen: { upgrades: ['gas-range', 'gas-range', 'gas-range'] } }),
    );

    expect(codes(checkUpgrade(full, { slot: 'kitchen', upgrade: 'gas-range' }).warnings)).toEqual([
      'cap-reached',
    ]);

    // Nothing in the core table is rare, so the exemption is asserted through
    // the branch that reads the flag rather than through data Phase 5 will add.
    const nearlyFull = campaignWith(home({ kitchen: { upgrades: ['gas-range', 'gas-range'] } }));
    expect(checkUpgrade(nearlyFull, { slot: 'kitchen', upgrade: 'gas-range' }).warnings).toEqual(
      [],
    );
  });

  it('warns that a locked built-in takes nothing further, rather than citing a cap', () => {
    // The Summer Camp's bunk rooms ship two Extra Beds and are locked. The cap
    // is not the reason, and reporting it would send a reader to the wrong rule.
    const check = checkUpgrade(campaignWith({ id: 'summer-camp', slots: {} }), {
      slot: 'bunk-room-1',
      upgrade: 'extra-bed',
    });

    expect(codes(check.warnings)).toEqual(['facility-locked']);
  });

  it('affords an upgrade that costs exactly what is available', () => {
    // The boundary, asserted because `<` and `<=` differ only here: a Gas Range
    // costs 2 Hardware and 1 Labor.
    const exact = campaignWith(home(), {
      materials: { food: 0, fuel: 0, hardware: 2, rare: 0 },
      ...projectTeamWorth(1),
    });

    expect(checkUpgrade(exact, { slot: 'kitchen', upgrade: 'gas-range' })).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  /**
   * Two shapes of "nothing to exclude", because they fail differently.
   *
   * A Garden with **no** upgrades catches a check that asks whether *every*
   * installed upgrade is the excluded one — vacuously true of an empty list. A
   * Garden with **one that is not** the excluded one catches a check that has
   * stopped comparing ids and merely counts what is installed. Either fixture
   * alone passes against the other's bug.
   */
  it.each([
    ['nothing installed', [] as const],
    ['something else installed', ['herb-plot'] as const],
  ])('says nothing about an exclusion the facility has not got: %s', (_label, upgrades) => {
    const garden = home({
      'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: [...upgrades] },
    });

    expect(
      checkUpgrade(campaignWith(garden), { slot: 'front-yard', upgrade: 'greenhouse' }).warnings,
    ).toEqual([]);
  });

  it('warns about a second Fence, which a Garden may only have one of', () => {
    const base = home({
      'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: ['fence'] },
    });

    expect(
      codes(checkUpgrade(campaignWith(base), { slot: 'front-yard', upgrade: 'fence' }).warnings),
    ).toEqual(['one-per-facility']);
  });

  it('warns that a Greenhouse cannot sit alongside the Fence it excludes', () => {
    // The Garden holds an upgrade that is not excluded alongside the one that
    // is, so a check that asks "are they *all* the excluded one" gets a
    // different answer from one that asks "is any of them".
    const base = home({
      'front-yard': {
        built: { facility: 'garden', builtOnTurn: 1 },
        upgrades: ['fence', 'herb-plot'],
      },
    });

    expect(
      codes(
        checkUpgrade(campaignWith(base), { slot: 'front-yard', upgrade: 'greenhouse' }).warnings,
      ),
    ).toEqual(['excluded-by-another']);
  });

  it('refuses a campaign with no base', () => {
    const check = checkUpgrade(campaignWith(null), {
      slot: 'kitchen',
      upgrade: 'gas-range',
    });

    expect(codes(check.blockers)).toEqual(['no-base']);
    expect(check.warnings).toEqual([]);
  });
});

describe('withUpgradeBuilt', () => {
  it('adds the upgrade and spends its Hardware', () => {
    const after = withUpgradeBuilt(campaignWith(home()), {
      slot: 'kitchen',
      upgrade: 'gas-range',
    });

    expect(after.base?.slots.kitchen?.upgrades).toEqual(['gas-range']);
    // A Gas Range costs 2 Hardware.
    expect(after.materials.hardware).toBe(18);
  });

  it('appends rather than replaces, so repeats stack', () => {
    const after = withUpgradeBuilt(
      campaignWith(home({ 'bunk-room-1': { upgrades: ['extra-bed'] } })),
      {
        slot: 'bunk-room-1',
        upgrade: 'extra-bed',
      },
    );

    expect(after.base?.slots['bunk-room-1']?.upgrades).toEqual(['extra-bed', 'extra-bed']);
  });

  it('keeps what else the slot recorded', () => {
    const after = withUpgradeBuilt(
      campaignWith(home({ kitchen: { power: true, cleared: true } })),
      { slot: 'kitchen', upgrade: 'gas-range' },
    );

    expect(after.base?.slots.kitchen).toEqual({
      power: true,
      cleared: true,
      upgrades: ['gas-range'],
    });
  });

  it('spends what the chosen upgrade costs, not what the first one does', () => {
    // A Biofuel Lab is the Kitchen's third upgrade and costs 3 Hardware where
    // the Refrigerator costs 2 — so picking the wrong entry is visible here.
    const after = withUpgradeBuilt(campaignWith(home()), {
      slot: 'kitchen',
      upgrade: 'biofuel-lab',
    });

    expect(after.base?.slots.kitchen?.upgrades).toEqual(['biofuel-lab']);
    expect(after.materials.hardware).toBe(17);
  });

  it('does nothing to a slot with nothing in it', () => {
    const empty = campaignWith(home());

    expect(withUpgradeBuilt(empty, { slot: 'garage', upgrade: 'gas-range' })).toBe(empty);
  });

  it('refuses a blocked upgrade and changes nothing at all', () => {
    const poor = campaignWith(home(), { materials: { food: 0, fuel: 0, hardware: 0, rare: 0 } });

    expect(withUpgradeBuilt(poor, { slot: 'kitchen', upgrade: 'gas-range' })).toBe(poor);
  });

  it('goes through a warning, because proceeding past one is the player’s call', () => {
    const full = campaignWith(
      home({ kitchen: { upgrades: ['gas-range', 'gas-range', 'gas-range'] } }),
    );
    const after = withUpgradeBuilt(full, { slot: 'kitchen', upgrade: 'gas-range' });

    expect(after.base?.slots.kitchen?.upgrades).toHaveLength(4);
  });

  it('does nothing to a campaign with no base', () => {
    const none = campaignWith(null);

    expect(withUpgradeBuilt(none, { slot: 'kitchen', upgrade: 'gas-range' })).toBe(none);
  });
});
