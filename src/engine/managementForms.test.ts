import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { createSurvivor } from './survivor';
import {
  submitDeparture,
  submitFeeding,
  submitHordeCheck,
  submitRotCheck,
  submitStorageCheck,
  submitTeamReduction,
} from './managementForms';
import { expectAccepted, expectRefused } from '../test/forms';

/**
 * The Management Phase's forms on their own, without the store (#179).
 *
 * The reducer's suite still walks each of these through `campaignReducer`, and
 * is what says the move changed nothing. This one says what the engine answers
 * directly: a campaign with its entries when the form goes through, and a
 * reason when it does not.
 */

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-11T09:00:00.000Z';
const LATER = '2026-10-11T09:05:00.000Z';

function community(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'check-for-rot',
    ...overrides,
  };
}

function at(id: string, name: string, tier: 1 | 2 | 3 | 4, currentHp?: number): Survivor {
  const survivor = createSurvivor(name, tier, { id });

  return currentHp === undefined ? survivor : { ...survivor, currentHp };
}

const kinds = (campaign: Campaign) => campaign.log.map((entry) => entry.event.kind);

describe('submitRotCheck', () => {
  /** Marcus at 0 Health in the Clinic, with Ruby being healed beside him. */
  const dying = (rubyHp: number) =>
    community({
      survivors: [at('ruby', 'Ruby Vance', 4, rubyHp), at('marcus', 'Marcus Webb', 2, 0)],
      assignments: { ruby: { task: 'healing' }, marcus: { task: 'healing' } },
    });

  it('records a pass, stamped with the time it was given', () => {
    const after = expectAccepted(
      submitRotCheck(dying(4), { survivor: 'marcus', roll: 10, bitten: null }, AT),
    );

    expect(after.survivors).toHaveLength(2);
    expect(after.log).toEqual([
      {
        turn: 3,
        phase: 'management',
        at: AT,
        event: {
          kind: 'rot-checked',
          survivor: 'marcus',
          name: 'Marcus Webb',
          roll: 10,
          target: 12,
          passed: true,
        },
      },
    ]);
  });

  it('writes the turning and the bite, in that order', () => {
    const after = expectAccepted(
      submitRotCheck(dying(4), { survivor: 'marcus', roll: 1, bitten: 'ruby' }, AT),
    );

    expect(kinds(after)).toEqual(['rot-checked', 'survivor-left', 'survivor-bitten']);
    expect(after.survivors).toEqual([{ ...at('ruby', 'Ruby Vance', 4, 4), currentHp: 3 }]);
  });

  it('writes the bitten survivor leaving when the bite finishes them', () => {
    const after = expectAccepted(
      submitRotCheck(dying(1), { survivor: 'marcus', roll: 1, bitten: 'ruby' }, AT),
    );

    expect(kinds(after)).toEqual([
      'rot-checked',
      'survivor-left',
      'survivor-bitten',
      'survivor-left',
    ]);
    expect(after.survivors).toEqual([]);
  });

  it('writes the hold instead of the bite where the Clinic has Restraints', () => {
    const after = expectAccepted(
      submitRotCheck(
        {
          ...dying(4),
          base: {
            id: 'small-town-home',
            slots: {
              garage: {
                built: { facility: 'medical-clinic', builtOnTurn: 1 },
                upgrades: ['restraints'],
              },
            },
          },
        },
        { survivor: 'marcus', roll: 1, bitten: 'ruby' },
        AT,
      ),
    );

    expect(kinds(after)).toEqual(['rot-checked', 'survivor-left', 'bite-restrained']);
  });

  it('refuses a second check for the same survivor in one turn', () => {
    const once = expectAccepted(
      submitRotCheck(dying(4), { survivor: 'marcus', roll: 10, bitten: null }, AT),
    );

    expect(
      expectRefused(submitRotCheck(once, { survivor: 'marcus', roll: 1, bitten: null }, LATER)),
    ).toMatch(/already/);
  });

  it('refuses somebody who is not in the community', () => {
    expect(
      expectRefused(submitRotCheck(dying(4), { survivor: 'nobody', roll: 1, bitten: null }, AT)),
    ).toMatch(/community/);
  });
});

describe('submitFeeding', () => {
  const hungry = () =>
    community({
      step: 'feed-your-survivors',
      survivors: [at('marcus', 'Marcus Webb', 4)],
      materials: { food: 9, fuel: 0, hardware: 0, rare: 0 },
    });

  it('eats, and records what was needed and what was short', () => {
    const after = expectAccepted(submitFeeding(hungry(), AT));

    // A Hero eats two.
    expect(after.materials.food).toBe(7);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivors-fed', required: 2, hunger: 0, population: 1 },
    ]);
  });

  it('refuses a second helping in the same turn', () => {
    const once = expectAccepted(submitFeeding(hungry(), AT));

    expect(expectRefused(submitFeeding(once, LATER))).toMatch(/already eaten/);
  });
});

describe('submitTeamReduction', () => {
  /** Six survivors and no base, so Exhaustion is six against a team of two. */
  const tired = (people = 6) =>
    community({
      step: 'assign-beds',
      survivors: Array.from({ length: people }, (_, index) =>
        at(`survivor-${String(index)}`, `Survivor ${String(index)}`, 1),
      ),
      assignments: {
        'survivor-0': { task: 'mission', team: 1 },
        'survivor-1': { task: 'mission', team: 1 },
      },
    });

  it('takes one survivor off the mission team and says who', () => {
    const after = expectAccepted(submitTeamReduction(tired(), 'survivor-0', AT));

    expect(after.assignments).toEqual({ 'survivor-1': { task: 'mission', team: 1 } });
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'mission-team-reduced', survivor: 'survivor-0', name: 'Survivor 0' },
    ]);
  });

  it('refuses a second removal in the same turn', () => {
    const once = expectAccepted(submitTeamReduction(tired(), 'survivor-0', AT));

    expect(expectRefused(submitTeamReduction(once, 'survivor-1', LATER))).toMatch(/already/);
  });

  it('refuses when Exhaustion is not above the team’s size', () => {
    expect(expectRefused(submitTeamReduction(tired(2), 'survivor-0', AT))).toMatch(/not above/);
  });

  it('refuses somebody who is not on the mission team', () => {
    expect(expectRefused(submitTeamReduction(tired(), 'survivor-5', AT))).toMatch(/mission team/);
  });
});

describe('submitStorageCheck', () => {
  const overflowing = () =>
    community({
      step: 'check-storage',
      materials: { food: 9, fuel: 0, hardware: 0, rare: 0 },
      base: { id: 'greasy-spoon', slots: {} },
    });

  it('brings the stores down to the caps and records what was lost', () => {
    const after = expectAccepted(submitStorageCheck(overflowing(), AT));

    expect(after.materials.food).toBe(6);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'storage-checked', food: 3, fuel: 0, hardware: 0 },
    ]);
  });

  it('refuses to spill the same stores twice in one turn', () => {
    const once = expectAccepted(submitStorageCheck(overflowing(), AT));

    expect(expectRefused(submitStorageCheck(once, LATER))).toMatch(/already/);
  });
});

describe('submitHordeCheck', () => {
  const quiet = () => community({ step: 'check-the-horde' });

  it('records the roll against the threat, and changes nothing else', () => {
    const before = quiet();
    const after = expectAccepted(submitHordeCheck(before, 10, AT));

    expect({ ...after, log: [] }).toEqual(before);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'horde-checked', roll: 10, threat: 2, siege: false },
    ]);
  });

  /** `hordeForced` (pg. 81): the roll is still the table's, and still written. */
  it('calls the siege whatever the roll after a Thin the Herd nobody walked out of', () => {
    const after = expectAccepted(
      submitHordeCheck(
        community({
          step: 'check-the-horde',
          log: [
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
        }),
        1,
        LATER,
      ),
    );

    expect(after.log.at(-1)?.event).toEqual({
      kind: 'horde-checked',
      roll: 1,
      threat: 2,
      siege: true,
    });
  });

  it('refuses a second roll in one turn', () => {
    const once = expectAccepted(submitHordeCheck(quiet(), 10, AT));

    expect(expectRefused(submitHordeCheck(once, 10, LATER))).toMatch(/already/);
  });
});

describe('submitDeparture', () => {
  /** Nine Tier 1 survivors and no base: nine Unrest, two turns of quiet. */
  const crowd = () =>
    community({
      step: 'departures',
      survivors: Array.from({ length: 9 }, (_, index) =>
        at(`survivor-${String(index)}`, `Survivor ${String(index)}`, 1),
      ),
    });

  it('sends one survivor away and records who', () => {
    const after = expectAccepted(submitDeparture(crowd(), 'survivor-0', AT));

    expect(after.survivors).toHaveLength(8);
    expect(after.log.map((entry) => entry.event)).toEqual([
      { kind: 'survivor-departed', survivor: 'survivor-0', name: 'Survivor 0', tier: 1 },
    ]);
  });

  it('refuses a second departure in the same turn, however high the pressure', () => {
    const once = expectAccepted(submitDeparture(crowd(), 'survivor-0', AT));

    expect(expectRefused(submitDeparture(once, 'survivor-1', LATER))).toMatch(/already left/);
  });

  it('refuses somebody the rule does not send away', () => {
    const crowded = crowd();
    const hero = at('hero', 'Ruby Vance', 4);

    expect(
      expectRefused(
        submitDeparture({ ...crowded, survivors: [...crowded.survivors, hero] }, 'hero', AT),
      ),
    ).toMatch(/rule sends away/);
  });
});
