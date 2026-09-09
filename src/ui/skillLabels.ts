/**
 * Display names for the skills.
 *
 * Presentation only, like `turnLabels.ts` and `tierLabels.ts`. What a skill
 * *does* is rule text and stays in the rulebook; what it is *called* is the
 * minimum needed to put it on a screen, and `blunt-weapon` is an identifier
 * rather than a name.
 *
 * Full `Record`s, so adding a skill to `src/data` fails the typecheck here
 * instead of rendering `undefined` at someone standing over a table.
 */

import type { CommonSkill, Skill, Stat } from '../data/skills';

export const STAT_LABELS: Record<Stat, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  intelligence: 'Intelligence',
  cooperation: 'Cooperation',
};

export const SKILL_LABELS: Record<Skill, string> = {
  'blunt-weapon': 'Blunt Weapon',
  'blade-weapon': 'Bladed Weapon',
  'heavy-weapon': 'Heavy Weapon',
  carry: 'Carry',
  break: 'Break',

  handguns: 'Handguns',
  'long-guns': 'Long Guns',
  archery: 'Archery',
  stealth: 'Stealth',
  enter: 'Enter',

  scavenge: 'Scavenge',
  scout: 'Scout',
  tactics: 'Tactics',
  tinker: 'Tinker',
  traps: 'Traps',

  medicine: 'Medicine',
  rationing: 'Rationing',
  mechanics: 'Mechanics',
  teaching: 'Teaching',
  utilities: 'Utilities',
};

export const COMMON_SKILL_LABELS: Record<CommonSkill, string> = {
  move: 'Move',
  defense: 'Defense',
};
