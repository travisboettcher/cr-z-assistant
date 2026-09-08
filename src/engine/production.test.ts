import { describe, expect, it } from 'vitest';
import { occupants, type Occupant } from './base';
import { createNewCampaign, type Base, type Survivor } from './campaign';
import { facilityProduction, wantsStaff } from './production';
import { createSurvivor } from './survivor';

const home = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

const at = (base: Base, slot: string): Occupant =>
  occupants(base).find((occupant) => occupant.slotId === slot) as Occupant;

/** A survivor with one skill at a known level, so the Score is arithmetic. */
function cook(name: string, rationing: number, cooperation: number): Survivor {
  const survivor = createSurvivor(name, 4, { id: `${name}-id` });

  return {
    ...survivor,
    stats: { ...survivor.stats, cooperation },
    skills: { rationing },
  };
}

/** Nobody has any skill at all — the "wrong person assigned" case. */
function labourer(name: string): Survivor {
  return { ...createSurvivor(name, 4, { id: `${name}-id` }), skills: {} };
}

describe('facilityProduction, unstaffed', () => {
  it('gives a passive facility its number', () => {
    // A Garden makes 1 Food, and 3 with Water.
    const dry = at(
      home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 } } }),
      'front-yard',
    );
    const wet = at(
      home({ 'front-yard': { built: { facility: 'garden', builtOnTurn: 1 }, water: true } }),
      'front-yard',
    );

    expect(facilityProduction(dry)).toEqual([
      {
        outputs: ['food'],
        amount: 1,
        halved: false,
        staffed: false,
        restrictedToStat: undefined,
        missingSkill: false,
      },
    ]);
    expect(facilityProduction(wet)[0]?.amount).toBe(3);
  });

  it('produces an upgrade’s number with nobody in the facility', () => {
    // Upgrades that produce do so whether or not the facility is worked
    // (pg. 54), so the Auto Shop's Fuel arrives regardless.
    const workshop = at(
      home({
        garage: { built: { facility: 'workshop', builtOnTurn: 1 }, upgrades: ['auto-shop'] },
      }),
      'garage',
    );

    const fuel = facilityProduction(workshop).filter((line) => line.outputs[0] === 'fuel');

    expect(fuel).toEqual([
      {
        outputs: ['fuel'],
        amount: 1,
        halved: false,
        staffed: false,
        restrictedToStat: undefined,
        missingSkill: false,
      },
    ]);
  });

  it('reports a staffed line as zero and needing someone', () => {
    const kitchen = at(home(), 'kitchen');
    const [line] = facilityProduction(kitchen);

    expect(line).toMatchObject({
      outputs: ['food'],
      amount: 0,
      staffed: true,
      missingSkill: false,
    });
  });

  it('produces nothing at all from an entry whose utility is missing', () => {
    // A Biofuel Lab needs Power and Water. Without them it is not halved, it is
    // off — the distinction `working` exists to make.
    const kitchen = at(home({ kitchen: { upgrades: ['biofuel-lab'] } }), 'kitchen');

    expect(facilityProduction(kitchen).some((line) => line.outputs[0] === 'fuel')).toBe(false);
  });
});

describe('facilityProduction, staffed', () => {
  it('produces the staff’s Skill Score', () => {
    // Cooperation 3 and Rationing 2 is a Rationing Score of 5.
    const kitchen = at(home({ kitchen: { water: true } }), 'kitchen');

    // The whole line, not two of its fields: `missingSkill` on a cook who can
    // cook is the one that would go unnoticed, and it is the difference between
    // "makes five Food" and "makes five Food, but they cannot cook".
    expect(facilityProduction(kitchen, [cook('Carla', 2, 3)])[0]).toEqual({
      outputs: ['food'],
      amount: 5,
      halved: false,
      staffed: true,
      restrictedToStat: undefined,
      missingSkill: false,
    });
  });

  it('halves for a missing utility, rounding up, rather than switching off', () => {
    // A Kitchen halves without Water. Five halves to three, not two, and never
    // to zero — the difference between "halved" and "unmet" (pg. 72).
    const dry = at(home(), 'kitchen');

    expect(facilityProduction(dry, [cook('Carla', 2, 3)])[0]).toMatchObject({
      amount: 3,
      halved: true,
    });
  });

  it('changes with the person previewed', () => {
    const kitchen = at(home({ kitchen: { water: true } }), 'kitchen');

    expect(facilityProduction(kitchen, [cook('Carla', 2, 3)])[0]?.amount).toBe(5);
    expect(facilityProduction(kitchen, [cook('Earl', 1, 1)])[0]?.amount).toBe(2);
  });

  it('tells nobody assigned apart from the wrong person assigned', () => {
    const kitchen = at(home({ kitchen: { water: true } }), 'kitchen');

    const nobody = facilityProduction(kitchen, [])[0];
    const wrong = facilityProduction(kitchen, [labourer('Ruby')])[0];

    // Both make nothing, and a player can only fix the one they can see.
    expect(nobody).toMatchObject({ amount: 0, missingSkill: false });
    expect(wrong).toMatchObject({ amount: 0, missingSkill: true });
  });

  it('sums the staff on a facility that takes more than one', () => {
    // A Med Lab adds a second Clinic staff whose Medicine scores sum (pg. 72).
    const clinic = at(
      home({
        garage: {
          built: { facility: 'medical-clinic', builtOnTurn: 1 },
          upgrades: ['med-lab'],
          power: true,
          water: true,
        },
      }),
      'garage',
    );

    const medic = (name: string, medicine: number): Survivor => {
      const survivor = createSurvivor(name, 4, { id: `${name}-id` });
      return { ...survivor, stats: { ...survivor.stats, cooperation: 1 }, skills: { medicine } };
    };

    const health = facilityProduction(clinic, [medic('A', 2), medic('B', 1)]).find(
      (line) => line.outputs[0] === 'health',
    );

    // Scores of 3 and 2, summed.
    expect(health?.amount).toBe(5);
  });

  it('splits a Utility Station’s Score across both utilities as one line', () => {
    const station = at(
      home({ 'front-yard': { built: { facility: 'utility-station', builtOnTurn: 1 } } }),
      'front-yard',
    );

    const engineer = createSurvivor('Vee', 4, { id: 'vee' });
    const line = facilityProduction(station, [
      { ...engineer, stats: { ...engineer.stats, cooperation: 2 }, skills: { utilities: 1 } },
    ])[0];

    // One amount over two outputs, not a row each — the book's "in any mix".
    // The whole line, because a Utility Station is the one staffed facility
    // that is never halved: its Score *is* the split.
    expect(line).toEqual({
      outputs: ['power', 'water'],
      amount: 3,
      halved: false,
      staffed: true,
      restrictedToStat: undefined,
      missingSkill: false,
    });
  });
});

describe('Siege Threat as production', () => {
  it('counts a Spotlight’s flat reduction only while it has Power', () => {
    const dark = at(
      home({
        'front-yard': {
          built: { facility: 'watchtower', builtOnTurn: 1 },
          upgrades: ['spotlight'],
        },
      }),
      'front-yard',
    );
    const lit = at(
      home({
        'front-yard': {
          built: { facility: 'watchtower', builtOnTurn: 1 },
          upgrades: ['spotlight'],
          power: true,
        },
      }),
      'front-yard',
    );

    const flat = (occupant: Occupant) =>
      facilityProduction(occupant).filter(
        (line) => line.outputs[0] === 'siege-threat' && !line.staffed,
      );

    expect(flat(dark)).toEqual([]);
    // The whole line: a Spotlight is flat, needs nobody, and is not halved.
    expect(flat(lit)).toEqual([
      {
        outputs: ['siege-threat'],
        amount: -1,
        halved: false,
        staffed: false,
        restrictedToStat: undefined,
        missingSkill: false,
      },
    ]);
  });

  it('reduces by the watch’s best skill, not their total', () => {
    const tower = at(
      home({ 'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } } }),
      'front-yard',
    );

    const lookout = createSurvivor('Sam', 4, { id: 'sam' });
    const staffed = facilityProduction(tower, [
      {
        ...lookout,
        stats: { ...lookout.stats, dexterity: 2, intelligence: 1 },
        skills: { 'long-guns': 1, traps: 2 },
      },
    ]).find((line) => line.staffed);

    // Long Guns is 3 and Traps is 3; the best is 3, and summing would say 6.
    expect(staffed).toEqual({
      outputs: ['siege-threat'],
      amount: -3,
      halved: false,
      staffed: true,
      restrictedToStat: undefined,
      missingSkill: false,
    });
  });

  it('reduces by nothing, and says why, when the watch cannot shoot', () => {
    const tower = at(
      home({ 'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } } }),
      'front-yard',
    );

    const nobody = facilityProduction(tower).find((line) => line.staffed);
    const unskilled = facilityProduction(tower, [labourer('Ruby')]).find((line) => line.staffed);

    // Both reduce nothing, and only one of them is a mistake the player made.
    expect(nobody).toMatchObject({ amount: -0, missingSkill: false });
    expect(unskilled).toMatchObject({ amount: -0, missingSkill: true });
  });

  it('counts a watch who has one of the four but not the others', () => {
    // Archery only: the check asks whether *any* of the four is known, and one
    // that asked whether all of them were would call this a mistake.
    const tower = at(
      home({ 'front-yard': { built: { facility: 'watchtower', builtOnTurn: 1 } } }),
      'front-yard',
    );

    const archer = createSurvivor('Ann', 4, { id: 'ann' });
    const line = facilityProduction(tower, [
      { ...archer, stats: { ...archer.stats, dexterity: 3 }, skills: { archery: 1 } },
    ]).find((candidate) => candidate.staffed);

    expect(line).toMatchObject({ amount: -4, missingSkill: false });
  });
});

describe('wantsStaff', () => {
  it('is true for a facility with a staffed line and false otherwise', () => {
    expect(wantsStaff(at(home(), 'kitchen'))).toBe(true);
    expect(wantsStaff(at(home(), 'bunk-room-1'))).toBe(false);
  });
});

describe('nothing about a preview reaches the campaign', () => {
  it('leaves the base untouched however it is previewed', () => {
    // The guarantee the screen rests on: production is a question, not an
    // assignment, and Phase 3 owns assignments.
    const base = home({ kitchen: { water: true } });
    const before = structuredClone(base);
    const campaign = { ...createNewCampaign('Cedar Hollow'), base };

    facilityProduction(at(base, 'kitchen'), [cook('Carla', 2, 3)]);

    expect(campaign.base).toEqual(before);
  });
});
