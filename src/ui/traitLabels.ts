/**
 * Display names for the Story Traits (pg. 88; Z7-1).
 *
 * Presentation only, as `tierLabels.ts` is: what a trait does is
 * `STORY_TRAIT_RULES` in `src/data`. A full `Record`, so a trait added to the
 * rules data fails the typecheck here rather than rendering `undefined`.
 */

import type { Advantage, StoryTrait } from '../data/traits';

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
};
