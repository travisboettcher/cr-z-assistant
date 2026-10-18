/**
 * The things a story's ending gives (pp. 90–102; R125, R127, R128, R139,
 * R141; Z7-4): items, Food, a vehicle, a survivor made Jaded, another story
 * attached, and the count the Warehouse's quiet turn reads.
 *
 * Each ending's `asks` in `src/data/stories.ts` says which it can give. The
 * table enters them on the outcome form (`StoryExtras`); `extrasProblem`
 * checks them against what the ending asks, `extrasRecord` writes them into
 * the record with every name and every item a die found filled in, and
 * `withExtrasTaken` hands them over. What a roll finds is the table's lookup,
 * never the screen's say.
 *
 * Reads no mission module, for the reason `storyMissions.ts` gives.
 *
 * Pure, like the rest of `src/engine`.
 */

import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  EQUIPMENT,
  RARE_ITEM_TABLE,
  rareItemFor,
  type Grade,
  type ItemId,
} from '../data/equipment';
import type { StoryMissionId } from '../data/missions';
import { storyResult, type StoryAsk, type StoryResult } from '../data/stories';
import type { Campaign, Survivor } from './campaign';
import { idTaken } from './equipment';
import type { StoryItem, StoryItemSource, StoryRecord } from './log';
import { bondmates, storiesDone, storiesHeld, withTraits } from './traits';

/** One item as the form enters it: what a roll found is filled in from its dice. */
export interface StoryItemChoice {
  readonly id: string;
  readonly from: StoryItemSource;
  readonly item?: ItemId;
  readonly grade?: Grade;
  readonly survivor?: string;
  readonly subtable?: D10Result;
  readonly entry?: D10Result;
}

/** What else the table entered for an ending, by what it asks (Z7-4). */
export interface StoryExtras {
  readonly items?: readonly StoryItemChoice[];
  readonly alsoAttached?: readonly {
    readonly mission: StoryMissionId;
    readonly survivor: string;
  }[];
  readonly vehicle?: { readonly id: string; readonly label: string };
  readonly jaded?: string;
  readonly resources?: number;
}

/** The extras without one of them, as a form clears a field. */
export function withoutExtra(extras: StoryExtras, key: keyof StoryExtras): StoryExtras {
  return Object.fromEntries(Object.entries(extras).filter(([name]) => name !== key)) as StoryExtras;
}

/** The extras a record holds, as the form would have entered them: what a rebuild starts from. */
export function extrasOf(record: StoryRecord): StoryExtras {
  return {
    ...(record.items === undefined
      ? {}
      : {
          items: record.items.map((item) => ({
            id: item.id,
            from: item.from,
            item: item.item,
            grade: item.grade,
            ...(item.survivor === undefined ? {} : { survivor: item.survivor }),
            ...(item.subtable === undefined ? {} : { subtable: item.subtable }),
            ...(item.entry === undefined ? {} : { entry: item.entry }),
          })),
        }),
    ...(record.alsoAttached === undefined
      ? {}
      : {
          alsoAttached: record.alsoAttached.map(({ mission, survivor }) => ({ mission, survivor })),
        }),
    ...(record.vehicle === undefined
      ? {}
      : { vehicle: { id: record.vehicle.id, label: record.vehicle.label } }),
    ...(record.jaded === undefined ? {} : { jaded: record.jaded.survivor }),
    ...(record.resources === undefined ? {} : { resources: record.resources }),
  };
}

/** What an ending asks for, none for most. */
const asksOf = (result: StoryResult): readonly StoryAsk[] => result.asks ?? [];

/** The ask of this kind an ending has, or `undefined`. */
function askOf<Kind extends StoryAsk['kind']>(
  result: StoryResult,
  kind: Kind,
): Extract<StoryAsk, { kind: Kind }> | undefined {
  return asksOf(result).find((ask): ask is Extract<StoryAsk, { kind: Kind }> => ask.kind === kind);
}

/** Which item sources each ask can give: none, for an ask that gives no item. */
const SOURCES_OF: Record<StoryAsk['kind'], readonly StoryItemSource[]> = {
  'skilled-weapon': ['skilled-weapon'],
  'found-item': ['found-item'],
  'quality-roll': ['quality-roll'],
  'rare-rolls-or-picks': ['rare-roll', 'rare-pick'],
  attaches: [],
  vehicle: [],
  jaded: [],
  resources: [],
};

const isD10 = (value: unknown): value is D10Result =>
  D10_RESULTS.some((result) => result === value);

/** Whether an item and grade is one of the Rare Item Table's entries, on any subtable (R127). */
function onTheRareTable(item: ItemId | undefined, grade: Grade | undefined): boolean {
  return Object.values(RARE_ITEM_TABLE).some((entries) =>
    entries.some((entry) => entry.item === item && entry.grade === grade),
  );
}

/** Whether a story can be attached now: nobody holds it and it is not done (R136, R139). */
export function attachable(campaign: Campaign, story: StoryMissionId): boolean {
  return !storiesHeld(campaign).has(story) && !storiesDone(campaign).has(story);
}

/**
 * Why these extras do not answer what the ending asks, or `null`: an item,
 * vehicle, count or attachment only where the ending asks for one; every one
 * it requires; the weapon one the survivor is skilled in, the rolls on the
 * right table and the right number of them, a survivor on the team for
 * whatever goes to one; and ids nothing else has.
 */
export function extrasProblem(
  campaign: Campaign,
  members: readonly Survivor[],
  holder: Survivor,
  result: StoryResult,
  extras: StoryExtras,
): string | null {
  const items = extras.items ?? [];
  const asked = asksOf(result).flatMap((ask) => SOURCES_OF[ask.kind]);
  const onTeam = (id: string | undefined) => members.some((member) => member.id === id);
  const fromThe = (source: StoryItemSource) => items.filter((item) => item.from === source);

  if (!items.every((item) => asked.includes(item.from))) {
    return 'That ending gives no item of the kind.';
  }

  const weapon = askOf(result, 'skilled-weapon');
  if (weapon !== undefined) {
    const [carried, ...more] = fromThe('skilled-weapon');
    const rules = carried?.item === undefined ? undefined : EQUIPMENT[carried.item];

    if (
      carried === undefined ||
      more.length > 0 ||
      carried.survivor !== holder.id ||
      rules?.kind !== 'weapon' ||
      carried.grade !== weapon.grade ||
      !(rules.grades as readonly Grade[]).includes(weapon.grade) ||
      !(rules.uses ?? []).some((skill) => holder.skills[skill] !== undefined)
    ) {
      return `Choose the ${weapon.grade} weapon the loved one carried, one ${holder.name} is skilled in.`;
    }
  }

  const found = askOf(result, 'found-item');
  if (found !== undefined) {
    const taken = fromThe('found-item');

    if (
      taken.length > 1 ||
      taken.some(
        (item) => item.item !== found.item || item.grade !== found.grade || !onTeam(item.survivor),
      )
    ) {
      return 'What was found goes to one survivor on the team.';
    }
  }

  if (askOf(result, 'quality-roll') !== undefined) {
    const [rolled, ...more] = fromThe('quality-roll');

    if (rolled === undefined || more.length > 0 || !isD10(rolled.entry)) {
      return 'Enter the Quality Items roll.';
    }
  }

  const rare = askOf(result, 'rare-rolls-or-picks');
  if (rare !== undefined) {
    const rolls = fromThe('rare-roll');
    const picks = fromThe('rare-pick');
    const rolled =
      picks.length === 0 &&
      rolls.length === rare.rolls &&
      rolls.every((roll) => isD10(roll.subtable) && isD10(roll.entry));
    const picked =
      rolls.length === 0 &&
      picks.length === rare.picks &&
      picks.every((pick) => onTheRareTable(pick.item, pick.grade));

    if (!rolled && !picked) {
      return `Enter ${String(rare.rolls)} Rare Item Table rolls, or pick ${String(rare.picks)} of its items.`;
    }
  }

  const ids = items.map((item) => item.id);
  if (ids.some((id, at) => id === '' || idTaken(campaign, id) || ids.indexOf(id) !== at)) {
    return 'An item already has that id.';
  }

  const attaching = extras.alsoAttached ?? [];
  if (
    new Set(attaching.map((one) => one.mission)).size !== attaching.length ||
    !attaching.every((one) =>
      asksOf(result).some((ask) => ask.kind === 'attaches' && ask.story === one.mission),
    )
  ) {
    return 'That ending attaches no such story.';
  }
  if (!attaching.every((one) => onTeam(one.survivor))) {
    return 'A story the ending attaches goes to somebody on the team.';
  }

  const vehicle = extras.vehicle;
  if (vehicle !== undefined) {
    if (askOf(result, 'vehicle') === undefined) return 'That ending gives no vehicle.';
    if (vehicle.label.trim() === '') return 'Name the vehicle.';
    if (campaign.vehicles.some((held) => held.id === vehicle.id)) {
      return 'A vehicle already has that id.';
    }
  }

  if (extras.jaded !== undefined) {
    if (askOf(result, 'jaded') === undefined) return 'That ending makes nobody else Jaded.';
    if (!onTeam(extras.jaded) || extras.jaded === holder.id) {
      return 'Somebody else on the team becomes Jaded.';
    }
  }

  const resources = askOf(result, 'resources');
  if (resources === undefined) {
    if (extras.resources !== undefined) return 'That ending counts no resources.';
  } else if (!Number.isSafeInteger(extras.resources) || (extras.resources as number) < 0) {
    return 'Enter how many resource and material tokens were carried home, 0 or more.';
  }

  return null;
}

/**
 * The survivor by id, by name as the roster has it now. A form may name
 * somebody off the team before `extrasProblem` has said so, and is shown no
 * name for them rather than a crash.
 */
function named(members: readonly Survivor[], id: string): { survivor: string; name: string } {
  return { survivor: id, name: members.find((member) => member.id === id)?.name ?? '' };
}

/** An item as found, or as the form entered it where nothing was. */
function pickedOrFound(
  choice: StoryItemChoice,
  found: { readonly item: ItemId; readonly grade: Grade } | undefined,
): StoryItem {
  return {
    id: choice.id,
    item: found?.item ?? (choice.item as ItemId),
    grade: found?.grade ?? (choice.grade as Grade),
    from: choice.from,
  };
}

/** One item as the record keeps it: what a die found filled in, and its holder named. */
function itemOf(members: readonly Survivor[], choice: StoryItemChoice): StoryItem {
  const dice = {
    ...(choice.subtable === undefined ? {} : { subtable: choice.subtable }),
    ...(choice.entry === undefined ? {} : { entry: choice.entry }),
  };
  const holder = choice.survivor === undefined ? {} : named(members, choice.survivor);

  // A die not entered yet finds nothing, which `extrasProblem` then says.
  switch (choice.from) {
    case 'quality-roll': {
      const found = isD10(choice.entry)
        ? RARE_ITEM_TABLE['quality-item'][choice.entry - 1]
        : undefined;

      return { ...pickedOrFound(choice, found), ...dice };
    }
    case 'rare-roll': {
      const found =
        isD10(choice.subtable) && isD10(choice.entry)
          ? rareItemFor(choice.subtable, choice.entry)
          : undefined;

      return { ...pickedOrFound(choice, found), ...dice };
    }
    default:
      return {
        id: choice.id,
        item: choice.item as ItemId,
        grade: choice.grade as Grade,
        from: choice.from,
        ...holder,
      };
  }
}

/**
 * The record's share of the extras, assuming `extrasProblem` passed: items
 * with what a die found and who holds them, the ending's Food, the vehicle at
 * the Tier the page gives, who became Jaded, the count, and the other stories
 * attached, only those nobody holds and nobody has done (R139).
 */
export function extrasRecord(
  campaign: Campaign,
  members: readonly Survivor[],
  result: StoryResult,
  extras: StoryExtras,
): Partial<StoryRecord> {
  const vehicle = askOf(result, 'vehicle');
  const attaching = (extras.alsoAttached ?? []).filter((one) => attachable(campaign, one.mission));

  return {
    ...(extras.items === undefined || extras.items.length === 0
      ? {}
      : { items: extras.items.map((item) => itemOf(members, item)) }),
    ...(result.food === undefined ? {} : { food: result.food }),
    ...(vehicle === undefined || extras.vehicle === undefined
      ? {}
      : {
          vehicle: {
            id: extras.vehicle.id,
            tier: vehicle.tier,
            label: extras.vehicle.label.trim(),
            water: vehicle.water,
          },
        }),
    ...(extras.jaded === undefined ? {} : { jaded: named(members, extras.jaded) }),
    ...(extras.resources === undefined ? {} : { resources: extras.resources }),
    ...(attaching.length === 0
      ? {}
      : {
          alsoAttached: attaching.map((one) => ({
            mission: one.mission,
            ...named(members, one.survivor),
          })),
        }),
  };
}

/**
 * The campaign with the extras handed over: an item to its survivor or into
 * the base's Inventory, the Food into storage, the vehicle to the community,
 * Jaded to whoever the player chose in place of their trait (R85, R128), and
 * each other story on its survivor from this turn.
 */
export function withExtrasTaken(campaign: Campaign, record: StoryRecord): Campaign {
  const items = record.items ?? [];
  const toBase = items.filter((item) => item.survivor === undefined);
  const strip = ({ id, item, grade }: StoryItem) => ({ id, item, grade });

  const given = (survivor: Survivor): Survivor => {
    const carried = items.filter((item) => item.survivor === survivor.id).map(strip);
    const stories = (record.alsoAttached ?? [])
      .filter((one) => one.survivor === survivor.id)
      .map((one) => ({ mission: one.mission, attachedOnTurn: campaign.turn }));
    const jaded = record.jaded?.survivor === survivor.id;
    if (carried.length === 0 && stories.length === 0 && !jaded) return survivor;

    const after = {
      ...survivor,
      items: [...survivor.items, ...carried],
      stories: [...survivor.stories, ...stories],
    };

    return jaded
      ? withTraits(after, {
          storyTrait: 'jaded',
          veteran: after.veteran,
          bondGroup: null,
          stories: after.stories,
        })
      : after;
  };

  return {
    ...campaign,
    survivors: campaign.survivors.map(given),
    inventory: [...campaign.inventory, ...toBase.map(strip)],
    materials: { ...campaign.materials, food: campaign.materials.food + (record.food ?? 0) },
    vehicles:
      record.vehicle === undefined ? campaign.vehicles : [...campaign.vehicles, record.vehicle],
  };
}

/** One story ending this turn's log records, with its result's rules. */
interface EndedThisTurn {
  readonly story: StoryMissionId;
  readonly record: StoryRecord;
  readonly result: StoryResult;
}

/**
 * Every story ending this turn's log records, in the order they were written.
 * Read off the log, as `claimWon` is: what an ending changes later in its own
 * turn is the record's, not a flag beside it.
 */
function endedThisTurn(campaign: Campaign): readonly EndedThisTurn[] {
  return campaign.log.flatMap(({ turn, event }) => {
    if (turn !== campaign.turn || event.kind !== 'mission-played' || event.story === undefined) {
      return [];
    }

    const story = event.mission as StoryMissionId;
    const result = storyResult(story, event.story.result);

    return result === undefined ? [] : [{ story, record: event.story, result }];
  });
}

/**
 * Whether this turn's Unrest is 0 because the Warehouse brought home more
 * resource and material tokens than the page says (pg. 102; R125). Hunger and
 * Exhaustion are still worked out; only the sum is held.
 */
export function warehouseQuiet(campaign: Campaign): boolean {
  return endedThisTurn(campaign).some(({ record, result }) => {
    const ask = askOf(result, 'resources');

    return ask !== undefined && (record.resources ?? 0) > ask.over;
  });
}

/**
 * How many of this turn's material rolls the player may make 10s, each a Rare
 * Item Table roll (pp. 19, 101; R126): Crashed Convoy's two, at the Add
 * Materials to Storage after it, which is this turn's.
 */
export function convoyTensDue(campaign: Campaign): number {
  return endedThisTurn(campaign).reduce((total, { result }) => total + (result.tens ?? 0), 0);
}

/**
 * Who Advancement Step 1's extra XP goes to this turn, 1 each, because Left
 * Behind Part 2a sends it to its survivor and every bondmate (pg. 91; R140),
 * or `undefined` on a turn it does not. Read from the roster as it is now: a
 * bondmate who has left is given nothing, and nor is a survivor who has.
 */
export function bondmateXpRecipients(campaign: Campaign): readonly Survivor[] | undefined {
  const ended = endedThisTurn(campaign).find(({ result }) => result.xpToBondmates === true);
  if (ended === undefined) return undefined;

  const holder = campaign.survivors.find((survivor) => survivor.id === ended.record.survivor);
  if (holder === undefined) return [];

  return campaign.survivors.filter(
    (survivor) => survivor.id === holder.id || bondmates(holder, survivor),
  );
}
