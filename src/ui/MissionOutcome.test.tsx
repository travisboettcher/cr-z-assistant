import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-09-12T09:00:00.000Z';

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

/** A team's choice at Select Mission, which the outcome is asked for (Z4-2). */
const chose = (mission: 'siege-defense' | 'thin-the-herd'): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team: 1, mission, names: [] },
});

function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
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
const field = (name: RegExp) => within(walk()).getByLabelText(name);

describe('the outcome of a Siege Defense (pg. 86)', () => {
  it('waits for the counts before it can be recorded', () => {
    open(playing({ log: [called, chose('siege-defense')] }));

    expect(
      within(walk()).getByRole('button', { name: /record the siege defense/i }),
    ).toBeDisabled();
  });

  it('says what a clean siege does, and keeps saying it once recorded', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '0');
    await user.type(field(/out over the map edge/i), '2');

    expect(walk().textContent).toContain('go back to 0');

    await user.click(within(walk()).getByRole('button', { name: /record the siege defense/i }));

    expect(within(walk()).queryByRole('button', { name: /record/i })).toBeNull();
    expect(walk().textContent).toContain('Siege Defense: 0 zombies left, 2 survivors out');
  });

  it('names an overrun base, and the choice the app leaves to the table', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');

    expect(walk().textContent).toContain('keep counting');
    expect(walk().textContent).toContain('The base is overrun');
  });
});

describe('the outcome of a Thin the Herd (pg. 81)', () => {
  it('is offered when a team chose it', () => {
    open(playing({ log: [chose('thin-the-herd')] }));

    expect(within(walk()).getByRole('group', { name: /thin the herd/i })).toBeInTheDocument();
  });

  it('is not offered when no team chose it', () => {
    open(playing());

    expect(within(walk()).queryByRole('group', { name: /thin the herd/i })).toBeNull();
  });

  it('halves the counter, and says everybody down brings the horde', async () => {
    const user = open(playing({ log: [chose('thin-the-herd')] }));

    await user.type(field(/at the start/i), '8');
    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');
    expect(walk().textContent).toContain('halved, rounding down');

    await user.click(within(walk()).getByLabelText(/incapacitated/i));
    expect(walk().textContent).toContain('next roll against the horde succeeds on its own');
  });
});
