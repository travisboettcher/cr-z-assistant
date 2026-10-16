import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { withPlanningBegun } from '../test/campaigns';
import { campaignLog, closePanel, openPanel } from '../test/screens';
import { App } from './App';

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const playing = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 3,
  step: 'assign-project-team',
  base: { id: 'small-town-home', slots: {} },
  survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
  ...overrides,
});

const card = () =>
  within(
    within(screen.getByRole('complementary', { name: /community summary/i })).getByRole('region', {
      name: /^inventory$/i,
    }),
  );

describe('the Inventory card and its modal (Z5-2)', () => {
  it('says the Inventory is empty, quietly', () => {
    open(playing());

    expect(card().getByText('Nothing stored yet.')).toBeInTheDocument();
  });

  it('counts what is stored', () => {
    open(
      playing({
        inventory: [
          { id: 'a', item: 'pistol', grade: 'standard' },
          { id: 'b', item: 'binoculars', grade: 'quality' },
        ],
      }),
    );

    expect(card().getByText(/items/).textContent).toBe('2 items');
  });

  it('adds an item by hand, lists it by kind, and writes it in the history', async () => {
    const user = open(playing());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Item'), 'binoculars');
    // Binoculars come only as quality (pg. 41), so that is the only grade offered.
    expect(
      within(screen.getByLabelText('Grade'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Quality']);
    await user.click(screen.getByRole('button', { name: 'Add to the Inventory' }));

    const stored = screen.getByRole('region', { name: 'In the Inventory' });
    expect(within(stored).getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    expect(within(stored).getByText(/Binoculars/)).toBeInTheDocument();

    closePanel();
    expect(card().getByText(/item/).textContent).toBe('1 item');
    expect(
      within(campaignLog()).getByText(/Added to the base’s Inventory: quality binoculars/),
    ).toBeInTheDocument();
  });

  it('never offers shoddy, which nobody owns (R35)', async () => {
    const user = open(playing());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Item'), 'pistol');
    expect(
      within(screen.getByLabelText('Grade'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Standard', 'Quality']);
  });

  it('offers only this campaign’s origin items (pg. 37)', () => {
    open(playing({ origin: 'viral' }));
    openPanel('inventory');

    const items = within(screen.getByLabelText('Item'))
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'));
    expect(items).toContain('disinfectant');
    expect(items).not.toContain('flamethrower');
  });

  it('takes an item out', async () => {
    const user = open(playing({ inventory: [{ id: 'a', item: 'pistol', grade: 'standard' }] }));
    openPanel('inventory');

    await user.click(screen.getByRole('button', { name: 'Take Pistol out' }));

    expect(screen.getByText('Nothing in the Inventory yet.')).toBeInTheDocument();
  });
});

describe('what a survivor carries, on their sheet (Z5-2)', () => {
  it('shows their slots in use and their items', async () => {
    const user = open(
      playing({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
            items: [
              { id: 'a', item: 'heavy', grade: 'shoddy' },
              { id: 'b', item: 'ultralight-backpack', grade: 'standard' },
            ],
          },
        ],
      }),
    );
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    // Two slots for a Tier 2, two more for the pack; the pack and the heavy weapon fill one each.
    expect(screen.getByText('2 / 4', { selector: 'p.text-2xl' })).toBeInTheDocument();
    expect(
      screen.getByText('Carrying Heavy weapon (shoddy), Ultralight backpack (standard)'),
    ).toBeInTheDocument();
  });
});

/** Building at Planning Step 2 (pp. 20–21, 41–42; Z5-6). */
describe('building an item from the Inventory', () => {
  /** Turn 3's Assign Project Team, a Workshop in the garage and a 2-Labor team. */
  const building = (): Campaign =>
    withPlanningBegun({
      ...playing(),
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 } } },
      },
      materials: { food: 0, fuel: 0, hardware: 5 },
      survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
      assignments: { earl: { task: 'project' } },
    });

  it('builds into the Inventory at once, and says what it cost', async () => {
    const user = open(building());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Item to build'), 'blunt');
    expect(screen.getByText(/1 Hardware · 1 Labor, of 2 available/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build' }));

    const stored = screen.getByRole('region', { name: 'In the Inventory' });
    expect(within(stored).getByText(/standard/i)).toBeInTheDocument();
    expect(card().getByText(/item/).textContent).toBe('1 item');
    expect(campaignLog().textContent).toContain(
      'Built into the base’s Inventory: standard blunt weapon, for 1 Hardware and 1 Labor.',
    );
  });

  it('refuses what the base cannot build, and says why', async () => {
    const user = open(building());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Item to build'), 'bladed');

    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
    expect(
      screen.getByText(/The base’s Workshop lacks the upgrade this is built with\./),
    ).toBeInTheDocument();
  });

  it('is linked from Assign Project Team', async () => {
    const user = open(building());

    await user.click(screen.getByRole('button', { name: 'Inventory' }));

    expect(screen.getByRole('dialog', { name: /inventory/i })).toBeInTheDocument();
  });
});

/** A reward that rolls on the Rare Item Table, entered by hand (pg. 43; Z5-7). */
describe('rolling on the Rare Item Table from the Inventory', () => {
  it('names what the two dice find, and adds it', async () => {
    const user = open(playing());
    openPanel('inventory');

    expect(screen.getByRole('button', { name: 'Add what it finds' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('First d10'), '6');
    await user.selectOptions(screen.getByLabelText('Second d10'), '7');
    expect(screen.getByText('standard bayonet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add what it finds' }));

    expect(card().getByText(/item/).textContent).toBe('1 item');
    expect(campaignLog().textContent).toContain(
      'Found on the Rare Item Table, rolling 6 then 7: standard bayonet.',
    );
  });
});

/** Installing a rare upgrade from the Inventory (pg. 49; R47; Z5-8). */
describe('installing a rare upgrade', () => {
  const grill = { id: 'grill', item: 'gas-grill', grade: 'standard' } as const;
  const atStep = (step: Campaign['step']) =>
    playing({
      step,
      base: { id: 'hobby-farm', slots: {} },
      inventory: [grill],
    });

  it('installs it in the facility of its kind at Add Facilities and Upgrades', async () => {
    const user = open(atStep('add-facilities-and-upgrades'));
    openPanel('inventory');

    await user.click(screen.getByRole('button', { name: 'Install Gas grill in the Kitchen' }));

    expect(card().getByText('Nothing stored yet.')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain('Installed standard gas grill in the Kitchen.');
  });

  it('says when it is installed, anywhere else in the turn', () => {
    open(atStep('assign-project-team'));
    openPanel('inventory');

    expect(screen.getByRole('button', { name: 'Install Gas grill in the Kitchen' })).toBeDisabled();
    expect(
      screen.getByText('Install rare upgrades at Add Facilities and Upgrades (R47).'),
    ).toBeInTheDocument();
  });
});

/** Trading at Planning (pp. 19, 21; R51–R56; Z5-9). */
describe('trading from the Inventory', () => {
  const shield = { id: 'shield', item: 'riot-shield', grade: 'standard' } as const;
  const atPlanning = (overrides: Partial<Campaign> = {}) =>
    withPlanningBegun(playing({ materials: { food: 4, fuel: 6, hardware: 0 }, ...overrides }));

  it('trades for an item, paid at once, and puts it on order', async () => {
    const user = open(atPlanning());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Item to trade for'), 'pistol');
    expect(screen.getByText(/^Costs 6/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Paid with'), '2');
    expect(screen.getByText('and 4 Fuel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trade for it' }));

    expect(screen.getByText(/arrives at the next Add Facilities and Upgrades/)).toBeInTheDocument();
    expect(card().getByText('Nothing stored yet.')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Traded for standard pistol, for 2 Food and 4 Fuel. It arrives next Advancement Phase.',
    );
  });

  it('says why it cannot, and offers no rare item', () => {
    open(atPlanning({ materials: { food: 0, fuel: 1, hardware: 0 } }));
    openPanel('inventory');

    const items = screen.getByLabelText('Item to trade for');
    expect(within(items).queryByRole('option', { name: 'Riot shield' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Trade for it' })).toBeDisabled();
    expect(screen.getByText(/the base has 1\./)).toBeInTheDocument();
  });

  it('sells a rare item for its price less two, and warns of a full store', async () => {
    const user = open(atPlanning({ inventory: [shield] }));
    openPanel('inventory');

    expect(screen.getByText(/^Sells for 8/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Taken as'), '8');
    expect(screen.getByText(/12 food is over this base’s/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Taken as'), '3');
    await user.click(screen.getByRole('button', { name: 'Sell' }));

    expect(card().getByText('Nothing stored yet.')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain('Sold standard riot shield for 3 Food and 5 Fuel.');
  });

  it('offers nothing to sell without a rare item', () => {
    open(atPlanning());
    openPanel('inventory');

    expect(screen.queryByRole('group', { name: 'Sell a rare item' })).toBeNull();
  });
});

/** A Rare Items trade, made from the Inventory at Planning (pp. 21, 43; R57–R59; Z5-10). */
describe('a Rare Items trade from the Inventory', () => {
  const going = () =>
    withPlanningBegun(
      playing({
        step: 'assign-mission-team',
        materials: { food: 6, fuel: 6, hardware: 0 },
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
            stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
          },
        ],
        assignments: { earl: { task: 'mission', team: 1 } },
      }),
    );

  it('lists the rolls chosen, sets their price aside, and says what is under way', async () => {
    const user = open(going());
    openPanel('inventory');

    expect(screen.getByText(/The trader’s list has 2 rolls/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Trader’s list, first d10'), '3');
    await user.selectOptions(screen.getByLabelText('Trader’s list, second d10'), '1');
    expect(screen.getByText('standard riot shield, 10')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Set aside'), '4');
    await user.click(screen.getByRole('button', { name: 'Add to the list' }));

    const list = screen.getByRole('list', { name: 'Items to trade for' });
    expect(
      within(list).getByText(/1\. standard riot shield · 4 Food and 6 Fuel/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Make the trade' }));

    const underWay = screen.getByRole('region', { name: 'Rare Items trade under way' });
    expect(within(underWay).getByText(/4 Food and 6 Fuel set aside/)).toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Made a Rare Items trade for standard riot shield, setting aside 4 Food and 6 Fuel. The next mission is the Rare Goods Trader.',
    );
  });

  it('takes a roll back off the list, and says why it cannot be made', async () => {
    const user = open(going());
    openPanel('inventory');

    await user.selectOptions(screen.getByLabelText('Trader’s list, first d10'), '3');
    await user.selectOptions(screen.getByLabelText('Trader’s list, second d10'), '1');
    await user.click(screen.getByRole('button', { name: 'Add to the list' }));
    expect(screen.getByText(/It sets aside 10 Fuel, but the base has 6\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make the trade' })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Take standard riot shield off the list' }),
    );
    expect(screen.queryByRole('list', { name: 'Items to trade for' })).toBeNull();
  });
});

/** The vehicles the community holds, in the Inventory's modal (R62, R67; Z5-11). */
describe('vehicles in the Inventory', () => {
  const pickup = { id: 'pickup', tier: 2, label: 'Red pickup', water: false } as const;
  const rack = { id: 'rack', item: 'car-roof-rack', grade: 'standard' } as const;

  it('counts them on the card, and lists each with its slots', () => {
    open(
      playing({
        vehicles: [
          pickup,
          { id: 'bus', tier: 4, label: 'School bus', water: true, inventorySlots: 12 },
        ],
      }),
    );

    expect(card().getByText(/vehicle/).textContent).toBe('2 vehicles');
    openPanel('inventory');

    const vehicles = screen.getByRole('region', { name: 'Vehicles' });
    expect(
      within(vehicles).getByText(/Tier 2 · 6 Inventory, 4 Passenger Slots/),
    ).toBeInTheDocument();
    expect(
      within(vehicles).getByText(/Tier 4 boat · 12 Inventory, 8 Passenger Slots/),
    ).toBeInTheDocument();
  });

  it('fits a vehicle upgrade at Planning, and says when it waits for it', async () => {
    const user = open(withPlanningBegun(playing({ inventory: [rack], vehicles: [pickup] })));
    openPanel('inventory');

    await user.click(screen.getByRole('button', { name: 'Fit the car roof rack to Red pickup' }));

    const vehicles = screen.getByRole('region', { name: 'Vehicles' });
    expect(within(vehicles).getByText(/· car roof rack/)).toBeInTheDocument();
    expect(campaignLog().textContent).toContain(
      'Fitted standard car roof rack to Red pickup, for good.',
    );
  });

  it('says a fitting waits for the Planning Phase', () => {
    open(playing({ step: 'heal-wounds', inventory: [rack], vehicles: [pickup] }));
    openPanel('inventory');

    expect(
      screen.getByRole('button', { name: 'Fit the car roof rack to Red pickup' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/fitted in the Planning Phase, to a vehicle with none/),
    ).toBeInTheDocument();
  });

  it('adds a vehicle by hand, and takes it out', async () => {
    const user = open(playing());
    openPanel('inventory');

    expect(screen.getByText('No vehicles yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add the vehicle' })).toBeDisabled();
    await user.type(screen.getByLabelText('New vehicle: name'), 'Skiff');
    await user.click(screen.getByLabelText('New vehicle is a boat'));
    await user.click(screen.getByRole('button', { name: 'Add the vehicle' }));

    expect(screen.getByText(/Tier 1 boat · 2 Inventory, 2 Passenger Slots/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take Skiff out' }));
    expect(screen.getByText('No vehicles yet.')).toBeInTheDocument();
    expect(campaignLog().textContent).toContain('Added Skiff, a Tier 1 boat, by hand.');
  });
});
