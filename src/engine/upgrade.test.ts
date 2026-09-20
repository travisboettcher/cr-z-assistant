import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { FACILITIES, facilityOfUpgrade, type FacilityId, type Upgrade } from '../data/facilities';
import { checkUpgrade, upgradeOrder, upgradesFor } from './upgrade';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function campaignWith(base: Base | null, overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    materials: { food: 0, fuel: 0, hardware: 20, rare: 0 },
    // A project team big enough that Labor is never the thing under test. The
    // pool is the summed Tier levels of whoever is on it (pg. 20), so the tests
    // that *are* about Labor override this with a smaller one.
    ...projectTeamWorth(9),
    turn: 4,
    base,
    ...overrides,
  });
}

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

/** The Small Town Home's kitchen is a built-in the base leaves upgradable. */
const home = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

/** Every upgrade in the catalogue, which is where a rule about upgrades lives. */
const UPGRADES: readonly Upgrade[] = Object.values(FACILITIES).flatMap(
  (facility) => facility.upgrades as readonly Upgrade[],
);

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

    const [capped] = checkUpgrade(full, { slot: 'kitchen', upgrade: 'gas-range' }).warnings;

    expect(capped?.code).toBe('cap-reached');

    // Three built and none ordered: the message says nothing about a queue,
    // because there is no queue to say anything about.
    expect(capped?.message).not.toContain('on order');

    // Nothing in the core table is rare, so the exemption is asserted through
    // the branch that reads the flag rather than through data Phase 5 will add.
    const nearlyFull = campaignWith(home({ kitchen: { upgrades: ['gas-range', 'gas-range'] } }));
    expect(checkUpgrade(nearlyFull, { slot: 'kitchen', upgrade: 'gas-range' }).warnings).toEqual(
      [],
    );
  });

  /**
   * The cap counts the queue (#140). Three upgrades ordered for one facility in
   * a single Planning Phase all passed a check reading installed state, and the
   * base sheet then reported "4 of 3"; five Spotlights made it "5 of 3".
   */
  it('counts upgrades on order against the cap, and says how many are on order', () => {
    const ordered = (count: number): Campaign =>
      campaignWith(home({ kitchen: { upgrades: ['gas-range'] } }), {
        projects: Array.from({ length: count }, () => ({
          kind: 'upgrade' as const,
          slot: 'kitchen',
          upgrade: 'gas-range' as const,
          orderedOnTurn: 4,
        })),
      });

    // One installed and one on order leaves the third slot free.
    expect(checkUpgrade(ordered(1), { slot: 'kitchen', upgrade: 'gas-range' }).warnings).toEqual(
      [],
    );

    const [full] = checkUpgrade(ordered(2), { slot: 'kitchen', upgrade: 'gas-range' }).warnings;

    expect(full?.code).toBe('cap-reached');
    expect(full?.message).toContain('(2 on order)');
  });

  /**
   * `maxPerFacility` counts it too: two Greenhouses went onto one Garden in one
   * turn, against a limit of 1, and neither order said anything.
   */
  it('counts a copy on order against maxPerFacility', () => {
    const garden = campaignWith(
      home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } }),
      {
        projects: [
          { kind: 'upgrade', slot: 'front-yard', upgrade: 'greenhouse', orderedOnTurn: 4 },
        ],
      },
    );

    const [limit] = checkUpgrade(garden, { slot: 'front-yard', upgrade: 'greenhouse' }).warnings;

    expect(limit?.code).toBe('one-per-facility');
    expect(limit?.message).toContain('(1 on order)');

    // And the count is of *this* upgrade: a Herb Plot on order for the same
    // Garden is one of the three, and not a second Greenhouse.
    const mixed = {
      ...garden,
      projects: [
        ...garden.projects,
        {
          kind: 'upgrade' as const,
          slot: 'front-yard',
          upgrade: 'herb-plot' as const,
          orderedOnTurn: 4,
        },
      ],
    };

    const [still] = checkUpgrade(mixed, { slot: 'front-yard', upgrade: 'greenhouse' }).warnings;

    expect(still?.code).toBe('one-per-facility');
    expect(still?.message).toContain('(1 on order)');
  });

  /**
   * A clearing queued for a slot is not an upgrade on it. Only the queue knows
   * the difference — the count walks `campaign.projects`, where the three
   * kinds sit side by side.
   */
  it('counts only upgrade orders, and not the other two kinds', () => {
    // Full on installed upgrades, so the cap is reported either way, and the
    // question is only whether the clearing gets counted into the message.
    const farm = campaignWith(
      home({ kitchen: { upgrades: ['gas-range', 'gas-range', 'gas-range'] } }),
      { projects: [{ kind: 'clearing', slot: 'kitchen', orderedOnTurn: 4 }] },
    );

    const [capped] = checkUpgrade(farm, { slot: 'kitchen', upgrade: 'gas-range' }).warnings;

    expect(capped?.code).toBe('cap-reached');
    expect(capped?.message).not.toContain('on order');
  });

  /** And a queue for another slot is another slot's business. */
  it('counts only what is on order for this facility', () => {
    const elsewhere = campaignWith(home({ kitchen: { upgrades: ['gas-range', 'gas-range'] } }), {
      projects: [{ kind: 'upgrade', slot: 'bunk-room-1', upgrade: 'extra-bed', orderedOnTurn: 4 }],
    });

    expect(checkUpgrade(elsewhere, { slot: 'kitchen', upgrade: 'gas-range' }).warnings).toEqual([]);
  });

  /**
   * R2-M6 (#146): `checkUpgrade` did not read `requires` at all, so a Recovery
   * Room went onto an outdoor Medical Clinic and made its 2 Health, Solar
   * Panels and Rain Collectors worked indoors, and Shelving raised the Hardware
   * cap outdoors. `build.ts` has checked the same rule for facilities, in the
   * same words, on the same screen, since Phase 2.
   *
   * Walked over the whole catalogue rather than over the four the playtest
   * found: an upgrade added with a `requires.slot` nobody thinks to test is
   * exactly how this one survived two phases. The facility is built into a slot
   * of each kind — which the app permits, because Z1-7 lets a player override
   * the placement — so both directions are asserted for every entry.
   */
  describe('an upgrade that names a slot kind', () => {
    const SLOT_OF = { indoor: 'garage', outdoor: 'front-yard' } as const;

    const withFacilityIn = (kind: 'indoor' | 'outdoor', facility: FacilityId): Campaign =>
      campaignWith(home({ [SLOT_OF[kind]]: { built: { facility, builtOnTurn: 1 } } }));

    const named = UPGRADES.filter((upgrade) => upgrade.requires?.slot !== undefined);

    it('is a rule several upgrades in the catalogue carry', () => {
      // The guard against this whole block quietly testing nothing.
      expect(named.map((upgrade) => upgrade.id)).toEqual(
        expect.arrayContaining(['recovery-room', 'solar-panel', 'rain-collector', 'shelving']),
      );
    });

    it.each(named.map((upgrade) => [upgrade.id, upgrade] as const))(
      'warns when %s is ordered into the other kind of slot, and not into its own',
      (id, upgrade) => {
        const wanted = upgrade.requires?.slot as 'indoor' | 'outdoor';
        const other = wanted === 'indoor' ? 'outdoor' : 'indoor';
        const facility = facilityOfUpgrade(id)?.id as FacilityId;

        const wrong = checkUpgrade(withFacilityIn(other, facility), {
          slot: SLOT_OF[other],
          upgrade: id,
        });
        const right = checkUpgrade(withFacilityIn(wanted, facility), {
          slot: SLOT_OF[wanted],
          upgrade: id,
        });

        expect(codes(wrong.warnings)).toContain('wrong-slot-kind');
        expect(codes(right.warnings)).not.toContain('wrong-slot-kind');
      },
    );

    /** The same sentence the facility check prints, because it is the same rule. */
    it('says it the way the build check says it', () => {
      const [warning] = checkUpgrade(withFacilityIn('outdoor', 'medical-clinic'), {
        slot: SLOT_OF.outdoor,
        upgrade: 'recovery-room',
      }).warnings;

      expect(warning?.message).toBe('Needs an indoor slot, and this one is outdoor.');
    });
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

  /**
   * The Greenhouse *replaces* the Fence rather than being refused beside it
   * (pg. 72), so nothing here is a rule the table is playing past. This used to
   * warn that the two "cannot sit alongside" each other, which is a sentence
   * the book does not contain.
   */
  it('finds nothing wrong with a Greenhouse over the Fence it replaces', () => {
    // The Garden holds an upgrade that is not excluded alongside the one that
    // is, so a check that asks "are they *all* the excluded one" gets a
    // different answer from one that asks "is any of them".
    const base = home({
      'front-yard': {
        built: { facility: 'garden', builtOnTurn: 1 },
        upgrades: ['fence', 'herb-plot'],
      },
    });

    const check = checkUpgrade(campaignWith(base), {
      slot: 'front-yard',
      upgrade: 'greenhouse',
    });

    expect(check).toEqual({ blockers: [], warnings: [] });
    expect(
      upgradeOrder(campaignWith(base), { slot: 'front-yard', upgrade: 'greenhouse' }).replaces,
    ).toEqual(['fence']);
  });

  /** Four Hardware, less the one the Fence it stands in for is worth (pg. 72). */
  it('prices a Greenhouse a Hardware cheaper over a Fence, and refuses it below that', () => {
    const fenced = home({
      'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: ['fence'] },
    });
    const bare = home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } });
    const request = { slot: 'front-yard', upgrade: 'greenhouse' } as const;

    expect(upgradeOrder(campaignWith(bare), request).cost).toEqual({ hardware: 4, labor: 4 });
    expect(upgradeOrder(campaignWith(fenced), request).cost).toEqual({ hardware: 3, labor: 4 });

    // Three is enough over a Fence and not enough over a bare Garden, which is
    // the whole of what the discount does.
    const three = { food: 0, fuel: 0, hardware: 3, rare: 0 };

    expect(
      codes(checkUpgrade(campaignWith(fenced, { materials: three }), request).blockers),
    ).toEqual([]);
    expect(codes(checkUpgrade(campaignWith(bare, { materials: three }), request).blockers)).toEqual(
      ['not-enough-hardware'],
    );
  });

  it('replaces nothing where there is nothing it excludes', () => {
    const bare = home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } });

    expect(
      upgradeOrder(campaignWith(bare), { slot: 'front-yard', upgrade: 'greenhouse' }).replaces,
    ).toEqual([]);
  });

  /**
   * Two shapes a queue outliving its slot can ask about, and neither is an
   * error: the screen wants a number for whatever it is showing, and nothing
   * is the truthful one.
   */
  it('costs nothing and replaces nothing where there is no such facility or upgrade', () => {
    const bare = home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } });
    const nothing = { cost: { hardware: 0, labor: 0 }, replaces: [] };

    // An empty slot, and then a Garden asked about an upgrade the Storage Area
    // owns.
    expect(upgradeOrder(campaignWith(bare), { slot: 'garage', upgrade: 'greenhouse' })).toEqual(
      nothing,
    );
    expect(upgradeOrder(campaignWith(bare), { slot: 'front-yard', upgrade: 'shelving' })).toEqual(
      nothing,
    );
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
