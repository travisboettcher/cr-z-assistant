import { describe, expect, it } from 'vitest';
import { continued, inMission, overrun, wentOn } from '../test/overrun';
import {
  continuationMission,
  continuationOpen,
  overranThisTurn,
  overrunChoice,
  overrunChoiceOwed,
  overrunChoiceProblem,
  overrunClaim,
  reclaimedOnSameMap,
} from './overrun';

describe('the overrun base, step by step (pg. 86; R27, R28)', () => {
  it('owes the choice straight after the siege overran the base', () => {
    const campaign = overrun();

    expect(overranThisTurn(campaign)).toBe(true);
    expect(overrunChoiceOwed(campaign)).toBe(true);
    expect(overrunChoice(campaign)).toBeNull();
    expect(continuationOpen(campaign)).toBe(false);
  });

  it('opens team 1’s next selection once a way on is chosen', () => {
    const campaign = overrun([inMission({ kind: 'overrun-continued', option: 'claim' })]);

    expect(overrunChoiceOwed(campaign)).toBe(false);
    expect(continuationOpen(campaign)).toBe(true);
    expect(overrunChoice(campaign)).toBe('claim');
  });

  it('closes the selection once the continuation is chosen, and owes nothing while it is played', () => {
    const campaign = overrun([...wentOn('claim', 'distillery')]);

    expect(continuationOpen(campaign)).toBe(false);
    expect(overrunChoiceOwed(campaign)).toBe(false);
  });

  it('owes the choice again after a way on that met no end condition (R28)', () => {
    const campaign = overrun([...wentOn('claim', 'distillery'), continued('claim', false)]);

    expect(overrunChoiceOwed(campaign)).toBe(true);
    // The latest choice stands until another is made.
    expect(overrunChoice(campaign)).toBe('claim');
  });

  it('is settled by a way on that won, by either mission', () => {
    for (const option of ['claim', 'start-over'] as const) {
      const campaign = overrun([...wentOn(option, 'distillery'), continued(option, true)]);

      expect(overrunChoiceOwed(campaign)).toBe(false);
      expect(overrunChoiceProblem(campaign, 'claim')).toMatch(/already gone on/);
    }
  });

  it('follows a second choice after a failed one (R28)', () => {
    const campaign = overrun([
      ...wentOn('claim', 'distillery'),
      continued('claim', false),
      ...wentOn('start-over', 'summer-camp'),
    ]);

    expect(overrunChoice(campaign)).toBe('start-over');
    expect(overrunClaim(campaign)).toBe(false);
  });

  it('reads nothing on a turn whose siege did not overrun the base', () => {
    const cleared = overrun([], {
      log: overrun().log.map((entry) =>
        entry.event.kind === 'siege-defense-resolved'
          ? { ...entry, event: { ...entry.event, zombiesLeft: 0 } }
          : entry,
      ),
    });

    expect(overranThisTurn(cleared)).toBe(false);
    expect(overrunChoiceOwed(cleared)).toBe(false);
    // A choice written where none was owed is not followed.
    const stray = overrun([], {
      log: [...cleared.log, inMission({ kind: 'overrun-continued', option: 'claim' })],
    });
    expect(overrunChoice(stray)).toBeNull();
    expect(continuationOpen(stray)).toBe(false);
  });

  it('waits through anything else written between the steps', () => {
    const between = inMission({ kind: 'phase-entered' });

    // Between the way on and its selection, the selection is still open…
    expect(
      continuationOpen(
        overrun([inMission({ kind: 'overrun-continued', option: 'claim' }), between]),
      ),
    ).toBe(true);
    // …and between the selection and its outcome, the way on is still unplayed.
    expect(
      overrunChoiceProblem(overrun([...wentOn('claim', 'distillery'), between]), 'claim'),
    ).toMatch(/choose again only if it fails/);
  });

  it('reads only this turn', () => {
    expect(overranThisTurn(overrun([], { turn: 5 }))).toBe(false);
  });
});

describe('overrunChoiceProblem', () => {
  it('takes a way on while the choice is owed', () => {
    expect(overrunChoiceProblem(overrun(), 'claim')).toBeNull();
    expect(overrunChoiceProblem(overrun(), 'start-over')).toBeNull();
  });

  it('refuses outside the Mission Phase', () => {
    expect(overrunChoiceProblem(overrun([], { step: 'heal-wounds' }), 'claim')).toMatch(
      /Mission Phase/,
    );
  });

  it('refuses a way on the book does not give', () => {
    expect(overrunChoiceProblem(overrun(), 'toString' as 'claim')).toMatch(/no such way/);
  });

  it('refuses a turn with nothing overrun', () => {
    expect(overrunChoiceProblem(overrun([], { log: [] }), 'claim')).toMatch(/overran this turn/);
  });

  it('refuses a second choice while one is chosen and unplayed', () => {
    expect(
      overrunChoiceProblem(
        overrun([inMission({ kind: 'overrun-continued', option: 'claim' })]),
        'claim',
      ),
    ).toMatch(/choose again only if it fails/);
    expect(overrunChoiceProblem(overrun([...wentOn('claim', 'distillery')]), 'claim')).toMatch(
      /choose again only if it fails/,
    );
  });
});

describe('continuationMission', () => {
  it('plays Claim a New Base to claim again, and the First Mission to start over (pg. 86)', () => {
    expect(continuationMission('claim')).toBe('claim-a-new-base');
    expect(continuationMission('start-over')).toBe('first-mission');
  });
});

describe('overrunClaim and reclaimedOnSameMap', () => {
  it('knows the claim an overrun goes on with', () => {
    expect(overrunClaim(overrun([...wentOn('claim', 'hobby-farm')]))).toBe(true);
    expect(overrunClaim(overrun([...wentOn('start-over', 'hobby-farm')]))).toBe(false);
    expect(overrunClaim(overrun())).toBe(false);
  });

  it('reads the same map off a won claim that says so (R29)', () => {
    expect(
      reclaimedOnSameMap(
        overrun([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)]),
      ),
    ).toBe(true);
    expect(
      reclaimedOnSameMap(
        overrun([...wentOn('claim', 'hobby-farm'), continued('claim', true, false)]),
      ),
    ).toBe(false);
    expect(
      reclaimedOnSameMap(
        overrun([...wentOn('claim', 'hobby-farm'), continued('claim', false, true)]),
      ),
    ).toBe(false);
    expect(
      reclaimedOnSameMap(
        overrun([...wentOn('claim', 'hobby-farm'), { ...continued('claim', true, true), turn: 3 }]),
      ),
    ).toBe(false);
  });
});
