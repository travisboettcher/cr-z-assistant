/**
 * Naming what a survivor is doing this turn.
 *
 * Presentation only, like `turnLabels.ts` and `baseLabels.ts`. A `switch`
 * rather than a `Record`, because staffing reads its slot and the other five
 * carry nothing — and only a switch narrows the union to the member that has a
 * field to read. The absent `default` is what makes a seventh task a compile
 * error here instead of a blank row on a screen.
 *
 * Phrased to finish the sentence "currently …", because that is where it is
 * read: beside a checkbox, saying what ticking it would take somebody off.
 */

import type { Assignment } from '../engine/campaign';
import { slotLabel } from './baseLabels';

export function taskLabel(assignment: Assignment): string {
  switch (assignment.task) {
    case 'staff':
      return `working the ${slotLabel(assignment.slot)}`;
    case 'project':
      return 'on the project team';
    case 'rest':
      return 'resting';
    case 'healing':
      return 'being healed';
    case 'mission':
      return assignment.team === 1
        ? 'on the mission team'
        : `on mission team ${String(assignment.team)}`;
    case 'scavenging':
      return 'scavenging';
  }
}
