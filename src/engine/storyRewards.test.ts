import { describe, expect, it } from 'vitest';
import type { Grade, ItemId } from '../data/equipment';
import type { StoryMissionId } from '../data/missions';
import { storyResult, type StoryResult } from '../data/stories';
import { submitHaul } from './advancementForms';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { submitStrangerJoined } from './campaignForms';
import { xpPool } from './experience';
import { exhaustion, unrest, unrestLocked } from './feeding';
import type { CampaignEvent, LogEntry, StoryRecord } from './log';
import { submitMissionEnded } from './missionForms';
import { storyRecord } from './storyMissions';
import {
  attachable,
  bondmateXpRecipients,
  convoyTensDue,
  extrasOf,
  extrasProblem,
  extrasRecord,
  warehouseQuiet,
  withExtrasTaken,
  withoutExtra,
  type StoryExtras,
  type StoryItemChoice,
} from './storyRewards';
import { buildItemId, strangerSurvivor } from './strangers';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const holding = (story: StoryMissionId) => ({ stories: [{ mission: story, attachedOnTurn: 2 }] });

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  skills: { 'long-guns': 0 },
  ...overrides,
});
const carla = createSurvivor('Carla Proust', 3, { id: 'carla' });
const ruby = createSurvivor('Ruby Vance', 2, { id: 'ruby' });

const entry = (event: CampaignEvent, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

/** Turn 4, Play the Mission: Earl and Carla on team 1 playing `story`, Ruby at home. */
function playing(
  story: StoryMissionId,
  survivors: readonly Survivor[] = [earl(holding(story)), carla, ruby],
  overrides: Partial<Campaign> = {},
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors,
    assignments: { earl: { task: 'mission', team: 1 }, carla: { task: 'mission', team: 1 } },
    log: [entry({ kind: 'mission-selected', team: 1, mission: story, names: [] })],
    ...overrides,
  };
}

const team = (campaign: Campaign) =>
  campaign.survivors.filter((survivor) => campaign.assignments[survivor.id] !== undefined);

const result = (story: StoryMissionId, id: string): StoryResult =>
  storyResult(story, id) as StoryResult;

const holderOf = (campaign: Campaign) => campaign.survivors[0] as Survivor;

/** `extrasProblem` for this ending of the campaign's story. */
const problem = (campaign: Campaign, story: StoryMissionId, ending: string, extras: StoryExtras) =>
  extrasProblem(campaign, team(campaign), holderOf(campaign), result(story, ending), extras);

const named = (campaign: Campaign, id: string) =>
  campaign.survivors.find((survivor) => survivor.id === id) as Survivor;

describe('the loved one’s weapon (pg. 90)', () => {
  const lost = playing('left-behind-1');
  const weapon = (item: string, grade = 'quality') => ({
    items: [{ id: 'w', from: 'skilled-weapon', item, grade, survivor: 'earl' }],
  });

  it('is one weapon, at its grade, of a skill the survivor has', () => {
    expect(
      problem(lost, 'left-behind-1', 'not-rescued', weapon('rifle') as StoryExtras),
    ).toBeNull();
    expect(
      problem(lost, 'left-behind-1', 'not-rescued', weapon('shotgun') as StoryExtras),
    ).toBeNull();
  });

  it('refuses none, two, one not a weapon, another grade, or a skill the survivor lacks', () => {
    const expected =
      /Choose the quality weapon the loved one carried, one Earl Rhodes is skilled in/;
    const two = {
      items: [
        { id: 'w', from: 'skilled-weapon', item: 'rifle', grade: 'quality', survivor: 'earl' },
        { id: 'x', from: 'skilled-weapon', item: 'rifle', grade: 'quality', survivor: 'earl' },
      ],
    } as StoryExtras;

    expect(problem(lost, 'left-behind-1', 'not-rescued', {})).toMatch(expected);
    expect(problem(lost, 'left-behind-1', 'not-rescued', two)).toMatch(expected);
    expect(
      problem(lost, 'left-behind-1', 'not-rescued', weapon('tool-belt') as StoryExtras),
    ).toMatch(expected);
    expect(
      problem(lost, 'left-behind-1', 'not-rescued', weapon('rifle', 'standard') as StoryExtras),
    ).toMatch(expected);
    expect(problem(lost, 'left-behind-1', 'not-rescued', weapon('bow') as StoryExtras)).toMatch(
      expected,
    );
  });

  it('goes into the survivor’s own hands', () => {
    expect(
      problem(lost, 'left-behind-1', 'not-rescued', {
        items: [
          { id: 'w', from: 'skilled-weapon', item: 'rifle', grade: 'quality', survivor: 'carla' },
        ],
      }),
    ).toMatch(/Choose the quality weapon/);
  });

  it('is asked of no other ending', () => {
    expect(problem(lost, 'left-behind-1', 'rescued', weapon('rifle') as StoryExtras)).toBe(
      'That ending gives no item of the kind.',
    );
  });
});

describe('Neighbor’s Rifle’s rifle (pp. 98–99)', () => {
  const rifle = playing('neighbors-rifle');
  const taken = (survivor: string, item = 'rifle') =>
    ({ items: [{ id: 'r', from: 'found-item', item, grade: 'quality', survivor }] }) as StoryExtras;

  it('goes to one survivor on the team, or nobody', () => {
    expect(problem(rifle, 'neighbors-rifle', 'seating-failed', {})).toBeNull();
    expect(problem(rifle, 'neighbors-rifle', 'seating-failed', taken('carla'))).toBeNull();
    expect(problem(rifle, 'neighbors-rifle', 'seating-failed', taken('ruby'))).toBe(
      'What was found goes to one survivor on the team.',
    );
    expect(problem(rifle, 'neighbors-rifle', 'seating-failed', taken('carla', 'shotgun'))).toBe(
      'What was found goes to one survivor on the team.',
    );
    expect(
      problem(rifle, 'neighbors-rifle', 'seating-failed', {
        items: [
          ...(taken('carla').items ?? []),
          { id: 's', from: 'found-item', item: 'rifle', grade: 'quality', survivor: 'earl' },
        ],
      }),
    ).toBe('What was found goes to one survivor on the team.');
  });
});

describe('Prepper’s Stash’s rolls (pp. 43, 94, 96; R127)', () => {
  const one = playing('preppers-stash-1');
  const two = playing('preppers-stash-2');
  const rolls = (count: number) =>
    Array.from({ length: count }, (_, at) => ({
      id: `roll-${String(at)}`,
      from: 'rare-roll' as const,
      subtable: 3 as const,
      entry: 1 as const,
    }));
  const pick = (item: string, grade: string, id = item): StoryItemChoice => ({
    id,
    from: 'rare-pick',
    item: item as ItemId,
    grade: grade as Grade,
  });

  it('asks Part 1’s duffel for one Quality Items roll', () => {
    expect(problem(one, 'preppers-stash-1', 'duffel-recovered', {})).toBe(
      'Enter the Quality Items roll.',
    );
    expect(
      problem(one, 'preppers-stash-1', 'duffel-recovered', {
        items: [{ id: 'q', from: 'quality-roll', entry: 4 }],
      }),
    ).toBeNull();
  });

  it('asks Part 2’s trap door for six rolls on the table, or three items from any of it', () => {
    const expected = 'Enter 6 Rare Item Table rolls, or pick 3 of its items.';

    expect(problem(two, 'preppers-stash-2', 'trap-door-opened', { items: rolls(6) })).toBeNull();
    expect(problem(two, 'preppers-stash-2', 'trap-door-opened', { items: rolls(5) })).toBe(
      expected,
    );
    expect(
      problem(two, 'preppers-stash-2', 'trap-door-opened', {
        items: [
          pick('fully-automatic-rifle', 'standard'),
          pick('tool-belt', 'quality'),
          pick('gas-grill', 'standard'),
        ],
      }),
    ).toBeNull();
    expect(
      problem(two, 'preppers-stash-2', 'trap-door-opened', {
        items: [
          pick('fully-automatic-rifle', 'standard'),
          pick('tool-belt', 'quality'),
          pick('pistol', 'standard'),
        ],
      }),
    ).toBe(expected);
    expect(
      problem(two, 'preppers-stash-2', 'trap-door-opened', {
        items: [...rolls(6), pick('tool-belt', 'quality')],
      }),
    ).toBe(expected);
    expect(problem(two, 'preppers-stash-2', 'trap-door-opened', {})).toBe(expected);
  });

  it('refuses an item id somebody has, one used twice, or none', () => {
    const held = playing('preppers-stash-1', [earl(holding('preppers-stash-1')), carla], {
      inventory: [{ id: 'q', item: 'pistol', grade: 'standard' }],
    });

    expect(
      problem(held, 'preppers-stash-1', 'duffel-recovered', {
        items: [{ id: 'q', from: 'quality-roll', entry: 4 }],
      }),
    ).toBe('An item already has that id.');
    expect(
      problem(two, 'preppers-stash-2', 'trap-door-opened', {
        items: [
          pick('tool-belt', 'quality', 'p'),
          pick('tool-belt', 'quality', 'p'),
          pick('gas-grill', 'standard'),
        ],
      }),
    ).toBe('An item already has that id.');
    expect(
      problem(one, 'preppers-stash-1', 'duffel-recovered', {
        items: [{ id: '', from: 'quality-roll', entry: 4 }],
      }),
    ).toBe('An item already has that id.');
  });
});

describe('other stories an ending attaches (pp. 90, 120; R139, R141)', () => {
  const lb1 = playing('left-behind-1');

  it('go to somebody on the team, once each, and only where the ending asks', () => {
    expect(
      problem(lb1, 'left-behind-1', 'rescued', {
        alsoAttached: [{ mission: 'preppers-stash-1', survivor: 'carla' }],
      }),
    ).toBeNull();
    expect(
      problem(lb1, 'left-behind-1', 'rescued', {
        alsoAttached: [{ mission: 'crashed-convoy', survivor: 'carla' }],
      }),
    ).toBe('That ending attaches no such story.');
    expect(
      problem(lb1, 'left-behind-1', 'rescued', {
        alsoAttached: [
          { mission: 'preppers-stash-1', survivor: 'carla' },
          { mission: 'preppers-stash-1', survivor: 'earl' },
        ],
      }),
    ).toBe('That ending attaches no such story.');
    expect(
      problem(lb1, 'left-behind-1', 'rescued', {
        alsoAttached: [{ mission: 'preppers-stash-1', survivor: 'ruby' }],
      }),
    ).toBe('A story the ending attaches goes to somebody on the team.');
  });

  it('are attached only when nobody holds them and nobody has done them', () => {
    const held = playing('left-behind-1', [
      earl(holding('left-behind-1')),
      { ...carla, ...holding('preppers-stash-1') },
      ruby,
    ]);
    const extras = { alsoAttached: [{ mission: 'preppers-stash-1' as const, survivor: 'earl' }] };

    expect(attachable(lb1, 'preppers-stash-1')).toBe(true);
    expect(attachable(held, 'preppers-stash-1')).toBe(false);
    expect(extrasRecord(lb1, team(lb1), result('left-behind-1', 'rescued'), extras)).toEqual({
      alsoAttached: [{ mission: 'preppers-stash-1', survivor: 'earl', name: 'Earl Rhodes' }],
    });
    expect(extrasRecord(held, team(held), result('left-behind-1', 'rescued'), extras)).toEqual({});
  });
});

describe('Part 2b’s boat and who becomes Jaded (pg. 93; R128)', () => {
  const lb2b = playing('left-behind-2b');

  it('takes the boat home, named, with an id no vehicle has', () => {
    const boat = { vehicle: { id: 'boat', label: 'Mabel' } };

    expect(problem(lb2b, 'left-behind-2b', 'body-left', boat)).toBeNull();
    expect(
      problem(lb2b, 'left-behind-2b', 'body-left', { vehicle: { id: 'boat', label: ' ' } }),
    ).toBe('Name the vehicle.');
    expect(
      problem(
        { ...lb2b, vehicles: [{ id: 'boat', tier: 1, label: 'Truck', water: false }] },
        'left-behind-2b',
        'body-left',
        boat,
      ),
    ).toBe('A vehicle already has that id.');
    expect(
      extrasRecord(lb2b, team(lb2b), result('left-behind-2b', 'body-left'), boat).vehicle,
    ).toEqual({ id: 'boat', tier: 2, label: 'Mabel', water: true });
    expect(problem(playing('warehouse'), 'warehouse', 'played', { ...boat, resources: 0 })).toBe(
      'That ending gives no vehicle.',
    );
  });

  it('makes somebody else on the team Jaded, the player’s choice', () => {
    expect(problem(lb2b, 'left-behind-2b', 'body-left', { jaded: 'carla' })).toBeNull();
    expect(problem(lb2b, 'left-behind-2b', 'body-left', { jaded: 'earl' })).toBe(
      'Somebody else on the team becomes Jaded.',
    );
    expect(problem(lb2b, 'left-behind-2b', 'body-left', { jaded: 'ruby' })).toBe(
      'Somebody else on the team becomes Jaded.',
    );
    expect(
      problem(playing('warehouse'), 'warehouse', 'played', { jaded: 'carla', resources: 0 }),
    ).toBe('That ending makes nobody else Jaded.');
  });
});

describe('the Warehouse’s count (pg. 102; R125)', () => {
  const warehouse = playing('warehouse');

  it('is a whole number from 0, asked of the Warehouse and nothing else', () => {
    expect(problem(warehouse, 'warehouse', 'played', { resources: 0 })).toBeNull();
    expect(problem(warehouse, 'warehouse', 'played', {})).toMatch(/how many resource/);
    expect(problem(warehouse, 'warehouse', 'played', { resources: -1 })).toMatch(
      /how many resource/,
    );
    expect(problem(warehouse, 'warehouse', 'played', { resources: 1.5 })).toMatch(
      /how many resource/,
    );
    expect(
      problem(playing('crashed-convoy'), 'crashed-convoy', 'search-failed', { resources: 3 }),
    ).toBe('That ending counts no resources.');
  });

  /** The acceptance. */
  it('makes Unrest 0 that turn past 10, Hunger and Exhaustion still worked out', () => {
    const ended = (resources: number, turn = 4): LogEntry =>
      entry(
        {
          kind: 'mission-played',
          team: 1,
          mission: 'warehouse',
          story: { survivor: 'earl', name: 'Earl Rhodes', result: 'played', xp: 1, resources },
        },
        turn,
      );
    const managing = (log: readonly LogEntry[]) => ({
      ...warehouse,
      step: 'calculate-unrest' as const,
      log,
    });

    expect(warehouseQuiet(managing([ended(11)]))).toBe(true);
    expect(unrestLocked(managing([ended(11)]))).toBe(true);
    expect(unrest(managing([ended(11)]))).toBe(0);
    // Nowhere to sleep: Exhaustion is still the whole community.
    expect(exhaustion(managing([ended(11)]))).toBe(3);
    expect(unrest(managing([ended(10)]))).toBe(3);
    expect(warehouseQuiet(managing([ended(11, 3)]))).toBe(false);
  });
});

describe('extras, written and handed over (Z7-4)', () => {
  it('reads every die off the table, and names each holder', () => {
    const two = playing('preppers-stash-2');

    expect(
      extrasRecord(two, team(two), result('preppers-stash-2', 'trap-door-opened'), {
        items: [
          { id: 'a', from: 'rare-roll', subtable: 3, entry: 1 },
          { id: 'b', from: 'rare-pick', item: 'tool-belt', grade: 'quality' },
        ],
      }),
    ).toStrictEqual({
      items: [
        {
          id: 'a',
          item: 'riot-shield',
          grade: 'standard',
          from: 'rare-roll',
          subtable: 3,
          entry: 1,
        },
        { id: 'b', item: 'tool-belt', grade: 'quality', from: 'rare-pick' },
      ],
      food: 6,
    });
    expect(
      extrasRecord(
        playing('preppers-stash-1'),
        team(two),
        result('preppers-stash-1', 'duffel-recovered'),
        {
          items: [{ id: 'q', from: 'quality-roll', entry: 1 }],
        },
      ),
    ).toStrictEqual({
      items: [{ id: 'q', item: 'bladed', grade: 'quality', from: 'quality-roll', entry: 1 }],
    });
    expect(
      extrasRecord(two, team(two), result('neighbors-rifle', 'seating-failed'), {
        items: [
          { id: 'r', from: 'found-item', item: 'rifle', grade: 'quality', survivor: 'carla' },
        ],
        jaded: 'carla',
        resources: 4,
      }),
    ).toStrictEqual({
      items: [
        {
          id: 'r',
          item: 'rifle',
          grade: 'quality',
          from: 'found-item',
          survivor: 'carla',
          name: 'Carla Proust',
        },
      ],
      jaded: { survivor: 'carla', name: 'Carla Proust' },
      resources: 4,
    });
  });

  it('finds nothing for a die not entered yet, and names nobody off the team', () => {
    const two = playing('preppers-stash-2');

    expect(
      extrasRecord(two, team(two), result('preppers-stash-2', 'trap-door-opened'), {
        items: [{ id: 'a', from: 'rare-roll', subtable: 3 }],
        jaded: 'nobody',
      }),
    ).toMatchObject({
      items: [{ id: 'a', from: 'rare-roll', subtable: 3 }],
      jaded: { survivor: 'nobody', name: '' },
    });
  });

  it('reads back as the form entered it', () => {
    const extras: StoryExtras = {
      items: [
        { id: 'r', from: 'found-item', item: 'rifle', grade: 'quality', survivor: 'carla' },
        {
          id: 'a',
          from: 'rare-roll',
          item: 'riot-shield',
          grade: 'standard',
          subtable: 3,
          entry: 1,
        },
      ],
      alsoAttached: [{ mission: 'crashed-convoy', survivor: 'carla' }],
      vehicle: { id: 'boat', label: 'Boat' },
      jaded: 'carla',
      resources: 2,
    };
    const record: StoryRecord = {
      survivor: 'earl',
      name: 'Earl Rhodes',
      result: 'played',
      items: [
        {
          id: 'r',
          from: 'found-item',
          item: 'rifle',
          grade: 'quality',
          survivor: 'carla',
          name: 'Carla Proust',
        },
        {
          id: 'a',
          from: 'rare-roll',
          item: 'riot-shield',
          grade: 'standard',
          subtable: 3,
          entry: 1,
        },
      ],
      alsoAttached: [{ mission: 'crashed-convoy', survivor: 'carla', name: 'Carla Proust' }],
      vehicle: { id: 'boat', tier: 2, label: 'Boat', water: true },
      jaded: { survivor: 'carla', name: 'Carla Proust' },
      resources: 2,
    };

    expect(extrasOf(record)).toStrictEqual(extras);
    expect(extrasOf({ survivor: 'earl', name: 'Earl Rhodes', result: 'played' })).toStrictEqual({});
    expect(withoutExtra(extras, 'jaded')).not.toHaveProperty('jaded');
    expect(withoutExtra(extras, 'jaded')).toHaveProperty('resources', 2);
  });

  it('hands each thing over: to a survivor, the base, storage, the vehicles, a trait, a story', () => {
    const campaign = playing('left-behind-2b', [
      earl(holding('left-behind-2b')),
      { ...carla, storyTrait: 'bonded', bondGroup: 2 },
      ruby,
    ]);
    const after = withExtrasTaken(campaign, {
      survivor: 'earl',
      name: 'Earl Rhodes',
      result: 'body-left',
      items: [
        {
          id: 'r',
          item: 'rifle',
          grade: 'quality',
          from: 'found-item',
          survivor: 'carla',
          name: 'Carla Proust',
        },
        { id: 'q', item: 'bladed', grade: 'quality', from: 'quality-roll', entry: 1 },
      ],
      food: 6,
      vehicle: { id: 'boat', tier: 2, label: 'Boat', water: true },
      jaded: { survivor: 'carla', name: 'Carla Proust' },
      alsoAttached: [{ mission: 'crashed-convoy', survivor: 'carla', name: 'Carla Proust' }],
    });

    expect(named(after, 'carla')).toMatchObject({
      items: [{ id: 'r', item: 'rifle', grade: 'quality' }],
      storyTrait: 'jaded',
      bondGroup: null,
      stories: [{ mission: 'crashed-convoy', attachedOnTurn: 4 }],
    });
    expect(named(after, 'ruby')).toBe(ruby);
    expect(after.inventory).toEqual([{ id: 'q', item: 'bladed', grade: 'quality' }]);
    expect(after.materials.food).toBe(campaign.materials.food + 6);
    expect(after.vehicles).toEqual([{ id: 'boat', tier: 2, label: 'Boat', water: true }]);
    expect(
      withExtrasTaken(campaign, { survivor: 'earl', name: 'Earl', result: 'body-left' }),
    ).toEqual(campaign);
  });

  it('are what a recorded ending gives, end to end', () => {
    const campaign = playing('preppers-stash-1');
    const recorded = submitMissionEnded(
      campaign,
      {
        kind: 'mission-played',
        team: 1,
        mission: 'preppers-stash-1',
        wounds: team(campaign).map((member) => ({
          survivor: member.id,
          name: member.name,
          health: member.currentHp,
        })),
        story: {
          survivor: 'earl',
          name: 'Earl Rhodes',
          result: 'duffel-recovered',
          attached: { mission: 'preppers-stash-2', survivor: 'ruby', name: 'Ruby Vance' },
          // The screen's item is not the table's: the entry's is.
          items: [{ id: 'q', item: 'pistol', grade: 'standard', from: 'quality-roll', entry: 1 }],
        },
      },
      [],
      AT,
    );
    if (!recorded.ok) throw new Error(recorded.problem);

    expect(recorded.campaign.inventory).toEqual([{ id: 'q', item: 'bladed', grade: 'quality' }]);
    expect(recorded.campaign.log.at(-1)?.event).toMatchObject({
      story: { items: [{ id: 'q', item: 'bladed', grade: 'quality', entry: 1 }] },
    });
  });
});

describe('Crashed Convoy’s two 10s (pp. 19, 101; R126)', () => {
  const convoyed = (turn = 4): Campaign => ({
    ...playing('crashed-convoy'),
    step: 'add-materials-to-storage',
    log: [
      entry(
        {
          kind: 'mission-played',
          team: 1,
          mission: 'crashed-convoy',
          story: { survivor: 'earl', name: 'Earl Rhodes', result: 'search-failed', xp: 1 },
        },
        turn,
      ),
    ],
  });
  const dice = (count: number) =>
    Array.from({ length: count }, (_, at) => ({
      id: `rare-${String(at)}`,
      subtable: 3 as const,
      entry: 1 as const,
    }));

  it('are two, at this turn’s Add Materials to Storage only', () => {
    expect(convoyTensDue(convoyed())).toBe(2);
    expect(convoyTensDue(convoyed(3))).toBe(0);
    expect(convoyTensDue(playing('warehouse'))).toBe(0);
  });

  it('make two rolls Rare Item Table rolls, and no more', () => {
    const made = submitHaul(
      convoyed(),
      {
        rolls: [{ roll: 1, madeTen: true }, { roll: 4, madeTen: true }, { roll: 4 }],
        rareItems: dice(2),
      },
      AT,
    );
    if (!made.ok) throw new Error(made.problem);

    expect(made.campaign.inventory).toHaveLength(2);
    expect(made.campaign.materials.fuel).toBe(convoyed().materials.fuel);

    expect(
      submitHaul(
        convoyed(),
        {
          rolls: [1, 2, 3].map((roll) => ({ roll: roll as 1, madeTen: true as const })),
          rareItems: dice(3),
        },
        AT,
      ),
    ).toEqual({ ok: false, problem: 'Crashed Convoy makes 2 rolls 10s, and no more.' });
    expect(
      submitHaul(
        { ...convoyed(3), log: [] },
        { rolls: [{ roll: 1, madeTen: true }], rareItems: dice(1) },
        AT,
      ),
    ).toEqual({ ok: false, problem: 'No story makes a roll a 10 this turn.' });
  });

  it('are never made of a forced roll', () => {
    expect(
      submitHaul(
        convoyed(),
        {
          rolls: [{ roll: 4, madeTen: true, forced: { skill: 'mechanics', material: 'hardware' } }],
          rareItems: dice(1),
        },
        AT,
      ),
    ).toEqual({ ok: false, problem: 'A roll made a 10 is not forced as well.' });
  });
});

describe('Part 2a’s XP to the survivor and every bondmate (pg. 91; R140)', () => {
  const bonded = (survivor: Survivor, group = 1): Survivor => ({
    ...survivor,
    storyTrait: 'bonded',
    bondGroup: group,
  });
  const advancing = (survivors: readonly Survivor[]): Campaign => ({
    ...playing('left-behind-2a', survivors),
    step: 'character-advancement',
    log: [
      entry({ kind: 'mission-selected', team: 1, mission: 'left-behind-2a', names: [] }),
      entry({
        kind: 'mission-played',
        team: 1,
        mission: 'left-behind-2a',
        story: { survivor: 'earl', name: 'Earl Rhodes', result: 'nobody-rescued' },
      }),
    ],
  });

  it('goes to the survivor and each bondmate, 1 each, a Teacher on the mission or not', () => {
    const campaign = advancing([
      bonded(earl()),
      { ...bonded(carla), skills: { teaching: 0 } },
      bonded(ruby, 2),
    ]);
    const pool = xpPool(campaign, 'discretionary');

    expect(bondmateXpRecipients(campaign)?.map((survivor) => survivor.id)).toEqual([
      'earl',
      'carla',
    ]);
    expect(pool.total).toBe(2);
    expect(pool.capPerSurvivor).toBe(1);
    expect(pool.eligible.map((survivor) => survivor.id)).toEqual(['earl', 'carla']);
    expect(pool.sentBy).toBe('left-behind-2a');
  });

  it('is the usual point on any other turn, and nothing when the survivor is gone', () => {
    const gone = advancing([carla, ruby]);

    expect(bondmateXpRecipients(playing('warehouse'))).toBeUndefined();
    expect(xpPool(playing('warehouse'), 'discretionary').sentBy).toBeUndefined();
    expect(bondmateXpRecipients(gone)).toEqual([]);
    expect(xpPool(gone, 'discretionary')).toMatchObject({
      total: 0,
      emptyBecause: 'sent-to-the-gone',
    });
  });
});

describe('Neighbor’s Rifle’s Tier 3 (pg. 99; R142)', () => {
  const build = {
    skill: 'long-guns' as const,
    stat: { dexterity: 3 },
    item: { item: 'rifle' as const, grade: 'quality' as const },
  };

  it('arrives with Long Guns, Dexterity 3 and a quality rifle, the rest by hand', () => {
    const built = strangerSurvivor('Dale Hart', { team: 1, stranger: 0, tier: 3, build }, 6, {
      id: 'dale',
    });

    expect(built.stats.dexterity).toBe(3);
    expect([...Object.values(built.stats)].sort()).toEqual([0, 1, 2, 3]);
    expect(built.skills).toEqual({ archery: 0, 'long-guns': 0 });
    expect(built.items).toEqual([{ id: buildItemId('dale'), item: 'rifle', grade: 'quality' }]);
  });

  it('is built at Create New Survivors from the record, and the history says so', () => {
    const campaign: Campaign = {
      ...playing('neighbors-rifle', [earl({ ...holding('neighbors-rifle'), tier: 3 }), carla]),
      step: 'create-new-survivors',
    };
    const ended = storyRecord(campaign, team(campaign), 'neighbors-rifle', {
      result: 'seating-failed',
    });
    const joined = submitStrangerJoined(
      {
        ...campaign,
        log: [
          ...campaign.log,
          entry({ kind: 'mission-played', team: 1, mission: 'neighbors-rifle', story: ended }),
        ],
      },
      { team: 1, stranger: 0, name: 'Dale Hart', id: 'dale' },
      AT,
    );
    if (!joined.ok) throw new Error(joined.problem);

    expect(named(joined.campaign, 'dale').skills).toEqual({ 'long-guns': 0 });
    expect(
      joined.campaign.log.find(({ event }) => event.kind === 'stranger-joined')?.event,
    ).toMatchObject({ build });
  });
});
