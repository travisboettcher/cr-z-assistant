import { describe, expect, it } from 'vitest';
import { queued } from '../test/queued';
import { checkBuild } from './build';
import { createNewCampaign, type Campaign } from './campaign';
import type { CampaignEvent, LogEntry } from './log';
import { projectCost, withProjectOrdered } from './projects';
import { freeRebuild, rebuildsOpen } from './rebuild';
import { checkUpgrade } from './upgrade';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-13T09:00:00.000Z';

const at = (event: CampaignEvent, turn = 4): LogEntry => ({
  turn,
  phase: 'advancement',
  at: AT,
  event,
});

/** The move into a reclaimed Hobby Farm, with a Watchtower and its Spotlight to put back. */
const reclaimed = at({
  kind: 'base-moved',
  from: 'hobby-farm',
  to: 'hobby-farm',
  setAside: [],
  stores: { food: 0, fuel: 0, hardware: 0 },
  rebuild: [{ slot: 'front-yard', facility: 'watchtower', upgrades: ['spotlight'] }],
});

/** Turn 5's Planning Phase in the reclaimed Hobby Farm, with nothing rebuilt yet. */
function rebuilding(after: readonly LogEntry[] = [], overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 5,
    step: 'assign-project-team',
    materials: { food: 0, fuel: 0, hardware: 0 },
    base: { id: 'hobby-farm', slots: {} },
    log: [reclaimed, ...after],
    ...overrides,
  };
}

const watchtower = { kind: 'facility', slot: 'front-yard', facility: 'watchtower' } as const;
const spotlight = { kind: 'upgrade', slot: 'front-yard', upgrade: 'spotlight' } as const;

/** The Watchtower standing again in the front yard. */
const standing = { 'front-yard': { built: { facility: 'watchtower' as const, builtOnTurn: 5 } } };

describe('freeRebuild (pg. 86; R29; Z4-10)', () => {
  it('is what the overrun destroyed, in the slot it stood in', () => {
    expect(freeRebuild(rebuilding(), watchtower)).toBe(true);
    expect(freeRebuild(rebuilding(), spotlight)).toBe(true);
  });

  it('finds its slot among several the overrun destroyed', () => {
    const two = rebuilding([], {
      log: [
        at({
          kind: 'base-moved',
          from: 'hobby-farm',
          to: 'hobby-farm',
          setAside: [],
          rebuild: [
            { slot: 'kitchen', upgrades: ['gas-range'] },
            { slot: 'front-yard', facility: 'watchtower', upgrades: [] },
          ],
        }),
      ],
    });

    expect(freeRebuild(two, watchtower)).toBe(true);
  });

  it('is nothing else: another slot, another facility, or a clearing', () => {
    expect(freeRebuild(rebuilding(), { ...watchtower, slot: 'back-yard' })).toBe(false);
    expect(freeRebuild(rebuilding(), { ...watchtower, facility: 'workshop' })).toBe(false);
    expect(freeRebuild(rebuilding(), { ...spotlight, upgrade: 'catwalks' as 'spotlight' })).toBe(
      false,
    );
    expect(freeRebuild(rebuilding(), { kind: 'clearing', slot: 'ruined-chicken-coop' })).toBe(
      false,
    );
  });

  it('is spent once it has been built again', () => {
    expect(
      freeRebuild(
        rebuilding([at({ kind: 'facility-built', slot: 'front-yard', facility: 'watchtower' }, 5)]),
        watchtower,
      ),
    ).toBe(false);
    expect(
      freeRebuild(
        rebuilding([at({ kind: 'upgrade-built', slot: 'front-yard', upgrade: 'spotlight' }, 5)]),
        spotlight,
      ),
    ).toBe(false);
  });

  it('counts only a build since the reclaim, not the one the overrun destroyed', () => {
    const earlier = rebuilding([], {
      log: [
        at({ kind: 'facility-built', slot: 'front-yard', facility: 'watchtower' }, 2),
        reclaimed,
      ],
    });

    expect(freeRebuild(earlier, watchtower)).toBe(true);
  });

  it('counts only a build of the same thing in the same slot', () => {
    const elsewhere = rebuilding([
      at({ kind: 'facility-built', slot: 'back-yard', facility: 'watchtower' }, 5),
      at({ kind: 'upgrade-built', slot: 'back-yard', upgrade: 'spotlight' }, 5),
      at({ kind: 'facility-built', slot: 'front-yard', facility: 'workshop' }, 5),
    ]);

    expect(freeRebuild(elsewhere, watchtower)).toBe(true);
    expect(freeRebuild(elsewhere, spotlight)).toBe(true);
  });

  it('is taken by the order that is in the queue, so a second would pay', () => {
    const ordered = rebuilding([], {
      projects: [
        queued({ ...watchtower, orderedOnTurn: 5 }),
        queued({ ...spotlight, orderedOnTurn: 5 }),
      ],
    });

    expect(freeRebuild(ordered, watchtower)).toBe(false);
    expect(freeRebuild(ordered, spotlight)).toBe(false);
    // Something else queued for the slot takes nothing.
    const other = rebuilding([], {
      projects: [
        queued({
          kind: 'upgrade',
          slot: 'front-yard',
          upgrade: 'catwalks' as 'spotlight',
          orderedOnTurn: 5,
        }),
      ],
    });
    expect(freeRebuild(other, spotlight)).toBe(true);
    expect(freeRebuild(other, watchtower)).toBe(true);
  });

  it('lasts until used, with no deadline (R29)', () => {
    expect(freeRebuild(rebuilding([], { turn: 40 }), watchtower)).toBe(true);
  });

  it('ends with the next move, which leaves the reclaimed base behind', () => {
    const movedOn = rebuilding([
      at({ kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] }, 9),
    ]);

    expect(freeRebuild(movedOn, watchtower)).toBe(false);
  });

  it('is nothing for a campaign that never reclaimed a base', () => {
    expect(freeRebuild(rebuilding([], { log: [] }), watchtower)).toBe(false);
  });
});

describe('a free rebuild’s price', () => {
  it('spends no Hardware, and the Labor it always did (pg. 86; R29)', () => {
    expect(projectCost(rebuilding(), watchtower)).toEqual({
      hardware: 0,
      labor: 2,
    });
  });

  it('is charged at nothing, and the next one at the catalogue price', () => {
    const once = withProjectOrdered(
      rebuilding([], { materials: { food: 0, fuel: 0, hardware: 9 } }),
      { ...watchtower, orderedOnTurn: 5 },
    );

    expect(once.materials.hardware).toBe(9);
    expect(once.projects[0]?.charged).toEqual({ hardware: 0, labor: 2 });
    expect(projectCost(once, watchtower)).toEqual({
      hardware: 3,
      labor: 2,
    });
  });

  it('is not refused for want of Hardware', () => {
    const codes = (check: { readonly blockers: readonly { readonly code: string }[] }) =>
      check.blockers.map((blocker) => blocker.code);

    expect(codes(checkBuild(rebuilding(), watchtower))).not.toContain('not-enough-hardware');
    expect(
      codes(checkBuild(rebuilding(), { slot: 'back-yard', facility: 'watchtower' })),
    ).toContain('not-enough-hardware');
    expect(
      codes(
        checkUpgrade(rebuilding([], { base: { id: 'hobby-farm', slots: standing } }), spotlight),
      ),
    ).not.toContain('not-enough-hardware');
  });
});

describe('rebuildsOpen', () => {
  it('names a facility with no upgrades to go with it', () => {
    const bare = rebuilding([], {
      log: [
        at({
          kind: 'base-moved',
          from: 'hobby-farm',
          to: 'hobby-farm',
          setAside: [],
          rebuild: [{ slot: 'back-yard', facility: 'watchtower', upgrades: [] }],
        }),
      ],
    });

    expect(rebuildsOpen(bare)).toStrictEqual([
      { slot: 'back-yard', facility: 'watchtower', upgrades: [] },
    ]);
  });

  it('is nothing after a move that was not an overrun reclaim', () => {
    expect(
      rebuildsOpen(
        rebuilding([
          at({ kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] }, 9),
        ]),
      ),
    ).toEqual([]);
  });

  it('names what is still free, slot by slot', () => {
    expect(rebuildsOpen(rebuilding())).toEqual([
      { slot: 'front-yard', facility: 'watchtower', upgrades: ['spotlight'] },
    ]);
  });

  it('drops what has been rebuilt, and a slot with nothing left', () => {
    const half = rebuilding([
      at({ kind: 'facility-built', slot: 'front-yard', facility: 'watchtower' }, 5),
    ]);
    expect(rebuildsOpen(half)).toStrictEqual([{ slot: 'front-yard', upgrades: ['spotlight'] }]);

    const done = rebuilding([
      at({ kind: 'facility-built', slot: 'front-yard', facility: 'watchtower' }, 5),
      at({ kind: 'upgrade-built', slot: 'front-yard', upgrade: 'spotlight' }, 6),
    ]);
    expect(rebuildsOpen(done)).toEqual([]);
  });
});
