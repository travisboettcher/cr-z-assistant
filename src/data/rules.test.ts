import { describe, expect, it } from 'vitest';
import { commonSkillScoreCost, skillLevelCost, tierCost } from './advancement';
import {
  D10_RESULTS,
  FIELD_RECRUITABLE_TIERS,
  PLAYERS_CHOICE,
  RECRUIT_SKILL_TABLE,
  TIERS_WITH_ROLLED_SKILL,
} from './recruitTable';
import {
  COMMON_SKILLS,
  COMMON_SKILL_MAX_SCORE,
  COMMON_SKILL_START_SCORE,
  SKILLS,
  SKILL_STATS,
  STATS,
  type Stat,
} from './skills';
import { STARTING_COMMUNITY_TIER_LEVELS, TIERS, TIER_RULES, type Tier } from './tiers';
import { BASES, BASE_IDS, maxHeroes, type BaseId, type BaseSlot } from './bases';
import {
  FACILITIES,
  FACILITY_IDS,
  MAX_UPGRADES_PER_FACILITY,
  facilityOfUpgrade,
  type Facility,
  type Upgrade,
  type UpgradeId,
  type Utility,
} from './facilities';
import { STORAGE_ABOVE_TIER, STORED_MATERIALS, type StoredMaterial } from './materials';
import { CAMPAIGN_ORIGINS } from './origins';

describe('stats and skills', () => {
  it('has four stats and twenty governed skills', () => {
    expect(STATS).toHaveLength(4);
    expect(SKILLS).toHaveLength(20);
  });

  it('governs exactly five skills with each stat', () => {
    const counts = new Map<Stat, number>(STATS.map((stat) => [stat, 0]));

    for (const skill of SKILLS) {
      const stat = SKILL_STATS[skill];
      counts.set(stat, (counts.get(stat) ?? 0) + 1);
    }

    expect([...counts.values()]).toEqual([5, 5, 5, 5]);
  });

  it('lists no skill twice', () => {
    expect(new Set(SKILLS).size).toBe(SKILLS.length);
  });

  it('keeps the common skills separate from the governed ones, with no stat', () => {
    expect(COMMON_SKILLS).toEqual(['move', 'defense']);
    expect(COMMON_SKILL_START_SCORE).toBe(6);
    expect(COMMON_SKILL_MAX_SCORE).toBe(8);

    // A common skill is not a governed skill, so it cannot be looked up in the
    // stat table. This is the shape doing its job: there is no such thing as
    // the governing stat of Move.
    for (const common of COMMON_SKILLS) {
      expect(SKILLS).not.toContain(common);
    }
  });
});

describe('tier table', () => {
  it('has four tiers', () => {
    expect(TIERS).toEqual([1, 2, 3, 4]);
  });

  it('gives each tier its stat array', () => {
    expect(TIER_RULES[1].statArray).toEqual([1, 0, 0, 0]);
    expect(TIER_RULES[2].statArray).toEqual([2, 1, 0, 0]);
    expect(TIER_RULES[3].statArray).toEqual([3, 2, 1, 0]);
    expect(TIER_RULES[4].statArray).toEqual([4, 3, 2, 1]);
  });

  it('gives every tier a stat array of exactly four values', () => {
    for (const tier of TIERS) {
      expect(TIER_RULES[tier].statArray).toHaveLength(4);
    }
  });

  it('sets skill slots, max skill level, max HP, labor and base Inventory Slots to the tier number', () => {
    // These five coincide today but are five separate rules from four pages.
    // Asserted per column rather than in a loop over a derived value, so a
    // rules change to one of them fails here instead of quietly agreeing with
    // itself.
    for (const tier of TIERS) {
      const rules = TIER_RULES[tier];
      expect(rules.skillSlots).toBe(tier);
      expect(rules.maxSkillLevel).toBe(tier);
      expect(rules.maxHp).toBe(tier);
      expect(rules.labor).toBe(tier);
      expect(rules.baseInventorySlots).toBe(tier);
    }
  });

  it('builds a starting community from ten tier levels', () => {
    expect(STARTING_COMMUNITY_TIER_LEVELS).toBe(10);

    // The rulebook's recommended opening — one Hero and two Leaders — spends
    // the budget exactly, which is presumably why it is the recommendation.
    // Anything else trades those three for a wider community.
    const recommended: readonly Tier[] = [4, 3, 3];
    const spread: readonly Tier[] = [4, 2, 2, 1, 1];

    expect(recommended.reduce((total, tier) => total + tier, 0)).toBe(
      STARTING_COMMUNITY_TIER_LEVELS,
    );
    expect(spread.reduce((total, tier) => total + tier, 0)).toBe(STARTING_COMMUNITY_TIER_LEVELS);
  });
});

describe('advancement costs', () => {
  it('charges a governed skill its new level', () => {
    expect(skillLevelCost(1)).toBe(1);
    expect(skillLevelCost(2)).toBe(2);
    expect(skillLevelCost(4)).toBe(4);
  });

  it('charges a common skill its new score, which is not the same quantity', () => {
    expect(commonSkillScoreCost(7)).toBe(7);
    expect(commonSkillScoreCost(COMMON_SKILL_MAX_SCORE)).toBe(8);

    // The bug this guards: reading pg. 18 once and charging Move as though it
    // had a level. Raising Move from its starting 6 is the seventh step, and
    // costs 7 — not 1.
    expect(commonSkillScoreCost(COMMON_SKILL_START_SCORE + 1)).not.toBe(skillLevelCost(1));
  });

  it('charges a tier twice the new tier', () => {
    expect(tierCost(2)).toBe(4);
    expect(tierCost(3)).toBe(6);
    expect(tierCost(4)).toBe(8);
  });
});

describe('recruit table', () => {
  it('covers all ten d10 results', () => {
    expect(D10_RESULTS).toHaveLength(10);

    for (const result of D10_RESULTS) {
      expect(RECRUIT_SKILL_TABLE[result]).toBeDefined();
    }
  });

  it('rolls nine distinct skills and one player choice', () => {
    const rolled = D10_RESULTS.map((result) => RECRUIT_SKILL_TABLE[result]);
    const skills = rolled.filter((entry) => entry !== PLAYERS_CHOICE);

    expect(skills).toHaveLength(9);
    expect(new Set(skills).size).toBe(9);
    expect(rolled.filter((entry) => entry === PLAYERS_CHOICE)).toHaveLength(1);
  });

  it('rolls only skills that exist', () => {
    for (const result of D10_RESULTS) {
      const entry = RECRUIT_SKILL_TABLE[result];
      if (entry === PLAYERS_CHOICE) continue;

      expect(SKILLS).toContain(entry);
    }
  });

  it('never recruits a hero in the field, and never rolls a rookie a skill', () => {
    expect(FIELD_RECRUITABLE_TIERS).not.toContain(4);
    expect(TIERS_WITH_ROLLED_SKILL).not.toContain(1);

    // Every tier that rolls must be a tier that can be recruited at all.
    for (const tier of TIERS_WITH_ROLLED_SKILL) {
      expect(FIELD_RECRUITABLE_TIERS).toContain(tier);
    }
  });
});

/** Every facility in the table, as `Facility` rather than its literal type. */
const FACILITIES_LIST: readonly Facility[] = FACILITY_IDS.map((id) => FACILITIES[id] as Facility);

const UPGRADES_LIST: readonly Upgrade[] = FACILITIES_LIST.flatMap((facility) => facility.upgrades);

describe('facility table', () => {
  it('costs Hardware and Labor for every facility and upgrade', () => {
    for (const entry of [...FACILITIES_LIST, ...UPGRADES_LIST]) {
      expect(entry.cost.hardware).toBeGreaterThanOrEqual(0);
      expect(entry.cost.labor).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every facility and upgrade at least one effect', () => {
    for (const entry of [...FACILITIES_LIST, ...UPGRADES_LIST]) {
      expect(Object.keys(entry.effects).length).toBeGreaterThan(0);
    }
  });

  it('names each upgrade once across the whole table', () => {
    // `facilityOfUpgrade` returns one facility, so a duplicated id would make it
    // answer arbitrarily rather than wrongly, which is worse.
    const ids = UPGRADES_LIST.map((upgrade) => upgrade.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every upgrade a facility', () => {
    for (const upgrade of UPGRADES_LIST) {
      expect(facilityOfUpgrade(upgrade.id)).toBeDefined();
    }
  });

  it('gates only on origins that exist', () => {
    for (const entry of [...FACILITIES_LIST, ...UPGRADES_LIST]) {
      const origin = entry.requires?.origin;
      if (origin === undefined) continue;

      expect(CAMPAIGN_ORIGINS).toContain(origin);
    }
  });

  it('excludes only upgrades of the same facility', () => {
    for (const facility of FACILITIES_LIST) {
      const siblings = facility.upgrades.map((upgrade) => upgrade.id);

      for (const upgrade of facility.upgrades) {
        for (const excluded of upgrade.constraints?.excludes ?? []) {
          expect(siblings).toContain(excluded);
        }
      }
    }
  });

  it('staffs a facility for every skill-driven production', () => {
    for (const facility of FACILITIES_LIST) {
      const needsStaff = (facility.effects.production ?? []).some(
        (production) => production.kind !== 'flat',
      );

      if (needsStaff) expect(facility.staffed).toBe(true);
    }
  });

  it('never has an upgrade demand its own staff', () => {
    // Upgrades widen a facility's staffing and never require any (pg. 54), so
    // no upgrade produces from a skill of its own.
    for (const upgrade of UPGRADES_LIST) {
      for (const production of upgrade.effects.production ?? []) {
        expect(production.kind).toBe('flat');
      }
    }
  });

  it('carries the eight facilities and upgrades new to this edition', () => {
    const newInThisEdition: readonly UpgradeId[] = [
      'greenhouse',
      'med-lab',
      'recovery-room',
      'watch-post',
      'spotlight',
      'metal-shop',
      'gunsmith',
      'study-room',
    ];

    for (const id of newInThisEdition) {
      expect(facilityOfUpgrade(id)).toBeDefined();
    }
  });

  it('gates the three origin facilities on their origin', () => {
    expect(facilityOfUpgrade('lounge')?.id).toBe('bunk-room');
    expect(facilityOfUpgrade('containment')?.id).toBe('medical-clinic');

    const lounge = UPGRADES_LIST.find((upgrade) => upgrade.id === 'lounge');
    const containment = UPGRADES_LIST.find((upgrade) => upgrade.id === 'containment');

    expect(lounge?.requires?.origin).toBe('cosmic-horror');
    expect(containment?.requires?.origin).toBe('viral');
    expect(FACILITIES['mystic-library'].requires.origin).toBe('magic');
  });

  it('caps a facility at three upgrades, rare ones excepted', () => {
    expect(MAX_UPGRADES_PER_FACILITY).toBe(3);

    // Nothing in the core table is rare — rare base upgrades come off the Rare
    // Item Table in Phase 5. The flag exists so the cap is computed by
    // filtering, which is the shape the rule needs whether or not it fires.
    expect(UPGRADES_LIST.filter((upgrade) => upgrade.rare)).toHaveLength(0);
  });
});

/**
 * A base's storage cap per material, derived exactly as pg. 54 states it:
 * Tier + 3, plus every built-in facility and upgrade whose requirements are met.
 *
 * Local to this test on purpose — Z2-3 builds the real function over a live
 * `Base`. What this checks is the transcription: that re-deriving the column
 * reproduces the roster the book prints.
 */
function storageCap(base: BaseId, supplied: readonly Utility[]): Record<StoredMaterial, number> {
  const tier = BASES[base].tier;
  const caps = Object.fromEntries(
    STORED_MATERIALS.map((material) => [material, tier + STORAGE_ABOVE_TIER]),
  ) as Record<StoredMaterial, number>;

  const met = (requires: { utilities?: readonly Utility[] } | undefined) =>
    (requires?.utilities ?? []).every((utility) => supplied.includes(utility));

  for (const slot of BASES[base].slots as readonly BaseSlot[]) {
    if (slot.state !== 'built-in') continue;

    const facility = FACILITIES[slot.facility] as Facility;
    const entries = [
      facility,
      ...slot.upgrades.map(
        (id) => facility.upgrades.find((upgrade) => upgrade.id === id) as Upgrade,
      ),
    ];

    for (const entry of entries) {
      if (!met(entry.requires)) continue;

      for (const material of STORED_MATERIALS) {
        caps[material] += entry.effects.storage?.[material] ?? 0;
      }
    }
  }

  return caps;
}

describe('base roster', () => {
  /**
   * The roster as the book prints it (pg. 54) — Hardware / Food / Fuel, the
   * slot count and how many of those slots start empty.
   *
   * This table is a **check on the transcription, not a source**: none of these
   * numbers are stored in `bases.ts`. Storage is re-derived from the Tier and
   * the built-in facilities, and the counts from the slot list. The Greasy
   * Spoon's printed `6/6(8)/6` is the parenthetical case — its built-in
   * Refrigeration needs Power, so the Food cap is 6 unpowered and 8 powered,
   * which is the unmet-requirement rule showing up in the book's own table.
   */
  const PRINTED: Record<
    BaseId,
    {
      tier: number;
      storage: [number, number, number];
      powered?: [number, number, number];
      slots: number;
      empty: number;
    }
  > = {
    'small-town-home': { tier: 1, storage: [4, 4, 4], slots: 5, empty: 2 },
    'summer-camp': { tier: 1, storage: [4, 4, 4], slots: 7, empty: 3 },
    'rural-church': { tier: 1, storage: [4, 4, 4], slots: 7, empty: 3 },
    'greasy-spoon': { tier: 1, storage: [6, 6, 6], powered: [6, 8, 6], slots: 7, empty: 4 },
    'hobby-farm': { tier: 2, storage: [9, 7, 7], slots: 9, empty: 2 },
    distillery: { tier: 2, storage: [7, 7, 9], slots: 9, empty: 6 },
    'outdoor-sports-shop': { tier: 2, storage: [5, 5, 5], slots: 9, empty: 6 },
    'renaissance-festival': { tier: 3, storage: [6, 6, 6], slots: 8, empty: 5 },
    'hydroelectric-dam': { tier: 3, storage: [8, 8, 8], slots: 7, empty: 4 },
    'regional-firehouse': { tier: 3, storage: [6, 6, 6], slots: 8, empty: 2 },
  };

  it('lists ten bases across three tiers, one of them the starter', () => {
    expect(BASE_IDS).toHaveLength(10);
    expect(BASE_IDS.filter((id) => BASES[id].tier === 3)).toHaveLength(3);
    expect(BASE_IDS.filter((id) => 'starter' in BASES[id])).toEqual(['small-town-home']);
  });

  it('re-derives the printed storage column of every base', () => {
    for (const id of BASE_IDS) {
      const printed = PRINTED[id];

      expect([id, storageCap(id, [])]).toEqual([
        id,
        { hardware: printed.storage[0], food: printed.storage[1], fuel: printed.storage[2] },
      ]);

      const powered = printed.powered ?? printed.storage;
      expect([id, storageCap(id, ['power', 'water'])]).toEqual([
        id,
        { hardware: powered[0], food: powered[1], fuel: powered[2] },
      ]);
    }
  });

  it('re-derives the printed slot and empty-slot counts', () => {
    for (const id of BASE_IDS) {
      const slots = BASES[id].slots as readonly BaseSlot[];
      const empty = slots.filter((slot) => slot.state === 'empty');

      expect([id, slots.length, empty.length]).toEqual([id, PRINTED[id].slots, PRINTED[id].empty]);
    }
  });

  it('caps Heroes at the base tier', () => {
    for (const id of BASE_IDS) {
      expect(maxHeroes(BASES[id].tier)).toBe(PRINTED[id].tier);
    }
  });

  it('names each slot once within its base', () => {
    for (const id of BASE_IDS) {
      const ids = (BASES[id].slots as readonly BaseSlot[]).map((slot) => slot.id);

      expect([id, new Set(ids).size]).toEqual([id, ids.length]);
    }
  });

  it('builds in only facilities and upgrades that exist', () => {
    for (const id of BASE_IDS) {
      for (const slot of BASES[id].slots as readonly BaseSlot[]) {
        if (slot.state !== 'built-in') continue;

        const facility = FACILITIES[slot.facility] as Facility;
        expect(facility).toBeDefined();

        for (const upgrade of slot.upgrades) {
          expect([id, slot.id, facility.upgrades.map((candidate) => candidate.id)]).toEqual([
            id,
            slot.id,
            expect.arrayContaining([upgrade]),
          ]);
        }
      }
    }
  });

  it('puts every built-in facility and upgrade in a slot it is allowed in', () => {
    for (const id of BASE_IDS) {
      for (const slot of BASES[id].slots as readonly BaseSlot[]) {
        if (slot.state !== 'built-in') continue;

        const facility = FACILITIES[slot.facility] as Facility;
        const upgrades = slot.upgrades.map(
          (upgradeId) =>
            facility.upgrades.find((candidate) => candidate.id === upgradeId) as Upgrade,
        );

        for (const entry of [facility, ...upgrades]) {
          const required = entry.requires?.slot;
          if (required === undefined) continue;

          expect([id, slot.id, entry.requires?.slot]).toEqual([id, slot.id, slot.kind]);
        }
      }
    }
  });

  it('locks a built-in that already carries an upgrade', () => {
    // pg. 54: a built-in facility with an upgrade installed cannot be upgraded
    // further. The Distillery's Utility Station is the one row that is locked
    // while carrying none — flagged in `bases.ts` to confirm against the book.
    for (const id of BASE_IDS) {
      for (const slot of BASES[id].slots as readonly BaseSlot[]) {
        if (slot.state !== 'built-in' || slot.upgrades.length === 0) continue;

        expect([id, slot.id, slot.upgradable]).toEqual([id, slot.id, false]);
      }
    }

    const distillery = BASES.distillery.slots.find((slot) => slot.id === 'utility-station');
    expect(distillery).toMatchObject({ upgradable: false, upgrades: [] });
  });

  it('gives the Regional Firehouse eight beds across its two bunk rooms', () => {
    // The one bed total the roster states outright, and the check that
    // repeated pre-installed upgrades are counted rather than deduplicated.
    const beds = (BASES['regional-firehouse'].slots as readonly BaseSlot[])
      .filter((slot) => slot.state === 'built-in' && slot.facility === 'bunk-room')
      .reduce((total, slot) => {
        if (slot.state !== 'built-in') return total;

        const facility = FACILITIES['bunk-room'] as Facility;
        const upgrades = slot.upgrades.reduce((sum, upgradeId) => {
          const upgrade = facility.upgrades.find((candidate) => candidate.id === upgradeId);
          return sum + (upgrade?.effects.beds ?? 0);
        }, 0);

        return total + (facility.effects.beds ?? 0) + upgrades;
      }, 0);

    expect(beds).toBe(8);
  });
});
