/**
 * A Veteran's healing in the Planning Phase (pg. 88; R90, R91, R137; Z7-2).
 *
 * A Veteran spends 1 XP of their own for each survivor at 0 Health they bring
 * up to 1, as many as their XP pays for, themselves included (R137). One above
 * 0 is past it, so nobody takes two. A survivor brought up has no Rot check
 * that turn (R91), which needs nothing here: the check reads their Health.
 *
 * A Jaded survivor counts it against their 1 Health a turn from every source
 * together (R90), so one already given a point this turn is passed over, and
 * Heal Wounds, walked back to, passes over one the Veteran has reached.
 *
 * Pure, like the rest of `src/engine`.
 */

import { VETERAN_HEALING } from '../data/traits';
import type { Campaign, Survivor } from './campaign';
import { outOfHealth } from './survivor';
import { healthPerTurn } from './traits';
import { phaseOf } from './turn';

/** The Health this turn has already given a survivor, from Heal Wounds and a Veteran. */
export function healthThisTurn(campaign: Campaign, survivor: string): number {
  return campaign.log.reduce((total, entry) => {
    if (entry.turn !== campaign.turn) return total;

    const { event } = entry;
    if (event.kind === 'health-restored' && event.survivor === survivor) {
      return total + event.health;
    }
    if (event.kind === 'veteran-healed' && event.survivor === survivor) {
      return total + VETERAN_HEALING.health;
    }

    return total;
  }, 0);
}

/** Why this Veteran cannot bring this survivor up now, or `null`. */
export function veteranHealingProblem(
  campaign: Campaign,
  veteran: string,
  survivor: string,
): string | null {
  if (phaseOf(campaign.step) !== 'planning') {
    return 'A Veteran heals in the Planning Phase.';
  }

  const healer = campaign.survivors.find((one) => one.id === veteran);
  if (healer?.veteran !== true) return 'Only a Veteran in the community can do this.';
  if (healer.xp < VETERAN_HEALING.xp) {
    return `${healer.name} has no XP to spend on it.`;
  }

  const hurt = campaign.survivors.find((one) => one.id === survivor);
  if (hurt === undefined || !outOfHealth(hurt)) {
    return 'Only a survivor at 0 Health can be brought up.';
  }

  if (healthThisTurn(campaign, survivor) >= (healthPerTurn(hurt) ?? Infinity)) {
    return `${hurt.name} is Jaded, and has had their Health for this turn.`;
  }

  return null;
}

/** The survivors at 0 Health this Veteran could bring up now. */
export function veteranCanReach(campaign: Campaign, veteran: string): readonly Survivor[] {
  return campaign.survivors.filter(
    (survivor) => veteranHealingProblem(campaign, veteran, survivor.id) === null,
  );
}

/**
 * The campaign with the Veteran's XP spent and the survivor at 1 Health.
 * Assumes the check passed; the Veteran may be the survivor (R137).
 */
export function withVeteranHealing(
  campaign: Campaign,
  veteran: string,
  survivor: string,
): Campaign {
  return {
    ...campaign,
    survivors: campaign.survivors.map((one) => {
      const paid = one.id === veteran ? { ...one, xp: one.xp - VETERAN_HEALING.xp } : one;

      return one.id === survivor
        ? { ...paid, currentHp: Math.max(0, paid.currentHp) + VETERAN_HEALING.health }
        : paid;
    }),
  };
}
