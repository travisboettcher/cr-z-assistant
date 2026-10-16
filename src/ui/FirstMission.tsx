/**
 * Who played the First Mission (pg. 75).
 *
 * **Turn 1 has no Planning Phase behind it, and that was a hole in the app
 * rather than in the rules.** A mission team is assigned in Planning Step 4 for
 * *next* turn's mission, so on turn 1 there is nobody assigned — and turn 1's
 * Advancement Phase said so out loud: "Nobody is on a mission team, so there is
 * no mission XP this turn." The First Mission is played on turn 1 by
 * definition, every survivor on it gains a point (pg. 18), and their combined
 * Rationing, Mechanics and Utilities Scores are the substitutions that turn's
 * haul can spend (pg. 12). All of it was silently zero (issue #116).
 *
 * So the team is recorded where the book chooses it: at the start, in the
 * Mission Phase, on turn 1 only. Every later turn's team was chosen in the
 * Planning Phase before it, and offering to choose it again here would be a
 * second place to answer a question the walk already asks once.
 *
 * It writes an ordinary `mission` assignment rather than anything of its own,
 * which is what makes the rest of Phase 3 work unchanged: XP pools,
 * substitutions and the Teaching pool are all reading the same field they read
 * on every other turn.
 *
 * **The team is a board, and a form until the mission is played**
 * (`docs/assignment-board.md`, B2; `docs/step-records.md`, R2; #236, #237).
 * Two lanes, the First Mission and Nothing to do, with the team's choice of
 * mission inside the First Mission's lane, so the team and what it plays are
 * in one place. Once its outcome is recorded (`missionPlayed`) the team is a
 * record, and changing it is a deliberate press behind a warning: mission XP
 * and the haul's substitutions read who went.
 */

import { useState } from 'react';
import type { Campaign } from '../engine/campaign';
import { beforePlanning, missionTeam } from '../engine/assignments';
import { firstBaseOwed } from '../engine/base';
import { missionPlayed, missionTeams } from '../engine/missions';
import { planningHasBegun } from '../engine/planning';
import { AssignmentBoard } from './AssignmentBoard';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { TeamChoice } from './SelectMission';
import { FOCUS_RING, SECONDARY_FILL, TOUCH_TARGET } from './styles';

/** The lane's anchor, for Getting started's link to it (#238). */
export const FIRST_MISSION_LANE = 'first-mission-team';

/** The First Mission is team 1's: turn 1 has no Planning Phase to split it. */
const TEAM = 1;

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg px-4 py-2 text-sm font-medium`;
const HINT = 'text-sm text-stone-600 dark:text-stone-400';

export function FirstMission({ campaign }: { readonly campaign: Campaign }) {
  const [changing, setChanging] = useState(false);

  /*
   * A record once turn 1's Planning Phase has begun, whatever else.
   *
   * The walk lets a player step back within a turn, so this panel outlived the
   * phase it belongs to — and by then it was wrong twice over. It showed
   * **nobody** on the First Mission, because Planning had cleared the
   * assignments it reads, while the Advancement Phase went on correctly naming
   * whoever went. And ticking a name wrote `{task: 'mission'}` into the
   * *current* turn: the survivor left the project team, taking Labor with them
   * after projects had been ordered against it, and joined turn 2's mission
   * team instead (#144).
   *
   * `beforePlanning` is the same reader the Advancement Phase uses, so what
   * this shows and what that awards XP for are one answer.
   */
  const recorded = missionTeam(beforePlanning(campaign));
  const planned = planningHasBegun(campaign);
  const played = missionPlayed(campaign, TEAM);
  const team = missionTeams(campaign).find((candidate) => candidate.team === TEAM);

  const went = (
    <>
      {recorded.length === 0 ? (
        <span className="text-stone-600 dark:text-stone-400">
          Nobody went on the First Mission.
        </span>
      ) : (
        <>
          <span className="font-medium">
            {recorded.map((survivor) => survivor.name).join(', ')}
          </span>{' '}
          <span className="text-stone-600 dark:text-stone-400">went on the First Mission.</span>
        </>
      )}
    </>
  );

  return (
    <>
      <p className={`mt-4 ${HINT}`}>
        The First Mission is played on turn 1, so its team is chosen here rather than in a Planning
        Phase that hasn’t happened yet. Everyone who goes earns a point of XP, and their skills are
        what this turn’s haul can be forced with <PageRef pages="12, 18" />
      </p>

      {planned ? (
        <p className="mt-3 text-sm">
          {went}{' '}
          <span className="text-stone-600 dark:text-stone-400">
            This turn’s Planning Phase has begun, so the team is on the record and what is assigned
            now belongs to turn 2 <PageRef pages={20} />
          </span>
        </p>
      ) : played && !changing ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm">
            {went} <PageRef pages={75} />
          </p>
          <button
            type="button"
            className={`${BUTTON} ${SECONDARY_FILL}`}
            onClick={() => {
              setChanging(true);
            }}
          >
            Change who went
          </button>
          {/*
           * The claim, offered where the mission that wins it was played. It
           * was offered in amber from the start of turn 1 and never once it
           * was due, so a won First Mission left the walk owing a base with
           * nothing on the step to claim it (#238). The same `firstBaseOwed`
           * that `outstanding` owes here.
           */}
          {firstBaseOwed(campaign) && (
            <div className="mt-2 flex flex-col items-start gap-2">
              <p className="text-sm font-medium">
                The First Mission is played, so claim your base. It arrives stocked to its caps{' '}
                <PageRef pages="19, 54, 76–77" />
              </p>
              <OpenPanel panel="base" look="primary">
                Claim your base
              </OpenPanel>
            </div>
          )}
        </div>
      ) : (
        <>
          {played && (
            <div className="mt-3 flex flex-col items-start gap-2">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                The First Mission is played. Who went is what its mission XP and this turn’s
                substitutions read, and points already handed out stay handed out{' '}
                <PageRef pages="12, 18" />
              </p>
              <button
                type="button"
                className={`${BUTTON} ${SECONDARY_FILL}`}
                onClick={() => {
                  setChanging(false);
                }}
              >
                Keep this team
              </button>
            </div>
          )}
          <AssignmentBoard
            campaign={campaign}
            lanes={[
              {
                task: { task: 'mission', team: TEAM },
                name: 'On the First Mission',
                id: FIRST_MISSION_LANE,
                pages: 75,
                /*
                 * What the team plays, with the team: Select Mission's choice,
                 * a form until it is recorded and then a record (R1). Only at
                 * Select Mission, the step that chooses it.
                 */
                detail:
                  campaign.step === 'select-mission' && team !== undefined ? (
                    <TeamChoice
                      key={`${String(campaign.turn)}-${String(TEAM)}`}
                      campaign={campaign}
                      team={team}
                    />
                  ) : undefined,
              },
            ]}
          />
        </>
      )}
    </>
  );
}
