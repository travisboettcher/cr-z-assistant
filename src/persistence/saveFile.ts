/**
 * Reading a save file back — the import half of the round trip.
 *
 * Every failure here reaches someone standing next to a table with miniatures
 * on it, holding a tablet, part-way through a campaign. So nothing throws and
 * nothing leaks a `SyntaxError`: each way this can go wrong gets a sentence
 * that says what to do about it.
 *
 * Validation is hand-rolled rather than a schema library. `Campaign` is a dozen
 * fields, and a schema would have to be kept in sync with the type *and* with
 * every migration — more surface than it saves at this size. Phase 2 lands the
 * base model and makes the shape genuinely wide; that is the point to revisit.
 */

import { SKILL_STATS, STATS } from '../data/skills';
import { TIERS } from '../data/tiers';
import { CAMPAIGN_PHASES, MATERIALS, type Campaign } from '../engine/campaign';
import { migrate, type MigrationErrorReason } from './migrations';

/**
 * Why a file could not be opened.
 *
 * `MigrationErrorReason` is spliced in rather than restated so that a reason
 * added to the migration chain later widens this union automatically — a
 * hand-copied list would go stale the first time the chain grew a new failure.
 */
export type SaveFileErrorReason =
  'unreadable-file' | 'invalid-json' | 'not-a-campaign' | 'damaged-campaign' | MigrationErrorReason;

export interface SaveFileError {
  readonly reason: SaveFileErrorReason;

  /** A sentence for a person holding a tablet mid-campaign, not a stack trace. */
  readonly message: string;
}

/** A discriminated result, for the same reason `MigrationResult` is one. */
export type SaveFileResult =
  | { readonly ok: true; readonly campaign: Campaign }
  | { readonly ok: false; readonly error: SaveFileError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCountFromOne(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isCountFromZero(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Names the first thing structurally wrong with one survivor, or `null`.
 *
 * **Shape only — never legality.** Whether a Tier 2 survivor is allowed three
 * skills, or a level-4 one, is a rule, and Z1-7 lets a player override those
 * rules deliberately. A campaign that was saved with an override in it is a
 * campaign this must still open; refusing it here would make the override a
 * feature that silently destroys the save that used it.
 *
 * So: is `tier` one of the four Tiers, are the stats present and countable, are
 * the skill keys skills that exist. Not: is any of it a legal survivor.
 */
function describeSurvivorProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'is not a survivor';

  if (typeof value.id !== 'string' || value.id === '') return 'has no id';
  if (typeof value.name !== 'string') return 'has no name';
  if (!TIERS.some((tier) => tier === value.tier)) {
    return `has a tier that is not one of ${TIERS.join(', ')}`;
  }

  const stats: unknown = value.stats;
  if (!isRecord(stats)) return 'has no stats';
  for (const stat of STATS) {
    if (!isCountFromZero(stats[stat])) return `has no ${stat} score`;
  }

  const skills: unknown = value.skills;
  if (!isRecord(skills)) return 'has no skill list';
  for (const [skill, level] of Object.entries(skills)) {
    if (!(skill in SKILL_STATS)) return `has a skill this version does not know: ${skill}`;
    if (!isCountFromZero(level)) return `has an unreadable level for ${skill}`;
  }

  if (!isCountFromZero(value.move)) return 'has no move score';
  if (!isCountFromZero(value.defense)) return 'has no defense score';
  if (!isCountFromZero(value.currentHp)) return 'has unreadable health';
  if (!isCountFromZero(value.xp)) return 'has unreadable experience';

  return null;
}

/**
 * Names the first thing wrong with a would-be current-shape `Campaign`, or
 * `null` if there is nothing wrong with it.
 *
 * Phrases are written to slot into "…is not a complete campaign: <problem>.",
 * because "invalid field: phase" tells someone mid-campaign nothing they can
 * act on. Order matters only in that the first problem found is the one
 * reported — a file with several is rarely worth enumerating.
 *
 * This describes the shape as it is *today*. When a later phase gives `base` or
 * `log` a real type, this function changes in the same commit as the migration
 * step that fills it in; those two drifting apart is exactly the failure the
 * guard test in `migrations.test.ts` is watching for.
 */
function describeCampaignProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'it is not a campaign object';

  if (!isCountFromOne(value.schemaVersion)) return 'its save-format version is missing or invalid';
  if (typeof value.id !== 'string' || value.id === '') return 'it has no campaign id';
  if (typeof value.name !== 'string') return 'it has no campaign name';
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return 'its creation date is missing or unreadable';
  }
  if (!isCountFromOne(value.turn)) return 'its turn number is missing or is not a whole turn';
  if (typeof value.phase !== 'string' || !CAMPAIGN_PHASES.some((phase) => phase === value.phase)) {
    return `its phase is not one of ${CAMPAIGN_PHASES.join(', ')}`;
  }

  const materials: unknown = value.materials;
  if (!isRecord(materials)) return 'its material counts are missing';
  for (const material of MATERIALS) {
    const count: unknown = materials[material];
    // Finite, but deliberately not bounded or forced to a whole number: how
    // many of a material a campaign may hold is a rule, and Phase 0 ships none.
    if (typeof count !== 'number' || !Number.isFinite(count)) {
      return `its ${material} count is missing or is not a number`;
    }
  }

  if (!Array.isArray(value.survivors)) return 'its survivor list is missing';
  for (const [index, survivor] of value.survivors.entries()) {
    const problem = describeSurvivorProblem(survivor);
    // Positional rather than by name, because a survivor whose name is the
    // damaged field cannot be pointed at by it.
    if (problem !== null) return `survivor ${index + 1} of ${value.survivors.length} ${problem}`;
  }

  // `base` and `log` are still typed empty because Phase 1 genuinely cannot
  // hold either. Accepting a populated one would let a file put data into the
  // app that no code here knows how to read; a save that legally has a base
  // comes from a later version, and `migrate` refuses that first with a message
  // that actually tells the reader to update the app.
  if (value.base !== null) return 'it has a base, which this version cannot read';
  if (!Array.isArray(value.log) || value.log.length > 0) {
    return 'its campaign log is missing, or holds entries this version cannot read';
  }

  return null;
}

function failure(reason: SaveFileErrorReason, message: string): SaveFileResult {
  return { ok: false, error: { reason, message } };
}

/**
 * Turns the text of an exported `.json` into a `Campaign`.
 *
 * The pipeline is parse → shape → `migrate` → shape again, and the two shape
 * checks are deliberately different checks:
 *
 * - **Before** `migrate`, only "is this a JSON object at all?". It cannot ask
 *   for a single field, because a v1 file opened by a v4 build is *supposed* to
 *   be missing fields — bringing it forward is the migration chain's whole job.
 *   Checking the current field list here would reject every save the chain
 *   exists to rescue.
 * - **After** `migrate`, the full current-shape check, because that is the
 *   contract `migrations.ts` states it is trusting this function to hold up:
 *   its closing cast asserts what the chain is responsible for producing, not
 *   what has been proven about the bytes on disk.
 *
 * Version reading sits between the two and is `migrate`'s alone — it already
 * range-checks `schemaVersion` and already writes the two error messages worth
 * writing for it, so those are forwarded verbatim rather than reworded here.
 */
export function parseCampaignFile(text: string): SaveFileResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    // The underlying `SyntaxError` ("Unexpected end of JSON input") is dropped
    // on purpose: it describes a byte offset, and the reader needs a file.
    return failure(
      'invalid-json',
      'This file could not be read. It may have been cut short while saving, or edited by ' +
        'hand — try exporting the campaign again, or open a different file.',
    );
  }

  if (!isRecord(parsed)) {
    return failure(
      'not-a-campaign',
      'This file is not a County Road Z campaign. Campaign saves are the .json files this ' +
        'app exports — check you picked the right one.',
    );
  }

  const migrated = migrate(parsed);

  if (!migrated.ok) {
    // Forwarded as-is. `migrate` owns versioning, so it owns how a missing or
    // future version is explained; rewording it here would mean two places to
    // keep good.
    return { ok: false, error: migrated.error };
  }

  const problem = describeCampaignProblem(migrated.campaign);

  if (problem !== null) {
    return failure(
      'damaged-campaign',
      `This file says it is a County Road Z campaign, but it is not complete: ${problem}. ` +
        'It may have been edited or damaged since it was saved.',
    );
  }

  return { ok: true, campaign: migrated.campaign };
}

/**
 * Reads a picked or dropped file and parses it.
 *
 * Separate from `parseCampaignFile` because reading a `File` is the one part of
 * import that touches the platform: the text is already in memory by the time
 * the parser sees it. Keeping the read here means the UI branches on a single
 * result shape instead of juggling a promise rejection and a result.
 *
 * `unreadable-file` is a distinct reason from `not-a-campaign` on purpose. A
 * file the browser could not read at all — revoked permission, a device
 * unplugged mid-read, a directory picked by mistake — is a different problem
 * from a file that read fine and turned out to be something else, and the two
 * want different things from the reader.
 */
export async function readCampaignFile(file: Blob): Promise<SaveFileResult> {
  let text: string;

  try {
    text = await file.text();
  } catch {
    return failure(
      'unreadable-file',
      'This file could not be read. If it is on a drive or a phone, check it is still ' +
        'connected, then pick it again.',
    );
  }

  return parseCampaignFile(text);
}
