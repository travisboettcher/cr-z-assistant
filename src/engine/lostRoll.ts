/**
 * The Lost roll (pp. 25, 124; R108, R149, R150; Z7-8).
 *
 * In the Mission Phase, before the first mission, each Lost survivor rolls a d10
 * and adds the XP they have spent. At 18 or more they are placed on a mission
 * area as a stranger, on the mission the player chooses; anything less gives
 * them 1 XP. Once a turn each, and not on a turn with no mission to be placed
 * on (R150). A check by the book's convention (pg. 8), so a natural 1 fails
 * and a natural 10 succeeds.
 *
 * Read off the log, as every once-a-turn step is: a `lost-rolled` entry each.
 *
 * Pure, like the rest of `src/engine`.
 */

import { NATURAL_FAILURE, NATURAL_SUCCESS, type D10Result } from '../data/dice';
import { LOST_ROLL_TARGET, LOST_ROLL_XP } from '../data/origins';
import type { Campaign, Survivor } from './campaign';
import { logged } from './log';
import { isMissionOutcome, missionTeams, turnMissions } from './missions';
import { maxHp, withXpGained } from './survivor';
import { phaseOf } from './turn';

/** Whether this survivor's Lost roll places them on a mission (R108). */
export function lostRollPasses(survivor: Survivor, roll: D10Result): boolean {
  if (roll === NATURAL_FAILURE) return false;
  if (roll === NATURAL_SUCCESS) return true;

  return roll + survivor.xpSpent >= LOST_ROLL_TARGET;
}

/** Whether this Lost survivor has made this turn's roll. */
function rolledThisTurn(campaign: Campaign, survivorId: string): boolean {
  return campaign.log.some(
    ({ turn, event }) =>
      turn === campaign.turn && event.kind === 'lost-rolled' && event.survivor === survivorId,
  );
}

/**
 * The Lost who are owed this turn's roll: in the Mission Phase before any
 * mission's outcome is recorded, with a mission team to be placed with and the
 * mission not skipped (R150), and not rolled yet.
 */
export function lostRollsDue(campaign: Campaign): readonly Survivor[] {
  if (phaseOf(campaign.step) !== 'mission') return [];
  if (missionTeams(campaign).length === 0 || turnMissions(campaign).skipped) return [];
  if (campaign.log.some(({ turn, event }) => turn === campaign.turn && isMissionOutcome(event))) {
    return [];
  }

  return campaign.lost.filter((survivor) => !rolledThisTurn(campaign, survivor.id));
}

/**
 * Why this Lost roll cannot be recorded, or `null`: for somebody owed one, and
 * on a pass, with the team whose mission they join; a fail joins nobody.
 */
export function lostRollProblem(
  campaign: Campaign,
  survivorId: string,
  roll: D10Result,
  team: number | null,
): string | null {
  const survivor = lostRollsDue(campaign).find((one) => one.id === survivorId);
  if (survivor === undefined) return 'Nobody Lost is owed a roll now.';

  if (!lostRollPasses(survivor, roll)) {
    return team === null ? null : 'A roll under 18 places them on no mission.';
  }
  if (team === null) return 'Choose the mission team they join.';

  return missionTeams(campaign).some((one) => one.team === team)
    ? null
    : 'They join a mission team playing this turn.';
}

/**
 * The campaign with this Lost roll made: a `lost-rolled` entry, and on a fail
 * their 1 XP. Assumes the check passed.
 */
export function withLostRolled(
  campaign: Campaign,
  survivorId: string,
  roll: D10Result,
  team: number | null,
  at: string,
): Campaign {
  const survivor = campaign.lost.find((one) => one.id === survivorId) as Survivor;
  const gained =
    team === null
      ? {
          ...campaign,
          lost: campaign.lost.map((one) =>
            one.id === survivorId ? withXpGained(one, LOST_ROLL_XP) : one,
          ),
        }
      : campaign;

  return logged(gained, at, {
    kind: 'lost-rolled',
    survivor: survivor.id,
    name: survivor.name,
    roll,
    xpSpent: survivor.xpSpent,
    ...(team === null ? {} : { team }),
  });
}

/** The Lost placed on this team's mission this turn (R108). */
export function placedLost(campaign: Campaign, team: number): readonly Survivor[] {
  const placed = new Set(
    campaign.log.flatMap(({ turn, event }) =>
      turn === campaign.turn && event.kind === 'lost-rolled' && event.team === team
        ? [event.survivor]
        : [],
    ),
  );

  return campaign.lost.filter((survivor) => placed.has(survivor.id));
}

/** How a placed Lost survivor's mission left them (R109). */
export const LOST_RESCUES = ['found', 'exiled', 'not-rescued'] as const;

export type LostRescue = (typeof LOST_RESCUES)[number];

/** Whether this Lost survivor's rescue has been recorded this turn. */
function rescueRecorded(campaign: Campaign, survivorId: string): boolean {
  return campaign.log.some(
    ({ turn, event }) =>
      turn === campaign.turn && event.kind === 'lost-rescued' && event.survivor === survivorId,
  );
}

/** The Lost placed on a mission this turn whose rescue is still to be recorded (R109). */
export function rescuesDue(campaign: Campaign): readonly Survivor[] {
  if (phaseOf(campaign.step) !== 'mission') return [];

  const placed = new Set(
    campaign.log.flatMap(({ turn, event }) =>
      turn === campaign.turn && event.kind === 'lost-rolled' && event.team !== undefined
        ? [event.survivor]
        : [],
    ),
  );

  return campaign.lost.filter(
    (survivor) => placed.has(survivor.id) && !rescueRecorded(campaign, survivor.id),
  );
}

/** Why this rescue cannot be recorded, or `null`: for a Lost survivor placed this turn, once. */
export function lostRescueProblem(campaign: Campaign, survivorId: string): string | null {
  return rescuesDue(campaign).some((survivor) => survivor.id === survivorId)
    ? null
    : 'Nobody placed on a mission this turn is waiting to be rescued.';
}

/**
 * The survivor as a rescue brings them back (pg. 124; R109): as themselves,
 * with their Tier, skills, XP, traits and items, at full Health, with no
 * Infection and no Madness.
 */
function returned(survivor: Survivor): Survivor {
  return { ...survivor, currentHp: maxHp(survivor), infection: 0, madness: 0 };
}

/**
 * The campaign with this rescue recorded (R109): a Found survivor back in the
 * community, an exiled one back on the list of the Lost with their items left
 * to the base (R75), and one not rescued still Lost. Assumes the check passed.
 */
export function withLostRescued(
  campaign: Campaign,
  survivorId: string,
  result: LostRescue,
  at: string,
): Campaign {
  const survivor = campaign.lost.find((one) => one.id === survivorId) as Survivor;
  const placing = campaign.log
    .filter(
      ({ turn, event }) =>
        turn === campaign.turn && event.kind === 'lost-rolled' && event.survivor === survivorId,
    )
    .at(-1)?.event as { readonly team: number };
  const team = placing.team;
  const others = campaign.lost.filter((one) => one.id !== survivorId);
  const back = returned(survivor);

  const after: Campaign =
    result === 'found'
      ? { ...campaign, lost: others, survivors: [...campaign.survivors, { ...back, found: true }] }
      : result === 'exiled'
        ? {
            ...campaign,
            lost: [...others, { ...back, items: [] }],
            inventory: [...campaign.inventory, ...survivor.items],
          }
        : campaign;

  return logged(after, at, {
    kind: 'lost-rescued',
    survivor: survivor.id,
    name: survivor.name,
    team,
    result,
    ...(result === 'exiled' && survivor.items.length > 0 ? { items: survivor.items } : {}),
  });
}
