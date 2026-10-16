import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from './campaign';
import { firstTurnChecklist } from './firstTurn';
import { createSurvivor } from './survivor';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const EARL = 'earl';

/** Turn 1 with each of the three things done or not, as the test says. */
function turnOne({
  community = false,
  team = false,
  base = false,
}: { community?: boolean; team?: boolean; base?: boolean } = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [createSurvivor('Earl Rhodes', 2, { id: EARL })],
    startingCommunityBuilt: community,
    assignments: team ? { [EARL]: { task: 'mission', team: 1 } } : {},
    base: base ? { id: 'small-town-home', slots: {} } : null,
  };
}

describe('firstTurnChecklist', () => {
  it('starts at the community, with nothing done', () => {
    expect(firstTurnChecklist(turnOne())).toEqual({
      community: false,
      team: false,
      base: false,
      next: 'community',
    });
  });

  it('moves on to the team once the community is built', () => {
    expect(firstTurnChecklist(turnOne({ community: true }))?.next).toBe('team');
  });

  it('moves on to the base once the First Mission has a team', () => {
    expect(firstTurnChecklist(turnOne({ community: true, team: true }))?.next).toBe('base');
  });

  it('names the first item not done, even when a later one is', () => {
    expect(firstTurnChecklist(turnOne({ team: true, base: true }))?.next).toBe('community');
  });

  it('is null once all three are done', () => {
    expect(firstTurnChecklist(turnOne({ community: true, team: true, base: true }))).toBeNull();
  });

  it('is null after turn 1, whatever is left undone', () => {
    expect(firstTurnChecklist({ ...turnOne(), turn: 2 })).toBeNull();
  });
});
