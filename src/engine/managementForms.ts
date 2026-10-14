/**
 * The Management Phase's forms (pp. 22–23), each guard, change and entry in one
 * place (#179).
 *
 * Six steps, in the book's order: the Rot check, Feed, Exhaustion, Check
 * Storage, Check the Horde and Departures. Every one of them is destructive or
 * rolls a die, and the walk can go back over every one of them — so every one
 * is guarded by an entry it writes, read back the next time the form is
 * submitted. That is why a change and its entry are never separated here: the
 * entry *is* the record that the step has run.
 *
 * Moved out of `campaignStore.ts` without changing what any of them accepts or
 * refuses. The shape of what they return is `forms.ts`'s.
 *
 * Pure, like the rest of `src/engine`: the roll is the table's and the clock is
 * the caller's.
 */

import type { D10Result } from '../data/dice';
import { ROT_BITE_DAMAGE } from '../data/turn';
import { missionTeam, missionTeamReduced, overworked, withoutAssignment } from './assignments';
import type { Campaign } from './campaign';
import { departureCandidates, someoneDeparted, withDeparture } from './departures';
import { foodRequired, hungerIfFedNow, survivorsFed, withSurvivorsFed } from './feeding';
import { accepted, blockedBy, refused, type FormResult } from './forms';
import { logged } from './log';
import { withItemsLeftBehind } from './spent';
import { checkBite, rotCheckResolved, rotOutcome, rotTarget, withRotApplied } from './rot';
import { hordeChecked, hordeForced, siegeThreat, siegeTriggered } from './siege';
import { overCap, storageChecked, withStorageChecked } from './storage';

/** One survivor's Rot check, as the table rolled it (pg. 22). */
export interface RotCheckForm {
  /** Who is checking. */
  readonly survivor: string;

  readonly roll: D10Result;

  /**
   * Who takes the bite if they turn, or `null` where nobody else is being
   * healed — the book does not say who is bitten when more than one is, so the
   * choice is the table's.
   */
  readonly bitten: string | null;
}

/**
 * Resolve one survivor's Rot check (pg. 22).
 *
 * Per survivor rather than per step: the step resolves a check for each
 * survivor at 0 Health, so "already done" is a question about a person. Not
 * otherwise guarded against repeats — a survivor who turns is removed, so a
 * second submission has nobody to check.
 *
 * The check itself is recorded whether it passed or failed: a step that only
 * wrote down the deaths would read as though nobody else had been in danger.
 * A failure then writes, in order, the survivor leaving; and either the
 * Restraints holding them (pg. 72) or the bite, and the bitten survivor leaving
 * if it finishes them.
 */
export function submitRotCheck(campaign: Campaign, form: RotCheckForm, at: string): FormResult {
  if (rotCheckResolved(campaign, form.survivor)) {
    return refused('Their Rot check is already resolved this turn.');
  }

  const survivor = campaign.survivors.find((candidate) => candidate.id === form.survivor);
  if (survivor === undefined) return refused('Only somebody in the community makes a Rot check.');

  // A turning that bites nobody when somebody is there to bite is half the
  // rule (pg. 22). Refused whole, check and all, rather than recorded without
  // the Damage: the roll stays on the form to be sent again with a name (#189).
  const biteProblem = blockedBy(checkBite(campaign, form.survivor, form.roll, form.bitten));
  if (biteProblem !== null) return refused(biteProblem);

  const outcome = rotOutcome(campaign, form.survivor, form.roll, form.bitten);

  const checked = logged(withRotApplied(campaign, outcome), at, {
    kind: 'rot-checked',
    survivor: survivor.id,
    name: survivor.name,
    roll: form.roll,
    target: rotTarget(campaign),
    passed: outcome.turned === null,
  });

  if (outcome.turned === null) return accepted(checked);

  // What a survivor gone this way carried stays at the base (Z5-5), written
  // after the entries that took them off the roster.
  const gone = [
    outcome.turned,
    ...(outcome.bitten?.dies === true ? [outcome.bitten.survivor] : []),
  ];
  const behind = (result: Campaign) => accepted(withItemsLeftBehind(result, gone, at));

  const turned = logged(checked, at, {
    kind: 'survivor-left',
    survivor: outcome.turned.id,
    name: outcome.turned.name,
    tier: outcome.turned.tier,
    cause: 'turned',
  });

  /*
   * A set of Restraints held them (pg. 72). Written down because
   * `restraintsFree` counts these back — a turn with two sets holds two
   * survivors and no more, and nothing else on the campaign remembers that the
   * first one was held.
   */
  if (outcome.restrained) {
    return behind(
      logged(turned, at, {
        kind: 'bite-restrained',
        survivor: outcome.turned.id,
        name: outcome.turned.name,
      }),
    );
  }

  if (outcome.bitten === null) return behind(turned);

  const bitten = logged(turned, at, {
    kind: 'survivor-bitten',
    survivor: outcome.bitten.survivor.id,
    name: outcome.bitten.survivor.name,
    damage: ROT_BITE_DAMAGE,
  });

  if (!outcome.bitten.dies) return behind(bitten);

  return behind(
    logged(bitten, at, {
      kind: 'survivor-left',
      survivor: outcome.bitten.survivor.id,
      name: outcome.bitten.survivor.name,
      tier: outcome.bitten.survivor.tier,
      cause: 'bitten',
    }),
  );
}

/**
 * Feed the community (pg. 22), once a turn.
 *
 * The entry is the only record of the Hunger: eating is destructive, so
 * afterwards nothing can recompute what was short. Both numbers are read off
 * the campaign *before* it eats, which is the moment they describe.
 */
export function submitFeeding(campaign: Campaign, at: string): FormResult {
  if (survivorsFed(campaign)) return refused('The community has already eaten this turn.');

  return accepted(
    logged(withSurvivorsFed(campaign), at, {
      kind: 'survivors-fed',
      required: foodRequired(campaign),
      hunger: hungerIfFedNow(campaign),
      // The head count at the moment of eating, because the penalty is fixed
      // here and held until the next Management Phase (pg. 22).
      population: campaign.survivors.length,
    }),
  );
}

/**
 * Take one survivor off the mission team, because Exhaustion is above its size
 * (pg. 23).
 *
 * One survivor, once, and only when `overworked` says the turn owes it.
 * Exhaustion does not fall when they come off the team, so without the record
 * the step offers the same removal until the team is empty — `overworked`
 * reads that record as well as the condition (#181). The two halves are told
 * apart here only so the refusal can say which; together they are exactly
 * `overworked`.
 *
 * Asked of *this* campaign rather than trusted from the screen, like a
 * departure.
 */
export function submitTeamReduction(campaign: Campaign, survivor: string, at: string): FormResult {
  if (missionTeamReduced(campaign)) {
    return refused('Exhaustion has already taken somebody off the mission team this turn.');
  }
  if (!overworked(campaign)) {
    return refused('Exhaustion is not above the mission team’s size this turn.');
  }

  const tired = missionTeam(campaign).find((candidate) => candidate.id === survivor);
  if (tired === undefined) return refused('Only somebody on the mission team can come off it.');

  return accepted(
    logged({ ...campaign, assignments: withoutAssignment(campaign.assignments, survivor) }, at, {
      kind: 'mission-team-reduced',
      survivor: tired.id,
      name: tired.name,
    }),
  );
}

/**
 * Lose whatever is over the base's caps (pg. 23), once a turn.
 *
 * The entry carries what was lost, measured before it goes: afterwards every
 * store is at or under its cap and the surplus is nowhere to be read.
 */
export function submitStorageCheck(campaign: Campaign, at: string): FormResult {
  if (storageChecked(campaign)) return refused('Storage has already been checked this turn.');

  return accepted(
    logged(withStorageChecked(campaign), at, { kind: 'storage-checked', ...overCap(campaign) }),
  );
}

/**
 * Roll against the horde (pg. 23), once a turn.
 *
 * Once, because a second roll is a second chance at a siege, and the walk
 * offers one every time a player steps back.
 *
 * A Thin the Herd that put everybody down makes the roll succeed on its own
 * (pg. 81) — `hordeForced`. The roll is still the table's, and still recorded.
 *
 * The entry is the whole record: a siege called on this turn is fought on the
 * next, which `siege.ts` works out from the turn stamped here. Nothing is
 * written onto the campaign, because a forward-dated field beside it destroyed
 * the previous siege's turn — and with it the Siege Threat term that Departures
 * reads two steps later.
 */
export function submitHordeCheck(campaign: Campaign, roll: D10Result, at: string): FormResult {
  if (hordeChecked(campaign)) return refused('The horde has already been checked this turn.');

  const threat = siegeThreat(campaign);
  const siege = hordeForced(campaign) || siegeTriggered(roll, threat);

  return accepted(logged(campaign, at, { kind: 'horde-checked', roll, threat, siege }));
}

/**
 * Send one survivor away (pg. 23), once a turn.
 *
 * Nothing in the campaign says a departure has happened — one lowers the very
 * pressure it was measured against, so re-deriving `someoneIsLeaving`
 * afterwards answers a different question. Hence the log, like every other step
 * here. Who goes is the player's choice between equals, asked of *this*
 * campaign's `departureCandidates` rather than trusted from the screen.
 */
export function submitDeparture(campaign: Campaign, survivor: string, at: string): FormResult {
  if (someoneDeparted(campaign)) return refused('Somebody has already left this turn.');

  const leaving = departureCandidates(campaign).find((candidate) => candidate.id === survivor);
  if (leaving === undefined) return refused('Only somebody the rule sends away can leave.');

  // What they carried stays at the base until part 3 rules otherwise (Z5-5).
  return accepted(
    withItemsLeftBehind(
      logged(withDeparture(campaign, survivor), at, {
        kind: 'survivor-departed',
        survivor: leaving.id,
        name: leaving.name,
        tier: leaving.tier,
      }),
      [leaving],
      at,
    ),
  );
}
