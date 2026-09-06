/**
 * Origins of the Rot — which flavour of apocalypse a campaign is running
 * (pg. 122–133).
 *
 * Moved here from `src/engine/campaign.ts` in Phase 2, for the same reason as
 * `materials.ts`: an origin gates three entries in the facility catalogue (the
 * Lounge, Containment and the Mystic Library), so the rules data has to name
 * them, and rules belong in this directory.
 *
 * **Absent is a real answer.** A campaign not using an origin is the book's
 * default, not a campaign with a missing field — which is why `Campaign.origin`
 * is optional rather than this list carrying a fourth member meaning "none".
 * The two would be the same state with two spellings.
 */

export const CAMPAIGN_ORIGINS = ['viral', 'cosmic-horror', 'magic'] as const;

export type CampaignOrigin = (typeof CAMPAIGN_ORIGINS)[number];
