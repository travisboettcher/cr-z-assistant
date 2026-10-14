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

    // Two slots for a Tier 2, two more for the pack; the heavy weapon fills one.
    expect(screen.getByText('1 / 4', { selector: 'p.text-2xl' })).toBeInTheDocument();
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
