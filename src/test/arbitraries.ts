/**
 * Generators for property-based tests (`fast-check`).
 *
 * **Why these exist.** The rest of the suite tests this app against inputs a
 * person thought of, and that person also wrote the code. A hand-written list
 * of hostile save files is a list of ways a file can be wrong that *I* imagined;
 * it says nothing about the ways I did not. These generate inputs nobody wrote
 * down.
 *
 * **`campaignArbitrary` is typed as producing a `Campaign` on purpose.** That
 * makes this module a second place the persisted shape is written down: when
 * Phase 2 gives `base` a real type, this file stops compiling, and a
 * disagreement between the generator and the type is a bug in one of them. A
 * generator typed `any` would silently keep passing while testing the old shape.
 *
 * Not shipped: the bundle is built from `main.tsx` down, nothing outside a test
 * imports this file, and so neither it nor `fast-check` is reachable from the
 * app. The build size is the check on that claim, not this sentence.
 */

import fc from 'fast-check';
import { BASES, BASE_IDS } from '../data/bases';
import { FACILITY_IDS, UPGRADE_IDS } from '../data/facilities';
import { COMMON_SKILLS, SKILLS, STATS, type Skill } from '../data/skills';
import { D10_RESULTS } from '../data/dice';
import { TIERS } from '../data/tiers';
import { MATERIALS, type Materials } from '../data/materials';
import { CAMPAIGN_ORIGINS } from '../data/origins';
import { CAMPAIGN_PHASES, HEALTH_SOURCES, XP_SOURCES } from '../data/turn';
import { TURN_SEQUENCE } from '../engine/turn';
import { CURRENT_SCHEMA_VERSION } from '../engine/campaign';
import type {
  Assignment,
  Base,
  Campaign,
  Project,
  SkillLevels,
  SlotState,
  Stats,
  Survivor,
} from '../engine/campaign';
import type { CampaignEvent, LogEntry } from '../engine/log';

/**
 * Any single UTF-16 code unit — **including an unpaired surrogate**.
 *
 * The built-in units all produce well-formed strings: `fc.string()` with
 * `unit: 'binary'` emits valid code points and keeps surrogate pairs intact, so
 * a generator using it never reaches the case worth reaching. Sampling 300
 * campaigns from an earlier draft of this file produced exactly zero lone
 * surrogates, which is how that was caught.
 *
 * Lone surrogates matter because they are the input `JSON.stringify` had to be
 * amended for in ES2019 (well-formed stringify): before that it emitted invalid
 * UTF-16 that could not be parsed back. A save file is written by one build and
 * read by another, so this is a real round trip, not a theoretical one.
 */
const anyCodeUnit = fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code));

/**
 * A name, and the reason this is not `fc.string()`.
 *
 * `name` is the one free-text field in the whole save file, so it is where a
 * round trip realistically breaks: quotes, backslashes, newlines, astral-plane
 * emoji, right-to-left marks, and unpaired surrogates. A generator restricted to
 * the default alphabet would emit `abc` forever and prove nothing about
 * serialization at all.
 */
const anyName = fc.string({ unit: anyCodeUnit, maxLength: 40 });

/** An id, which the parser requires to be a non-empty string and nothing more. */
const anyId = fc.string({ unit: anyCodeUnit, minLength: 1, maxLength: 40 });

/**
 * A count the save-file parser accepts: a whole number, zero or more.
 *
 * Capped well above anything the rules produce. The point is not to explore
 * large numbers — it is that a level of 12 or an XP balance of 900 must still
 * *round-trip*, because Z1-7's override lets a player save a survivor the rules
 * would refuse, and a file that refused to reopen would make the override a
 * feature that silently destroys the save that used it.
 */
const anyCount = fc.integer({ min: 0, max: 999 });

/**
 * A material count.
 *
 * The parser asks only for a finite number, not a whole one, so the type
 * genuinely permits `2.5` — and this is deliberately narrower than that. The
 * last test in `roundTrip.property.test.ts` records the one finite number that
 * does not survive JSON, and why constraining the generator is the right answer
 * to it rather than adding a branch to the app.
 */
const anyMaterialCount = fc.integer({ min: 0, max: 9999 });

/**
 * A change to a material count, which can go either way.
 *
 * A turn's haul is the mission's rolls plus what the base made, and a facility
 * that eats Food (pg. 55) can outweigh both — so a `materials-added` entry is
 * the one place in the log where a negative number is a real record rather
 * than a damaged file.
 */
const anyAmount = fc.integer({ min: -9999, max: 9999 });

/**
 * An ISO 8601 timestamp, which is what `createNewCampaign` writes and what a
 * log entry is stamped with.
 *
 * `noInvalidDate` is load-bearing rather than tidy. `fc.date()` will happily
 * produce an `Invalid Date`, whose `toISOString()` throws — so the generator
 * itself would blow up rather than the property failing. That was latent from
 * the day this was written and only surfaced when Z3-2 started drawing up to
 * nine timestamps per campaign instead of one: at one draw apiece it simply
 * never came up.
 */
const anyCreatedAt = fc
  .date({
    min: new Date('1970-01-01T00:00:00.000Z'),
    max: new Date('2999-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString());

function statsArbitrary(): fc.Arbitrary<Stats> {
  return fc.record(
    Object.fromEntries(STATS.map((stat) => [stat, anyCount])) as Record<
      keyof Stats,
      fc.Arbitrary<number>
    >,
  );
}

/**
 * Some subset of the twenty skills, at any level.
 *
 * **Deliberately not rule-legal.** It will happily give a Rookie four skills at
 * level 9. Structural validity is what the save file requires; legality is a
 * rule the player may override (Z1-7a), and an overridden survivor is exactly
 * the survivor most likely to break a round trip and least likely to appear in
 * a hand-written fixture.
 */
function skillsArbitrary(): fc.Arbitrary<SkillLevels> {
  return fc
    .uniqueArray(fc.tuple(fc.constantFrom<Skill>(...SKILLS), anyCount), {
      // Unique by skill, not by pair, so a skill never appears twice.
      selector: ([skill]) => skill,
      maxLength: SKILLS.length,
    })
    .map((entries) => {
      const chosen: SkillLevels = {};
      for (const [skill, level] of entries) chosen[skill] = level;
      return chosen;
    });
}

export function survivorArbitrary(): fc.Arbitrary<Survivor> {
  return fc.record({
    id: anyId,
    name: anyName,
    tier: fc.constantFrom(...TIERS),
    stats: statsArbitrary(),
    skills: skillsArbitrary(),
    move: anyCount,
    defense: anyCount,
    currentHp: anyCount,
    xp: anyCount,
  });
}

function materialsArbitrary(): fc.Arbitrary<Materials> {
  return fc.record(
    Object.fromEntries(MATERIALS.map((material) => [material, anyMaterialCount])) as Record<
      keyof Materials,
      fc.Arbitrary<number>
    >,
  );
}

/**
 * What a player may have done to one slot.
 *
 * `requiredKeys: []` is the point of this generator rather than a detail of it:
 * every field of `SlotState` is optional, absent means the same as false, and
 * the round trip can only get that wrong in one direction — by writing `false`
 * or `null` where the campaign said nothing at all. Generating states that
 * leave fields out is what catches it.
 */
function slotStateArbitrary(): fc.Arbitrary<SlotState> {
  return fc.record(
    {
      cleared: fc.constant(true as const),
      built: fc.record({
        facility: fc.constantFrom(...FACILITY_IDS),
        builtOnTurn: fc.integer({ min: 1, max: 9999 }),
      }),
      upgrades: fc.array(fc.constantFrom(...UPGRADE_IDS), { maxLength: 4 }),
      power: fc.constant(true as const),
      water: fc.constant(true as const),
    },
    { requiredKeys: [] },
  );
}

/**
 * A base this build could have written.
 *
 * Slots are drawn from the chosen base's own layout, because a slot id outside
 * it is a damaged save by definition and `parseCampaignFile` says so — the
 * round-trip property is a claim about files this app writes, not about every
 * object that fits the type. What it does **not** respect is legality: a
 * Watchtower may land in an Indoor slot and a Kitchen may carry a Watchtower's
 * upgrade, because a player can override both (Z2-5, Z2-6) and an overridden
 * base is exactly the one most likely to break a round trip.
 */
export function baseArbitrary(): fc.Arbitrary<Base> {
  return fc.constantFrom(...BASE_IDS).chain((id) => {
    const slotIds = (BASES[id].slots as readonly { readonly id: string }[]).map((slot) => slot.id);

    return fc.record({
      id: fc.constant(id),
      slots: fc
        .uniqueArray(fc.tuple(fc.constantFrom(...slotIds), slotStateArbitrary()), {
          selector: ([slot]) => slot,
          maxLength: slotIds.length,
        })
        .map((entries) => Object.fromEntries(entries) as Record<string, SlotState>),
    });
  });
}

/**
 * Any one of the fourteen things that can happen.
 *
 * Written out per kind rather than generated from a shared shape, and that is
 * the point: `CampaignEvent` is a union whose members carry different fields,
 * and the round trip can only get one wrong by dropping a field that only one
 * kind has. A generator that emitted a common subset would never notice.
 *
 * Typed as producing a `CampaignEvent`, so a kind added to `log.ts` without a
 * line here is a missing case rather than a silently untested one — the same
 * guarantee `campaignArbitrary` gives the campaign's own shape.
 */
function campaignEventArbitrary(): fc.Arbitrary<CampaignEvent> {
  const survivor = { survivor: anyId, name: anyName };

  return fc.oneof<fc.Arbitrary<CampaignEvent>[]>(
    fc.record({ kind: fc.constant('campaign-started' as const), name: anyName }),
    fc.record({ kind: fc.constant('phase-entered' as const) }),
    fc.record({ kind: fc.constant('turn-began' as const) }),
    fc.record({ kind: fc.constant('planning-began' as const) }),
    fc.record({
      kind: fc.constant('materials-added' as const),
      food: anyAmount,
      fuel: anyAmount,
      hardware: anyAmount,
      rare: anyAmount,
    }),
    fc.record({
      kind: fc.constant('survivors-fed' as const),
      required: anyCount,
      hunger: anyCount,
    }),
    fc.record({
      kind: fc.constant('rot-checked' as const),
      survivor: anyId,
      name: anyName,
      roll: fc.constantFrom(...D10_RESULTS),
      target: anyAmount,
      passed: fc.boolean(),
    }),
    fc.record({
      kind: fc.constant('bite-restrained' as const),
      survivor: anyId,
      name: anyName,
    }),
    fc.record({
      kind: fc.constant('survivor-bitten' as const),
      survivor: anyId,
      name: anyName,
      damage: fc.integer({ min: 1, max: 9 }),
    }),
    fc.record({
      kind: fc.constant('facility-ordered' as const),
      slot: anyId,
      facility: fc.constantFrom(...FACILITY_IDS),
    }),
    fc.record({
      kind: fc.constant('upgrade-ordered' as const),
      slot: anyId,
      upgrade: fc.constantFrom(...UPGRADE_IDS),
    }),
    fc.record({ kind: fc.constant('clearing-ordered' as const), slot: anyId }),
    fc.record({ kind: fc.constant('project-cancelled' as const), slot: anyId }),
    fc.record({ kind: fc.constant('project-unfinished' as const), slot: anyId }),
    fc.record({
      kind: fc.constant('storage-checked' as const),
      food: anyCount,
      fuel: anyCount,
      hardware: anyCount,
    }),
    fc.record({
      kind: fc.constant('horde-checked' as const),
      roll: fc.constantFrom(...D10_RESULTS),
      threat: anyAmount,
      siege: fc.boolean(),
    }),
    fc.record({
      kind: fc.constant('health-restored' as const),
      survivor: anyId,
      name: anyName,
      health: fc.integer({ min: 1, max: 20 }),
      source: fc.constantFrom(...HEALTH_SOURCES),
    }),
    fc.record({
      kind: fc.constant('xp-awarded' as const),
      survivor: anyId,
      name: anyName,
      amount: fc.integer({ min: 1, max: 20 }),
      source: fc.constantFrom(...XP_SOURCES),
    }),
    fc.record({ kind: fc.constant('starting-community-settled' as const), built: fc.boolean() }),
    fc.record({
      kind: fc.constant('survivor-added' as const),
      ...survivor,
      tier: fc.constantFrom(...TIERS),
    }),
    fc.record({
      kind: fc.constant('survivor-recruited' as const),
      ...survivor,
      tier: fc.constantFrom(...TIERS),
      roll: fc.constantFrom(...D10_RESULTS),
    }),
    fc.record({
      kind: fc.constant('survivor-left' as const),
      ...survivor,
      tier: fc.constantFrom(...TIERS),
    }),
    fc.record({
      kind: fc.constant('survivor-promoted' as const),
      ...survivor,
      tier: fc.constantFrom(...TIERS),
    }),
    fc.record({
      kind: fc.constant('skill-level-bought' as const),
      ...survivor,
      skill: fc.constantFrom(...SKILLS),
      level: fc.integer({ min: 0, max: 4 }),
    }),
    fc.record({
      kind: fc.constant('common-skill-bought' as const),
      ...survivor,
      skill: fc.constantFrom(...COMMON_SKILLS),
      score: fc.integer({ min: 0, max: 8 }),
    }),
    fc.record({ kind: fc.constant('base-claimed' as const), base: fc.constantFrom(...BASE_IDS) }),
    fc.record({
      kind: fc.constant('facility-built' as const),
      slot: anyId,
      facility: fc.constantFrom(...FACILITY_IDS),
    }),
    fc.record({
      kind: fc.constant('upgrade-built' as const),
      slot: anyId,
      upgrade: fc.constantFrom(...UPGRADE_IDS),
    }),
    fc.record({ kind: fc.constant('slot-cleared' as const), slot: anyId }),
  );
}

/** One entry: when it happened, in both clocks, and what happened. */
function logEntryArbitrary(): fc.Arbitrary<LogEntry> {
  return fc.record({
    turn: fc.integer({ min: 1, max: 9999 }),
    phase: fc.constantFrom(...CAMPAIGN_PHASES),
    at: anyCreatedAt,
    event: campaignEventArbitrary(),
  });
}

/**
 * One task, drawn from all six.
 *
 * Written out per task rather than generated from a shared shape, for the
 * reason `campaignEventArbitrary` is: the members carry different fields, and a
 * round trip can only get one wrong by dropping a field that only one task has.
 */
function assignmentArbitrary(): fc.Arbitrary<Assignment> {
  return fc.oneof<fc.Arbitrary<Assignment>[]>(
    fc.record({ task: fc.constant('staff' as const), slot: anyId }),
    fc.record({ task: fc.constant('project' as const) }),
    fc.record({ task: fc.constant('rest' as const) }),
    fc.record({ task: fc.constant('healing' as const) }),
    fc.record({ task: fc.constant('mission' as const), team: fc.integer({ min: 1, max: 4 }) }),
    fc.record({ task: fc.constant('scavenging' as const) }),
  );
}

/**
 * A campaign this build could have written.
 *
 * `schemaVersion` is pinned to the current one rather than generated, because
 * the round-trip property is a claim about the format this build *writes*. An
 * older version would be migrated forward on the way back in, and would then
 * — correctly — not equal what went out; that is the migration chain's own
 * tests' job, and they use real fixture files rather than generated ones.
 */
export function campaignArbitrary(): fc.Arbitrary<Campaign> {
  return unassignedCampaignArbitrary().chain((campaign) =>
    assignmentsArbitrary(campaign.survivors).map((assignments) => ({ ...campaign, assignments })),
  );
}

/**
 * Tasks for some of these survivors, and none for the rest.
 *
 * **Keyed by ids the campaign actually holds**, which is why this is chained on
 * to the roster rather than generated beside it: an assignment naming nobody is
 * a damaged save by definition and `parseCampaignFile` says so, and the
 * round-trip property is a claim about the files this app writes.
 *
 * Some rather than all, because the partial record is the point — a Planning
 * Phase spends most of its life half-assigned, and a generator that filled
 * every id would never produce the state the screen is mostly looking at.
 */
function assignmentsArbitrary(
  survivors: readonly Survivor[],
): fc.Arbitrary<Record<string, Assignment>> {
  return fc
    .uniqueArray(
      fc.tuple(fc.constantFrom('', ...survivors.map((one) => one.id)), assignmentArbitrary()),
      {
        selector: ([id]) => id,
        maxLength: Math.max(survivors.length, 1),
      },
    )
    .map((entries) =>
      Object.fromEntries(entries.filter(([id]) => survivors.some((one) => one.id === id))),
    );
}

/**
 * One queued project.
 *
 * The slot is a free string rather than a real id, because the parser accepts a
 * project for a slot the base does not have — a queue is a record of what was
 * ordered, and Z1-7's override means a campaign can hold one the rules would
 * refuse. What the round trip has to survive is the shape.
 */
function projectArbitrary(): fc.Arbitrary<Project> {
  const orderedOnTurn = fc.integer({ min: 1, max: 9999 });
  // What the order was charged, which from v12 every queued project carries.
  // Generated rather than fixed, because the round trip has to carry the pair
  // of numbers back unchanged and a constant would pass a writer that dropped
  // one of them.
  const charged = fc.record({
    hardware: fc.integer({ min: 0, max: 20 }),
    labor: fc.integer({ min: 0, max: 20 }),
  });

  return fc.oneof(
    fc.record({
      kind: fc.constant('facility' as const),
      slot: anyId,
      facility: fc.constantFrom(...FACILITY_IDS),
      orderedOnTurn,
      charged,
    }),
    fc.record({
      kind: fc.constant('upgrade' as const),
      slot: anyId,
      upgrade: fc.constantFrom(...UPGRADE_IDS),
      orderedOnTurn,
      charged,
    }),
    fc.record({ kind: fc.constant('clearing' as const), slot: anyId, orderedOnTurn, charged }),
  );
}

/** The campaign shape, before the assignments that have to know its roster. */
function unassignedCampaignArbitrary(): fc.Arbitrary<Omit<Campaign, 'assignments'>> {
  return fc.record(
    {
      schemaVersion: fc.constant(CURRENT_SCHEMA_VERSION),
      id: anyId,
      name: anyName,
      createdAt: anyCreatedAt,
      turn: fc.integer({ min: 1, max: 9999 }),
      step: fc.constantFrom(...TURN_SEQUENCE),
      // Null as often as a number, because "never besieged" is the state most
      // campaigns are in and the one a round trip most easily loses.
      origin: fc.constantFrom(...CAMPAIGN_ORIGINS),
      materials: materialsArbitrary(),
      survivors: fc.array(survivorArbitrary(), { maxLength: 6 }),
      startingCommunityBuilt: fc.boolean(),
      // Half the campaigns have claimed a base and half have not; null is a
      // real state and a round trip can get it wrong by writing `{}`.
      base: fc.option(baseArbitrary(), { nil: null }),
      // No longer pinned empty: from v6 a log is real, and an entry is the one
      // place in the file where objects of different shapes share an array.
      log: fc.array(logEntryArbitrary(), { maxLength: 8 }),
      projects: fc.array(projectArbitrary(), { maxLength: 4 }),
    },
    // Every key but `origin`, which is optional on `Campaign` — so half the
    // generated campaigns leave it out entirely. Both are real files, and the
    // absent one is the one a round trip can get wrong by writing `null`.
    {
      requiredKeys: [
        'schemaVersion',
        'id',
        'name',
        'createdAt',
        'turn',
        'step',
        'projects',
        'materials',
        'survivors',
        'startingCommunityBuilt',
        'base',
        'log',
      ],
    },
  );
}

/**
 * Arbitrary JSON — the shape `migrate` and `parseCampaignFile` have to survive
 * being handed, rather than the shape they hope for.
 */
export function jsonValueArbitrary(): fc.Arbitrary<unknown> {
  return fc.jsonValue();
}
