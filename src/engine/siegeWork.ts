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
 * **Since Z4-4 the outcome says.** Every outcome carries its team's Health at
 * the end, and a siege's team is everybody, so the `siege-defense-resolved`
 * entry is a record of who the siege left at 0 Health. The reading is **a
 * survivor holding a work task whom this turn's recorded Siege Defense left at
 * 0 Health** — and they stay a casualty when their Health is corrected back up
 * on the roster afterwards, because the correction repairs the roster and the
 * entry is what happened. The same record answers who is fit to stand in.
 *
 * **An entry written before Z4-4 records no Health**, and for it the reading is
 * the one this module had before: a survivor holding a work task who is at 0
 * Health *now*, on a turn whose Siege Defense outcome has been recorded — read
 * live, so correcting Health on the roster puts them back to work at once. The
 * fallback is per survivor (`asTheSiegeLeft`), so the one way a newer entry
 * can leave somebody out — a hand-edited save — reads them the old way rather
 * than not at all.
 *
 * Its limits are real and are stated rather than hidden:
 *
 * - **It cannot tell "went down in the siege" from "was already down".** The
 *   entry records Health at the end, not Health lost, so a survivor at 0
 *   Health *before* the siege — wounded, still working because R12 lets a
 *   wounded survivor staff a facility, and holding on through Rot checks —
 *   ends it at 0 and counts as a casualty too. That is arguably right (pg. 85
 *   sent them into the fight as well) and certainly unprovable either way.
 * - **On an entry written before Z4-4, Health entered before the outcome
 *   counts the same as Health entered after it.** That entry is the trigger,
 *   not a timestamp to compare against, because nothing about a Health
 *   correction is timestamped.
 * - **Nothing before the outcome is recorded.** A siege the table has fought
 *   and not yet written down takes nobody off work; the walk already names an
 *   unrecorded siege as outstanding.
 *
 * Where the reading is live, the working survivors' Health cannot move under
 * it during the Advancement Phase by the rules: a survivor working a facility
 * or on the project team forfeits healing that turn (pg. 20–21, R12), so Heal
 * Wounds never reaches them.
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
 * ## Stand-ins
 *
 * Because no ordinary mission went out, the mission team's survivors who are
 * not at 0 Health may substitute, adding their Labor to projects or their
 * skills to staff a facility (pg. 23, the FAQ). **A substitute takes one
 * casualty's place** — their task, their slot — and that is the whole of the
 * rule as this app reads it: "substitute" is standing in for somebody, not a
 * second chance to assign the mission team anywhere. It keeps capacity right
 * without a check, since a place can only hold the one survivor it held, and
 * it leaves a facility nobody fell from exactly as the Planning Phase left it.
 *
 * What the substitute brings is their own: their Tier to the project team,
 * their Scores to the facility. A Rookie standing in for a Hero is a Rookie's
 * Labor, which is what "adding their Labor" says.
 *
 * Chosen in the Mission Phase, once the siege is recorded — before anything
 * the Advancement Phase settles has been settled — and kept in the log
 * (`stood-in`) rather than in `assignments`, because this turn's Planning
 * Phase clears the assignments and the Advancement Phase behind it still has
 * to read who stood in. Read the way the casualties are: a stand-in for
 * somebody who is no longer a casualty — on an entry before Z4-4, a survivor
 * whose Health is corrected back above 0 — simply has nobody to stand in for,
 * and comes back off the post.
 *
 * [R17](../../docs/rulings.md#r17--what-a-siege-defense-does-to-the-turns-work)
 * records the parts of this the book leaves open.
 *
 * Pure, like the rest of `src/engine`.
 */

import { beforePlanning, missionTeam, projectTeam, survivorsDoing } from './assignments';
import type { Assignment, Campaign, Survivor } from './campaign';
import type { CampaignEvent, LogEntry } from './log';
import { outOfHealth } from './survivor';
import { phaseOf } from './turn';

/** A Siege Defense's outcome entry. */
type SiegeOutcome = Extract<CampaignEvent, { readonly kind: 'siege-defense-resolved' }>;

/**
 * This turn's Siege Defense outcome, or `undefined` before it is recorded.
 *
 * Read off the log rather than through `siege.ts` or `missions.ts`, which
 * import the module this one is built on — the Siege Defense's own outcome
 * entry, the one mission that is fought at the base. A siege turn has one
 * team (pg. 85), and a team one outcome, so there is no second entry to
 * choose between.
 */
function siegeOutcome(campaign: Campaign): SiegeOutcome | undefined {
  return campaign.log.find(
    (entry): entry is LogEntry & { readonly event: SiegeOutcome } =>
      entry.turn === campaign.turn && entry.event.kind === 'siege-defense-resolved',
  )?.event;
}

/** Whether this turn's Siege Defense has been played and its outcome recorded. */
export function siegeDefended(campaign: Campaign): boolean {
  return siegeOutcome(campaign) !== undefined;
}

/**
 * Whether this turn's recorded Siege Defense carries its team's Health (Z4-4),
 * so who it left at 0 Health is read off the entry rather than the roster —
 * for the screen, which says which of the two it is following.
 */
export function siegeHealthRecorded(campaign: Campaign): boolean {
  return siegeOutcome(campaign)?.wounds !== undefined;
}

/**
 * A survivor as the siege left them: at the Health its outcome recorded for
 * them (Z4-4), or as the roster has them now where it recorded none — which
 * is every entry written before Z4-4.
 *
 * A survivor rather than a number, so the question asked of it is still
 * `outOfHealth`, the one R18 says the siege asks: Health, not Infection.
 */
function asTheSiegeLeft(outcome: SiegeOutcome, survivor: Survivor): Survivor {
  const wound = outcome.wounds?.find((candidate) => candidate.survivor === survivor.id);

  return wound === undefined ? survivor : { ...survivor, currentHp: wound.health };
}

/** The two tasks the FAQ says keep running through a siege. */
function isWork(assignment: Assignment): boolean {
  return assignment.task === 'staff' || assignment.task === 'project';
}

/**
 * Everybody the previous Planning Phase put to work whom this turn's recorded
 * siege left at 0 Health — read as "reduced to 0 Health during the siege",
 * with the limits this module's note gives. Off the outcome's wounds where it
 * has them, and off the roster's Health for an entry written before Z4-4.
 *
 * In roster order, like every list of survivors the screens show.
 */
export function fellInTheSiege(campaign: Campaign): readonly Survivor[] {
  const outcome = siegeOutcome(campaign);
  if (outcome === undefined) return [];

  return survivorsDoing(beforePlanning(campaign), isWork).filter((survivor) =>
    outOfHealth(asTheSiegeLeft(outcome, survivor)),
  );
}

/**
 * Who of these actually did the work the Advancement Phase is settling: each
 * casualty replaced by whoever stands in for them, or by nobody.
 *
 * Asked of a list a caller already has — one facility's `staffOf`, or the
 * project team — rather than of the campaign as a whole, because every caller
 * has already picked the occupant and resolved its capacity. Capacity is
 * applied first and the casualties swapped out after, so a siege can only
 * ever leave a facility with as many hands as it had or fewer: a second
 * survivor assigned over capacity does not step into a fallen one's seat on
 * their own, and a stand-in takes exactly one.
 *
 * Everybody, unchanged, on any turn without a recorded siege.
 */
export function whoWorked(campaign: Campaign, assigned: readonly Survivor[]): readonly Survivor[] {
  const fallen = new Set(fellInTheSiege(campaign).map((survivor) => survivor.id));
  const standing = standIns(campaign);

  return assigned.flatMap((survivor) => {
    if (!fallen.has(survivor.id)) return [survivor];

    const standIn = standing.get(survivor.id);

    return standIn === undefined ? [] : [standIn];
  });
}

/**
 * The project team whose Labor paid for last turn's orders, less anybody the
 * siege took off it.
 */
export function projectTeamThatWorked(campaign: Campaign): readonly Survivor[] {
  return whoWorked(campaign, projectTeam(beforePlanning(campaign)));
}

/**
 * Who may stand in: the mission team the siege displaced, less anybody it
 * left at 0 Health (pg. 23, the FAQ).
 *
 * The team the *previous* Planning Phase assigned, which is the one that would
 * have gone out this turn — through `beforePlanning`, so it is still the
 * answer once this turn's Planning has cleared it. Nobody on a turn without a
 * recorded siege, because there is nothing to stand in for.
 *
 * "Left at 0 Health" is read the way `fellInTheSiege` reads it — off the
 * outcome's wounds where it has them (Z4-4), and the roster's Health for an
 * entry written before — because the FAQ's two halves are one question about
 * the same moment: who the siege left at 0 Health stops working, and who it
 * did not may substitute.
 */
export function standInCandidates(campaign: Campaign): readonly Survivor[] {
  const outcome = siegeOutcome(campaign);
  if (outcome === undefined) return [];

  return missionTeam(beforePlanning(campaign)).filter(
    (survivor) => !outOfHealth(asTheSiegeLeft(outcome, survivor)),
  );
}

/**
 * Who stands in for whom this turn, by the casualty's id.
 *
 * The latest `stood-in` entry for each casualty is the choice, so choosing
 * again is appending again. Each one is checked against the campaign as it is
 * now rather than trusted, through `fellInTheSiege` and `standInCandidates`:
 * somebody who is no longer a casualty has no place to fill, and a stand-in
 * who is no longer a candidate — taken off the mission team, or, on an entry
 * written before Z4-4, hurt since — cannot fill one. One survivor fills one place — if two
 * entries ever name the same stand-in, the place chosen for first keeps them,
 * which the screen cannot produce and a hand-edited save can.
 */
export function standIns(campaign: Campaign): ReadonlyMap<string, Survivor> {
  const fallen = new Set(fellInTheSiege(campaign).map((survivor) => survivor.id));
  const candidates = standInCandidates(campaign);

  const latest = new Map<string, string | undefined>();
  for (const entry of campaign.log) {
    if (entry.turn === campaign.turn && entry.event.kind === 'stood-in') {
      latest.set(entry.event.survivor, entry.event.by);
    }
  }

  const chosen = new Map<string, Survivor>();
  const taken = new Set<string>();

  for (const [place, by] of latest) {
    const standIn = candidates.find((candidate) => candidate.id === by);
    if (!fallen.has(place) || standIn === undefined || taken.has(standIn.id)) continue;

    taken.add(standIn.id);
    chosen.set(place, standIn);
  }

  return chosen;
}

/**
 * Why this stand-in cannot be chosen now, or `null` if it can.
 *
 * `by` of `undefined` is choosing nobody — leaving the place empty again.
 *
 * In the Mission Phase, once this turn's Siege Defense is recorded: the
 * casualties are counted at the table then, and nothing they would have worked
 * on has been settled yet. The casualty must be one, and the stand-in must be
 * on the mission team, not at 0 Health, and not already filling another place.
 * Choosing what is already chosen is refused too, so a press that changes
 * nothing writes nothing.
 */
export function standInProblem(
  campaign: Campaign,
  place: string,
  by: string | undefined,
): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Choose stand-ins in the Mission Phase, once the siege is recorded.';
  }
  if (!siegeDefended(campaign))
    return 'Only a recorded Siege Defense leaves anybody to stand in for.';
  if (!fellInTheSiege(campaign).some((survivor) => survivor.id === place)) {
    return 'Only somebody the siege took off their work can be stood in for.';
  }

  const standing = standIns(campaign);
  if (standing.get(place)?.id === by) {
    return by === undefined ? 'Nobody is standing in.' : 'They are standing in already.';
  }
  if (by === undefined) return null;

  if (!standInCandidates(campaign).some((candidate) => candidate.id === by)) {
    return 'Only somebody on the mission team who isn’t at 0 Health can stand in.';
  }

  return [...standing.values()].some((standIn) => standIn.id === by)
    ? 'They are already standing in for somebody else.'
    : null;
}
