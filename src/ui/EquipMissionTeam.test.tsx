import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Item } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { campaignLog } from '../test/screens';
import { App } from './App';

const AT = '2026-10-13T09:00:00.000Z';

const rifle: Item = { id: 'rifle-1', item: 'rifle', grade: 'standard' };
const pistol: Item = { id: 'pistol-1', item: 'pistol', grade: 'quality' };

/**
 * Turn 4 at Equip Mission Team: Earl (Handguns) and Carla (Traps) on team 1,
 * Ruby (Bladed Weapon) on team 2, Nell at home. Tier 2s have two slots each.
 */
function equipping(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'equip-mission-team',
    survivors: [
      { ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }), skills: { handguns: 0 } },
      { ...createSurvivor('Carla Proust', 2, { id: 'carla' }), skills: { traps: 0 } },
      { ...createSurvivor('Ruby Vance', 3, { id: 'ruby' }), skills: { 'blade-weapon': 0 } },
      createSurvivor('Nell Haig', 1, { id: 'nell' }),
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
      ruby: { task: 'mission', team: 2 },
    },
    inventory: [rifle, pistol],
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
const team = (number: number) =>
  within(walk().getByRole('group', { name: `Mission team ${String(number)}` }));
const member = (name: string) => within(walk().getByRole('region', { name }));

describe('Equip Mission Team (pg. 18; Z5-4)', () => {
  it('lists each team going out, with each survivor’s slots, and nobody staying home', () => {
    open(equipping());

    expect(team(1).getByRole('region', { name: 'Earl Rhodes' })).toBeInTheDocument();
    expect(team(1).getByRole('region', { name: 'Carla Proust' })).toBeInTheDocument();
    expect(team(2).getByRole('region', { name: 'Ruby Vance' })).toBeInTheDocument();
    expect(walk().queryByRole('region', { name: 'Nell Haig' })).toBeNull();
    expect(member('Earl Rhodes').getByText(/Inventory Slots/)).toHaveTextContent('0 / 2');
    expect(member('Earl Rhodes').getByText('Carrying nothing')).toBeInTheDocument();
  });

  it('takes an item from the base’s Inventory, and writes it down', async () => {
    const user = open(equipping());

    await user.selectOptions(member('Earl Rhodes').getByLabelText('Take for Earl Rhodes'), [
      'base:pistol-1',
    ]);
    await user.click(member('Earl Rhodes').getByRole('button', { name: 'Take for Earl Rhodes' }));

    expect(member('Earl Rhodes').getByText(/Inventory Slots/)).toHaveTextContent('1 / 2');
    expect(member('Earl Rhodes').getByLabelText('quality pistol to')).toBeInTheDocument();
    // Gone from what anybody else can take out of the base.
    expect(
      member('Carla Proust').queryByRole('option', { name: 'quality pistol' }),
    ).not.toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Moved quality pistol from the base’s Inventory to Earl Rhodes.',
    );
  });

  it('hands an item to somebody else going out, or back to the base', async () => {
    const blade: Item = { id: 'blade-1', item: 'bladed', grade: 'quality' };
    const user = open(
      equipping({
        survivors: equipping().survivors.map((survivor) =>
          survivor.id === 'earl' ? { ...survivor, items: [blade] } : survivor,
        ),
        inventory: [],
      }),
    );
    const name = 'quality bladed weapon';

    await user.selectOptions(member('Earl Rhodes').getByLabelText(`${name} to`), 'ruby');
    await user.click(member('Earl Rhodes').getByRole('button', { name: `Move ${name}` }));

    expect(member('Earl Rhodes').getByText('Carrying nothing')).toBeInTheDocument();
    expect(member('Ruby Vance').getByLabelText(`${name} to`)).toBeInTheDocument();

    await user.click(member('Ruby Vance').getByRole('button', { name: `Move ${name}` }));

    expect(member('Ruby Vance').getByText('Carrying nothing')).toBeInTheDocument();
    expect(member('Earl Rhodes').getByRole('option', { name })).toBeInTheDocument();
  });

  it('takes shoddy gear free, and sets it down again', async () => {
    const user = open(equipping({ inventory: [] }));

    await user.selectOptions(
      member('Carla Proust').getByLabelText('Take for Carla Proust'),
      'shoddy:trap',
    );
    await user.click(member('Carla Proust').getByRole('button', { name: 'Take for Carla Proust' }));

    const select = member('Carla Proust').getByLabelText('shoddy trap to');
    expect(within(select).getByRole('option', { name: 'Set it down' })).toBeInTheDocument();

    await user.click(member('Carla Proust').getByRole('button', { name: 'Move shoddy trap' }));

    expect(member('Carla Proust').getByText('Carrying nothing')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Moved shoddy trap from Carla Proust to the free shoddy supply.',
    );
  });

  it('refuses past a survivor’s slots, and says why', async () => {
    const full: Item[] = [
      { id: 'a', item: 'pistol', grade: 'standard' },
      { id: 'b', item: 'revolver', grade: 'standard' },
    ];
    const user = open(
      equipping({
        survivors: equipping().survivors.map((survivor) =>
          survivor.id === 'earl' ? { ...survivor, items: full } : survivor,
        ),
      }),
    );

    await user.selectOptions(member('Earl Rhodes').getByLabelText('Take for Earl Rhodes'), [
      'base:pistol-1',
    ]);

    expect(
      member('Earl Rhodes').getByRole('button', { name: 'Take for Earl Rhodes' }),
    ).toBeDisabled();
    expect(
      member('Earl Rhodes').getByText(/Earl Rhodes has no Inventory Slot free for it\./),
    ).toBeInTheDocument();
  });

  it('warns about a weapon its carrier cannot use, and takes it once told to', async () => {
    const user = open(equipping());
    const earl = () => member('Earl Rhodes');

    await user.selectOptions(earl().getByLabelText('Take for Earl Rhodes'), 'base:rifle-1');

    expect(
      earl().getByText(/Earl Rhodes can carry it, but has no skill to use it with\./),
    ).toBeInTheDocument();
    expect(earl().getByRole('button', { name: 'Take for Earl Rhodes' })).toBeDisabled();

    await user.click(earl().getByRole('checkbox', { name: 'Take it anyway' }));
    await user.click(earl().getByRole('button', { name: 'Take for Earl Rhodes' }));

    expect(earl().getByLabelText('standard rifle to')).toBeInTheDocument();
  });

  it('says nobody is equipped when the community opted out (pg. 17)', () => {
    const skipped: LogEntry = {
      turn: 4,
      phase: 'mission',
      at: AT,
      event: { kind: 'mission-skipped' },
    };
    open(equipping({ log: [skipped] }));

    expect(
      walk().getByText('Nobody is going out this turn, so nobody is equipped.'),
    ).toBeInTheDocument();
  });

  it('opens the base’s Inventory from the step', async () => {
    const user = open(equipping());

    await user.click(walk().getByRole('button', { name: 'base’s Inventory' }));

    expect(screen.getByRole('dialog', { name: /inventory/i })).toBeInTheDocument();
  });
});
