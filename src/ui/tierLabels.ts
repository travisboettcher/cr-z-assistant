/**
 * Display names for the survivor Tiers.
 *
 * Presentation only, the same way `turnLabels.ts` names the campaign phases —
 * what a Tier *means* is `TIER_RULES` in `src/data`, and a number on its own is
 * not what anyone calls these people at the table. Typed as a full `Record` so
 * adding a Tier to the rules data fails the typecheck here rather than silently
 * rendering `undefined`.
 */

import type { Tier } from '../data/tiers';

export const TIER_LABELS: Record<Tier, string> = {
  1: 'Rookie',
  2: 'Citizen',
  3: 'Leader',
  4: 'Hero',
};
