/**
 * Survivor stats and skills — rules as data (pg. 8–9).
 *
 * Numbers and structure only. Skill *descriptions* are rule text and never ship;
 * what a skill does belongs in the rulebook, and the app cites the page.
 *
 * Display labels are not here either, for the same reason `phaseLabels.ts`
 * lives in `src/ui` — presentation is the UI's problem, and this directory
 * stays purely structural.
 */

/** The four stats every survivor has (pg. 8). */
export const STATS = ['strength', 'dexterity', 'intelligence', 'cooperation'] as const;

export type Stat = (typeof STATS)[number];

/**
 * Every governed skill and the stat that governs it (pg. 8), in rulebook order.
 *
 * This record is the single source: `Skill` is its keys and `SKILLS` is its
 * insertion order, so a skill cannot exist without a governing stat and the
 * runtime list cannot drift from the type union.
 */
export const SKILL_STATS = {
  'blunt-weapon': 'strength',
  'blade-weapon': 'strength',
  'heavy-weapon': 'strength',
  carry: 'strength',
  break: 'strength',

  handguns: 'dexterity',
  'long-guns': 'dexterity',
  archery: 'dexterity',
  stealth: 'dexterity',
  enter: 'dexterity',

  scavenge: 'intelligence',
  scout: 'intelligence',
  tactics: 'intelligence',
  tinker: 'intelligence',
  traps: 'intelligence',

  medicine: 'cooperation',
  rationing: 'cooperation',
  mechanics: 'cooperation',
  teaching: 'cooperation',
  utilities: 'cooperation',
} as const satisfies Record<string, Stat>;

export type Skill = keyof typeof SKILL_STATS;

/** The governed skills in rulebook order, grouped by their stat. */
export const SKILLS = Object.keys(SKILL_STATS) as readonly Skill[];

/**
 * Skill levels run 0–4, capped at the survivor's Tier (pg. 8). Skills start at
 * zero, and the level is added to the governing stat to get the Skill Score.
 */
export const MIN_SKILL_LEVEL = 0;

/**
 * Move and Defense (pg. 9).
 *
 * **Deliberately a different shape from the governed skills.** They have no
 * governing stat and no level — only a Score. Modelling them as ordinary skills
 * with a nullable stat is what produces the advancement bug: a common skill
 * costs its new *Score* (7, then 8) while a governed skill costs its new
 * *level* (1–4), and the two are the same sentence on pg. 18. Making "the
 * governing stat of Move" unrepresentable is cheaper than remembering not to
 * ask for it.
 */
export const COMMON_SKILLS = ['move', 'defense'] as const;

export type CommonSkill = (typeof COMMON_SKILLS)[number];

/** Every survivor starts with Move 6 and Defense 6 (pg. 9). */
export const COMMON_SKILL_START_SCORE = 6;

/** Neither common skill can be raised past a Score of 8 (pg. 18). */
export const COMMON_SKILL_MAX_SCORE = 8;
