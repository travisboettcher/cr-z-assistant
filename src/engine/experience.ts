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
  XP_SOURCE_PAGES,
  type XpSource,
} from '../data/turn';
import { beforePlanning, missionTeam, staffOf } from './assignments';
import { occupants } from './base';
import type { Campaign, Survivor } from './campaign';
import type { Check, Violation } from './checks';
import { facilityProduction } from './production';
import { hungerPenalty } from './feeding';
import { skillScore } from './survivor';

export type XpViolationCode = 'nothing-left-in-the-pool' | 'at-the-cap' | 'not-eligible';

export type XpViolation = Violation<XpViolationCode>;

export type XpCheck = Check<XpViolationCode>;

/** One source of XP this turn, sized for this campaign. */
/**
 * The reasons a pool can be empty, which are not one per source.
 *
 * `nobody-qualifies` and `wrong-person` are the distinction `production.ts`
 * already draws for facility output, and for the same reason: "nobody is
 * assigned" and "the wrong person is assigned" are different problems, and a
 * player can only fix the one they are actually in.
 */
export type XpPoolEmptiness =
  /** No mission team at all, so nothing to award for going out. */
  | 'nobody-went'
  /** A Teacher went, so this point is replaced rather than absent (pg. 12). */
  | 'replaced-by-teaching'
  /** Nobody who went can teach — no Teaching skill anywhere on the team. */
  | 'nobody-qualifies'
  /** Somebody can teach, but their Score comes to nothing. */
  | 'score-is-nothing'
  /** No staffed Training Room to teach in. */
  | 'nowhere-to-teach'
  /** A staffed Training Room, worked by somebody without Teaching. */
  | 'wrong-person';

export interface XpPool {
  readonly source: XpSource;

  /** What the rules offer from this source this turn. */
  readonly total: number;

  /** What this turn's log says has already come out of it. */
  readonly awarded: number;

  /**
   * The most one survivor may take from this source.
   *
   * Every source has one — the mission's point is one each, the discretionary
   * point is one and only one, and both Teaching rules cap at two (pp. 18, 12,
   * 70). An earlier draft made this nullable for a source with no cap; there is
   * no such source, and the `!== null` guard it needed was a branch with
   * nothing behind it.
   */
  readonly capPerSurvivor: number;

  /** The page this source's rule is printed on, for the reader who wants it. */
  readonly pages: number;

  /**
   * Why the pool is empty, where it is — so the screen can say the true one.
   *
   * Keyed on the reason rather than on the source, which is the whole of
   * playtest finding M5. One sentence per source had to cover every way a pool
   * could come out at zero, so the Teaching pool said "nobody on the mission
   * team has Teaching" when a Rookie with Teaching at level 0 *was* on it, and
   * the Training Room pool said "no staffed Training Room" about a Training
   * Room that was staffed — by somebody without the skill. Both were
   * contradicted by the roster on the same screen.
   *
   * `undefined` when the pool has something in it, so a screen cannot render a
   * reason for an emptiness that is not there.
   */
  readonly emptyBecause: XpPoolEmptiness | undefined;

  /** Who may draw on it (pg. 18, 12, 70). */
  readonly eligible: readonly Survivor[];
}

/** The mission team's combined Teaching Score, which is a Teacher's pool (pg. 12). */
export function missionTeaching(campaign: Campaign): number {
  const penalty = hungerPenalty(campaign);

  return missionTeam(beforePlanning(campaign)).reduce(
    (total, survivor) => total + (skillScore(survivor, 'teaching', penalty) ?? 0),
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

  const penalty = hungerPenalty(campaign);
  let total = 0;

  // Staffed last Planning Phase, read this Advancement one — so it is asked of
  // the campaign as it stood before this turn's Planning cleared the answer.
  const staffed = beforePlanning(campaign);

  for (const occupant of occupants(base)) {
    for (const line of facilityProduction(occupant, staffOf(staffed, occupant.slotId), penalty)) {
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
  const team = missionTeam(beforePlanning(campaign));
  const teaching = missionTeaching(campaign);
  const onTheMission = new Set(team.map((survivor) => survivor.id));
  const offTheMission = campaign.survivors.filter((survivor) => !onTheMission.has(survivor.id));

  const totals: Record<XpSource, number> = {
    // One each (pg. 18). `MISSION_XP` is 1, so nothing can tell this
    // multiplication from a division and one mutant lives here permanently —
    // an equivalence created by the constant's value rather than by a gap in
    // the tests. An edition that made the award 2 would break that tie and the
    // suite would catch it the same day.
    mission: team.length * MISSION_XP,
    // Replaced, not topped up: a Teacher on the mission takes the point away.
    discretionary: teaching > 0 ? 0 : DISCRETIONARY_MISSION_XP,
    'mission-teaching': teaching,
    'training-room': trainingRoomXp(campaign),
  };

  const caps: Record<XpSource, number> = {
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

  /*
   * Why each pool is empty, asked of the campaign rather than of the source.
   *
   * `teaching` is the summed Score; `canTeach` is whether anybody on the team
   * *has* the skill at all. pg. 12 triggers the replacement on a Teacher being
   * on the team, and the Score is how many survivors get a point — so a Teacher
   * whose Score is zero replaces the discretionary point and hands out nothing.
   * That reading is arguably the table's; the *message* is not, and it said
   * nobody on the team had Teaching while somebody did.
   */
  const canTeach = team.some((survivor) => survivor.skills['teaching'] !== undefined);
  const roomIsStaffed = trainingRoomIsStaffed(campaign);

  const emptiness: Record<XpSource, XpPoolEmptiness> = {
    mission: 'nobody-went',
    discretionary: 'replaced-by-teaching',
    'mission-teaching': canTeach ? 'score-is-nothing' : 'nobody-qualifies',
    'training-room': roomIsStaffed ? 'wrong-person' : 'nowhere-to-teach',
  };

  return XP_SOURCES.map((source) => ({
    source,
    total: totals[source],
    awarded: awardedThisTurn(campaign, source),
    capPerSurvivor: caps[source],
    pages: XP_SOURCE_PAGES[source],
    eligible: eligible[source],
    emptyBecause: totals[source] === 0 ? emptiness[source] : undefined,
  }));
}

/**
 * Whether a Training Room has somebody in it, whatever they can do.
 *
 * Separate from what it produces, because that is the distinction the empty
 * message kept getting wrong: a Training Room staffed by a survivor whose only
 * skill is Rationing produces no XP and is not "no staffed Training Room".
 */
function trainingRoomIsStaffed(campaign: Campaign): boolean {
  const base = campaign.base;
  if (base === null) return false;

  return occupants(base).some(
    (occupant) =>
      occupant.facility.id === 'training-room' &&
      staffOf(beforePlanning(campaign), occupant.slotId).length > 0,
  );
}

/** One pool by name, which is what every caller that knows the source wants. */
export function xpPool(campaign: Campaign, source: XpSource): XpPool {
  // `XP_SOURCES` is exhaustive and `xpPools` maps over it, so the source asked
  // for is always there. The non-null assertion is the typechecker's price for
  // a lookup that cannot miss.
  return xpPools(campaign).find((pool) => pool.source === source) as XpPool;
}

/**
 * Who may draw on each pool, said rather than branched on.
 *
 * Two of the four never refuse anybody, and their sentences are here anyway:
 * a record with an entry for every source is a claim the typechecker keeps
 * true, where a ternary covering "mission" and "everything else" was a claim
 * about which sources exist that quietly went stale.
 */
const WHO_MAY_DRAW: Record<XpSource, string> = {
  mission: 'Only survivors who went on the mission earn its XP.',
  discretionary: 'Anybody may be given the discretionary point.',
  'mission-teaching': 'A Teacher may teach anybody in the community.',
  'training-room': 'A Training Room teaches the survivors who stayed behind.',
};

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
    blockers.push({ code: 'not-eligible', message: WHO_MAY_DRAW[source], pages: pool.pages });
  }

  if (pool.awarded >= pool.total) {
    blockers.push({
      code: 'nothing-left-in-the-pool',
      message: 'There is no XP left from this source this turn.',
      pages: pool.pages,
    });
  }

  if (awardedThisTurn(campaign, source, survivorId) >= pool.capPerSurvivor) {
    blockers.push({
      code: 'at-the-cap',
      message: `${pool.capPerSurvivor} XP from this source is all one survivor may take in a turn.`,
      pages: pool.pages,
    });
  }

  return { blockers, warnings: [] };
}

/**
 * The survivor with XP added.
 *
 * Takes a survivor and returns one, like the three purchases in
 * `advancement.ts` — the other half of the same transaction, and the shape the
 * store's `editSurvivorLogged` already knows how to drive. An earlier draft
 * took the whole campaign and an id, which meant the reducer had to look the
 * survivor up itself and guard against not finding one. Two places answering
 * "is this survivor real" is one too many, and the second one's guard was
 * unreachable: `checkXpAward` refuses anybody who is not in the community
 * before it can be asked.
 */
export function withXpAwarded(survivor: Survivor, amount: number): Survivor {
  return { ...survivor, xp: survivor.xp + amount };
}
