/**
 * The migration chain — the reason a campaign started in Phase 0 can still be
 * opened in Phase 4.
 *
 * `Campaign` is deliberately thin today and will grow every phase. Each time
 * its persisted shape changes, `CURRENT_SCHEMA_VERSION` goes up by one, a step
 * is added here, and a fixture of the shape being left behind is checked in.
 * The guard test in `migrations.test.ts` fails if any of those three drift
 * apart, because a harness that silently stops covering an old shape is worse
 * than no harness at all: the failure surfaces as an unloadable save on
 * someone's tablet months later.
 */

import { CURRENT_SCHEMA_VERSION, type Campaign } from '../engine/campaign';

/**
 * A save part-way through the chain. Not a `Campaign` — only the final step's
 * output is one, and typing the intermediates as `Campaign` would make every
 * historical shape claim to be the current one.
 */
export type PersistedCampaign = Readonly<Record<string, unknown>>;

export interface MigrationStep {
  /** The schema version this step reads. */
  readonly from: number;

  /**
   * Always `from + 1`. Steps move one version at a time so the registry is a
   * chain that can be checked for holes, rather than a set of jumps where a
   * missing link only shows up on the one save that needed it.
   */
  readonly to: number;

  /**
   * Takes the previous shape to the next. It does not set `schemaVersion` —
   * `migrate` stamps that once at the end, so a step can only get the data
   * change wrong, never the bookkeeping.
   */
  readonly up: (previous: PersistedCampaign) => PersistedCampaign;
}

/**
 * v1 → v2: `survivors` stopped being a placeholder.
 *
 * **This step changes no data, and that is the correct answer rather than a
 * lazy one.** A v1 campaign's `survivors` is `[]`, which is already a valid v2
 * roster, because v1 genuinely could not hold a survivor — Phase 0 shipped no
 * rules to build one from. There is nothing to convert.
 *
 * What changed is what the version *number* means, and the bump earns its keep
 * in one direction only: opening a new save in an old build. `saveFile.ts`
 * validates a campaign against the shape the build knows, and a Phase 0 build
 * rejects any non-empty survivor list outright. Without the bump it would
 * report a perfectly good save as *"not complete: its survivor list holds
 * survivors this version cannot read"* — a damaged-file message for an undamaged
 * file. With it, the same build refuses on version first and says *"saved by a
 * newer version of the app — update the app"*, which is both true and something
 * the reader can act on.
 *
 * That is only observable from an older build, so no test here can prove it.
 */
const survivorsBecameReal: MigrationStep = {
  from: 1,
  to: 2,
  up: (previous) => previous,
};

/**
 * v2 → v3: campaigns record whether the starting community is finished.
 *
 * **The first step in this chain that actually moves data** — v1 → v2 changed
 * nothing and earned its keep purely through the version number.
 *
 * It answers **`true`**, which is the opposite of what `createNewCampaign`
 * answers for a brand-new campaign, and the difference is the point. The
 * ten-tier-level budget (pg. 13) did not exist when a v2 campaign was written,
 * so its roster was built without ever being checked against it. Defaulting
 * those campaigns to `false` would take a perfectly good six-survivor community
 * and start reporting it as over budget the moment the player updated the app.
 * A new campaign has no such history, so it starts under the check.
 *
 * The honest summary: `false` means "still building and never told otherwise";
 * for a campaign from before the question existed, the truthful answer is that
 * nobody was ever asked, and not-checking is the safer reading of that.
 */
const startingCommunityBuiltRecorded: MigrationStep = {
  from: 2,
  to: 3,
  up: (previous) => ({ ...previous, startingCommunityBuilt: true }),
};

/**
 * v3 → v4: campaigns can record which origin they are running.
 *
 * **A no-op on data, and unlike v1 → v2 that is the answer rather than a
 * placeholder for one.** `origin` is optional: a campaign not using an origin
 * simply has no origin, and a v3 campaign was written before the question could
 * be asked, so absent is already the truthful answer for every one of them.
 * Filling in a default would invent a campaign setting nobody chose.
 *
 * The step still earns the version bump, for the reason v1 → v2 did: a v4 save
 * carrying an origin, opened in a v3 build, is refused on version with *"update
 * the app"* rather than accepted and then silently stripped of the field on the
 * next export.
 */
const originRecorded: MigrationStep = {
  from: 3,
  to: 4,
  up: (previous) => previous,
};

/**
 * v4 → v5: campaigns can hold a base.
 *
 * **A no-op on data, and the reason is different again.** v1 → v2 changed nothing because `survivors` was already
 * `[]`; v3 → v4 changed nothing because absent is what "no origin" means. Here
 * it is because `base` was already `null` and null still means the same thing:
 * a campaign that has not claimed a base. Every v4 campaign is in exactly that
 * state, since a v4 build could not put anything else there.
 *
 * The bump earns its keep the way v3 → v4 did, and more so: a v5 save with a
 * base, opened in a v4 build, would fail that build's shape check with *"it has
 * a base, which this version cannot read"* — a damaged-file message for an
 * undamaged file. Refusing on version instead says *"update the app"*, which is
 * both true and actionable.
 */
const baseBecameReal: MigrationStep = {
  from: 4,
  to: 5,
  up: (previous) => previous,
};

/**
 * v5 → v6: `log` stopped being a placeholder.
 *
 * **A no-op on data, and the closest parallel in this chain is v1 → v2** — the
 * one where `survivors` became real. A v5 campaign's `log` is `[]`, which is
 * already a valid v6 log, because v5 genuinely could not hold an entry: nothing
 * in the app wrote one and `saveFile.ts` refused any file that arrived with a
 * populated log.
 *
 * Backfilling is not on the table and is worth saying out loud. A v5 campaign
 * has a base, a roster and a turn number, and every one of those is the *result*
 * of things that happened — the log wants the things themselves, and a campaign
 * saved before there was a log has no record of them. Inventing entries from
 * the end state would produce a history that never happened, dated to a moment
 * it did not happen in. An empty log on an old campaign is the truth.
 *
 * The bump earns its keep the way v4 → v5 did: a v6 save carrying a log,
 * opened in a v5 build, hits that build's shape check and is told the file
 * *"holds entries this version cannot read"* — a damaged-file message for a
 * perfectly good file. Refusing on version instead says *"update the app"*.
 */
const logBecameReal: MigrationStep = {
  from: 5,
  to: 6,
  up: (previous) => previous,
};

/** Ordered oldest first: index `i` migrates version `i + 1` to `i + 2`. */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  survivorsBecameReal,
  startingCommunityBuiltRecorded,
  originRecorded,
  baseBecameReal,
  logBecameReal,
];

/** Why a save could not be brought forward. */
export type MigrationErrorReason = 'unreadable-version' | 'future-version';

export interface MigrationError {
  readonly reason: MigrationErrorReason;

  /** A sentence for a person holding a tablet mid-campaign, not a stack trace. */
  readonly message: string;
}

/**
 * A discriminated result rather than a thrown error.
 *
 * Z0-5 wraps this in `parseCampaignFile`, which is itself a result type over a
 * pipeline of fallible steps (parse, validate, migrate). Returning a result
 * lets that pipeline forward a failure as data; throwing would force a
 * try/catch in the middle of it and make the one interesting case — a save from
 * a newer version — indistinguishable from a genuine bug at the call site.
 */
export type MigrationResult =
  | { readonly ok: true; readonly campaign: Campaign }
  | { readonly ok: false; readonly error: MigrationError };

function readSchemaVersion(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const version = (raw as { schemaVersion?: unknown }).schemaVersion;

  return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null;
}

/**
 * Chains a save forward to `CURRENT_SCHEMA_VERSION`.
 *
 * Versioning is all this owns. It trusts Z0-5 to have checked the shape first
 * and to check it again afterwards, so the cast at the end asserts what the
 * chain is responsible for producing, not what has been proven about `raw`.
 */
export function migrate(raw: unknown): MigrationResult {
  const version = readSchemaVersion(raw);

  if (version === null) {
    return {
      ok: false,
      error: {
        reason: 'unreadable-version',
        message:
          'This file does not say which save format it uses, so it is probably not a County Road Z campaign.',
      },
    };
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        reason: 'future-version',
        // Refused rather than opened. A newer version wrote fields this build
        // knows nothing about, and loading it would quietly drop them the next
        // time the campaign was saved.
        message:
          `This campaign was saved by a newer version of the app (save format ${version}; ` +
          `this version reads up to ${CURRENT_SCHEMA_VERSION}). Update the app and open it ` +
          `again — opening it here would discard whatever the newer version added.`,
      },
    };
  }

  let working = raw as PersistedCampaign;

  for (const step of MIGRATION_STEPS) {
    if (step.from < version) continue;
    working = step.up(working);
  }

  return {
    ok: true,
    campaign: { ...working, schemaVersion: CURRENT_SCHEMA_VERSION } as unknown as Campaign,
  };
}
