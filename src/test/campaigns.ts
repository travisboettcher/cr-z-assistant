/**
 * Building the campaign state a test needs, when what it actually cares about
 * is one number.
 *
 * Z3-5 turned the Labor pool from a field on a request into arithmetic over the
 * project team, which is the right shape for the app and a tedious one for a
 * test: "a build that costs 2 Labor is refused when 1 is available" now needs a
 * roster, and a roster is not what that test is about.
 *
 * Here rather than copied into each suite for the reason `arbitraries.ts` is
 * here: it is scaffolding several suites share, and `src/test` is outside the
 * mutation config so a mutant in a helper cannot score itself.
 */

import type { Assignment, Campaign, Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';

/**
 * A project team generating exactly this much Labor (pg. 20).
 *
 * Built from Tier 1 survivors, one Labor apiece, so the total is the head
 * count and a test asking for 5 gets 5 rather than "6, because Tiers come in
 * fours". Their ids are positional and stable, so a test that needs to name one
 * can.
 */
export function projectTeamWorth(labor: number): {
  readonly survivors: readonly Survivor[];
  readonly assignments: Readonly<Record<string, Assignment>>;
} {
  const survivors = Array.from({ length: labor }, (_, index) =>
    createSurvivor(`Laborer ${String(index + 1)}`, 1, { id: `laborer-${String(index + 1)}` }),
  );

  return {
    survivors,
    assignments: Object.fromEntries(
      survivors.map((survivor) => [survivor.id, { task: 'project' } as const]),
    ),
  };
}

/**
 * The campaign with this turn's Planning Phase on the record.
 *
 * Ordering a project is paid for by the team *this* turn assigned, and nothing
 * says a turn's Planning has happened except the `planning-began` entry the
 * walk writes (pg. 20) — so a fixture that hands a campaign a project team and
 * expects to spend its Labor has to have walked that far. Stamped with the
 * campaign's own turn, so a fixture that moves the turn moves this with it.
 *
 * The phase is the Planning one for the same reason: an entry claiming the
 * clearing happened during the Mission Phase would be a record of something
 * that cannot occur, and these campaigns are read by the screens as well as by
 * the engine.
 */
export function withPlanningBegun(campaign: Campaign): Campaign {
  return {
    ...campaign,
    log: [
      ...campaign.log,
      {
        turn: campaign.turn,
        phase: 'planning',
        at: '2026-08-30T00:00:00.000Z',
        event: { kind: 'planning-began' },
      },
    ],
  };
}

/**
 * The campaign with somebody working a slot.
 *
 * Adds them to the roster as well, because an assignment naming a survivor the
 * community does not hold is a damaged save — the store cannot write one and a
 * test should not either.
 */
export function staffedWith(
  campaign: Campaign,
  slot: string,
  staff: readonly Survivor[],
): Campaign {
  return {
    ...campaign,
    survivors: [...campaign.survivors, ...staff],
    assignments: {
      ...campaign.assignments,
      ...Object.fromEntries(
        staff.map((survivor) => [survivor.id, { task: 'staff', slot } as const]),
      ),
    },
  };
}

/**
 * A survivor whose Utilities Score is exactly this.
 *
 * A Skill Score is the governing stat plus the level (pg. 8), so a Cooperation
 * of `score` and a Utilities level of 0 lands on the number asked for —
 * including 0, which is the interesting one: somebody useless in a Station is a
 * different state from nobody in it, and both generate nothing.
 */
export function utilityWorker(score: number): Survivor {
  return {
    id: `utilities-${String(score)}`,
    name: 'Utilities',
    tier: 4,
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
    skills: { utilities: 0 },
    move: 6,
    defense: 6,
    currentHp: 4,
    xp: 0,
  };
}

/**
 * The campaign with a staffed Utility Station generating exactly this Score.
 *
 * Z3-5 turned the staffed half of the utility pool from a number on a request
 * into arithmetic over whoever is working a Station (pg. 20, 72), so a test
 * about over-assignment now needs a Station and somebody in it. This is that
 * arrangement, in one line.
 *
 * Builds the Station into `slot` as well, for the bases that have none. Where
 * the slot is already a built-in Station the layout wins and the extra record
 * is ignored — `occupants` reads the layout first — so callers with one can
 * point at it and callers without get one.
 */
export function generatingUtilities(
  campaign: Campaign,
  score: number,
  slot = 'front-yard',
): Campaign {
  const base = campaign.base;
  if (base === null) return campaign;

  const withStation: Campaign = {
    ...campaign,
    base: {
      ...base,
      slots: {
        ...base.slots,
        [slot]: { ...base.slots[slot], built: { facility: 'utility-station', builtOnTurn: 1 } },
      },
    },
  };

  return staffedWith(withStation, slot, [utilityWorker(score)]);
}

/**
 * The campaign with a Utility Station generating one point of this utility flat.
 *
 * The other way to back an assigned point, and the one a fixture wants when its
 * head count is part of the arrangement: Solar Panels and Rain Collectors
 * produce whether or not anybody is standing there (pg. 67, 72), so unlike
 * `generatingUtilities` this adds nobody to the roster. The slot has to be an
 * outdoor one — both upgrades require it.
 */
export function generatingFlatUtility(
  campaign: Campaign,
  utility: 'power' | 'water',
  slot = 'front-yard',
): Campaign {
  const base = campaign.base;
  if (base === null) return campaign;

  return {
    ...campaign,
    base: {
      ...base,
      slots: {
        ...base.slots,
        [slot]: {
          ...base.slots[slot],
          built: { facility: 'utility-station', builtOnTurn: 1 },
          upgrades: [utility === 'power' ? 'solar-panel' : 'rain-collector'],
        },
      },
    },
  };
}
