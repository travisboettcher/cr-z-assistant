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

import { MATERIALS, type Material } from '../data/materials';
import { XP_SOURCE_PAGES, type HealthSource, type XpSource } from '../data/turn';
import type { CampaignEvent, LogEntry } from '../engine/log';
import {
  BASE_LABELS,
  FACILITY_LABELS,
  builtThingLabel,
  MATERIAL_LABELS,
  UPGRADE_LABELS,
  slotLabel,
} from './baseLabels';
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

/**
 * How each XP source reads in a sentence.
 *
 * The phrase is the screen's; the page beside it is the rule's and comes from
 * `src/data/turn.ts`, because a second copy here would be a page number in two
 * places waiting to disagree.
 */
const HEALTH_SOURCE_PHRASES: Record<HealthSource, string> = {
  facility: 'from the community’s Health',
  rest: 'by resting',
};

const XP_SOURCE_PHRASES: Record<XpSource, string> = {
  mission: 'for going on the mission',
  discretionary: 'as the turn’s discretionary point',
  'mission-teaching': 'from a Teacher on the mission',
  'training-room': 'in the Training Room',
};

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

    case 'materials-added': {
      // Only what moved. A turn that recovered three Food and nothing else
      // should not read as "3 Food, 0 Fuel, 0 Hardware, 0 Rare".
      const moved = MATERIALS.filter((material) => event[material] !== 0).map(
        (material) => `${event[material]} ${MATERIAL_LABELS[material]}`,
      );

      return {
        text:
          moved.length === 0
            ? 'Added nothing to storage this turn.'
            : `Added to storage: ${moved.join(', ')}.`,
        pages: '18–19',
      };
    }

    case 'materials-converted': {
      const of = (amounts: Partial<Record<Material, number>>) =>
        MATERIALS.filter((material) => (amounts[material] ?? 0) !== 0)
          .map((material) => `${String(amounts[material])} ${MATERIAL_LABELS[material]}`)
          .join(', ');

      return {
        // Named by the thing that did it, because a base can hold two of them
        // and the history is where a player checks a per-turn allowance.
        text: `The ${builtThingLabel(event.source)} traded ${of(event.spent)} for ${of(event.gained)}.`,
        pages: 19,
      };
    }

    case 'survivors-fed':
      return {
        text:
          event.hunger === 0
            ? `The community ate its ${String(event.required)} Food.`
            : `The community ate, ${String(event.hunger)} Food short of the ${String(event.required)} it needed.`,
        pages: 22,
      };

    case 'rot-checked':
      return {
        text: event.passed
          ? `${event.name} held on, rolling a ${String(event.roll)} against ${String(event.target)}.`
          : `${event.name} turned, rolling a ${String(event.roll)} against ${String(event.target)}.`,
        pages: 22,
      };

    case 'bite-restrained':
      return {
        text: `The Restraints held ${event.name}, and nobody was bitten.`,
        pages: '72–73',
      };

    case 'survivor-bitten':
      return { text: `${event.name} was bitten for ${String(event.damage)} Damage.`, pages: 22 };

    case 'facility-ordered':
      return {
        text: `Ordered a ${FACILITY_LABELS[event.facility]} for the ${slotLabel(event.slot)}.`,
        pages: 20,
      };

    case 'upgrade-ordered':
      return {
        text: `Ordered a ${UPGRADE_LABELS[event.upgrade]} for the ${slotLabel(event.slot)}.`,
        pages: 20,
      };

    case 'clearing-ordered':
      return { text: `Ordered the ${slotLabel(event.slot)} cleared.`, pages: 20 };

    case 'project-cancelled':
      return { text: `Cancelled the ${slotLabel(event.slot)} project.`, pages: 20 };

    case 'project-unfinished':
      return {
        text: `The ${slotLabel(event.slot)} project went unfinished — the Labor for it left the community.`,
        pages: 23,
      };

    case 'storage-checked': {
      const lost = MATERIALS.filter(
        (material) => material !== 'rare' && event[material as 'food' | 'fuel' | 'hardware'] !== 0,
      ).map(
        (material) =>
          `${String(event[material as 'food' | 'fuel' | 'hardware'])} ${MATERIAL_LABELS[material]}`,
      );

      return {
        text:
          lost.length === 0
            ? 'Checked storage: nothing was over the cap.'
            : `Lost over the cap: ${lost.join(', ')}.`,
        pages: 23,
      };
    }

    case 'horde-checked':
      return {
        text: event.siege
          ? `The horde came: a ${String(event.roll)} against a Siege Threat of ${String(event.threat)}. Next turn is a Siege Defense.`
          : `The horde stayed away: a ${String(event.roll)} against a Siege Threat of ${String(event.threat)}.`,
        pages: 23,
      };

    case 'health-restored':
      return {
        text: `${event.name} recovered ${event.health} Health ${HEALTH_SOURCE_PHRASES[event.source]}.`,
        pages: 19,
      };

    case 'xp-awarded':
      return {
        text: `${event.name} gained ${event.amount} XP ${XP_SOURCE_PHRASES[event.source]}.`,
        pages: XP_SOURCE_PAGES[event.source],
      };

    case 'survivor-added':
      return { text: `${event.name} joined, as a ${TIER_LABELS[event.tier]}.` };

    case 'survivor-recruited':
      return {
        // A Rookie is recruited without a roll, so the sentence stops where the
        // story does rather than reporting a die nobody threw.
        text:
          event.roll === undefined
            ? `${event.name} was recruited as a ${TIER_LABELS[event.tier]}.`
            : `${event.name} was recruited as a ${TIER_LABELS[event.tier]}, rolling a ${event.roll}.`,
        pages: 15,
      };

    case 'survivor-left':
      return { text: `${event.name}, a ${TIER_LABELS[event.tier]}, left the community.` };

    case 'survivor-departed':
      return {
        text: `${event.name}, a ${TIER_LABELS[event.tier]}, walked out over the Unrest.`,
        pages: 23,
      };

    case 'mission-team-reduced':
      return {
        text: `${event.name} was too exhausted to go out, and came off the mission team.`,
        pages: 23,
      };

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

    case 'base-stocked':
      return {
        text: `The base was stocked to its caps: ${String(event.food)} Food, ${String(event.fuel)} Fuel, ${String(event.hardware)} Hardware.`,
        pages: 19,
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
