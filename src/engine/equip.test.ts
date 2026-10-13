import { describe, expect, it } from 'vitest';
import type { Grade, ItemId } from '../data/equipment';
import { createNewCampaign, type Assignment, type Campaign, type Item } from './campaign';
import { equipCheck, equippable, holderOf, shoddyOffers, type EquipMove } from './equip';
import type { LogEntry } from './log';
import { submitEquipMove } from './missionForms';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';

const item = (id: string, kind: ItemId, grade: Grade = 'standard'): Item => ({
  id,
  item: kind,
  grade,
});

// Tier 2, so two Inventory Slots each without Carry (pg. 14).
const earl = { ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }), skills: { handguns: 0 } };
const carla = { ...createSurvivor('Carla Proust', 2, { id: 'carla' }), skills: { traps: 0 } };
const ruby = {
  ...createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
  skills: { 'blade-weapon': 0, scout: 0 },
};
const nell = { ...createSurvivor('Nell Haig', 1, { id: 'nell' }), skills: { handguns: 0 } };

const onTeam = (team: number): Assignment => ({ task: 'mission', team });

/** Turn 4 at Equip Mission Team: Earl and Carla on team 1, Ruby on team 2, Nell at home. */
function equipping(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'equip-mission-team',
    survivors: [earl, carla, ruby, nell],
    assignments: { earl: onTeam(1), carla: onTeam(1), ruby: onTeam(2) },
    inventory: [item('rifle-1', 'rifle'), item('pistol-1', 'pistol', 'quality')],
    ...overrides,
  };
}

/** A move to the base, or to the survivor with this id. */
const move = (id: string, target: string): EquipMove => ({
  kind: 'move',
  id,
  to: target === 'base' ? 'base' : { survivor: target },
});
const take = (id: string, kind: ItemId, survivor: string): EquipMove => ({
  kind: 'take-shoddy',
  id,
  item: kind,
  survivor,
});

const codes = (campaign: Campaign, one: EquipMove) => ({
  blockers: equipCheck(campaign, one).blockers.map((violation) => violation.code),
  warnings: equipCheck(campaign, one).warnings.map((violation) => violation.code),
});

/** The campaign after a move the test expects to go through. */
function after(campaign: Campaign, one: EquipMove): Campaign {
  const result = submitEquipMove(campaign, one, AT);
  if (!result.ok) throw new Error(result.problem);

  return result.campaign;
}

const carried = (campaign: Campaign, id: string) =>
  campaign.survivors.find((survivor) => survivor.id === id)?.items.map((held) => held.id);

describe('who is equipped (R38)', () => {
  it('is everybody going out, and nobody at home', () => {
    expect(equippable(equipping()).map((survivor) => survivor.id)).toEqual([
      'earl',
      'carla',
      'ruby',
    ]);
  });

  it('is nobody when the community opted out (pg. 17)', () => {
    const skipped: LogEntry = {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-skipped' },
    };

    expect(equippable(equipping({ log: [skipped] }))).toEqual([]);
    expect(codes(equipping({ log: [skipped] }), move('rifle-1', 'earl')).blockers).toEqual([
      'not-going',
    ]);
  });

  it('refuses somebody staying home, whether taking or giving', () => {
    const holding = equipping({
      survivors: [earl, carla, ruby, { ...nell, items: [item('bow-1', 'bow')] }],
    });

    expect(codes(holding, move('pistol-1', 'nell')).blockers).toEqual(['not-going']);
    expect(codes(holding, move('bow-1', 'earl')).blockers).toEqual(['not-going']);
    expect(codes(holding, take('new', 'pistol', 'nell')).blockers).toEqual(['not-going']);
  });

  it('is refused outside the Mission Phase', () => {
    expect(codes(equipping({ step: 'heal-wounds' }), move('rifle-1', 'earl'))).toEqual({
      blockers: ['phase'],
      warnings: [],
    });
  });

  it('refuses an item held by somebody set aside (R31)', () => {
    const away = equipping({ setAside: [{ ...nell, items: [item('bow-1', 'bow')] }] });

    expect(equipCheck(away, move('bow-1', 'earl')).blockers).toEqual([
      {
        code: 'not-going',
        message: 'Whoever holds that item is not on the roster to give it.',
        pages: 18,
      },
    ]);
  });
});

describe('moving an item at Equip Mission Team (pg. 18; R38)', () => {
  it('takes an item out of the base’s Inventory and puts it back', () => {
    const out = after(equipping(), move('pistol-1', 'earl'));

    expect(carried(out, 'earl')).toEqual(['pistol-1']);
    expect(out.inventory.map((held) => held.id)).toEqual(['rifle-1']);
    expect(holderOf(out, 'pistol-1')).toMatchObject({ id: 'earl' });
    expect(out.log.at(-1)?.event).toEqual({
      kind: 'item-moved',
      id: 'pistol-1',
      item: 'pistol',
      grade: 'quality',
      from: 'base',
      to: { survivor: 'earl', name: 'Earl Rhodes' },
    });

    expect(codes(out, move('pistol-1', 'base'))).toEqual({ blockers: [], warnings: [] });
    const back = after(out, move('pistol-1', 'base'));

    expect(carried(back, 'earl')).toEqual([]);
    expect(back.inventory.map((held) => held.id)).toEqual(['rifle-1', 'pistol-1']);
    expect(holderOf(back, 'pistol-1')).toBe('base');
    expect(back.log.at(-1)?.event).toMatchObject({
      from: { survivor: 'earl', name: 'Earl Rhodes' },
      to: 'base',
    });
  });

  it('hands an item between two survivors going out, across teams too', () => {
    const handed = after(after(equipping(), move('pistol-1', 'earl')), move('pistol-1', 'ruby'));

    expect(carried(handed, 'earl')).toEqual([]);
    expect(carried(handed, 'ruby')).toEqual(['pistol-1']);
    expect(handed.inventory.map((held) => held.id)).toEqual(['rifle-1']);
    expect(handed.log.at(-1)?.event).toMatchObject({
      from: { survivor: 'earl', name: 'Earl Rhodes' },
      to: { survivor: 'ruby', name: 'Ruby Vance' },
    });
  });

  it('knows who holds what', () => {
    const held = equipping({
      survivors: [
        { ...earl, items: [item('a', 'pistol')] },
        { ...carla, items: [item('b', 'trap')] },
        ruby,
      ],
    });

    expect(holderOf(held, 'rifle-1')).toBe('base');
    expect(holderOf(held, 'b')).toMatchObject({ id: 'carla' });
    expect(holderOf(held, 'nothing')).toBeUndefined();
  });

  it('refuses an item that does not exist, or a move to where it already is', () => {
    const holding = after(equipping(), move('pistol-1', 'earl'));

    expect(codes(holding, move('nothing', 'earl')).blockers).toEqual(['no-such-item']);
    const message = (one: EquipMove) => equipCheck(holding, one).blockers[0]?.message;
    expect(codes(holding, move('rifle-1', 'base')).blockers).toEqual(['already-there']);
    expect(message(move('rifle-1', 'base'))).toBe('That item is in the base’s Inventory already.');
    expect(codes(holding, move('pistol-1', 'earl')).blockers).toEqual(['already-there']);
    expect(message(move('pistol-1', 'earl'))).toBe('Earl Rhodes has it already.');
    expect(codes(holding, move('rifle-1', 'nobody')).blockers).toEqual(['not-going']);
  });

  it('leaves the campaign alone when refused', () => {
    expect(submitEquipMove(equipping(), move('rifle-1', 'nell'), AT)).toEqual({
      ok: false,
      problem: 'Only somebody going out this turn is equipped.',
    });
  });
});

describe('what a survivor can take (pp. 14, 38, 44; R40)', () => {
  it('refuses an item past their Inventory Slots, but not one that takes none', () => {
    const full = equipping({
      survivors: [{ ...earl, items: [item('a', 'pistol'), item('b', 'revolver')] }, carla, ruby],
    });

    expect(codes(full, move('rifle-1', 'earl')).blockers).toEqual(['no-slots']);
    expect(
      codes({ ...full, inventory: [item('belt', 'tool-belt')] }, move('belt', 'earl')).blockers,
    ).toEqual([]);
    // With both slots free, the same rifle goes; with one, it fills the last.
    expect(codes(equipping(), move('rifle-1', 'earl')).blockers).toEqual([]);
    const half = equipping({
      survivors: [{ ...earl, items: [item('a', 'pistol')] }, carla, ruby],
    });
    expect(codes(half, move('rifle-1', 'earl')).blockers).toEqual([]);
  });

  it('lets somebody already over their slots take what takes none', () => {
    // Three items in two slots: the hunger penalty can leave a survivor so.
    const over = equipping({
      survivors: [
        { ...earl, items: [item('a', 'pistol'), item('b', 'revolver'), item('c', 'bow')] },
        carla,
        ruby,
      ],
      inventory: [item('belt', 'tool-belt')],
    });

    expect(codes(over, move('belt', 'earl')).blockers).toEqual([]);
  });

  it('counts the slots an item brings with it', () => {
    // An ultralight backpack takes none and adds two (pg. 51).
    const packed = equipping({
      survivors: [
        {
          ...earl,
          items: [item('a', 'pistol'), item('b', 'revolver'), item('pack', 'ultralight-backpack')],
        },
        carla,
        ruby,
      ],
    });

    expect(codes(packed, move('rifle-1', 'earl')).blockers).toEqual([]);
  });

  it('refuses equipment whose skill the survivor lacks (pg. 44)', () => {
    const binoculars = equipping({ inventory: [item('bin', 'binoculars', 'quality')] });

    expect(codes(binoculars, move('bin', 'earl')).blockers).toEqual(['needs-skill']);
    expect(codes(binoculars, move('bin', 'ruby')).blockers).toEqual([]);
  });

  it('refuses a second of one piece of protective gear, but not a different one (R40)', () => {
    const worn = equipping({
      survivors: [{ ...earl, items: [item('coat', 'reinforced-clothing')] }, carla, ruby],
      inventory: [item('coat-2', 'reinforced-clothing', 'quality'), item('pads', 'knee-pads')],
    });

    expect(codes(worn, move('coat-2', 'earl')).blockers).toEqual(['worn-already']);
    // Whatever else is carried beside it.
    const armed = equipping({
      survivors: [
        { ...earl, items: [item('gun', 'pistol'), item('coat', 'reinforced-clothing')] },
        carla,
        ruby,
      ],
      inventory: [item('coat-2', 'reinforced-clothing')],
    });
    expect(codes(armed, move('coat-2', 'earl')).blockers).toEqual(['worn-already']);
    expect(codes(worn, move('pads', 'earl')).blockers).toEqual([]);
  });

  it('refuses an item nothing yet says where it goes', () => {
    const shells = equipping({ inventory: [item('shells', 'incendiary-shells')] });

    expect(codes(shells, move('shells', 'earl')).blockers).toEqual(['unsettled']);
  });

  it('only warns about a weapon its carrier cannot use, and the press carries it', () => {
    expect(codes(equipping(), move('rifle-1', 'earl'))).toEqual({
      blockers: [],
      warnings: ['cannot-use'],
    });
    expect(codes(equipping(), move('pistol-1', 'earl')).warnings).toEqual([]);
    // Any one of a weapon's skills will do: a Halligan tool is three (pg. 50).
    const halligan = equipping({ inventory: [item('hal', 'halligan-tool')] });
    expect(codes(halligan, move('hal', 'ruby'))).toEqual({ blockers: [], warnings: [] });
    expect(carried(after(equipping(), move('rifle-1', 'earl')), 'earl')).toEqual(['rifle-1']);
  });
});

describe('shoddy gear, free and never in the base (R35)', () => {
  it('is offered for each skill an item is used with or needs', () => {
    expect(shoddyOffers(earl)).toEqual(['pistol', 'revolver']);
    expect(shoddyOffers(carla)).toEqual(['trap']);
    expect(shoddyOffers(ruby)).toEqual(['bladed']);
    expect(shoddyOffers({ ...earl, skills: {} })).toEqual([]);
  });

  it('is taken up free, and set down to nowhere', () => {
    const taken = after(equipping(), take('shoddy-1', 'pistol', 'earl'));

    expect(taken.survivors[0]?.items).toEqual([item('shoddy-1', 'pistol', 'shoddy')]);
    expect(taken.inventory).toEqual(equipping().inventory);
    expect(taken.log.at(-1)?.event).toEqual({
      kind: 'item-moved',
      id: 'shoddy-1',
      item: 'pistol',
      grade: 'shoddy',
      from: 'free',
      to: { survivor: 'earl', name: 'Earl Rhodes' },
    });

    const setDown = after(taken, move('shoddy-1', 'base'));

    expect(carried(setDown, 'earl')).toEqual([]);
    expect(setDown.inventory).toEqual(equipping().inventory);
    expect(setDown.log.at(-1)?.event).toMatchObject({ from: { survivor: 'earl' }, to: 'free' });
  });

  it('takes a slot like any other item', () => {
    const full = equipping({
      survivors: [{ ...earl, items: [item('a', 'pistol'), item('b', 'revolver')] }, carla, ruby],
    });

    expect(codes(full, take('new', 'pistol', 'earl')).blockers).toEqual(['no-slots']);
  });

  it('refuses gear the survivor has no skill for, or that never comes shoddy', () => {
    expect(codes(equipping(), take('new', 'rifle', 'earl')).blockers).toEqual(['not-free']);
    expect(codes(equipping(), take('new', 'binoculars', 'ruby')).blockers).toEqual(['not-free']);
    expect(codes(equipping(), take('new', 'trap', 'carla')).blockers).toEqual([]);
  });

  it('refuses an id an item already has, or an item that does not exist', () => {
    expect(codes(equipping(), take('rifle-1', 'pistol', 'earl')).blockers).toEqual(['id-taken']);
    expect(codes(equipping(), take('new', 'laser' as ItemId, 'earl')).blockers).toEqual([
      'no-such-item',
    ]);
  });
});
