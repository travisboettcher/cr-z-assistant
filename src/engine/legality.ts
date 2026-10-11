/**
 * Whether a survivor is a legal build — reported, never enforced from in here.
 *
 * A pure function returning a list of what is wrong, in the same shape
 * `saveFile.ts` already uses for its failures: a `code` for logic, a `message`
 * for a person, and the page so the reader can check the rule rather than take
 * this app's word for it.
 *
 * **The override is deliberately absent from this module, and from the
 * persisted shape.** A player can build an illegal survivor on purpose — house
 * rules, or a case this app models wrong — and a flag saying "allowed anyway"
 * would be a derived fact on the save file that goes stale the moment the
 * survivor becomes legal again. So the UI gates the *action* once, and a
 * survivor who is illegal keeps reporting it for exactly as long as they are.
 *
 * Skill *levels* are not a creation concern: skills start at zero (pg. 8) and
 * only XP raises them, so "cannot buy levels out of order" is a rule about a
 * purchase and lives with advancement. A stored level carries no evidence of
 * the order it was bought in, and there is nothing here to check.
 */

import { STATS, type Stat } from '../data/skills';
import { STARTING_COMMUNITY_TIER_LEVELS, TIER_RULES } from '../data/tiers';
import type { Stats, Survivor } from './campaign';
import { communityTierLevels } from './survivor';

export type ViolationCode =
  | 'too-many-skills'
  | 'not-enough-skills'
  | 'skill-above-tier'
  | 'stats-not-tier-array'
  | 'community-over-budget'
  | 'over-hero-cap';

export interface Violation {
  readonly code: ViolationCode;

  /** A sentence for a person at a table, not a rule restated. */
  readonly message: string;

  /** For `PageRef`, so the reader can check the rule itself. */
  readonly pages: number | string;
}

/**
 * Everything wrong with this survivor's build, or an empty list.
 *
 * Ordered most-blocking first, so a UI showing only the first one shows the
 * one worth acting on.
 */
export function survivorViolations(survivor: Survivor): readonly Violation[] {
  const rules = TIER_RULES[survivor.tier];
  const violations: Violation[] = [];
  const skills = Object.entries(survivor.skills);

  if (skills.length > rules.skillSlots) {
    violations.push({
      code: 'too-many-skills',
      message: `Has ${skills.length} skills, and a tier ${survivor.tier} survivor has ${rules.skillSlots}.`,
      pages: 7,
    });
  }

  for (const [skill, level] of skills) {
    if (level > rules.maxSkillLevel) {
      violations.push({
        code: 'skill-above-tier',
        message: `${skill} is at level ${level}, above the maximum of ${rules.maxSkillLevel} for tier ${survivor.tier}.`,
        pages: 7,
      });
    }
  }

  if (!hasTierStatArray(survivor)) {
    violations.push({
      code: 'stats-not-tier-array',
      message: `Their stats are not the ${rules.statArray.join('/')} a tier ${survivor.tier} survivor is built from.`,
      pages: 7,
    });
  }

  /**
   * Last, because it is the one violation that is not a mistake. A survivor
   * being part-way through their build is the normal state of a survivor who
   * was added a moment ago, and the UI must never block on it.
   */
  if (skills.length < rules.skillSlots) {
    violations.push({
      code: 'not-enough-skills',
      message: `Still choosing skills: ${skills.length} of ${rules.skillSlots}.`,
      pages: 7,
    });
  }

  return violations;
}

/**
 * A survivor's four stat values, as the multiset their Tier hands out.
 *
 * Compared as sorted values rather than per stat, because which stat holds
 * which value is the player's choice (pg. 7) — only the collection is
 * fixed.
 */
function hasTierStatArray(survivor: Survivor): boolean {
  // Compared numerically. The default sort is lexicographic, which agrees with
  // a numeric one only while every value is a single digit — true today, and
  // not something to leave resting on a hand-edited file staying tidy.
  const ascending = (a: number, b: number) => a - b;
  const expected = [...TIER_RULES[survivor.tier].statArray].sort(ascending);
  const actual = Object.values(survivor.stats).sort(ascending);

  return expected.length === actual.length && expected.every((value, i) => value === actual[i]);
}

/**
 * What is wrong with the community as a whole, or an empty list.
 *
 * Only one rule so far: a starting community is built from ten Tier levels
 * (pg. 13). It stops applying once the player says the building is done,
 * because field recruits push a community past ten perfectly legally and an app
 * that kept nagging about it would be wrong for the rest of the campaign.
 */
export function communityViolations(
  survivors: readonly Survivor[],
  startingCommunityBuilt: boolean,
): readonly Violation[] {
  if (startingCommunityBuilt) return [];

  const spent = communityTierLevels(survivors);

  if (spent <= STARTING_COMMUNITY_TIER_LEVELS) return [];

  return [
    {
      code: 'community-over-budget',
      message: `A starting community is built from ${STARTING_COMMUNITY_TIER_LEVELS} tier levels, and this one spends ${spent}.`,
      pages: 13,
    },
  ];
}

/**
 * What is wrong with promoting this survivor, or an empty list (pg. 54).
 *
 * A base's Tier is the maximum number of Hero-Tier survivors the community may
 * hold. The app knew the rule well enough to compute the cap, print it on the
 * base sheet and report the violation — **HEROES 4 / 2 — Over what this base
 * allows** — and not well enough to mention it at the moment of the purchase,
 * which is the only moment a player could act on it (#168). A twenty-turn
 * campaign on a Tier 2 base promoted a third and then a fourth Hero with no
 * warning and no blocker.
 *
 * A **warning** rather than a refusal, which is Z3-6's posture and the same
 * shape `build.ts` gives an illegal slot: the app says the rule and the player
 * may play past it, because a table's campaign is theirs.
 *
 * Counts and caps rather than a campaign, like `communityViolations` above:
 * this module reads survivors and rules, and a base belongs to its own.
 *
 * The book's other half — moving into a lower-Tier base forces a Hero out — is
 * a base-change concern and belongs with Claim a New Base in Phase 4.
 */
export function promotionViolations(
  survivor: Survivor,
  heroes: number,
  cap: number,
): readonly Violation[] {
  // Only the promotion that makes a Hero. Every other one leaves the count
  // alone, and a Hero has nowhere left to go.
  if (survivor.tier !== 3 || heroes < cap) return [];

  return [
    {
      code: 'over-hero-cap',
      message:
        cap === 0
          ? 'This base allows no Hero-Tier survivors at all.'
          : `This base allows ${String(cap)} Hero-Tier survivor${cap === 1 ? '' : 's'}, and the community already has ${String(heroes)}.`,
      pages: 54,
    },
  ];
}

/** Whether adding one more skill would break the Tier's slot count. */
export function skillSlotsAreFull(survivor: Survivor): boolean {
  return Object.keys(survivor.skills).length >= TIER_RULES[survivor.tier].skillSlots;
}

/**
 * Moves `value` onto `stat`, giving that stat's old value to whoever held
 * `value` — so the four values stay exactly the multiset the Tier hands out.
 *
 * A swap rather than an assignment, because four independent dropdowns let a
 * player build a stat array their Tier never had. Making the illegal state
 * unreachable beats validating it after the fact; `stats-not-tier-array` then
 * only ever fires on a hand-edited or imported file, which is where it belongs.
 */
export function withStatValue(survivor: Survivor, stat: Stat, value: number): Stats {
  const displaced = survivor.stats[stat];
  // The first holder, which matters because a Tier's array can repeat a value
  // — a Citizen's is 2/1/0/0. Swapping with either zero gives the same
  // multiset, so first is as good an answer as any and is deterministic.
  const holder = STATS.find((candidate) => survivor.stats[candidate] === value);

  // A value the survivor does not currently hold has nobody to swap with. Only
  // reachable from a hand-edited file, where `stats-not-tier-array` is already
  // reporting the real problem.
  if (holder === undefined) return survivor.stats;

  return { ...survivor.stats, [stat]: value, [holder]: displaced };
}
