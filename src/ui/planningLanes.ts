/**
 * The lanes the Planning Phase's board offers, where two screens offer them:
 * the Planning Phase's own steps, and last turn's assignments while a campaign
 * picked up partway is set up (#210).
 */

import type { Campaign } from '../engine/campaign';

/**
 * The mission teams to offer: team 1 always, every team somebody is on
 * already, and one more after the highest, for splitting the mission survivors
 * further (pg. 21). An empty team is not a team — `missionTeams` ignores it —
 * so offering the next one costs nothing until somebody is put on it.
 */
export function missionTeamsToOffer(campaign: Campaign): readonly number[] {
  const inUse = Object.values(campaign.assignments).flatMap((assignment) =>
    assignment.task === 'mission' ? [assignment.team] : [],
  );

  if (inUse.length === 0) return [1];

  const highest = Math.max(...inUse);

  return Array.from({ length: highest + 1 }, (_, index) => index + 1);
}
