/**
 * Turning a queued project into a line someone can read.
 *
 * Presentation only, like `baseLabels.ts` and `logLabels.ts` — and the reason
 * `Project` holds ids rather than a sentence. A switch rather than a record of
 * formatters, because each kind reads different fields and only a switch
 * narrows the union to the member that has them; the exhaustiveness is what
 * makes a fourth kind of project a compile error here rather than a blank line
 * on somebody's base screen.
 */

import type { Project } from '../engine/campaign';
import { FACILITY_LABELS, UPGRADE_LABELS, slotLabel } from './baseLabels';

export function describeProject(project: Project): string {
  switch (project.kind) {
    case 'facility':
      return `${FACILITY_LABELS[project.facility]} in the ${slotLabel(project.slot)}`;
    case 'upgrade':
      return `${UPGRADE_LABELS[project.upgrade]} on the ${slotLabel(project.slot)}`;
    case 'clearing':
      return `Clearing the ${slotLabel(project.slot)}`;
  }
}
