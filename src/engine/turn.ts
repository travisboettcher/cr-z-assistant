/**
 * Walking the campaign turn — where you are, and where "next" goes.
 *
 * The turn's shape is rules and lives in `src/data/turn.ts`. This is the part
 * that is not a rule: given a step, which step follows it, whether that crosses
 * into a new phase, and whether it ends the turn. Pure functions over an id.
 *
 * ## A campaign stores its step, and its phase is derived
 *
 * `Campaign.phase` was a stored field from Phase 0 until this story replaced it
 * with `Campaign.step`. Storing both would be a redundant pair that can
 * disagree — a step belongs to exactly one phase, so the phase is a lookup, and
 * **derived is never stored**.
 *
 * Storing the *step* rather than the phase is not extra fidelity for its own
 * sake. The Management Phase applies seven consequences in order, and three of
 * them are destructive: Check for Rot removes survivors, Feed subtracts Food,
 * Check Storage destroys the surplus. A campaign that resumed at "somewhere in
 * the Management Phase" after a closed tab would have no way to know which of
 * those had already happened, and doing one twice costs a player their
 * community.
 *
 * ## Forward in order, back one step at a time
 *
 * There is no way to ask for a phase by name. `advance` takes the step you are
 * on and hands back the next one, so the order lives here rather than in
 * whichever screen dispatched — a screen can offer the wrong button, but it
 * cannot invent a turn that runs Management before Planning.
 *
 * Backwards exists because tables correct themselves: somebody presses Next
 * twice and needs to be where they were. It stops at the first step of the
 * turn, and deliberately does not reach back into the previous one — the turn
 * that ended took materials, Health and sometimes survivors with it, and
 * "back" cannot put those back. Undoing is Phase 8's, and it will be a thing
 * the log records rather than a thing the walk does quietly.
 */

import { CAMPAIGN_PHASES, TURN_STEPS, type CampaignPhase, type TurnStepId } from '../data/turn';

/**
 * Every step of the turn, in order, flattened out of the per-phase lists.
 *
 * Derived from `TURN_STEPS` at module load rather than written out again: two
 * copies of nineteen ids in the order they run is one copy too many, and the
 * one that would go stale is this one.
 */
export const TURN_SEQUENCE: readonly TurnStepId[] = CAMPAIGN_PHASES.flatMap((phase) =>
  TURN_STEPS[phase].map((step) => step.id as TurnStepId),
);

/**
 * Which phase a step belongs to.
 *
 * Built once as a lookup rather than scanning the four lists per call, because
 * every screen asks this on every render — the header, the walk, and every log
 * entry as it is stamped.
 */
const PHASE_OF: ReadonlyMap<TurnStepId, CampaignPhase> = new Map(
  CAMPAIGN_PHASES.flatMap((phase) =>
    TURN_STEPS[phase].map((step) => [step.id as TurnStepId, phase] as const),
  ),
);

export function phaseOf(step: TurnStepId): CampaignPhase {
  // Non-null because `TurnStepId` is derived from the same table this map is,
  // so a step that is not in it is unrepresentable rather than merely unlikely.
  return PHASE_OF.get(step) as CampaignPhase;
}

/** The step a turn opens on: the first step of the Mission Phase (pg. 17). */
export const FIRST_STEP_OF_TURN: TurnStepId = TURN_SEQUENCE[0] as TurnStepId;

/** How far along the turn a step is, counted from zero. */
export function positionOf(step: TurnStepId): number {
  return TURN_SEQUENCE.indexOf(step);
}

/**
 * How the walk may move forward.
 *
 * `'step'` is one step. `'phase'` skips whatever is left of the phase you are
 * in and opens the next one — the same direction, further along, because a
 * table that has finished the Planning Phase in one conversation should not
 * have to press Next four times to say so.
 */
export type AdvanceBy = 'step' | 'phase';

/** Where a move lands, and what it crosses on the way. */
export interface Advance {
  readonly step: TurnStepId;

  /**
   * Whether this move ends the turn and begins the next.
   *
   * True only off the end of the Management Phase. The caller increments the
   * turn — this module knows the turn's *shape*, not its number.
   */
  readonly endsTurn: boolean;

  /** Whether this move lands in a different phase than it started in. */
  readonly entersPhase: boolean;
}

/**
 * The move forward from `step`.
 *
 * Wrapping off the end of the last phase is what ending a turn *is*, so it is
 * one branch here rather than a special case every caller has to remember.
 */
export function advance(step: TurnStepId, by: AdvanceBy): Advance {
  const landing = by === 'step' ? afterStep(step) : afterPhase(step);

  return {
    step: landing,
    endsTurn: landing === FIRST_STEP_OF_TURN,
    entersPhase: phaseOf(landing) !== phaseOf(step),
  };
}

/** The next step in the sequence, wrapping to the start of the next turn. */
function afterStep(step: TurnStepId): TurnStepId {
  const next = positionOf(step) + 1;

  return next < TURN_SEQUENCE.length ? (TURN_SEQUENCE[next] as TurnStepId) : FIRST_STEP_OF_TURN;
}

/** The first step of the phase after this one, wrapping the same way. */
function afterPhase(step: TurnStepId): TurnStepId {
  const next = CAMPAIGN_PHASES.indexOf(phaseOf(step)) + 1;

  return next < CAMPAIGN_PHASES.length
    ? (TURN_STEPS[CAMPAIGN_PHASES[next] as CampaignPhase][0].id as TurnStepId)
    : FIRST_STEP_OF_TURN;
}

/**
 * The step before this one, or `null` at the first step of the turn.
 *
 * `null` rather than wrapping, and that asymmetry with `advance` is the point:
 * forward off the end of a turn is a turn ending, which is a real thing that
 * happens. Backward off the start would be a turn *un*-ending, which is not.
 */
export function reverse(step: TurnStepId): TurnStepId | null {
  const previous = positionOf(step) - 1;

  return previous >= 0 ? (TURN_SEQUENCE[previous] as TurnStepId) : null;
}
