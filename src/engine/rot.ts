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
import { occupants } from './base';
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
  const base = campaign.base;
  if (base === null) return ROT_CHECK_TARGET;

  const penalty = hungerPenalty(campaign);
  let medicine = 0;

  for (const occupant of occupants(base)) {
    if (occupant.facility.id !== 'medical-clinic') continue;

    for (const staff of staffOf(campaign, occupant.slotId)) {
      medicine += skillScore(staff, 'medicine', penalty) ?? 0;
    }
  }

  return ROT_CHECK_TARGET - medicine;
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
    return { turned: null, bitten: null };
  }

  const bitten = biteCandidates(campaign, survivorId).find(
    (candidate) => candidate.id === bittenId,
  );

  return {
    turned: survivor,
    bitten:
      bitten === undefined
        ? null
        : { survivor: bitten, dies: bitten.currentHp - ROT_BITE_DAMAGE <= 0 },
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
