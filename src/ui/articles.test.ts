import { describe, expect, it } from 'vitest';
import { articleForNumber, withArticle } from './articles';

/**
 * **#173.** Sixteen lines of a permanent, uneditable log read "a Extra Bed",
 * "a Restraints" or "rolling a 8" by turn 17. A log is the one part of this app
 * a player cannot go back and correct.
 */
describe('withArticle', () => {
  it.each([
    ['Workshop', 'a Workshop'],
    ['Bunk Room', 'a Bunk Room'],
    ['Extra Bed', 'an Extra Bed'],
    ['Auto Shop', 'an Auto Shop'],
  ])('puts the right article before %s', (name, expected) => {
    expect(withArticle(name)).toBe(expected);
  });

  /** Plurals and mass nouns take none at all — "Ordered Restraints for the…". */
  it.each(['Restraints', 'Containment', 'Refrigeration', 'Shelving'])(
    'leaves %s without one',
    (name) => {
      expect(withArticle(name)).toBe(name);
    },
  );
});

describe('articleForNumber', () => {
  it.each([
    [1, 'a'],
    [3, 'a'],
    [8, 'an'],
    [10, 'a'],
    [11, 'an'],
    [18, 'an'],
  ])('reads %i as "%s"', (value, expected) => {
    expect(articleForNumber(value)).toBe(expected);
  });
});
