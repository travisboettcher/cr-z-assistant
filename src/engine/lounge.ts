/**
 * Madness Recovery in the Lounge (pp. 21, 68; R110; Z7-7).
 *
 * A survivor assigned to Madness Recovery in the Planning Phase, in place of
 * resting or healing, has Madness taken off at the next Heal Wounds. Each
 * working Lounge makes 2 points, 4 with Power (pg. 68), and the points are
 * shared equally among everybody assigned, as healing points are: nobody takes
 * a second until everyone who can use one has had a first, and points nobody
 * can use are left unspent. Madness never goes below 0.
 *
 * Read off last turn's Planning, as healing is (`beforePlanning`): the
 * Advancement Phase runs before this turn's assignments are made.
 *
 * Pure, like the rest of `src/engine`.
 */

import { beforePlanning, survivorsDoing } from './assignments';
import { working } from './base';
import type { Campaign, Survivor } from './campaign';
import { suppliedOccupants } from './utilities';

/** Madness a Lounge takes off one survivor this turn. */
export interface MadnessAward {
  readonly survivor: Survivor;
  readonly madness: number;
}

/** The Madness the base's working Lounges make this turn: 2 each, 4 with Power (pg. 68). */
export function loungePool(campaign: Campaign): number {
  return suppliedOccupants(campaign).reduce(
    (total, occupant) =>
      total +
      working(occupant).reduce((made, entry) => {
        const recovery = entry.effects.madnessRecovery;
        if (recovery === undefined) return made;

        return made + (occupant.power ? recovery.withPower : recovery.base);
      }, 0),
    0,
  );
}

/** Whether the base has a Lounge that works this turn. */
export function hasLounge(campaign: Campaign): boolean {
  return loungePool(campaign) > 0;
}

/** Whoever was assigned to Madness Recovery in the last Planning Phase. */
export function recoveringFromMadness(campaign: Campaign): readonly Survivor[] {
  return survivorsDoing(
    beforePlanning(campaign),
    (assignment) => assignment.task === 'madness-recovery',
  );
}

/**
 * This turn's Madness Recovery: the Lounges' points shared equally among
 * everybody assigned, one at a time in roster order, never more than a
 * survivor carries (R110).
 */
export function madnessAwards(campaign: Campaign): readonly MadnessAward[] {
  const filling = recoveringFromMadness(campaign).map((survivor) => ({ survivor, madness: 0 }));
  let left = loungePool(campaign);

  while (left > 0 && filling.some((each) => each.madness < each.survivor.madness)) {
    for (const each of filling) {
      if (left === 0) break;
      if (each.madness === each.survivor.madness) continue;

      each.madness += 1;
      left -= 1;
    }
  }

  return filling.filter((each) => each.madness > 0);
}

/** Whether this turn's Madness Recovery has been handed out. */
export function madnessRecovered(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'madness-recovered',
  );
}

/** The campaign with each award's Madness taken off. Assumes `madnessAwards` made them. */
export function withMadnessTaken(campaign: Campaign, awards: readonly MadnessAward[]): Campaign {
  return {
    ...campaign,
    survivors: campaign.survivors.map((survivor) => {
      const award = awards.find((one) => one.survivor.id === survivor.id);

      return award === undefined
        ? survivor
        : { ...survivor, madness: survivor.madness - award.madness };
    }),
  };
}
