/**
 * How a mission's choice and outcome read (pp. 75–86).
 *
 * One phrasing for two readers — the history and the Mission Phase's own
 * record of what it just wrote — so the line the player sees when they record
 * an outcome is the line their log keeps. No rule text: what the outcome does
 * is said in this app's words, with the page beside it.
 */

import type { BaseId } from '../data/bases';
import type { Material } from '../data/materials';
import { MISSIONS, type MissionId, type OutcomeCount, type OverrunOption } from '../data/missions';
import type { FieldRecruitTier } from '../data/recruitTable';
import { withArticle } from './articles';
import { BASE_LABELS, MATERIAL_LABELS } from './baseLabels';
import type { MissionWound } from '../engine/log';
import { outcomeMission, outcomeTeam, type MissionOutcome } from '../engine/missions';
import {
  baseOverrun,
  FIRST_TURN,
  siegeCounterChange,
  type CounterOutcome,
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

/** Each way on from an overrun base, as the end of a sentence (pg. 86). */
export const OVERRUN_LABELS: Record<OverrunOption, string> = {
  claim: 'claim a new base',
  'start-over': 'start a new community',
  abandon: 'leave the survivors behind and begin a new community',
};

/** A team's choice in a sentence, for the history and the Select Mission step. */
export function describeSelection(selection: {
  readonly team: number;
  readonly mission: MissionId;
  readonly names: readonly string[];
  readonly material?: Material;
  readonly base?: BaseId;
}): string {
  const remainder =
    selection.material === undefined
      ? ''
      : `, taking the rest in ${MATERIAL_LABELS[selection.material]}`;
  const claiming =
    selection.base === undefined ? '' : `, claiming ${withArticle(BASE_LABELS[selection.base])}`;
  const who = selection.names.length === 0 ? '' : `: ${selection.names.join(', ')}`;

  return `Mission team ${String(selection.team)} chose ${MISSION_LABELS[selection.mission]}${remainder}${claiming}${who}.`;
}

/** A mission's title at the start of a line: "Siege Defense", not "the Siege Defense". */
export function missionTitle(mission: MissionId): string {
  const label = MISSION_LABELS[mission].replace(/^the /, '');

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** The whole mission's pages, from the catalogue (Z4-1). */
export function outcomePages(outcome: MissionOutcome): number | string {
  return MISSIONS[outcomeMission(outcome)].pages;
}

/** What the Tactical Mission form calls each count the table makes (Z4-3). */
export const COUNT_LABELS: Record<OutcomeCount, string> = {
  'end-condition': 'End condition met',
  'strangers-rescued': 'Strangers rescued',
  'vehicles-on-area': 'working vehicles on the mission area',
  'materials-carried-out': 'materials carried off the map',
  'starting-zombies': 'zombies at the start',
  'zombies-left': 'zombies left on the mission area',
  'survivors-exited': 'survivors out over the map edge',
  'all-incapacitated': 'Every survivor on it was incapacitated',
  'vehicles-driven-off': 'vehicles repaired and driven off',
};

const COUNTER_PHRASES: Record<SiegeCounterChange, string> = {
  reset: 'The turns since the last siege go back to 0.',
  halved: 'The turns since the last siege are halved, rounding down.',
  none: 'The turns since the last siege keep counting.',
};

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

function strangersOf(strangers: readonly FieldRecruitTier[]): string {
  return strangers.length === 0
    ? 'no strangers rescued'
    : `${plural(strangers.length, 'stranger', 'strangers')} rescued (${strangers
        .map((tier) => `Tier ${String(tier)}`)
        .join(', ')})`;
}

/**
 * A stranger, where a mission whose setup only sometimes places one did — said
 * only then, so the line for the usual empty-handed run reads as it always has.
 */
function anyStrangers(strangers: readonly FieldRecruitTier[]): string {
  return strangers.length === 0 ? '' : `, ${strangersOf(strangers)}`;
}

/** Said only when somebody set aside came back (R31). */
function broughtBack(returned: readonly string[] | undefined): string {
  const count = returned?.length ?? 0;

  return count === 0
    ? ''
    : `, and ${plural(count, 'survivor', 'survivors')} set aside brought back`;
}

/** Said only of the claim that asks it (R29). */
function sameMapOf(sameMap: boolean | undefined): string {
  if (sameMap === undefined) return '';

  return sameMap ? ', on the overrun base’s own map' : ', on a different map';
}

/** Which end condition was met; a failure under the number the page gives it (#205). */
function endOf(mission: 'first-mission' | 'claim-a-new-base', endCondition: number | null): string {
  return endCondition === null
    ? `end condition ${String(MISSIONS[mission].failedOn)}, failed`
    : `end condition ${String(endCondition)} met`;
}

/** What was counted at the end, in a sentence. */
function counted(outcome: MissionOutcome): string {
  switch (outcome.kind) {
    case 'siege-defense-resolved':
      return `${plural(outcome.zombiesLeft, 'zombie', 'zombies')} left, ${plural(outcome.survivorsExited, 'survivor', 'survivors')} out over the map edge`;
    case 'thin-the-herd-resolved':
      return `${String(outcome.zombiesLeft)} of ${plural(outcome.startingZombies, 'zombie', 'zombies')} left, ${plural(outcome.survivorsExited, 'survivor', 'survivors')} out over the map edge`;
    case 'first-mission-resolved':
      return `${endOf('first-mission', outcome.endCondition)}, ${strangersOf(outcome.strangers)}`;
    case 'claim-a-new-base-resolved':
      return `${endOf('claim-a-new-base', outcome.endCondition)}, ${strangersOf(outcome.strangers)}, ${plural(outcome.vehiclesOnArea, 'working vehicle', 'working vehicles')} on the mission area${sameMapOf(outcome.sameMap)}`;
    case 'gather-materials-resolved':
      return `${plural(outcome.materialsCarriedOut, 'material', 'materials')} carried off the map${anyStrangers(outcome.strangers)}`;
    case 'retrieve-new-vehicles-resolved':
      return `${plural(outcome.vehiclesDrivenOff, 'vehicle', 'vehicles')} repaired and driven off${anyStrangers(outcome.strangers)}`;
    case 'rescue-strangers-resolved':
      return `${strangersOf(outcome.strangers)}${broughtBack(outcome.returned)}`;
    case 'rare-goods-trader-resolved':
      return `${plural(outcome.survivorsExited, 'survivor', 'survivors')} out over the map edge${anyStrangers(outcome.strangers)}`;
    case 'mission-played':
      return 'played';
  }
}

function isCounterOutcome(outcome: MissionOutcome): outcome is CounterOutcome {
  return outcome.kind === 'siege-defense-resolved' || outcome.kind === 'thin-the-herd-resolved';
}

/**
 * What the outcome does to the campaign, in this app's words.
 *
 * The turn, because a failed First Mission means two things: on turn 1 it is
 * played again (R21), and on any later turn it can only have been a community
 * starting over after an overrun, which chooses its way on again (R28).
 */
export function outcomeConsequences(outcome: MissionOutcome, turn: number): readonly string[] {
  if (outcome.kind === 'first-mission-resolved' && outcome.endCondition === null) {
    return [
      turn === FIRST_TURN
        ? 'The First Mission failed, so turn 1 plays it again (R21).'
        : 'The First Mission failed, so the community chooses again how it goes on (R28).',
    ];
  }

  if (!isCounterOutcome(outcome)) return [];

  const consequences = [COUNTER_PHRASES[siegeCounterChange(outcome)]];

  if (baseOverrun(outcome)) {
    consequences.push(
      'The base is overrun: the community goes on by claiming a new base, starting a new community, or leaving the survivors behind for new ones — played as a further mission this turn (R27).',
    );
  }

  if (outcome.kind === 'thin-the-herd-resolved' && outcome.allIncapacitated) {
    consequences.push(
      'Every survivor went down, so the next roll against the horde succeeds on its own.',
    );
  }

  return consequences;
}

/**
 * The Health each member came home with, and their Infection where it was
 * recorded (Z4-4) — or nothing, for an entry written before wounds were, or a
 * team with nobody on it.
 */
function woundsOf(wounds: readonly MissionWound[] | undefined): readonly string[] {
  if (wounds === undefined || wounds.length === 0) return [];

  const each = wounds.map(
    (wound) =>
      `${wound.name} at ${String(wound.health)} Health${
        wound.infection === undefined ? '' : ` and ${String(wound.infection)} Infection`
      }`,
  );

  return [`At the end: ${each.join(', ')}.`];
}

/**
 * An outcome in a line: the mission, what was counted, the Health the team
 * came home with, and what it does. A team other than team 1 is named, so two
 * teams' outcomes in one turn can be told apart in the history.
 */
export function describeOutcome(outcome: MissionOutcome, turn: number): string {
  const team = outcomeTeam(outcome);
  const who = team === 1 ? '' : ` (mission team ${String(team)})`;

  return [
    `${missionTitle(outcomeMission(outcome))}${who}: ${counted(outcome)}.`,
    ...woundsOf(outcome.wounds),
    ...outcomeConsequences(outcome, turn),
  ].join(' ');
}
