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
import { articleForNumber, withArticle } from './articles';
import { FIRST_TURN } from '../engine/siege';
import { SIEGE_TRIGGER, XP_SOURCE_PAGES, type HealthSource, type XpSource } from '../data/turn';
import type { Item } from '../engine/campaign';
import type {
  CampaignEvent,
  HistoricMaterials,
  LeavingCause,
  LogEntry,
  RareTradeLoss,
} from '../engine/log';
import {
  BASE_LABELS,
  FACILITY_LABELS,
  builtThingLabel,
  builtThingPreposition,
  HISTORIC_RARE_LABEL,
  MATERIAL_LABELS,
  UPGRADE_LABELS,
  slotLabel,
} from './baseLabels';
import { MISSIONS } from '../data/missions';
import { describeItem, holderLabel } from './equipmentLabels';
import {
  describeOutcome,
  describeSelection,
  MISSION_LABELS,
  OVERRUN_LABELS,
  outcomePages,
} from './missionLabels';
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

/**
 * The amounts that moved, each named, with the Rare an entry written before
 * schema v17 counted (R49): its history reads as it did.
 */
function amountsMoved(amounts: HistoricMaterials): readonly string[] {
  return [
    ...MATERIALS.filter((material) => amounts[material] !== 0).map(
      (material) => `${String(amounts[material])} ${MATERIAL_LABELS[material]}`,
    ),
    ...(amounts.rare === undefined || amounts.rare === 0
      ? []
      : [`${String(amounts.rare)} ${HISTORIC_RARE_LABEL}`]),
  ];
}

/**
 * Items as a list a person reads: "standard bow ×2, standard rifle".
 *
 * A count after the name rather than before it, so no name has to be made
 * plural: "2 standard bow" is wrong, and a third of the catalogue is plural or
 * a mass noun already (bandages, reinforced clothing), which a rule about
 * adding an s would get wrong.
 */
function counted(items: readonly Item[]): string {
  const names = items.map(describeItem);

  return [...new Set(names)]
    .map((name) => {
      const count = names.filter((one) => one === name).length;

      return count === 1 ? name : `${name} ×${String(count)}`;
    })
    .join(', ');
}

/** How a `survivor-left` entry's survivor left, by its cause (#201). */
const LEFT_BY_CAUSE: Readonly<
  Record<Exclude<LeavingCause, 'killed'>, { readonly how: string; readonly pages?: 22 }>
> = {
  turned: { how: 'turned and left the community', pages: 22 },
  bitten: { how: 'died of the bite', pages: 22 },
  removed: { how: 'was taken off the roster' },
};

/** Why a Rare Items trade was lost, as its line opens (pp. 21, 23; R59, R60). */
const RARE_TRADE_LOST: Readonly<Record<RareTradeLoss, string>> = {
  siege: 'The horde called a siege',
  'other-mission': 'Another mission was chosen first',
  'no-mission': 'The community sat the mission out',
};

/** Food and Fuel as a trade's line names them: "2 Food and 1 Fuel", or the one alone. */
function paid(amount: { readonly food: number; readonly fuel: number }): string {
  const parts = [
    ...(amount.food === 0 ? [] : [`${String(amount.food)} Food`]),
    ...(amount.fuel === 0 ? [] : [`${String(amount.fuel)} Fuel`]),
  ];

  return parts.length === 0 ? 'nothing' : parts.join(' and ');
}

export function describeEvent(event: CampaignEvent, turn = 1): EventLabel {
  switch (event.kind) {
    case 'campaign-started':
      return { text: `Started the campaign “${event.name}”.` };

    case 'phase-entered':
      // Deliberately says nothing about *which* phase: the entry it came from
      // carries that, and the log screen already groups by it.
      return { text: 'The phase began.', pages: 17 };

    case 'turn-began':
      return { text: 'The turn began.', pages: 17 };

    case 'starting-community-settled':
      return {
        text: event.built
          ? 'Finished building the starting community.'
          : 'Reopened the starting community for changes.',
        pages: 13,
      };

    case 'planning-began':
      // Turn 1 has nothing behind it to clear, and said so anyway (#173). The
      // entry is written on every turn's first Planning step, so the sentence
      // has to ask which turn it is on rather than assuming there was one
      // before — the turn comes from the entry, which is the only thing that
      // knows.
      return {
        text:
          turn <= FIRST_TURN
            ? 'Started planning.'
            : 'Started planning, and cleared last turn’s tasks and utilities.',
        pages: 20,
      };

    case 'materials-added': {
      // Only what moved. A turn that recovered three Food and nothing else
      // should not read as "3 Food, 0 Fuel, 0 Hardware, 0 Rare".
      const moved = amountsMoved(event);

      return {
        text:
          moved.length === 0
            ? 'Added nothing to storage this turn.'
            : `Added to storage: ${moved.join(', ')}.`,
        pages: '18–19',
      };
    }

    case 'siege-fought':
      return {
        text:
          event.names.length === 0
            ? 'The horde arrived, and there was nobody left to meet it.'
            : `The horde arrived, and the whole community deployed: ${event.names.join(', ')}.`,
        pages: 85,
      };

    case 'materials-scavenged': {
      // The same "only what moved" rule the haul above follows, for the same
      // reason — and an unskilled scavenger brings back exactly one thing.
      const found = amountsMoved(event);

      return {
        text:
          found.length === 0
            ? `${event.name} scavenged and found nothing.`
            : `${event.name} scavenged ${found.join(', ')}.`,
        pages: 17,
      };
    }

    case 'materials-converted': {
      const of = (amounts: Partial<Record<Material, number>>) =>
        MATERIALS.filter((material) => (amounts[material] ?? 0) !== 0)
          .map((material) => `${String(amounts[material])} ${MATERIAL_LABELS[material]}`)
          .join(', ');

      return {
        // Named by the thing that did it *and where it is*, because a base can
        // hold two of them and the history is where a player checks a per-turn
        // allowance. The comment beside this line claimed as much while the
        // sentence dropped the slot the event carries (#151).
        text: `The ${builtThingLabel(event.source)} on the ${slotLabel(event.slot)} traded ${of(event.spent)} for ${of(event.gained)}.`,
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
          ? `${event.name} held on, rolling ${articleForNumber(event.roll)} ${String(event.roll)} against ${String(event.target)}.`
          : `${event.name} turned, rolling ${articleForNumber(event.roll)} ${String(event.roll)} against ${String(event.target)}.`,
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
        text: `Ordered ${withArticle(FACILITY_LABELS[event.facility])} for the ${slotLabel(event.slot)}.`,
        pages: 20,
      };

    case 'upgrade-ordered':
      return {
        text: `Ordered ${withArticle(UPGRADE_LABELS[event.upgrade])} for the ${slotLabel(event.slot)}.`,
        pages: 20,
      };

    case 'clearing-ordered':
      return { text: `Ordered the ${slotLabel(event.slot)} cleared.`, pages: 20 };

    case 'project-cancelled': {
      // Named where the entry says what it was, which order and built entries
      // have always done — "the Back Yard project" is ambiguous the moment two
      // are queued there (#151). A clearing carries nothing to name, and
      // neither does an entry written before this, so both keep the slot's own
      // sentence.
      const what =
        event.built === undefined
          ? `the ${slotLabel(event.slot)} project`
          : `the ${builtThingLabel(event.built)} ${builtThingPreposition(event.built)} the ${slotLabel(event.slot)}`;

      return {
        text:
          event.hardware === undefined || event.hardware === 0
            ? `Cancelled ${what}.`
            : `Cancelled ${what}. ${String(event.hardware)} Hardware came back.`,
        pages: 20,
      };
    }

    case 'project-unfinished': {
      const what =
        event.built === undefined
          ? `The ${slotLabel(event.slot)} project`
          : `The ${builtThingLabel(event.built)} ${builtThingPreposition(event.built)} the ${slotLabel(event.slot)}`;

      // Says what came back, like its sibling above. It named only the Labor,
      // while the cancel button two screens away promised "its Hardware comes
      // back" and the Hardware duly moved 1 → 3 — the app contradicting its own
      // copy about the same refund (#173).
      const back =
        event.hardware === undefined || event.hardware === 0
          ? ''
          : ` ${String(event.hardware)} Hardware came back.`;

      return {
        text: `${what} went unfinished. The Labor for it left the community.${back}`,
        pages: 23,
      };
    }

    case 'storage-checked': {
      const lost = MATERIALS.filter((material) => event[material] !== 0).map(
        (material) => `${String(event[material])} ${MATERIAL_LABELS[material]}`,
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
          ? `The horde came: ${articleForNumber(event.roll)} ${String(event.roll)} against a Siege Threat of ${String(event.threat)}. Next turn is a Siege Defense.${
              // Only a Thin the Herd that put everybody down brings it on a
              // roll that falls short (pg. 81), and the entry already says
              // how short — so the reason is read off the two numbers.
              event.roll + event.threat < SIEGE_TRIGGER
                ? ' It came on its own, after the Thin the Herd.'
                : ''
            }`
          : `The horde stayed away: ${articleForNumber(event.roll)} ${String(event.roll)} against a Siege Threat of ${String(event.threat)}.`,
        pages: 23,
      };

    case 'mission-selected':
      return { text: describeSelection(event), pages: MISSIONS[event.mission].pages };

    case 'mission-skipped':
      return { text: 'The community skipped this turn’s mission.', pages: 17 };

    case 'siege-defense-resolved':
    case 'thin-the-herd-resolved':
    case 'first-mission-resolved':
    case 'claim-a-new-base-resolved':
    case 'gather-materials-resolved':
    case 'retrieve-new-vehicles-resolved':
    case 'rescue-strangers-resolved':
    case 'rare-goods-trader-resolved':
    case 'mission-played':
      return { text: describeOutcome(event, turn), pages: outcomePages(event) };

    case 'stood-in':
      return {
        text:
          event.byName === undefined
            ? `Nobody stands in for ${event.name} after all.`
            : `${event.byName} stood in for ${event.name}, whom the siege left at 0 Health.`,
        pages: 23,
      };

    case 'health-restored': {
      // An entry with no Infection count is all Health, which is every entry
      // outside a Viral campaign and every one written before #176.
      const onInfection = event.infection ?? 0;
      const healed = event.health - onInfection;

      if (onInfection === 0) {
        return {
          text: `${event.name} recovered ${event.health} Health ${HEALTH_SOURCE_PHRASES[event.source]}.`,
          pages: 19,
        };
      }

      return {
        text: `${event.name} took ${event.health} Health ${HEALTH_SOURCE_PHRASES[event.source]}: ${
          healed === 0 ? 'all of it' : `${String(onInfection)} of it`
        } against Infection${healed === 0 ? '' : `, ${String(healed)} on wounds`}.`,
        pages: '19, 123',
      };
    }

    case 'xp-awarded':
      return {
        text: `${event.name} gained ${event.amount} XP ${XP_SOURCE_PHRASES[event.source]}.`,
        pages: XP_SOURCE_PAGES[event.source],
      };

    case 'survivor-added':
      return { text: `${event.name} joined, as ${withArticle(TIER_LABELS[event.tier])}.` };

    case 'survivor-recruited':
      return {
        // A Rookie is recruited without a roll, so the sentence stops where the
        // story does rather than reporting a die nobody threw.
        text:
          event.roll === undefined
            ? `${event.name} was recruited as ${withArticle(TIER_LABELS[event.tier])}.`
            : `${event.name} was recruited as ${withArticle(TIER_LABELS[event.tier])}, rolling ${articleForNumber(event.roll)} ${String(event.roll)}.`,
        pages: 15,
      };

    case 'stranger-joined': {
      // Which team brought them out, because a turn of two rescues reads as
      // two arrivals with nothing to tell them apart otherwise (Z4-5).
      // What a story gave a survivor it brought (Z7-3).
      const joined = `${event.name} joined as ${withArticle(TIER_LABELS[event.tier])}, rescued by mission team ${String(event.team)}${
        event.bondGroup === undefined ? '' : `, Bonded in bond group ${String(event.bondGroup)}`
      }${event.xp === undefined ? '' : `, with ${String(event.xp)} XP`}`;

      return event.roll === undefined
        ? { text: `${joined}.`, pages: 19 }
        : {
            text: `${joined}, rolling ${articleForNumber(event.roll)} ${String(event.roll)}.`,
            pages: '15, 19',
          };
    }

    case 'survivor-left': {
      const who = `${event.name}, ${withArticle(TIER_LABELS[event.tier])}`;
      // An entry from before the cause was recorded reads as it always did (#201).
      if (event.cause === undefined) return { text: `${who}, left the community.` };

      // A death on a mission names the team, and what was lost on the map (R71).
      if (event.cause === 'killed') {
        return {
          text: `${who}, died on mission team ${String(event.team ?? 1)}’s mission${event.lost === undefined ? '' : `, and ${counted(event.lost)} stayed on the map`}.`,
          pages: 34,
        };
      }

      const { how, pages } = LEFT_BY_CAUSE[event.cause];

      return { text: `${who}, ${how}.`, ...(pages === undefined ? {} : { pages }) };
    }

    case 'survivor-departed':
      return {
        text: `${event.name}, ${withArticle(TIER_LABELS[event.tier])}, walked out over the Unrest${event.items === undefined ? '' : `, taking ${counted(event.items)}`}.`,
        pages: 23,
      };

    case 'mission-team-reduced':
      return {
        text: `${event.name} was too exhausted to go out, and came off the mission team.`,
        pages: 23,
      };

    case 'veteran-healed':
      return {
        text:
          event.veteran === event.survivor
            ? `${event.name} spent 1 XP as a Veteran to bring themselves up to 1 Health.`
            : `${event.veteranName} spent 1 XP as a Veteran to bring ${event.name} up to 1 Health.`,
        pages: 88,
      };

    case 'survivor-promoted': {
      // What the promotion gave, where it gave something (pg. 87; Z7-2).
      const gave =
        event.story !== undefined
          ? `, and took on ${MISSION_LABELS[event.story]}`
          : event.veteran === true
            ? ', and became a Veteran'
            : '';

      return {
        text: `${event.name} was promoted to ${TIER_LABELS[event.tier]}${gave}.`,
        pages: gave === '' ? 18 : '18, 87',
      };
    }

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

    case 'base-moved':
      return {
        text: `The community moved from the ${BASE_LABELS[event.from]} into the ${BASE_LABELS[event.to]}, leaving what was built behind.${
          event.setAside.length === 0
            ? ''
            : ` ${event.setAside.map((hero) => hero.name).join(' and ')} left to start ${event.setAside.length === 1 ? 'a community of their own' : 'communities of their own'}.`
        }${
          event.stores === undefined
            ? ''
            : ` After the overrun, the stores held ${[
                ...MATERIALS.map(
                  (material) => `${String(event.stores?.[material])} ${MATERIAL_LABELS[material]}`,
                ),
                ...(event.stores.rare === undefined
                  ? []
                  : [`${String(event.stores.rare)} ${HISTORIC_RARE_LABEL}`]),
              ].join(', ')}.`
        }${
          event.rebuild === undefined || event.rebuild.length === 0
            ? ''
            : ' What the community had added can be built again without Hardware.'
        }`,
        pages: event.setAside.length === 0 ? 79 : '54, 79',
      };

    case 'item-added':
      return { text: `Added to the base’s Inventory: ${describeItem(event)}.`, pages: 18 };

    case 'item-removed':
      return { text: `Taken out of the base’s Inventory: ${describeItem(event)}.`, pages: 18 };

    case 'items-spent':
      return {
        text:
          event.items.length === 0
            ? `Mission team ${String(event.team)} used up or lost nothing.`
            : `Mission team ${String(event.team)} used up or lost: ${event.items.map((one) => `${one.name}’s ${describeItem(one)}`).join(', ')}.`,
        pages: '40, 45–48',
      };

    case 'equipment-handed-over':
      return {
        text: `The ${event.slot === undefined ? '' : `${slotLabel(event.slot)} at the `}${BASE_LABELS[event.base]} handed over ${counted(event.items)}.`,
        pages: event.slot === undefined ? 66 : 62,
      };

    case 'rare-upgrade-installed':
      return {
        text: `Installed ${describeItem(event)} in the ${slotLabel(event.slot)}.`,
        pages: 49,
      };

    case 'item-found':
      return {
        text: `Found on the Rare Item Table, rolling ${String(event.subtable)} then ${String(event.entry)}: ${describeItem(event)}.`,
        pages: '19, 43',
      };

    case 'item-built':
      return {
        text: `Built into the base’s Inventory: ${describeItem(event)}, for ${String(event.hardware)} Hardware and ${String(event.labor)} Labor.`,
        pages: '20, 41–42',
      };

    case 'vehicle-added':
      return {
        text: `Added ${event.vehicle.label}, a Tier ${String(event.vehicle.tier)} ${event.vehicle.water ? 'boat' : 'vehicle'}, by hand.`,
        pages: 53,
      };

    case 'vehicle-removed':
      return {
        text: `Took ${event.label}, a Tier ${String(event.tier)} vehicle, out by hand.`,
      };

    case 'vehicle-upgrade-fitted':
      return { text: `Fitted ${describeItem(event.item)} to ${event.label}, for good.`, pages: 49 };

    case 'overrun-lost': {
      const lost = [
        ...(event.items.length === 0 ? [] : [counted(event.items)]),
        ...event.vehicles.map((vehicle) => vehicle.label),
        ...(event.trades.length === 0 ? [] : [`${counted(event.trades)} on order`]),
      ];

      return {
        text:
          lost.length === 0
            ? 'Nothing was lost with the overrun base.'
            : `Lost with the overrun base: ${lost.join('; ')}.`,
        pages: 86,
      };
    }

    case 'vehicle-taken':
      return {
        text: `Mission team ${String(event.team)} took ${event.label}, Tier ${String(event.tier)}, ${event.fuel === 0 ? 'burning no Fuel' : `burning ${String(event.fuel)} Fuel`}.`,
        pages: 52,
      };

    case 'vehicle-left-home':
      return {
        text: `Mission team ${String(event.team)} left ${event.label} at home${event.fuel === 0 ? '' : `, and its ${String(event.fuel)} Fuel went back into storage`}.`,
        pages: 52,
      };

    case 'vehicles-brought-home':
      return {
        text:
          event.lost.length === 0
            ? `Mission team ${String(event.team)} drove its vehicles home.`
            : `Mission team ${String(event.team)} lost ${event.lost.map((vehicle) => (vehicle.upgrade === undefined ? vehicle.label : `${vehicle.label} and its ${describeItem(vehicle.upgrade)}`)).join(', ')}, which stayed on the map.`,
        pages: 32,
      };

    case 'rare-trade-made':
      return {
        text: `Made a Rare Items trade for ${event.items.map(describeItem).join(', ')}, setting aside ${paid(
          event.items.reduce(
            (total, item) => ({ food: total.food + item.food, fuel: total.fuel + item.fuel }),
            { food: 0, fuel: 0 },
          ),
        )}. The next mission is the Rare Goods Trader.`,
        pages: '21, 43',
      };

    case 'rare-trade-lost':
      return {
        text: `${RARE_TRADE_LOST[event.reason]}, so the Rare Items trade is off and what was set aside for it is lost: ${paid(event)}.`,
        pages: event.reason === 'siege' ? 23 : 21,
      };

    case 'rare-trade-closed':
      return {
        text: [
          ...(event.arrived.length === 0
            ? []
            : [`From the Rare Goods Trader: ${counted(event.arrived)}.`]),
          ...(event.lost.length === 0
            ? []
            : [`Lost because nobody went out: ${counted(event.lost)}, and what was paid.`]),
          `${event.food + event.fuel === 0 ? 'Nothing' : paid(event)} set aside came back to storage.`,
        ].join(' '),
        pages: 84,
      };

    case 'trade-ordered':
      return {
        text: `Traded for ${describeItem(event)}, for ${paid(event)}. It arrives next Advancement Phase.`,
        pages: 21,
      };

    case 'trade-arrived':
      return { text: `Arrived from a trade: ${describeItem(event)}.`, pages: 19 };

    case 'item-sold':
      return { text: `Sold ${describeItem(event)} for ${paid(event)}.`, pages: '21, 37' };

    case 'item-moved':
      return {
        text: `Moved ${describeItem(event)} from ${holderLabel(event.from)} to ${holderLabel(event.to)}.`,
        pages: event.from === 'free' || event.to === 'free' ? '18, 37' : 18,
      };

    case 'community-abandoned':
      return {
        text: `The community left ${event.setAside.map((one) => one.name).join(', ') || 'nobody'} behind, to begin again with new survivors.`,
        pages: 86,
      };

    case 'survivor-returned':
      return { text: `${event.name} returned to the community.`, pages: '19, 86' };

    case 'overrun-continued':
      return {
        text: `With the base overrun, the community chose to ${OVERRUN_LABELS[event.option]}.`,
        pages: 86,
      };

    case 'facility-built':
      return {
        text: `Built ${withArticle(FACILITY_LABELS[event.facility])} in the ${slotLabel(event.slot)}.`,
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
