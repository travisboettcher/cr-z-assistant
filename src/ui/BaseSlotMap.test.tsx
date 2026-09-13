import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BASES, BASE_IDS } from '../data/bases';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { generatingUtilities, projectTeamWorth } from '../test/campaigns';
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

/**
 * Opens the app on a campaign that already exists.
 *
 * Claiming a base is still driven by clicking, because that is a journey worth
 * testing. What is arranged rather than clicked is the *community*: since Z3-5
 * the Labor pool is the summed Tier levels of the project team and the utility
 * pool comes from somebody working a Station, so a test about a build cost
 * would otherwise spend five survivors' worth of typing before its first
 * assertion — and did, until the suite started timing out.
 *
 * The assignment controls themselves are driven by clicking, in the two tests
 * that are about them.
 */
function openWith(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const slotMap = () =>
  screen.getByRole('region', { name: /hobby farm|small town home|distillery|greasy spoon/i });

/** The slot cards, which are no longer the only list inside the map. */
const slots = () => screen.getByRole('list', { name: /facility slots/i });

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
  /** A claimed Small Town Home, with a project team and Hardware to spend. */
  function readyToBuild(labor = 5, hardware = 0) {
    return openWith({
      ...createNewCampaign('Cedar Hollow'),
      materials: { food: 0, fuel: 0, hardware, rare: 0 },
      base: { id: 'small-town-home', slots: {} },
      ...projectTeamWorth(labor),
    });
  }

  const garage = () => screen.getByRole('button', { name: /build in garage/i });

  it('offers a build only on the slots that are empty', async () => {
    readyToBuild();

    // The garage and the front yard are empty; the kitchen and two bunk rooms
    // are built in and offer nothing.
    expect(screen.getAllByRole('button', { name: /^build in /i })).toHaveLength(2);
  });

  it('shows the cost before the button rather than after it', async () => {
    const user = readyToBuild();
    await user.click(garage());

    // A Bunk Room is the first facility offered: 3 Hardware, 2 Labor.
    expect(screen.getByText(/3 Hardware · 2 Labor/i)).toBeInTheDocument();
  });

  it('opens one card at a time', async () => {
    const user = readyToBuild();
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /build in front yard/i }));

    expect(screen.getAllByLabelText(/^facility$/i)).toHaveLength(1);
    expect(garage()).toHaveAttribute('aria-expanded', 'false');
  });

  it('refuses a build it cannot pay for, and offers no override for it', async () => {
    // A new campaign holds no Hardware at all.
    const user = readyToBuild();
    await user.click(garage());

    expect(screen.getByText(/costs 3 hardware and the community has 0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the build/i })).toBeDisabled();
    expect(screen.queryByLabelText(/order it anyway/i)).not.toBeInTheDocument();
  });

  it('refuses a build for want of Labor, naming both numbers', async () => {
    const user = readyToBuild(0);
    await user.click(garage());

    expect(screen.getByText(/costs 2 labor and 0 is available/i)).toBeInTheDocument();
  });

  it('holds a rule-breaking build behind an override, then orders it', async () => {
    const user = readyToBuild(5, 4);
    await user.click(garage());
    await user.selectOptions(screen.getByLabelText(/^facility$/i), ['Garden']);

    // A Garden needs an outdoor slot and the garage is indoor: a rule, not
    // arithmetic, so the order is held rather than refused.
    expect(screen.getByText(/needs an outdoor slot, and this one is indoor/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the build/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/order it anyway/i));
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    const cards = within(slots()).getAllByRole('listitem');
    // The garage is the fourth slot of the Small Town Home's layout.
    expect(cards[3]).toHaveTextContent(/on order: garden in the garage/i);
  });

  /**
   * The queue is what building became, and the card is where a player sees it:
   * the slot is still empty, still offers the verb, and now says what is coming.
   */
  it('leaves the slot empty and buildable, with the order named on the card', async () => {
    const user = readyToBuild(5, 9);
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    // The garage is the fourth slot of the Small Town Home's layout, and the
    // assertion is scoped to it: the fifth is empty too.
    const card = within(slots()).getAllByRole('listitem')[3];
    expect(card).toBeDefined();
    expect(within(card as HTMLElement).getByText(/on order: bunk room/i)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/empty — ready to build in/i)).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByRole('button', { name: /build in garage/i }),
    ).toBeInTheDocument();
  });

  it('takes the order back, and its Hardware with it', async () => {
    const user = readyToBuild(5, 9);
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(6);

    await user.click(screen.getByRole('button', { name: /cancel bunk room in the garage/i }));

    expect(screen.queryByText(/on order:/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(9);
  });

  /** Labor is committed rather than spent, and the pool above says so. */
  it('lowers the Labor available by what the order committed', async () => {
    const user = readyToBuild(5, 9);

    expect(screen.getByText(/labor available:/i).parentElement).toHaveTextContent('5');

    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    // A Bunk Room costs 2 Labor.
    expect(screen.getByText(/labor available:/i).parentElement).toHaveTextContent('3');
  });

  it('spends the Hardware the order costs', async () => {
    const user = readyToBuild(5, 9);
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    // A Bunk Room costs 3 of the 9.
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(6);
  });

  it('closes the card once the order lands', async () => {
    const user = readyToBuild(5, 9);
    await user.click(garage());
    await user.click(screen.getByRole('button', { name: /order the build/i }));

    expect(screen.queryByLabelText(/^facility$/i)).not.toBeInTheDocument();
  });
});

describe('upgrading a facility', () => {
  function readyToUpgrade(hardware = 9) {
    return openWith({
      ...createNewCampaign('Cedar Hollow'),
      materials: { food: 0, fuel: 0, hardware, rare: 0 },
      base: { id: 'small-town-home', slots: {} },
      ...projectTeamWorth(5),
    });
  }

  it('offers each slot the verb its state has, and not the other', async () => {
    readyToUpgrade();

    // The Small Town Home has three built-in facilities and two empty slots.
    expect(screen.getAllByRole('button', { name: /^upgrade /i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^build in /i })).toHaveLength(2);
  });

  it('puts an upgrade on order against a built-in, named on the card', async () => {
    const user = readyToUpgrade();
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));
    await user.selectOptions(screen.getByLabelText(/^upgrade$/i), ['Gas Range']);
    await user.click(screen.getByRole('button', { name: /order the upgrade/i }));

    // The kitchen is the third slot of the layout; the two bunk rooms above it
    // have room for three upgrades apiece.
    const card = within(slots()).getAllByRole('listitem')[2];
    expect(card).toBeDefined();
    expect(
      within(card as HTMLElement).getByText(/on order: gas range on the kitchen/i),
    ).toBeInTheDocument();
    // Not installed: the Kitchen still has all three of its slots free.
    expect(within(card as HTMLElement).getByText(/room for 3 upgrades/i)).toBeInTheDocument();
    // A Gas Range costs 2 Hardware, spent when the order is placed.
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(7);
  });

  /**
   * The same-turn rule is still reachable, because a project finishes in the
   * Advancement Phase and the Planning Phase comes after it in the same turn.
   */
  it('holds an upgrade on the turn its facility was built, behind an override', async () => {
    const user = openWith({
      ...createNewCampaign('Cedar Hollow'),
      materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 } } },
      },
      ...projectTeamWorth(5),
    });

    await user.click(screen.getByRole('button', { name: /upgrade garage/i }));

    expect(screen.getByText(/went up this turn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the upgrade/i })).toBeDisabled();
    expect(screen.getByLabelText(/order it anyway/i)).toBeInTheDocument();
  });

  it('never holds a built-in on the same-turn rule', async () => {
    const user = readyToUpgrade();
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    // The kitchen came with the base, so it was never built and the rule has
    // nothing to compare against.
    expect(screen.queryByText(/went up this turn/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the upgrade/i })).toBeEnabled();
  });

  it('offers nothing to change on a built-in the base locks', async () => {
    const user = openWith({
      ...createNewCampaign('Cedar Hollow'),
      materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
      base: { id: 'summer-camp', slots: {} },
      ...projectTeamWorth(5),
    });

    await user.click(screen.getByRole('button', { name: /upgrade bunk room 1/i }));

    expect(screen.getByText(/takes no further upgrades/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the upgrade/i })).toBeDisabled();
  });
});

describe('clearing a slot', () => {
  function readyToClear(labor = 5) {
    return openWith({
      ...createNewCampaign('Cedar Hollow'),
      base: { id: 'hobby-farm', slots: {} },
      ...projectTeamWorth(labor),
    });
  }

  const coop = () => screen.getByRole('button', { name: /clear ruined chicken coop/i });

  it('offers a clear only on the blocked slot', async () => {
    readyToClear();

    expect(screen.getAllByRole('button', { name: /^clear /i })).toHaveLength(1);
  });

  it('shows the cost in the form and the yield on the card, each once', async () => {
    const user = readyToClear();

    // The yield is on the card before anything is opened, because it is what a
    // player weighs when deciding where to spend Labor.
    expect(screen.getByText(/2 labor to clear, and yields 2 hardware/i)).toBeInTheDocument();

    await user.click(coop());

    expect(screen.getByText(/0 Hardware · 2 Labor/i)).toBeInTheDocument();
    // And not repeated inside the form.
    expect(screen.getAllByText(/yields 2 hardware/i)).toHaveLength(1);
  });

  it('refuses for want of Labor, and offers no override for it', async () => {
    const user = readyToClear(1);
    await user.click(coop());

    expect(screen.getByText(/costs 2 labor and 1 is available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /order the clearing/i })).toBeDisabled();
    // Nothing about clearing is a rule a table plays differently.
    expect(screen.queryByLabelText(/anyway/i)).not.toBeInTheDocument();
  });

  /**
   * The one place the timing visibly matters: the rubble is not cleared until
   * the work is done, so the two Hardware in it are not in the stores yet.
   */
  it('puts the clearing on order, changing neither the slot nor the stores', async () => {
    const user = readyToClear();
    await user.click(coop());
    await user.click(screen.getByRole('button', { name: /order the clearing/i }));

    const map = screen.getByRole('region', { name: 'Hobby Farm' });
    expect(
      within(map).getByText(/on order: clearing the ruined chicken coop/i),
    ).toBeInTheDocument();
    expect(within(map).queryByText(/cleared — ready to build in/i)).not.toBeInTheDocument();
    expect(
      within(map).getByRole('button', { name: /clear ruined chicken coop/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(0);
  });

  it('says what it cannot give back, rather than dropping it quietly', async () => {
    const user = await openCampaign();
    await claim(user, 'Outdoor Sports Shop — Tier 2');

    expect(screen.getByText(/4 standard weapons this version cannot track/i)).toBeInTheDocument();
  });
});

describe('assigning Power and Water', () => {
  /** A claimed Small Town Home whose staffed Station generates `score`. */
  function readyToSupply(score = 2) {
    return openWith(
      generatingUtilities(
        { ...createNewCampaign('Cedar Hollow'), base: { id: 'small-town-home', slots: {} } },
        score,
      ),
    );
  }

  const openKitchen = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));
  };

  it('shows what each pool generates and what the Score is covering', () => {
    readyToSupply();

    expect(screen.getByRole('definition', { name: /power assigned/i })).toHaveTextContent(
      '0 / 0 flat',
    );
    expect(screen.getByRole('definition', { name: /score spent/i })).toHaveTextContent('0 / 2');
  });

  it('assigns a point, and the readout follows it', async () => {
    const user = readyToSupply();
    await openKitchen(user);
    await user.click(screen.getByRole('checkbox', { name: /water/i }));

    expect(screen.getByRole('definition', { name: /water assigned/i })).toHaveTextContent(
      '1 / 0 flat',
    );
    expect(screen.getByRole('definition', { name: /score spent/i })).toHaveTextContent('1 / 2');
    // And the card says so with the form closed.
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(within(slotMap()).getByText(/supplied with water/i)).toBeInTheDocument();
  });

  it('warns rather than refuses when nothing in the slot uses the point', async () => {
    const user = readyToSupply();
    await user.click(screen.getByRole('button', { name: /upgrade bunk room 1/i }));

    // A Bunk Room needs neither utility: pointless, legal, and not refused.
    expect(screen.getAllByText(/nothing here uses it/i)).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: /power/i })).toBeEnabled();
  });

  it('refuses a point the base cannot generate, and says how short it is', async () => {
    const user = readyToSupply(0);
    await openKitchen(user);

    expect(screen.getAllByText(/needs 1 more than this base generates/i)).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: /water/i })).toBeDisabled();
  });

  it('lets a point go back even when the Score no longer covers it', async () => {
    const user = readyToSupply(1);
    await openKitchen(user);
    await user.click(screen.getByRole('checkbox', { name: /water/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Take the Station's worker off it, as a Planning Phase re-assignment
    // would: the Score drops below what is already assigned, and the point must
    // still be removable or the base is stranded.
    await user.click(screen.getByRole('button', { name: /upgrade front yard/i }));
    await user.click(
      within(screen.getByRole('group', { name: /working here/i })).getByRole('checkbox'),
    );
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await openKitchen(user);
    const water = screen.getByRole('checkbox', { name: /water/i });
    expect(water).toBeChecked();
    expect(water).toBeEnabled();

    await user.click(water);
    expect(screen.getByRole('checkbox', { name: /water/i })).not.toBeChecked();
  });
});

describe('the base sheet', () => {
  async function claimed() {
    const user = await openCampaign();
    await claim(user, 'Greasy Spoon — Tier 1');
    return user;
  }

  it('totals what the paper worksheet makes you total', async () => {
    await claimed();

    // The Greasy Spoon ships a Bunk Room with an Extra Bed: three beds.
    expect(screen.getByRole('definition', { name: /beds/i })).toHaveTextContent('3');
  });

  it('shows storage against the cap, and says when it is over', async () => {
    const user = await claimed();

    // Tier 1 plus its built-in Storage Area is 6 for each material.
    expect(screen.getByRole('definition', { name: /food stored/i })).toHaveTextContent('0 / 6');

    await user.clear(screen.getByLabelText(/^food$/i));
    await user.type(screen.getByLabelText(/^food$/i), '9');

    expect(screen.getByText(/over the cap/i)).toBeInTheDocument();
  });

  it('follows a utility onto the Food cap, which is the roster’s own 6(8)', async () => {
    // Its Refrigeration needs Power. That is the parenthetical the book prints.
    const user = openWith(
      generatingUtilities(
        { ...createNewCampaign('Cedar Hollow'), base: { id: 'greasy-spoon', slots: {} } },
        1,
        'parking-lot-1',
      ),
    );

    await user.click(screen.getByRole('button', { name: /upgrade storage area/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Power' }));

    expect(screen.getByRole('definition', { name: /food stored/i })).toHaveTextContent('0 / 8');
  });

  it('counts Heroes against what the base allows', async () => {
    const user = await claimed();

    expect(screen.getByRole('definition', { name: /heroes/i })).toHaveTextContent('0 / 1');

    await user.type(screen.getByLabelText(/survivor name/i), 'Earl');
    await user.selectOptions(screen.getByLabelText(/^tier$/i), '4');
    await user.click(screen.getByRole('button', { name: /add survivor/i }));

    expect(screen.getByRole('definition', { name: /heroes/i })).toHaveTextContent('1 / 1');
  });
});

describe('staffing a facility', () => {
  it('changes what it produces, and is written down rather than previewed', async () => {
    const user = await openCampaign();

    await user.type(screen.getByLabelText(/survivor name/i), 'Carla');
    await user.selectOptions(screen.getByLabelText(/^tier$/i), '2');
    await user.click(screen.getByRole('button', { name: /add survivor/i }));

    await claim(user, 'Small Town Home — Tier 1');
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    // Nobody assigned yet.
    expect(screen.getByText(/needs someone assigned/i)).toBeInTheDocument();

    const working = within(screen.getByRole('group', { name: /working here/i }));
    await user.click(working.getByRole('checkbox', { name: /carla/i }));

    // A Citizen with no Rationing has no Rationing Score at all — which the
    // sheet says rather than showing a zero.
    expect(screen.getByText(/they do not have the skill/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs someone assigned/i)).not.toBeInTheDocument();
  });

  it('takes a survivor off whatever they were doing, and says so first', async () => {
    // Already on the project team, which since Z3-6 is assigned in the
    // Planning Phase rather than here — the base screen reads the Labor and
    // points at the step that sets it.
    const carla = createSurvivor('Carla Proust', 2, { id: 'carla' });
    const user = openWith({
      ...createNewCampaign('Cedar Hollow'),
      base: { id: 'small-town-home', slots: {} },
      survivors: [carla],
      assignments: { carla: { task: 'project' } },
    });

    expect(screen.getByText('Labor available:').parentElement).toHaveTextContent('2');

    // One task per survivor (pg. 20): staffing the Kitchen takes her off the
    // project team, and the row said what she was doing before the click.
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));
    const working = within(screen.getByRole('group', { name: /working here/i }));
    expect(working.getByText(/currently on the project team/i)).toBeInTheDocument();

    await user.click(working.getByRole('checkbox', { name: /carla/i }));
    expect(screen.getByText('Labor available:').parentElement).toHaveTextContent('0');
  });

  it('offers nobody to a facility that nobody works', async () => {
    const user = await openCampaign();
    await claim(user, 'Small Town Home — Tier 1');
    await user.click(screen.getByRole('button', { name: /upgrade bunk room 1/i }));

    // A Bunk Room is passive: beds, and nothing to staff.
    expect(screen.queryByRole('group', { name: /working here/i })).not.toBeInTheDocument();
  });
});

/**
 * Playtest finding M12: the base screen's staffing control is visible in every
 * phase, and staffing assigned before the turn reaches Planning is wiped by the
 * planning reset — silently. The build controls on the same card have always
 * said which step they belong to; this one said nothing.
 */
describe('staffing from the base screen', () => {
  const atStep = (step: Campaign['step']): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    turn: 2,
    step,
    survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
    base: { id: 'small-town-home', slots: {} },
  });

  it('says when the assignment will be thrown away', async () => {
    const user = openWith(atStep('character-advancement'));
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    expect(screen.getByText(/staff are assigned in assign facility staff/i)).toBeInTheDocument();
    expect(screen.getByText(/cleared when the planning phase begins/i)).toBeInTheDocument();
  });

  it('says nothing on the step staffing belongs to', async () => {
    const user = openWith(atStep('assign-facility-staff'));
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    expect(screen.queryByText(/staff are assigned in/i)).not.toBeInTheDocument();
  });

  /** The control itself stays: Z3-6 guides rather than refuses. */
  it('still lets the assignment be made', async () => {
    const user = openWith(atStep('character-advancement'));
    await user.click(screen.getByRole('button', { name: /upgrade kitchen/i }));

    const working = screen.getByRole('group', { name: /working here/i });
    expect(within(working).getByRole('checkbox', { name: /earl/i })).toBeEnabled();
  });
});
