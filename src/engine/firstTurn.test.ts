import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from './campaign';
import { firstTurnChecklist } from './firstTurn';
import type { LogEntry } from './log';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const EARL = 'earl';
const AT = '2026-08-30T00:00:00.000Z';

/** A Tier 2 survivor with both their skills chosen (pg. 7): nothing left to build. */
const finished = (): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: EARL }),
  skills: { tactics: 0, carry: 0 },
});

/** How turn 1's First Mission ended: an end condition, or none (pg. 77). */
const played = (endCondition: number | null): LogEntry => ({
  turn: 1,
  phase: 'mission',
  at: AT,
  event: { kind: 'first-mission-resolved', team: 1, endCondition, strangers: [] },
});

/** Turn 1 with each of the four things done or not, as the test says. */
function turnOne({
  community = false,
  team = false,
  mission = false,
  base = false,
  survivor = finished(),
}: {
  community?: boolean;
  team?: boolean;
  mission?: boolean;
  base?: boolean;
  survivor?: Survivor;
} = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [survivor],
    startingCommunityBuilt: community,
    assignments: team ? { [EARL]: { task: 'mission', team: 1 } } : {},
    base: base ? { id: 'small-town-home', slots: {} } : null,
    log: mission ? [played(2)] : [],
  };
}

describe('firstTurnChecklist', () => {
  it('starts at the community, with nothing done', () => {
    expect(firstTurnChecklist(turnOne())).toEqual({
      community: false,
      team: false,
      mission: false,
      base: false,
      unfinished: [],
      next: 'community',
    });
  });

  it('moves on to the team once the community is built', () => {
    expect(firstTurnChecklist(turnOne({ community: true }))?.next).toBe('team');
  });

  it('moves on to playing the First Mission once it has a team', () => {
    expect(firstTurnChecklist(turnOne({ community: true, team: true }))?.next).toBe('mission');
  });

  it('moves on to the base once the First Mission is played', () => {
    expect(firstTurnChecklist(turnOne({ community: true, team: true, mission: true }))?.next).toBe(
      'base',
    );
  });

  it('names the first item not done, even when a later one is', () => {
    expect(firstTurnChecklist(turnOne({ team: true, base: true }))?.next).toBe('community');
  });

  /** #238. The community was ticked built with every survivor still owing skills. */
  it('does not count the community built while a survivor is still being built', () => {
    const owing = createSurvivor('Earl Rhodes', 2, { id: EARL });
    const checklist = firstTurnChecklist(turnOne({ community: true, survivor: owing }));

    expect(checklist?.community).toBe(false);
    expect(checklist?.unfinished.map((survivor) => survivor.id)).toEqual([EARL]);
    expect(checklist?.next).toBe('community');
  });

  it('stays while a survivor is still being built, though everything else is done', () => {
    const owing = createSurvivor('Earl Rhodes', 2, { id: EARL });
    const checklist = firstTurnChecklist(
      turnOne({ team: true, mission: true, base: true, survivor: owing }),
    );

    expect(checklist?.next).toBe('community');
  });

  it('does not count a failed First Mission as played, because turn 1 plays it again (R21)', () => {
    const failed = { ...turnOne({ community: true, team: true }), log: [played(null)] };

    expect(firstTurnChecklist(failed)?.mission).toBe(false);
  });

  it('is null once all four are done', () => {
    expect(
      firstTurnChecklist(turnOne({ community: true, team: true, mission: true, base: true })),
    ).toBeNull();
  });

  it('stays while the mission is unplayed, though the base was claimed early', () => {
    expect(firstTurnChecklist(turnOne({ community: true, team: true, base: true }))?.next).toBe(
      'mission',
    );
  });

  it('is null after turn 1, whatever is left undone', () => {
    expect(firstTurnChecklist({ ...turnOne(), turn: 2 })).toBeNull();
  });
});
