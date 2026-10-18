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

/**
 * The Infection at which a survivor is incapacitated, whatever their Health
 * (pg. 123).
 *
 * The Viral origin's, and named here rather than written as a bare 10 where it
 * is read, because it is a rule and rules belong in this directory. Only
 * `incapacitatedByInfection` in `src/engine/survivor.ts` reads it; everything
 * else asks that, or `isDown` (#176).
 */
export const INFECTION_INCAPACITATES = 10;

/**
 * The Madness at which a survivor goes Lost at Departures (pp. 23, 124;
 * R106). The Cosmic Horror origin's.
 */
export const MADNESS_GOES_LOST = 13;

/**
 * The Madness a team member needs for a Cosmic Horror mission to be offered
 * to their team (pp. 108–111; R132).
 */
export const MADNESS_FOR_COSMIC_MISSIONS = 4;

/**
 * What the Lost roll, d10 plus the survivor's XP spent, must reach to place
 * them on a mission as a stranger (pp. 25, 124; R108). Anything less gives
 * them 1 XP.
 */
export const LOST_ROLL_TARGET = 18;

/** The XP a Lost survivor gains from a Lost roll that does not place them (pg. 124). */
export const LOST_ROLL_XP = 1;
