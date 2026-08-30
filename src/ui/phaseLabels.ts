/**
 * Display names for the campaign phases.
 *
 * Presentation only — the ordering and the set of phases belong to
 * `src/engine`, and this map exists solely so the header never renders a raw
 * lowercase union member at someone standing over a table. Typed as a full
 * `Record` so adding a phase to the engine fails the typecheck here instead of
 * silently rendering `undefined`.
 */

import type { CampaignPhase } from '../engine/campaign';

export const PHASE_LABELS: Record<CampaignPhase, string> = {
  mission: 'Mission',
  advancement: 'Advancement',
  planning: 'Planning',
  management: 'Management',
};
