import { describe, expect, it } from 'vitest';
import type { StoryMissionId } from '../data/missions';
import { storyResult, type StoryResult } from '../data/stories';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { submitStrangerJoined } from './campaignForms';
import type { CampaignEvent, LogEntry, StoryRecord } from './log';
import { submitMissionEnded } from './missionForms';
import { missionPlayed, missionsOnOffer, turnMissions, unresolvedTeams } from './missions';
import {
  isStory,
  nextPart,
  partNow,
  storyEnding,
  storyHolder,
  storyProblem,
  storyRecipients,
  storyRecord,
  withStoryRecorded,
} from './storyMissions';
import { rescuedStrangers, strangersWaiting } from './strangers';
import { createSurvivor } from './survivor';
import { storiesDone, storiesOnOffer } from './traits';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

const holding = (story: StoryMissionId, attachedOnTurn = 2) => ({
  stories: [{ mission: story, attachedOnTurn }],
});

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...holding('left-behind-1'),
  ...overrides,
});
const carla = createSurvivor('Carla Proust', 3, { id: 'carla' });
const nell = createSurvivor('Nell Haig', 1, { id: 'nell' });
const ruby = createSurvivor('Ruby Vance', 2, { id: 'ruby' });

const entry = (event: CampaignEvent, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

const chose = (mission: StoryMissionId, team = 1): LogEntry =>
  entry({ kind: 'mission-selected', team, mission, names: [] });

/** Turn 4, Play the Mission: Earl, Carla and Nell on team 1 playing `story`, Ruby at home. */
function playing(
  story: StoryMissionId = 'left-behind-1',
  survivors: readonly Survivor[] = [earl(), carla, nell, ruby],
  overrides: Partial<Campaign> = {},
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors,
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
      nell: { task: 'mission', team: 1 },
    },
    log: [chose(story)],
    ...overrides,
  };
}

const teamOf = (campaign: Campaign): readonly Survivor[] =>
  campaign.survivors.filter((survivor) => campaign.assignments[survivor.id]?.task === 'mission');

const result = (story: StoryMissionId, id: string): StoryResult =>
  storyResult(story, id) as StoryResult;

/** The record of `result`, sending whom the next part goes to. */
const recordOf = (campaign: Campaign, story: StoryMissionId, ending: string, to?: string) =>
  storyRecord(campaign, teamOf(campaign), story, {
    result: ending,
    ...(to === undefined ? {} : { to }),
  });

/** The team's outcome, with everybody home at full Health. */
function ended(
  campaign: Campaign,
  story: StoryMissionId,
  sent: Partial<StoryRecord> & Pick<StoryRecord, 'result'>,
) {
  return {
    kind: 'mission-played' as const,
    team: 1,
    mission: story,
    wounds: teamOf(campaign).map((member) => ({
      survivor: member.id,
      name: member.name,
      health: member.currentHp,
    })),
    story: { survivor: 'earl', name: 'Earl Rhodes', ...sent },
  };
}

function accepted(result: ReturnType<typeof submitMissionEnded>): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const named = (campaign: Campaign, id: string) =>
  campaign.survivors.find((survivor) => survivor.id === id) as Survivor;

describe('who plays a story (pg. 87; R116)', () => {
  it('is a story mission, and the team member it is attached to', () => {
    expect(isStory('warehouse')).toBe(true);
    expect(isStory('thin-the-herd')).toBe(false);
    expect(isStory('chased')).toBe(false);
    expect(storyHolder([carla, earl()], 'left-behind-1')?.id).toBe('earl');
    expect(storyHolder([carla, earl()], 'warehouse')).toBeUndefined();
  });

  /** The acceptance's second half. */
  it('offers a story attached to Earl to no team Earl is not on', () => {
    const campaign = {
      ...playing(),
      step: 'select-mission' as const,
      assignments: {
        earl: { task: 'mission' as const, team: 1 },
        ruby: { task: 'mission' as const, team: 2 },
      },
    };

    expect(missionsOnOffer(campaign, 1)).toContain('left-behind-1');
    expect(missionsOnOffer(campaign, 2)).not.toContain('left-behind-1');
  });
});

describe('the next part (pp. 90, 94, 96, 99, 101; R136, R139)', () => {
  it('attaches the part a result names', () => {
    expect(nextPart(playing(), 'left-behind-1', result('left-behind-1', 'rescued'))).toEqual({
      story: 'left-behind-2a',
      to: 'attached',
    });
    expect(nextPart(playing(), 'left-behind-1', result('left-behind-1', 'not-rescued'))?.now).toBe(
      true,
    );
    expect(nextPart(playing(), 'warehouse', result('warehouse', 'played'))).toBeUndefined();
  });

  it('attaches none already held by somebody else, or done', () => {
    const rifle = playing('neighbors-rifle', [
      earl(holding('neighbors-rifle')),
      { ...carla, ...holding('warehouse') },
    ]);
    const passed = result('neighbors-rifle', 'seating-passed');
    const warehouseDone = playing('neighbors-rifle', [earl(holding('neighbors-rifle')), carla], {
      log: [
        entry(
          {
            kind: 'mission-played',
            team: 1,
            mission: 'warehouse',
            story: { survivor: 'carla', name: 'Carla Proust', result: 'played', xp: 1 },
          },
          3,
        ),
        chose('neighbors-rifle'),
      ],
    });

    expect(nextPart(rifle, 'neighbors-rifle', passed)).toBeUndefined();
    expect(nextPart(warehouseDone, 'neighbors-rifle', passed)).toBeUndefined();
  });

  it('attaches a story again that its own ending sends round again', () => {
    const stash = playing('preppers-stash-2', [earl(holding('preppers-stash-2')), carla]);

    expect(
      nextPart(stash, 'preppers-stash-2', result('preppers-stash-2', 'trap-door-not-opened')),
    ).toEqual({ story: 'preppers-stash-2', to: 'anyone' });
  });

  it('goes to anybody in the community, or a Tier 2 or 3 on the team, as the result says', () => {
    const campaign = playing();

    expect(
      storyRecipients(campaign, teamOf(campaign), { story: 'warehouse', to: 'anyone' }),
    ).toEqual(campaign.survivors);
    expect(
      storyRecipients(campaign, teamOf(campaign), {
        story: 'warehouse',
        to: 'team-tier-2-or-3',
      }).map((survivor) => survivor.id),
    ).toEqual(['earl', 'carla']);
    expect(
      storyRecipients(campaign, teamOf(campaign), { story: 'left-behind-2a', to: 'attached' }),
    ).toEqual([]);
  });
});

describe('storyProblem', () => {
  const problem = (
    campaign: Campaign,
    mission: Parameters<typeof storyProblem>[2],
    record?: StoryRecord,
  ) => storyProblem(campaign, teamOf(campaign), mission, record);
  const sent = (ending: string, attached?: StoryRecord['attached']): StoryRecord => ({
    survivor: 'earl',
    name: 'Earl Rhodes',
    result: ending,
    ...(attached === undefined ? {} : { attached }),
  });

  it('records no story for any other mission', () => {
    expect(problem(playing(), 'thin-the-herd')).toBeNull();
    expect(problem(playing(), 'thin-the-herd', sent('rescued'))).toMatch(/Only a story mission/);
  });

  it('asks for an ending, one of the story’s own, from a team with its survivor on it', () => {
    expect(problem(playing(), 'left-behind-1')).toBe('Choose how the story ended.');
    expect(problem(playing(), 'left-behind-1', sent('fire-lit'))).toBe(
      'Choose one of the story’s endings.',
    );
    expect(problem(playing(), 'warehouse', sent('played'))).toBe(
      'Nobody on the team has this story attached.',
    );
    expect(problem(playing(), 'left-behind-1', sent('rescued'))).toBeNull();
  });

  it('asks who takes the next part where the player chooses, from those who may', () => {
    const convoy = playing('crashed-convoy', [earl(holding('crashed-convoy')), carla, nell, ruby]);
    const stash = playing('preppers-stash-1', [
      earl(holding('preppers-stash-1')),
      carla,
      nell,
      ruby,
    ]);
    const to = (survivor: Survivor, mission: StoryMissionId) => ({
      mission,
      survivor: survivor.id,
      name: survivor.name,
    });

    expect(problem(convoy, 'crashed-convoy', sent('search-passed'))).toBe(
      'Choose who the next part is attached to.',
    );
    expect(problem(convoy, 'crashed-convoy', sent('search-passed', to(nell, 'warehouse')))).toBe(
      'The next part goes to a Tier 2 or 3 survivor on the team.',
    );
    expect(problem(convoy, 'crashed-convoy', sent('search-passed', to(ruby, 'warehouse')))).toBe(
      'The next part goes to a Tier 2 or 3 survivor on the team.',
    );
    expect(
      problem(convoy, 'crashed-convoy', sent('search-passed', to(carla, 'warehouse'))),
    ).toBeNull();
    expect(problem(convoy, 'crashed-convoy', sent('search-failed'))).toBeNull();
    expect(
      problem(stash, 'preppers-stash-1', {
        ...sent('duffel-recovered'),
        attached: { mission: 'preppers-stash-2', survivor: 'nobody', name: 'Nobody' },
      }),
    ).toBe('The next part goes to somebody in the community.');
    expect(
      problem(stash, 'preppers-stash-1', sent('duffel-recovered', to(ruby, 'preppers-stash-2'))),
    ).toBeNull();
  });
});

describe('storyRecord (pp. 89–102; R85, R120, R138)', () => {
  it('bonds a rescued loved one to the survivor in a new group, both with 1 XP', () => {
    const campaign = playing('left-behind-1', [earl(), carla, nell, ruby], {
      setAside: [
        { ...createSurvivor('Gone', 2, { id: 'gone' }), storyTrait: 'bonded', bondGroup: 4 },
      ],
    });

    expect(recordOf(campaign, 'left-behind-1', 'rescued')).toEqual({
      survivor: 'earl',
      name: 'Earl Rhodes',
      result: 'rescued',
      xp: 1,
      trait: 'bonded',
      bondGroup: 5,
      attached: { mission: 'left-behind-2a', survivor: 'earl', name: 'Earl Rhodes' },
      joins: { tier: 2, bondGroup: 5, xp: 1 },
    });
  });

  it('adds the loved one to a group the survivor already holds, keeping it', () => {
    const bonded = playing('left-behind-1', [earl({ storyTrait: 'bonded', bondGroup: 2 }), carla]);
    const record = recordOf(bonded, 'left-behind-1', 'rescued');

    expect(record.trait).toBeUndefined();
    expect(record.bondGroup).toBeUndefined();
    expect(record.joins).toEqual({ tier: 2, bondGroup: 2, xp: 1 });
  });

  it('bonds Part 2a’s family member into the survivor’s group, or none once Bonded is lost (R138)', () => {
    const story = holding('left-behind-2a');
    const bonded = playing('left-behind-2a', [
      earl({ ...story, storyTrait: 'bonded', bondGroup: 2 }),
    ]);
    const lost = playing('left-behind-2a', [earl({ ...story, storyTrait: 'jaded' })]);

    expect(recordOf(bonded, 'left-behind-2a', 'family-rescued').joins).toEqual({
      tier: 2,
      bondGroup: 2,
    });
    expect(recordOf(lost, 'left-behind-2a', 'family-rescued').joins).toEqual({ tier: 2 });
    expect(recordOf(lost, 'left-behind-2a', 'stranger-rescued').joins).toEqual({ tier: 2 });
    expect(recordOf(lost, 'left-behind-2a', 'nobody-rescued')).toEqual({
      survivor: 'earl',
      name: 'Earl Rhodes',
      result: 'nobody-rescued',
    });
  });

  it('brings Neighbor’s Rifle’s Tier 3 only to a Tier 3 survivor (pg. 99)', () => {
    const story = holding('neighbors-rifle');
    const leader = playing('neighbors-rifle', [earl({ ...story, tier: 3 }), carla]);
    const citizen = playing('neighbors-rifle', [earl(story), carla]);

    expect(recordOf(leader, 'neighbors-rifle', 'seating-failed').joins).toEqual({ tier: 3 });
    expect(recordOf(citizen, 'neighbors-rifle', 'seating-failed').joins).toBeUndefined();
    expect(recordOf(citizen, 'neighbors-rifle', 'seating-passed', 'carla').attached).toEqual({
      mission: 'warehouse',
      survivor: 'carla',
      name: 'Carla Proust',
    });
  });

  it('keeps Sentimental Value attached when the heirloom is not found (R121)', () => {
    const campaign = playing('sentimental-value', [earl(holding('sentimental-value'))]);

    expect(recordOf(campaign, 'sentimental-value', 'heirloom-not-recovered')).toEqual({
      survivor: 'earl',
      name: 'Earl Rhodes',
      result: 'heirloom-not-recovered',
      trait: 'jaded',
      stays: true,
    });
  });

  it('is nothing until an ending is chosen, or with nobody on the team to have played it', () => {
    expect(
      storyEnding(playing(), teamOf(playing()), 'left-behind-1', { result: '' }),
    ).toBeUndefined();
    expect(storyEnding(playing(), [carla], 'left-behind-1', { result: 'rescued' })).toBeUndefined();
    expect(
      storyEnding(playing(), teamOf(playing()), 'left-behind-1', { result: 'rescued' }),
    ).toEqual(recordOf(playing(), 'left-behind-1', 'rescued'));
  });
});

describe('withStoryRecorded (R85, R116, R121)', () => {
  it('gives the XP and trait, takes the story off, and attaches the next part this turn', () => {
    const campaign = playing('left-behind-1', [earl({ xp: 2, storyTrait: 'driven' }), carla]);
    const after = withStoryRecorded(
      campaign,
      'left-behind-1',
      recordOf(campaign, 'left-behind-1', 'rescued'),
    );

    expect(named(after, 'earl')).toMatchObject({
      xp: 3,
      storyTrait: 'bonded',
      bondGroup: 1,
      stories: [{ mission: 'left-behind-2a', attachedOnTurn: 4 }],
    });
    expect(named(after, 'carla')).toBe(carla);
  });

  it('drops a bond group with Bonded, and leaves one a trait-less ending does not touch', () => {
    const story = holding('left-behind-2b');
    const bonded = playing('left-behind-2b', [
      earl({ ...story, storyTrait: 'bonded', bondGroup: 2 }),
    ]);
    const jaded = withStoryRecorded(
      bonded,
      'left-behind-2b',
      recordOf(bonded, 'left-behind-2b', 'body-brought-home'),
    );
    const left = withStoryRecorded(
      bonded,
      'left-behind-2b',
      recordOf(bonded, 'left-behind-2b', 'body-left'),
    );

    expect(named(jaded, 'earl')).toMatchObject({
      storyTrait: 'jaded',
      bondGroup: null,
      stories: [],
    });
    expect(named(left, 'earl')).toMatchObject({ storyTrait: 'bonded', bondGroup: 2, stories: [] });
  });

  it('leaves a story that stays, and attaches one sent round again to whoever takes it', () => {
    const sentimental = playing('sentimental-value', [earl(holding('sentimental-value', 3))]);
    const stash = playing('preppers-stash-2', [earl(holding('preppers-stash-2', 3)), carla]);

    expect(
      named(
        withStoryRecorded(
          sentimental,
          'sentimental-value',
          recordOf(sentimental, 'sentimental-value', 'heirloom-not-recovered'),
        ),
        'earl',
      ).stories,
    ).toEqual([{ mission: 'sentimental-value', attachedOnTurn: 3 }]);

    const passed = withStoryRecorded(
      stash,
      'preppers-stash-2',
      recordOf(stash, 'preppers-stash-2', 'trap-door-not-opened', 'carla'),
    );
    expect(named(passed, 'earl').stories).toEqual([]);
    expect(named(passed, 'carla').stories).toEqual([
      { mission: 'preppers-stash-2', attachedOnTurn: 4 },
    ]);
  });

  it('drops Health above a maximum Berserk took with it (R133)', () => {
    const story = holding('left-behind-2b');
    const berserk = playing('left-behind-2b', [
      earl({ ...story, storyTrait: 'berserk', currentHp: 3 }),
    ]);

    expect(
      named(
        withStoryRecorded(
          berserk,
          'left-behind-2b',
          recordOf(berserk, 'left-behind-2b', 'fire-lit'),
        ),
        'earl',
      ),
    ).toMatchObject({ storyTrait: 'lone-wolf', currentHp: 2, xp: 2 });
  });
});

describe('the stories done (R116, R121, R139)', () => {
  const played = (mission: StoryMissionId, story: Partial<StoryRecord> = {}): LogEntry =>
    entry({
      kind: 'mission-played',
      team: 1,
      mission,
      story: { survivor: 'earl', name: 'Earl Rhodes', result: 'played', ...story },
    });

  it('are the stories ended, but not one kept or sent round again', () => {
    const campaign = playing('left-behind-1', [earl()], {
      log: [
        played('crashed-convoy'),
        played('sentimental-value', { stays: true }),
        played('preppers-stash-2', {
          attached: { mission: 'preppers-stash-2', survivor: 'earl', name: 'Earl Rhodes' },
        }),
        entry({ kind: 'mission-played', team: 1, mission: 'chased' }),
      ],
    });

    expect([...storiesDone(campaign)]).toEqual(['crashed-convoy']);
  });

  it('are not offered at promotion', () => {
    const rookie = createSurvivor('Pip', 1, { id: 'pip' });
    const campaign = playing('left-behind-1', [rookie], { log: [played('crashed-convoy')] });

    expect(storiesOnOffer(campaign, rookie)).not.toContain('crashed-convoy');
    expect(storiesOnOffer(campaign, rookie)).toContain('sentimental-value');
  });

  it('plays Part 2b at once only when Part 1 attached it', () => {
    const lost = recordOf(playing(), 'left-behind-1', 'not-rescued');

    expect(partNow('left-behind-1', lost)).toBe('left-behind-2b');
    const unattached: StoryRecord = {
      survivor: lost.survivor,
      name: lost.name,
      result: lost.result,
    };

    expect(partNow('left-behind-1', unattached)).toBeUndefined();
    expect(
      partNow('left-behind-1', recordOf(playing(), 'left-behind-1', 'rescued')),
    ).toBeUndefined();
  });
});

describe('a story’s ending, recorded (Z7-3)', () => {
  /** The acceptance's first half. */
  it('Left Behind Part 1 with the loved one rescued brings a bonded survivor, both with 1 XP, and attaches Part 2a', () => {
    const campaign = playing();
    const after = accepted(
      submitMissionEnded(campaign, ended(campaign, 'left-behind-1', { result: 'rescued' }), [], AT),
    );

    expect(named(after, 'earl')).toMatchObject({
      xp: 1,
      storyTrait: 'bonded',
      bondGroup: 1,
      stories: [{ mission: 'left-behind-2a', attachedOnTurn: 4 }],
    });

    const advancing = { ...after, step: 'create-new-survivors' as const };
    expect(strangersWaiting(advancing)).toEqual([
      { team: 1, stranger: 0, tier: 2, story: 'left-behind-1', bondGroup: 1, xp: 1 },
    ]);

    const joined = submitStrangerJoined(
      advancing,
      { team: 1, stranger: 0, name: 'June Rhodes', roll: 6, id: 'june' },
      AT,
    );
    if (!joined.ok) throw new Error(joined.problem);

    expect(named(joined.campaign, 'june')).toMatchObject({
      tier: 2,
      xp: 1,
      storyTrait: 'bonded',
      bondGroup: 1,
      skills: { archery: 0 },
    });
    expect(
      joined.campaign.log.find(({ event }) => event.kind === 'stranger-joined')?.event,
    ).toMatchObject({
      kind: 'stranger-joined',
      bondGroup: 1,
      xp: 1,
    });
    expect(strangersWaiting(joined.campaign)).toEqual([]);
  });

  it('writes the record the rules give, whatever the screen sent', () => {
    const campaign = playing();
    const after = accepted(
      submitMissionEnded(
        campaign,
        ended(campaign, 'left-behind-1', { result: 'rescued', xp: 5, name: 'Typed' }),
        [],
        AT,
      ),
    );

    expect(after.log.at(-1)?.event).toMatchObject({
      kind: 'mission-played',
      story: recordOf(campaign, 'left-behind-1', 'rescued'),
    });
  });

  it('refuses an ending that is not the story’s', () => {
    const campaign = playing();

    expect(
      submitMissionEnded(campaign, ended(campaign, 'left-behind-1', { result: 'played' }), [], AT),
    ).toEqual({ ok: false, problem: 'Choose one of the story’s endings.' });
  });

  it('chooses Part 2b for the same team at once when the loved one is lost (R119)', () => {
    const campaign = playing();
    const after = accepted(
      submitMissionEnded(
        campaign,
        ended(campaign, 'left-behind-1', { result: 'not-rescued' }),
        [],
        AT,
      ),
    );

    expect(named(after, 'earl')).toMatchObject({
      storyTrait: 'berserk',
      stories: [{ mission: 'left-behind-2b', attachedOnTurn: 4 }],
    });
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'mission-selected',
      team: 1,
      mission: 'left-behind-2b',
      names: ['Earl Rhodes', 'Carla Proust', 'Nell Haig'],
    });
    expect(turnMissions(after).choices[0]?.mission).toBe('left-behind-2b');
    expect(missionPlayed(after, 1)).toBe(false);
    expect(unresolvedTeams(after)).toEqual([1]);
    expect(rescuedStrangers(after)).toEqual([]);
  });

  it('chooses no Part 2b when its survivor died on Part 1, the story going with them (R116)', () => {
    const campaign = playing();
    const outcome = ended(campaign, 'left-behind-1', { result: 'not-rescued' });
    const after = accepted(
      submitMissionEnded(campaign, outcome, [{ team: 1, survivor: 'earl', taken: {} }], AT),
    );

    expect(after.survivors.map((survivor) => survivor.id)).not.toContain('earl');
    expect(turnMissions(after).choices[0]?.mission).toBe('left-behind-1');
    expect(missionPlayed(after, 1)).toBe(true);
  });
});
