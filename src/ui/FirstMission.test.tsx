import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A turn-1 campaign standing in its Mission Phase, which is where the First
 * Mission's team has to be recorded — no Planning Phase has run, so there is
 * nothing for the Advancement Phase behind it to read (issue #116).
 *
 * Earl can force a material roll and Carla cannot, which is what makes the
 * substitution assertion below about the team rather than about the roster.
 */
function turnOne(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    step: 'select-mission',
    survivors: [
      {
        ...createSurvivor('Earl Rhodes', 4, { id: EARL }),
        stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
        skills: { mechanics: 0 },
      },
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ],
    base: { id: 'small-town-home', slots: {} },
    ...overrides,
  };
}

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });
const team = () => within(walk()).getByRole('group', { name: /on the first mission/i });

/** The +1 XP button on the mission pool's row for this survivor. */
function missionAward(survivor: RegExp) {
  const heading = within(walk()).getByText(/for going on the mission/i);
  const row = within(heading.closest('li') as HTMLElement)
    .getAllByRole('listitem')
    .find((item) => survivor.test(item.textContent ?? ''));

  return within(row as HTMLElement).getByRole('button', { name: /\+1 xp/i });
}

describe('the First Mission team', () => {
  it('is asked for on turn 1, where no Planning Phase has assigned one', () => {
    open(turnOne());

    expect(team()).toBeTruthy();
    expect(within(walk()).getByText(/the first mission is played on turn 1/i)).toBeTruthy();
  });

  /**
   * Every later turn's team was chosen in the Planning Phase before it. A
   * second place to answer the same question is a second answer waiting to
   * disagree with the first.
   */
  it('is not asked for again on a later turn', () => {
    open(turnOne({ turn: 2 }));

    expect(within(walk()).queryByRole('group', { name: /on the first mission/i })).toBeNull();
  });

  it('stays on offer across the phase’s steps', async () => {
    const user = open(turnOne());

    await user.click(screen.getByRole('button', { name: /^next: equip the mission team$/i }));

    expect(team()).toBeTruthy();
  });

  it('gives turn 1 the mission XP the book owes it', async () => {
    const user = open(turnOne());

    await user.click(within(team()).getByRole('checkbox', { name: /earl/i }));
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
    expect(within(walk()).queryByText(/nobody is on a mission team/i)).toBeNull();

    await user.click(missionAward(/earl/i));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('0 of 1');
  });

  /**
   * The quieter half of #116: substitutions are the combined Score of whoever
   * was on the mission (pg. 12), so with no team recorded a turn-1 haul could
   * not be redirected at all — and nothing said why.
   */
  it('gives turn 1 the substitutions that team’s skills allow', async () => {
    const user = open(turnOne());

    await user.click(within(team()).getByRole('checkbox', { name: /earl/i }));
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    await user.click(screen.getByRole('button', { name: /^next: create new survivors$/i }));
    await user.click(screen.getByRole('button', { name: /^next: add materials to storage$/i }));
    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).getByLabelText(/force the result of this roll/i)).toBeTruthy();
  });

  it('offers nothing to force when the one who can stayed home', async () => {
    const user = open(turnOne());

    await user.click(within(team()).getByRole('checkbox', { name: /carla/i }));
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    await user.click(screen.getByRole('button', { name: /^next: create new survivors$/i }));
    await user.click(screen.getByRole('button', { name: /^next: add materials to storage$/i }));
    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).queryByLabelText(/force the result of this roll/i)).toBeNull();
  });

  /**
   * The assignment is an ordinary one, so turn 1's Planning Phase clears it
   * like any other — and the Advancement Phase behind it still reads it,
   * through the entry that recorded the clearing (issue #95).
   */
  it('survives a step out to Planning and back', async () => {
    const user = open(turnOne());

    await user.click(within(team()).getByRole('checkbox', { name: /earl/i }));
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    await user.click(screen.getByRole('button', { name: /^skip to planning$/i }));
    for (const step of [
      /^back to add facilities and upgrades$/i,
      /^back to heal wounds$/i,
      /^back to add materials to storage$/i,
      /^back to create new survivors$/i,
      /^back to character advancement$/i,
    ]) {
      await user.click(screen.getByRole('button', { name: step }));
    }

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
  });
});
