import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
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
