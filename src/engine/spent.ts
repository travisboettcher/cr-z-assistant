/**
 * What a mission used up, and what a survivor leaves behind (pp. 40, 45–48;
 * R37; Z5-5).
 *
 * ## The only item changes a mission makes
 *
 * Nothing on an item lasts past its mission (R37), so the tracker keeps no
 * item state; what a mission changes is whether an item still exists. A team
 * records that once its mission is played:
 *
 * - **One-mission gear** — the incendiary shells, the flaming arrows, the
 *   improvised shield (pp. 40, 45, 47) — goes whatever happened, so it is in
 *   every record whether ticked or not.
 * - **Disposables** are used up when used (pp. 46–48). The table ticks the
 *   ones that were, and the screen offers each as used to begin with.
 * - **Anything else** the table says was lost or destroyed.
 *
 * Once per mission played (`spentRecorded`), and "nothing" is an answer
 * recorded the same way (#236, R3).
 *
 * Until a team carrying one-mission gear records, the turn owes it
 * (`outstanding`), because that gear would otherwise go into the next mission.
 *
 * ## Leaving the roster
 *
 * A survivor who turns, is bitten to death or is taken off the roster leaves
 * what they carried at the base: into its Inventory, with an entry for each
 * (R72, R74, R75). Shoddy gear goes back to the free supply, as it does when
 * set down (R35). The rest take theirs: a survivor who departs (R73), one set
 * aside (R76) and a Hero sent away by a move (R77). One who dies on a mission
 * leaves theirs on the map, lost unless a teammate took it (R71;
 * `missionDeaths.ts`).
 */

import type { Campaign, Item, Survivor } from './campaign';
import { rulesOf } from './equipment';
import { logged, type SpentItem } from './log';
import { deployed, missionTeams } from './missions';
import { phaseOf } from './turn';

/** One item a team carries, and who carries it. */
export interface Carried {
  readonly survivor: Survivor;
  readonly item: Item;
}

/** Whether an item goes after its mission whatever happened (pp. 40, 45, 47). */
export function alwaysSpent(item: Item): boolean {
  return rulesOf(item).life === 'one-mission';
}

/**
 * Whether the screen offers an item as used to begin with: a disposable, used
 * up when used (pp. 46–48). Improvised armor is used up too, but only when worn
 * through (pg. 45), so it starts clear like everything else.
 */
export function offeredAsUsed(item: Item): boolean {
  return rulesOf(item).kind === 'disposable';
}

/** What each member of a team going out carries, member by member. */
export function teamCarries(campaign: Campaign, team: number): readonly Carried[] {
  const going = new Set(deployed(campaign).map((survivor) => survivor.id));
  const members =
    missionTeams(campaign).find((candidate) => candidate.team === team)?.members ?? [];

  return members
    .filter((survivor) => going.has(survivor.id))
    .flatMap((survivor) => survivor.items.map((item) => ({ survivor, item })));
}

/** The items a record would take: those ticked, and the one-mission gear regardless. */
export function spentItems(
  campaign: Campaign,
  team: number,
  ticked: readonly string[],
): readonly SpentItem[] {
  return teamCarries(campaign, team)
    .filter(({ item }) => ticked.includes(item.id) || alwaysSpent(item))
    .map(({ survivor, item }) => ({
      id: item.id,
      item: item.item,
      grade: item.grade,
      survivor: survivor.id,
      name: survivor.name,
    }));
}

/** Why a team's record of what its mission used is refused, or `null`. */
export function spentProblem(
  campaign: Campaign,
  team: number,
  ticked: readonly string[],
): string | null {
  if (phaseOf(campaign.step) !== 'mission') {
    return 'Record what a mission used in the Mission Phase.';
  }

  const carried = teamCarries(campaign, team);
  if (carried.length === 0) return `Mission team ${String(team)} carries nothing to use up.`;

  if (!ticked.every((id) => carried.some(({ item }) => item.id === id))) {
    return `Only what mission team ${String(team)} carries can be used up on its mission.`;
  }

  if (spentRecorded(campaign, team)) {
    return `What mission team ${String(team)} used is already recorded.`;
  }

  // Nothing ticked is an answer too: the mission used nothing (#236, R3).
  return null;
}

/**
 * Whether this team has recorded what its mission used, since it last chose
 * one (#236, R3). A record is once per mission played, so the form becomes a
 * record; a team that chooses again — a First Mission played again (R21), or
 * an overrun's way on (R27) — plays again, and is asked again.
 */
export function spentRecorded(campaign: Campaign, team: number): boolean {
  let recorded = false;

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'mission-selected' && event.team === team) recorded = false;
    else if (event.kind === 'items-spent' && event.team === team) recorded = true;
  }

  return recorded;
}

/** The campaign with these items gone from whoever had them. */
export function withItemsSpent(campaign: Campaign, spent: readonly SpentItem[]): Campaign {
  const gone = new Set(spent.map((item) => item.id));

  return {
    ...campaign,
    survivors: campaign.survivors.map((survivor) => ({
      ...survivor,
      items: survivor.items.filter((item) => !gone.has(item.id)),
    })),
  };
}

/**
 * The teams going out that still carry gear their mission takes: owed until
 * they record what it used, so it does not go out again (pp. 40, 45, 47).
 */
export function spentOwed(campaign: Campaign): readonly number[] {
  return missionTeams(campaign)
    .map((team) => team.team)
    .filter((team) => teamCarries(campaign, team).some(({ item }) => alwaysSpent(item)));
}

/**
 * The campaign with what these survivors carried left behind: into the base's
 * Inventory, or back to the free supply for shoddy gear (R35), an entry for
 * each. For survivors already taken off the roster at the base: turned,
 * bitten to death or removed (R72, R74, R75).
 */
export function withItemsLeftBehind(
  campaign: Campaign,
  leaving: readonly Survivor[],
  at: string,
): Campaign {
  return leaving.reduce(
    (current, survivor) =>
      survivor.items.reduce((next, item) => {
        const kept = item.grade !== 'shoddy';

        return logged(kept ? { ...next, inventory: [...next.inventory, item] } : next, at, {
          kind: 'item-moved',
          id: item.id,
          item: item.item,
          grade: item.grade,
          from: { survivor: survivor.id, name: survivor.name },
          to: kept ? 'base' : 'free',
        });
      }, current),
    campaign,
  );
}
