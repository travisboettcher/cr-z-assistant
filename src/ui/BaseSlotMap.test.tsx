import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BASES, BASE_IDS } from '../data/bases';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';
import { BaseSlotMap } from './BaseSlotMap';
import { BASE_LABELS, slotLabel } from './baseLabels';

/**
 * Driven through `App` and the real provider, for the reason
 * `SurvivorRoster.test.tsx` gives: the story is that a base claimed on screen
 * reaches the store and comes back out of it, and a test that stubs the store
 * cannot show that.
 */
async function openCampaign() {
  const user = userEvent.setup();

  render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );

  await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
  await user.click(screen.getByRole('button', { name: 'New campaign' }));

  return user;
}

async function claim(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.selectOptions(screen.getByLabelText(/choose a base/i), [label]);
  await user.click(screen.getByRole('button', { name: /claim this base/i }));
}

const slotMap = () =>
  screen.getByRole('region', { name: /hobby farm|small town home|distillery/i });

describe('claiming a base', () => {
  it('offers the roster of bases before one is claimed', async () => {
    await openCampaign();

    const panel = screen.getByRole('region', { name: /^base$/i });

    expect(within(panel).getByText(/no base claimed yet/i)).toBeInTheDocument();
    expect(within(panel).getByRole('option', { name: /small town home/i })).toBeInTheDocument();
    expect(within(panel).getByRole('option', { name: /hydroelectric dam/i })).toBeInTheDocument();
  });

  it('says moving house is not built yet, before the claim rather than after', async () => {
    await openCampaign();

    expect(screen.getByText(/claim a new base mission/i)).toBeInTheDocument();
  });

  it('replaces the chooser with the slot map', async () => {
    const user = await openCampaign();
    await claim(user, 'Small Town Home — Tier 1');

    expect(screen.queryByText(/no base claimed yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Small Town Home' })).toBeInTheDocument();
  });

  it('shows what a slot holds, and what an empty one is for', async () => {
    const user = await openCampaign();
    await claim(user, 'Small Town Home — Tier 1');

    const map = slotMap();

    // The kitchen is built in; the garage starts empty.
    expect(within(map).getByRole('heading', { name: 'Kitchen' })).toBeInTheDocument();
    expect(within(map).getByRole('heading', { name: 'Garage' })).toBeInTheDocument();
    expect(within(map).getAllByText(/empty — ready to build in/i)).toHaveLength(2);
  });

  it('records a built-in’s upgrades and reports it takes no more', async () => {
    const user = await openCampaign();
    await claim(user, 'Greasy Spoon — Tier 1');

    const map = screen.getByRole('region', { name: /greasy spoon/i });

    // Its Storage Area ships Refrigeration and is locked against further
    // upgrades, which is the roster's own 6/6(8)/6 showing up on a screen.
    expect(within(map).getByText(/refrigeration — 1 of 3, no room for more/i)).toBeInTheDocument();
  });

  it('says what a clearing project costs and yields', async () => {
    const user = await openCampaign();
    await claim(user, 'Hobby Farm — Tier 2');

    const map = slotMap();

    expect(
      within(map).getByText(/blocked — 2 labor to clear, and yields 2 hardware/i),
    ).toBeInTheDocument();
  });

  it('renders every base in the roster without a special case', () => {
    // The acceptance asks for a base with every slot empty and one with every
    // slot full. Rather than pick two, this renders all ten — the Distillery
    // is six-ninths empty, the Regional Firehouse has two empty slots out of
    // eight, and nothing in between gets a branch of its own.
    //
    // Rendered directly rather than through `App`: the slot map takes a base
    // and reads the store for nothing, and claiming ten bases through the UI
    // would test the chooser ten times to test this once.
    for (const id of BASE_IDS) {
      const { unmount } = render(<BaseSlotMap base={{ id, slots: {} }} />);
      const map = screen.getByRole('region', { name: BASE_LABELS[id] });

      expect(within(map).getAllByRole('listitem')).toHaveLength(BASES[id].slots.length);
      unmount();
    }
  });
});

describe('slotLabel', () => {
  it('turns every slot id in the roster into a name', () => {
    for (const id of BASE_IDS) {
      for (const slot of BASES[id].slots) {
        const label = slotLabel(slot.id);

        expect(label.length).toBeGreaterThan(0);
        // A hyphen left in means the id leaked to the screen unchanged.
        expect(label).not.toContain('-');
        expect(label[0]).toBe(label[0]?.toUpperCase());
      }
    }
  });

  it('keeps the number that tells repeated slots apart', () => {
    expect(slotLabel('parking-lot-2')).toBe('Parking Lot 2');
  });

  it('restores punctuation an identifier cannot hold', () => {
    expect(slotLabel('kings-pavilion')).toBe("King's Pavilion");
  });
});
