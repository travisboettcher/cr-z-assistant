import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-10-12T09:00:00.000Z';

/** Turn 4 at Select Mission: Earl and Carla on team 1, Ruby on team 2. */
function selecting(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'select-mission',
    survivors: [
      createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
      createSurvivor('Carla Proust', 2, { id: 'carla' }),
      createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
      ruby: { task: 'mission', team: 2 },
    },
    ...overrides,
  };
}

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const walk = () => within(screen.getByRole('region', { name: /^turn \d+$/i }));
const team = (number: number) =>
  within(walk().getByRole('group', { name: `Mission team ${String(number)}` }));

describe('Select Mission (pg. 17; Z4-2)', () => {
  it('asks each team the Planning Phase assigned for its own mission (pg. 21)', async () => {
    const user = open(selecting());

    expect(team(1).getByText('Earl Rhodes, Carla Proust')).toBeInTheDocument();
    expect(team(2).getByText('Ruby Vance')).toBeInTheDocument();

    await user.selectOptions(team(1).getByLabelText('Mission'), 'thin-the-herd');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));

    expect(
      team(1).getByText(/Mission team 1 chose Thin the Herd: Earl Rhodes, Carla Proust\./),
    ).toBeInTheDocument();
    expect(team(2).queryByText(/chose/)).toBeNull();
  });

  it('asks Gather Materials for the type it takes the rest in (pg. 80)', async () => {
    const user = open(selecting());

    expect(team(2).queryByLabelText('The rest in')).toBeNull();

    await user.selectOptions(team(2).getByLabelText('Mission'), 'gather-materials');
    await user.selectOptions(team(2).getByLabelText('The rest in'), 'fuel');
    await user.click(team(2).getByRole('button', { name: 'Choose for team 2' }));

    expect(
      team(2).getByText(/chose Gather Materials, taking the rest in Fuel: Ruby Vance\./),
    ).toBeInTheDocument();
  });

  it('refuses a second Claim a New Base, and says why (R20)', async () => {
    const user = open(selecting());

    await user.selectOptions(team(1).getByLabelText('Mission'), 'claim-a-new-base');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));
    await user.selectOptions(team(2).getByLabelText('Mission'), 'claim-a-new-base');

    expect(team(2).getByText(/already claiming a new base/)).toBeInTheDocument();
    expect(team(2).getByRole('button', { name: 'Choose for team 2' })).toBeDisabled();
  });

  it('lets the community skip the mission, and a choice take that back (pg. 17)', async () => {
    const user = open(selecting());

    await user.click(walk().getByRole('button', { name: 'Skip this turn’s mission' }));
    expect(walk().getByText(/skipped this turn’s mission/)).toBeInTheDocument();
    expect(walk().queryByRole('button', { name: 'Skip this turn’s mission' })).toBeNull();

    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));
    expect(walk().queryByText(/The community skipped/)).toBeNull();
  });

  it('offers only the Siege Defense, to everybody, when the horde called one', () => {
    open(selecting({ log: [called] }));

    expect(walk().queryByRole('group', { name: 'Mission team 2' })).toBeNull();
    expect(team(1).getByText('Earl Rhodes, Carla Proust, Ruby Vance')).toBeInTheDocument();
    expect(
      team(1)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['The Siege Defense']);
    expect(walk().queryByRole('button', { name: 'Skip this turn’s mission' })).toBeNull();
  });

  it('offers only the First Mission on turn 1 (pg. 76)', () => {
    open(selecting({ turn: 1, assignments: { earl: { task: 'mission', team: 1 } } }));

    expect(
      team(1)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['The First Mission']);
  });
});
