/**
 * Character Advancement — the first step of the Advancement Phase (pg. 18).
 *
 * ## Four pools, not one number
 *
 * The book awards XP from four separate sources with four separate rules, and
 * `XP_SOURCES` in `src/data/turn.ts` says what each one is. This module works
 * out how big each pool is for the campaign in front of it, who may draw on it,
 * and how much has already come out.
 *
 * ## A Teacher on the mission replaces the discretionary point
 *
 * Not adds to it (pg. 12). So the discretionary pool is one XP *only* when
 * nobody on the mission team has Teaching, and the moment somebody does the
 * point is gone and the Teacher's pool is there instead. Modelling that as two
 * pools where one is always empty is what keeps the replacement from turning
 * into an addition the first time somebody edits this.
 *
 * ## How much has been handed out is read off the log
 *
 * Every award writes an `xp-awarded` entry, and the pools are the difference
 * between what the rules offer and what this turn's entries account for. Same
 * move as `planningHasBegun` and `materialsAdded`: the step is not repeatable,
 * the walk can go backwards over it, and **derived is never stored**. It also
 * means the two per-survivor caps are answerable — "how much has Earl already
 * taken from a Teacher this turn" is a question only a record can answer.
 *
 * ## Restricted XP is not modelled, and this is where it would go
 *
 * A Training Room's upgrades produce XP spendable only on skills governed by
 * one stat (pg. 73). A survivor's `xp` is a single number with no stat on it,
 * so those lines are left out of the pool rather than quietly laundered into
 * unrestricted XP. Adding them needs a field on the survivor, which is a
 * migration and a story of its own.
 *
 * Pure, like the rest of `src/engine`.
 */

import {
  MISSION_TEACHING_MAX_XP_PER_SURVIVOR,
  MISSION_XP,
  DISCRETIONARY_MISSION_XP,
  TRAINING_ROOM_MAX_XP_PER_SURVIVOR,
  XP_SOURCES,
  type XpSource,
} from '../data/turn';
import { missionTeam, staffOf } from './assignments';
import { occupants } from './base';
import type { Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { facilityProduction } from './production';
import { skillScore } from './survivor';

export type XpViolationCode = 'nothing-left-in-the-pool' | 'at-the-cap' | 'not-eligible';

export type XpViolation = Violation<XpViolationCode>;

export type XpCheck = Check<XpViolationCode>;

/** One source of XP this turn, sized for this campaign. */
export interface XpPool {
  readonly source: XpSource;

  /** What the rules offer from this source this turn. */
  readonly total: number;

  /** What this turn's log says has already come out of it. */
  readonly awarded: number;

  /** The most one survivor may take from this source, or `null` for no cap. */
  readonly capPerSurvivor: number | null;

  /** Who may draw on it (pg. 18, 12, 70). */
  readonly eligible: readonly Survivor[];
}

/** The mission team's combined Teaching Score, which is a Teacher's pool (pg. 12). */
export function missionTeaching(campaign: Campaign): number {
  return missionTeam(campaign).reduce(
    (total, survivor) => total + (skillScore(survivor, 'teaching') ?? 0),
    0,
  );
}

/**
 * The XP a staffed Training Room makes this turn (pg. 70).
 *
 * Only the unrestricted lines — see this module's note on restricted XP. The
 * number comes through `facilityProduction`, so it is the same one the slot
 * card shows, halving for want of Power included.
 */
export function trainingRoomXp(campaign: Campaign): number {
  const base = campaign.base;
  if (base === null) return 0;

  let total = 0;

  for (const occupant of occupants(base)) {
    for (const line of facilityProduction(occupant, staffOf(campaign, occupant.slotId))) {
      if (line.restrictedToStat !== undefined) continue;
      if (line.outputs.includes('xp')) total += line.amount;
    }
  }

  return total;
}

/** How much XP this turn's log accounts for, optionally from one source or to one survivor. */
export function awardedThisTurn(
  campaign: Campaign,
  source?: XpSource,
  survivorId?: string,
): number {
  return campaign.log.reduce((total, entry) => {
    if (entry.turn !== campaign.turn) return total;
    if (entry.event.kind !== 'xp-awarded') return total;
    if (source !== undefined && entry.event.source !== source) return total;
    if (survivorId !== undefined && entry.event.survivor !== survivorId) return total;

    return total + entry.event.amount;
  }, 0);
}

/**
 * Every pool this turn offers, in the order the book awards them.
 *
 * All four are always returned, empty ones included: a pool of nothing is a
 * fact about this turn the screen should be able to show — "no Teacher went
 * out" is more useful than a row that is not there.
 */
export function xpPools(campaign: Campaign): readonly XpPool[] {
  const team = missionTeam(campaign);
  const teaching = missionTeaching(campaign);
  const onTheMission = new Set(team.map((survivor) => survivor.id));
  const offTheMission = campaign.survivors.filter((survivor) => !onTheMission.has(survivor.id));

  const totals: Record<XpSource, number> = {
    mission: team.length * MISSION_XP,
    // Replaced, not topped up: a Teacher on the mission takes the point away.
    discretionary: teaching > 0 ? 0 : DISCRETIONARY_MISSION_XP,
    'mission-teaching': teaching,
    'training-room': trainingRoomXp(campaign),
  };

  const caps: Record<XpSource, number | null> = {
    mission: MISSION_XP,
    discretionary: DISCRETIONARY_MISSION_XP,
    'mission-teaching': MISSION_TEACHING_MAX_XP_PER_SURVIVOR,
    'training-room': TRAINING_ROOM_MAX_XP_PER_SURVIVOR,
  };

  const eligible: Record<XpSource, readonly Survivor[]> = {
    mission: team,
    discretionary: campaign.survivors,
    'mission-teaching': campaign.survivors,
    // Whoever stayed behind: a Training Room teaches the people who were in it
    // to be taught (pg. 70).
    'training-room': offTheMission,
  };

  return XP_SOURCES.map((source) => ({
    source,
    total: totals[source],
    awarded: awardedThisTurn(campaign, source),
    capPerSurvivor: caps[source],
    eligible: eligible[source],
  }));
}

/** One pool by name, which is what every caller that knows the source wants. */
export function xpPool(campaign: Campaign, source: XpSource): XpPool {
  // `XP_SOURCES` is exhaustive and `xpPools` maps over it, so the source asked
  // for is always there. The non-null assertion is the typechecker's price for
  // a lookup that cannot miss.
  return xpPools(campaign).find((pool) => pool.source === source) as XpPool;
}

/**
 * Everything stopping this award, all of it a blocker.
 *
 * The opposite of `planning.ts`, and deliberately: a pool with nothing in it is
 * the app having nothing to give, not a rule a table might play differently.
 * Overriding it would invent XP, and the honest fix for a wrong Teaching Score
 * is to correct the Score. Same reasoning that makes affordability a blocker.
 */
export function checkXpAward(campaign: Campaign, survivorId: string, source: XpSource): XpCheck {
  const pool = xpPool(campaign, source);
  const blockers: XpViolation[] = [];

  if (!pool.eligible.some((survivor) => survivor.id === survivorId)) {
    blockers.push({
      code: 'not-eligible',
      message:
        source === 'mission'
          ? 'Only survivors who went on the mission earn its XP.'
          : 'A Training Room teaches the survivors who stayed behind.',
      pages: source === 'mission' ? 18 : 70,
    });
  }

  if (pool.awarded >= pool.total) {
    blockers.push({
      code: 'nothing-left-in-the-pool',
      message: 'There is no XP left from this source this turn.',
      pages: 18,
    });
  }

  const cap = pool.capPerSurvivor;

  if (cap !== null && awardedThisTurn(campaign, source, survivorId) >= cap) {
    blockers.push({
      code: 'at-the-cap',
      message: `${cap} XP from this source is all one survivor may take in a turn.`,
      pages: source === 'training-room' ? 70 : 12,
    });
  }

  return { blockers, warnings: [] };
}

/** The campaign with XP added to one survivor. */
export function withXpAwarded(campaign: Campaign, survivorId: string, amount: number): Campaign {
  return {
    ...campaign,
    survivors: campaign.survivors.map((survivor) =>
      survivor.id === survivorId ? { ...survivor, xp: survivor.xp + amount } : survivor,
    ),
  };
}
