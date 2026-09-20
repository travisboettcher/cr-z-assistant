/**
 * The dice a player has entered but not yet committed.
 *
 * **Deliberately not part of the campaign.** What the save file records is the
 * haul — once materials are in storage the rolls are history, and putting them
 * on `Campaign` would mean an exported file carrying half-finished input. The
 * comment in `AdvancementPhase` has always said so and was right about that.
 *
 * What it was wrong about is where "not in the campaign" leaves them. They sat
 * in component state and nowhere else, so a tab reload lost a whole mission's
 * haul while the step stayed armed — press Add to storage afterwards and the
 * log records "Added nothing to storage this turn", with no undo. The README
 * promises the opposite in as many words: *"Autosave keeps a copy in the
 * browser so a closed tab does not cost a turn."* A tablet discarding a
 * background tab is the ordinary case for this app, not an edge one.
 *
 * So they live beside the autosave rather than inside it: same storage, same
 * failure posture, its own key, and none of it in the file that lasts.
 *
 * ## Why the stamp
 *
 * Pending input belongs to one campaign and one turn. Without saying which, a
 * reload after ending the turn — or after importing a different campaign —
 * would hand this turn's step somebody else's dice. The stamp is checked on
 * read and a mismatch is discarded, which makes going stale the default rather
 * than something a caller has to remember to do.
 *
 * ## One `try` per entry point, and no guard beside it
 *
 * `globalThis.localStorage` is reached inside the `try` rather than behind a
 * null check, because reading the property is itself what throws when a
 * browser has storage switched off. A guard as well would be a second road to
 * the same silence — and one no test can tell from its absence, which a
 * mutation run says out loud.
 */

import { D10_RESULTS, type D10Result } from '../data/dice';
import { MATERIALS, type Material } from '../data/materials';
import { SUBSTITUTION_SKILLS, type SubstitutionSkill } from '../data/turn';
import { canForce, type MaterialRoll } from '../engine/materials';

/** Namespaced like the autosave, and versioned for the same reason. */
export const PENDING_ROLLS_KEY = 'crz.advancement.rolls.v1';

interface Pending {
  readonly campaign: string;
  readonly turn: number;
  readonly rolls: readonly MaterialRoll[];
}

/**
 * Remember the rolls entered so far for this campaign and turn.
 *
 * Silent on failure, unlike the autosave, which reports so a screen can say
 * something. There is nothing useful to tell a player here: the rolls are on
 * screen in front of them, and a warning about background storage would be
 * about the wrong thing at the wrong moment.
 */
export function writePendingRolls(campaign: string, turn: number, rolls: readonly MaterialRoll[]) {
  try {
    const pending: Pending = { campaign, turn, rolls };
    globalThis.localStorage.setItem(PENDING_ROLLS_KEY, JSON.stringify(pending));
  } catch {
    // Quota, private browsing, or no API at all. The step still works; a
    // reload just costs what it cost before.
  }
}

/** Whether this is a roll result and not whatever else was in storage. */
function isRoll(value: unknown): value is D10Result {
  return D10_RESULTS.some((result) => result === value);
}

function isSkill(value: unknown): value is SubstitutionSkill {
  return SUBSTITUTION_SKILLS.some((skill) => skill === value);
}

/**
 * The material this skill is allowed to force to, when the stored value names
 * one (pg. 12).
 *
 * One question and not two. Asking whether the value is in the catalogue and
 * then whether the book permits the pairing looks like belt and braces, but a
 * skill's list is made of materials: the first question can only ever agree
 * with the second, so only the second is asked.
 */
function forcedMaterial(skill: SubstitutionSkill, value: unknown): Material | undefined {
  return MATERIALS.find((material) => material === value && canForce(skill, material));
}

/**
 * A stored roll, or `undefined` for anything this version cannot read.
 *
 * Validated rather than trusted, like every other thing read back from
 * storage: the entry is hand-editable, survives a version change, and a bad
 * `forced` skill would otherwise reach `substitutionsSpent` as a string
 * nothing in the catalogue matches. The pairing is checked too, so one the
 * book does not allow cannot come back through the side door that the picker
 * closes on screen.
 */
function readRoll(value: unknown): MaterialRoll | undefined {
  // `null` is the only shape that has to be turned away before the fields are
  // read. Every other non-object reads back as a missing `roll` and fails the
  // check below on its own; reading a field off `null` throws instead.
  if (value === null) return undefined;

  const { roll, forced } = value as { roll?: unknown; forced?: unknown };
  if (!isRoll(roll)) return undefined;

  // Built without the key rather than with `forced: undefined`:
  // `exactOptionalPropertyTypes` treats those as different types, and the
  // second one is not a `MaterialRoll`.
  if (forced === undefined) return { roll };
  if (forced === null) return undefined;

  const { skill, material } = forced as { skill?: unknown; material?: unknown };
  if (!isSkill(skill)) return undefined;

  const permitted = forcedMaterial(skill, material);
  if (permitted === undefined) return undefined;

  return { roll, forced: { skill, material: permitted } };
}

/**
 * The rolls left behind for this campaign and turn, or none.
 *
 * A stamp that does not match is not an error — it is last turn's input, or
 * another campaign's — so it comes back empty rather than as a failure.
 */
export function readPendingRolls(campaign: string, turn: number): readonly MaterialRoll[] {
  let stored: unknown;

  try {
    // An absent key reads back as `null`, and the text `null` parses to the
    // `null` the shape check below already refuses. So nothing written yet
    // needs no branch of its own — it arrives as the same unreadable entry
    // that a hand-edited one does.
    stored = JSON.parse(globalThis.localStorage.getItem(PENDING_ROLLS_KEY) ?? 'null');
  } catch {
    return [];
  }

  if (stored === null) return [];

  const pending = stored as Partial<Pending>;
  if (pending.campaign !== campaign || pending.turn !== turn) return [];
  if (!Array.isArray(pending.rolls)) return [];

  const rolls = pending.rolls.map(readRoll);

  // All or nothing: a partly readable list would silently drop dice a player
  // entered, which is the failure this module exists to prevent.
  return rolls.every((roll) => roll !== undefined) ? (rolls as MaterialRoll[]) : [];
}

export function clearPendingRolls(): void {
  try {
    globalThis.localStorage.removeItem(PENDING_ROLLS_KEY);
  } catch {
    // Either gone or unreachable, and both leave the campaign correct.
  }
}
