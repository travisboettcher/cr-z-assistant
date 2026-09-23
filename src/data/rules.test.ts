import { describe, expect, it } from 'vitest';
import { commonSkillScoreCost, skillLevelCost, tierCost } from './advancement';
import { D10_RESULTS } from './dice';
import {
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
import {
  BASES,
  BASE_IDS,
  maxHeroes,
  type BaseId,
  type BaseSlot,
  BASE_SPECIAL_PHASE,
} from './bases';
import {
  FACILITIES,
  FACILITY_IDS,
  MAX_UPGRADES_PER_FACILITY,
  facilityOfUpgrade,
  type Facility,
  type Upgrade,
  type UpgradeId,
} from './facilities';
import { CAMPAIGN_ORIGINS } from './origins';
import { MATERIALS, type Material } from './materials';
import {
  CAMPAIGN_PHASES,
  FOOD_EATEN_PER_TURN,
  MATERIAL_ROLL_TABLE,
  SCAVENGE_PER_MATERIAL_WITH_SKILL,
  SCAVENGE_TOTAL_WITHOUT_SKILL,
  SIEGE_THREAT_TERMS,
  TURN_STEPS,
} from './turn';

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

  it('limits only the Fence and the Greenhouse to one per Garden', () => {
    // Not the Herb Plot: nothing restricts it, so the cap of three upgrades is
    // its only limit and three of them on one Garden is a legal build. Pinned
    // here because "one per Garden" reads like a rule about Garden upgrades in
    // general, and it is not.
    const limited = UPGRADES_LIST.filter(
      (upgrade) => upgrade.constraints?.maxPerFacility !== undefined,
    ).map((upgrade) => upgrade.id);

    expect(limited).toEqual(['fence', 'greenhouse']);
  });

  it('staffs the Mystic Library with the Study Room, and the Training Room with nothing', () => {
    // The upgrade lives in the Mystic Library's sidebar (pg. 70). The Training
    // Room's three upgrades are all flat XP and none of them adds staff.
    expect(facilityOfUpgrade('study-room')?.id).toBe('mystic-library');

    for (const upgrade of (FACILITIES['training-room'] as Facility).upgrades) {
      expect([upgrade.id, upgrade.effects.extraStaff]).toEqual([upgrade.id, undefined]);
    }
  });
});

describe('base roster', () => {
  /**
   * The roster as the book prints it (pg. 54) — the Tier, the slot count and
   * how many of those slots start empty.
   *
   * A **check on the transcription, not a source**: none of these numbers are
   * stored in `bases.ts`, and the counts are re-derived from the slot list. The
   * roster's storage column is checked the same way, in `engine/base.test.ts`,
   * where the function that derives it lives.
   */
  const PRINTED: Record<BaseId, { tier: number; slots: number; empty: number }> = {
    'small-town-home': { tier: 1, slots: 5, empty: 2 },
    'summer-camp': { tier: 1, slots: 7, empty: 3 },
    'rural-church': { tier: 1, slots: 7, empty: 3 },
    'greasy-spoon': { tier: 1, slots: 7, empty: 4 },
    'hobby-farm': { tier: 2, slots: 9, empty: 2 },
    distillery: { tier: 2, slots: 9, empty: 6 },
    'outdoor-sports-shop': { tier: 2, slots: 9, empty: 6 },
    'renaissance-festival': { tier: 3, slots: 8, empty: 5 },
    'hydroelectric-dam': { tier: 3, slots: 7, empty: 4 },
    'regional-firehouse': { tier: 3, slots: 8, empty: 2 },
  };

  it('lists ten bases across three tiers, one of them the starter', () => {
    expect(BASE_IDS).toHaveLength(10);
    expect(BASE_IDS.filter((id) => BASES[id].tier === 3)).toHaveLength(3);
    expect(BASE_IDS.filter((id) => 'starter' in BASES[id])).toEqual(['small-town-home']);
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
    // further. The Distillery's Utility Station is the one row locked while
    // carrying none, and it is a real exception rather than a misprint — see
    // `bases.ts`. So the rule is asserted in one direction only.
    for (const id of BASE_IDS) {
      for (const slot of BASES[id].slots as readonly BaseSlot[]) {
        if (slot.state !== 'built-in' || slot.upgrades.length === 0) continue;

        expect([id, slot.id, slot.upgradable]).toEqual([id, slot.id, false]);
      }
    }

    const distillery = BASES.distillery.slots.find((slot) => slot.id === 'utility-station');
    expect(distillery).toMatchObject({
      upgradable: false,
      upgrades: [],
      flatOutput: { output: 'water', amount: 2 },
    });

    // And it is still a Utility Station, so it can still be staffed — the
    // flat 2 Water adds to whatever its staff produces rather than replacing
    // it. A ruling, not a quotation; see `bases.ts`.
    expect(FACILITIES['utility-station'].staffed).toBe(true);
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

describe('production outputs', () => {
  /**
   * Only the Utility Station divides one amount between two outputs (pg. 72),
   * and `splitsAcrossPools` in `src/engine/assignments.ts` reads exactly that
   * to tell the utility pool's staffed half from every other kind of work.
   *
   * Asserted over the whole catalogue rather than trusted, because it is the
   * kind of fact a single new facility could quietly falsify — and the engine
   * would then count that facility's output as Power and Water.
   */
  it('divides one amount across outputs only in the Utility Station', () => {
    const splitting = FACILITY_IDS.filter((id) => {
      const facility = FACILITIES[id] as Facility;

      return [facility, ...facility.upgrades].some((entry: Facility | Upgrade) =>
        (entry.effects.production ?? []).some((production) => 'outputs' in production),
      );
    });

    expect(splitting).toEqual(['utility-station']);
  });
});

describe('the campaign turn', () => {
  it('runs the four campaign phases in rulebook order', () => {
    expect(CAMPAIGN_PHASES).toEqual(['mission', 'advancement', 'planning', 'management']);
  });

  it('gives every phase at least one numbered step', () => {
    for (const phase of CAMPAIGN_PHASES) {
      expect(TURN_STEPS[phase].length).toBeGreaterThan(0);
    }
  });

  it('names every step of the turn exactly once', () => {
    const ids = CAMPAIGN_PHASES.flatMap((phase) => TURN_STEPS[phase].map((step) => step.id));

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cites every step inside the Community Layer chapter', () => {
    // The whole turn is pg. 17-23. A citation outside that range is a
    // transcription slip, which is exactly what the edition retrofit existed
    // to remove -- and a range like '18-19' has to have both ends checked.
    for (const phase of CAMPAIGN_PHASES) {
      for (const step of TURN_STEPS[phase]) {
        const pages = String(step.pages)
          .split(/[^0-9]+/)
          .filter((part) => part !== '')
          .map(Number);

        expect(pages.length).toBeGreaterThan(0);

        for (const page of pages) {
          expect(page).toBeGreaterThanOrEqual(17);
          expect(page).toBeLessThanOrEqual(23);
        }
      }
    }
  });

  it('numbers the Planning Phase the way pg. 20-21 does, not the way pg. 17 does', () => {
    // The book contradicts itself: the turn summary on pg. 17 puts the mission
    // team third and rest and healing fourth. This asserts the resolution so
    // that a later reader checking against the summary cannot quietly undo it.
    expect(TURN_STEPS.planning.map((step) => step.id)).toEqual([
      'assign-facility-staff',
      'assign-project-team',
      'assign-rest-and-healing',
      'assign-mission-team',
    ]);
  });

  it('walks the Management Phase through its seven steps in order', () => {
    expect(TURN_STEPS.management.map((step) => step.id)).toEqual([
      'check-for-rot',
      'feed-your-survivors',
      'assign-beds',
      'calculate-unrest',
      'check-storage',
      'check-the-horde',
      'departures',
    ]);
  });

  it('feeds Tiers 1-2 one Food and Tiers 3-4 two', () => {
    // The printed table, asserted by value. A length check would pass on any
    // four numbers, and the thing that can go wrong transcribing a four-row
    // table is a row, not a missing row.
    expect(TIERS.map((tier) => FOOD_EATEN_PER_TURN[tier])).toEqual([1, 1, 2, 2]);
  });

  it('turns every d10 into a material, on the boundaries the book prints', () => {
    const rolled = D10_RESULTS.map((result) => MATERIAL_ROLL_TABLE[result]);

    expect(rolled).toEqual([
      'fuel',
      'fuel',
      'fuel',
      'food',
      'food',
      'food',
      'hardware',
      'hardware',
      'hardware',
      'rare',
    ]);

    // And every material is reachable, so a range that swallowed its
    // neighbour would fail here as well as above.
    expect([...new Set<Material>(rolled)].sort()).toEqual([...MATERIALS].sort());
  });

  it('builds Siege Threat out of five distinct terms', () => {
    expect(new Set(SIEGE_THREAT_TERMS).size).toBe(5);
  });

  /**
   * What a scavenger brings back when the community skips the mission (pg. 17):
   * with the skill one of *every* type, without it one of a single type.
   *
   * Both flat, which is the transcription worth pinning — a reader who expects
   * the Scavenge Score to scale the haul would write a multiplier, and the book
   * gives a count.
   */
  it('pays a scavenger a flat one, per type with the skill and once without', () => {
    expect(SCAVENGE_PER_MATERIAL_WITH_SKILL).toBe(1);
    expect(SCAVENGE_TOTAL_WITHOUT_SKILL).toBe(1);
  });
});

/**
 * The claim that lets the utility pool be computed from supply-blind staffing.
 *
 * Resolving a slot's capacity against supply is circular as a call graph —
 * `suppliedOccupants → backedPoints → utilitiesScore → staffOf → staffCapacity
 * → working` — and #153 recorded that as the reason the Med Lab's extra seat
 * could not be utility-resolved. The loop carries no information, though, and
 * this is why: **no facility that generates a utility has an upgrade that
 * widens it**, so every Station seats exactly one whether or not it is
 * supplied, and the pool can be worked out before anything is resolved.
 *
 * It is a fact about the catalogue rather than about the code, so it is checked
 * here. An edition that put an `extraStaff` on a Utility Station would fail
 * this rather than quietly restoring the cycle under `assignments.ts`.
 */
describe('staffing and the utility pool', () => {
  const generatesAUtility = (entry: Facility | Upgrade): boolean =>
    (entry.effects.production ?? []).some(
      (line) =>
        (line.kind === 'staffed-split' &&
          line.outputs.some((output) => output === 'power' || output === 'water')) ||
        (line.kind !== 'staffed-split' && (line.output === 'power' || line.output === 'water')),
    );

  it('never widens a facility that generates Power or Water', () => {
    for (const id of FACILITY_IDS) {
      // Through the declared types rather than the catalogue's literal ones,
      // which narrow `effects` to whichever shape each entry happens to have.
      const facility: Facility = FACILITIES[id];
      const upgrades: readonly Upgrade[] = facility.upgrades;
      const widened = upgrades.filter((upgrade) => upgrade.effects.extraStaff !== undefined);

      if (widened.length === 0) continue;

      const generating = [facility, ...upgrades].filter(generatesAUtility);

      expect(
        generating,
        `${id} both generates a utility and has an upgrade that widens it, which puts the utility pool back inside its own calculation`,
      ).toEqual([]);
    }
  });
});

/**
 * Playtest finding R3-H1, generalised the same way the base specials were.
 *
 * Scavenging was assignable, validated, persisted and labelled, and paid out
 * nothing: the two constants saying what it yields were read by no module in
 * the app (#163). Every *visible* part of the feature existed, which is why two
 * rounds of phase-by-phase sweeping walked past it.
 *
 * A rules constant with no reader is a rule the app does not implement, however
 * complete the screens around it look. This is the cheapest guard against the
 * class: grep, for the same reason the specials do — the point is "somebody
 * reads this at all", and a test that called the reader would need to know
 * which function it lives in.
 */
describe('rules constants the engine has to read', () => {
  const engine = Object.values(
    import.meta.glob('../engine/*.ts', { query: '?raw', eager: true, import: 'default' }),
  )
    .filter((source): source is string => typeof source === 'string')
    .join('\n');

  it.each(['SCAVENGE_PER_MATERIAL_WITH_SKILL', 'SCAVENGE_TOTAL_WITHOUT_SKILL', 'REST_HEALTH'])(
    '%s is read by the engine',
    (constant) => {
      expect(engine).toContain(constant);
    },
  );
});

/**
 * Playtest finding M3, generalised into a check.
 *
 * Five of the seven base specials were correctly transcribed and read by
 * nothing, and `bases.ts` said so in a comment that went stale without anything
 * noticing. `BASE_SPECIAL_PHASE` records which phase owns each; this asserts
 * that everything claimed for Phase 3 actually has a consumer, by grepping the
 * engine for the id.
 *
 * Grep rather than a call, deliberately: the point is "somebody reads this at
 * all", and a test that called each reader would need to know which function
 * each special lives in — which is exactly the knowledge that went stale.
 */
describe('base specials', () => {
  // Read through Vite rather than `fs`: this suite runs in jsdom, where
  // `import.meta.url` is not a file URL, and `?raw` is the bundler's own way of
  // asking for a module's text.
  const engine = Object.values(
    import.meta.glob('../engine/*.ts', { query: '?raw', eager: true, import: 'default' }),
  )
    .filter((source): source is string => typeof source === 'string')
    .join('\n');

  it('has a phase recorded for every special the roster uses', () => {
    const used = new Set(BASE_IDS.flatMap((id) => BASES[id].specials.map((special) => special.id)));

    for (const id of used) {
      expect(BASE_SPECIAL_PHASE).toHaveProperty(id);
    }
  });

  it.each(
    Object.entries(BASE_SPECIAL_PHASE)
      .filter(([, phase]) => phase === 3)
      .map(([id]) => id),
  )('%s is read by the engine, because Phase 3 owns it', (id) => {
    expect(engine).toContain(`'${id}'`);
  });

  /** And the deferrals are deferrals rather than omissions nobody noticed. */
  it('leaves the later-phase specials to their phases', () => {
    expect(BASE_SPECIAL_PHASE['blacksmithing-tools']).toBe(5);
    expect(BASE_SPECIAL_PHASE['turnout-gear']).toBe(5);
    expect(BASE_SPECIAL_PHASE['ring-the-bell']).toBe(4);
  });
});
