import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_ROLLS_KEY,
  clearPendingRolls,
  readPendingRolls,
  writePendingRolls,
} from './pendingRolls';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('writePendingRolls', () => {
  it('brings the rolls back for the same campaign and turn', () => {
    writePendingRolls('cedar', 3, [{ roll: 7 }, { roll: 9 }]);

    expect(readPendingRolls('cedar', 3)).toEqual([{ roll: 7 }, { roll: 9 }]);
  });

  it('keeps a forced result with its roll', () => {
    writePendingRolls('cedar', 3, [{ roll: 4, forced: { skill: 'rationing', material: 'food' } }]);

    expect(readPendingRolls('cedar', 3)).toEqual([
      { roll: 4, forced: { skill: 'rationing', material: 'food' } },
    ]);
  });

  /**
   * Silent, unlike the autosave's reported failure: there is nothing useful to
   * tell a player whose rolls are on the screen in front of them, and a warning
   * about background storage mid-step would be about the wrong thing.
   */
  it('does not throw when the store refuses the write', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      getItem: () => null,
      removeItem: () => undefined,
    });

    expect(() => writePendingRolls('cedar', 3, [{ roll: 7 }])).not.toThrow();
  });
});

describe('readPendingRolls', () => {
  it('is empty when nothing was ever written', () => {
    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  /**
   * The stamp is the whole reason the entry carries a campaign and a turn:
   * without it, a reload after ending the turn would hand this turn's step
   * last turn's dice, and going stale would be something every caller had to
   * remember rather than the default.
   */
  it('discards input left over from another turn', () => {
    writePendingRolls('cedar', 3, [{ roll: 7 }]);

    expect(readPendingRolls('cedar', 4)).toEqual([]);
  });

  it('discards input left over from another campaign', () => {
    writePendingRolls('cedar', 3, [{ roll: 7 }]);

    expect(readPendingRolls('mill-creek', 3)).toEqual([]);
  });

  it('is empty rather than a throw when the entry is not JSON', () => {
    localStorage.setItem(PENDING_ROLLS_KEY, 'not json');

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  it('is empty when the entry is JSON but not an object', () => {
    localStorage.setItem(PENDING_ROLLS_KEY, '7');

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  it('is empty when the stamp matches but the rolls are not a list', () => {
    localStorage.setItem(
      PENDING_ROLLS_KEY,
      JSON.stringify({ campaign: 'cedar', turn: 3, rolls: 'seven' }),
    );

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  it('is empty rather than a throw when the store cannot be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    });

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  it('is empty when the API is absent entirely', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  /**
   * All or nothing. A partly readable list would silently drop dice the player
   * entered — a quieter version of the bug this module exists to prevent — so
   * one unreadable entry discards the lot.
   */
  it('discards the whole list when one roll is unreadable', () => {
    localStorage.setItem(
      PENDING_ROLLS_KEY,
      JSON.stringify({ campaign: 'cedar', turn: 3, rolls: [{ roll: 7 }, { roll: 11 }] }),
    );

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });

  it.each([
    ['a roll that is not an object', 7],
    ['a roll outside the d10', { roll: 0 }],
    ['a forced result that is not an object', { roll: 7, forced: 'rationing' }],
    ['a forced result that is null', { roll: 7, forced: null }],
    [
      'a skill nothing in the catalogue matches',
      { roll: 7, forced: { skill: 'haggling', material: 'food' } },
    ],
    [
      'a material nothing in the catalogue matches',
      { roll: 7, forced: { skill: 'rationing', material: 'gold' } },
    ],
    /*
     * Not merely well-typed but permitted: the picker on screen only offers
     * what the skill can force, and a hand-edited entry must not be the side
     * door around it. `rationing` forces Food and nothing else (pg. 12).
     */
    [
      'a pairing the book does not allow',
      { roll: 7, forced: { skill: 'rationing', material: 'rare' } },
    ],
  ])('refuses %s', (_name, roll) => {
    localStorage.setItem(
      PENDING_ROLLS_KEY,
      JSON.stringify({ campaign: 'cedar', turn: 3, rolls: [roll] }),
    );

    expect(readPendingRolls('cedar', 3)).toEqual([]);
  });
});

describe('clearPendingRolls', () => {
  it('leaves nothing to read back', () => {
    writePendingRolls('cedar', 3, [{ roll: 7 }]);
    clearPendingRolls();

    expect(readPendingRolls('cedar', 3)).toEqual([]);
    expect(localStorage.getItem(PENDING_ROLLS_KEY)).toBeNull();
  });

  it('does not throw when the store cannot be reached', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('SecurityError');
      },
      getItem: () => null,
      setItem: () => undefined,
    });

    expect(() => clearPendingRolls()).not.toThrow();
  });
});
