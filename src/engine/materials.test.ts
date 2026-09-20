import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Base, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import {
  baseProduction,
  canForce,
  checkMaterials,
  combined,
  materialsAdded,
  noMaterials,
  recovered,
  rolledMaterial,
  substitutionUses,
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
    expect(rolledMaterial({ roll: 10 })).toBe('rare');
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
      rare: 0,
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
      { roll: 10, forced: { skill: 'utilities', material: 'hardware' } },
    ];

    expect(size(recovered(rolls))).toBe(rolls.length);
    expect(recovered(rolls)).toEqual({ food: 1, fuel: 1, hardware: 1, rare: 0 });

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
    expect(canForce('rationing', 'rare')).toBe(false);

    expect(canForce('mechanics', 'hardware')).toBe(true);
    expect(canForce('mechanics', 'food')).toBe(false);
  });

  /**
   * Ruling 4. The book writes Utilities as "a given material" where the other
   * two name one, and this takes the literal reading — Rare included, which is
   * the reading's most surprising consequence and therefore the one worth
   * writing down.
   */
  it('lets Utilities force any of the four, which is the open ruling', () => {
    for (const material of MATERIALS) {
      expect(canForce('utilities', material)).toBe(true);
    }
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
      substitutionsSpent([
        { roll: 1, forced: { skill: 'rationing', material: 'food' } },
        { roll: 2, forced: { skill: 'rationing', material: 'food' } },
        { roll: 3, forced: { skill: 'mechanics', material: 'hardware' } },
        { roll: 4 },
      ]),
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
      rare: 0,
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
      combined(
        { food: 1, fuel: 2, hardware: 3, rare: 4 },
        { food: 10, fuel: 0, hardware: -1, rare: 0 },
      ),
    ).toEqual({ food: 11, fuel: 2, hardware: 2, rare: 4 });
  });
});

describe('checkMaterials', () => {
  const greasySpoon = (): Base => ({ id: 'greasy-spoon', slots: {} });

  it('never blocks anything', () => {
    const check = checkMaterials(community(), [
      { roll: 1, forced: { skill: 'rationing', material: 'food' } },
    ]);

    expect(check.blockers).toEqual([]);
    expect(check.warnings.length).toBeGreaterThan(0);
  });

  it('warns when more results were forced than the team can force', () => {
    const check = checkMaterials(community(), [
      { roll: 1, forced: { skill: 'mechanics', material: 'hardware' } },
    ]);

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
      checkMaterials(campaign, [
        { roll: 1, forced: { skill: 'mechanics', material: 'hardware' } },
        { roll: 2, forced: { skill: 'mechanics', material: 'hardware' } },
      ]).warnings,
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
      materials: { food: 6, fuel: 0, hardware: 0, rare: 0 },
    };
    const check = checkMaterials(full, [{ roll: 4 }]);

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
      materials: { food: 4, fuel: 0, hardware: 0, rare: 0 },
    };

    expect(checkMaterials(level, [{ roll: 4 }]).warnings).toEqual([]);

    // And one more is over.
    expect(
      codes(
        checkMaterials({ ...level, materials: { ...level.materials, food: 5 } }, [{ roll: 4 }])
          .warnings,
      ),
    ).toEqual(['over-storage-cap']);
  });

  it('has no cap to report for Rare, which the book gives none', () => {
    const hoard: Campaign = {
      ...community({}, greasySpoon()),
      materials: { food: 0, fuel: 0, hardware: 0, rare: 99 },
    };

    expect(checkMaterials(hoard, [{ roll: 10 }]).warnings).toEqual([]);
  });

  it('has no caps to report at all without a base', () => {
    const rich: Campaign = {
      ...community(),
      materials: { food: 999, fuel: 999, hardware: 999, rare: 999 },
    };

    expect(checkMaterials(rich, [{ roll: 4 }]).warnings).toEqual([]);
  });

  it('counts what the base makes against the cap as well as what was rolled', () => {
    // Six stored plus the Hobby Farm's two flat Food is eight, over its cap of
    // seven — and no roll was involved at all.
    const nearly: Campaign = {
      ...community({}, { id: 'hobby-farm', slots: {} }),
      materials: { food: 6, fuel: 0, hardware: 0, rare: 0 },
    };

    expect(codes(checkMaterials(nearly, []).warnings)).toEqual(['over-storage-cap']);
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
    event: { kind: 'materials-added', food: 1, fuel: 0, hardware: 0, rare: 0 },
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
      materials: { food: 2, fuel: 2, hardware: 2, rare: 2 },
    };

    expect(
      withMaterialsAdded(stocked, { food: 1, fuel: 0, hardware: -1, rare: 0 }).materials,
    ).toEqual({ food: 3, fuel: 2, hardware: 1, rare: 2 });
  });

  it('caps nothing, because Check Storage is a Management step', () => {
    const full: Campaign = {
      ...community({}, { id: 'greasy-spoon', slots: {} }),
      materials: { food: 6, fuel: 0, hardware: 0, rare: 0 },
    };

    expect(
      withMaterialsAdded(full, { food: 10, fuel: 0, hardware: 0, rare: 0 }).materials.food,
    ).toBe(16);
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
