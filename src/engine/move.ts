/**
 * Moving into the base a claim won (pp. 19, 54, 79; #182, Z4-8).
 *
 * At the end of the Advancement Phase of the turn the claim was won (R25):
 * everything the last Planning Phase assigned settles against the old base
 * first — its staff, its Clinic, its Training Room and its projects — and the
 * projects are left behind in it. So the move waits for the projects.
 *
 * What moves is the people and the stores. The new base starts with its own
 * built-ins and empty slots (R26); its stores are the old ones, uncapped until
 * Check Storage spoils what does not fit (pp. 19, 23, 54) — but for a move
 * after an overrun, which keeps half of them, none, or a first base's stock
 * (`storesAfterMove`; R29, R30). A first base's
 * stocking (`submitBaseClaim`) is not repeated: a later base has only what was
 * carried. One Hero of the player's choice leaves for every Hero the new base
 * cannot hold (pg. 54; R32), and is set aside rather than lost (R31).
 *
 * Pure, like the rest of `src/engine`.
 */

import { MATERIALS, type Materials } from '../data/materials';
import { withoutAssignment } from './assignments';
import { storageCaps } from './base';
import type { Campaign } from './campaign';
import { baseMoved, claimedBase, heroesOverCap } from './claim';
import { overrunChoice, reclaimedOnSameMap } from './overrun';
import { dueProjects } from './projects';
import { phaseOf } from './turn';
import { suppliedOccupants } from './utilities';

/**
 * Why the community cannot move now, sending these Heroes away, or `null` if
 * it can.
 *
 * In the Advancement Phase, once, after a claim won this turn, with last turn's
 * projects finished (R25); and with exactly as many Heroes leaving as the new
 * base cannot hold, each a different Hero in the community (pg. 54; R32).
 */
export function moveProblem(campaign: Campaign, leaving: readonly string[]): string | null {
  if (phaseOf(campaign.step) !== 'advancement') {
    return 'The community moves in at the end of the Advancement Phase (R25).';
  }

  const base = claimedBase(campaign);
  if (base === null) return 'Only a Claim a New Base won this turn moves the community.';
  if (campaign.base === null) return 'A community with no base has nothing to move out of.';
  if (baseMoved(campaign)) return 'The community has already moved this turn.';

  if (dueProjects(campaign).length > 0) {
    return 'Finish last turn’s projects first: they are built into the old base (R25).';
  }

  const over = heroesOverCap(campaign, base);
  if (new Set(leaving).size !== leaving.length) return 'Each Hero leaves once.';
  if (
    !leaving.every((id) =>
      campaign.survivors.some((survivor) => survivor.id === id && survivor.tier === 4),
    )
  ) {
    return 'Only a Hero in the community leaves over the cap.';
  }
  if (leaving.length !== over) {
    if (over === 0) return 'The new base holds every Hero, so nobody leaves.';

    return over === 1
      ? 'The new base holds one Hero fewer than the community has: choose the Hero who leaves.'
      : `The new base holds ${String(over)} Heroes fewer than the community has: choose the ${String(over)} Heroes who leave.`;
  }

  return null;
}

/**
 * The campaign moved into the base this turn's claim won, with these Heroes
 * set aside (R25, R26, R31, R32). Unguarded: `moveProblem` is the guard.
 *
 * The new base's slots are empty, so what was built, staffed and powered stays
 * in the old one. The stores are untouched (pg. 54). A Hero set aside leaves
 * the roster whole, keeping their sheet for the day they come back (R31), and
 * takes their task with them, as anybody leaving does.
 */
export function withBaseMoved(campaign: Campaign, leaving: readonly string[]): Campaign {
  const base = claimedBase(campaign);
  if (base === null) return campaign;

  const gone = new Set(leaving);

  return {
    ...campaign,
    base: { id: base, slots: {} },
    survivors: campaign.survivors.filter((survivor) => !gone.has(survivor.id)),
    setAside: [
      ...campaign.setAside,
      ...campaign.survivors.filter((survivor) => gone.has(survivor.id)),
    ],
    assignments: leaving.reduce(withoutAssignment, campaign.assignments),
    materials: storesAfterMove(campaign) ?? campaign.materials,
  };
}

/**
 * What the stores hold once the community moves after an overrun, or `null`
 * for a move whose stores come along as they are (pg. 54).
 *
 * - **Claiming the overrun base's own type, on its own map:** half of every
 *   material, rounded down (pg. 86; R29).
 * - **Any other claim after an overrun:** nothing (R29).
 * - **Starting over:** the old stores are lost, and the new base arrives
 *   stocked to its caps as a first base does (R30). Rare has no cap (pg. 54),
 *   so it starts at none.
 *
 * Every material alike, Rare included: the app keeps Rare in the same stores
 * as the other three, and the overrun's recovery is of the stores.
 */
export function storesAfterMove(campaign: Campaign): Materials | null {
  // A way on is only ever chosen after an overrun, so a choice is the overrun.
  const option = overrunChoice(campaign);
  const to = claimedBase(campaign);
  if (option === null || to === null) return null;

  if (option === 'start-over') {
    const stocked = { ...campaign, base: { id: to, slots: {} } };

    return { rare: 0, ...storageCaps(stocked.base, suppliedOccupants(stocked)) };
  }

  // The outcome says "same map" only of a claim of the overrun base's own type:
  // `missionOutcomeProblem` refuses it on any other.
  const recovered = reclaimedOnSameMap(campaign);

  return Object.fromEntries(
    MATERIALS.map((material) => [
      material,
      recovered ? Math.floor(campaign.materials[material] / 2) : 0,
    ]),
  ) as Materials;
}
