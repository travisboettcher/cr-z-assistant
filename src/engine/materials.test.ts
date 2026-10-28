import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Base, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import {
  baseProduction,
  canForce,
  checkMaterials,
  combined,
  gathered,
  gatheredBy,
  gatheredSubstitutionProblem,
  gatheredToRoll,
  materialsAdded,
  noMaterials,
  recovered,
  rolledMaterial,
  rollsOwed,
  scavengeNeedsAChoice,
  scavenged,
  scavenger,
  scavengerStoodDown,
  substitutableGatherings,
  substitutionUses,
  substitutionsFor,
  substitutionsSpent,
  withMaterialsAdded,
  type MaterialRoll,
} from './materials';
import type { LogEntry } from './log';
import { MATERIALS, type Material } from '../data/materials';
import { generatingUtilities, staffedWith, utilityWorker } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-11T09:00:00.000Z';

function community(
  assignments: Record<string, Assignment> = {},
  base: Base | null = null,
): Campaign {
  return { ...createNewCampaign('Cedar Hollow', FIXED), turn: 3, assignments, base };
}

/** The sum of a haul, which is the number every substitution test is about. */
const size = (materials: ReturnType<typeof noMaterials>) =>
  MATERIALS.reduce((total, material) => total + materials[material], 0);

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

describe('rolledMaterial', () => {
  it('reads the roll off the table when nothing was forced', () => {
    // One from each band of pg. 18–19, so a table rewritten by a mutant cannot
    // agree with this by accident.
    expect(rolledMaterial({ roll: 1 })).toBe('fuel');
    expect(rolledMaterial({ roll: 3 })).toBe('fuel');
    expect(rolledMaterial({ roll: 4 })).toBe('food');
    expect(rolledMaterial({ roll: 6 })).toBe('food');
    expect(rolledMaterial({ roll: 7 })).toBe('hardware');
    expect(rolledMaterial({ roll: 9 })).toBe('hardware');
    expect(rolledMaterial({ roll: 10 })).toBe('rare-item');
  });

  it('takes the forced result over the one that was rolled', () => {
    expect(rolledMaterial({ roll: 1, forced: { skill: 'rationing', material: 'food' } })).toBe(
      'food',
    );
  });
});

describe('recovered', () => {
  it('counts one material per roll', () => {
    expect(recovered([{ roll: 4 }, { roll: 5 }, { roll: 1 }])).toEqual({
      food: 2,
      fuel: 1,
      hardware: 0,
    });
  });

  it('adds nothing at all for no rolls', () => {
    expect(recovered([])).toEqual(noMaterials());
  });

  /**
   * The acceptance criterion of this story, and the reason it is stated twice —
   * once as a count and once as a comparison.
   *
   * A substitution **changes a roll's result**; adding a material instead is the
   * obvious wrong implementation and would pass any test that only looked at
   * where the Food ended up.
   */
  it('substitutes a result rather than adding a material', () => {
    const rolls: readonly MaterialRoll[] = [
      { roll: 1 },
      { roll: 1, forced: { skill: 'rationing', material: 'food' } },
      { roll: 10, forced: { skill: 'mechanics', material: 'hardware' } },
    ];

    expect(size(recovered(rolls))).toBe(rolls.length);
    expect(recovered(rolls)).toEqual({ food: 1, fuel: 1, hardware: 1 });

    // And the roll it replaced is gone: two Fuel without the substitution, one
    // with it.
    expect(recovered([{ roll: 1 }, { roll: 1 }]).fuel).toBe(2);
  });
});

describe('canForce', () => {
  it('locks Rationing to Food and Mechanics to Hardware (pg. 12)', () => {
    expect(canForce('rationing', 'food')).toBe(true);
    expect(canForce('rationing', 'fuel')).toBe(false);
    expect(canForce('rationing', 'hardware')).toBe(false);

    expect(canForce('mechanics', 'hardware')).toBe(true);
    expect(canForce('mechanics', 'food')).toBe(false);
  });

  /** R9, as the Errata to pg. 12 settles it (#218): Utilities forces Fuel and nothing else. */
  it('locks Utilities to Fuel', () => {
    expect(MATERIALS.filter((material) => canForce('utilities', material))).toEqual(['fuel']);
  });
});

describe('substitutionUses', () => {
  /** A Skill Score is the governing stat plus the level (pg. 8). */
  function scored(id: string, skill: 'rationing' | 'mechanics', score: number) {
    return {
      ...createSurvivor('Somebody', 4, { id }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
      skills: { [skill]: 0 },
    };
  }

  it('sums the skill across the mission team', () => {
    const team = [scored('a', 'rationing', 2), scored('b', 'rationing', 3)];
    const campaign: Campaign = {
      ...community({ a: { task: 'mission', team: 1 }, b: { task: 'mission', team: 1 } }),
      survivors: team,
    };

    expect(substitutionUses(campaign, 'rationing')).toBe(5);
  });

  it('counts nobody who was not on the mission', () => {
    const campaign: Campaign = {
      ...community({ a: { task: 'mission', team: 1 }, b: { task: 'project' } }),
      survivors: [scored('a', 'rationing', 2), scored('b', 'rationing', 3)],
    };

    expect(substitutionUses(campaign, 'rationing')).toBe(2);
  });

  it('gives a survivor who never learnt the skill no Score at all', () => {
    const campaign: Campaign = {
      ...community({ a: { task: 'mission', team: 1 } }),
      // Cooperation of 4 and no Rationing: a Score of nothing, not of four.
      survivors: [{ ...scored('a', 'mechanics', 4) }],
    };

    expect(substitutionUses(campaign, 'rationing')).toBe(0);
    expect(substitutionUses(campaign, 'mechanics')).toBe(4);
  });
});

describe('substitutionsSpent', () => {
  it('counts each skill separately, because each has its own pool', () => {
    expect(
      substitutionsSpent(
        [
          { roll: 1, forced: { skill: 'rationing', material: 'food' } },
          { roll: 2, forced: { skill: 'rationing', material: 'food' } },
          { roll: 3, forced: { skill: 'mechanics', material: 'hardware' } },
          { roll: 4 },
        ],
        [],
      ),
    ).toEqual({ rationing: 2, mechanics: 1, utilities: 0 });
  });
});

describe('baseProduction', () => {
  const farm = (): Base => ({ id: 'hobby-farm', slots: {} });

  it('is nothing at all without a base', () => {
    expect(baseProduction(community())).toEqual(noMaterials());
  });

  /**
   * The Hobby Farm's built-in Garden makes a Food and the Fence built into it
   * makes another (pg. 54, 71) — both flat, so they arrive with nobody working
   * anything.
   */
  it('counts what an unstaffed base makes on its own', () => {
    expect(baseProduction(community({}, farm()))).toEqual({
      food: 2,
      fuel: 0,
      hardware: 0,
    });
  });

  it('counts what the staff add, and matches the slot card', () => {
    const cook = {
      ...createSurvivor('Nell Haig', 4, { id: 'cook' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
      skills: { rationing: 0 },
    };

    // The Kitchen is a staffed Rationing facility (pg. 55), halved for want of
    // Water — a Score of 3 becomes 2, rounding up.
    expect(baseProduction(staffedWith(community({}, farm()), 'kitchen', [cook])).food).toBe(2 + 2);
  });

  it('keeps a line that consumes rather than produces', () => {
    // A Herb Plot trades the Garden's Food for a Health (pg. 71). A haul that
    // dropped the negative line would feed the community for free.
    const base: Base = {
      id: 'hobby-farm',
      slots: {
        'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, upgrades: ['herb-plot'] },
      },
    };

    // The Farm's own two, plus this Garden's one, less the Herb Plot's one.
    expect(baseProduction(community({}, base)).food).toBe(2);
    expect(baseProduction(community({}, { ...base, slots: {} })).food).toBe(2);
  });

  /**
   * The Hydroelectric Dam supplies every facility once the community's combined
   * Utilities Score reaches 6 (pg. 61). It is one of the two rules that live
   * only in the resolved list, and production read the stored flags until #139
   * — so the Dam, which ships no Station and no flat generation, could never
   * supply anything and its Workshop was halved forever.
   */
  it("counts the Dam's blanket supply, so its Workshop is not halved", () => {
    const mechanic = {
      ...createSurvivor('Ada Pratt', 4, { id: 'mechanic' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 4 },
      skills: { mechanics: 0 },
    };

    const dam = staffedWith(community({}, { id: 'hydroelectric-dam', slots: {} }), 'workshop', [
      mechanic,
    ]);

    // Not staffing anything: the Dam's special reads the *community's* combined
    // Score, which is what makes it different from the staffed pool.
    const supplied = { ...dam, survivors: [...dam.survivors, utilityWorker(6)] };
    const short = { ...dam, survivors: [...dam.survivors, utilityWorker(5)] };

    expect(baseProduction(supplied).hardware).toBe(4);

    // One under the threshold, halved for want of Power and rounding up.
    expect(baseProduction(short).hardware).toBe(2);
  });

  /**
   * The other rule that lives only in the resolved list (#111): assignment
   * persists on the slot and generation does not, so a Kitchen keeps its point
   * of Water after the Station empties. Production asked the flag until #139.
   */
  it('halves a facility whose assigned point has nothing generating it', () => {
    const cook = {
      ...createSurvivor('Nell Haig', 4, { id: 'cook' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
      skills: { rationing: 0 },
    };

    const assigned = staffedWith(
      community({}, { id: 'hobby-farm', slots: { kitchen: { water: true } } }),
      'kitchen',
      [cook],
    );

    // The Farm's own 2 Food, plus the Kitchen's 3 halved to 2 — the same number
    // the unassigned Kitchen makes, because the point is not backed.
    expect(baseProduction(assigned).food).toBe(2 + 2);

    // Backed by a Station, and the Score comes through whole.
    expect(baseProduction(generatingUtilities(assigned, 1, 'utility-station')).food).toBe(2 + 3);
  });

  it('ignores production that does not go in storage', () => {
    // A Utility Station makes Power and Water, and neither is a material.
    const station = staffedWith(community({}, farm()), 'utility-station', [
      {
        ...createSurvivor('Sam Reyes', 4, { id: 'sam' }),
        stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 4 },
        skills: { utilities: 0 },
      },
    ]);

    expect(baseProduction(station)).toEqual(baseProduction(community({}, farm())));
  });
});

describe('combined', () => {
  it('adds two hauls material by material', () => {
    expect(
      combined({ food: 1, fuel: 2, hardware: 3 }, { food: 10, fuel: 0, hardware: -1 }),
    ).toEqual({ food: 11, fuel: 2, hardware: 2 });
  });
});

describe('checkMaterials', () => {
  const greasySpoon = (): Base => ({ id: 'greasy-spoon', slots: {} });

  it('never blocks anything', () => {
    const check = checkMaterials(
      community(),
      [{ roll: 1, forced: { skill: 'rationing', material: 'food' } }],
      [],
    );

    expect(check.blockers).toEqual([]);
    expect(check.warnings.length).toBeGreaterThan(0);
  });

  it('warns when more results were forced than the team can force', () => {
    const check = checkMaterials(
      community(),
      [{ roll: 1, forced: { skill: 'mechanics', material: 'hardware' } }],
      [],
    );

    expect(codes(check.warnings)).toEqual(['not-enough-substitution']);
    expect(check.warnings[0]?.message).toContain('mechanics');
  });

  it('says nothing when the team has the Score to spend', () => {
    const mechanic = {
      ...createSurvivor('Ada Poole', 4, { id: 'ada' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
      skills: { mechanics: 0 },
    };
    const campaign: Campaign = {
      ...community({ ada: { task: 'mission', team: 1 } }),
      survivors: [mechanic],
    };

    expect(
      checkMaterials(
        campaign,
        [
          { roll: 1, forced: { skill: 'mechanics', material: 'hardware' } },
          { roll: 2, forced: { skill: 'mechanics', material: 'hardware' } },
        ],
        [],
      ).warnings,
    ).toEqual([]);
  });

  /**
   * Check Storage is a Management Phase step (pg. 23). Reporting the overflow
   * here and trimming it here are different things, and the second would lose a
   * community materials a whole phase before the rules take them.
   */
  it('reports a haul over the cap and does not take any of it away', () => {
    const full: Campaign = {
      ...community({}, greasySpoon()),
      // The Greasy Spoon stores 6 Food (pg. 54).
      materials: { food: 6, fuel: 0, hardware: 0 },
    };
    const check = checkMaterials(full, [{ roll: 4 }], []);

    expect(codes(check.warnings)).toEqual(['over-storage-cap']);
    // Six stored, one rolled, and the Greasy Spoon's own Food: eight, over six.
    expect(check.warnings[0]?.message).toContain('8');

    expect(withMaterialsAdded(full, recovered([{ roll: 4 }])).materials.food).toBe(7);
  });

  it('says nothing about a haul that lands exactly on the cap', () => {
    // Five stored, one rolled, and the Greasy Spoon's own Food: six, which is
    // its cap. Over the cap is over it, not level with it.
    const level: Campaign = {
      ...community({}, greasySpoon()),
      materials: { food: 4, fuel: 0, hardware: 0 },
    };

    expect(checkMaterials(level, [{ roll: 4 }], []).warnings).toEqual([]);

    // And one more is over.
    expect(
      codes(
        checkMaterials({ ...level, materials: { ...level.materials, food: 5 } }, [{ roll: 4 }], [])
          .warnings,
      ),
    ).toEqual(['over-storage-cap']);
  });

  /** A 10 is an item, which storage does not cap (pp. 19, 23; R49). */
  it('has no cap to report for a Rare Item Table roll', () => {
    const full: Campaign = {
      ...community({}, greasySpoon()),
      materials: { food: 6, fuel: 6, hardware: 6 },
    };

    expect(checkMaterials(full, [{ roll: 10 }], []).warnings).toEqual(
      checkMaterials(full, [], []).warnings,
    );
  });

  it('has no caps to report at all without a base', () => {
    const rich: Campaign = {
      ...community(),
      materials: { food: 999, fuel: 999, hardware: 999 },
    };

    expect(checkMaterials(rich, [{ roll: 4 }], []).warnings).toEqual([]);
  });

  it('counts what the base makes against the cap as well as what was rolled', () => {
    // Six stored plus the Hobby Farm's two flat Food is eight, over its cap of
    // seven — and no roll was involved at all.
    const nearly: Campaign = {
      ...community({}, { id: 'hobby-farm', slots: {} }),
      materials: { food: 6, fuel: 0, hardware: 0 },
    };

    expect(codes(checkMaterials(nearly, [], []).warnings)).toEqual(['over-storage-cap']);
  });
});

describe('materialsAdded', () => {
  function withLog(entries: readonly LogEntry[]): Campaign {
    return { ...community(), log: entries };
  }

  const added = (turn: number): LogEntry => ({
    turn,
    phase: 'advancement',
    at: AT,
    event: { kind: 'materials-added', food: 1, fuel: 0, hardware: 0 },
  });

  it('is false for a campaign that has not done the step', () => {
    expect(materialsAdded(withLog([]))).toBe(false);
  });

  it('is true once this turn has the entry', () => {
    expect(materialsAdded(withLog([added(3)]))).toBe(true);
  });

  it('ignores the same entry from another turn', () => {
    expect(materialsAdded(withLog([added(2)]))).toBe(false);
  });

  it('ignores other events from this turn', () => {
    expect(
      materialsAdded(
        withLog([{ turn: 3, phase: 'planning', at: AT, event: { kind: 'turn-began' } }]),
      ),
    ).toBe(false);
  });
});

describe('withMaterialsAdded', () => {
  it('adds to what is stored rather than replacing it', () => {
    const stocked: Campaign = {
      ...community(),
      materials: { food: 2, fuel: 2, hardware: 2 },
    };

    expect(withMaterialsAdded(stocked, { food: 1, fuel: 0, hardware: -1 }).materials).toEqual({
      food: 3,
      fuel: 2,
      hardware: 1,
    });
  });

  it('caps nothing, because Check Storage is a Management step', () => {
    const full: Campaign = {
      ...community({}, { id: 'greasy-spoon', slots: {} }),
      materials: { food: 6, fuel: 0, hardware: 0 },
    };

    expect(withMaterialsAdded(full, { food: 10, fuel: 0, hardware: 0 }).materials.food).toBe(16);
  });

  it('leaves everything else about the campaign alone', () => {
    const before = community({}, { id: 'hobby-farm', slots: {} });
    const after = withMaterialsAdded(before, noMaterials());

    expect({ ...after, materials: before.materials }).toEqual(before);
  });
});

describe('noMaterials', () => {
  it('is a fresh object each time, so a caller cannot poison the next one', () => {
    const one = noMaterials();
    one.food = 5;

    expect(noMaterials().food).toBe(0);
  });

  it('has an entry for every material there is', () => {
    expect(Object.keys(noMaterials()).sort()).toEqual([...MATERIALS].sort() as Material[]);
  });
});

/**
 * **R3-H1.** The assignment existed on every screen it should — the Planning
 * control, two validators, a task label, the save file — and the two constants
 * saying what it yields were read by nothing, so a skipped mission and a
 * survivor's whole turn bought nothing at all (#163).
 */
describe('scavenging', () => {
  const EARL = 'earl';

  const withScavenge = (id: string) => ({
    ...createSurvivor('Earl Rhodes', 3, { id }),
    // Level 0, deliberately: having the skill is the trigger the book names
    // (pg. 17), and a Score of 0 is reachable through a hunger penalty anyway.
    skills: { scavenge: 0 },
  });

  const scavenging = (survivor: ReturnType<typeof createSurvivor>): Campaign => ({
    ...community({ [survivor.id]: { task: 'scavenging' } }),
    survivors: [survivor],
  });

  describe('the scavenger', () => {
    it('is whoever was assigned to it', () => {
      expect(scavenger(scavenging(withScavenge(EARL)))?.id).toBe(EARL);
    });

    it('is nobody when nobody was assigned', () => {
      expect(scavenger(community())).toBeUndefined();
    });

    /**
     * The assignment was made in the Planning Phase of the turn that has just
     * played, and this turn's Planning Phase clears it — so the payout reads
     * the same rewind the mission team and the base's production do. Without
     * this the haul would vanish the moment a player walked into Planning,
     * which is #95's shape.
     */
    it('is read from the assignments this turn’s Planning cleared', () => {
      const before = scavenging(withScavenge(EARL));
      const cleared: Campaign = {
        ...before,
        assignments: {},
        log: [
          {
            turn: 3,
            phase: 'planning',
            at: AT,
            event: { kind: 'planning-began', cleared: before.assignments },
          },
        ],
      };

      expect(scavenger(cleared)?.id).toBe(EARL);
    });
  });

  describe('what they bring back', () => {
    it('is one of every material type, with the skill', () => {
      expect(scavenged(scavenging(withScavenge(EARL)))).toEqual({
        food: 1,
        fuel: 1,
        hardware: 1,
      });
    });

    it('is one of the chosen type, without it', () => {
      const plain = scavenging(createSurvivor('Carla Proust', 1, { id: EARL }));

      expect(scavenged(plain, 'fuel')).toEqual({ food: 0, fuel: 1, hardware: 0 });
      expect(size(scavenged(plain, 'hardware'))).toBe(1);
    });

    /**
     * Nothing until the player says, rather than a default of Food. A haul this
     * step has not been told about is not a haul.
     */
    it('is nothing while an unskilled scavenger has no choice made for them', () => {
      const plain = scavenging(createSurvivor('Carla Proust', 1, { id: EARL }));

      expect(scavenged(plain)).toEqual(noMaterials());
      expect(scavengeNeedsAChoice(plain)).toBe(true);
      expect(scavengeNeedsAChoice(plain, 'food')).toBe(false);
    });

    /** The choice is ignored where the skill already answers the question. */
    it('is one of each whatever is chosen, with the skill', () => {
      // One of each of the three: Rare is no longer a material (R49).
      expect(size(scavenged(scavenging(withScavenge(EARL)), 'food'))).toBe(3);
      expect(scavengeNeedsAChoice(scavenging(withScavenge(EARL)))).toBe(false);
    });

    it('is nothing at all when nobody scavenged', () => {
      expect(scavenged(community(), 'food')).toEqual(noMaterials());
      expect(scavengeNeedsAChoice(community())).toBe(false);
    });
  });

  /**
   * Planning assigns before Check the Horde can call a siege (pg. 21), and a
   * siege is the turn's mission, which the whole community deploys to
   * (pp. 23, 85): R42, #199.
   */
  describe('on a siege turn', () => {
    const called: LogEntry = {
      turn: 2,
      phase: 'management',
      at: AT,
      event: { kind: 'horde-checked', roll: 10, threat: 6, siege: true },
    };
    const besieged = (survivor: ReturnType<typeof createSurvivor>): Campaign => ({
      ...scavenging(survivor),
      log: [called],
    });

    it('has no scavenger, and names who was stood down', () => {
      expect(scavenger(besieged(withScavenge(EARL)))).toBeUndefined();
      expect(scavengerStoodDown(besieged(withScavenge(EARL)))?.id).toBe(EARL);
      expect(scavengerStoodDown(scavenging(withScavenge(EARL)))).toBeUndefined();
    });

    it('brings back nothing, and asks for no choice', () => {
      const plain = besieged(createSurvivor('Carla Proust', 1, { id: EARL }));

      expect(scavenged(besieged(withScavenge(EARL)))).toEqual(noMaterials());
      expect(scavenged(plain, 'food')).toEqual(noMaterials());
      expect(scavengeNeedsAChoice(plain)).toBe(false);
    });
  });
});

/**
 * A Gather Materials team's outcome on turn 3, and its choice before it, as
 * the Mission Phase records them (pg. 80; Z4-6).
 */
const gathering = (team: number, carried: number, material?: Material): LogEntry[] => [
  {
    turn: 3,
    phase: 'mission',
    at: AT,
    event: {
      kind: 'mission-selected',
      team,
      mission: 'gather-materials',
      names: [],
      ...(material === undefined ? {} : { material }),
    },
  },
  {
    turn: 3,
    phase: 'mission',
    at: AT,
    event: { kind: 'gather-materials-resolved', team, materialsCarriedOut: carried, strangers: [] },
  },
];

describe('gatheredBy (pg. 80; Z4-6)', () => {
  it('gives one of each stored type and the rest in the chosen one', () => {
    expect(gatheredBy(5, 'fuel', [])).toEqual({ food: 1, fuel: 3, hardware: 1 });
  });

  it('gives exactly one of each when there is no rest', () => {
    expect(gatheredBy(3, 'hardware', [])).toEqual({ food: 1, fuel: 1, hardware: 1 });
  });

  it('gives nothing for fewer than one of each, which is rolled instead', () => {
    expect(gatheredBy(2, 'food', [])).toEqual(noMaterials());
    expect(gatheredBy(0, 'food', [])).toEqual(noMaterials());
  });

  it('gives nothing for a choice that named no type', () => {
    expect(gatheredBy(5, undefined, [])).toEqual(noMaterials());
  });
});

/**
 * FAQ "Gather Materials and Coop Skills" (#221): a substitution may replace the
 * guaranteed one of each, within the skill's uses, and never the remainder in
 * the targeted type.
 */
describe('substitutions on a Gather Materials haul', () => {
  const rationing = { skill: 'rationing', material: 'food' } as const;
  const mechanics = { skill: 'mechanics', material: 'hardware' } as const;
  const utilities = { skill: 'utilities', material: 'fuel' } as const;

  describe('gatheredBy', () => {
    /** The FAQ's own example: targeting Hardware, a big Rationing Score. */
    it('turns at most the one of each into Food when the team targeted Hardware', () => {
      const every = MATERIALS.flatMap((replaces) =>
        substitutionsFor(replaces)
          .filter((forced) => forced.skill === 'rationing')
          .map((forced) => ({ replaces, forced })),
      );

      expect(gatheredBy(8, 'hardware', every)).toEqual({ food: 3, fuel: 0, hardware: 5 });
    });

    it('replaces the one it names and leaves the remainder in the targeted type', () => {
      expect(gatheredBy(5, 'fuel', [{ replaces: 'fuel', forced: rationing }])).toEqual({
        food: 2,
        fuel: 2,
        hardware: 1,
      });
      expect(gatheredBy(5, 'food', [{ replaces: 'hardware', forced: utilities }])).toEqual({
        food: 3,
        fuel: 2,
        hardware: 0,
      });
    });

    it('changes materials and never adds one', () => {
      const haul = gatheredBy(
        6,
        'food',
        MATERIALS.map((replaces) => ({ replaces, forced: mechanics })),
      );

      expect(size(haul)).toBe(6);
      expect(haul).toEqual({ food: 3, fuel: 0, hardware: 3 });
    });

    it('has nothing to substitute on a short haul, which is rolled', () => {
      expect(gatheredBy(2, 'food', [{ replaces: 'fuel', forced: rationing }])).toEqual(
        noMaterials(),
      );
    });
  });

  describe('substitutionsFor', () => {
    it('offers what each skill forces, but the material being replaced (R9)', () => {
      expect(substitutionsFor('food')).toEqual([mechanics, utilities]);
      expect(substitutionsFor('fuel')).toEqual([rationing, mechanics]);
      expect(substitutionsFor('hardware')).toEqual([rationing, utilities]);
    });
  });

  describe('substitutableGatherings', () => {
    it('names the teams that came back with one of each, and no others', () => {
      const campaign: Campaign = {
        ...community(),
        log: [
          ...gathering(1, 2, 'food'),
          ...gathering(2, 3, 'fuel'),
          ...gathering(3, 6),
          ...gathering(4, 4, 'hardware'),
        ],
      };

      expect(substitutableGatherings(campaign)).toEqual([2, 4]);
      expect(substitutableGatherings(community())).toEqual([]);
    });
  });

  describe('gatheredSubstitutionProblem', () => {
    const two: Campaign = {
      ...community(),
      log: [...gathering(1, 4, 'hardware'), ...gathering(2, 3, 'fuel'), ...gathering(3, 2, 'food')],
    };

    it('accepts none, and a substitution on each team’s one of each', () => {
      expect(gatheredSubstitutionProblem(two, [])).toBeNull();
      expect(
        gatheredSubstitutionProblem(two, [
          { team: 1, replaces: 'fuel', forced: rationing },
          { team: 1, replaces: 'hardware', forced: rationing },
          { team: 2, replaces: 'fuel', forced: rationing },
          { team: 2, replaces: 'food', forced: utilities },
        ]),
      ).toBeNull();
    });

    it('refuses a team with no one of each: a short haul, or no Gather Materials', () => {
      expect(
        gatheredSubstitutionProblem(two, [{ team: 3, replaces: 'fuel', forced: rationing }]),
      ).toBe('Mission team 3 brought back no one of each from Gather Materials.');
      expect(
        gatheredSubstitutionProblem(two, [{ team: 4, replaces: 'fuel', forced: rationing }]),
      ).toBe('Mission team 4 brought back no one of each from Gather Materials.');
    });

    it('refuses a result the skill can’t force, so Utilities forces Fuel only (R9)', () => {
      expect(
        gatheredSubstitutionProblem(two, [
          { team: 1, replaces: 'hardware', forced: { skill: 'utilities', material: 'food' } },
        ]),
      ).toBe('A utilities use can’t make the gathered hardware food.');
      expect(
        gatheredSubstitutionProblem(two, [
          { team: 1, replaces: 'food', forced: { skill: 'rationing', material: 'food' } },
        ]),
      ).toBe('A rationing use can’t make the gathered food food.');
    });

    it('refuses replacing the same one twice on one team', () => {
      expect(
        gatheredSubstitutionProblem(two, [
          { team: 1, replaces: 'fuel', forced: rationing },
          { team: 1, replaces: 'fuel', forced: mechanics },
        ]),
      ).toBe('Mission team 1’s gathered fuel is substituted once.');
    });
  });

  describe('gathered', () => {
    it('applies each substitution to the team it names', () => {
      const two: Campaign = {
        ...community(),
        log: [...gathering(1, 4, 'food'), ...gathering(2, 3, 'fuel')],
      };

      expect(gathered(two, [{ team: 2, replaces: 'hardware', forced: utilities }])).toEqual({
        food: 3,
        fuel: 3,
        hardware: 1,
      });
      expect(gathered(two, [{ team: 1, replaces: 'food', forced: utilities }])).toEqual({
        food: 2,
        fuel: 3,
        hardware: 2,
      });
    });
  });

  describe('substitutionsSpent and checkMaterials', () => {
    const rationer = {
      ...createSurvivor('Ada Poole', 4, { id: 'ada' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
      skills: { rationing: 0 },
    };
    const out: Campaign = {
      ...community({ ada: { task: 'mission', team: 1 } }),
      survivors: [rationer],
      log: gathering(1, 4, 'hardware'),
    };
    const roll: MaterialRoll = { roll: 1, forced: rationing };
    const onFuel = { team: 1, replaces: 'fuel', forced: rationing } as const;
    const onHardware = { team: 1, replaces: 'hardware', forced: rationing } as const;

    it('draws the rolls’ and the haul’s substitutions from one pool per skill', () => {
      expect(substitutionsSpent([roll], [onFuel, onHardware])).toEqual({
        rationing: 3,
        mechanics: 0,
        utilities: 0,
      });
    });

    it('warns once the two together spend more than the team’s Score', () => {
      expect(substitutionUses(out, 'rationing')).toBe(2);
      expect(checkMaterials(out, [roll], [onFuel]).warnings).toEqual([]);
      expect(checkMaterials(out, [], [onFuel, onHardware]).warnings).toEqual([]);
      expect(codes(checkMaterials(out, [roll], [onFuel, onHardware]).warnings)).toEqual([
        'not-enough-substitution',
      ]);
    });

    it('counts a substituted haul against the storage caps', () => {
      // The Greasy Spoon stores 6 Food and makes 1 (pg. 54): 4 stored, 1 made
      // and the 1 gathered is 6, and two more substituted to Food is over.
      const level: Campaign = {
        ...out,
        base: { id: 'greasy-spoon', slots: {} },
        materials: { food: 4, fuel: 0, hardware: 0 },
      };

      expect(codes(checkMaterials(level, [], [onFuel, onHardware]).warnings)).toContain(
        'over-storage-cap',
      );
      expect(codes(checkMaterials(level, [], []).warnings)).not.toContain('over-storage-cap');
    });
  });
});

describe('gathered and gatheredToRoll', () => {
  const turn = (log: LogEntry[]) => ({ ...community(), log });

  it('splits each Gather Materials team on its own, and adds them up (R19)', () => {
    const two = turn([...gathering(1, 4, 'food'), ...gathering(2, 3, 'fuel')]);

    expect(gathered(two, [])).toEqual({ food: 3, fuel: 2, hardware: 2 });
    expect(gatheredToRoll(two)).toBe(0);
  });

  it('rolls a short haul instead, and says how many', () => {
    const short = turn([...gathering(1, 2, 'food'), ...gathering(2, 5, 'fuel')]);

    expect(gathered(short, [])).toEqual({ food: 1, fuel: 3, hardware: 1 });
    expect(gatheredToRoll(short)).toBe(2);
  });

  it('reads only Gather Materials outcomes', () => {
    const other = turn([
      ...gathering(1, 4, 'food'),
      {
        turn: 3,
        phase: 'mission',
        at: AT,
        event: {
          kind: 'thin-the-herd-resolved',
          team: 2,
          startingZombies: 6,
          zombiesLeft: 0,
          survivorsExited: 1,
          allIncapacitated: false,
        },
      },
    ]);

    expect(gathered(other, [])).toEqual({ food: 2, fuel: 1, hardware: 1 });
    expect(gatheredToRoll(other)).toBe(0);
  });

  it('rolls a Gather Materials haul whose team named no type, as a hand-edited save can hold', () => {
    const unchosen = turn([gathering(1, 4)[1] as LogEntry]);

    expect(gathered(unchosen, [])).toEqual(noMaterials());
    expect(gatheredToRoll(unchosen)).toBe(4);
  });

  it('reads nothing on a turn nobody gathered', () => {
    expect(gathered(community(), [])).toEqual(noMaterials());
    expect(gatheredToRoll(community())).toBe(0);
  });

  it('counts what was gathered against the storage caps', () => {
    const tight = {
      ...community({}, { id: 'small-town-home', slots: {} }),
      log: gathering(1, 10, 'food'),
    };

    expect(codes(checkMaterials(tight, [], []).warnings)).toContain('over-storage-cap');
  });
});

describe('rollsOwed (#257)', () => {
  const onAMission = (log: LogEntry[], teams: readonly number[] = [1]): Campaign => ({
    ...community(
      Object.fromEntries(
        teams.map((team, at) => [`survivor-${String(at)}`, { task: 'mission', team } as const]),
      ),
    ),
    survivors: teams.map((_, at) =>
      createSurvivor(`Survivor ${String(at)}`, 2, { id: `survivor-${String(at)}` }),
    ),
    log,
  });
  const thinned = (team: number): LogEntry => ({
    turn: 3,
    phase: 'mission',
    at: AT,
    event: {
      kind: 'thin-the-herd-resolved',
      team,
      startingZombies: 6,
      zombiesLeft: 0,
      survivorsExited: 1,
      allIncapacitated: false,
    },
  });

  it('owes none with nobody out', () => {
    expect(rollsOwed(community())).toBe(false);
  });

  it('owes none for a Gather Materials haul that came without a roll', () => {
    expect(rollsOwed(onAMission(gathering(1, 4, 'food')))).toBe(false);
  });

  it('owes them for a short Gather Materials haul, or any other mission', () => {
    expect(rollsOwed(onAMission(gathering(1, 2, 'food')))).toBe(true);
    expect(rollsOwed(onAMission([thinned(1)]))).toBe(true);
    expect(rollsOwed(onAMission([...gathering(1, 4, 'food'), thinned(2)], [1, 2]))).toBe(true);
  });

  it('owes them for a team out with no outcome recorded', () => {
    expect(rollsOwed(onAMission([]))).toBe(true);
  });
});
