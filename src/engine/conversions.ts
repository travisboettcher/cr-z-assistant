/**
 * Materials traded for other materials, at the player's option (pg. 19, 72–73).
 *
 * **Data that nothing read.** `Effects.exchange` has been in the catalogue since
 * Phase 2 — the Gas Range turns 2 Fuel into 1 Food, the Biofuel Lab turns 2 Food
 * into 1 Fuel — and no engine or screen looked at it. A community holding Fuel
 * and short of Food could not use a Gas Range it had paid 2 Hardware and 1
 * Labor for, which is exactly where the September playtest found itself (issue
 * #108).
 *
 * ## Where it runs, and why that is the whole design
 *
 * pg. 19 puts conversions in Add Materials to Storage, and says they are
 * applied *in that step* — after the haul goes in. So they are offered once the
 * step's materials have landed, and not before: converting Fuel the base is
 * about to produce would be spending a material the community does not have
 * yet, and the ordering is the book's rather than this app's convenience.
 *
 * Nothing is automatic. An exchange is a trade a player may want and may not,
 * and a base with a Gas Range and a Biofuel Lab can run either way in the same
 * turn — so this offers each one and applies the ones that are pressed.
 *
 * ## Utilities are not materials, and not here
 *
 * The Generator and the Well Pump also carry an `exchange`, spending Fuel for a
 * point of Power or Water. Those belong to the Planning Phase's utility step
 * rather than to this one, and the reason is the turn order: a point of Power
 * lasts until the *next* turn's Planning Phase (pg. 20, 67), and this turn's
 * Planning Phase — which clears the pools — runs one phase after this step. A
 * point converted here would be wiped minutes after it was bought.
 *
 * `isMaterialExchange` is where that line is drawn, so the two kinds cannot be
 * confused by a caller: everything this module offers gains a material.
 */

import { MATERIALS, type Material, type Materials } from '../data/materials';
import type { Exchange, Facility, Upgrade } from '../data/facilities';
import { occupants, working, type Occupant } from './base';
import type { Campaign } from './campaign';
import type { Check, Violation } from './checks';
import { noMaterials, combined } from './materials';

export type ConversionViolationCode = 'not-enough-materials' | 'no-conversions-left';

export type ConversionViolation = Violation<ConversionViolationCode>;

export type ConversionCheck = Check<ConversionViolationCode>;

/**
 * One exchange a base can actually run, named by where it lives.
 *
 * The slot and the entry together, because a base can hold two Kitchens and
 * each Gas Range is its own trade with its own per-turn allowance — and because
 * a screen showing "2 Fuel → 1 Food" three times with nothing to tell them
 * apart is a screen nobody can use.
 */
export interface Conversion {
  readonly slot: string;
  /** The facility or upgrade whose table row this is. */
  readonly source: Facility | Upgrade;
  readonly exchange: Exchange;
}

/** Whether this trade gains materials, which is the only kind this step runs. */
function isMaterialExchange(exchange: Exchange): boolean {
  return Object.keys(exchange.gain).every((output) =>
    (MATERIALS as readonly string[]).includes(output),
  );
}

function conversionsOf(occupant: Occupant): readonly Conversion[] {
  // `working` rather than every entry: a Biofuel Lab without its Power and
  // Water is switched off, and a trade it cannot run is not on offer.
  return working(occupant).flatMap((source) =>
    (source.effects.exchange ?? [])
      .filter(isMaterialExchange)
      .map((exchange) => ({ slot: occupant.slotId, source, exchange })),
  );
}

/** Every material conversion this base can run this turn, in layout order. */
export function conversions(campaign: Campaign): readonly Conversion[] {
  const base = campaign.base;

  return base === null ? [] : occupants(base).flatMap(conversionsOf);
}

/**
 * How many times this conversion has already been run this turn.
 *
 * Off the log, like every other "has this step already happened" question in
 * the phase. The entry carries the slot and the source, so two Gas Ranges in
 * one base each keep their own count — and a cap read off a stored counter
 * would be a second thing to clear at the top of a turn.
 */
export function timesConverted(campaign: Campaign, conversion: Conversion): number {
  return campaign.log.filter(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'materials-converted' &&
      entry.event.slot === conversion.slot &&
      entry.event.source === conversion.source.id,
  ).length;
}

/** What this trade costs, as materials, so a caller can show it and subtract it. */
export function spentBy(conversion: Conversion): Materials {
  const spend = noMaterials();

  for (const material of MATERIALS) spend[material] = conversion.exchange.spend[material] ?? 0;

  return spend;
}

/** What this trade gains, as materials. Safe because only material trades are offered. */
export function gainedBy(conversion: Conversion): Materials {
  const gain = noMaterials();

  for (const material of MATERIALS) {
    gain[material] = conversion.exchange.gain[material as Material] ?? 0;
  }

  return gain;
}

/**
 * Everything wrong with running this conversion now.
 *
 * **Blockers, not warnings** — the one place in this phase that refuses. Spending
 * materials a community does not have would take a store negative, which is not
 * a state the book has a rule for and not one a player is choosing on purpose;
 * and a cap the book states in as many words is a rule rather than advice.
 */
export function checkConversion(campaign: Campaign, conversion: Conversion): ConversionCheck {
  const blockers: ConversionViolation[] = [];
  const spend = spentBy(conversion);
  const short = MATERIALS.filter((material) => campaign.materials[material] < spend[material]);

  if (short.length > 0) {
    blockers.push({
      code: 'not-enough-materials',
      message: `Not enough ${short.join(' or ')} in storage for this.`,
      pages: 19,
    });
  }

  const cap = conversion.exchange.maxPerTurn;

  if (cap !== undefined && timesConverted(campaign, conversion) >= cap) {
    blockers.push({
      code: 'no-conversions-left',
      message: `This converts ${String(cap)} a turn, and has.`,
      pages: 19,
    });
  }

  return { blockers, warnings: [] };
}

/** The campaign with one conversion run: what it costs out, what it gains in. */
export function withConversion(campaign: Campaign, conversion: Conversion): Campaign {
  const spend = spentBy(conversion);
  const change = combined(gainedBy(conversion), {
    food: -spend.food,
    fuel: -spend.fuel,
    hardware: -spend.hardware,
    rare: -spend.rare,
  });

  return { ...campaign, materials: combined(campaign.materials, change) };
}
