/**
 * What a Viral mission's outcome says, in the app's words (pp. 103–107; R104,
 * R122, R131, R144, R146; Z7-6): the counts after the colon, and what they
 * did to the campaign.
 */

import type { ViralMissionId } from '../data/missions';
import type { ViralRecord } from '../engine/log';
import { containmentHardware } from '../engine/viralMissions';

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** The counts, as they read after the mission's name. */
export function viralCounted(mission: ViralMissionId, record: ViralRecord): string {
  switch (mission) {
    case 'experimental-data':
      return `${plural(record.investigated ?? 0, 'point of interest', 'points of interest')} investigated, the Broken Cage check ${record.brokenCage === true ? 'passed' : 'not passed'}`;
    case 'bring-it-on-home':
      return `${plural(record.zombiesLeft ?? 0, 'ensnared zombie', 'ensnared zombies')} out of the area`;
    case 'medical-salvage':
      return plural(record.supplies ?? 0, 'Medical Supply token', 'Medical Supply tokens');
  }
}

/** How much Containment's Hardware changes, as a phrase (R122, R144). */
function hardwareChange(hardware: number): string {
  if (hardware === 0) return 'at its usual Hardware';

  return `at ${String(Math.abs(hardware))} ${hardware > 0 ? 'more' : 'less'} Hardware`;
}

/** What the outcome did to the campaign. */
export function viralConsequences(mission: ViralMissionId, record: ViralRecord): readonly string[] {
  switch (mission) {
    case 'experimental-data': {
      const hardware = containmentHardware(record);

      return [
        hardware === null
          ? 'No point of interest was investigated, so Experimental Data can be played again.'
          : `Containment is unlocked for the Medical Clinic, ${hardwareChange(hardware)}.`,
      ];
    }
    case 'bring-it-on-home':
      if ((record.zombiesLeft ?? 0) === 0) return [];

      return [
        record.held === true
          ? 'One zombie goes into Containment.'
          : 'No Containment stands on the base, so no zombie is held.',
        'The XP for the other zombies and the special zombies’ items are added by hand.',
      ];
    case 'medical-salvage':
      return (record.supplies ?? 0) === 0
        ? []
        : [
            `The base keeps ${plural(record.supplies ?? 0, 'Medical Supply token', 'Medical Supply tokens')}.`,
          ];
  }
}
