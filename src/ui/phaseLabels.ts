/**
 * Display names for the campaign phases.
 *
 * Presentation only — the ordering and the set of phases are rules and live in
 * `src/data/turn.ts`, and this map exists solely so the header never renders a
 * raw lowercase union member at someone standing over a table. Typed as a full
 * `Record` so adding a phase to the rules fails the typecheck here instead of
 * silently rendering `undefined`.
 */

import type { CampaignPhase } from '../data/turn';

export const PHASE_LABELS: Record<CampaignPhase, string> = {
  mission: 'Mission',
  advancement: 'Advancement',
  planning: 'Planning',
  management: 'Management',
};
