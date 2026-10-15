import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Vehicle } from '../engine/campaign';
import type { CampaignEvent, LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-10-15T09:00:00.000Z';

const truck: Vehicle = { id: 'truck', tier: 3, label: 'Box truck', water: false };
const pickup: Vehicle = { id: 'pickup', tier: 2, label: 'Red pickup', water: false };

const on4 = (event: CampaignEvent): LogEntry => ({ turn: 4, phase: 'mission', at: AT, event });

const SELECTED = on4({
  kind: 'mission-selected',
  team: 1,
  mission: 'thin-the-herd',
  names: ['Earl Rhodes'],
});

/** Turn 4 at Equip Mission Team: Earl on team 1, Thin the Herd chosen, two vehicles held. */
function equipping(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'equip-mission-team',
    materials: { food: 0, fuel: 4, hardware: 0 },
    survivors: [createSurvivor('Earl Rhodes', 3, { id: 'earl' })],
    assignments: { earl: { task: 'mission', team: 1 } },
    vehicles: [truck, pickup],
    log: [SELECTED],
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

const walk = () => within(screen.getByRole('region', { name: /^turn \d+$/i }));
const teamVehicles = () =>
  within(walk().getByRole('region', { name: 'Mission team 1’s vehicles' }));

describe('taking vehicles at Equip Mission Team (pp. 18, 52; R65, R66; Z5-12)', () => {
  it('takes a vehicle for its Fuel, and leaves it home again', async () => {
    const user = open(equipping());

    expect(teamVehicles().getByText('Going on foot')).toBeInTheDocument();
    await user.selectOptions(teamVehicles().getByLabelText('Take for team 1'), 'truck');
    await user.click(teamVehicles().getByRole('button', { name: 'Take a vehicle for team 1' }));

    expect(
      teamVehicles().getByText(/· Tier 3 · 10 Inventory, 6 Passenger Slots · 3 Fuel/),
    ).toBeInTheDocument();
    expect(
      walk().getByText('No Auto Shop protects it, so the vehicle going out arrives broken.'),
    ).toBeInTheDocument();
    // The Box truck burned 3 of the 4 Fuel, so the pickup's 2 is more than is left.
    expect(
      teamVehicles().getByText('Red pickup burns 2 Fuel and the base has 1 (R65).'),
    ).toBeInTheDocument();
    expect(
      teamVehicles().getByRole('button', { name: 'Take a vehicle for team 1' }),
    ).toBeDisabled();

    await user.click(teamVehicles().getByRole('button', { name: 'Leave home Box truck' }));

    expect(teamVehicles().getByText('Going on foot')).toBeInTheDocument();
    expect(teamVehicles().getByRole('button', { name: 'Take a vehicle for team 1' })).toBeEnabled();
  });

  it('says nothing of vehicles when the community holds none', () => {
    open(equipping({ vehicles: [] }));

    expect(walk().queryByRole('region', { name: 'Mission team 1’s vehicles' })).toBeNull();
  });
});

describe('bringing vehicles home (pg. 32; R70; Z5-12)', () => {
  const played = (): Campaign =>
    equipping({
      step: 'tactical-mission',
      materials: { food: 0, fuel: 0, hardware: 0 },
      log: [
        SELECTED,
        on4({
          kind: 'vehicle-taken',
          team: 1,
          vehicle: 'truck',
          label: 'Box truck',
          tier: 3,
          fuel: 3,
        }),
        on4({
          kind: 'vehicle-taken',
          team: 1,
          vehicle: 'pickup',
          label: 'Red pickup',
          tier: 2,
          fuel: 1,
        }),
        on4({
          kind: 'thin-the-herd-resolved',
          team: 1,
          startingZombies: 0,
          zombiesLeft: 0,
          survivorsExited: 1,
          allIncapacitated: false,
          wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 3 }],
        }),
      ],
    });
  const home = () => within(walk().getByRole('group', { name: 'Mission team 1’s vehicles' }));

  it('loses the vehicles not driven off, and the log says so', async () => {
    const user = open(played());

    await user.click(home().getByRole('checkbox', { name: 'Red pickup driven off' }));
    expect(home().getByText(/^Lost: Box truck\./)).toBeInTheDocument();
    await user.click(home().getByRole('button', { name: 'Record team 1’s vehicles' }));

    expect(walk().queryByRole('group', { name: 'Mission team 1’s vehicles' })).toBeNull();
    expect(walk().getByText('Mission team 1 lost Box truck, not driven off.')).toBeInTheDocument();
  });

  it('records every vehicle driven home', async () => {
    const user = open(played());

    await user.click(home().getByRole('checkbox', { name: 'Red pickup driven off' }));
    await user.click(home().getByRole('checkbox', { name: 'Box truck driven off' }));
    await user.click(home().getByRole('button', { name: 'Record team 1’s vehicles' }));

    expect(walk().getByText('Mission team 1 drove its vehicles home.')).toBeInTheDocument();
  });
});
