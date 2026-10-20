/**
 * What the Magic missions leave behind (pp. 112–115; R123, R124, R152, R153;
 * Z7-9).
 *
 * Each is a `mission-played` entry carrying a `MagicRecord`: The Graveyard
 * whether it was completed, which unlocks the Mystic Library for the campaign
 * (R123); The Necromancer whether it was won, which takes 3 XP off the next
 * spell, and whether he was killed, which takes 1 Labor off a Mystic Library
 * and every upgrade to it for good (R124, R153). The Dark records only that it
 * was played (R152). Each member's Humanity, The Graveyard's choice included
 * (R130), is the outcome's wounds.
 *
 * Read off the log, as Containment's unlock is: these are the campaign's.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { MagicMissionId, MissionId } from '../data/missions';
import type { Campaign } from './campaign';
import type { CampaignEvent, MagicRecord } from './log';

/** What each Magic mission's outcome asks the table. */
const ASKS = {
  'the-graveyard': ['completed'],
  'the-necromancer': ['completed', 'killed'],
  'the-dark': [],
} as const satisfies Record<MagicMissionId, readonly (keyof MagicRecord)[]>;

/** Whether a mission is one of the Magic origin's three (pp. 112–115). */
export function isMagicMission(mission: MissionId): mission is MagicMissionId {
  return mission in ASKS;
}

/** What this Magic mission's outcome asks the table. */
export function magicAsks(mission: MagicMissionId): readonly (keyof MagicRecord)[] {
  return ASKS[mission];
}

/**
 * Why this Magic record cannot be recorded, or `null`: each thing the mission
 * asks said yes or no, and nothing it does not ask. Any other mission, The Dark
 * included, records none.
 */
export function magicProblem(mission: MissionId, record: MagicRecord | undefined): string | null {
  const asked: readonly (keyof MagicRecord)[] = isMagicMission(mission) ? ASKS[mission] : [];

  if (asked.length === 0) {
    return record === undefined
      ? null
      : 'This mission records nothing more than that it was played.';
  }
  if (record === undefined) return 'Say how the mission ended.';

  const fields = Object.keys(record) as (keyof MagicRecord)[];
  if (fields.some((field) => !asked.includes(field))) {
    return 'That isn’t something this mission ends with.';
  }

  return asked.every((field) => typeof record[field] === 'boolean')
    ? null
    : 'Say how the mission ended.';
}

/** Whether a logged outcome was this Magic mission with this answer yes. */
function said(event: CampaignEvent, mission: MagicMissionId, field: keyof MagicRecord): boolean {
  return (
    event.kind === 'mission-played' && event.mission === mission && event.magic?.[field] === true
  );
}

/** Whether The Graveyard has been completed, which unlocks the Mystic Library (R123). */
export function mysticLibraryUnlocked(campaign: Campaign): boolean {
  return campaign.log.some(({ event }) => said(event, 'the-graveyard', 'completed'));
}

/** Whether the Necromancer has been killed: a Mystic Library and its upgrades cost 1 Labor less (R124). */
export function necromancerKilled(campaign: Campaign): boolean {
  return campaign.log.some(({ event }) => said(event, 'the-necromancer', 'killed'));
}

/** How many Necromancer wins have given the next spell its 3 XP off (R124, R153). */
export function necromancerWins(campaign: Campaign): number {
  return campaign.log.filter(({ event }) => said(event, 'the-necromancer', 'completed')).length;
}
