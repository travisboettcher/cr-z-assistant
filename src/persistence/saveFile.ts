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
 * every migration — more surface than it saves at this size. Phases 2 and 3
 * have since made the shape genuinely wide, and the two tables below are the
 * first place it starts to look like a schema written longhand. Still not worth
 * a library: what a table buys here is the exhaustive `Record` over the event
 * kinds, which is a typecheck a schema would have to be told about.
 */

import { BASES } from '../data/bases';
import { FACILITIES, facilityOfUpgrade, type UpgradeId } from '../data/facilities';
import { COMMON_SKILLS, SKILL_STATS, STATS } from '../data/skills';
import { D10_RESULTS } from '../data/dice';
import { TIERS } from '../data/tiers';
import { MATERIALS } from '../data/materials';
import { CAMPAIGN_ORIGINS } from '../data/origins';
import { CAMPAIGN_PHASES, HEALTH_SOURCES, XP_SOURCES } from '../data/turn';
import type { Assignment, Campaign, Project } from '../engine/campaign';
import type { CampaignEventKind } from '../engine/log';
import { TURN_SEQUENCE } from '../engine/turn';
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

/**
 * Whether a catalogue actually has an entry under this name.
 *
 * **`Object.hasOwn`, never `in`.** `in` walks the prototype chain, so
 * `'toString' in FACILITIES` is `true` and a save file naming a facility
 * `toString` sails through validation — after which the screen that looks it up
 * gets `Function.prototype.toString` and either renders nonsense or throws
 * somewhere far from here. The names to worry about are ordinary strings a
 * person could type into a file by hand or by accident: `constructor`,
 * `toString`, `valueOf`.
 *
 * This module's contract is that a damaged file comes back as a sentence, never
 * as an exception, and `in` is the one thing in it that quietly broke that.
 */
function isKeyOf(catalogue: object, key: string): boolean {
  return Object.hasOwn(catalogue, key);
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
    if (!isKeyOf(SKILL_STATS, skill)) return `has a skill this version does not know: ${skill}`;
    if (!isCountFromZero(level)) return `has an unreadable level for ${skill}`;
  }

  if (!isCountFromZero(value.move)) return 'has no move score';
  if (!isCountFromZero(value.defense)) return 'has no defense score';
  if (!isCountFromZero(value.currentHp)) return 'has unreadable health';
  if (!isCountFromZero(value.xp)) return 'has unreadable experience';

  return null;
}

/**
 * Names the first thing structurally wrong with one slot's state, or `null`.
 *
 * **Shape only, exactly as `describeSurvivorProblem` is.** Whether the upgrade
 * belongs to the facility it sits on, whether the facility fits the slot's
 * kind, whether there are more than three upgrades — those are rules, and
 * Z2-5 and Z2-6 let a player override them on purpose. A save written with an
 * override in it has to open, or the override becomes a feature that destroys
 * the campaign that used it.
 *
 * So: does the facility exist, does the upgrade exist, is the turn a turn. Not:
 * is any of it a legal base.
 */
function describeSlotProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'is not a slot';

  if (value.cleared !== undefined && value.cleared !== true) {
    return 'records something other than cleared for its clearing project';
  }

  const built: unknown = value.built;
  if (built !== undefined) {
    if (!isRecord(built)) return 'has an unreadable facility';
    if (typeof built.facility !== 'string' || !isKeyOf(FACILITIES, built.facility)) {
      return `holds a facility this version does not know: ${String(built.facility)}`;
    }
    if (!isCountFromOne(built.builtOnTurn)) return 'does not say which turn it was built on';
  }

  const upgrades: unknown = value.upgrades;
  if (upgrades !== undefined) {
    if (!Array.isArray(upgrades)) return 'has an unreadable upgrade list';
    for (const upgrade of upgrades) {
      if (typeof upgrade !== 'string' || facilityOfUpgrade(upgrade as UpgradeId) === undefined) {
        return `has an upgrade this version does not know: ${String(upgrade)}`;
      }
    }
  }

  for (const utility of ['power', 'water'] as const) {
    if (value[utility] !== undefined && value[utility] !== true) {
      return `records something other than assigned for its ${utility}`;
    }
  }

  return null;
}

/**
 * Names the first thing structurally wrong with a base, or `null`.
 *
 * A slot id that is not in the claimed base's layout is a damaged save rather
 * than a slot the app has not heard of: `Base.slots` is keyed by the layout in
 * `src/data/bases.ts`, so a key outside it refers to nothing and no later phase
 * could render or reason about it.
 */
function describeBaseProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'its base is not a base';

  if (typeof value.id !== 'string' || !isKeyOf(BASES, value.id)) {
    return `its base is one this version does not know: ${String(value.id)}`;
  }

  const slots: unknown = value.slots;
  if (!isRecord(slots)) return 'its base has no slots';

  const layout = BASES[value.id as keyof typeof BASES].slots;

  for (const [id, state] of Object.entries(slots)) {
    if (!layout.some((slot) => slot.id === id)) {
      return `its base has a slot the ${value.id} does not have: ${id}`;
    }

    const problem = describeSlotProblem(state);
    if (problem !== null) return `the ${id} slot of its base ${problem}`;
  }

  return null;
}

/**
 * How to check one field of a log event, by the field's name.
 *
 * Shared across events rather than written per kind, because the vocabulary is
 * small and the same `slot` means the same thing whether a facility went up in
 * it or the rubble came out. Two names for skills, though — a governed skill
 * and a common skill are different sets (pg. 9), and one checker covering both
 * would accept `move` where only the twenty are legal.
 */
const EVENT_FIELD_CHECKS = {
  id: (value: unknown) => typeof value === 'string' && value !== '',
  name: (value: unknown) => typeof value === 'string',
  count: isCountFromZero,
  countFromOne: isCountFromOne,
  // Materials added in a turn can come out negative: a facility that eats Food
  // (pg. 55) can outweigh what the mission recovered.
  amount: (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value),
  xpSource: (value: unknown) => XP_SOURCES.some((source) => source === value),
  healthSource: (value: unknown) => HEALTH_SOURCES.some((source) => source === value),
  flag: (value: unknown) => typeof value === 'boolean',
  // For a field an older entry legitimately does not carry. Absent is a real
  // answer here and a damaged one everywhere else, which is why it is its own
  // check rather than a flag on the loop below.
  optionalCount: (value: unknown) => value === undefined || isCountFromZero(value),
  tier: (value: unknown) => TIERS.some((tier) => tier === value),
  roll: (value: unknown) => D10_RESULTS.some((result) => result === value),
  skill: (value: unknown) => typeof value === 'string' && isKeyOf(SKILL_STATS, value),
  commonSkill: (value: unknown) => COMMON_SKILLS.some((skill) => skill === value),
  base: (value: unknown) => typeof value === 'string' && isKeyOf(BASES, value),
  facility: (value: unknown) => typeof value === 'string' && isKeyOf(FACILITIES, value),
  upgrade: (value: unknown) =>
    typeof value === 'string' && facilityOfUpgrade(value as UpgradeId) !== undefined,
} as const;

type EventFieldCheck = keyof typeof EVENT_FIELD_CHECKS;

/**
 * The fields each kind of event carries, and how to check each one.
 *
 * A full `Record` over the event kinds, so an event added to `log.ts` without a
 * line here fails the typecheck rather than sailing through validation
 * unchecked — the same guarantee `inFileOrder` gives the campaign's own fields.
 * `phase-entered` and `turn-began` carry nothing: which phase, and which turn,
 * are the entry's own.
 */
const EVENT_FIELDS: Record<
  CampaignEventKind,
  readonly (readonly [field: string, check: EventFieldCheck])[]
> = {
  'campaign-started': [['name', 'name']],
  'phase-entered': [],
  'turn-began': [],
  'starting-community-settled': [['built', 'flag']],
  'planning-began': [],
  'materials-added': [
    ['food', 'amount'],
    ['fuel', 'amount'],
    ['hardware', 'amount'],
    ['rare', 'amount'],
  ],
  'survivors-fed': [
    ['required', 'count'],
    ['hunger', 'count'],
    // Recorded since the hunger penalty stopped being re-priced by a later
    // departure; entries written before that do not carry it.
    ['population', 'optionalCount'],
  ],
  'rot-checked': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['roll', 'roll'],
    ['target', 'amount'],
    ['passed', 'flag'],
  ],
  'survivor-bitten': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['damage', 'countFromOne'],
  ],
  'facility-ordered': [
    ['slot', 'id'],
    ['facility', 'facility'],
  ],
  'upgrade-ordered': [
    ['slot', 'id'],
    ['upgrade', 'upgrade'],
  ],
  'clearing-ordered': [['slot', 'id']],
  'project-cancelled': [['slot', 'id']],
  'storage-checked': [
    ['food', 'count'],
    ['fuel', 'count'],
    ['hardware', 'count'],
  ],
  'horde-checked': [
    ['roll', 'roll'],
    ['threat', 'amount'],
    ['siege', 'flag'],
  ],
  'health-restored': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['health', 'countFromOne'],
    ['source', 'healthSource'],
  ],
  'xp-awarded': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['amount', 'countFromOne'],
    ['source', 'xpSource'],
  ],
  'survivor-added': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
  ],
  'survivor-recruited': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
    ['roll', 'roll'],
  ],
  'survivor-left': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
  ],
  'survivor-promoted': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['tier', 'tier'],
  ],
  'skill-level-bought': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['skill', 'skill'],
    ['level', 'count'],
  ],
  'common-skill-bought': [
    ['survivor', 'id'],
    ['name', 'name'],
    ['skill', 'commonSkill'],
    ['score', 'count'],
  ],
  'base-claimed': [['base', 'base']],
  'facility-built': [
    ['slot', 'id'],
    ['facility', 'facility'],
  ],
  'upgrade-built': [
    ['slot', 'id'],
    ['upgrade', 'upgrade'],
  ],
  'slot-cleared': [['slot', 'id']],
};

/**
 * Names the first thing structurally wrong with one log entry, or `null`.
 *
 * **Shape only, exactly as the survivor and slot checks are** — but the reason
 * differs, and it is worth being clear about. There is no "illegal log entry" to
 * be permissive about: a log records what happened, and what happened happened.
 * What this defends against is a file that was hand-edited or truncated, where
 * accepting an entry whose fields are missing would put `undefined` into a line
 * of someone's campaign history rather than saying the file is damaged.
 *
 * An unknown `kind` is the interesting case, and it is reported rather than
 * skipped: it means either a damaged file or a save from a newer version, and
 * `migrate` has already ruled out the second by the time this runs.
 */
function describeLogEntryProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'is not a log entry';

  if (!isCountFromOne(value.turn)) return 'does not say which turn it happened in';
  // No `typeof` guard, unlike the timestamp below. Strict equality against a
  // list of four strings already rejects everything that is not one of them,
  // and JSON has no value that is `===` a string without being one. A mutation
  // run said so first: the guard's mutant was equivalent, which is another way
  // of saying the guard did nothing.
  if (!CAMPAIGN_PHASES.some((phase) => phase === value.phase)) {
    return `happened in a phase that is not one of ${CAMPAIGN_PHASES.join(', ')}`;
  }
  // Here the `typeof` half *is* load-bearing: `Date.parse` coerces, so a bare
  // `2026` in a file parses as a perfectly good date and would sail through on
  // its own — and then render as 1970 on the history screen.
  if (typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) {
    return 'has a time that is missing or unreadable';
  }

  const event: unknown = value.event;
  if (!isRecord(event)) return 'does not say what happened';

  const kind = event.kind;
  // `typeof` again load-bearing, and for a stranger reason: `Object.hasOwn`
  // coerces its key, so `["turn-began"]` — which JSON can express — stringifies
  // to a name this table has.
  if (typeof kind !== 'string' || !isKeyOf(EVENT_FIELDS, kind)) {
    return `records something this version does not know about: ${String(kind)}`;
  }

  for (const [field, check] of EVENT_FIELDS[kind as CampaignEventKind]) {
    if (!EVENT_FIELD_CHECKS[check](event[field])) return `has an unreadable ${field}`;
  }

  return null;
}

/**
 * The tasks a survivor can be given, and the extra field each carries.
 *
 * A full `Record` over the union's own tag, so a task added to `Assignment`
 * without a line here fails the typecheck rather than sailing through
 * validation unchecked — the same guarantee `EVENT_FIELDS` gives log entries.
 * The four with no extra field are `null` rather than absent, so "this task
 * carries nothing" is stated rather than inferred from a missing key.
 */
const ASSIGNMENT_FIELDS: Record<Assignment['task'], readonly [string, EventFieldCheck] | null> = {
  staff: ['slot', 'id'],
  project: null,
  rest: null,
  healing: null,
  mission: ['team', 'countFromOne'],
  scavenging: null,
};

/**
 * Names the first thing structurally wrong with one survivor's assignment, or
 * `null`.
 *
 * **Shape only, and the line is in a different place here than for a slot.**
 * That a survivor is staffing a facility that does not exist, or resting at
 * full Health, or on a mission team while injured, are all *rules* (pg. 20–21)
 * — Z3-6 reports them and a player may be mid-way through fixing one when they
 * save. What this refuses is an assignment that refers to nothing: a task this
 * version has never heard of, or a Staff assignment that does not say where.
 */
function describeAssignmentProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'is not an assignment';

  const task = value.task;
  if (typeof task !== 'string' || !isKeyOf(ASSIGNMENT_FIELDS, task)) {
    return `is a task this version does not know: ${String(task)}`;
  }

  const field = ASSIGNMENT_FIELDS[task as Assignment['task']];
  if (field !== null && !EVENT_FIELD_CHECKS[field[1]](value[field[0]])) {
    return `has an unreadable ${field[0]}`;
  }

  return null;
}

/**
 * The fields each kind of project carries, and how to check each one.
 *
 * A full `Record` over the kinds, so a project kind added to `campaign.ts`
 * without a line here fails the typecheck rather than sailing through
 * validation unchecked — the same guarantee `EVENT_FIELDS` gives log events.
 * Every kind carries a slot and the turn it was ordered on; only two carry
 * anything else.
 */
const PROJECT_FIELDS: Record<
  Project['kind'],
  readonly (readonly [field: string, check: EventFieldCheck])[]
> = {
  facility: [['facility', 'facility']],
  upgrade: [['upgrade', 'upgrade']],
  clearing: [],
};

/**
 * Names the first thing structurally wrong with one queued project, or `null`.
 *
 * **Shape, not legality**, like everything else here. A project queued for a
 * slot the base does not have, or for a facility the slot could not hold, is a
 * rule the screens report rather than a damaged file — and Z1-7's override
 * means a campaign can genuinely hold one. What this refuses is a project that
 * refers to nothing: a kind this version has never heard of, or a facility id
 * that is not in the catalogue.
 */
function describeProjectProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'is not a project';

  const kind = value.kind;
  if (typeof kind !== 'string' || !isKeyOf(PROJECT_FIELDS, kind)) {
    return `is a kind of project this version does not know: ${String(kind)}`;
  }

  if (!EVENT_FIELD_CHECKS.id(value.slot)) return 'does not say which slot it is for';
  if (!isCountFromOne(value.orderedOnTurn)) return 'does not say which turn it was ordered on';

  for (const [field, check] of PROJECT_FIELDS[kind as Project['kind']]) {
    if (!EVENT_FIELD_CHECKS[check](value[field])) return `has an unreadable ${field}`;
  }

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
 * This describes the shape as it is *today*. When a later phase gives `log` a
 * real type, this function changes in the same commit as the migration step
 * that fills it in; those two drifting apart is exactly the failure the guard
 * test in `migrations.test.ts` is watching for.
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
  // The step, not the phase: a campaign records where in the turn it is and the
  // phase is derived from that. Named rather than listed in the message —
  // nineteen step ids is not a sentence anyone reads.
  if (!TURN_SEQUENCE.some((step) => step === value.step)) {
    return 'it does not say where in the turn it is, or names a step this version does not know';
  }

  // Absent is legal and means a campaign not using an origin, so only a present
  // value is checked — and a present one has to be a name this build knows,
  // because Phase 2 gates facilities on it and an unknown origin would quietly
  // hide them.
  if (value.origin !== undefined && !CAMPAIGN_ORIGINS.some((origin) => origin === value.origin)) {
    return `its origin is not one of ${CAMPAIGN_ORIGINS.join(', ')}`;
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

  if (typeof value.startingCommunityBuilt !== 'boolean') {
    return 'it does not say whether its starting community is finished';
  }

  // Null is a campaign that has not claimed a base, which is a real state and
  // not a missing field — so only a present base is checked.
  if (value.base !== null) {
    const problem = describeBaseProblem(value.base);
    if (problem !== null) return problem;
  }

  const assignments: unknown = value.assignments;
  if (!isRecord(assignments)) return 'it does not say what its survivors are doing';
  for (const [id, assignment] of Object.entries(assignments)) {
    // An assignment keyed by an id nobody on the roster has refers to nothing —
    // the same reasoning that makes a slot id outside the base's layout a
    // damaged save rather than a slot this version has not heard of.
    if (!value.survivors.some((survivor) => isRecord(survivor) && survivor.id === id)) {
      return `it assigns a task to somebody who is not in the community: ${id}`;
    }

    const problem = describeAssignmentProblem(assignment);
    if (problem !== null) return `the task it gives to ${id} ${problem}`;
  }

  if (!Array.isArray(value.projects)) return 'its project queue is missing';
  for (const [index, project] of value.projects.entries()) {
    const problem = describeProjectProblem(project);
    // Positional, like log entries: a project whose damaged field is the one
    // that says what it is cannot be pointed at by what it is.
    if (problem !== null) {
      return `project ${index + 1} of ${value.projects.length} ${problem}`;
    }
  }

  if (!Array.isArray(value.log)) return 'its campaign log is missing';
  for (const [index, entry] of value.log.entries()) {
    const problem = describeLogEntryProblem(entry);
    // Positional, like survivors: an entry whose damaged field is the one that
    // says what happened cannot be pointed at by what happened.
    if (problem !== null) return `log entry ${index + 1} of ${value.log.length} ${problem}`;
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
// Stryker disable all: reading the Blob is platform glue. The `unreadable-file`
// branch needs a `Blob` whose `text()` rejects, which is a stub of the platform
// rather than a case a real file reaches, and the path that matters — pick a
// file, get a campaign or a readable refusal — is driven end to end in
// `e2e/round-trip.spec.ts` against a real file input. Everything downstream of
// the read is `parseCampaignFile`, which is mutated and at 100% on its logic.
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
// Stryker restore all
