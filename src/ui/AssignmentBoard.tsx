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
 * book's order. A step draws its lanes as places a card can go, on the right;
 * on the left are "Nothing to do", always there because every step draws from
 * it, and "Elsewhere", holding survivors with a task from another step, whose
 * cards can be picked up and moved here but which nothing can be moved into
 * (`Board.tsx` draws the two columns).
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
import { BoardCard, BoardColumns, CardRow, DropZone, LaneFrame, RefusedZone } from './Board';
import { BOARD_DROP } from './styles';

/** A place a card can go on this step. */
export interface Lane {
  /** The task a card moved here is given. */
  readonly task: Assignment;
  readonly name: string;
  readonly pages: number | string;
  /** What the lane says about itself, under its name: capacity, Labor. */
  readonly detail?: ReactNode;
  /** An anchor for a link that jumps to this lane, such as Getting started's (#238). */
  readonly id?: string;
}

export interface AssignmentBoardProps {
  readonly campaign: Campaign;
  /** This step's lanes, in the order the step lists them. */
  readonly lanes: readonly Lane[];
}

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
      <BoardCard
        key={survivor.id}
        title={survivor.name}
        lines={[
          `Tier ${String(survivor.tier)} · ${String(survivor.currentHp)}/${String(maxHp(survivor))} Health`,
          ...(label === undefined ? [] : [label]),
        ]}
        picked={isPicked}
        onPress={() => {
          setPicked(isPicked ? null : survivor.id);
        }}
      />
    );
  };

  /**
   * Where the picked card can go, and what moving it there would warn about.
   * The Planning Phase refuses one thing, a task the survivor's Story Trait
   * forbids (R93): that lane is grey, with the reason. Every other lane but the
   * card's own offers the move, and a warning shows in the zone before the
   * press.
   */
  const target = (task: Assignment | null) => {
    if (mover === undefined) return null;
    const current = taskOf(mover);
    const here =
      task === null ? current === undefined : current !== undefined && sameTask(current, task);
    if (here) return null;

    const check =
      task === null ? { blockers: [], warnings: [] } : checkAssignment(campaign, mover.id, task);
    if (check.blockers.length > 0) {
      return (
        <RefusedZone
          reasons={check.blockers.map((blocker) => ({
            key: blocker.code,
            message: blocker.message,
            pages: blocker.pages,
          }))}
        />
      );
    }

    const warnings = check.warnings;
    return (
      <DropZone
        warnings={warnings.map((warning) => ({
          key: warning.code,
          message: warning.message,
          pages: warning.pages,
        }))}
      >
        <button
          type="button"
          className={BOARD_DROP}
          onClick={() => {
            move(task);
          }}
        >
          Move {mover.name} here
        </button>
      </DropZone>
    );
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      {mover !== undefined && (
        <p role="status" className="text-sm font-medium">
          Choose where {mover.name} goes, or press {mover.name}’s card again to cancel.
        </p>
      )}

      <BoardColumns
        sourceTitle="Who’s free"
        targetTitle="This step"
        sources={
          <>
            <LaneFrame name="Nothing to do">
              <CardRow empty="Everybody has something to do.">
                {idle.map((survivor) => card(survivor))}
              </CardRow>
              {target(null)}
            </LaneFrame>

            {elsewhere.length > 0 && (
              <LaneFrame name="Elsewhere">
                <CardRow empty="">
                  {elsewhere.map((survivor) => {
                    const task = taskOf(survivor);
                    return card(survivor, task === undefined ? undefined : taskLabel(task));
                  })}
                </CardRow>
              </LaneFrame>
            )}
          </>
        }
        targets={lanes.map((lane) => {
          const members = inLane(lane);
          return (
            <LaneFrame
              key={`${lane.task.task}:${'slot' in lane.task ? lane.task.slot : ''}:${'team' in lane.task ? String(lane.task.team) : ''}`}
              name={lane.name}
              pages={lane.pages}
              {...(lane.id === undefined ? {} : { id: lane.id })}
            >
              {lane.detail}
              <CardRow empty="Nobody yet.">{members.map((member) => card(member))}</CardRow>
              {/* What is wrong with whoever is here now, from the same check. */}
              {members.flatMap((member) => {
                // A survivor already here whom a trait now forbids it (R93)
                // is said about too, though nothing moves them out.
                const check = checkAssignment(campaign, member.id, lane.task);
                return [...check.blockers, ...check.warnings].map((warning) => (
                  <p key={`${member.id}:${warning.code}`} className={`mt-1 ${WARNING}`}>
                    {member.name}: {warning.message} <PageRef pages={warning.pages} />
                  </p>
                ));
              })}
              {target(lane.task)}
            </LaneFrame>
          );
        })}
      />
    </div>
  );
}
