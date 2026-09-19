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
import { AdvancementPhase } from './AdvancementPhase';
import { FirstMission } from './FirstMission';
import { ManagementPhase } from './ManagementPhase';
import { PlanningPhase } from './PlanningPhase';
import { FIRST_TURN, siegeDue } from '../engine/siege';
import { outstanding } from '../engine/outstanding';
import { laborShortfall } from '../engine/projects';
import { materialsAdded } from '../engine/materials';
import { clearPendingRolls, readPendingRolls } from '../persistence/pendingRolls';
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

  /*
   * What the turn still owes, asked once and read three times: the progress
   * list, the banner and the End-turn dialog are three views of one answer, and
   * three readers computing it separately is how the shortfall came to be
   * visible from the Departures step and nowhere else (#147).
   */
  const owed = outstanding(campaign);
  const owedHere = (id: TurnStepId) => owed.filter((entry) => entry.step === id);

  /*
   * Dice typed in and never committed. Not a fact about the campaign — they are
   * a die on a table until Add Materials takes them — so this is the one thing
   * the dialog asks the browser rather than the engine. It is what the playtest
   * actually lost: seven rolls worth 8 Food, entered, skipped past, and gone at
   * the turn boundary with the walk showing the step complete (#149).
   */
  const entered = readPendingRolls(campaign.id, campaign.turn).length;

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
    // The turn that owned them is over, and they are stamped with it, so they
    // could never be read again — but an orphaned key nothing clears is a thing
    // a later reader has to reason about (#149).
    clearPendingRolls();
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
          const current = at === here;
          /*
           * Behind the cursor *and* nothing left to do there. The tick used to
           * be the first half alone, which is a different fact and reads as the
           * stronger one: a skipped Add Materials showed ✓ and the turn went on
           * as though it had run (#149).
           */
          const missed = owedHere(candidate.id as TurnStepId);
          const done = at < here && missed.length === 0;
          const skipped = at < here && missed.length > 0;

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
                {done ? '✓' : skipped ? '!' : current ? '▸' : ''}
              </span>
              <span className="grow">{STEP_LABELS[candidate.id as TurnStepId]}</span>
              {/*
               * Words rather than a mark. The tick can be decorative because
               * "done" is in the styling and in the reading order; "passed and
               * not resolved" is in neither, so a screen reader would hear the
               * same list a player reading it can see is wrong.
               */}
              {skipped && (
                <span className="shrink-0 text-xs font-medium text-amber-800 dark:text-amber-300">
                  not resolved
                </span>
              )}
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

      {/*
       * What this step is *for*, below the controls that move off it. The frame
       * was drawn before its contents on purpose — see
       * `docs/turn-walk-interaction.md` — and this is where the four stories
       * that fill it hang their screens.
       */}
      {/* Which steps this covers is the phase they are in, which the engine
          already answers — a list of the four here would be a second copy of
          `TURN_STEPS.planning` waiting to disagree with the first. */}
      {phase === 'planning' ? (
        <PlanningPhase campaign={campaign} step={campaign.step} />
      ) : phase === 'advancement' ? (
        <AdvancementPhase campaign={campaign} step={campaign.step} />
      ) : phase === 'management' ? (
        <>
          {/*
           * Above the step's own panel, so it is on screen at every step of the
           * phase rather than only at the one that offers the choice. The
           * shortfall was reported in the Departures step alone, while End turn
           * is offered from all seven (#147).
           */}
          {laborShortfall(campaign) > 0 && (
            <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-300">
              This turn is <span className="tabular-nums">{laborShortfall(campaign)}</span> Labor
              short of what it ordered. A project goes unfinished, and the choice is in Departures{' '}
              <PageRef pages={23} />
            </p>
          )}
          <ManagementPhase campaign={campaign} step={campaign.step} />
        </>
      ) : (
        step !== undefined && (
          <>
            {/*
             * The one thing the Mission Phase knows about itself before Phase 4
             * builds it: the horde called, and this turn's mission is not the
             * player's to choose (pg. 23). Shown here rather than kept for the
             * screen that does not exist yet, because a player walking into
             * turn N+1 needs to know before they pick up the mission deck.
             */}
            {phase === 'mission' && siegeDue(campaign) && (
              <p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-300">
                The horde came. This turn’s mission is a Siege Defense <PageRef pages={23} />
              </p>
            )}

            {/*
             * The second thing the Mission Phase knows, and only on turn 1:
             * nothing has assigned a mission team yet, because the phase that
             * does runs at the end of a turn for the turn after it. Ahead of
             * Phase 4 building this phase properly, because the whole of turn
             * 1's Advancement Phase is wrong without it — see `FirstMission`.
             */}
            {phase === 'mission' && campaign.turn === FIRST_TURN && (
              <FirstMission campaign={campaign} />
            )}

            <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
              This step is not built yet — work it on paper and move on when the table has.{' '}
              <PageRef pages={step.pages} />
            </p>
          </>
        )
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

        {/*
         * What the turn would take with it, named. The dialog warned about
         * nothing at all, so a skipped step and an outstanding Labor shortfall
         * both left by the same door as everything the turn did properly
         * (#147, #149).
         *
         * It still ends the turn. A table may have done a step on paper, or
         * decided a project simply goes unbuilt, and refusing would be this app
         * overruling the people playing it — Z3-6 guides rather than blocks.
         * Saying it out loud is the whole of what was missing.
         */}
        {owed.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 p-3 dark:border-amber-700">
            <p className="text-sm font-medium">This turn has not finished with:</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
              {owed.map((entry) => (
                <li key={`${entry.step}:${entry.says}`}>
                  <span className="font-medium">{STEP_LABELS[entry.step]}</span> — {entry.says}
                </li>
              ))}
            </ul>
            {entered > 0 && !materialsAdded(campaign) && (
              <p className="mt-2 text-sm">
                <span className="font-medium tabular-nums">{entered}</span> entered roll
                {entered === 1 ? '' : 's'} would go with it.
              </p>
            )}
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              Ending the turn leaves all of it undone <PageRef pages={17} />
            </p>
          </div>
        )}
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
