/**
 * Turning a log entry into a line someone can read.
 *
 * Presentation only, like `baseLabels.ts` and `skillLabels.ts` — and the reason
 * `CampaignEvent` holds fields rather than a sentence. The entry says a
 * survivor was promoted and to which Tier; whether that reads as "Promoted to
 * Leader" or as a row in an exported markdown table is a question about a
 * screen, and screens are not the engine's business.
 *
 * **This is the file Phase 8's markdown export becomes a second reader
 * alongside**, rather than a second format to keep in sync with this one.
 *
 * A `switch` rather than a `Record` of formatters, because each kind reads
 * different fields off the event and only a switch narrows the union to the
 * member that has them. The `never` at the end is what makes an event added to
 * `log.ts` a compile error here instead of a blank line in someone's history.
 */

import type { CampaignEvent, LogEntry } from '../engine/log';
import { BASE_LABELS, FACILITY_LABELS, UPGRADE_LABELS, slotLabel } from './baseLabels';
import { PHASE_LABELS } from './turnLabels';
import { COMMON_SKILL_LABELS, SKILL_LABELS } from './skillLabels';
import { TIER_LABELS } from './tierLabels';

export interface EventLabel {
  /** One line, in the past tense. No rule text — see the copyright posture. */
  readonly text: string;

  /**
   * The page the rule behind this entry is on, where there is one.
   *
   * Optional because most entries are the player's own decisions rather than
   * consequences, and citing a page for "claimed the Hobby Farm" would be
   * pointing at a rule nobody is questioning. The events that *will* want one
   * are the Management Phase's — a survivor who leaves because Unrest hit ten
   * is exactly the entry someone reads twice — and those arrive in Z3-10.
   */
  readonly pages?: number | string;
}

export function describeEvent(event: CampaignEvent): EventLabel {
  switch (event.kind) {
    case 'campaign-started':
      return { text: `Started the campaign “${event.name}”.` };

    case 'phase-entered':
      // Deliberately says nothing about *which* phase: the entry it came from
      // carries that, and the log screen already groups by it.
      return { text: 'Moved to this phase.', pages: 17 };

    case 'turn-began':
      return { text: 'The turn began.', pages: 17 };

    case 'starting-community-settled':
      return {
        text: event.built
          ? 'Finished building the starting community.'
          : 'Re-opened the starting community for changes.',
        pages: 13,
      };

    case 'planning-began':
      return { text: 'Started planning: last turn’s tasks and utilities cleared.', pages: 20 };

    case 'survivor-added':
      return { text: `${event.name} joined, as a ${TIER_LABELS[event.tier]}.` };

    case 'survivor-recruited':
      return {
        text: `${event.name} was recruited as a ${TIER_LABELS[event.tier]}, rolling a ${event.roll}.`,
        pages: 15,
      };

    case 'survivor-left':
      return { text: `${event.name}, a ${TIER_LABELS[event.tier]}, left the community.` };

    case 'survivor-promoted':
      return { text: `${event.name} was promoted to ${TIER_LABELS[event.tier]}.`, pages: 18 };

    case 'skill-level-bought':
      return {
        text: `${event.name} raised ${SKILL_LABELS[event.skill]} to level ${event.level}.`,
        pages: 18,
      };

    case 'common-skill-bought':
      return {
        text: `${event.name} raised ${COMMON_SKILL_LABELS[event.skill]} to ${event.score}.`,
        pages: 18,
      };

    case 'base-claimed':
      return { text: `Claimed the ${BASE_LABELS[event.base]} as a base.` };

    case 'facility-built':
      return {
        text: `Built a ${FACILITY_LABELS[event.facility]} in the ${slotLabel(event.slot)}.`,
      };

    case 'upgrade-built':
      return {
        text: `Added ${UPGRADE_LABELS[event.upgrade]} to the ${slotLabel(event.slot)}.`,
      };

    case 'slot-cleared':
      return { text: `Cleared the ${slotLabel(event.slot)}.` };
  }
}

/**
 * When an entry happened, in the campaign's own clock.
 *
 * The turn and the phase, not the timestamp: a player reading their history
 * wants "turn 3, Planning". The wall-clock time is on the entry for an export
 * to a play journal, where the evening it was played is the useful part.
 */
export function describeWhen(entry: LogEntry): string {
  return `Turn ${entry.turn}, ${PHASE_LABELS[entry.phase]}`;
}
