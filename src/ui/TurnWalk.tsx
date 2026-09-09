/**
 * Where the campaign is in the turn, and the three moves that lead off it.
 *
 * The frame four later stories fill in — see `docs/turn-walk-interaction.md`,
 * written with this story rather than after it, for why the model is *one
 * position, three moves* and why the campaign stores a step rather than a
 * phase.
 *
 * Three bands, in decreasing permanence: the four phases as orientation, this
 * phase's steps as progress, and the current step with its controls. Nothing in
 * the first two bands is clickable — the turn runs in order, and a strip of
 * phases that looks tappable and refuses is worse than one that plainly is not.
 */

import { useRef } from 'react';
import { CAMPAIGN_PHASES, TURN_STEPS, type TurnStepId } from '../data/turn';
import type { Campaign } from '../engine/campaign';
import { advance, phaseOf, positionOf, reverse } from '../engine/turn';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { PHASE_LABELS, STEP_LABELS } from './turnLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface TurnWalkProps {
  readonly campaign: Campaign;
}

const BUTTON = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg px-4 py-2 font-medium`;

export function TurnWalk({ campaign }: TurnWalkProps) {
  const { dispatch } = useCampaign();
  const endTurnRef = useRef<HTMLDialogElement>(null);

  const phase = phaseOf(campaign.step);
  const steps = TURN_STEPS[phase];
  const here = positionOf(campaign.step);

  const byStep = advance(campaign.step, 'step');
  const byPhase = advance(campaign.step, 'phase');
  const back = reverse(campaign.step);

  const step = steps.find((candidate) => candidate.id === campaign.step);

  function move(by: 'step' | 'phase') {
    dispatch({ type: 'turn/advanced', by, at: new Date().toISOString() });
  }

  /**
   * The one move that asks first. Everything else is a press away from being
   * undone by the press next to it; ending a turn is not, because the turn that
   * ended took materials, Health and sometimes survivors with it.
   */
  function endTurn(by: 'step' | 'phase') {
    endTurnRef.current?.close();
    move(by);
  }

  return (
    <section
      id="turn"
      aria-labelledby="turn-walk-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="turn-walk-heading" className="text-xl font-semibold">
        Turn {campaign.turn}
      </h2>

      {/* Band one: orientation. A list rather than buttons, because the turn
          runs in order and there is nothing here to press. */}
      <ol className="mt-4 flex gap-2 overflow-x-auto text-sm">
        {CAMPAIGN_PHASES.map((candidate) => (
          <li
            key={candidate}
            aria-current={candidate === phase ? 'step' : undefined}
            className={`rounded-lg px-3 py-1 whitespace-nowrap ${
              candidate === phase
                ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            {PHASE_LABELS[candidate]}
          </li>
        ))}
      </ol>

      {/* Band two: how much of this phase is left. */}
      <ol className="mt-5 flex flex-col gap-1">
        {steps.map((candidate) => {
          const at = positionOf(candidate.id as TurnStepId);
          const done = at < here;
          const current = at === here;

          return (
            <li
              key={candidate.id}
              aria-current={current ? 'step' : undefined}
              className={`flex items-baseline gap-3 rounded-lg px-3 py-1.5 ${
                current
                  ? 'bg-stone-100 font-semibold dark:bg-stone-800'
                  : done
                    ? 'text-stone-400 dark:text-stone-500'
                    : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {/*
               * The tick is decorative: "done" is already in the styling and in
               * the reading order, and a screen reader announcing "check mark"
               * before every finished step is nineteen interruptions a turn.
               */}
              <span aria-hidden="true" className="w-4 shrink-0 text-center">
                {done ? '✓' : current ? '▸' : ''}
              </span>
              <span className="grow">{STEP_LABELS[candidate.id as TurnStepId]}</span>
              {current && <PageRef pages={candidate.pages} />}
            </li>
          );
        })}
      </ol>

      {/* Band three: this step, and the moves. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`${BUTTON} bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
          onClick={() => {
            if (byStep.endsTurn) endTurnRef.current?.showModal();
            else move('step');
          }}
        >
          {byStep.endsTurn ? `End turn ${campaign.turn}` : `Next: ${STEP_LABELS[byStep.step]}`}
        </button>

        {/*
         * Hidden when the next step is already the next phase, because a
         * "Skip to Planning" beside a "Next: Assign Facility Staff" that does
         * the identical thing is two buttons for one move.
         */}
        {byPhase.step !== byStep.step && (
          <button
            type="button"
            className={`${BUTTON} border border-stone-300 hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            onClick={() => {
              if (byPhase.endsTurn) endTurnRef.current?.showModal();
              else move('phase');
            }}
          >
            {byPhase.endsTurn
              ? `End turn ${campaign.turn}`
              : `Skip to ${PHASE_LABELS[phaseOf(byPhase.step)]}`}
          </button>
        )}

        <button
          type="button"
          disabled={back === null}
          className={`${BUTTON} text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-400 dark:hover:bg-stone-800`}
          onClick={() => {
            dispatch({ type: 'turn/reversed' });
          }}
        >
          {/*
           * Named for where it goes, not "Back": at the top of the Management
           * Phase, "Back" and "Back to Assign Mission Team" are the difference
           * between a guess and a decision.
           */}
          {back === null ? 'Back' : `Back to ${STEP_LABELS[back]}`}
        </button>
      </div>

      {step !== undefined && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
          This step is not built yet — work it on paper and move on when the table has.{' '}
          <PageRef pages={step.pages} />
        </p>
      )}

      <dialog
        ref={endTurnRef}
        aria-labelledby="end-turn-heading"
        className="m-auto max-w-md rounded-xl border border-stone-200 bg-white p-6 text-stone-900 backdrop:bg-stone-900/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
      >
        <h3 id="end-turn-heading" className="text-lg font-semibold">
          End turn {campaign.turn}?
        </h3>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          Turn {campaign.turn + 1} starts at the Mission Phase. You can step back within a turn, but
          not into the one before it.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className={`${BUTTON} bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
            onClick={() => {
              endTurn(byStep.endsTurn ? 'step' : 'phase');
            }}
          >
            End turn {campaign.turn}
          </button>
          <button
            type="button"
            className={`${BUTTON} border border-stone-300 hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            onClick={() => {
              endTurnRef.current?.close();
            }}
          >
            Stay on this turn
          </button>
        </div>
      </dialog>
    </section>
  );
}
