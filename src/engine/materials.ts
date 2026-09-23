/**
 * Add Materials to Storage — the third step of the Advancement Phase (pg. 18–19).
 *
 * ## Three sources, added together and accepted once
 *
 * A turn's materials come from places the book keeps apart. The mission
 * recovers some: **one d10 per material recovered**, entered as rolled, which
 * is why nothing here generates a number. The base makes the rest, and Z3-5
 * already computes that from who is working what — this module only totals it
 * per material so the step can propose it.
 *
 * And a community that skipped the mission may have sent somebody scavenging
 * (pg. 17), which pays a flat haul rather than a rolled one. That third source
 * was assignable, validated, persisted and labelled for two rounds of playtest
 * and **paid out nothing**, because the two constants saying what it yields had
 * no reader (#163). Every visible part of the feature existed; only the part
 * that does the work was missing, which is why walking the phases never found
 * it and playing twenty turns did.
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
  SCAVENGE_PER_MATERIAL_WITH_SKILL,
  SCAVENGE_TOTAL_WITHOUT_SKILL,
  SUBSTITUTION_SKILLS,
  type SubstitutionSkill,
} from '../data/turn';
import type { D10Result } from '../data/dice';
import { storageCaps } from './base';
import { beforePlanning, staffOf, survivorsDoing } from './assignments';
import { deployed } from './siege';
import type { Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { facilityProduction, NO_PENALTY } from './production';
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
  // No guard for a base-less campaign: `suppliedOccupants` answers that with an
  // empty list, and a loop over it produces the same empty haul. The guard was
  // load-bearing while this read `occupants(base)`, which needs the base.
  const total = noMaterials();
  const penalty = hungerPenalty(campaign);

  // Staffed last Planning Phase, read this Advancement one — so it is asked of
  // the campaign as it stood before this turn's Planning cleared the answer.
  // The utilities are resolved against that same campaign, because a point is
  // backed by the Station's staffing and that is the staffing in question.
  const staffed = beforePlanning(campaign);

  for (const occupant of suppliedOccupants(staffed)) {
    for (const line of facilityProduction(occupant, staffOf(staffed, occupant.slotId), penalty)) {
      for (const output of line.outputs) {
        if (isMaterial(output)) total[output] += line.amount;
      }
    }
  }

  return total;
}

/**
 * The survivor who scavenged this turn, if anybody did (pg. 17).
 *
 * Read off `beforePlanning` like the mission team and the base's production,
 * and for the same reason: the assignment was made in the Planning Phase of the
 * turn that has just played, and this turn's Planning Phase clears it.
 *
 * One at most. Two would be a rule the Planning Phase warns about
 * (`someone-else-scavenging`) rather than refuses, so roster order picks — the
 * same answer `staffOf` gives an over-staffed facility, and stable.
 */
export function scavenger(campaign: Campaign): Survivor | undefined {
  return survivorsDoing(beforePlanning(campaign), (task) => task.task === 'scavenging')[0];
}

/**
 * Whether this survivor scavenges as the skill does (pg. 17).
 *
 * **Having the skill, not scoring in it**, which is R8's shape: the book names
 * the skill as the trigger and never mentions a Score, and a Scavenge of 0 is
 * reachable through a hunger penalty. `skillScore` returns null for a survivor
 * who never learnt it and a number for one who has, including zero.
 */
export function scavengesEverything(survivor: Survivor): boolean {
  return skillScore(survivor, 'scavenge', NO_PENALTY) !== null;
}

/**
 * What the scavenger brings back (pg. 17).
 *
 * With the skill, one of **every** material type. Without it, one of a single
 * type — and which one is the player's to say, so this takes the choice rather
 * than picking. Nothing until they have chosen: a haul this step has not been
 * told about is not a haul of Food by default.
 *
 * Flat either way. The Scavenge Score scales nothing here, which is why the two
 * constants are counts rather than multipliers.
 *
 * Not conditioned on the mission actually being skipped. Mission setup is Phase
 * 4's and this app cannot see whether the community went out, so the Planning
 * Phase says the rule at the point of assignment
 * (`scavenging-needs-the-mission-skipped`) and this pays whoever was assigned —
 * Z3-6's posture, where the walk guides and does not refuse.
 */
export function scavenged(campaign: Campaign, chosen?: Material): Materials {
  const survivor = scavenger(campaign);
  const total = noMaterials();

  if (survivor === undefined) return total;

  if (scavengesEverything(survivor)) {
    for (const material of MATERIALS) total[material] = SCAVENGE_PER_MATERIAL_WITH_SKILL;

    return total;
  }

  if (chosen !== undefined) total[chosen] = SCAVENGE_TOTAL_WITHOUT_SKILL;

  return total;
}

/**
 * Whether the step is still waiting to be told which material was scavenged.
 *
 * The one thing on this step a player can leave unanswered that costs them
 * something: an unskilled scavenger's whole turn comes to nothing if the step
 * is committed without a choice. The screen asks, and this is what it asks
 * about.
 */
export function scavengeNeedsAChoice(campaign: Campaign, chosen?: Material): boolean {
  const survivor = scavenger(campaign);

  return survivor !== undefined && !scavengesEverything(survivor) && chosen === undefined;
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

  // The same team the XP pools read: everybody deploys to a Siege Defense
  // (pg. 85), so a siege turn's substitutions are the whole community's Scores
  // rather than an empty team's nothing (#167).
  return deployed(campaign).reduce(
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
