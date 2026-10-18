/**
 * How the Viral missions end, and what they leave behind (pp. 103–107; R104,
 * R122, R131, R132, R144–R146; Z7-6).
 *
 * Each is a `mission-played` entry carrying a `ViralRecord`: Experimental Data
 * the points of interest investigated and whether the Broken Cage check
 * passed, Bring It On Home how many ensnared zombies left the area, Medical
 * Salvage its Medical Supply tokens. The form sends the counts and the record
 * is rebuilt from them before it is logged (`viralRecord`), so the history
 * says what the rules gave whatever the screen sent.
 *
 * What they leave is read in two ways. Containment's unlock is read off the
 * log, as the campaign's own (R122). The held zombie and the tokens are counts
 * on the campaign (`heldZombies`, `medicalSupplies`), added to when the
 * outcome is recorded, because a move, an overrun and a build take them away
 * again.
 *
 * Reads no mission module, for the reason `storyMissions.ts` gives.
 *
 * Pure, like the rest of `src/engine`.
 */

import { FACILITIES, type Effects, type Facility } from '../data/facilities';
import type { MissionId, ViralMissionId } from '../data/missions';
import type { Campaign } from './campaign';
import type { ViralRecord } from './log';
import { suppliedOccupants } from './utilities';

/** What each Viral mission's outcome asks the table for. */
const ASKS = {
  'experimental-data': ['investigated', 'brokenCage'],
  'bring-it-on-home': ['zombiesLeft'],
  'medical-salvage': ['supplies'],
} as const satisfies Record<ViralMissionId, readonly (keyof ViralRecord)[]>;

/** Whether a mission is one of the Viral origin's three (pp. 103–107). */
export function isViralMission(mission: MissionId): mission is ViralMissionId {
  return mission in ASKS;
}

/** What this Viral mission's outcome asks the table for. */
export function viralAsks(mission: ViralMissionId): readonly (keyof ViralRecord)[] {
  return ASKS[mission];
}

/** Whether a Containment stands on the base: built, not on order (pg. 69). */
export function containmentStands(campaign: Campaign): boolean {
  return suppliedOccupants(campaign).some((occupant) =>
    occupant.upgrades.some((upgrade) => upgrade.id === 'containment'),
  );
}

/** Whether a count is a whole number from 0. */
const isCount = (value: number | undefined): boolean =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/**
 * Why this Viral mission's record cannot be recorded, or `null` if it can:
 * every count it asks for a whole number from 0, the Broken Cage check said
 * either way, and nothing it does not ask for. Any other mission records none.
 */
export function viralProblem(mission: MissionId, record: ViralRecord | undefined): string | null {
  if (!isViralMission(mission)) {
    return record === undefined ? null : 'Only a Viral mission records what it ended with.';
  }
  if (record === undefined) return 'Enter what the mission ended with.';

  const asked: readonly (keyof ViralRecord)[] = ASKS[mission];
  const extra = (Object.keys(record) as (keyof ViralRecord)[]).filter(
    (field) => field !== 'held' && !asked.includes(field),
  );
  if (extra.length > 0) return 'That isn’t something this mission ends with.';

  if (asked.includes('brokenCage') && record.brokenCage === undefined) {
    return 'Say whether the Broken Cage check passed.';
  }

  const counts = asked.filter((field) => field !== 'brokenCage') as readonly (
    'investigated' | 'zombiesLeft' | 'supplies'
  )[];

  return counts.every((field) => isCount(record[field]))
    ? null
    : 'Each count must be a whole number, 0 or more.';
}

/**
 * The record as the rules have it, from what the table counted: only the
 * fields the mission asks for, and for Bring It On Home whether its zombie was
 * held, which needs one to have left and a Containment standing (R104, R146).
 * Assumes `viralProblem` passed.
 */
export function viralRecord(
  campaign: Campaign,
  mission: ViralMissionId,
  record: ViralRecord,
): ViralRecord {
  switch (mission) {
    case 'experimental-data':
      return {
        investigated: record.investigated as number,
        brokenCage: record.brokenCage as boolean,
      };
    case 'bring-it-on-home': {
      const left = record.zombiesLeft as number;

      return { zombiesLeft: left, held: left > 0 && containmentStands(campaign) };
    }
    case 'medical-salvage':
      return { supplies: record.supplies as number };
  }
}

/** The campaign with what a Viral record gives: a held zombie, or Medical Supply tokens. */
export function withViralRecorded(campaign: Campaign, record: ViralRecord): Campaign {
  return {
    ...campaign,
    heldZombies: campaign.heldZombies + (record.held === true ? 1 : 0),
    medicalSupplies: campaign.medicalSupplies + (record.supplies ?? 0),
  };
}

/**
 * The Hardware Containment costs more, or less when negative, after this
 * Experimental Data (pp. 104, 116; R122, R144): +2 for only one point of
 * interest investigated, −2 for a passed Broken Cage check, and the two add
 * up. `null` for one that investigated none, which unlocks nothing.
 */
export function containmentHardware(record: ViralRecord): number | null {
  const investigated = record.investigated ?? 0;
  if (investigated === 0) return null;

  return (investigated === 1 ? 2 : 0) - (record.brokenCage === true ? 2 : 0);
}

/**
 * Containment's unlock, or `null` while it is locked (R122): the Hardware
 * change of the first Experimental Data that investigated a point of
 * interest. The first is the one, since it is not offered again (R132).
 */
export function containmentUnlock(campaign: Campaign): { readonly hardware: number } | null {
  for (const { event } of campaign.log) {
    if (event.kind !== 'mission-played' || event.mission !== 'experimental-data') continue;

    const hardware = event.viral === undefined ? null : containmentHardware(event.viral);
    if (hardware !== null) return { hardware };
  }

  return null;
}

/**
 * What each held zombie does (pp. 69, 72; R103): the Siege Threat it adds a
 * turn, and the Infection it takes from each survivor being healed. Read off
 * the Medical Clinic's Containment, so the catalogue stays the one copy.
 */
export const PER_HELD_ZOMBIE = (FACILITIES['medical-clinic'] as Facility).upgrades.find(
  (upgrade) => upgrade.id === 'containment',
)?.effects.perHeldZombie as NonNullable<Effects['perHeldZombie']>;
