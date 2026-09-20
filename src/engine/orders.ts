/**
 * Ordering a project, and what the campaign's history says about it.
 *
 * A thin module on purpose. `projects.ts` owns the queue — what is in it, what
 * it costs, when it is due — and the three Phase 2 modules still own what may
 * go in a slot. This is where the two meet, and it is separate from both
 * because `build.ts` reads `laborAvailable` from `projects.ts`: putting the
 * three checks back into `projects.ts` would close that into a cycle.
 *
 * ## Six event kinds for three verbs, and why
 *
 * A project is ordered on one turn and finished on the next, and both are
 * things that happened. A campaign's history reads "ordered a Workshop for the
 * Garage" and then, a turn later, "built a Workshop in the Garage" — which is
 * what a player did. Three events reused for both would have made a turn's
 * history claim the same thing twice.
 *
 * Pure, like the rest of `src/engine`.
 */

import { checkBuild } from './build';
import { checkClearing } from './clearing';
import { checkUpgrade } from './upgrade';
import type { Campaign, PlacedOrder, Project } from './campaign';
import type { Check } from './checks';
import type { CampaignEvent } from './log';

/**
 * Everything wrong with ordering this project.
 *
 * One question with three answers, delegated to the three modules that have
 * always known them. What Z3-11 changed is underneath: all three now price
 * against `laborAvailable` rather than the raw pool, so a second order in one
 * turn is measured by what the first one left.
 *
 * The codes are widened to `string` here, because the three verbs became one
 * and a caller rendering a refusal does not care which of the three closed sets
 * it came from. Each module keeps its own union, which is what stops a build
 * violation being returned from an upgrade check.
 */
export function checkOrder(campaign: Campaign, project: PlacedOrder): Check<string> {
  if (project.kind === 'facility') {
    return checkBuild(campaign, { slot: project.slot, facility: project.facility });
  }

  if (project.kind === 'upgrade') {
    return checkUpgrade(campaign, { slot: project.slot, upgrade: project.upgrade });
  }

  return checkClearing(campaign, { slot: project.slot });
}

/** What the log says when a project is ordered (pg. 20). */
export function orderedEvent(project: PlacedOrder): CampaignEvent {
  if (project.kind === 'facility') {
    return { kind: 'facility-ordered', slot: project.slot, facility: project.facility };
  }

  if (project.kind === 'upgrade') {
    return { kind: 'upgrade-ordered', slot: project.slot, upgrade: project.upgrade };
  }

  return { kind: 'clearing-ordered', slot: project.slot };
}

/** What the log says when it is finished, a turn later (pg. 19). */
export function builtEvent(project: Project): CampaignEvent {
  if (project.kind === 'facility') {
    return { kind: 'facility-built', slot: project.slot, facility: project.facility };
  }

  if (project.kind === 'upgrade') {
    return { kind: 'upgrade-built', slot: project.slot, upgrade: project.upgrade };
  }

  return { kind: 'slot-cleared', slot: project.slot };
}
