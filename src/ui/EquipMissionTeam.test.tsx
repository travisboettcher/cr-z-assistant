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
const lane = (name: string) => within(walk().getByRole('region', { name }));
const member = lane;

/** Press an item's card in a lane, then the Move button another lane offers for it. */
async function move(
  user: ReturnType<typeof open>,
  item: string,
  from: string,
  to: string,
  verb = 'Move',
) {
  await user.click(lane(from).getByRole('button', { name: item }));
  await user.click(lane(to).getByRole('button', { name: `${verb} ${item} here` }));
}

/** B3 (#237): items are cards, and the places they can be are lanes. */
describe('Equip Mission Team (pg. 18; Z5-4)', () => {
  it('draws a lane for each survivor going out, by team, and nobody staying home', () => {
    open(equipping());

    expect(team(1).getByRole('region', { name: 'Earl Rhodes' })).toBeInTheDocument();
    expect(team(1).getByRole('region', { name: 'Carla Proust' })).toBeInTheDocument();
    expect(team(2).getByRole('region', { name: 'Ruby Vance' })).toBeInTheDocument();
    expect(walk().queryByRole('region', { name: 'Nell Haig' })).toBeNull();
    expect(member('Earl Rhodes').getByText(/Inventory Slots/)).toHaveTextContent('0 / 2');
    expect(member('Earl Rhodes').getByText('Carrying nothing')).toBeInTheDocument();
    expect(lane('The base’s Inventory').getAllByRole('button')).toHaveLength(2);
    // Earl's Handguns and Carla's Traps each bring something shoddy and free.
    expect(lane('Shoddy, free').getByRole('button', { name: 'Shoddy trap' })).toBeInTheDocument();
  });

  it('takes an item from the base’s Inventory, and writes it down', async () => {
    const user = open(equipping());

    await move(user, 'quality pistol', 'The base’s Inventory', 'Earl Rhodes');

    expect(member('Earl Rhodes').getByText(/Inventory Slots/)).toHaveTextContent('1 / 2');
    expect(
      member('Earl Rhodes').getByRole('button', { name: 'quality pistol' }),
    ).toBeInTheDocument();
    expect(
      lane('The base’s Inventory').queryByRole('button', { name: 'quality pistol' }),
    ).toBeNull();
    expect(campaignLog().textContent).toContain(
      'Moved quality pistol from the base’s Inventory to Earl Rhodes.',
    );
  });

  it('offers a move only where the item is not already, and a second press puts it down', async () => {
    const user = open(equipping());

    await user.click(lane('The base’s Inventory').getByRole('button', { name: 'quality pistol' }));
    expect(walk().getByRole('status')).toHaveTextContent('Choose where the quality pistol goes');
    expect(lane('The base’s Inventory').queryByRole('button', { name: /here$/ })).toBeNull();
    expect(lane('Shoddy, free').queryByRole('button', { name: /here$/ })).toBeNull();

    await user.click(lane('The base’s Inventory').getByRole('button', { name: 'quality pistol' }));
    expect(walk().queryByRole('status')).toBeNull();
    expect(lane('Earl Rhodes').queryByRole('button', { name: /here$/ })).toBeNull();
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

    await move(user, name, 'Earl Rhodes', 'Ruby Vance');

    expect(member('Earl Rhodes').getByText('Carrying nothing')).toBeInTheDocument();
    expect(member('Ruby Vance').getByRole('button', { name })).toBeInTheDocument();

    await move(user, name, 'Ruby Vance', 'The base’s Inventory');

    expect(member('Ruby Vance').getByText('Carrying nothing')).toBeInTheDocument();
    expect(lane('The base’s Inventory').getByRole('button', { name })).toBeInTheDocument();
  });

  it('takes shoddy gear free, and sets it down again', async () => {
    const user = open(equipping({ inventory: [] }));

    await user.click(lane('Shoddy, free').getByRole('button', { name: 'Shoddy trap' }));
    await user.click(member('Carla Proust').getByRole('button', { name: 'Move shoddy trap here' }));
    // Still on offer: the free supply never runs out.
    expect(lane('Shoddy, free').getByRole('button', { name: 'Shoddy trap' })).toBeInTheDocument();

    // Back to the free supply, never to the base.
    await user.click(member('Carla Proust').getByRole('button', { name: 'shoddy trap' }));
    expect(lane('The base’s Inventory').queryByRole('button', { name: /here$/ })).toBeNull();
    await user.click(lane('Shoddy, free').getByRole('button', { name: 'Set shoddy trap here' }));

    expect(member('Carla Proust').getByText('Carrying nothing')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Moved shoddy trap from Carla Proust to the free shoddy supply.',
    );
  });

  it('refuses past a survivor’s slots, on the lane, with no button', async () => {
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

    await user.click(lane('The base’s Inventory').getByRole('button', { name: 'quality pistol' }));

    expect(member('Earl Rhodes').queryByRole('button', { name: /here$/ })).toBeNull();
    expect(
      member('Earl Rhodes').getByText(/Earl Rhodes has no Inventory Slot free for it\./),
    ).toBeInTheDocument();
    // Carla has room, so she is offered it.
    expect(
      member('Carla Proust').getByRole('button', { name: 'Move quality pistol here' }),
    ).toBeInTheDocument();
  });

  it('warns about a weapon its carrier cannot use, and asks once before moving it', async () => {
    const user = open(equipping());
    const earl = () => member('Earl Rhodes');

    await user.click(lane('The base’s Inventory').getByRole('button', { name: 'standard rifle' }));
    expect(
      earl().getByText(/Earl Rhodes can carry it, but has no skill to use it with\./),
    ).toBeInTheDocument();

    await user.click(earl().getByRole('button', { name: 'Move standard rifle here' }));
    await user.click(earl().getByRole('button', { name: 'Leave it' }));
    expect(earl().getByText('Carrying nothing')).toBeInTheDocument();

    await user.click(earl().getByRole('button', { name: 'Move standard rifle here' }));
    await user.click(earl().getByRole('button', { name: 'Move it anyway' }));

    expect(earl().getByRole('button', { name: 'standard rifle' })).toBeInTheDocument();
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
