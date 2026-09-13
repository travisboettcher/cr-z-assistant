/**
 * Departures — the last step of the Management Phase (pg. 23).
 *
 * ## Unrest + Siege Threat, and somebody walks
 *
 * At ten or over, the lowest-Tier survivor leaves. A tie is the **player's**
 * choice, because the book gives them that choice and inventing a tiebreak —
 * the first on the roster, the lowest Health, the most recently added — would
 * be this app making up a rule.
 *
 * A survivor at 0 Health can neither leave nor be chosen: they are in no state
 * to walk anywhere, and they have a Rot check of their own at the top of the
 * next Management Phase.
 *
 * ## Read live, never cached
 *
 * The threshold is computed from the campaign at the moment it is asked, and it
 * has to be: this step runs after Check the Horde, and a departure retroactively
 * unstaffs whatever the leaver was working and shrinks the project team — both
 * terms of the Siege Threat that step 6 just rolled against. A second departure
 * in the same step is therefore checked against a *different* number than the
 * first, which is the ordering trap this phase was warned about.
 *
 * Pure, like the rest of `src/engine`.
 */

import { DEPARTURE_THRESHOLD } from '../data/turn';
import type { Campaign, Survivor } from './campaign';
import { unrest } from './feeding';
import { siegeThreat } from './siege';

/** Unrest plus Siege Threat, which is the number the rule reads (pg. 23). */
export function departurePressure(campaign: Campaign): number {
  return unrest(campaign) + siegeThreat(campaign);
}

/** Whether somebody is leaving at all. */
export function someoneIsLeaving(campaign: Campaign): boolean {
  return departurePressure(campaign) >= DEPARTURE_THRESHOLD;
}

/**
 * Who could be the one to go: the lowest-Tier survivors still on their feet.
 *
 * More than one only where they tie, and that is the whole reason this returns
 * a list — the player picks between equals rather than the app deciding for
 * them. Empty when nobody is leaving, or when everybody left standing is at 0
 * Health.
 */
export function departureCandidates(campaign: Campaign): readonly Survivor[] {
  if (!someoneIsLeaving(campaign)) return [];

  const standing = campaign.survivors.filter((survivor) => survivor.currentHp > 0);
  const lowest = standing.reduce(
    (found, survivor) => Math.min(found, survivor.tier),
    Number.POSITIVE_INFINITY,
  );

  return standing.filter((survivor) => survivor.tier === lowest);
}

/**
 * The campaign with one survivor gone.
 *
 * Takes their assignment with them, the way every other removal has since
 * Z3-4 — a task keyed to nobody is exactly the orphan that survives a save and
 * breaks a screen three turns later. That is also what retroactively unstaffs
 * the facility they were working, which is the Siege Threat consequence this
 * module's note is about.
 */
export function withDeparture(campaign: Campaign, survivorId: string): Campaign {
  return {
    ...campaign,
    survivors: campaign.survivors.filter((survivor) => survivor.id !== survivorId),
    assignments: Object.fromEntries(
      Object.entries(campaign.assignments).filter(([id]) => id !== survivorId),
    ),
  };
}

/**
 * Whether somebody has already walked out this turn (pg. 23).
 *
 * The rule sends **one**: "the lowest-Tier survivor at the base leaves the
 * community." Nothing in the campaign says it has happened — a departure
 * lowers the pressure it was measured against, so re-deriving `someoneIsLeaving`
 * afterwards answers a different question than the step asked. Read off the
 * log, like every other destructive step in this phase.
 *
 * Reads `survivor-departed` rather than `survivor-left`, so a Rot death in the
 * same Management Phase does not read as a departure that already happened.
 */
export function someoneDeparted(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'survivor-departed',
  );
}
