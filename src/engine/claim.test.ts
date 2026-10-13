import { describe, expect, it } from 'vitest';
import { continued, overrun, wentOn } from '../test/overrun';
import { BASE_IDS, BASES, type BaseId } from '../data/bases';
import { createNewCampaign, type Assignment, type Campaign } from './campaign';
import { baseMoved, claimedBase, claimWarning, claimWon, heroesOverCap, moveOwed } from './claim';
import type { CampaignEvent, LogEntry } from './log';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });
const ruby = createSurvivor('Ruby Vance', 3, { id: 'ruby' });

const onTeam = (team: number): Assignment => ({ task: 'mission', team });

/** Turn 4 at Play the Mission, on a Hobby Farm: Earl on team 1, Ruby on team 2. */
function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    base: { id: 'hobby-farm', slots: {} },
    survivors: [earl, ruby],
    assignments: { earl: onTeam(1), ruby: onTeam(2) },
    ...overrides,
  };
}

const at = (event: CampaignEvent, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event,
});

const claiming = (team: number, base?: BaseId, turn = 4): LogEntry =>
  at(
    {
      kind: 'mission-selected',
      team,
      mission: 'claim-a-new-base',
      names: [],
      ...(base === undefined ? {} : { base }),
    },
    turn,
  );

const claimed = (team: number, endCondition: number | null, turn = 4): LogEntry =>
  at(
    { kind: 'claim-a-new-base-resolved', team, endCondition, strangers: [], vehiclesOnArea: 0 },
    turn,
  );

const heroes = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    createSurvivor(`Hero ${String(index)}`, 4, { id: `hero-${String(index)}` }),
  );

describe('claimWon', () => {
  it('is won on any of the end conditions, and lost on none (pg. 79)', () => {
    for (const condition of [1, 2, 3]) {
      expect(claimWon(playing({ log: [claiming(1, 'distillery'), claimed(1, condition)] }))).toBe(
        true,
      );
    }
    expect(claimWon(playing({ log: [claiming(1, 'distillery'), claimed(1, null)] }))).toBe(false);
  });

  it('counts a claim chosen before Z4-7, which named no base', () => {
    expect(claimWon(playing({ log: [claiming(1), claimed(1, 2)] }))).toBe(true);
  });

  it('reads only this turn, and nothing but a claim', () => {
    expect(claimWon(playing({ log: [claiming(1, 'distillery', 3), claimed(1, 1, 3)] }))).toBe(
      false,
    );
    expect(
      claimWon(
        playing({
          log: [
            at({ kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }),
            at({ kind: 'first-mission-resolved', team: 1, endCondition: 1, strangers: [] }),
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe('claimedBase', () => {
  it('is the base the winning team named (Z4-7)', () => {
    expect(claimedBase(playing({ log: [claiming(1, 'distillery'), claimed(1, 1)] }))).toBe(
      'distillery',
    );
  });

  it('reads the claiming team’s own choice, and its latest one', () => {
    const campaign = playing({
      log: [
        claiming(2, 'summer-camp'),
        claiming(2, 'rural-church'),
        at({ kind: 'mission-selected', team: 1, mission: 'thin-the-herd', names: [] }),
        claimed(2, 3),
      ],
    });

    expect(claimedBase(campaign)).toBe('rural-church');
  });

  it('is nothing for a lost claim, an old claim with no base, or another turn’s claim', () => {
    expect(claimedBase(playing({ log: [claiming(1, 'distillery'), claimed(1, null)] }))).toBeNull();
    expect(claimedBase(playing({ log: [claiming(1), claimed(1, 1)] }))).toBeNull();
    expect(
      claimedBase(playing({ log: [claiming(1, 'distillery', 3), claimed(1, 1, 3)] })),
    ).toBeNull();
    expect(claimedBase(playing())).toBeNull();
  });

  it('forgets a choice an opt-out cleared', () => {
    const campaign = playing({
      log: [claiming(1, 'distillery'), at({ kind: 'mission-skipped' }), claimed(1, 1)],
    });

    expect(claimedBase(campaign)).toBeNull();
  });
});

describe('moveOwed and baseMoved', () => {
  const won = [claiming(1, 'distillery'), claimed(1, 1)];
  const moved: LogEntry = {
    turn: 4,
    phase: 'advancement',
    at: AT,
    event: { kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] },
  };

  it('owes the move after a claim is won, until it is made (R25)', () => {
    expect(moveOwed(playing({ log: won }))).toBe(true);
    expect(baseMoved(playing({ log: won }))).toBe(false);
    expect(moveOwed(playing({ log: [...won, moved] }))).toBe(false);
    expect(baseMoved(playing({ log: [...won, moved] }))).toBe(true);
  });

  it('owes nothing when no claim was won', () => {
    expect(moveOwed(playing({ log: [claiming(1, 'distillery'), claimed(1, null)] }))).toBe(false);
  });

  it('reads only this turn’s move', () => {
    expect(baseMoved(playing({ log: [{ ...moved, turn: 3 }] }))).toBe(false);
  });
});

describe('heroesOverCap', () => {
  it('is one for every Hero over the base’s Tier (pg. 54; R32)', () => {
    expect(heroesOverCap(playing({ survivors: heroes(3) }), 'summer-camp')).toBe(2);
    expect(heroesOverCap(playing({ survivors: heroes(1) }), 'summer-camp')).toBe(0);
    expect(heroesOverCap(playing({ survivors: [earl, ruby] }), 'summer-camp')).toBe(0);
  });
});

describe('claimWarning', () => {
  it('warns when the base holds fewer Heroes than the community has (pg. 54)', () => {
    // A Tier 1 base holds one Hero.
    expect(claimWarning(playing({ survivors: [earl, ...heroes(2)] }), 'summer-camp')).toBe(
      'This base holds 1 Hero and the community has 2: moving in sends a Hero of your choice away.',
    );
  });

  it('says how many leave when it is more than one (R32)', () => {
    expect(claimWarning(playing({ survivors: heroes(3) }), 'summer-camp')).toBe(
      'This base holds 1 Hero and the community has 3: moving in sends 2 Heroes of your choice away.',
    );
  });

  it('says Heroes when the base holds more than one', () => {
    const tierTwo = BASE_IDS.find((id) => BASES[id].tier === 2) as BaseId;

    expect(claimWarning(playing({ survivors: heroes(3) }), tierTwo)).toBe(
      'This base holds 2 Heroes and the community has 3: moving in sends a Hero of your choice away.',
    );
  });

  it('says nothing when the Heroes fit, to the last one', () => {
    expect(claimWarning(playing({ survivors: heroes(1) }), 'summer-camp')).toBeNull();
    // Survivors below Hero are not counted at all.
    expect(claimWarning(playing({ survivors: [earl, ruby] }), 'summer-camp')).toBeNull();
  });
});

describe('claimedBase after an overrun (pg. 86; Z4-9)', () => {
  it('is the base a community starting over named, once its First Mission is won', () => {
    expect(claimedBase(overrun([...wentOn('start-over', 'summer-camp')]))).toBeNull();
    expect(
      claimedBase(overrun([...wentOn('start-over', 'summer-camp'), continued('start-over', true)])),
    ).toBe('summer-camp');
  });

  it('is the base the overrun’s claim won', () => {
    expect(claimedBase(overrun([...wentOn('claim', 'distillery'), continued('claim', true)]))).toBe(
      'distillery',
    );
  });

  it('is nothing for a campaign’s own turn-1 First Mission, which names no base', () => {
    const first = playing({
      turn: 1,
      log: [
        at({ kind: 'mission-selected', team: 1, mission: 'first-mission', names: [] }, 1),
        at({ kind: 'first-mission-resolved', team: 1, endCondition: 1, strangers: [] }, 1),
      ],
    });

    expect(claimedBase(first)).toBeNull();
  });

  it('does not lock Unrest for starting over, which is not a claim (pg. 79)', () => {
    expect(
      claimWon(overrun([...wentOn('start-over', 'summer-camp'), continued('start-over', true)])),
    ).toBe(false);
    expect(claimWon(overrun([...wentOn('claim', 'distillery'), continued('claim', true)]))).toBe(
      true,
    );
  });
});
