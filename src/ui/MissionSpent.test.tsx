import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Item } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const grenade: Item = { id: 'grenade-1', item: 'grenade', grade: 'standard' };
const riot: Item = { id: 'riot-1', item: 'riot-shield', grade: 'standard' };
const shield: Item = { id: 'shield-1', item: 'improvised-shield', grade: 'standard' };

/** Turn 4 at Play the Mission: Earl and Carla on team 1, carrying gear. */
function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
    survivors: [
      { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), items: [grenade, riot] },
      { ...createSurvivor('Carla Proust', 3, { id: 'carla' }), items: [shield] },
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
    },
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
const used = () => within(walk().getByRole('group', { name: 'What mission team 1 used' }));

describe('What a mission used (pp. 40, 45–48; Z5-5)', () => {
  it('offers a disposable as used, one-mission gear as gone, and the rest as kept', () => {
    open(playing());

    expect(used().getByRole('checkbox', { name: /Earl Rhodes: standard grenade/ })).toBeChecked();
    expect(
      used().getByRole('checkbox', { name: /Earl Rhodes: standard riot shield/ }),
    ).not.toBeChecked();

    const fixed = used().getByRole('checkbox', {
      name: /Carla Proust: standard improvised shield/,
    });
    expect(fixed).toBeChecked();
    expect(fixed).toBeDisabled();
  });

  it('takes a thrown grenade and leaves the riot shield (pg. 51)', async () => {
    const user = open(playing());

    await user.click(used().getByRole('button', { name: 'Record what team 1 used' }));

    expect(walk().queryByRole('group', { name: 'What mission team 1 used' })).toBeInTheDocument();
    expect(
      walk().getByText(
        'Mission team 1 used up or lost: Earl Rhodes’s standard grenade, Carla Proust’s standard improvised shield.',
      ),
    ).toBeInTheDocument();
    // The riot shield is all that is left to record.
    expect(used().getAllByRole('checkbox')).toHaveLength(1);
  });

  it('records a riot shield the table says was lost', async () => {
    const user = open(playing({ survivors: playing().survivors.slice(0, 1) }));

    await user.click(used().getByRole('checkbox', { name: /grenade/ }));
    await user.click(used().getByRole('checkbox', { name: /riot shield/ }));
    await user.click(used().getByRole('button', { name: 'Record what team 1 used' }));

    expect(
      walk().getByText(/used up or lost: Earl Rhodes’s standard riot shield\./),
    ).toBeInTheDocument();
  });

  it('cannot record nothing at all', async () => {
    const user = open(playing({ survivors: playing().survivors.slice(0, 1) }));

    await user.click(used().getByRole('checkbox', { name: /grenade/ }));

    expect(used().getByRole('button', { name: 'Record what team 1 used' })).toBeDisabled();
    expect(used().getByText('Nothing is ticked as used up or lost.')).toBeInTheDocument();
  });

  it('shows nothing when nobody going out carries anything', () => {
    open(playing({ survivors: [createSurvivor('Earl Rhodes', 3, { id: 'earl' })] }));

    expect(walk().queryByRole('group', { name: /used$/ })).toBeNull();
  });
});
