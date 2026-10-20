import { describe, expect, it } from 'vitest';
import type { MagicMissionId } from '../data/missions';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { checkBuild } from './build';
import { createNewCampaign, type Campaign } from './campaign';
import type { LogEntry, MagicRecord } from './log';
import {
  isMagicMission,
  magicAsks,
  magicProblem,
  mysticLibraryUnlocked,
  necromancerKilled,
  necromancerWins,
} from './magicMissions';
import { submitMissionEnded } from './missionForms';
import { projectCost } from './projects';
import { createSurvivor } from './survivor';

const AT = '2026-10-19T09:00:00.000Z';
const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });

const played = (mission: MagicMissionId, magic?: MagicRecord, turn = 2): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-played', team: 1, mission, ...(magic === undefined ? {} : { magic }) },
});

/** Turn 4's Play the Mission in a Magic campaign, Earl on team 1 playing `mission`. */
const playing = (mission: MagicMissionId): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  step: 'tactical-mission',
  origin: 'magic',
  survivors: [earl],
  assignments: { earl: { task: 'mission', team: 1 } },
  log: [
    {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-selected', team: 1, mission, names: [] },
    },
  ],
});

const recorded = (mission: MagicMissionId, magic?: MagicRecord) =>
  submitMissionEnded(
    playing(mission),
    {
      kind: 'mission-played',
      team: 1,
      mission,
      wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2, humanity: 3 }],
      ...(magic === undefined ? {} : { magic }),
    },
    [],
    AT,
  );

describe('the Magic missions (pp. 112–115)', () => {
  it('are the three, each asking its own', () => {
    expect(isMagicMission('the-graveyard')).toBe(true);
    expect(isMagicMission('experimental-data')).toBe(false);
    expect(magicAsks('the-graveyard')).toEqual(['completed']);
    expect(magicAsks('the-necromancer')).toEqual(['completed', 'killed']);
    expect(magicAsks('the-dark')).toEqual([]);
  });

  it('ask each answer yes or no, and nothing else; The Dark and every other mission none', () => {
    expect(magicProblem('the-graveyard', { completed: false })).toBeNull();
    expect(magicProblem('the-necromancer', { completed: true, killed: false })).toBeNull();
    expect(magicProblem('the-graveyard', undefined)).toBe('Say how the mission ended.');
    expect(magicProblem('the-necromancer', { completed: true })).toBe('Say how the mission ended.');
    expect(magicProblem('the-graveyard', { completed: true, killed: true })).toBe(
      'That isn’t something this mission ends with.',
    );
    expect(magicProblem('the-dark', undefined)).toBeNull();
    expect(magicProblem('the-dark', { completed: true })).toBe(
      'This mission records nothing more than that it was played.',
    );
    expect(magicProblem('gather-materials', { completed: true })).toMatch(/nothing more/);
  });

  it('are recorded with the outcome', () => {
    const result = recorded('the-necromancer', { completed: true, killed: true });
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log.at(-1)?.event).toMatchObject({
      magic: { completed: true, killed: true },
    });
    expect(recorded('the-graveyard')).toEqual({ ok: false, problem: 'Say how the mission ended.' });
    expect(recorded('the-dark').ok).toBe(true);
  });
});

describe('what they leave (R123, R124, R153)', () => {
  const campaign = (log: readonly LogEntry[]) => ({ ...playing('the-graveyard'), log });

  it('unlock the Mystic Library from a completed Graveyard only', () => {
    expect(mysticLibraryUnlocked(campaign([]))).toBe(false);
    // An entry from before the Magic record has none.
    expect(mysticLibraryUnlocked(campaign([played('the-graveyard')]))).toBe(false);
    expect(mysticLibraryUnlocked(campaign([played('the-graveyard', { completed: false })]))).toBe(
      false,
    );
    expect(
      mysticLibraryUnlocked(
        campaign([played('the-necromancer', { completed: true, killed: false })]),
      ),
    ).toBe(false);
    expect(mysticLibraryUnlocked(campaign([played('the-graveyard', { completed: true })]))).toBe(
      true,
    );
  });

  it('count the Necromancer’s wins and whether he was ever killed', () => {
    const log = [
      played('the-necromancer', { completed: true, killed: false }),
      played('the-necromancer', { completed: false, killed: true }),
      played('the-necromancer', { completed: true, killed: false }),
      played('the-graveyard', { completed: true }),
    ];

    expect(necromancerWins(campaign(log))).toBe(2);
    expect(necromancerKilled(campaign(log))).toBe(true);
    expect(necromancerKilled(campaign(log.filter((_, at) => at !== 1)))).toBe(false);
    expect(necromancerWins(campaign([]))).toBe(0);
  });
});

describe('building the Mystic Library (pp. 70, 72; R123, R124)', () => {
  /** Turn 4's Planning Phase in a Magic campaign with Hardware and Labor to spare. */
  const planning = (log: readonly LogEntry[], slots: Campaign['base'] = null): Campaign =>
    withPlanningBegun({
      ...createNewCampaign('Cedar Hollow'),
      origin: 'magic',
      turn: 4,
      materials: { food: 0, fuel: 0, hardware: 20 },
      ...projectTeamWorth(9),
      base: slots ?? { id: 'small-town-home', slots: {} },
      log,
    });
  const order = { slot: 'garage', facility: 'mystic-library' } as const;
  const warned = (campaign: Campaign) =>
    checkBuild(campaign, order).warnings.map((warning) => warning.code);

  it('is warned about until The Graveyard is completed', () => {
    expect(warned(planning([]))).toContain('mission-locked');
    expect(warned(planning([played('the-graveyard', { completed: true })]))).not.toContain(
      'mission-locked',
    );
  });

  it('costs 1 Labor less, and so do its upgrades, once the Necromancer is killed', () => {
    const killed = [played('the-necromancer', { completed: false, killed: true })];
    const facility = { kind: 'facility', ...order } as const;

    expect(
      projectCost(planning([]), facility).labor - projectCost(planning(killed), facility).labor,
    ).toBe(1);

    const built = {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'mystic-library', builtOnTurn: 1 } } },
    } as const;
    const upgrade = { kind: 'upgrade', slot: 'garage', upgrade: 'study-room' } as const;
    const plain = projectCost(planning([], built), upgrade);
    const cheaper = projectCost(planning(killed, built), upgrade);

    expect(plain.labor - cheaper.labor).toBe(Math.min(1, plain.labor));
    // Nothing else is touched, an upgrade to another facility included.
    const other = { kind: 'facility', slot: 'garage', facility: 'workshop' } as const;
    expect(projectCost(planning(killed), other)).toEqual(projectCost(planning([]), other));
    const workshop = {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 } } },
    } as const;
    const tools = { kind: 'upgrade', slot: 'garage', upgrade: 'gunsmith' } as const;
    expect(projectCost(planning(killed, workshop), tools)).toEqual(
      projectCost(planning([], workshop), tools),
    );
  });
});
