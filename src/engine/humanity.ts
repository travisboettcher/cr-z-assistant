/**
 * Humanity's gains between missions (pg. 127; R114; Z7-9).
 *
 * Two raise it by 1, never past 5, or Touched's 4 (pg. 140): a turn on the project team, taken at
 * Management Step 1 of that turn, and healing from 0 to 1 Health, wherever
 * that happens (Heal Wounds, a Veteran's healing). A mission's own changes come
 * with its outcome (`woundsProblem`), and 0 there is the Veil.
 *
 * A `humanity-gained` entry each, which is also how the project team's gain
 * is known to have been taken this turn.
 *
 * Pure, like the rest of `src/engine`.
 */

import { projectTeam } from './assignments';
import { humanityMax } from './injuries';
import type { Campaign, Survivor } from './campaign';
import { logged } from './log';
import { phaseOf } from './turn';

export type HumanityGain = 'project-team' | 'healed-from-0';

/** Whether the project team's Humanity has been taken this turn. */
function projectTeamGained(campaign: Campaign): boolean {
  return campaign.log.some(
    ({ turn, event }) =>
      turn === campaign.turn && event.kind === 'humanity-gained' && event.reason === 'project-team',
  );
}

/**
 * Who gains 1 Humanity for this turn on the project team (R114): in a Magic
 * campaign's Management Phase, anybody on it below 5, until it is taken.
 */
export function projectTeamHumanityDue(campaign: Campaign): readonly Survivor[] {
  if (campaign.origin !== 'magic' || phaseOf(campaign.step) !== 'management') return [];
  if (projectTeamGained(campaign)) return [];

  return projectTeam(campaign).filter((survivor) => survivor.humanity < humanityMax(survivor));
}

/**
 * The campaign with 1 Humanity added to each of these survivors, an entry
 * each, for this reason. Nobody already at 5 is raised or logged.
 */
export function withHumanityGained(
  campaign: Campaign,
  ids: readonly string[],
  reason: HumanityGain,
  at: string,
): Campaign {
  const raised = campaign.survivors.filter(
    (survivor) => ids.includes(survivor.id) && survivor.humanity < humanityMax(survivor),
  );

  return raised.reduce<Campaign>(
    (gained, survivor) =>
      logged(gained, at, {
        kind: 'humanity-gained',
        survivor: survivor.id,
        name: survivor.name,
        reason,
      }),
    {
      ...campaign,
      survivors: campaign.survivors.map((survivor) =>
        raised.includes(survivor) ? { ...survivor, humanity: survivor.humanity + 1 } : survivor,
      ),
    },
  );
}

/**
 * Who healing brought up from 0 Health, comparing the roster before and
 * after (R114): only in a Magic campaign.
 */
export function healedFromZero(before: Campaign, after: Campaign): readonly string[] {
  if (before.origin !== 'magic') return [];

  return before.survivors
    .filter(
      (survivor) =>
        survivor.currentHp === 0 &&
        (after.survivors.find((one) => one.id === survivor.id)?.currentHp ?? 0) > 0,
    )
    .map((survivor) => survivor.id);
}
