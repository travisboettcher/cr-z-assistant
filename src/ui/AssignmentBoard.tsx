/**
 * The Planning Phase's assignments as a board: a lane per task, a card per
 * survivor (`docs/assignment-board.md`, B1; #237).
 *
 * **The board is the shape `assignments` already has.** Each survivor holds at
 * most one task (pg. 20), and that is structural rather than validated (Z3-4),
 * so a card is in exactly one lane and moving it is the only change there is.
 * Every move is the `assignment/set` or `assignment/cleared` the checkboxes it
 * replaces dispatched. Nothing about the data changes.
 *
 * **Press a card, then the lane it goes to.** A single pointer and the keyboard
 * do everything; dragging may come later on top, never instead (WCAG 2.2
 * "dragging movements"). Moving a card back puts its task back, which is what
 * unticking a checkbox never did, so the reasoning `AssignTask` gave for having
 * no override now holds: a warned move is undone by the move next to it.
 *
 * **Each step focuses its own lanes.** The four Planning steps stay, in the
 * book's order. A step draws its lanes as places a card can go; survivors with
 * a task from another step sit in "Elsewhere", where their cards can be picked
 * up and moved here but nothing can be moved in; and "Nothing to do" is always
 * there, because every step draws from it.
 *
 * **Warnings stay warnings** (Z3-6: no blockers). A lane says what is wrong
 * with the cards in it, and a picked card's warnings for a lane are shown at
 * that lane's Move button, which is the moment before the press.
 */

import { useState, type ReactNode } from 'react';
import type { Assignment, Campaign, Survivor } from '../engine/campaign';
import { sameTask } from '../engine/assignments';
import { checkAssignment } from '../engine/planning';
import { maxHp } from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { taskLabel } from './taskLabels';
import { FOCUS_RING, SECONDARY_FILL, TOUCH_TARGET } from './styles';

/** A place a card can go on this step. */
export interface Lane {
  /** The task a card moved here is given. */
  readonly task: Assignment;
  readonly name: string;
  readonly pages: number | string;
  /** What the lane says about itself, under its name: capacity, Labor. */
  readonly detail?: ReactNode;
}

export interface AssignmentBoardProps {
  readonly campaign: Campaign;
  /** This step's lanes, in the order the step lists them. */
  readonly lanes: readonly Lane[];
}

const CARD = `${TOUCH_TARGET} ${FOCUS_RING} flex flex-col items-start rounded-lg border px-3 py-1.5 text-left text-sm`;
const MOVE = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg px-3 py-1.5 text-sm font-medium ${SECONDARY_FILL}`;
const HINT = 'text-sm text-stone-600 dark:text-stone-400';
const WARNING = 'text-xs text-amber-700 dark:text-amber-300';

export function AssignmentBoard({ campaign, lanes }: AssignmentBoardProps) {
  const { dispatch } = useCampaign();
  const [picked, setPicked] = useState<string | null>(null);

  if (campaign.survivors.length === 0) {
    return <p className={`mt-3 ${HINT}`}>Nobody in the community yet.</p>;
  }

  const taskOf = (survivor: Survivor) => campaign.assignments[survivor.id];
  const inLane = (lane: Lane) =>
    campaign.survivors.filter((survivor) => {
      const task = taskOf(survivor);
      return task !== undefined && sameTask(task, lane.task);
    });
  const elsewhere = campaign.survivors.filter((survivor) => {
    const task = taskOf(survivor);
    return task !== undefined && !lanes.some((lane) => sameTask(task, lane.task));
  });
  const idle = campaign.survivors.filter((survivor) => taskOf(survivor) === undefined);

  // A picked survivor who has left the roster is nobody to move.
  const mover = campaign.survivors.find((survivor) => survivor.id === picked);

  function move(task: Assignment | null) {
    if (mover === undefined) return;
    dispatch(
      task === null
        ? { type: 'assignment/cleared', survivor: mover.id }
        : { type: 'assignment/set', survivor: mover.id, assignment: task },
    );
    setPicked(null);
  }

  const card = (survivor: Survivor, label?: string) => {
    const isPicked = survivor.id === mover?.id;
    return (
      <li key={survivor.id}>
        <button
          type="button"
          aria-pressed={isPicked}
          onClick={() => {
            setPicked(isPicked ? null : survivor.id);
          }}
          className={`${CARD} ${
            isPicked
              ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-600 dark:border-amber-400 dark:bg-amber-950/40 dark:ring-amber-400'
              : 'border-stone-300 bg-white enabled:hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:enabled:hover:bg-stone-800'
          }`}
        >
          <span className="font-medium">{survivor.name}</span>
          <span className="text-xs text-stone-600 tabular-nums dark:text-stone-400">
            Tier {survivor.tier} · {survivor.currentHp}/{maxHp(survivor)} Health
            {label !== undefined && <> · {label}</>}
          </span>
        </button>
      </li>
    );
  };

  /** Where the picked card can go, and what moving it there would break. */
  const target = (task: Assignment | null) => {
    if (mover === undefined) return null;
    const current = taskOf(mover);
    const here =
      task === null ? current === undefined : current !== undefined && sameTask(current, task);
    if (here) return null;

    const warnings = task === null ? [] : checkAssignment(campaign, mover.id, task).warnings;
    return (
      <div className="mt-2 flex flex-col items-start gap-1">
        <button
          type="button"
          className={MOVE}
          onClick={() => {
            move(task);
          }}
        >
          Move {mover.name} here
        </button>
        {warnings.map((warning) => (
          <p key={warning.code} className={WARNING}>
            {warning.message} <PageRef pages={warning.pages} />
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {mover !== undefined && (
        <p role="status" className="text-sm font-medium">
          Choose where {mover.name} goes, or press {mover.name}’s card again to cancel.
        </p>
      )}

      {lanes.map((lane) => {
        const members = inLane(lane);
        return (
          <LaneFrame
            key={`${lane.task.task}:${'slot' in lane.task ? lane.task.slot : ''}:${'team' in lane.task ? String(lane.task.team) : ''}`}
            name={lane.name}
            pages={lane.pages}
          >
            {lane.detail}
            {members.length === 0 ? (
              <p className={`mt-1 ${HINT}`}>Nobody yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">{members.map((member) => card(member))}</ul>
            )}
            {/* What is wrong with whoever is here now, from the same check. */}
            {members.flatMap((member) =>
              checkAssignment(campaign, member.id, lane.task).warnings.map((warning) => (
                <p key={`${member.id}:${warning.code}`} className={`mt-1 ${WARNING}`}>
                  {member.name}: {warning.message} <PageRef pages={warning.pages} />
                </p>
              )),
            )}
            {target(lane.task)}
          </LaneFrame>
        );
      })}

      {elsewhere.length > 0 && (
        <LaneFrame name="Elsewhere">
          <ul className="mt-2 flex flex-wrap gap-2">
            {elsewhere.map((survivor) => {
              const task = taskOf(survivor);
              return card(survivor, task === undefined ? undefined : taskLabel(task));
            })}
          </ul>
        </LaneFrame>
      )}

      <LaneFrame name="Nothing to do">
        {idle.length === 0 ? (
          <p className={`mt-1 ${HINT}`}>Everybody has something to do.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">{idle.map((survivor) => card(survivor))}</ul>
        )}
        {target(null)}
      </LaneFrame>
    </div>
  );
}

function LaneFrame({
  name,
  pages,
  children,
}: {
  readonly name: string;
  readonly pages?: number | string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-label={name}
      className="rounded-lg border border-stone-200 p-3 dark:border-stone-700"
    >
      <h3 className="text-sm font-semibold">
        {name} {pages !== undefined && <PageRef pages={pages} />}
      </h3>
      {children}
    </section>
  );
}
