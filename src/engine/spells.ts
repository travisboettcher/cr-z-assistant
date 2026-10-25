/**
 * Spells seen and spells learned (pp. 70, 126–127, 133; R112, R113, R154,
 * R155; Z7-9).
 *
 * A spell becomes seen when an enemy casts it on the table, which the mission's
 * outcome records as a `spells-cast` entry; the spells seen are the campaign's,
 * read back off those (R112, R154). A survivor staffing a working Mystic
 * Library learns one of them at Character Advancement, with Humanity 3 or
 * less, for 6 XP, or 3 while a win of The Necromancer has its discount unused
 * (R113, R124, R153). The XP is spent as every purchase's is, so it counts as
 * XP spent (R149). A spell is known for good, once, with no limit on how many
 * (R155).
 *
 * Staffed last Planning, read this Advancement, as the Training Room's XP is
 * (`beforePlanning`), less anybody a siege took off their post (`whoWorked`).
 * The Resistance trait that can never learn one (pg. 140) is the Toolkit's,
 * which the tracker does not keep yet (Z7-10).
 *
 * Pure, like the rest of `src/engine`.
 */

import { NECROMANCER_SPELL_DISCOUNT, SPELLS, type SpellId } from '../data/origins';
import { beforePlanning, staffOf } from './assignments';
import { working } from './base';
import type { Campaign, Survivor } from './campaign';
import { logged } from './log';
import { necromancerWins } from './magicMissions';
import { whoWorked } from './siegeWork';
import { withXpSpent } from './survivor';
import { suppliedOccupants } from './utilities';

/** Somebody who may learn a spell this turn, and what their Library asks. */
export interface SpellLearner {
  readonly survivor: Survivor;
  readonly xpCost: number;
  readonly maxHumanity: number;
}

/** The spells an enemy has cast in this campaign, in the order `SPELLS` lists them (R112). */
export function spellsSeen(campaign: Campaign): readonly SpellId[] {
  return SPELLS.filter((spell) =>
    campaign.log.some(({ event }) => event.kind === 'spells-cast' && event.spells.includes(spell)),
  );
}

/**
 * Why these cannot be recorded as the spells an enemy cast on a mission, or
 * `null`: a Magic campaign's, each spell once. None is always fine.
 */
export function spellsCastProblem(campaign: Campaign, spells: readonly SpellId[]): string | null {
  if (spells.length === 0) return null;
  if (campaign.origin !== 'magic') return 'Only a Magic campaign records the spells an enemy cast.';

  return spells.every((spell, at) => SPELLS.includes(spell) && spells.indexOf(spell) === at)
    ? null
    : 'Name each spell an enemy cast once.';
}

/** The campaign with these spells logged as cast on this team's mission. None changes nothing. */
export function withSpellsCast(
  campaign: Campaign,
  team: number,
  spells: readonly SpellId[],
  at: string,
): Campaign {
  if (spells.length === 0) return campaign;

  return logged(campaign, at, {
    kind: 'spells-cast',
    team,
    spells: SPELLS.filter((spell) => spells.includes(spell)),
  });
}

/**
 * Everybody who staffed a working Mystic Library in the last Planning Phase,
 * as they are now, with what their Library asks (pg. 70; R113). One per staff
 * place, the Study Room's included, because `staffOf` seats no more. Nobody
 * outside a Magic campaign.
 */
export function spellLearners(campaign: Campaign): readonly SpellLearner[] {
  if (campaign.origin !== 'magic') return [];

  // Only the roster's assignments are rewound, so the survivors `staffOf`
  // returns are the roster's as it stands now.
  const staffed = beforePlanning(campaign);

  return suppliedOccupants(staffed).flatMap((occupant) =>
    working(occupant).flatMap(({ effects: { spellLearning } }) =>
      spellLearning === undefined
        ? []
        : whoWorked(campaign, staffOf(staffed, occupant)).map((survivor) => ({
            survivor,
            ...spellLearning,
          })),
    ),
  );
}

/** How many wins of The Necromancer have a discount no spell has used yet (R124, R153). */
export function spellDiscountsLeft(campaign: Campaign): number {
  const used = campaign.log.filter(
    ({ event }) => event.kind === 'spell-learned' && event.discounted === true,
  ).length;

  return Math.max(0, necromancerWins(campaign) - used);
}

/** What the next spell costs this learner: their Library's price, 3 less with a discount left. */
export function spellCost(
  campaign: Campaign,
  learner: SpellLearner,
): { readonly xp: number; readonly discounted: boolean } {
  return spellDiscountsLeft(campaign) > 0
    ? { xp: Math.max(0, learner.xpCost - NECROMANCER_SPELL_DISCOUNT), discounted: true }
    : { xp: learner.xpCost, discounted: false };
}

/** Whether this survivor has learned a spell this turn. */
export function learnedThisTurn(campaign: Campaign, survivor: string): boolean {
  return campaign.log.some(
    ({ turn, event }) =>
      turn === campaign.turn && event.kind === 'spell-learned' && event.survivor === survivor,
  );
}

/** The spells seen that this survivor does not know yet. */
export function learnableSpells(campaign: Campaign, survivor: Survivor): readonly SpellId[] {
  return spellsSeen(campaign).filter((spell) => !survivor.spells.includes(spell));
}

/**
 * Why this survivor cannot learn this spell now, or `null` (pg. 70; R113):
 * at Character Advancement, staffing a working Mystic Library, once a turn,
 * with Humanity 3 or less, a spell an enemy has cast that they do not know,
 * and the XP to pay for it.
 */
export function spellLearningProblem(
  campaign: Campaign,
  survivor: string,
  spell: SpellId,
): string | null {
  if (campaign.step !== 'character-advancement') {
    return 'A spell is learned at Character Advancement.';
  }

  const learner = spellLearners(campaign).find((one) => one.survivor.id === survivor);
  if (learner === undefined) {
    return 'Only somebody who staffed a working Mystic Library learns a spell.';
  }
  if (learnedThisTurn(campaign, survivor)) return 'They have learned a spell this turn already.';
  if (learner.survivor.humanity > learner.maxHumanity) {
    return `Only somebody with Humanity ${String(learner.maxHumanity)} or less learns a spell.`;
  }
  if (learner.survivor.spells.includes(spell)) return 'They know that spell already.';
  if (!spellsSeen(campaign).includes(spell)) {
    return 'An enemy has to cast a spell before anybody can learn it.';
  }

  // Never while in debt (R94, R113).
  if (learner.survivor.xpDebt > 0) {
    return 'Their experience debt is paid off before any XP is spent.';
  }

  return learner.survivor.xp >= spellCost(campaign, learner).xp
    ? null
    : 'They don’t have the experience for this yet.';
}

/** The campaign with the spell learned, paid for and logged. Assumes `spellLearningProblem` passed. */
export function withSpellLearned(
  campaign: Campaign,
  survivor: string,
  spell: SpellId,
  at: string,
): Campaign {
  const learner = spellLearners(campaign).find(
    (one) => one.survivor.id === survivor,
  ) as SpellLearner;
  const cost = spellCost(campaign, learner);
  const learned = withXpSpent(learner.survivor, cost.xp);

  return logged(
    {
      ...campaign,
      survivors: campaign.survivors.map((one) =>
        one.id === survivor
          ? {
              ...learned,
              spells: SPELLS.filter((known) => known === spell || one.spells.includes(known)),
            }
          : one,
      ),
    },
    at,
    {
      kind: 'spell-learned',
      survivor,
      name: learner.survivor.name,
      spell,
      xp: cost.xp,
      ...(cost.discounted ? { discounted: true as const } : {}),
    },
  );
}
