import { describe, expect, it } from 'vitest';
import { withPlanningBegun } from '../test/campaigns';
import { createNewCampaign, type Campaign, type RareTrade, type Survivor } from './campaign';
import { submitRareTradeMade } from './campaignForms';
import type { FormResult } from './forms';
import { idTaken } from './equipment';
import { submitHordeCheck } from './managementForms';
import { submitMissionOutcome, submitMissionSelection, submitMissionSkip } from './missionForms';
import { outcomeOf, woundsAsTheyStand } from './missions';
import {
  rareTradeBinds,
  rareTradeCheck,
  rareTradeRolls,
  tradeItemFor,
  type RareTradePick,
} from './rareTrade';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-15T09:00:00.000Z';

/** A survivor with this Cooperation, and this Scout Score where they have the skill. */
function scout(id: string, cooperation: number, scoutScore?: number): Survivor {
  return {
    ...createSurvivor(id, 2, { id }),
    // Scout is governed by Intelligence (pg. 8): a level of 0 makes the Score the stat.
    stats: { strength: 0, dexterity: 0, intelligence: scoutScore ?? 0, cooperation },
    skills: scoutScore === undefined ? {} : { scout: 0 },
  };
}

/** Turn 3's Assign Mission Team: Ana on team 1, and three rolls on the trader's list. */
function planning(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'assign-mission-team',
    base: { id: 'hobby-farm', slots: {} },
    materials: { food: 6, fuel: 10, hardware: 0 },
    survivors: [scout('ana', 1, 1), scout('bo', 1)],
    assignments: { ana: { task: 'mission', team: 1 } },
    ...overrides,
  });
}

/** A riot shield (3 then 1, 10) and a sawed-off shotgun (6 then 3, 6). */
const shield: RareTradePick = { id: 'shield', subtable: 3, entry: 1, food: 4, fuel: 6 };
const shotgun: RareTradePick = { id: 'shotgun', subtable: 6, entry: 3, food: 2, fuel: 4 };

const messages = (campaign: Campaign, picks: readonly RareTradePick[]) =>
  rareTradeCheck(campaign, picks).blockers.map((one) => one.message);

function accepted(result: FormResult): Campaign {
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

/** The trade made on turn 3, and turn 4's Select Mission with Ana's team waiting. */
function nextMissionPhase(picks: readonly RareTradePick[] = [shield]): Campaign {
  const made = accepted(
    submitRareTradeMade(planning({ materials: { food: 6, fuel: 10, hardware: 0 } }), picks, AT),
  );

  return { ...made, turn: 4, step: 'select-mission' };
}

const kinds = (campaign: Campaign) => campaign.log.map((entry) => entry.event.kind);

describe('the trader’s list (pg. 21; R58)', () => {
  it('has a roll for every survivor’s Scout Score plus Cooperation', () => {
    // Ana: Scout 1 and Cooperation 1. Bo has no Scout, so Cooperation alone.
    expect(rareTradeRolls(planning())).toBe(3);
    expect(rareTradeRolls(planning({ survivors: [] }))).toBe(0);
  });

  it('names each pick by the Rare Item Table', () => {
    expect(tradeItemFor(shield)).toMatchObject({ item: 'riot-shield', grade: 'standard' });
    expect(tradeItemFor({ ...shotgun, subtable: 9, entry: 10 })).toMatchObject({
      item: 'tool-belt',
      grade: 'quality',
    });
  });
});

describe('making a Rare Items trade (pg. 21; R57, R59)', () => {
  it('is refused outside Planning, twice, or with no team to go', () => {
    expect(messages(planning({ step: 'heal-wounds' }), [shield])).toEqual([
      'Make Rare Items trades in the Planning Phase.',
    ]);
    expect(messages(planning({ assignments: {} }), [shield])).toEqual([
      'A mission team goes to trade. Assign one first.',
    ]);
    const made = accepted(submitRareTradeMade(planning(), [shield], AT));
    expect(messages(made, [shotgun])).toEqual(['A Rare Items trade is already under way.']);
  });

  it('takes no more than the list holds, and at least one', () => {
    expect(messages(planning(), [])).toEqual(['Choose an item from the trader’s list.']);
    expect(
      messages(planning({ survivors: [scout('ana', 1)] }), [shield, { ...shotgun, id: 'b' }]),
    ).toEqual(['The trader’s list has 1 rolls, and 2 are chosen (R58).']);
  });

  it('sets aside each item’s whole price, in whole Food and Fuel', () => {
    for (const wrong of [
      { food: 4, fuel: 5 },
      { food: -1, fuel: 11 },
      { food: 11, fuel: -1 },
      { food: 4.5, fuel: 5.5 },
    ]) {
      expect(messages(planning(), [shotgun, { ...shield, ...wrong }])).toEqual([
        'Set aside 10 in Food and Fuel for item 2.',
      ]);
    }
    // All of it in one, either one.
    expect(messages(planning(), [{ ...shotgun, food: 6, fuel: 0 }])).toEqual([]);
    expect(messages(planning(), [{ ...shotgun, food: 0, fuel: 6 }])).toEqual([]);
    expect(messages(planning({ materials: { food: 1, fuel: 1, hardware: 0 } }), [shield])).toEqual([
      'It sets aside 4 Food, but the base has 1.',
      'It sets aside 6 Fuel, but the base has 1.',
    ]);
  });

  it('takes ids nothing else has', () => {
    const held = planning({ inventory: [{ id: 'shield', item: 'bow', grade: 'standard' }] });

    expect(messages(held, [shield])).toEqual(['An item already has that id.']);
    expect(messages(planning(), [shield, { ...shotgun, id: 'shield' }])).toEqual([
      'An item already has that id.',
    ]);
    expect(messages(planning(), [shield, shotgun])).toEqual([]);
    expect(rareTradeCheck(planning(), [shield]).warnings).toEqual([]);
    expect(rareTradeCheck(planning({ assignments: {} }), [shield]).warnings).toEqual([]);
  });

  it('sets the materials aside, outside storage, and writes the items down', () => {
    const made = accepted(submitRareTradeMade(planning(), [shield], AT));

    expect(made.materials).toEqual({ food: 2, fuel: 4, hardware: 0 });
    expect(made.rareTrade).toEqual({ madeOnTurn: 3, items: [tradeItemFor(shield)] });
    expect(made.log.at(-1)?.event).toEqual({
      kind: 'rare-trade-made',
      items: [tradeItemFor(shield)],
    });
    // An item a trade is for has its id already.
    expect(idTaken(made, 'shield')).toBe(true);
    expect(idTaken({ ...made, rareTrade: null }, 'shield')).toBe(false);
    expect(submitRareTradeMade(planning({ step: 'heal-wounds' }), [shield], AT).ok).toBe(false);
  });
});

describe('the mission it forces (pp. 21, 23; R59, R60)', () => {
  const choose = (campaign: Campaign, mission: 'rare-goods-trader' | 'thin-the-herd') =>
    accepted(submitMissionSelection(campaign, { team: 1, mission }, AT));

  it('binds the next Mission Phase’s first choice, not this turn’s', () => {
    const made = accepted(submitRareTradeMade(planning(), [shield], AT));

    expect(rareTradeBinds({ ...made, step: 'select-mission' })).toBe(false);
    expect(rareTradeBinds(nextMissionPhase())).toBe(true);
    expect(rareTradeBinds({ ...nextMissionPhase(), step: 'character-advancement' })).toBe(false);
    expect(rareTradeBinds(choose(nextMissionPhase(), 'rare-goods-trader'))).toBe(false);
  });

  it('keeps the trade when the Rare Goods Trader is chosen', () => {
    const chosen = choose(nextMissionPhase(), 'rare-goods-trader');

    expect(chosen.rareTrade).not.toBeNull();
    expect(kinds(chosen).at(-1)).toBe('mission-selected');
  });

  it('loses it, materials and all, when another mission is chosen first', () => {
    const before = nextMissionPhase();
    const chosen = choose(before, 'thin-the-herd');

    expect(chosen.rareTrade).toBeNull();
    expect(chosen.materials).toEqual(before.materials);
    expect(chosen.log.at(-1)?.event).toEqual({
      kind: 'rare-trade-lost',
      reason: 'other-mission',
      items: [{ id: 'shield', item: 'riot-shield', grade: 'standard' }],
      food: 4,
      fuel: 6,
    });
  });

  it('loses it when the community sits the mission out', () => {
    const skipped = accepted(submitMissionSkip(nextMissionPhase(), AT));

    expect(skipped.rareTrade).toBeNull();
    expect(skipped.log.at(-1)?.event).toMatchObject({
      kind: 'rare-trade-lost',
      reason: 'no-mission',
    });
    expect(
      kinds(accepted(submitMissionSkip({ ...nextMissionPhase(), rareTrade: null }, AT))),
    ).not.toContain('rare-trade-lost');
  });

  it('loses it when this turn’s Check the Horde calls a siege', () => {
    const made = accepted(submitRareTradeMade(planning(), [shield], AT));
    const checking = { ...made, step: 'check-the-horde' as const };
    // A Thin the Herd nobody walked out of calls the siege whatever the roll (pg. 81).
    const forced: Campaign = {
      ...checking,
      log: [
        ...checking.log,
        {
          turn: 3,
          phase: 'mission',
          at: AT,
          event: {
            kind: 'thin-the-herd-resolved',
            startingZombies: 8,
            zombiesLeft: 6,
            survivorsExited: 0,
            allIncapacitated: true,
          },
        },
      ],
    };
    const called = accepted(submitHordeCheck(forced, 1, AT));
    const quiet = accepted(submitHordeCheck(checking, 10, AT));

    expect(called.log.at(-2)?.event).toMatchObject({ kind: 'horde-checked', siege: true });
    expect(called.log.at(-1)?.event).toMatchObject({ kind: 'rare-trade-lost', reason: 'siege' });
    expect(called.rareTrade).toBeNull();
    expect(quiet.rareTrade).not.toBeNull();
  });
});

describe('the Rare Goods Trader’s outcome (pg. 84; R22, R61)', () => {
  /** Turn 4, the trader chosen for a trade of a shield then a shotgun, in that order. */
  const atTheTrader = () =>
    accepted(
      submitMissionSelection(
        { ...nextMissionPhase([shield, shotgun]), step: 'tactical-mission' },
        { team: 1, mission: 'rare-goods-trader' },
        AT,
      ),
    );

  function resolved(campaign: Campaign, survivorsExited: number, itemsTraded?: number) {
    return submitMissionOutcome(
      campaign,
      outcomeOf(
        { team: 1, mission: 'rare-goods-trader' },
        {
          endCondition: null,
          strangers: [],
          vehiclesOnArea: 0,
          materialsCarriedOut: 0,
          startingZombies: 0,
          zombiesLeft: 0,
          survivorsExited,
          allIncapacitated: false,
          vehiclesDrivenOff: 0,
          ...(itemsTraded === undefined ? {} : { itemsTraded }),
          wounds: woundsAsTheyStand(campaign, 1),
        },
      ),
      AT,
    );
  }

  it('hands over what was traded when anybody got out, and returns the rest’s materials', () => {
    const before = atTheTrader();
    const after = accepted(resolved(before, 1, 1));

    expect(after.rareTrade).toBeNull();
    expect(after.inventory).toEqual([{ id: 'shield', item: 'riot-shield', grade: 'standard' }]);
    expect(after.materials).toEqual({
      ...before.materials,
      food: before.materials.food + 2,
      fuel: before.materials.fuel + 4,
    });
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'rare-trade-closed',
      arrived: [{ id: 'shield', item: 'riot-shield', grade: 'standard' }],
      lost: [],
      food: 2,
      fuel: 4,
    });
  });

  /** The acceptance: one traded before nobody got out loses it and its materials, and returns the other's. */
  it('loses what was traded when nobody got out, and still returns the rest’s materials', () => {
    const before = atTheTrader();
    const after = accepted(resolved(before, 0, 1));

    expect(after.inventory).toEqual([]);
    expect(after.materials.fuel).toBe(before.materials.fuel + 4);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'rare-trade-closed',
      arrived: [],
      lost: [{ id: 'shield', item: 'riot-shield', grade: 'standard' }],
      food: 2,
      fuel: 4,
    });
  });

  it('asks how many items were traded, and no more than the trade held', () => {
    const problem = (result: FormResult) => (result.ok ? null : result.problem);

    expect(problem(resolved(atTheTrader(), 1))).toBe(
      'Enter how many of the trade’s items the trader handed over.',
    );
    expect(problem(resolved(atTheTrader(), 1, 3))).toBe('The trade was for 2 items.');
    expect(problem(resolved(atTheTrader(), 1, 2))).toBeNull();

    const tradeless = { ...atTheTrader(), rareTrade: null };
    expect(problem(resolved(tradeless, 1, 0))).toBe(
      'No Rare Items trade is under way, so no items were traded.',
    );
    expect(kinds(accepted(resolved(tradeless, 1)))).not.toContain('rare-trade-closed');
  });

  /** Team 1 goes to the trader; team 2 to Thin the Herd, whose outcome leaves the trade alone. */
  it('leaves the trade to the Rare Goods Trader’s own outcome', () => {
    const two: Campaign = {
      ...atTheTrader(),
      survivors: [...atTheTrader().survivors, scout('cy', 1)],
      assignments: { ...atTheTrader().assignments, cy: { task: 'mission', team: 2 } },
    };
    const both = accepted(submitMissionSelection(two, { team: 2, mission: 'thin-the-herd' }, AT));
    const herd = accepted(
      submitMissionOutcome(
        both,
        outcomeOf(
          { team: 2, mission: 'thin-the-herd' },
          {
            endCondition: null,
            strangers: [],
            vehiclesOnArea: 0,
            materialsCarriedOut: 0,
            startingZombies: 4,
            zombiesLeft: 0,
            survivorsExited: 1,
            allIncapacitated: false,
            vehiclesDrivenOff: 0,
            wounds: woundsAsTheyStand(both, 2),
          },
        ),
        AT,
      ),
    );

    expect(herd.rareTrade).toEqual(two.rareTrade);
  });

  it('leaves a trade made this turn for next turn’s trader', () => {
    const early = {
      ...atTheTrader(),
      rareTrade: { ...(atTheTrader().rareTrade as RareTrade), madeOnTurn: 4 },
    };
    const after = accepted(resolved(early, 1));

    expect(after.rareTrade).toEqual(early.rareTrade);
    expect(resolved(early, 1, 1).ok).toBe(false);
  });
});
