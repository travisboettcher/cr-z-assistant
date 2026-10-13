import { describe, expect, it } from 'vitest';
import { continued, overrun, wentOn } from '../test/overrun';
import { queued } from '../test/queued';
import { submitBaseMove } from './advancementForms';
import { createNewCampaign, type Campaign } from './campaign';
import type { LogEntry } from './log';
import { moveProblem, rebuildAfterMove, storesAfterMove, withBaseMoved } from './move';
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

/** The stores a move after an overrun keeps (pp. 54, 86; R29, R30; Z4-9). */
describe('storesAfterMove', () => {
  // Turn 4, standing at the last Advancement step after the overrun.
  const advanced = (after: readonly LogEntry[]) =>
    overrun(after, { step: 'add-facilities-and-upgrades' });

  it('is nothing for an ordinary move, whose stores come along as they are', () => {
    expect(storesAfterMove(moving())).toBeNull();
  });

  it('keeps half of every material, rounded down, for the same type on the same map (R29)', () => {
    const campaign = advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]);

    // From 7 Food, 3 Fuel, 5 Hardware and 1 Rare.
    expect(storesAfterMove(campaign)).toEqual({ food: 3, fuel: 1, hardware: 2, rare: 0 });
  });

  it('keeps nothing for the same type on another map, or another type (R29)', () => {
    const none = { food: 0, fuel: 0, hardware: 0, rare: 0 };

    expect(
      storesAfterMove(
        advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, false)]),
      ),
    ).toEqual(none);
    expect(
      storesAfterMove(advanced([...wentOn('claim', 'distillery'), continued('claim', true)])),
    ).toEqual(none);
  });

  it('stocks a community starting over to its new base’s caps, and loses the rest (R30)', () => {
    const campaign = advanced([
      ...wentOn('start-over', 'summer-camp'),
      continued('start-over', true),
    ]);

    // A Tier 1 base caps each stored material at 4 (pg. 54); Rare has no cap.
    expect(storesAfterMove(campaign)).toEqual({ food: 4, fuel: 4, hardware: 4, rare: 0 });
  });

  it('is nothing until a way on has won', () => {
    expect(storesAfterMove(advanced([...wentOn('claim', 'hobby-farm')]))).toBeNull();
    expect(
      storesAfterMove(advanced([...wentOn('claim', 'hobby-farm'), continued('claim', false)])),
    ).toBeNull();
  });

  it('is applied by the move, and recorded on its entry', () => {
    const after = expectAccepted(
      submitBaseMove(
        advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]),
        [],
        LATER,
      ),
    );

    expect(after.materials).toEqual({ food: 3, fuel: 1, hardware: 2, rare: 0 });
    expect(after.base).toEqual({ id: 'hobby-farm', slots: {} });
    expect(after.log.at(-1)?.event).toStrictEqual({
      kind: 'base-moved',
      from: 'hobby-farm',
      to: 'hobby-farm',
      setAside: [],
      stores: { food: 3, fuel: 1, hardware: 2, rare: 0 },
      // Nothing had been added to the overrun base, so nothing to rebuild.
      rebuild: [],
    });
  });
});

/** What a reclaim on the overrun base's own map may build again (pg. 86; R29; Z4-10). */
describe('rebuildAfterMove, and the slots the move leaves', () => {
  const built = {
    'front-yard': {
      built: { facility: 'watchtower' as const, builtOnTurn: 2 },
      upgrades: ['spotlight' as const],
    },
    kitchen: { upgrades: ['gas-range' as const] },
    'ruined-chicken-coop': { cleared: true as const },
    'back-yard': { built: { facility: 'garden' as const, builtOnTurn: 3 } },
  };
  const advanced = (after: readonly LogEntry[]) =>
    overrun(after, {
      step: 'add-facilities-and-upgrades',
      base: { id: 'hobby-farm', slots: built },
    });

  it('records every facility and upgrade the player added, in the base’s own order', () => {
    const campaign = advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]);

    // The built-in Kitchen is not destroyed, but its upgrade is (pg. 54).
    expect(rebuildAfterMove(campaign)).toStrictEqual([
      { slot: 'kitchen', upgrades: ['gas-range'] },
      { slot: 'front-yard', facility: 'watchtower', upgrades: ['spotlight'] },
      { slot: 'back-yard', facility: 'garden', upgrades: [] },
    ]);
  });

  it('keeps the rubble already cleared, and nothing else, in the same building (R29)', () => {
    const after = withBaseMoved(
      advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]),
      [],
    );

    expect(after.base).toEqual({
      id: 'hobby-farm',
      slots: { 'ruined-chicken-coop': { cleared: true } },
    });
  });

  it('records nothing, and keeps nothing, for any other move', () => {
    const elsewhere = advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, false)]);
    const starting = advanced([
      ...wentOn('start-over', 'hobby-farm'),
      continued('start-over', true),
    ]);

    expect(rebuildAfterMove(elsewhere)).toBeNull();
    expect(rebuildAfterMove(starting)).toBeNull();
    expect(rebuildAfterMove(moving())).toBeNull();
    expect(withBaseMoved(elsewhere, []).base?.slots).toEqual({});
    expect(withBaseMoved(starting, []).base?.slots).toEqual({});
  });

  it('has nothing to read without a base to read it from', () => {
    const homeless = overrun([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)], {
      step: 'add-facilities-and-upgrades',
      base: null,
    });

    expect(rebuildAfterMove(homeless)).toBeNull();
    expect(withBaseMoved(homeless, []).base).toEqual({ id: 'hobby-farm', slots: {} });
  });

  it('is written on the move’s entry', () => {
    const after = expectAccepted(
      submitBaseMove(
        advanced([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]),
        [],
        LATER,
      ),
    );

    expect(after.log.at(-1)?.event).toMatchObject({
      rebuild: [
        { slot: 'kitchen', upgrades: ['gas-range'] },
        { slot: 'front-yard', facility: 'watchtower', upgrades: ['spotlight'] },
        { slot: 'back-yard', facility: 'garden', upgrades: [] },
      ],
    });
  });
});
