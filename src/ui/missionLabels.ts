/**
 * How a Siege Defense's or a Thin the Herd's outcome reads (pp. 81, 86).
 *
 * One phrasing for two readers — the history and the Mission Phase's own
 * record of what it just wrote — so the line the player sees when they record
 * an outcome is the line their log keeps. No rule text: what the outcome does
 * is said in this app's words, with the page beside it.
 */

import { MISSIONS } from '../data/missions';
import {
  baseOverrun,
  siegeCounterChange,
  type MissionOutcome,
  type SiegeCounterChange,
} from '../engine/siege';

/** The whole mission's pages, from the catalogue (Z4-1). */
export const MISSION_PAGES: Record<MissionOutcome['kind'], number | string> = {
  'siege-defense-resolved': MISSIONS['siege-defense'].pages,
  'thin-the-herd-resolved': MISSIONS['thin-the-herd'].pages,
};

const COUNTER_PHRASES: Record<SiegeCounterChange, string> = {
  reset: 'The turns since the last siege go back to 0.',
  halved: 'The turns since the last siege are halved, rounding down.',
  none: 'The turns since the last siege keep counting.',
};

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** What was counted at the end, in a sentence. */
function counted(outcome: MissionOutcome): string {
  const left =
    outcome.kind === 'thin-the-herd-resolved'
      ? `${String(outcome.zombiesLeft)} of ${plural(outcome.startingZombies, 'zombie', 'zombies')} left`
      : `${plural(outcome.zombiesLeft, 'zombie', 'zombies')} left`;

  return `${left}, ${plural(outcome.survivorsExited, 'survivor', 'survivors')} out over the map edge`;
}

/** What the outcome does to the campaign, in this app's words. */
export function outcomeConsequences(outcome: MissionOutcome): readonly string[] {
  const consequences = [COUNTER_PHRASES[siegeCounterChange(outcome)]];

  if (baseOverrun(outcome)) {
    consequences.push(
      'The base is overrun: rebuild through Claim a New Base, restart through Start a New Community, or abandon the survivors — this app does not run any of the three yet.',
    );
  }

  if (outcome.kind === 'thin-the-herd-resolved' && outcome.allIncapacitated) {
    consequences.push(
      'Every survivor went down, so the next roll against the horde succeeds on its own.',
    );
  }

  return consequences;
}

export function describeOutcome(outcome: MissionOutcome): string {
  const mission = outcome.kind === 'siege-defense-resolved' ? 'Siege Defense' : 'Thin the Herd';

  return [`${mission}: ${counted(outcome)}.`, ...outcomeConsequences(outcome)].join(' ');
}
