import { describe, expect, it } from 'vitest';
import { permitted, type Check } from './checks';

/**
 * `permitted` is the one piece of logic in `checks.ts`, and its only caller is
 * a component — which the mutation run does not cover, because it scopes itself
 * to the pure layers on purpose. A rule that only a React test can check is a
 * rule nobody can check without a DOM, which is the claim
 * `vitest.mutation.config.ts` is built to make. So it is tested here as what it
 * is: a function.
 */
const check = (blockers: number, warnings: number): Check<'a' | 'b'> => ({
  blockers: Array.from({ length: blockers }, () => ({
    code: 'a' as const,
    message: 'blocked',
    pages: 54,
  })),
  warnings: Array.from({ length: warnings }, () => ({
    code: 'b' as const,
    message: 'a rule',
    pages: 54,
  })),
});

describe('permitted', () => {
  it('allows an action with nothing wrong with it', () => {
    expect(permitted(check(0, 0), false)).toBe(true);
  });

  it('refuses a blocked action however the override is set', () => {
    // There is no override for a blocker — that is the whole distinction.
    expect(permitted(check(1, 0), false)).toBe(false);
    expect(permitted(check(1, 0), true)).toBe(false);
    expect(permitted(check(1, 1), true)).toBe(false);
  });

  it('holds a warned action until it is overridden', () => {
    expect(permitted(check(0, 1), false)).toBe(false);
    expect(permitted(check(0, 1), true)).toBe(true);
  });

  it('takes one override for however many warnings there are', () => {
    expect(permitted(check(0, 3), true)).toBe(true);
  });
});
