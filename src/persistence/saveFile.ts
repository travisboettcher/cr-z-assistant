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
  'invalid-json' | 'not-a-campaign' | 'damaged-campaign' | MigrationErrorReason;

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

/**
 * Names the first thing wrong with a would-be current-shape `Campaign`, or
 * `null` if there is nothing wrong with it.
 *
 * Phrases are written to slot into "…is not a complete campaign: <problem>.",
 * because "invalid field: phase" tells someone mid-campaign nothing they can
 * act on. Order matters only in that the first problem found is the one
 * reported — a file with several is rarely worth enumerating.
 *
 * This describes the shape as it is *today*. When Phase 1 gives `survivors` a
 * real element type, this function changes in the same commit as the migration
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

  // `survivors`, `base` and `log` are typed empty because Phase 0 genuinely
  // cannot hold any of them. Accepting a populated one would let a file put
  // data into the app that no code here knows how to read; a save that legally
  // has survivors comes from a later version, and `migrate` refuses that first
  // with a message that actually tells the reader to update the app.
  if (!Array.isArray(value.survivors) || value.survivors.length > 0) {
    return 'its survivor list is missing, or holds survivors this version cannot read';
  }
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
