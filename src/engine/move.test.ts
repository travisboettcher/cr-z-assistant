import { describe, expect, it } from 'vitest';
import { queued } from '../test/queued';
import { submitBaseMove } from './advancementForms';
import { createNewCampaign, type Campaign } from './campaign';
import type { LogEntry } from './log';
import { moveProblem, withBaseMoved } from './move';
import { createSurvivor } from './survivor';
import { expectAccepted, expectRefused } from '../test/forms';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';
const LATER = '2026-10-13T09:05:00.000Z';

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const hera = createSurvivor('Hera Okafor', 4, { id: 'hera' });
const ivan = createSurvivor('Ivan Moss', 4, { id: 'ivan' });
const june = createSurvivor('June Park', 4, { id: 'june' });

const mission = (event: LogEntry['event']): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event,
});

/** Team 1 claimed the base named, and won it on end condition 1. */
const won = (base: 'distillery' | 'summer-camp' | 'hobby-farm'): readonly LogEntry[] => [
  mission({ kind: 'mission-selected', team: 1, mission: 'claim-a-new-base', names: [], base }),
  mission({
    kind: 'claim-a-new-base-resolved',
    team: 1,
    endCondition: 1,
    strangers: [],
    vehiclesOnArea: 0,
  }),
];

/**
 * Turn 4, at the last Advancement step, on a Hobby Farm with a Workshop built
 * in its garage and Earl staffing it; a claim on a Distillery won this turn.
 */
function moving(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'add-facilities-and-upgrades',
    materials: { food: 9, fuel: 2, hardware: 7, rare: 1 },
    base: {
      id: 'hobby-farm',
      slots: { garage: { built: { facility: 'workshop', builtOnTurn: 2 } } },
    },
    survivors: [earl, hera],
    assignments: { earl: { task: 'staff', slot: 'garage' }, hera: { task: 'rest' } },
    log: [...won('distillery')],
    ...overrides,
  };
}

describe('moveProblem', () => {
  it('lets the community move once its claim is won and its projects are done', () => {
    expect(moveProblem(moving(), [])).toBeNull();
  });

  it('waits for the end of the Advancement Phase (R25)', () => {
    expect(moveProblem(moving({ step: 'tactical-mission' }), [])).toMatch(/Advancement Phase/);
    expect(moveProblem(moving({ step: 'assign-facility-staff' }), [])).toMatch(/Advancement Phase/);
  });

  it('waits for last turn’s projects, which are built into the old base (R25)', () => {
    const due = moving({
      projects: [
        queued({ kind: 'facility', slot: 'front-yard', facility: 'watchtower', orderedOnTurn: 3 }),
      ],
    });

    expect(moveProblem(due, [])).toMatch(/Finish last turn’s projects/);
  });

  it('refuses without a claim won this turn, and a second time', () => {
    expect(moveProblem(moving({ log: [] }), [])).toMatch(/Claim a New Base won this turn/);

    const moved = expectAccepted(submitBaseMove(moving(), [], LATER));
    expect(moveProblem(moved, [])).toMatch(/already moved/);
  });

  it('refuses a community with no base to leave', () => {
    expect(moveProblem(moving({ base: null }), [])).toMatch(/nothing to move out of/);
  });

  it('asks for one Hero for each the new base cannot hold (pg. 54; R32)', () => {
    // A Summer Camp is Tier 1: it holds one Hero, and three are moving.
    const crowded = moving({ survivors: [earl, hera, ivan, june], log: [...won('summer-camp')] });

    expect(moveProblem(crowded, [])).toMatch(/choose the 2 Heroes who leave/);
    expect(moveProblem(crowded, ['hera'])).toMatch(/2 Heroes fewer/);
    expect(moveProblem(crowded, ['hera', 'ivan'])).toBeNull();
    expect(moveProblem(crowded, ['hera', 'ivan', 'june'])).toMatch(/2 Heroes fewer/);
  });

  it('says the Hero in the singular when one leaves', () => {
    const two = moving({ survivors: [hera, ivan], log: [...won('summer-camp')] });

    expect(moveProblem(two, [])).toMatch(/one Hero fewer .* choose the Hero who leaves/);
  });

  it('sends nobody away when the Heroes fit', () => {
    expect(moveProblem(moving(), ['hera'])).toMatch(/holds every Hero/);
  });

  it('takes only a Hero in the community, and each one once', () => {
    const crowded = moving({ survivors: [earl, hera, ivan, june], log: [...won('summer-camp')] });

    expect(moveProblem(crowded, ['hera', 'hera'])).toMatch(/once/);
    expect(moveProblem(crowded, ['hera', 'earl'])).toMatch(/Only a Hero/);
    expect(moveProblem(crowded, ['hera', 'nobody'])).toMatch(/Only a Hero/);
  });
});

describe('withBaseMoved', () => {
  it('moves into the new base with empty slots, leaving what was built (R26)', () => {
    expect(withBaseMoved(moving(), []).base).toEqual({ id: 'distillery', slots: {} });
  });

  it('carries every material over, uncapped (pg. 54)', () => {
    expect(withBaseMoved(moving(), []).materials).toEqual({
      food: 9,
      fuel: 2,
      hardware: 7,
      rare: 1,
    });
  });

  it('is a new building even when the base is the same type (R26)', () => {
    expect(withBaseMoved(moving({ log: [...won('hobby-farm')] }), []).base).toEqual({
      id: 'hobby-farm',
      slots: {},
    });
  });

  it('sets the Heroes who leave aside, whole, with their tasks gone (R31)', () => {
    const after = withBaseMoved(
      moving({ survivors: [earl, hera, ivan], log: [...won('summer-camp')] }),
      ['ivan'],
    );

    expect(after.survivors).toEqual([earl, hera]);
    expect(after.setAside).toEqual([ivan]);
    expect(after.assignments).toEqual({
      earl: { task: 'staff', slot: 'garage' },
      hera: { task: 'rest' },
    });
  });

  it('removes a leaving Hero’s task, and keeps who was set aside before', () => {
    const after = withBaseMoved(
      moving({ survivors: [earl, hera, ivan], setAside: [june], log: [...won('summer-camp')] }),
      ['hera'],
    );

    expect(after.setAside).toEqual([june, hera]);
    expect(Object.keys(after.assignments)).toEqual(['earl']);
  });

  it('changes nothing when no claim was won', () => {
    const campaign = moving({ log: [] });

    expect(withBaseMoved(campaign, [])).toBe(campaign);
  });
});

describe('submitBaseMove', () => {
  it('moves, and records the base left and the base moved into', () => {
    const after = expectAccepted(submitBaseMove(moving(), [], LATER));

    expect(after.base?.id).toBe('distillery');
    expect(after.log.at(-1)).toStrictEqual({
      turn: 4,
      phase: 'advancement',
      at: LATER,
      event: { kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] },
    });
  });

  it('names every Hero set aside as the roster had them, in roster order', () => {
    const after = expectAccepted(
      submitBaseMove(
        moving({ survivors: [earl, hera, ivan, june], log: [...won('summer-camp')] }),
        ['june', 'hera'],
        LATER,
      ),
    );

    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'base-moved',
      from: 'hobby-farm',
      to: 'summer-camp',
      setAside: [
        { survivor: 'hera', name: 'Hera Okafor' },
        { survivor: 'june', name: 'June Park' },
      ],
    });
  });

  it('refuses with the engine’s own reason', () => {
    expect(expectRefused(submitBaseMove(moving({ log: [] }), [], LATER))).toMatch(
      /Claim a New Base won this turn/,
    );
  });
});
