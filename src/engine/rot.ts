/**
 * Check for Rot — the first step of the Management Phase (pg. 22).
 *
 * ## The app names the roll; the table makes it
 *
 * Every survivor at 0 Health makes a Tier check against 12, less the combined
 * Medicine of the Medical Clinic's staff. This module says who must check and
 * what they need; the player rolls a physical d10 and enters it, the same way
 * Z1-6's field recruit and Z3-7's material rolls work. Nothing here generates a
 * number.
 *
 * A natural 1 always fails and a natural 10 always succeeds (pg. 8), whatever
 * the target — which is what stops a well-staffed Clinic from making the check
 * a formality, and is the reason the target is left unclamped. See
 * [ruling 2](../../docs/phase-3-stories.md).
 *
 * ## A failure is two removals in the worst case
 *
 * The survivor turns and is removed. They also bite somebody assigned to
 * healing this turn for one Damage, and that survivor is removed in turn if it
 * takes them to zero. The book does not say *which* survivor is bitten where
 * more than one is being healed, so the app lists the candidates and the player
 * picks — the same posture as every other place the rules leave a choice to the
 * table.
 *
 * ## Unless the Clinic has Restraints
 *
 * Each set holds one turned survivor and the bite does not happen (pp. 72–73).
 * The catalogue has carried `preventsBiting` since Phase 2 with nothing
 * reading it, which is the shape half the September playtest's findings took:
 * the transcription was right and the code that sums never asked.
 *
 * ## Nothing happens without a confirmation
 *
 * These are the only functions in the engine that remove a survivor as a
 * *consequence* rather than as an edit, so the outcome is computed, shown, and
 * applied on a press. `rotOutcome` is what the screen shows; `withRotApplied`
 * is what the press does, and it recomputes the outcome rather than trusting
 * what it was handed.
 *
 * Pure, like the rest of `src/engine`.
 */

import { NATURAL_FAILURE, NATURAL_SUCCESS, type D10Result } from '../data/dice';
import { ROT_CHECK_TARGET, ROT_BITE_DAMAGE } from '../data/turn';
import { staffOf, survivorsDoing } from './assignments';
import { suppliedOccupants } from './utilities';
import type { Campaign, Survivor } from './campaign';
import { hungerPenalty } from './feeding';
import { skillScore } from './survivor';

/** Everybody at 0 Health, who must check this turn (pg. 22). */
export function mustCheck(campaign: Campaign): readonly Survivor[] {
  return campaign.survivors.filter((survivor) => survivor.currentHp <= 0);
}

/**
 * The number a Rot check has to reach (pg. 22).
 *
 * Twelve, less every point of Medicine across the Clinic's staff. **No floor**,
 * which is [ruling 2](../../docs/phase-3-stories.md): the book states none, the
 * natural-1 rule already stops the check becoming a certainty, and clamping
 * would be this app inventing a rule rather than recording one.
 *
 * The Medicine is read under the hunger penalty like every other Skill Score —
 * but Check for Rot runs *before* Feed, so on any given turn the penalty in
 * force is the one from the turn before.
 */
export function rotTarget(campaign: Campaign): number {
  // No base-less guard: with nothing to loop over the Medicine stays at zero,
  // and the target is the bare twelve either way.
  const penalty = hungerPenalty(campaign);
  let medicine = 0;

  for (const occupant of suppliedOccupants(campaign)) {
    if (occupant.facility.id !== 'medical-clinic') continue;

    for (const staff of staffOf(campaign, occupant.slotId)) {
      medicine += skillScore(staff, 'medicine', penalty) ?? 0;
    }
  }

  return ROT_CHECK_TARGET - medicine;
}

/**
 * Sets of Restraints across the community's Medical Clinics (pp. 72–73).
 *
 * "Each set prevents one turned survivor from biting", so this is a count of
 * preventions rather than of upgrades — read off `preventsBiting` for that
 * reason, which is the number the catalogue states and not an assumption that
 * one set stops one bite.
 *
 * The field had no reader at all until the September playtest went looking for
 * one: the transcription was right and nothing summed it.
 */
export function restraints(campaign: Campaign): number {
  return suppliedOccupants(campaign).reduce(
    (total, occupant) =>
      total +
      occupant.upgrades.reduce((sets, upgrade) => sets + (upgrade.effects.preventsBiting ?? 0), 0),
    0,
  );
}

/**
 * How many sets this turn has already used.
 *
 * Read off the log, like `rotCheckResolved` below and for the same reason: a
 * turning that was held is not recoverable from the campaign afterwards — the
 * survivor is gone either way, and the only difference is a bite that did not
 * happen.
 */
function restraintsUsed(campaign: Campaign): number {
  return campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'bite-restrained',
  ).length;
}

/**
 * Sets still free to hold somebody this turn (pp. 72–73).
 *
 * **Per turn**, which the book does not say in as many words and this app
 * rules on: a set of restraints is equipment bolted to a Clinic, not a thing
 * spent — so it holds one survivor each night rather than one ever. The
 * alternative reading, that a set is used up the first time it works, would
 * make the upgrade worth buying once and then worth nothing, which no other
 * upgrade in the book behaves like.
 */
export function restraintsFree(campaign: Campaign): number {
  return Math.max(0, restraints(campaign) - restraintsUsed(campaign));
}

/** Whoever could be bitten by a survivor who turns: everybody else being healed (pg. 22). */
export function biteCandidates(campaign: Campaign, turning: string): readonly Survivor[] {
  return survivorsDoing(campaign, (assignment) => assignment.task === 'healing').filter(
    (survivor) => survivor.id !== turning,
  );
}

/**
 * Whether a roll passes the check (pg. 8, 22).
 *
 * A Tier check is the die plus the survivor's Tier against the target, with the
 * two natural results overriding it in both directions.
 */
export function rotCheckPasses(survivor: Survivor, roll: D10Result, target: number): boolean {
  if (roll === NATURAL_FAILURE) return false;
  if (roll === NATURAL_SUCCESS) return true;

  return roll + survivor.tier >= target;
}

/** What a failed check costs, beyond the survivor who turned. */
export interface RotOutcome {
  /** The survivor who turned, or `null` when the check passed. */
  readonly turned: Survivor | null;

  /**
   * Who they bit and whether it finishes them, or `null` where nobody was
   * bitten.
   *
   * One field rather than a survivor beside a `bittenDies` flag, because the
   * flag could not be true without the survivor and every reader had to say so
   * again — a guard the typechecker wanted and no test could reach. Nested,
   * the invariant is in the type.
   */
  readonly bitten: { readonly survivor: Survivor; readonly dies: boolean } | null;

  /**
   * Whether a set of Restraints held them, which is why nobody was bitten
   * (pp. 72–73).
   *
   * Beside `bitten` rather than folded into it, because "nobody was being
   * healed" and "the Restraints held them" are the same `null` and different
   * things to say — and the second one spends something, so the log has to be
   * able to tell them apart.
   */
  readonly restrained: boolean;
}

/**
 * Everything a check result means, before any of it is applied.
 *
 * `bitten` is the survivor the player chose, and is `null` when nobody was
 * being healed — a community with nobody in the Clinic loses one survivor
 * rather than two.
 */
export function rotOutcome(
  campaign: Campaign,
  survivorId: string,
  roll: D10Result,
  bittenId: string | null,
): RotOutcome {
  const survivor = campaign.survivors.find((candidate) => candidate.id === survivorId);

  if (survivor === undefined || rotCheckPasses(survivor, roll, rotTarget(campaign))) {
    return { turned: null, bitten: null, restrained: false };
  }

  const candidates = biteCandidates(campaign, survivorId);

  /*
   * A set of Restraints holds them, and the bite does not happen (pp. 72–73).
   *
   * Asked against the candidates rather than against the one the player picked,
   * because what a set prevents is a bite — a community with nobody in the
   * Clinic has no bite to prevent, and spending a set on it would leave the
   * next turning unheld for nothing.
   */
  if (candidates.length > 0 && restraintsFree(campaign) > 0) {
    return { turned: survivor, bitten: null, restrained: true };
  }

  const bitten = candidates.find((candidate) => candidate.id === bittenId);

  return {
    turned: survivor,
    bitten:
      bitten === undefined
        ? null
        : { survivor: bitten, dies: bitten.currentHp - ROT_BITE_DAMAGE <= 0 },
    restrained: false,
  };
}

/**
 * The campaign after a failed check has been paid for.
 *
 * Both removals and the Damage in one step, because they are one consequence:
 * a screen that applied the turning and then asked again about the bite would
 * be offering to leave half a rule unplayed.
 */
export function withRotApplied(campaign: Campaign, outcome: RotOutcome): Campaign {
  if (outcome.turned === null) return campaign;

  const gone = new Set([outcome.turned.id]);
  if (outcome.bitten?.dies === true) gone.add(outcome.bitten.survivor.id);

  return {
    ...campaign,
    survivors: campaign.survivors
      .filter((survivor) => !gone.has(survivor.id))
      .map((survivor) =>
        survivor.id === outcome.bitten?.survivor.id
          ? { ...survivor, currentHp: survivor.currentHp - ROT_BITE_DAMAGE }
          : survivor,
      ),
    // A survivor who is gone takes their assignment with them, the way
    // `survivor/removed` has since Z3-4 — a task keyed to nobody is exactly the
    // orphan that survives a save and breaks a screen three turns later.
    assignments: Object.fromEntries(
      Object.entries(campaign.assignments).filter(([id]) => !gone.has(id)),
    ),
  };
}

/**
 * Whether this survivor's Rot check has already been resolved this turn
 * (pg. 22).
 *
 * Per survivor rather than per step, unlike Feed or Check Storage: the step
 * resolves one check for each survivor at 0 Health, so "already done" is a
 * question about a person and not about the phase. Without it the same
 * survivor can be checked twice — observed passing at 10 and then dying at 1,
 * both entries in the log.
 */
export function rotCheckResolved(campaign: Campaign, survivorId: string): boolean {
  return campaign.log.some(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'rot-checked' &&
      entry.event.survivor === survivorId,
  );
}
