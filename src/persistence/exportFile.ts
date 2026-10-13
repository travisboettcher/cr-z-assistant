/**
 * Writing a save file — the export half of the round trip.
 *
 * The exported `.json` is the **durable** save. `localStorage` (Z0-10) is a
 * convenience layer on top of it; a cleared browser must not cost a campaign.
 * So this module's job beyond calling `JSON.stringify` is to produce something
 * a person can read and diff, under a name that sorts sensibly in a folder.
 *
 * **Handing it to the browser is not this module's job, on purpose (#180).**
 * Everything here is pure: no `document`, no `Blob`, no `URL.createObjectURL`.
 * `downloadCampaign` lived here too until a program that type-checks without
 * the DOM — a headless harness, a command-line tool — needed the serialiser and
 * could not import it without the browser coming along. It is in
 * `download.ts` now, and `eslint.config.js` refuses browser globals in this file
 * so the two cannot drift back together.
 */

import { BASES } from '../data/bases';
import { SKILLS, STATS } from '../data/skills';
import { MATERIALS } from '../data/materials';
import type { Base, Campaign, Project, SlotState, Survivor } from '../engine/campaign';
import type { CampaignEvent, LogEntry, MissionWound } from '../engine/log';
import { isMissionOutcome } from '../engine/missions';

/** Material counts in the fixed order from the engine, not insertion order. */
function orderedMaterials(campaign: Campaign): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const material of MATERIALS) {
    ordered[material] = campaign.materials[material];
  }
  return ordered;
}

/** Stats in the fixed order from the rules data. */
function orderedStats(survivor: Survivor): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const stat of STATS) {
    ordered[stat] = survivor.stats[stat];
  }
  return ordered;
}

/**
 * A survivor's skills in rulebook order rather than the order they were learnt.
 *
 * Only the skills the survivor actually has are written — `SkillLevels` is
 * partial on purpose, and filling in the other sixteen with zeroes would both
 * bloat the file and erase the difference between "has it at level 0" and "does
 * not have it".
 */
function orderedSkills(survivor: Survivor): Record<string, number> {
  const ordered: Record<string, number> = {};
  for (const skill of SKILLS) {
    const level = survivor.skills[skill];
    if (level !== undefined) ordered[skill] = level;
  }
  return ordered;
}

/**
 * One survivor with its keys in a fixed order.
 *
 * The same guarantee `inFileOrder` gives the campaign, one level down: nesting
 * objects inside `survivors` means `JSON.stringify` follows *their* insertion
 * order too, so two saves of the same roster would otherwise diff as though
 * every survivor had changed the moment one of them learnt a skill.
 */
function orderedSurvivor(survivor: Survivor): Record<keyof Survivor, unknown> {
  return {
    id: survivor.id,
    name: survivor.name,
    tier: survivor.tier,
    stats: orderedStats(survivor),
    skills: orderedSkills(survivor),
    move: survivor.move,
    defense: survivor.defense,
    currentHp: survivor.currentHp,
    infection: survivor.infection,
    xp: survivor.xp,
  };
}

/**
 * One slot's state with its keys in a fixed order, and its absent fields left
 * absent.
 *
 * `SlotState` is all-optional, so writing `false` for what a player has not
 * done would invent state the type says nothing about — and would make an
 * untouched-but-recorded slot look different from an untouched one.
 */
function orderedSlot(state: SlotState): Record<keyof SlotState, unknown> {
  return {
    cleared: state.cleared,
    built: state.built && {
      facility: state.built.facility,
      builtOnTurn: state.built.builtOnTurn,
    },
    upgrades: state.upgrades,
    power: state.power,
    water: state.water,
  };
}

/**
 * The base with its slots in the order the base's own layout lists them, not
 * the order the player happened to build in.
 *
 * The same guarantee `orderedSkills` gives a survivor: two saves of the same
 * base diff as though nothing changed unless something did. Only slots the
 * player has touched are written, because `Base.slots` is partial on purpose.
 */
function orderedBase(base: Base): Record<keyof Base, unknown> {
  const slots: Record<string, unknown> = {};

  for (const slot of BASES[base.id].slots) {
    const state = base.slots[slot.id];
    if (state !== undefined) slots[slot.id] = orderedSlot(state);
  }

  return { id: base.id, slots };
}

/**
 * A tagged union member with its tag first and everything else alphabetical.
 *
 * **Sorted rather than listed per member, and the property suite is why.** The
 * first attempt wrote log events through untouched, on the reasoning that one
 * is built once as a literal and never merged, so its insertion order could not
 * drift. `roundTrip.property.test.ts` rejected that inside a second: a value
 * read back from a file arrives in *that file's* key order, and re-exporting it
 * then produces different bytes for the same campaign.
 *
 * The alternative was an ordering function per member — fourteen for events and
 * six for assignments — each of which can only ever agree with its constructor
 * and will one day not. A sort is order-independent by construction: there is
 * no list to keep in step. The tag leads because a reader scanning a save file
 * wants to know *what* before its details, and both unions' remaining fields
 * are a flat bag of scalars with no reading order worth preserving.
 *
 * The loop writes the tag a second time, on purpose. Assigning a key an object
 * already has updates its value and leaves its position alone, so the redundant
 * write cannot move the tag — and skipping it would need a guard whose only
 * effect is to avoid a write nobody can observe. A mutation run found that
 * guard first: it survived every test, because there was nothing there to fail.
 */
function taggedFirst<T extends object>(value: T, tag: keyof T & string): Record<string, unknown> {
  const ordered: Record<string, unknown> = { [tag]: value[tag] };

  for (const field of Object.keys(value).sort()) {
    ordered[field] = (value as Record<string, unknown>)[field];
  }

  return ordered;
}

/**
 * Assignments in roster order, with each survivor's task written tag-first.
 *
 * Roster order rather than the order the player happened to assign in, for the
 * reason `orderedBase` writes slots in layout order: two saves of the same
 * Planning Phase should diff as though nothing changed unless something did.
 * Only survivors with a task are written, because `assignments` is partial on
 * purpose and an unassigned survivor has no entry rather than an empty one.
 */
function orderedAssignments(campaign: Campaign): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};

  for (const survivor of campaign.survivors) {
    const assignment = campaign.assignments[survivor.id];
    if (assignment !== undefined) ordered[survivor.id] = taggedFirst(assignment, 'task');
  }

  return ordered;
}

/**
 * One project with its keys in a fixed order.
 *
 * Tag first, like a log event and an assignment, through the same `taggedFirst`
 * the other two use — a third copy of "put the discriminant at the front" would
 * be two too many.
 */
function orderedProject(project: Project): Record<string, unknown> {
  // `taggedFirst` sorts the top level, which leaves `charged` sitting wherever
  // the sort puts it — but its *own* two keys arrive in whatever order the file
  // this project was read from happened to use. Written out here, the way
  // `orderedMaterials` writes the campaign's stores, so two saves of the same
  // queue diff as identical. Assigning a key the object already has updates the
  // value and leaves the position alone, so this cannot move `charged`.
  return {
    ...taggedFirst(project, 'kind'),
    charged: { hardware: project.charged.hardware, labor: project.charged.labor },
  };
}

/**
 * One log entry with its keys in a fixed order.
 *
 * The `Record<keyof LogEntry, unknown>` return type earns its keep the way
 * `inFileOrder`'s does: a field added to the entry cannot be silently dropped
 * from every export.
 */
function orderedLogEntry(entry: LogEntry): Record<keyof LogEntry, unknown> {
  return {
    turn: entry.turn,
    phase: entry.phase,
    at: entry.at,
    event: orderedEvent(entry.event),
  };
}

/**
 * An event tag-first, with the objects nested inside it written in a fixed
 * order too: the survivors a move set aside, and the wounds a mission outcome
 * carries.
 *
 * `taggedFirst` sorts the top level only, so the objects inside `setAside` and
 * `wounds` would keep whatever key order the file they were read from used —
 * the same gap `orderedProject` closes for `charged`, closed the same way.
 * Assigning a key the object already has leaves its position alone, so this
 * cannot move `setAside` or `wounds` themselves. Which kinds carry wounds is
 * `isMissionOutcome`'s answer, not a list here that could fall out of step
 * with it.
 */
function orderedEvent(event: CampaignEvent): Record<string, unknown> {
  if (event.kind === 'base-moved') {
    return {
      ...taggedFirst(event, 'kind'),
      setAside: event.setAside.map(({ survivor, name }) => ({ survivor, name })),
    };
  }

  if (!isMissionOutcome(event) || event.wounds === undefined) return taggedFirst(event, 'kind');

  return { ...taggedFirst(event, 'kind'), wounds: event.wounds.map(orderedWound) };
}

/**
 * One wound with its keys in a fixed order.
 *
 * `infection` is `undefined` outside a Viral campaign, which `JSON.stringify`
 * drops — so it is written only where it was recorded, as `origin` is on the
 * campaign. An absent Infection is a real state, not a zero.
 */
function orderedWound(wound: MissionWound): Record<keyof MissionWound, unknown> {
  return {
    survivor: wound.survivor,
    name: wound.name,
    health: wound.health,
    infection: wound.infection,
  };
}

/**
 * The campaign rewritten with its keys in a fixed order.
 *
 * `JSON.stringify` follows insertion order, so a campaign that came through
 * `migrate` — where a step appends a field — would serialise its keys in a
 * different order than a freshly created one, and two saves of the same
 * campaign would diff as though everything had changed.
 *
 * The return type is `Record<keyof Campaign, unknown>`, which is what makes
 * this safe rather than merely tidy: adding a field to `Campaign` without
 * deciding where it belongs in the file fails the typecheck here, so a new
 * field cannot be silently dropped from every export.
 */
function inFileOrder(campaign: Campaign): Record<keyof Campaign, unknown> {
  return {
    schemaVersion: campaign.schemaVersion,
    id: campaign.id,
    name: campaign.name,
    createdAt: campaign.createdAt,
    // Optional, so this is `undefined` for most campaigns — which `JSON.stringify`
    // drops, leaving the key absent rather than written as null. Absent is what
    // "no origin" means, so the file says it the same way the type does.
    origin: campaign.origin,
    turn: campaign.turn,
    step: campaign.step,
    materials: orderedMaterials(campaign),
    survivors: campaign.survivors.map(orderedSurvivor),
    setAside: campaign.setAside.map(orderedSurvivor),
    startingCommunityBuilt: campaign.startingCommunityBuilt,
    base: campaign.base === null ? null : orderedBase(campaign.base),
    assignments: orderedAssignments(campaign),
    projects: campaign.projects.map(orderedProject),
    log: campaign.log.map(orderedLogEntry),
  };
}

/**
 * The exact text written to disk.
 *
 * Pretty-printed and newline-terminated, because the file is meant to be
 * openable in a text editor by someone who wants to check what the app is
 * claiming about their campaign, and to diff cleanly if they keep saves in
 * version control.
 */
export function serializeCampaign(campaign: Campaign): string {
  return `${JSON.stringify(inFileOrder(campaign), null, 2)}\n`;
}

/**
 * Trims a campaign name to something safe on every filesystem.
 *
 * A name is free text and may hold slashes, colons or quotes, which Windows,
 * macOS and a shell would each object to differently.
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  // A name made only of punctuation would otherwise slug away to nothing.
  return slug === '' ? 'campaign' : slug;
}

/**
 * `<slug>-turn-<n>-<yyyy-mm-dd>.json`.
 *
 * Both turn and date appear because someone scrolling a folder of saves asks
 * two questions — "how far along is this one?" and "which is newest?" — and a
 * turn number alone cannot answer the second when a campaign is re-exported
 * without advancing.
 *
 * The date is the caller's rather than `new Date()` read in here, so this stays
 * a pure function and its tests do not have to freeze the clock.
 */
export function campaignFileName(campaign: Campaign, exportedAt: Date): string {
  const day = [
    exportedAt.getFullYear(),
    String(exportedAt.getMonth() + 1).padStart(2, '0'),
    String(exportedAt.getDate()).padStart(2, '0'),
  ].join('-');

  return `${slugify(campaign.name)}-turn-${campaign.turn}-${day}.json`;
}
