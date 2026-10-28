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
 * A Gather Materials haul has no die to override (pg. 80), and FAQ "Gather
 * Materials and Coop Skills" gives the same uses something else to change: the
 * guaranteed one of each type, and never the remainder in the type the team
 * chose (#221). So a `GatheredSubstitution` replaces one of those three, from
 * the same pools as the rolls' substitutions, and `gatheredBy` still returns
 * exactly as many materials as the team carried off.
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
  type MaterialRollResult,
  type SubstitutionSkill,
} from '../data/turn';
import type { D10Result } from '../data/dice';
import { storageCaps } from './base';
import { beforePlanning, staffOf, survivorsDoing } from './assignments';
import { GATHERED_MATERIALS } from '../data/missions';
import { deployed, outcomeTeam, teamOutcomes, turnMissions } from './missions';
import { siegeDue } from './siege';
import { whoWorked } from './siegeWork';
import type { Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { facilityProduction, NO_PENALTY } from './production';
import { hungerPenalty } from './feeding';
import { advantagesOf, skillScore } from './survivor';

export type MaterialsViolationCode = 'not-enough-substitution' | 'over-storage-cap';

export type MaterialsViolation = Violation<MaterialsViolationCode>;

export type MaterialsCheck = Check<MaterialsViolationCode>;

/** A result a substitution forced: the skill whose use was spent, and what it gave (pg. 12). */
export interface Forced {
  readonly skill: SubstitutionSkill;
  readonly material: Material;
}

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
  readonly forced?: Forced;
  /**
   * Made a 10 by Crashed Convoy, whatever it rolled, so a Rare Item Table
   * roll (pp. 19, 101; R126; Z7-4). Never with `forced`: a roll is one or the
   * other.
   */
  readonly madeTen?: true;
}

/** An empty haul, which is what a turn with no rolls and no production adds. */
export function noMaterials(): Materials {
  return { food: 0, fuel: 0, hardware: 0 };
}

/**
 * What one roll actually yielded, after any substitution spent on it: a
 * material, or a roll on the Rare Item Table for an unforced 10 (pp. 12, 19).
 * No skill forces a 10 (R9), and Crashed Convoy makes one (R126).
 */
export function rolledMaterial(entry: MaterialRoll): MaterialRollResult {
  if (entry.madeTen === true) return MATERIAL_ROLL_TABLE[10];

  return entry.forced?.material ?? MATERIAL_ROLL_TABLE[entry.roll];
}

/** How many rolls Crashed Convoy made 10s. */
export function madeTens(rolls: readonly MaterialRoll[]): number {
  return rolls.filter((entry) => entry.madeTen === true).length;
}

/** How many of these rolls are Rare Item Table rolls rather than materials (pg. 19). */
export function rareItemRolls(rolls: readonly MaterialRoll[]): number {
  return rolls.filter((entry) => rolledMaterial(entry) === 'rare-item').length;
}

/**
 * The materials a set of rolls recovered.
 *
 * The count of everything returned, with `rareItemRolls`, equals the number of
 * rolls, always. That is the substitution rule expressed as a shape rather
 * than as a comment: a 10 is an item instead of a material, not as well.
 */
export function recovered(rolls: readonly MaterialRoll[]): Materials {
  const total = noMaterials();

  for (const entry of rolls) {
    const result = rolledMaterial(entry);
    if (result !== 'rare-item') total[result] += 1;
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
  // What the facility makes is asked of who could still work it: a siege this
  // turn takes its casualties off their posts, and not off the utilities they
  // generated before it (`siegeWork.ts`, #183).
  const staffed = beforePlanning(campaign);

  for (const occupant of suppliedOccupants(staffed)) {
    const staff = whoWorked(campaign, staffOf(staffed, occupant));

    for (const line of facilityProduction(occupant, staff, penalty)) {
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
 *
 * **Nobody on a siege turn** ([R42](../../docs/rulings.md)). Scavenging is what
 * a community does instead of a mission (pg. 17), and a siege skips nothing:
 * the whole community deploys to it (pp. 23, 85). Planning assigns before the
 * horde is checked (pg. 21), so a scavenger can stand assigned on that turn;
 * `scavengerStoodDown` names them for the screen. Every reader of who
 * scavenged — the find, its choice, the haul's entry — asks this.
 */
export function scavenger(campaign: Campaign): Survivor | undefined {
  return siegeDue(campaign) ? undefined : assignedScavenger(campaign);
}

/** Whoever the Planning Phase assigned to scavenge, siege or not. */
function assignedScavenger(campaign: Campaign): Survivor | undefined {
  return survivorsDoing(beforePlanning(campaign), (task) => task.task === 'scavenging')[0];
}

/**
 * The survivor assigned to scavenge on a turn a siege deployed them instead,
 * or `undefined` (R42) — so the haul can say why they found nothing.
 */
export function scavengerStoodDown(campaign: Campaign): Survivor | undefined {
  return siegeDue(campaign) ? assignedScavenger(campaign) : undefined;
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
 * Not conditioned on the mission actually being skipped, but for a siege:
 * the Planning Phase says the rule at the point of assignment — while a mission
 * team is assigned beside the scavenger (`scavenging-needs-the-mission-skipped`,
 * #191) — and this pays whoever was assigned, Z3-6's posture, where the walk
 * guides and does not refuse. A siege turn is the one the app can see, and
 * `scavenger` has nobody on it (R42).
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

/**
 * How many times each skill was actually spent across a set of rolls and the
 * substitutions on what Gather Materials teams brought back: one pool per
 * skill for both (pg. 12; FAQ "Gather Materials and Coop Skills"; #221).
 */
export function substitutionsSpent(
  rolls: readonly MaterialRoll[],
  substitutions: readonly GatheredSubstitution[],
): Record<SubstitutionSkill, number> {
  const spent = { rationing: 0, mechanics: 0, utilities: 0 };

  for (const { forced } of [...rolls, ...substitutions]) {
    if (forced !== undefined) spent[forced.skill] += 1;
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
 * A substitution spent on one of a Gather Materials team's guaranteed one of
 * each type (pp. 12, 80; FAQ "Gather Materials and Coop Skills"; #221).
 *
 * Named by the material it `replaces` rather than by a place in the haul,
 * because the one of each is all a substitution may touch there: the remainder
 * in the chosen type has nothing to name it by. The one of the chosen type is
 * one of the one of each like the others, which is how the FAQ's own example
 * turns all three into Food.
 */
export interface GatheredSubstitution {
  readonly team: number;
  readonly replaces: Material;
  readonly forced: Forced;
}

/**
 * What one Gather Materials team's haul comes to, without a roll (pg. 80; Z4-6).
 *
 * One of each gathered type and the rest in the type chosen at Select Mission,
 * with each of the one of each that a substitution replaced counted as what it
 * forced instead (FAQ "Gather Materials and Coop Skills"; #221). The remainder
 * is added after, so no substitution can reach it.
 *
 * A team that carried off fewer than one of each gets nothing here: its
 * materials are rolled like any others, and `gatheredToRoll` says how many.
 * Nothing either for a choice that named no type, which only a save edited by
 * hand can hold.
 */
export function gatheredBy(
  carried: number,
  chosen: Material | undefined,
  substitutions: readonly Omit<GatheredSubstitution, 'team'>[],
): Materials {
  if (!splits(carried, chosen)) return noMaterials();

  const each = GATHERED_MATERIALS.reduce((total, material) => {
    const result =
      substitutions.find((substitution) => substitution.replaces === material)?.forced.material ??
      material;

    return { ...total, [result]: total[result] + 1 };
  }, noMaterials());

  return { ...each, [chosen]: each[chosen] + carried - GATHERED_MATERIALS.length };
}

/** Whether a Gather Materials haul is split rather than rolled (pg. 80). */
function splits(carried: number, chosen: Material | undefined): chosen is Material {
  return chosen !== undefined && carried >= GATHERED_MATERIALS.length;
}

/** This turn's Gather Materials teams' outcomes, each with the type its team chose. */
function gatherings(
  campaign: Campaign,
): readonly { team: number; carried: number; chosen: Material | undefined }[] {
  const { choices } = turnMissions(campaign);

  return [...teamOutcomes(campaign).values()].flatMap((outcome) => {
    if (outcome.kind !== 'gather-materials-resolved') return [];

    const team = outcomeTeam(outcome);
    const chosen = choices.find((choice) => choice.team === team)?.material;

    return [{ team, carried: outcome.materialsCarriedOut, chosen }];
  });
}

/**
 * The teams whose Gather Materials haul came back as one of each and the rest
 * this turn, so have a one of each a substitution may replace (pg. 80; FAQ
 * "Gather Materials and Coop Skills"; #221). A short haul is rolled, and its
 * rolls are substituted like any others.
 */
export function substitutableGatherings(campaign: Campaign): readonly number[] {
  return gatherings(campaign)
    .filter((gathering) => splits(gathering.carried, gathering.chosen))
    .map((gathering) => gathering.team);
}

/**
 * What a substitution may force in place of one of a Gather Materials team's
 * one of each (pg. 12; R9; FAQ "Gather Materials and Coop Skills"; #221):
 * whatever each skill can force, but the material it would replace, which
 * would spend a use on nothing.
 */
export function substitutionsFor(replaces: Material): readonly Forced[] {
  return SUBSTITUTION_SKILLS.flatMap((skill) =>
    MATERIALS.filter((material) => material !== replaces && canForce(skill, material)).map(
      (material) => ({ skill, material }),
    ),
  );
}

/**
 * Why these substitutions on Gather Materials hauls can't be accepted, or
 * `null` (FAQ "Gather Materials and Coop Skills"; #221).
 *
 * Each names a team `substitutableGatherings` offers, a result
 * `substitutionsFor` offers, and a material of that team's one of each no
 * other substitution has replaced. Spending more uses than a skill has is not
 * here: it is the warning `checkMaterials` gives the rolls' substitutions too.
 */
export function gatheredSubstitutionProblem(
  campaign: Campaign,
  substitutions: readonly GatheredSubstitution[],
): string | null {
  const teams = substitutableGatherings(campaign);
  const replaced = new Set<string>();

  for (const { team, replaces, forced } of substitutions) {
    if (!teams.includes(team)) {
      return `Mission team ${String(team)} brought back no one of each from Gather Materials.`;
    }
    if (
      !substitutionsFor(replaces).some(
        (offered) => offered.skill === forced.skill && offered.material === forced.material,
      )
    ) {
      return `A ${forced.skill} use can’t make the gathered ${replaces} ${forced.material}.`;
    }

    const key = `${String(team)} ${replaces}`;
    if (replaced.has(key)) {
      return `Mission team ${String(team)}’s gathered ${replaces} is substituted once.`;
    }
    replaced.add(key);
  }

  return null;
}

/**
 * What every Gather Materials team this turn brought back without a roll
 * (pg. 80; Z4-6), added to the haul beside the rolled materials and the base's
 * production. Several teams may have gathered (R19), and each is split on its
 * own, with the substitutions that name it (#221).
 */
export function gathered(
  campaign: Campaign,
  substitutions: readonly GatheredSubstitution[],
): Materials {
  return gatherings(campaign).reduce(
    (total, gathering) =>
      combined(
        total,
        gatheredBy(
          gathering.carried,
          gathering.chosen,
          substitutions.filter((substitution) => substitution.team === gathering.team),
        ),
      ),
    noMaterials(),
  );
}

/**
 * How many of the materials Gather Materials teams carried off are rolled after
 * all, because a team brought back fewer than one of each type (pg. 80; Z4-6).
 * The table rolls them with the rest; this is what the step says out loud.
 */
export function gatheredToRoll(campaign: Campaign): number {
  return gatherings(campaign)
    .filter((gathering) => !splits(gathering.carried, gathering.chosen))
    .reduce((total, gathering) => total + gathering.carried, 0);
}

/**
 * The Food Forager brings back (pg. 139; R164; Z7-10): 1 for each survivor
 * with it who went on this turn's mission, added at Add Materials to Storage.
 * None on a siege turn: a Siege Defense isn't going on a mission.
 */
export function foraged(campaign: Campaign): Materials {
  const food = siegeDue(campaign)
    ? 0
    : deployed(campaign).reduce(
        (total, survivor) =>
          total +
          advantagesOf(survivor).reduce((sum, rules) => sum + (rules.foodPerMission ?? 0), 0),
        0,
      );

  return { ...noMaterials(), food };
}

/**
 * Whether this turn's haul is owed dice the table rolls (pp. 17–18, 80; #257):
 * somebody went out, and either a team played a mission whose materials are
 * rolled, or a Gather Materials team came back short and rolls after all.
 *
 * A turn whose only haul is what Gather Materials teams brought back without a
 * roll owes none, so an empty list of rolls is the right answer then and not
 * the shape of rolls lost before they were entered (#96). A team gone out with
 * no outcome recorded is assumed to owe them.
 */
export function rollsOwed(campaign: Campaign): boolean {
  if (deployed(campaign).length === 0) return false;
  if (gatheredToRoll(campaign) > 0) return true;

  const outcomes = [...teamOutcomes(campaign).values()];

  return (
    outcomes.length === 0 ||
    outcomes.some((outcome) => outcome.kind !== 'gather-materials-resolved')
  );
}

/**
 * Everything wrong with adding this haul, none of it a blocker.
 *
 * Both codes are rules a table may be playing past or about to correct: a
 * miscounted Skill Score, or a haul that will be trimmed a phase later anyway.
 * Nothing here is the app having nothing to do, which is what a blocker is.
 */
export function checkMaterials(
  campaign: Campaign,
  rolls: readonly MaterialRoll[],
  substitutions: readonly GatheredSubstitution[],
): MaterialsCheck {
  const warnings: MaterialsViolation[] = [];
  const spent = substitutionsSpent(rolls, substitutions);

  for (const skill of SUBSTITUTION_SKILLS) {
    const uses = substitutionUses(campaign, skill);

    if (spent[skill] > uses) {
      warnings.push({
        code: 'not-enough-substitution',
        message: `${spent[skill]} results forced with ${skill}, but the mission team’s Score is only ${uses}.`,
        pages: 12,
      });
    }
  }

  const base = campaign.base;

  if (base !== null) {
    const adding = combined(
      combined(recovered(rolls), gathered(campaign, substitutions)),
      baseProduction(campaign),
    );
    const caps = storageCaps(base, suppliedOccupants(campaign));

    // Rare has no cap in the book (pg. 54), so `STORED_MATERIALS` is the list
    // rather than `MATERIALS` — a cap for it would be this app inventing one.
    for (const material of STORED_MATERIALS) {
      const cap = caps[material];
      const after = campaign.materials[material] + adding[material];

      if (after > cap) {
        warnings.push({
          code: 'over-storage-cap',
          message: `${after} ${material} is over this base’s ${cap}. It stays until Check Storage, in the Management Phase.`,
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
