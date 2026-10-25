/**
 * Display names for the Story Traits (pg. 88; Z7-1).
 *
 * Presentation only, as `tierLabels.ts` is: what a trait does is
 * `STORY_TRAIT_RULES` in `src/data`. A full `Record`, so a trait added to the
 * rules data fails the typecheck here rather than rendering `undefined`.
 */

import {
  INJURY_RULES,
  type Advantage,
  type Injury,
  type InjuryRules,
  type OriginAdvantage,
  type StoryTrait,
} from '../data/traits';

export const STORY_TRAIT_LABELS: Record<StoryTrait, string> = {
  bonded: 'Bonded',
  jaded: 'Jaded',
  berserk: 'Berserk',
  'lone-wolf': 'Lone Wolf',
  driven: 'Driven',
};

/** What a survivor's traits read as on their sheet: "Bonded (bond group 1), Veteran". */
export function describeTraits(traits: {
  readonly storyTrait: StoryTrait | null;
  readonly veteran: boolean;
  readonly bondGroup: number | null;
  readonly rotResistant?: boolean;
  readonly found?: boolean;
  readonly foundCheckPassed?: boolean;
}): string {
  const named = [
    ...(traits.storyTrait === null
      ? []
      : [
          traits.bondGroup === null
            ? STORY_TRAIT_LABELS[traits.storyTrait]
            : `${STORY_TRAIT_LABELS[traits.storyTrait]} (bond group ${String(traits.bondGroup)})`,
        ]),
    ...(traits.veteran ? ['Veteran'] : []),
    ...(traits.rotResistant === true ? ['Rot Resistant'] : []),
    ...(traits.found === true
      ? [traits.foundCheckPassed === true ? 'Found, Madness capped at 6' : 'Found']
      : []),
  ];

  return named.length === 0 ? 'None' : named.join(', ');
}

/** The Toolkit's Advantages as pg. 139 names them (Z7-10). */
export const ADVANTAGE_LABELS: Record<Advantage, string> = {
  powerhouse: 'Powerhouse',
  'light-eater': 'Light Eater',
  forager: 'Forager',
  'outdoor-enthusiast': 'Outdoor Enthusiast',
  quiet: 'Quiet',
  ambidextrous: 'Ambidextrous',
  'parkour-practitioner': 'Parkour Practitioner',
  'natural-leader': 'Natural Leader',
  'calloused-psyche': 'Calloused Psyche',
  resistance: 'Resistance',
};

/** The Toolkit's Permanent Injuries as pp. 138 and 140 name them (Z7-11). */
export const INJURY_LABELS: Record<Injury, string> = {
  'wheelchair-bound': 'Wheelchair-bound',
  'one-handed': 'One-handed',
  'one-eyed': 'One-eyed',
  'bad-knee': 'Bad knee',
  'bad-shoulder': 'Bad shoulder',
  blind: 'Blind',
  deaf: 'Deaf',
  'twice-shy': 'Twice shy',
  sickly: 'Sickly',
  'psychic-scars': 'Psychic Scars',
  touched: 'Touched',
};

/** The origin Advantages by name: Rot Resistant, the flag, and the two in the list (pg. 140). */
export const ORIGIN_ADVANTAGE_LABELS: Record<OriginAdvantage, string> = {
  'rot-resistant': 'Rot Resistant',
  'calloused-psyche': ADVANTAGE_LABELS['calloused-psyche'],
  resistance: ADVANTAGE_LABELS.resistance,
};

/** The origin Advantage an origin injury takes away instead (pg. 140; R162), by name. */
export function replacedLabel(injury: Injury): string {
  return ORIGIN_ADVANTAGE_LABELS[(INJURY_RULES[injury] as InjuryRules).replaces as OriginAdvantage];
}
