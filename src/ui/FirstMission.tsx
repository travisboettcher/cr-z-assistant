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
 */

import type { Campaign } from '../engine/campaign';
import { beforePlanning, missionTeam } from '../engine/assignments';
import { planningHasBegun } from '../engine/planning';
import { AssignTask } from './AssignTask';
import { PageRef } from './PageRef';

export function FirstMission({ campaign }: { readonly campaign: Campaign }) {
  /*
   * A record once turn 1's Planning Phase has begun, and a control before it.
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
  const chosen = planningHasBegun(campaign);

  return (
    <>
      <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
        The First Mission is played on turn 1, so its team is chosen here rather than in a Planning
        Phase that has not happened yet. Everyone who goes earns a point of XP, and their skills are
        what this turn’s haul can be forced with <PageRef pages="12, 18" />
      </p>

      {chosen ? (
        <p className="mt-3 text-sm">
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
          )}{' '}
          <span className="text-stone-600 dark:text-stone-400">
            This turn’s Planning Phase has begun, so the team is on the record and what is assigned
            now belongs to turn 2 <PageRef pages={20} />
          </span>
        </p>
      ) : (
        <AssignTask
          campaign={campaign}
          task={{ task: 'mission', team: 1 }}
          legend="On the First Mission"
          pages={75}
        />
      )}
    </>
  );
}
