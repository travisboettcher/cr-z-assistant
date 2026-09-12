import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { anythingOverCap, overCap, storageChecked, withStorageChecked } from './storage';
import type { LogEntry } from './log';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

/** The Greasy Spoon stores 6 of each capped material (pg. 54). */
const spoon = (): Base => ({ id: 'greasy-spoon', slots: {} });

function community(
  materials: Partial<Campaign['materials']> = {},
  base: Base | null = spoon(),
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    materials: { food: 0, fuel: 0, hardware: 0, rare: 0, ...materials },
    base,
  };
}

describe('overCap', () => {
  it('is nothing when every store is under its cap', () => {
    expect(overCap(community({ food: 3, fuel: 6, hardware: 0 }))).toEqual({
      food: 0,
      fuel: 0,
      hardware: 0,
    });
  });

  it('is the amount above, per material', () => {
    expect(overCap(community({ food: 9, fuel: 7, hardware: 2 }))).toEqual({
      food: 3,
      fuel: 1,
      hardware: 0,
    });
  });

  it('is nothing exactly on the cap, which is not over it', () => {
    expect(overCap(community({ food: 6 })).food).toBe(0);
  });

  /** A community with no base has no caps to overflow (pg. 54). */
  it('is nothing at all without a base, however much is held', () => {
    expect(overCap(community({ food: 99, fuel: 99, hardware: 99 }, null))).toEqual({
      food: 0,
      fuel: 0,
      hardware: 0,
    });
  });
});

describe('anythingOverCap', () => {
  it('is false when nothing is over', () => {
    expect(anythingOverCap(community({ food: 6, fuel: 6, hardware: 6 }))).toBe(false);
  });

  it('is true when one thing is', () => {
    expect(anythingOverCap(community({ fuel: 7 }))).toBe(true);
  });
});

describe('withStorageChecked', () => {
  it('takes each store down to its own cap and no further', () => {
    expect(withStorageChecked(community({ food: 9, fuel: 7, hardware: 2 })).materials).toEqual({
      food: 6,
      fuel: 6,
      hardware: 2,
      rare: 0,
    });
  });

  /** Rare has no cap in the book (pg. 54), so it is never trimmed. */
  it('leaves Rare alone however much of it there is', () => {
    expect(withStorageChecked(community({ rare: 99 })).materials.rare).toBe(99);
  });

  it('changes nothing when nothing is over', () => {
    const before = community({ food: 6, fuel: 3, hardware: 0, rare: 4 });

    expect(withStorageChecked(before)).toEqual(before);
  });

  it('leaves everything else about the campaign alone', () => {
    const before = community({ food: 9 });
    const after = withStorageChecked(before);

    expect({ ...after, materials: before.materials }).toEqual(before);
  });
});

describe('storageChecked', () => {
  const checked = (turn: number): LogEntry => ({
    turn,
    phase: 'management',
    at: AT,
    event: { kind: 'storage-checked', food: 1, fuel: 0, hardware: 0 },
  });

  it('is false before the step has run', () => {
    expect(storageChecked(community())).toBe(false);
  });

  it('is true once this turn has an entry', () => {
    expect(storageChecked({ ...community(), log: [checked(3)] })).toBe(true);
  });

  it('ignores another turn’s entry', () => {
    expect(storageChecked({ ...community(), log: [checked(2)] })).toBe(false);
  });

  it('ignores this turn’s other events', () => {
    const other: LogEntry = { turn: 3, phase: 'management', at: AT, event: { kind: 'turn-began' } };

    expect(storageChecked({ ...community(), log: [other] })).toBe(false);
  });
});
