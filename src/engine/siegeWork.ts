/**
 * Who still works on a siege turn (pg. 23, 85, and the FAQ entry "Siege
 * Defense and Labor").
 *
 * ## Everybody fights, and the base keeps working
 *
 * Two passages look as if they disagree. pg. 85 deploys **every** survivor to a
 * Siege Defense — which is why `deployed` returns the whole community on a
 * siege turn and pays every one of them the mission's XP (#167). pg. 23 and
 * the FAQ say projects and staffed facilities **keep running** through a
 * siege, and that the *mission team* may stand in for the base's casualties.
 * If everybody was out on the mission, nobody was at the Kitchen, and there is
 * no mission team distinct from anybody else to stand in.
 *
 * They fit once two things are said out loud.
 *
 * - **The siege is fought at the base.** A Siege Defense is the horde coming to
 *   the community rather than the community going out, so deploying everybody
 *   takes nobody away from their post: the cook fights in the Kitchen's yard
 *   and is still the cook. Fighting is what pg. 85 is about, and it is what
 *   `deployed` answers — who earns the mission's XP and whose skills the haul
 *   can be forced with. Working is a different question, and the standing
 *   assignments answer it.
 * - **"The mission team" is the team the previous Planning Phase assigned to
 *   the mission the siege displaced.** pg. 21 assigns a team in each Planning
 *   Phase for the *next* turn's mission; when the horde calls a siege for that
 *   turn, the team never goes out. They fought like everybody else and were
 *   not assigned any work, which is exactly why the FAQ can offer them as the
 *   ones free to stand in.
 *
 * So nothing here touches `deployed`, and nothing in `deployed` touches this.
 *
 * ## Which work a siege interrupts
 *
 * The work the **previous** Planning Phase assigned. Assignments made in
 * Planning N stand until the top of Planning N + 1 clears them (pg. 20), and
 * the Advancement Phase of N + 1 is where most of that work is settled: what
 * the facilities make, what a Clinic heals, what a Training Room teaches, and
 * the projects the team's Labor paid for (pg. 19). A siege in turn N + 1's
 * Mission Phase falls in the middle of that span, before every one of them —
 * so those are what a casualty of it takes away. `beforePlanning` already
 * reads that span, and this answers who in it is still working.
 *
 * This turn's own Planning Phase assigns *new* work, after the siege, to
 * survivors whose Health the table has already counted; it is not interrupted
 * by anything and this module has nothing to say about it.
 *
 * ## "Reduced to 0 Health during the siege"
 *
 * The recorded outcome does not say who went down, and wounds reach the
 * campaign through `survivor/hpSet` — an unlogged correction, deliberately
 * (the log records what happened, not repairs to the record). So the reading
 * here is the closest one the campaign can answer: **a survivor holding a work
 * task who is at 0 Health on a turn whose Siege Defense outcome has been
 * recorded.** Read live, like everything in `src/engine`, so correcting a
 * survivor's Health on the roster puts them back to work at once.
 *
 * Its limits are real and are stated rather than hidden:
 *
 * - **It cannot tell "went down in the siege" from "was already down".** A
 *   survivor at 0 Health *before* the siege — wounded, still working because
 *   R12 lets a wounded survivor staff a facility, and holding on through Rot
 *   checks — counts as a casualty too. That is arguably right (pg. 85 sent
 *   them into the fight as well) and certainly unprovable either way.
 * - **Health recorded before the outcome counts the same as Health recorded
 *   after it.** The outcome entry is the trigger, not a timestamp to compare
 *   against, because nothing about a Health change is timestamped.
 * - **Nothing before the outcome is recorded.** A siege the table has fought
 *   and not yet written down takes nobody off work; the walk already names an
 *   unrecorded siege as outstanding.
 *
 * The working survivors' Health cannot move under this during the Advancement
 * Phase by the rules: a survivor working a facility or on the project team
 * forfeits healing that turn (pg. 20–21, R12), so Heal Wounds never reaches
 * them.
 *
 * ## What "contributes nothing" reaches, and what it does not
 *
 * Their **skills** leave the facility they staff: production, healing and
 * Training Room XP are asked of who worked rather than who was assigned. Their
 * **Labor** leaves the project team, and since that team's Labor was spent on
 * last turn's orders, a casualty can leave one of them unpaid for —
 * `siegeLaborShortfall` in `projects.ts`, the same shape as a departure's wake
 * (pg. 23).
 *
 * The Utilities a Station's staff generated are **not** taken back. They were
 * generated and assigned at Planning Step 1 and last until the next Planning
 * Phase (pg. 20, 67), which is before the siege — the same reason a hunger
 * penalty landing later in a turn revokes nothing (#169). So supply is still
 * worked out from the staffing as assigned; only work done after the siege is
 * asked of who could still do it.
 *
 * The mission's own pools — the Teaching on the mission, the substitutions a
 * haul can be forced with — stay with `deployed`. They are the mission's, and
 * the FAQ's sentence is about the base's work.
 *
 * [R17](../../docs/rulings.md#r17--what-a-siege-defense-does-to-the-turns-work)
 * records the parts of this the book leaves open.
 *
 * Pure, like the rest of `src/engine`.
 */

import { beforePlanning, projectTeam, survivorsDoing } from './assignments';
import type { Assignment, Campaign, Survivor } from './campaign';

/**
 * Whether this turn's Siege Defense has been played and its outcome recorded.
 *
 * Read off the log rather than through `siege.ts`, which imports the module
 * this one is built on — the same entry `missionResolved` looks for, narrowed
 * to the one mission that is fought at the base.
 */
export function siegeDefended(campaign: Campaign): boolean {
  return campaign.log.some(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'siege-defense-resolved',
  );
}

/** The two tasks the FAQ says keep running through a siege. */
function isWork(assignment: Assignment): boolean {
  return assignment.task === 'staff' || assignment.task === 'project';
}

/**
 * Everybody the previous Planning Phase put to work who is at 0 Health now
 * that this turn's siege is recorded — read as "reduced to 0 Health during the
 * siege", with the limits this module's note gives.
 *
 * In roster order, like every list of survivors the screens show.
 */
export function fellInTheSiege(campaign: Campaign): readonly Survivor[] {
  if (!siegeDefended(campaign)) return [];

  return survivorsDoing(beforePlanning(campaign), isWork).filter(
    (survivor) => survivor.currentHp <= 0,
  );
}

/**
 * Who of these actually did the work the Advancement Phase is settling.
 *
 * Asked of a list a caller already has — one facility's `staffOf`, or the
 * project team — rather than of the campaign as a whole, because every caller
 * has already picked the occupant and resolved its capacity. Capacity is
 * applied first and the casualties taken out after, so a siege can only ever
 * leave a facility with fewer hands than it had: a second survivor assigned
 * over capacity does not step into a fallen one's seat on their own.
 *
 * Everybody, unchanged, on any turn without a recorded siege.
 */
export function whoWorked(campaign: Campaign, assigned: readonly Survivor[]): readonly Survivor[] {
  const fallen = new Set(fellInTheSiege(campaign).map((survivor) => survivor.id));

  return assigned.filter((survivor) => !fallen.has(survivor.id));
}

/**
 * The project team whose Labor paid for last turn's orders, less anybody the
 * siege took off it.
 */
export function projectTeamThatWorked(campaign: Campaign): readonly Survivor[] {
  return whoWorked(campaign, projectTeam(beforePlanning(campaign)));
}
