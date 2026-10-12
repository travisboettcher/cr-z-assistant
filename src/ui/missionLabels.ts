/**
 * How a Siege Defense's or a Thin the Herd's outcome reads (pp. 81, 86).
 *
 * One phrasing for two readers — the history and the Mission Phase's own
 * record of what it just wrote — so the line the player sees when they record
 * an outcome is the line their log keeps. No rule text: what the outcome does
 * is said in this app's words, with the page beside it.
 */

import type { Material } from '../data/materials';
import { MISSIONS, type MissionId } from '../data/missions';
import { MATERIAL_LABELS } from './baseLabels';
import {
  baseOverrun,
  siegeCounterChange,
  type MissionOutcome,
  type SiegeCounterChange,
} from '../engine/siege';

/**
 * What each mission is called on a screen — the book's own titles, which the
 * catalogue leaves to the UI as the base roster does (Z4-1).
 */
export const MISSION_LABELS: Record<MissionId, string> = {
  'first-mission': 'the First Mission',
  'claim-a-new-base': 'Claim a New Base',
  'gather-materials': 'Gather Materials',
  'thin-the-herd': 'Thin the Herd',
  'retrieve-new-vehicles': 'Retrieve New Vehicles',
  'rescue-strangers': 'Rescue Strangers',
  'rare-goods-trader': 'Rare Goods Trader',
  'siege-defense': 'the Siege Defense',
  'left-behind-1': 'Left Behind (Part 1)',
  'left-behind-2a': 'Left Behind (Part 2A)',
  'left-behind-2b': 'Left Behind (Part 2B)',
  'preppers-stash-1': 'Prepper’s Stash (Part 1)',
  'preppers-stash-2': 'Prepper’s Stash (Part 2)',
  'sentimental-value': 'Sentimental Value',
  'neighbors-rifle': 'Neighbor’s Rifle',
  'crashed-convoy': 'Crashed Convoy',
  warehouse: 'Warehouse',
  'experimental-data': 'Experimental Data',
  'bring-it-on-home': 'Bring It On Home',
  'medical-salvage': 'Medical Salvage',
  'invisible-light': 'Invisible Light',
  'from-the-deep': 'From the Deep',
  'friend-or-foe': 'Friend or Foe',
  'the-graveyard': 'The Graveyard',
  'the-necromancer': 'The Necromancer',
  'the-dark': 'The Dark',
  'ford-the-river': 'Ford the River',
  breakdown: 'Breakdown',
  chased: 'Chased',
};

/** A team's choice in a sentence, for the history and the Select Mission step. */
export function describeSelection(selection: {
  readonly team: number;
  readonly mission: MissionId;
  readonly names: readonly string[];
  readonly material?: Material;
}): string {
  const remainder =
    selection.material === undefined
      ? ''
      : `, taking the rest in ${MATERIAL_LABELS[selection.material]}`;
  const who = selection.names.length === 0 ? '' : `: ${selection.names.join(', ')}`;

  return `Mission team ${String(selection.team)} chose ${MISSION_LABELS[selection.mission]}${remainder}${who}.`;
}

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
