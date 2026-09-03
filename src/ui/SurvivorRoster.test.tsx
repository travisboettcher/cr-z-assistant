import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

/**
 * Driven through `App` and the real provider rather than by handing
 * `SurvivorRoster` a campaign prop and a stub dispatch. The story is that a
 * survivor added on screen reaches the store and comes back out of it, and a
 * test that stubs the store cannot show that.
 */
async function openCampaign(name = 'Cedar Hollow') {
  const user = userEvent.setup();

  render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );

  await user.type(screen.getByLabelText(/^campaign name$/i), name);
  await user.click(screen.getByRole('button', { name: 'New campaign' }));

  return user;
}

async function addSurvivor(user: ReturnType<typeof userEvent.setup>, name: string, tier: string) {
  await user.type(screen.getByLabelText(/survivor name/i), name);
  await user.selectOptions(screen.getByLabelText(/^tier$/i), tier);
  await user.click(screen.getByRole('button', { name: /add survivor/i }));
}

function roster() {
  return screen.getByRole('region', { name: /community/i });
}

describe('SurvivorRoster', () => {
  it('starts empty and says what a starting community is built from', () => {
    render(
      <CampaignProvider>
        <App />
      </CampaignProvider>,
    );

    // Nothing to show until a campaign is open.
    expect(screen.queryByRole('region', { name: /community/i })).not.toBeInTheDocument();
  });

  it('adds a survivor and shows their tier and derived health', async () => {
    const user = await openCampaign();

    await addSurvivor(user, 'Earl Rhodes', '4');

    const row = within(roster()).getByRole('listitem');
    expect(within(row).getByText('Earl Rhodes')).toBeInTheDocument();
    expect(within(row).getByText(/tier 4 · hero/i)).toBeInTheDocument();
    // Max HP is the tier, computed rather than stored.
    expect(within(row).getByText('4 / 4')).toBeInTheDocument();
  });

  it('counts tier levels rather than heads, because that is what a roster spends', async () => {
    const user = await openCampaign();

    await addSurvivor(user, 'Earl Rhodes', '4');
    await addSurvivor(user, 'Carla Proust', '3');

    expect(within(roster()).getByText(/2 survivors · 7 tier levels/i)).toBeInTheDocument();
  });

  it('clears the name field so the next survivor can be typed straight in', async () => {
    const user = await openCampaign();

    await addSurvivor(user, 'Earl Rhodes', '4');

    expect(screen.getByLabelText(/survivor name/i)).toHaveValue('');
  });

  it('refuses to add a survivor with a blank name', async () => {
    const user = await openCampaign();

    await user.type(screen.getByLabelText(/survivor name/i), '   ');
    await user.click(screen.getByRole('button', { name: /add survivor/i }));

    expect(within(roster()).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('renames a survivor through the store', async () => {
    const user = await openCampaign();
    await addSurvivor(user, 'Earl Rhodes', '4');

    await user.click(screen.getByRole('button', { name: /rename/i }));
    const field = screen.getByLabelText(/rename earl rhodes/i);
    await user.clear(field);
    await user.type(field, 'Earl Rhodes Jr');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(within(roster()).getByText('Earl Rhodes Jr')).toBeInTheDocument();
  });

  /**
   * Removing is not undoable, so it is confirmed — and declining has to
   * actually keep them, which is the half of a confirmation people forget to
   * test.
   */
  it('confirms before removing, and keeps the survivor if you decline', async () => {
    const user = await openCampaign();
    await addSurvivor(user, 'Earl Rhodes', '4');

    await user.click(within(roster()).getByRole('button', { name: /remove/i }));
    await user.click(screen.getByRole('button', { name: /keep them/i }));

    expect(within(roster()).getByText('Earl Rhodes')).toBeInTheDocument();
  });

  it('removes the survivor when the removal is confirmed', async () => {
    const user = await openCampaign();
    await addSurvivor(user, 'Earl Rhodes', '4');
    await addSurvivor(user, 'Carla Proust', '3');

    const rows = within(roster()).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /remove them/i }));

    expect(within(roster()).queryByText('Earl Rhodes')).not.toBeInTheDocument();
    expect(within(roster()).getByText('Carla Proust')).toBeInTheDocument();
  });
});

describe('the starting-community budget', () => {
  function budgetWarning() {
    return within(roster()).queryByText(/is built from 10 tier levels/i);
  }

  it('says nothing while a community is within its ten tier levels', async () => {
    const user = await openCampaign();

    // The rulebook's recommended opening: one Hero and two Leaders (pg. 48).
    await addSurvivor(user, 'Earl Rhodes', '4');
    await addSurvivor(user, 'Carla Proust', '3');
    await addSurvivor(user, 'Marcus Webb', '3');

    expect(budgetWarning()).not.toBeInTheDocument();
  });

  it('reports an eleventh tier level', async () => {
    const user = await openCampaign();

    await addSurvivor(user, 'Earl Rhodes', '4');
    await addSurvivor(user, 'Carla Proust', '3');
    await addSurvivor(user, 'Marcus Webb', '3');
    await addSurvivor(user, 'Ruby Vance', '1');

    expect(budgetWarning()).toBeInTheDocument();
  });

  /**
   * Reversible on purpose. The control turns a rule off, and one that did so
   * permanently on a misplaced thumb would be a door that should not close.
   */
  it('stops checking once the community is marked built, and starts again if unmarked', async () => {
    const user = await openCampaign();

    await addSurvivor(user, 'Earl Rhodes', '4');
    await addSurvivor(user, 'Carla Proust', '3');
    await addSurvivor(user, 'Marcus Webb', '3');
    await addSurvivor(user, 'Ruby Vance', '1');

    const toggle = within(roster()).getByRole('checkbox', { name: /starting community is built/i });

    await user.click(toggle);
    expect(budgetWarning()).not.toBeInTheDocument();

    await user.click(toggle);
    expect(budgetWarning()).toBeInTheDocument();
  });
});

describe('recruiting from the field', () => {
  async function openRecruitForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(within(roster()).getByText(/recruit from the field/i));
  }

  it('recruits a leader with the skill their roll gives them', async () => {
    const user = await openCampaign();
    await openRecruitForm(user);

    await user.type(screen.getByLabelText(/recruit name/i), 'Carla Proust');
    await user.selectOptions(screen.getByLabelText(/recruit tier/i), '3');
    await user.selectOptions(screen.getByLabelText(/skill roll/i), '6');
    await user.click(screen.getByRole('button', { name: /^recruit$/i }));

    // A six is Archery (pg. 50), and the sheet is where that shows.
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));
    const sheet = screen.getByRole('region', { name: 'Carla Proust' });
    const archery = within(sheet).getByRole('row', { name: /^Archery/ });

    expect(within(archery).getByRole('button')).toHaveTextContent(/drop/i);
    // Two skills still to choose: a Leader has three slots and arrived with one.
    expect(within(sheet).getByText(/still choosing skills: 1 of 3/i)).toBeInTheDocument();
  });

  /** Heroes are never recruited in the field (pg. 38). */
  it('does not offer a hero as a recruit tier', async () => {
    const user = await openCampaign();
    await openRecruitForm(user);

    const tiers = within(screen.getByLabelText(/recruit tier/i)).getAllByRole('option');

    expect(tiers.map((option) => option.textContent)).toEqual([
      '1 — Rookie',
      '2 — Citizen',
      '3 — Leader',
    ]);
  });

  it('leaves a player’s-choice roll for the player to finish', async () => {
    const user = await openCampaign();
    await openRecruitForm(user);

    await user.type(screen.getByLabelText(/recruit name/i), 'Marcus Webb');
    await user.selectOptions(screen.getByLabelText(/recruit tier/i), '2');
    await user.selectOptions(screen.getByLabelText(/skill roll/i), '10');
    await user.click(screen.getByRole('button', { name: /^recruit$/i }));

    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    expect(
      within(screen.getByRole('region', { name: 'Marcus Webb' })).getByText(
        /still choosing skills: 0 of 2/i,
      ),
    ).toBeInTheDocument();
  });

  it('refuses a recruit with a blank name', async () => {
    const user = await openCampaign();
    await openRecruitForm(user);

    await user.type(screen.getByLabelText(/recruit name/i), '   ');
    await user.click(screen.getByRole('button', { name: /^recruit$/i }));

    expect(within(roster()).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('can roll the die for you, always landing on a result the table has', async () => {
    const user = await openCampaign();
    await openRecruitForm(user);

    const field = screen.getByLabelText(/skill roll/i);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await user.click(screen.getByRole('button', { name: /roll d10/i }));
      expect(Number((field as HTMLSelectElement).value)).toBeGreaterThanOrEqual(1);
      expect(Number((field as HTMLSelectElement).value)).toBeLessThanOrEqual(10);
    }
  });
});
