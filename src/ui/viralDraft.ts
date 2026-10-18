/**
 * A Viral mission's outcome fields as the form holds them, and the record
 * they make (Z7-6). Apart from `ViralEnding.tsx` so that file exports only
 * its component.
 */

import type { ViralMissionId } from '../data/missions';
import type { ViralRecord } from '../engine/log';
import { viralAsks } from '../engine/viralMissions';

/** The fields as typed: an empty one is no count at all. */
export interface ViralDraft {
  readonly investigated: string;
  readonly brokenCage: boolean;
  readonly zombiesLeft: string;
  readonly supplies: string;
}

export const EMPTY_VIRAL_DRAFT: ViralDraft = {
  investigated: '',
  brokenCage: false,
  zombiesLeft: '',
  supplies: '',
};

/** An empty field is no count at all, rather than the 0 `Number('')` makes it. */
const count = (typed: string): number => (typed.trim() === '' ? Number.NaN : Number(typed));

/** The record the form sends: only what the mission asks for. */
export function viralDraftRecord(mission: ViralMissionId, draft: ViralDraft): ViralRecord {
  const asked = viralAsks(mission);

  return {
    ...(asked.includes('investigated') ? { investigated: count(draft.investigated) } : {}),
    ...(asked.includes('brokenCage') ? { brokenCage: draft.brokenCage } : {}),
    ...(asked.includes('zombiesLeft') ? { zombiesLeft: count(draft.zombiesLeft) } : {}),
    ...(asked.includes('supplies') ? { supplies: count(draft.supplies) } : {}),
  };
}
