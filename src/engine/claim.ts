/**
 * What this turn's Claim a New Base won (pp. 54, 78–79; #182, Z4-7, Z4-8).
 *
 * Read straight off the log rather than through `missions.ts`, and that is
 * load-bearing: the Unrest lock (pg. 79) is a question `feeding.ts` asks, and
 * `missions.ts` sits above `siege.ts`, which already reads `feeding.ts`. A
 * module here that imported the mission readers would close that loop. What
 * this reads is narrow enough not to need them: a claim's outcome cannot be
 * chosen again once it is recorded — only a failed First Mission can (R21) —
 * so the turn's claim outcome and the selection before it are the whole story.
 *
 * Pure, like the rest of `src/engine`.
 */

import { BASES, maxHeroes, type BaseId } from '../data/bases';
import type { Campaign } from './campaign';

/**
 * Whether this turn's Claim a New Base met an end condition (pg. 79).
 *
 * Conditions 1 to 3 all win; no condition met leaves the community where it is.
 * True for a claim chosen before Z4-7 too, which named no base: the claim was
 * still won, and the Unrest lock reads only that.
 */
export function claimWon(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'claim-a-new-base-resolved' &&
      entry.event.endCondition !== null,
  );
}

/**
 * The base this turn's Claim a New Base won, or `null` (pg. 79; Z4-8) — or the
 * base a community starting over after an overrun won through the First
 * Mission (pg. 86; R30, Z4-9).
 *
 * The base the team named at Select Mission (Z4-7), read from its latest
 * selection before the outcome. `null` when nothing was claimed, when the
 * mission met no end condition, and when it named no base: a Claim chosen
 * before Z4-7, and a campaign's own turn-1 First Mission, whose base is
 * claimed on the base sheet instead — there is then nothing to move into.
 */
export function claimedBase(campaign: Campaign): BaseId | null {
  let named = new Map<number, BaseId | undefined>();
  let won: BaseId | undefined;

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'mission-selected') {
      named.set(event.team, event.base);
    } else if (event.kind === 'mission-skipped') {
      named = new Map();
    } else if (
      (event.kind === 'claim-a-new-base-resolved' || event.kind === 'first-mission-resolved') &&
      event.endCondition !== null
    ) {
      won = named.get(event.team);
    }
  }

  return won ?? null;
}

/** Whether the community has already moved this turn (Z4-8). */
export function baseMoved(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'base-moved',
  );
}

/** Whether a claim won this turn still has a community to move into it (R25). */
export function moveOwed(campaign: Campaign): boolean {
  return claimedBase(campaign) !== null && !baseMoved(campaign);
}

/** How many Heroes the community has (pg. 54). */
function heroes(campaign: Campaign): number {
  return campaign.survivors.filter((survivor) => survivor.tier === 4).length;
}

/**
 * How many Heroes moving into this base sends away: one for every Hero over
 * the base's Tier (pg. 54; R32).
 */
export function heroesOverCap(campaign: Campaign, base: BaseId): number {
  return Math.max(0, heroes(campaign) - maxHeroes(BASES[base].tier));
}

/**
 * A warning when the base a claim is aiming at holds fewer Heroes than the
 * community has, or `null` (pg. 54).
 *
 * A base's Tier is how many Heroes it holds, and moving into one with too few
 * sends one Hero of the player's choice away for each one over (R32) when the
 * community moves in (R25, R31). A warning rather than a refusal, because the
 * book lets a community claim any base (pg. 78) and does not warn either: the
 * table may want the smaller base and pay for it.
 */
export function claimWarning(campaign: Campaign, base: BaseId): string | null {
  const over = heroesOverCap(campaign, base);
  if (over === 0) return null;

  const cap = maxHeroes(BASES[base].tier);
  const holds = cap === 1 ? '1 Hero' : `${String(cap)} Heroes`;
  const away = over === 1 ? 'a Hero' : `${String(over)} Heroes`;

  return `This base holds ${holds} and the community has ${String(heroes(campaign))}: moving in sends ${away} of your choice away.`;
}
