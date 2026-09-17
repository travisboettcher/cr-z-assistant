/**
 * Building a facility into a slot — what it costs, what is wrong with it, and
 * the build itself.
 *
 * The rules half of Z2-5. Everything here is a pure function over a `Campaign`;
 * the screen renders what these return and dispatches, and holds no rule of its
 * own. See `docs/base-slot-interaction.md` for the shape the screen puts around
 * them.
 *
 * Blockers and warnings mean what `checks.ts` says they mean. Here a blocker is
 * a taken slot, uncleared rubble, or a cost the community cannot pay; a warning
 * is a facility in the wrong kind of slot, or one gated behind an origin or a
 * mission the player may wave through.
 */

import { FACILITIES, type Facility, type FacilityId } from '../data/facilities';
import type { Campaign } from './campaign';
import { layoutOf, occupants } from './base';
import { laborRefusal, queuedKindFor } from './projects';
import type { Check, Violation } from './checks';

/**
 * Why a build is refused or questioned.
 *
 * Its own closed set of codes, over the shared shape in `checks.ts`: sharing an
 * open union across the verbs would let an upgrade violation be returned from a
 * build check, which the typecheck should be catching rather than permitting.
 */
export type BuildViolationCode =
  | 'no-base'
  | 'no-such-slot'
  | 'slot-occupied'
  | 'facility-on-order'
  | 'slot-not-cleared'
  | 'not-enough-hardware'
  | 'not-enough-labor'
  | 'wrong-slot-kind'
  | 'origin-locked'
  | 'mission-locked';

export type BuildViolation = Violation<BuildViolationCode>;

export type BuildCheck = Check<BuildViolationCode>;

/**
 * What a build needs, beyond a campaign: where, and what.
 *
 * No Labor. It was a hand-entered field here until Z3-5, because the pool comes
 * from the project team (pg. 20) and nothing on `Campaign` recorded one. It
 * does now, so the cost is checked against a number the campaign already knows.
 */
export interface BuildRequest {
  readonly slot: string;
  readonly facility: FacilityId;
}

/** Everything wrong with this build, or two empty lists. */
export function checkBuild(campaign: Campaign, request: BuildRequest): BuildCheck {
  const blockers: BuildViolation[] = [];
  const warnings: BuildViolation[] = [];

  const base = campaign.base;

  if (base === null) {
    return {
      blockers: [
        {
          code: 'no-base',
          message: 'This community has no base to build in yet.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  const slot = layoutOf(base).find((candidate) => candidate.id === request.slot);

  if (slot === undefined) {
    return {
      blockers: [
        {
          code: 'no-such-slot',
          message: 'This base has no such Facility Slot.',
          pages: 54,
        },
      ],
      warnings: [],
    };
  }

  const facility = FACILITIES[request.facility] as Facility;
  const state = base.slots[request.slot];

  if (occupants(base).some((occupant) => occupant.slotId === request.slot)) {
    blockers.push({
      code: 'slot-occupied',
      message: 'Something is already built in this slot, and a built facility is permanent.',
      pages: 54,
    });
  }

  // A blocker rather than a warning, and the only one of #140's four that had
  // to be: two facilities ordered into one slot both spend their Hardware,
  // `completeProjects` drops whichever loses the race, and nothing refunds it
  // or writes it down. A rule a table may play past does not destroy materials.
  if (queuedKindFor(campaign, request.slot, 'facility')) {
    blockers.push({
      code: 'facility-on-order',
      message: 'A facility is already on order for this slot, and only one of them could be built.',
      pages: 20,
    });
  }

  // A clearing project has to be finished before the slot is a slot. Checked
  // against the save rather than the layout, because clearing is what changes.
  if (slot.state === 'clearing-project' && state?.cleared !== true) {
    blockers.push({
      code: 'slot-not-cleared',
      message: `This slot is blocked until a ${String(slot.labor)} Labor project clears it.`,
      pages: 54,
    });
  }

  if (campaign.materials.hardware < facility.cost.hardware) {
    blockers.push({
      code: 'not-enough-hardware',
      message: `Costs ${String(facility.cost.hardware)} Hardware and the community has ${String(campaign.materials.hardware)}.`,
      pages: '72–73',
    });
  }

  const labor = laborRefusal(campaign, facility.cost.labor, '72–73');
  if (labor !== undefined) blockers.push(labor);

  if (facility.requires?.slot !== undefined && facility.requires.slot !== slot.kind) {
    warnings.push({
      code: 'wrong-slot-kind',
      message: `Needs an ${facility.requires.slot} slot, and this one is ${slot.kind}.`,
      pages: '72–73',
    });
  }

  if (facility.requires?.origin !== undefined && facility.requires.origin !== campaign.origin) {
    warnings.push({
      code: 'origin-locked',
      message: 'Belongs to an apocalypse origin this campaign is not running.',
      pages: '122–133',
    });
  }

  if (facility.requires?.mission === true) {
    // Which mission unlocks it is Phase 4's, so this app cannot yet know
    // whether the player has earned it. Reported as something they may wave
    // through rather than as a refusal, because the app is the one missing
    // information here, not the player.
    warnings.push({
      code: 'mission-locked',
      message: 'Unlocked by a mission, which this version does not track yet.',
      pages: '72–73',
    });
  }

  return { blockers, warnings };
}

/**
 * The facilities worth offering in this campaign, in catalogue order.
 *
 * Origin-gated facilities are filtered out rather than listed and warned about:
 * a campaign not running Magic has no use for the Mystic Library, and an
 * override exists for the app modelling a rule wrong, not for browsing rules
 * from a different game. `checkBuild` still reports the gate, so a save that
 * arrived with one is described rather than silently accepted.
 */
export function buildableFacilities(campaign: Campaign): readonly Facility[] {
  return Object.values(FACILITIES).filter(
    (facility) =>
      (facility as Facility).requires?.origin === undefined ||
      (facility as Facility).requires?.origin === campaign.origin,
  ) as readonly Facility[];
}
