import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PHASES, TURN_STEPS, type CampaignPhase, type TurnStepId } from '../data/turn';
import { FIRST_STEP_OF_TURN, TURN_SEQUENCE, advance, phaseOf, positionOf, reverse } from './turn';

const LAST_STEP = TURN_SEQUENCE[TURN_SEQUENCE.length - 1] as TurnStepId;

/** The step each phase opens on, which is where `advance(_, 'phase')` lands. */
function firstStepOf(phase: CampaignPhase): TurnStepId {
  return TURN_STEPS[phase][0].id as TurnStepId;
}

describe('TURN_SEQUENCE', () => {
  it('holds every step of every phase, in the order the turn runs them', () => {
    expect(TURN_SEQUENCE).toEqual(
      CAMPAIGN_PHASES.flatMap((phase) => TURN_STEPS[phase].map((step) => step.id)),
    );
  });

  it('names each step once', () => {
    expect(new Set(TURN_SEQUENCE).size).toBe(TURN_SEQUENCE.length);
  });

  it('runs nineteen steps, opening on Select Mission and closing on Departures', () => {
    // Pinned by value as well as by shape. The count and the two ends are what
    // every other test here is relative to, so a transcription that lost a step
    // would otherwise shift them all together and stay self-consistent.
    expect(TURN_SEQUENCE).toHaveLength(19);
    expect(FIRST_STEP_OF_TURN).toBe('select-mission');
    expect(LAST_STEP).toBe('departures');
  });
});

describe('phaseOf', () => {
  it('puts every step in the phase that lists it', () => {
    for (const phase of CAMPAIGN_PHASES) {
      for (const step of TURN_STEPS[phase]) {
        expect(phaseOf(step.id as TurnStepId)).toBe(phase);
      }
    }
  });

  it('gives the four phases in turn order as the sequence is walked', () => {
    // Not just "every step has a phase" — that the phases arrive in order and
    // never come back. A lookup built from the wrong list would still answer
    // every step and fail here.
    const seen: CampaignPhase[] = [];
    for (const step of TURN_SEQUENCE) {
      const phase = phaseOf(step);
      if (seen[seen.length - 1] !== phase) seen.push(phase);
    }

    expect(seen).toEqual([...CAMPAIGN_PHASES]);
  });
});

describe('positionOf', () => {
  it('counts from zero, in sequence order', () => {
    expect(positionOf(FIRST_STEP_OF_TURN)).toBe(0);
    expect(positionOf(LAST_STEP)).toBe(TURN_SEQUENCE.length - 1);
    expect(positionOf('assign-beds')).toBe(TURN_SEQUENCE.indexOf('assign-beds'));
  });
});

describe('advance, one step at a time', () => {
  it('walks the whole turn in order and wraps to the start', () => {
    const walked = TURN_SEQUENCE.map((step) => advance(step, 'step').step);

    expect(walked).toEqual([...TURN_SEQUENCE.slice(1), FIRST_STEP_OF_TURN]);
  });

  it('ends the turn off the last step, and only there', () => {
    for (const step of TURN_SEQUENCE) {
      expect(advance(step, 'step').endsTurn).toBe(step === LAST_STEP);
    }
  });

  it('enters a phase exactly where the phases change', () => {
    // Every last-step-of-a-phase crosses, and nothing else does. Asserted as
    // the set of crossings rather than a count, because a function that
    // reported the wrong three would still report three.
    const crossings = TURN_SEQUENCE.filter((step) => advance(step, 'step').entersPhase);

    expect(crossings).toEqual(
      CAMPAIGN_PHASES.map((phase) => {
        const steps = TURN_STEPS[phase];
        return steps[steps.length - 1]?.id;
      }),
    );
  });
});

describe('advance, a phase at a time', () => {
  it('lands on the first step of the next phase, from anywhere in this one', () => {
    for (const [index, phase] of CAMPAIGN_PHASES.entries()) {
      const next = CAMPAIGN_PHASES[index + 1];
      const expected = next === undefined ? FIRST_STEP_OF_TURN : firstStepOf(next);

      for (const step of TURN_STEPS[phase]) {
        expect(advance(step.id as TurnStepId, 'phase').step).toBe(expected);
      }
    }
  });

  it('always crosses into a different phase', () => {
    for (const step of TURN_SEQUENCE) {
      expect(advance(step, 'phase').entersPhase).toBe(true);
    }
  });

  it('ends the turn from anywhere in the Management Phase, and nowhere else', () => {
    for (const step of TURN_SEQUENCE) {
      expect(advance(step, 'phase').endsTurn).toBe(phaseOf(step) === 'management');
    }
  });

  it('is the same move as one step when the next step is already the next phase', () => {
    // The case the walk hides its skip button for: on the last step of a phase,
    // "next step" and "next phase" are one move under two names.
    for (const phase of CAMPAIGN_PHASES) {
      const steps = TURN_STEPS[phase];
      const last = steps[steps.length - 1]?.id as TurnStepId;

      expect(advance(last, 'phase')).toEqual(advance(last, 'step'));
    }
  });
});

describe('reverse', () => {
  it('undoes a step forward, everywhere inside a turn', () => {
    for (const step of TURN_SEQUENCE) {
      if (step === LAST_STEP) continue;

      expect(reverse(advance(step, 'step').step)).toBe(step);
    }
  });

  it('stops at the first step of the turn rather than reaching into the one before', () => {
    // The asymmetry with `advance`, which wraps. Forward off the end is a turn
    // ending, which happens; backward off the start would be a turn un-ending,
    // which does not.
    expect(reverse(FIRST_STEP_OF_TURN)).toBeNull();
  });

  it('gives a step for every other position', () => {
    const nulls = TURN_SEQUENCE.filter((step) => reverse(step) === null);

    expect(nulls).toEqual([FIRST_STEP_OF_TURN]);
  });
});
