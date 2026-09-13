/**
 * Add Materials to Storage — the third step of the Advancement Phase (pg. 18–19).
 *
 * ## Two sources, added together and accepted once
 *
 * A turn's materials come from two places the book keeps apart. The mission
 * recovers some: **one d10 per material recovered**, entered as rolled, which
 * is why nothing here generates a number. The base makes the rest, and Z3-5
 * already computes that from who is working what — this module only totals it
 * per material so the step can propose it.
 *
 * ## A substitution changes a roll; it never adds one
 *
 * Rationing, Mechanics and Utilities each let a survivor force a result (pg.
 * 12), with uses equal to that skill's summed Score across the mission team.
 * Forcing is an override of a die already rolled, so `recovered` always returns
 * exactly as many materials as there were rolls. Adding one instead is the
 * obvious wrong implementation and `materials.test.ts` holds the line on it.
 *
 * ## Storage caps are reported here and never enforced
 *
 * Check Storage is a Management Phase step (pg. 23), a whole phase later.
 * Trimming a community's haul the moment it arrives would destroy materials a
 * turn before the rules say to, and a player who is about to build something
 * with them would never see them. So the over-cap amount is a warning.
 *
 * Pure, like the rest of `src/engine`.
 */

import { MATERIALS, STORED_MATERIALS, type Material, type Materials } from '../data/materials';
import { suppliedOccupants } from './utilities';
import {
  MATERIAL_ROLL_TABLE,
  MATERIAL_SUBSTITUTIONS,
  SUBSTITUTION_SKILLS,
  type SubstitutionSkill,
} from '../data/turn';
import type { D10Result } from '../data/dice';
import { occupants, storageCaps } from './base';
import { missionTeam, staffOf } from './assignments';
import type { Campaign } from './campaign';
import type { Check, Violation } from './checks';
import { facilityProduction } from './production';
import { hungerPenalty } from './feeding';
import { skillScore } from './survivor';

export type MaterialsViolationCode = 'not-enough-substitution' | 'over-storage-cap';

export type MaterialsViolation = Violation<MaterialsViolationCode>;

export type MaterialsCheck = Check<MaterialsViolationCode>;

/**
 * One d10 rolled for one material the mission recovered (pg. 18–19).
 *
 * `forced` is present only when a substitution was spent on this roll, and it
 * carries the skill as well as the result because the uses are counted per
 * skill: two Rationing forces and one Mechanics force draw on two different
 * pools, and a record that only remembered the material could not tell them
 * apart.
 */
export interface MaterialRoll {
  readonly roll: D10Result;
  readonly forced?: { readonly skill: SubstitutionSkill; readonly material: Material };
}

/** An empty haul, which is what a turn with no rolls and no production adds. */
export function noMaterials(): Materials {
  return { food: 0, fuel: 0, hardware: 0, rare: 0 };
}

/** What one roll actually yielded, after any substitution spent on it. */
export function rolledMaterial(entry: MaterialRoll): Material {
  return entry.forced?.material ?? MATERIAL_ROLL_TABLE[entry.roll];
}

/**
 * The materials a set of rolls recovered.
 *
 * The count of everything returned equals the number of rolls, always. That is
 * the substitution rule expressed as a shape rather than as a comment.
 */
export function recovered(rolls: readonly MaterialRoll[]): Materials {
  const total = noMaterials();

  for (const entry of rolls) {
    total[rolledMaterial(entry)] += 1;
  }

  return total;
}

/**
 * What the base produces in materials this turn, from the current assignments.
 *
 * Through `facilityProduction` and `staffOf` rather than re-reading the
 * catalogue, so this and the number on the slot card cannot disagree — they are
 * the same computation summed differently.
 *
 * Utilities, Health, XP and Siege Threat are all production too and none of
 * them goes in storage, so only outputs that are materials are counted. A
 * negative line is kept: a facility that consumes Food (pg. 55) reduces the
 * haul, and dropping it would quietly feed the community for free.
 */
export function baseProduction(campaign: Campaign): Materials {
  const base = campaign.base;
  const total = noMaterials();

  if (base === null) return total;

  const penalty = hungerPenalty(campaign);

  for (const occupant of occupants(base)) {
    for (const line of facilityProduction(occupant, staffOf(campaign, occupant.slotId), penalty)) {
      for (const output of line.outputs) {
        if (isMaterial(output)) total[output] += line.amount;
      }
    }
  }

  return total;
}

function isMaterial(output: string): output is Material {
  return (MATERIALS as readonly string[]).includes(output);
}

/**
 * How many times a skill may override a roll this turn (pg. 12).
 *
 * The summed Score across the mission team, and a survivor who never learnt the
 * skill has no Score rather than a zero one — `skillScore` returns null, and
 * null contributes nothing.
 */
export function substitutionUses(campaign: Campaign, skill: SubstitutionSkill): number {
  const penalty = hungerPenalty(campaign);

  return missionTeam(campaign).reduce(
    (total, survivor) => total + (skillScore(survivor, skill, penalty) ?? 0),
    0,
  );
}

/** How many times each skill was actually spent across a set of rolls. */
export function substitutionsSpent(
  rolls: readonly MaterialRoll[],
): Record<SubstitutionSkill, number> {
  const spent = { rationing: 0, mechanics: 0, utilities: 0 };

  for (const entry of rolls) {
    if (entry.forced !== undefined) spent[entry.forced.skill] += 1;
  }

  return spent;
}

/** Whether a skill is allowed to force this result at all (pg. 12). */
export function canForce(skill: SubstitutionSkill, material: Material): boolean {
  return (MATERIAL_SUBSTITUTIONS[skill] as readonly Material[]).includes(material);
}

/** Two hauls added together, which is what the step puts in storage. */
export function combined(one: Materials, other: Materials): Materials {
  const total = noMaterials();

  for (const material of MATERIALS) total[material] = one[material] + other[material];

  return total;
}

/**
 * Everything wrong with adding this haul, none of it a blocker.
 *
 * Both codes are rules a table may be playing past or about to correct: a
 * miscounted Skill Score, or a haul that will be trimmed a phase later anyway.
 * Nothing here is the app having nothing to do, which is what a blocker is.
 */
export function checkMaterials(campaign: Campaign, rolls: readonly MaterialRoll[]): MaterialsCheck {
  const warnings: MaterialsViolation[] = [];
  const spent = substitutionsSpent(rolls);

  for (const skill of SUBSTITUTION_SKILLS) {
    const uses = substitutionUses(campaign, skill);

    if (spent[skill] > uses) {
      warnings.push({
        code: 'not-enough-substitution',
        message: `${spent[skill]} results forced with ${skill}, and the mission team’s Score is ${uses}.`,
        pages: 12,
      });
    }
  }

  const base = campaign.base;

  if (base !== null) {
    const adding = combined(recovered(rolls), baseProduction(campaign));
    const caps = storageCaps(base, suppliedOccupants(campaign));

    // Rare has no cap in the book (pg. 54), so `STORED_MATERIALS` is the list
    // rather than `MATERIALS` — a cap for it would be this app inventing one.
    for (const material of STORED_MATERIALS) {
      const cap = caps[material];
      const after = campaign.materials[material] + adding[material];

      if (after > cap) {
        warnings.push({
          code: 'over-storage-cap',
          message: `${after} ${material} is over this base’s ${cap}. Check Storage is a Management step, so it keeps until then.`,
          pages: 23,
        });
      }
    }
  }

  return { blockers: [], warnings };
}

/**
 * Whether this turn's materials have already gone into storage.
 *
 * Read off the log, the same way `planningHasBegun` reads the Planning Phase's
 * reset, and for the same reason: the step is destructive, the walk can go
 * backwards over it, and doing it twice hands a community a free turn's haul.
 * A stored flag would be a second copy of what the log already records.
 */
export function materialsAdded(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'materials-added',
  );
}

/** The campaign with a haul added to storage. Nothing is capped (pg. 23). */
export function withMaterialsAdded(campaign: Campaign, adding: Materials): Campaign {
  return { ...campaign, materials: combined(campaign.materials, adding) };
}
