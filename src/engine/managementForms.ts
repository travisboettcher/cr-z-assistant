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
import type { Campaign, Survivor } from './campaign';
import type { Injury } from '../data/traits';
import { injuryFate, rolledInjury, withInjuryGained, type InjuryFate } from './injuries';
import {
  departureCandidates,
  goingLost,
  someoneDeparted,
  withDeparture,
  withLost,
} from './departures';
import { foodRequired, hungerIfFedNow, survivorsFed, withSurvivorsFed } from './feeding';
import { accepted, blockedBy, refused, type FormResult, type Refused } from './forms';
import { logged } from './log';
import { withRareTradeLost } from './rareTrade';
import { withItemsLeftBehind } from './spent';
import {
  checkBite,
  checkInfectionBite,
  infectionBonus,
  infectionCheckResolved,
  infectionMustCheck,
  infectionOutcome,
  rotCheckResolved,
  rotOutcome,
  rotTarget,
  withRotApplied,
  type RotOutcome,
} from './rot';
import { hordeChecked, hordeForced, siegeThreat, siegeTriggered } from './siege';
import { overCap, storageChecked, withStorageChecked } from './storage';
import { projectTeamHumanityDue, withHumanityGained } from './humanity';

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

  /**
   * A Permanent Injury taken instead of turning, with the Toolkit's traits in
   * use (pg. 137; R86; Z7-11): the d10 on the table, and the injury chosen for
   * a 10. Absent to turn as usual.
   */
  readonly injury?: { readonly roll: D10Result; readonly chosen?: Injury };
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
 * Restraints holding them (pg. 69) or the bite, and the bitten survivor leaving
 * if it finishes them.
 */
export function submitRotCheck(campaign: Campaign, form: RotCheckForm, at: string): FormResult {
  if (rotCheckResolved(campaign, form.survivor)) {
    return refused('Their Rot check is already resolved this turn.');
  }

  const survivor = campaign.survivors.find((candidate) => candidate.id === form.survivor);
  if (survivor === undefined) return refused('Only somebody in the community makes a Rot check.');

  // An injury instead of turning (R86): what it gives, and what gaining it does.
  const instead = form.injury === undefined ? null : injuryInstead(campaign, survivor, form);
  if (instead !== null && 'ok' in instead) return instead;
  if (instead !== null && instead.fate !== 'turns') {
    return accepted(withInjuryTaken(campaign, survivor, form, instead, at));
  }

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
    ...(instead === null || form.injury === undefined
      ? {}
      : { injury: { roll: form.injury.roll, injury: instead.injury, fate: instead.fate } }),
  });

  return accepted(withTurningLogged(checked, outcome, at));
}

/**
 * The injury a failed Rot check is taken as (R86), and what gaining it does,
 * or why it can't be: with the Toolkit's traits in use, on a check that failed,
 * and a result the table gives an injury for.
 */
function injuryInstead(
  campaign: Campaign,
  survivor: Survivor,
  form: RotCheckForm,
): { readonly injury: Injury; readonly fate: InjuryFate } | Refused {
  if (!campaign.traitsEnabled) {
    return refused('Permanent Injuries come with the Toolkit’s survivor traits.');
  }
  if (rotOutcome(campaign, survivor.id, form.roll, form.bitten).turned === null) {
    return refused('They passed, so there’s no turning to take an injury instead of.');
  }

  const roll = form.injury?.roll as D10Result;
  const injury = rolledInjury(campaign.origin, roll, form.injury?.chosen);
  if (injury === null) {
    return refused(
      roll === 10 ? 'Choose the injury a 10 gives.' : 'A 4 with no origin is rolled again.',
    );
  }

  return { injury, fate: injuryFate(survivor, injury) };
}

/**
 * The campaign after a failed Rot check is taken as an injury that doesn't
 * turn them (R86): the injury gained, or, a third One-handed, the survivor
 * dead and their items left at the base. No bite: nobody turned.
 */
function withInjuryTaken(
  campaign: Campaign,
  survivor: Survivor,
  form: RotCheckForm,
  taken: { readonly injury: Injury; readonly fate: InjuryFate },
  at: string,
): Campaign {
  const injured =
    taken.fate === 'kills'
      ? withDeparture(campaign, survivor.id)
      : {
          ...campaign,
          survivors: campaign.survivors.map((one) =>
            one.id === survivor.id ? withInjuryGained(one, taken.injury) : one,
          ),
        };
  const checked = logged(injured, at, {
    kind: 'rot-checked',
    survivor: survivor.id,
    name: survivor.name,
    roll: form.roll,
    target: rotTarget(campaign),
    passed: false,
    injury: { roll: form.injury?.roll as D10Result, ...taken },
  });

  return taken.fate === 'kills'
    ? withItemsLeftBehind(
        logged(checked, at, {
          kind: 'survivor-left',
          survivor: survivor.id,
          name: survivor.name,
          tier: survivor.tier,
          cause: 'injury',
        }),
        [survivor],
        at,
      )
    : checked;
}

/**
 * Resolve one survivor's Infection check, under the Viral origin (pp. 22,
 * 123; R99, R100; Z7-5). The Rot check's form in every way but the roll's
 * target: their Infection, with the community's Medicine added. A failure
 * turns them, and writes what a failed Rot check writes.
 */
export function submitInfectionCheck(
  campaign: Campaign,
  form: RotCheckForm,
  at: string,
): FormResult {
  if (infectionCheckResolved(campaign, form.survivor)) {
    return refused('Their Infection check is already resolved this turn.');
  }

  const survivor = infectionMustCheck(campaign).find((candidate) => candidate.id === form.survivor);
  if (survivor === undefined) {
    return refused('Only a survivor carrying Infection, in a Viral campaign, makes this check.');
  }

  const biteProblem = blockedBy(
    checkInfectionBite(campaign, form.survivor, form.roll, form.bitten),
  );
  if (biteProblem !== null) return refused(biteProblem);

  const outcome = infectionOutcome(campaign, form.survivor, form.roll, form.bitten);

  const checked = logged(withRotApplied(campaign, outcome), at, {
    kind: 'infection-checked',
    survivor: survivor.id,
    name: survivor.name,
    roll: form.roll,
    infection: survivor.infection,
    bonus: infectionBonus(campaign),
    passed: outcome.turned === null,
  });

  return accepted(withTurningLogged(checked, outcome, at));
}

/**
 * A turning written down after its check (pg. 22): the survivor leaving; and
 * either the Restraints holding them (pg. 69) or the bite, and the bitten
 * survivor leaving if it finishes them. What anybody gone this way carried
 * stays at the base (R72, R74), written after the entries that took them off
 * the roster. Nothing for a check that held.
 */
function withTurningLogged(checked: Campaign, outcome: RotOutcome, at: string): Campaign {
  if (outcome.turned === null) return checked;

  const gone = [
    outcome.turned,
    ...(outcome.bitten?.dies === true ? [outcome.bitten.survivor] : []),
  ];
  const behind = (result: Campaign) => withItemsLeftBehind(result, gone, at);

  const turned = logged(checked, at, {
    kind: 'survivor-left',
    survivor: outcome.turned.id,
    name: outcome.turned.name,
    tier: outcome.turned.tier,
    cause: 'turned',
  });

  /*
   * A set of Restraints held them (pg. 69). Written down because
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
    return refused('Exhaustion isn’t above the mission team’s size this turn.');
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

  const checked = logged(campaign, at, { kind: 'horde-checked', roll, threat, siege });

  // A siege forces the next mission, so a Rare Items trade waiting on it is
  // lost here, with its materials (pg. 23; R59, R60).
  return accepted(siege ? withRareTradeLost(checked, at, 'siege') : checked);
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
  // The Madness departures come first, and the Unrest check reads what they leave (R106).
  if (goingLost(campaign).length > 0) return refused('Those going Lost to Madness leave first.');

  const leaving = departureCandidates(campaign).find((candidate) => candidate.id === survivor);
  if (leaving === undefined) return refused('Only somebody the rule sends away can leave.');

  // They take what they carry (R73), so nothing of theirs stays at the base.
  return accepted(
    logged(withDeparture(campaign, survivor), at, {
      kind: 'survivor-departed',
      survivor: leaving.id,
      name: leaving.name,
      tier: leaving.tier,
      ...(leaving.items.length === 0 ? {} : { items: leaving.items }),
    }),
  );
}

/**
 * Send everybody at 13 or more Madness away Lost, at Departures and before
 * the Unrest check (pp. 23, 124; R106, R107; Z7-7): onto the list of the Lost
 * with what they carry, a `survivor-lost` entry each.
 */
export function submitGoneLost(campaign: Campaign, at: string): FormResult {
  if (campaign.step !== 'departures') return refused('Survivors go Lost at Departures.');

  const lost = goingLost(campaign);
  if (lost.length === 0) return refused('Nobody here is going Lost to Madness.');

  return accepted(
    lost.reduce(
      (going, survivor) =>
        logged(going, at, {
          kind: 'survivor-lost',
          survivor: survivor.id,
          name: survivor.name,
          madness: survivor.madness,
          ...(survivor.items.length === 0 ? {} : { items: survivor.items }),
        }),
      withLost(campaign, lost),
    ),
  );
}

/**
 * The project team's 1 Humanity for this turn on it, at Management Step 1
 * (pg. 127; R114; Z7-9): everybody on it below 5, an entry each, once a turn.
 */
export function submitProjectHumanity(campaign: Campaign, at: string): FormResult {
  const due = projectTeamHumanityDue(campaign);
  if (due.length === 0) return refused('Nobody on the project team has Humanity to gain now.');

  return accepted(
    withHumanityGained(
      campaign,
      due.map((survivor) => survivor.id),
      'project-team',
      at,
    ),
  );
}
