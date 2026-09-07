import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BASES, BASE_IDS } from '../data/bases';
import { createNewCampaign } from '../engine/campaign';
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
      const campaign = { ...createNewCampaign('Cedar Hollow'), base: { id, slots: {} } };
      const { unmount } = render(
        <CampaignProvider>
          <BaseSlotMap campaign={campaign} />
        </CampaignProvider>,
      );
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

describe('building into a slot', () => {
  /** Opens a campaign with a base claimed and Labor entered. */
  async function readyToBuild(labor = '5', hardware?: string) {
    const user = await openCampaign();
    await claim(user, 'Small Town Home — Tier 1');
    await user.clear(screen.getByLabelText(/labor available/i));
    await user.type(screen.getByLabelText(/labor available/i), labor);

    if (hardware !== undefined) {
      await user.clear(screen.getByLabelText(/^hardware$/i));
      await user.type(screen.getByLabelText(/^hardware$/i), hardware);
    }

    return user;
  }

  const garage = () => screen.getByRole('button', { name: /build in garage/i });

  it('offers a build only on the slots that are empty', async () => {
    await readyToBuild();

    // The garage and the front yard are empty; the kitchen and two bunk rooms
    // are built in and offer nothing.
    expect(screen.getAllByRole('button', { name: /^build in /i })).toHaveLength(2);
  });

  it('shows the cost before the button rather than after it', async () => {
    const user = await readyToBuild();
    await user.click(garage());

    // A Bunk Room is the first facility offered: 3 Hardware, 2 Labor.
    expect(screen.getByText(/3 Hardware · 2 Labor/i)).toBeInTheDocument();
  });

  it('opens one card at a time', async () => {
    const user = await readyToBuild();
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /build in front yard/i }));

    expect(screen.getAllByLabelText(/^facility$/i)).toHaveLength(1);
    expect(garage()).toHaveAttribute('aria-expanded', 'false');
  });

  it('refuses a build it cannot pay for, and offers no override for it', async () => {
    // A new campaign holds no Hardware at all.
    const user = await readyToBuild();
    await user.click(garage());

    expect(screen.getByText(/costs 3 hardware and the community has 0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build here/i })).toBeDisabled();
    expect(screen.queryByLabelText(/build it anyway/i)).not.toBeInTheDocument();
  });

  it('refuses a build for want of Labor, naming both numbers', async () => {
    const user = await readyToBuild('0');
    await user.click(garage());

    expect(screen.getByText(/costs 2 labor and 0 is available/i)).toBeInTheDocument();
  });

  it('holds a rule-breaking build behind an override, then builds it', async () => {
    const user = await readyToBuild('5', '4');
    await user.click(garage());
    await user.selectOptions(screen.getByLabelText(/^facility$/i), ['Garden']);

    // A Garden needs an outdoor slot and the garage is indoor: a rule, not
    // arithmetic, so the build is held rather than refused.
    expect(screen.getByText(/needs an outdoor slot, and this one is indoor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build here/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/build it anyway/i));
    await user.click(screen.getByRole('button', { name: /build here/i }));

    const map = slotMap();
    const cards = within(map).getAllByRole('listitem');
    // The garage is the fourth slot of the Small Town Home's layout.
    expect(cards[3]).toHaveTextContent('Garden');
    // And it keeps reporting the violation for as long as it stands, because
    // the override was never stored.
    expect(within(map).queryByRole('button', { name: /build in garage/i })).not.toBeInTheDocument();
  });

  it('spends the Hardware the build costs', async () => {
    const user = await readyToBuild('5', '9');
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /build here/i }));

    // A Bunk Room costs 3 of the 9.
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(6);
  });

  it('closes the card once the build lands', async () => {
    const user = await readyToBuild('5', '9');
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /build here/i }));

    expect(screen.queryByLabelText(/^facility$/i)).not.toBeInTheDocument();
  });
});

describe('upgrading a facility', () => {
  async function readyToUpgrade(hardware = '9') {
    const user = await openCampaign();
    await claim(user, 'Small Town Home — Tier 1');
    await user.clear(screen.getByLabelText(/labor available/i));
    await user.type(screen.getByLabelText(/labor available/i), '5');
    await user.clear(screen.getByLabelText(/^hardware$/i));
    await user.type(screen.getByLabelText(/^hardware$/i), hardware);

    return user;
  }

  it('offers each slot the verb its state has, and not the other', async () => {
    await readyToUpgrade();

    // The Small Town Home has three built-in facilities and two empty slots.
    expect(screen.getAllByRole('button', { name: /^upgrade /i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^build in /i })).toHaveLength(2);
  });

  it('adds an upgrade to a built-in and shows it on the card', async () => {
    const user = await readyToUpgrade();
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));
    await user.selectOptions(screen.getByLabelText(/^upgrade$/i), ['Gas Range']);
    await user.click(screen.getByRole('button', { name: /add upgrade/i }));

    const map = slotMap();
    expect(within(map).getByText(/gas range — 1 of 3, room for 2 more/i)).toBeInTheDocument();
    // A Gas Range costs 2 Hardware.
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(7);
  });

  it('holds an upgrade on the turn its facility was built, behind an override', async () => {
    const user = await readyToUpgrade();

    // Build a Workshop into the garage this turn, then try to upgrade it.
    await user.click(screen.getByRole('button', { name: /build in garage/i }));
    await user.selectOptions(screen.getByLabelText(/^facility$/i), ['Workshop']);
    await user.click(screen.getByRole('button', { name: /build here/i }));

    await user.click(screen.getByRole('button', { name: /upgrade garage/i }));

    expect(screen.getByText(/went up this turn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add upgrade/i })).toBeDisabled();
    expect(screen.getByLabelText(/add it anyway/i)).toBeInTheDocument();
  });

  it('never holds a built-in on the same-turn rule', async () => {
    const user = await readyToUpgrade();
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    // The kitchen came with the base, so it was never built and the rule has
    // nothing to compare against.
    expect(screen.queryByText(/went up this turn/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add upgrade/i })).toBeEnabled();
  });

  it('offers nothing to change on a built-in the base locks', async () => {
    const user = await openCampaign();
    await claim(user, 'Summer Camp — Tier 1');
    await user.clear(screen.getByLabelText(/^hardware$/i));
    await user.type(screen.getByLabelText(/^hardware$/i), '9');
    await user.clear(screen.getByLabelText(/labor available/i));
    await user.type(screen.getByLabelText(/labor available/i), '5');

    await user.click(screen.getByRole('button', { name: /upgrade bunk room 1/i }));

    expect(screen.getByText(/takes no further upgrades/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add upgrade/i })).toBeDisabled();
  });
});
