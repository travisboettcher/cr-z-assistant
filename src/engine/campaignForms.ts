/**
 * The forms that belong to no single phase, each guard, change and entry in
 * one place (#179): walking the turn, claiming the first base, and the roster's
 * comings and goings.
 *
 * Moved out of `campaignStore.ts` without changing what any of them accepts or
 * refuses, or what any of them writes. The shape of what they return is
 * `forms.ts`'s.
 *
 * Pure, like the rest of `src/engine`: a new survivor's id, a recruit's roll
 * and the clock all arrive from the caller.
 */

import type { BaseId } from '../data/bases';
import type { D10Result } from '../data/dice';
import type { FieldRecruitTier } from '../data/recruitTable';
import type { Tier } from '../data/tiers';
import { withoutAssignment } from './assignments';
import { storageCaps } from './base';
import type { Campaign } from './campaign';
import { accepted, refused, type Accepted, type FormResult } from './forms';
import { logged } from './log';
import { FIRST_PLANNING_STEP, planningHasBegun, withPlanningReset } from './planning';
import { deployed } from './missions';
import { siegeDue } from './siege';
import { createSurvivor, recruitSurvivor } from './survivor';
import { advance, type AdvanceBy } from './turn';
import { suppliedOccupants } from './utilities';

/**
 * Move forward through the turn: one step, or on to the next phase.
 *
 * **Takes no destination.** The order of the turn is a rule and is read from
 * `turn.ts`, so a screen can offer the wrong button but cannot invent a turn
 * that runs Management before Planning. Off the end of the Management Phase,
 * this is what ends a turn. It cannot be refused.
 *
 * Moves, then records — so an entry lands in the phase or turn just entered
 * rather than the one left behind. What it records:
 *
 * - **Entering the Planning Phase** for the first time this turn clears last
 *   turn's tasks and utility points (pp. 20, 67) and writes `planning-began`
 *   with what it cleared, in place of `phase-entered`.
 * - **A new turn** writes `turn-began` and nothing else, though it enters a new
 *   phase as well: "turn 4 began" already says the Mission Phase is open, and
 *   two entries for one press would be the log narrating rather than recording.
 *   A turn the horde called a siege for adds `siege-fought`.
 * - **Any other new phase** writes `phase-entered`.
 * - **A move inside a phase** writes nothing — nineteen entries a turn for
 *   pressing Next is a history nobody can read.
 */
export function submitAdvance(campaign: Campaign, by: AdvanceBy, at: string): Accepted {
  const move = advance(campaign.step, by);
  const moved: Campaign = move.endsTurn
    ? { ...campaign, step: move.step, turn: campaign.turn + 1 }
    : { ...campaign, step: move.step };

  /*
   * Only once a turn. `planningHasBegun` reads the log for this turn's own
   * entry, so stepping back into the Advancement Phase and forward again lands
   * here a second time and changes nothing. The walk exists to let a table
   * correct itself, and a correction that destroyed the planning just done
   * would be the opposite of that.
   */
  if (move.step === FIRST_PLANNING_STEP && !planningHasBegun(moved)) {
    /*
     * The entry carries what it cleared. Everything the Advancement Phase reads
     * about the turn just played — who went on the mission, who staffed the
     * Kitchen, who was resting — lived only in `assignments`, and this is the
     * step that empties them. Skipping forward to Planning from an unfinished
     * Advancement step therefore destroyed the turn's own facts, and stepping
     * back showed a turn where nobody had done anything (issue #95). Written
     * here rather than read back from anywhere, because after this line the
     * only copy is gone.
     */
    return accepted(
      logged(withPlanningReset(moved), at, { kind: 'planning-began', cleared: moved.assignments }),
    );
  }

  if (move.endsTurn) {
    const begun = logged(moved, at, { kind: 'turn-began' });

    /*
     * A siege is a fact of the turn it is fought on, and the turn is where it
     * becomes one: `siegeDue` reads the previous turn's `horde-checked` entry,
     * so the answer is known the moment the turn opens and nothing later in the
     * walk announces it. Two sieges in a twenty-turn campaign left no trace at
     * all (#167).
     *
     * Written once, because a turn begins once — stepping back and forward
     * within the turn does not pass through here.
     */
    return accepted(
      siegeDue(begun)
        ? logged(begun, at, {
            kind: 'siege-fought',
            names: deployed(begun).map((survivor) => survivor.name),
          })
        : begun,
    );
  }

  if (move.entersPhase) return accepted(logged(moved, at, { kind: 'phase-entered' }));

  return accepted(moved);
}

/**
 * Claim a base for a community that has none, and stock it (pp. 19, 54).
 *
 * **Refused for a community that already has one.** Moving house is the Claim
 * a New Base mission, and it carries questions this has no answer for — what
 * Inventory comes along, and which Hero leaves when the new base's Tier caps
 * them lower (pg. 54). Those are Phase 4's. Replacing the base here would drop
 * every slot the player has built into, silently.
 *
 * **The first base arrives full.** A community that reaches one stocks every
 * capped material to its maximum; a *later* base starts with only what was
 * carried over, and that is Phase 4's too. It matters more than it sounds: a
 * starting community of ten Tier points eats six Food a turn against a Tier 1
 * cap of four, so beginning at zero rather than four changes the whole opening.
 *
 * The caps are the base's as it stands the moment it is claimed. Since #127
 * that is a question about the roster as well as the layout — a facility whose
 * Power is not backed does not raise a cap — so the occupants are resolved
 * against the campaign the claim produces rather than read off the layout
 * alone. Two entries: the claim, and then what it was stocked with, so found
 * materials have a source.
 */
export function submitBaseClaim(campaign: Campaign, base: BaseId, at: string): FormResult {
  if (campaign.base !== null) {
    return refused('This community already has a base; moving is a mission of its own.');
  }

  const claimed = { ...campaign, base: { id: base, slots: {} } };
  const caps = storageCaps(claimed.base, suppliedOccupants(claimed));

  return accepted(
    logged(
      logged({ ...claimed, materials: { ...campaign.materials, ...caps } }, at, {
        kind: 'base-claimed',
        base,
      }),
      at,
      { kind: 'base-stocked', ...caps },
    ),
  );
}

/**
 * Record whether the starting community is finished.
 *
 * A toggle rather than a one-way "done": it turns off a rule (pg. 13), and a
 * control that turns a rule off permanently on one misplaced thumb is a door
 * that should not close. Refused when it already says so, so a press that
 * changes nothing writes nothing.
 */
export function submitStartingCommunity(
  campaign: Campaign,
  built: boolean,
  at: string,
): FormResult {
  if (campaign.startingCommunityBuilt === built) {
    return refused(
      built
        ? 'The starting community is already marked finished.'
        : 'The starting community is already marked unfinished.',
    );
  }

  return accepted(
    logged({ ...campaign, startingCommunityBuilt: built }, at, {
      kind: 'starting-community-settled',
      built,
    }),
  );
}

/** Somebody joining the community as they were built (pg. 13). */
export interface NewSurvivorForm {
  /** A fresh id, made by the caller — the engine has no source of them. */
  readonly id: string;
  readonly name: string;
  readonly tier: Tier;
}

/** Add a survivor to the community. It cannot be refused. */
export function submitNewSurvivor(campaign: Campaign, form: NewSurvivorForm, at: string): Accepted {
  return accepted(
    logged(
      {
        ...campaign,
        survivors: [...campaign.survivors, createSurvivor(form.name, form.tier, { id: form.id })],
      },
      at,
      { kind: 'survivor-added', survivor: form.id, name: form.name, tier: form.tier },
    ),
  );
}

/** Somebody brought back from a mission (pg. 15). */
export interface RecruitForm {
  /** A fresh id, made by the caller. */
  readonly id: string;
  readonly name: string;
  readonly tier: FieldRecruitTier;

  /**
   * The d10 the table threw for their skill, or absent for a Rookie, whose
   * single skill is never randomly generated (pg. 7). The entry does not claim
   * a roll that was not made — the log cannot be edited, so a roll recorded
   * there is permanent whether or not it did anything.
   */
  readonly roll?: D10Result | undefined;
}

/**
 * Add a survivor brought back from a mission. It cannot be refused.
 *
 * **A recruit also settles the starting community.** A survivor found in the
 * field is proof the campaign is past building it: the ten-tier-level budget
 * is a rule about *building* one (pg. 13), and Rescue Strangers exists to grow
 * it past that (pg. 15). The playtest recruited through this app's own form and
 * was told the community "spends 11" — growth reported as an error. A second
 * entry rather than a quiet flag, and only when it changes: the switch is the
 * player's to throw, and one thrown on their behalf should say so where they
 * can see it.
 */
export function submitRecruit(campaign: Campaign, form: RecruitForm, at: string): Accepted {
  const recruited = logged(
    {
      ...campaign,
      survivors: [
        ...campaign.survivors,
        recruitSurvivor(form.name, form.tier, form.roll, { id: form.id }),
      ],
    },
    at,
    // Spread rather than `roll: form.roll`: `exactOptionalPropertyTypes` makes
    // a present-but-undefined `roll` a different thing from an absent one, and
    // only the absent one is true.
    {
      kind: 'survivor-recruited',
      survivor: form.id,
      name: form.name,
      tier: form.tier,
      ...(form.roll === undefined ? {} : { roll: form.roll }),
    },
  );

  return accepted(
    recruited.startingCommunityBuilt
      ? recruited
      : logged({ ...recruited, startingCommunityBuilt: true }, at, {
          kind: 'starting-community-settled',
          built: true,
        }),
  );
}

/**
 * Take a survivor off the roster, and their task with them.
 *
 * Reads the survivor before removing them, because the entry has to outlive the
 * roster: once they are gone their name is the only thing left to render, and
 * it is nowhere else in the campaign. Their task goes because an assignment
 * keyed by an id nobody holds is a damaged save — the kind of orphan that
 * survives a file and breaks a screen three turns later.
 */
export function submitRemoval(campaign: Campaign, survivor: string, at: string): FormResult {
  const leaving = campaign.survivors.find((candidate) => candidate.id === survivor);
  if (leaving === undefined) return refused('Only somebody in the community can leave it.');

  return accepted(
    logged(
      {
        ...campaign,
        survivors: campaign.survivors.filter((candidate) => candidate.id !== survivor),
        assignments: withoutAssignment(campaign.assignments, survivor),
      },
      at,
      { kind: 'survivor-left', survivor: leaving.id, name: leaving.name, tier: leaving.tier },
    ),
  );
}
