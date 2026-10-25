/**
 * The Toolkit's Permanent Injuries (pp. 137–138, 140; R84, R86–R89, R93, R161;
 * Z7-11).
 *
 * A survivor carries a count of each. One is gained at creation, for its XP,
 * or rolled on the d10 table when a Rot check fails and the player takes it
 * instead of turning (R86); a result of 4 is the origin's injury, rolled again
 * with no origin, and 10 is the player's choice. Gaining one more than an
 * injury allows turns the survivor as normal (R87, R161), except that a second
 * One-eyed becomes Blind and a third One-handed kills. None ever heals (R88).
 *
 * What each changes between missions is read where the rule already lives:
 * Labor in `survivorLabor` (R89), slots and Scores in `survivor.ts`, the
 * skill-level maximum in `advancement.ts`, and the tasks allowed in
 * `planning.ts` (R93). The origin injuries' own effects are Z7-12's.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { D10Result } from '../data/dice';
import type { CampaignOrigin } from '../data/origins';
import type { Skill } from '../data/skills';
import {
  INJURIES,
  INJURY_RULES,
  INJURY_TABLE,
  ORIGIN_INJURIES,
  type Advantage,
  type Injury,
  type InjuryRules,
} from '../data/traits';
import { TIER_RULES } from '../data/tiers';
import type { Survivor } from './campaign';

/** How many of this injury a survivor carries. */
export function injuryCount(survivor: Survivor, injury: Injury): number {
  return survivor.injuries[injury] ?? 0;
}

/** Each injury a survivor carries, with its rules and how many, in the table's order. */
export function injuriesOf(
  survivor: Survivor,
): readonly { readonly injury: Injury; readonly rules: InjuryRules; readonly count: number }[] {
  return INJURIES.flatMap((injury) => {
    const count = injuryCount(survivor, injury);

    return count === 0 ? [] : [{ injury, rules: INJURY_RULES[injury] as InjuryRules, count }];
  });
}

/** Whether any injury they carry has this rule. */
export function injuredSo(survivor: Survivor, has: (rules: InjuryRules) => boolean): boolean {
  return injuriesOf(survivor).some(({ rules }) => has(rules));
}

/**
 * What happens when this survivor gains this injury (pp. 137–138; R87, R161):
 * it's `gained`, a second One-eyed `becomes` Blind (or turns them if they are
 * Blind already), a third One-handed `kills`, and any other repeat past what an
 * injury allows `turns` them.
 */
export type InjuryFate = 'gained' | 'becomes' | 'turns' | 'kills';

export function injuryFate(survivor: Survivor, injury: Injury): InjuryFate {
  const rules: InjuryRules = INJURY_RULES[injury];
  const next = injuryCount(survivor, injury) + 1;

  if (next <= rules.most) return 'gained';
  if (rules.becomes !== undefined) {
    return injuryFate(survivor, rules.becomes) === 'gained' ? 'becomes' : 'turns';
  }

  return rules.killsAt === next ? 'kills' : 'turns';
}

/**
 * The survivor with this injury gained, for a fate of `gained` or `becomes`:
 * counted, or a second One-eyed swapped for Blind, and any Advantage it
 * removes gone, its debt staying (R159). Assumes `injuryFate` said so.
 */
export function withInjuryGained(survivor: Survivor, injury: Injury): Survivor {
  const rules: InjuryRules = INJURY_RULES[injury];
  const becomes = injuryCount(survivor, injury) + 1 > rules.most ? rules.becomes : undefined;
  const injuries: Partial<Record<Injury, number>> =
    becomes === undefined
      ? { ...survivor.injuries, [injury]: injuryCount(survivor, injury) + 1 }
      : withoutKey({ ...survivor.injuries, [becomes]: injuryCount(survivor, becomes) + 1 }, injury);

  return {
    ...survivor,
    injuries,
    advantages: survivor.advantages.filter((advantage) => advantage !== rules.removes),
  };
}

function withoutKey(
  injuries: Partial<Record<Injury, number>>,
  key: Injury,
): Partial<Record<Injury, number>> {
  return Object.fromEntries(Object.entries(injuries).filter(([one]) => one !== key));
}

/**
 * The injury a d10 on the table gives (pg. 138): its row, the origin's injury
 * for a 4, and the chosen one for a 10. `null` for a 4 with no origin, which is
 * rolled again, and for a 10 with nothing chosen.
 */
export function rolledInjury(
  origin: CampaignOrigin | undefined,
  roll: D10Result,
  chosen?: Injury,
): Injury | null {
  const row = INJURY_TABLE[roll];

  if (row === 'origin') return origin === undefined ? null : ORIGIN_INJURIES[origin];
  if (row === 'choice') return chosen ?? null;

  return row;
}

/** How far an injury lowers this skill's level maximum (Bad shoulder twice; pg. 138). */
export function skillMaximumLess(survivor: Survivor, skill: Skill): number {
  return injuriesOf(survivor).reduce(
    (total, { rules, count }) =>
      total +
      (rules.skillMaximum !== undefined &&
      count >= rules.skillMaximum.from &&
      (rules.skillMaximum.skills as readonly Skill[]).includes(skill)
        ? rules.skillMaximum.less
        : 0),
    0,
  );
}

/** The highest level this survivor can hold in a skill: their Tier's, less an injury's (pg. 138). */
export function skillLevelMaximum(survivor: Survivor, skill: Skill): number {
  return Math.max(0, TIER_RULES[survivor.tier].maxSkillLevel - skillMaximumLess(survivor, skill));
}

/** Whether an injury makes this Skill Score 0 (Blind's Scout and Scavenge; pg. 138). */
export function scoreZeroed(survivor: Survivor, skill: Skill): boolean {
  return injuredSo(
    survivor,
    (rules) => (rules.scoresZero as readonly Skill[] | undefined)?.includes(skill) === true,
  );
}

/**
 * The Labor an injury sets a survivor's to, by R89's first step, or `null`:
 * Blind's 1, a second One-handed's 0, the lowest where two apply.
 */
export function injuryLaborSet(survivor: Survivor): number | null {
  const set = injuriesOf(survivor).flatMap(({ rules, count }) =>
    rules.labor?.set !== undefined && count >= rules.labor.set.from ? [rules.labor.set.to] : [],
  );

  return set.length === 0 ? null : Math.min(...set);
}

/** What an injury adds to a survivor's Labor, by R89's adding step: One-handed's −1. */
export function injuryLaborAdd(survivor: Survivor): number {
  return injuriesOf(survivor).reduce(
    (total, { rules, count }) =>
      total +
      (rules.labor?.add !== undefined &&
      (rules.labor.set === undefined || count < rules.labor.set.from)
        ? rules.labor.add
        : 0),
    0,
  );
}

/** The Advantages an injury they carry rules out (One-handed's Ambidextrous; pg. 138). */
export function advantagesRuledOut(survivor: Survivor): readonly Advantage[] {
  return injuriesOf(survivor).flatMap(({ rules }) =>
    rules.removes === undefined ? [] : [rules.removes],
  );
}
