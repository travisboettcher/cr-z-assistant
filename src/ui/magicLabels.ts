/**
 * What a Magic mission's outcome says, in the app's words (pp. 112–114; R123,
 * R124, R153; Z7-9): its ending after the colon, and what it did.
 */

import type { MagicMissionId } from '../data/missions';
import type { MagicRecord } from '../engine/log';

/** The ending, as it reads after the mission's name. */
export function magicCounted(mission: MagicMissionId, record: MagicRecord): string {
  const done = record.completed === true ? 'completed' : 'not completed';

  return mission === 'the-necromancer'
    ? `${done}, the Necromancer ${record.killed === true ? 'killed' : 'not killed'}`
    : done;
}

/** What the outcome did to the campaign. */
export function magicConsequences(mission: MagicMissionId, record: MagicRecord): readonly string[] {
  switch (mission) {
    case 'the-graveyard':
      return record.completed === true ? ['The Mystic Library is unlocked.'] : [];
    case 'the-necromancer':
      return [
        ...(record.completed === true ? ['The next spell learned costs 3 XP less.'] : []),
        ...(record.killed === true
          ? ['A Mystic Library and every upgrade to it cost 1 Labor less from now on.']
          : []),
      ];
    case 'the-dark':
      return [];
  }
}
