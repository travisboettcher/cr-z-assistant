import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

/**
 * Driven through the real app and store, like the roster's tests: the story is
 * that a survivor's sheet shows correct numbers for the survivor actually in
 * the campaign, and a component handed a hand-built prop cannot show that.
 *
 * The numbers asserted here are the rulebook's own worked characters (pg.
 * 48-50), so the sheet is checked against the book rather than against itself.
 */
async function openSheetFor(name: string, tier: string) {
  const user = userEvent.setup();

  render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );

  await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
  await user.click(screen.getByRole('button', { name: 'New campaign' }));

  await user.type(screen.getByLabelText(/survivor name/i), name);
  await user.selectOptions(screen.getByLabelText(/^tier$/i), tier);
  await user.click(screen.getByRole('button', { name: /add survivor/i }));
  await user.click(screen.getByRole('button', { name: /^sheet$/i }));

  return { user, sheet: screen.getByRole('region', { name }) };
}

/** The row for one skill inside the sheet, found by its name. */
function skillRow(sheet: HTMLElement, label: string) {
  return within(sheet).getByRole('row', { name: new RegExp(`^${label}\\b`) });
}

describe('SurvivorSheet', () => {
  it('shows the tier, and the health and item slots derived from it', async () => {
    const { sheet } = await openSheetFor('Earl Rhodes', '4');

    expect(within(sheet).getByText(/tier 4 · hero/i)).toBeInTheDocument();
    expect(within(sheet).getByText('4 / 4')).toBeInTheDocument();
    // No Carry skill yet, so item slots are the bare tier.
    expect(within(sheet).getByText('4', { selector: 'p.text-2xl' })).toBeInTheDocument();
  });

  /**
   * Grouping is not decoration: a skill listed under the wrong stat would have
   * its Score computed from the wrong number, and the sheet would look
   * perfectly reasonable while being wrong. So this checks each group's exact
   * membership rather than just that twenty rows exist somewhere.
   */
  it('lists all twenty skills, five under each governing stat', async () => {
    const { sheet } = await openSheetFor('Earl Rhodes', '4');

    const groups: Record<string, readonly string[]> = {
      Strength: ['Blunt Weapon', 'Blade Weapon', 'Heavy Weapon', 'Carry', 'Break'],
      Dexterity: ['Handguns', 'Long Guns', 'Archery', 'Stealth', 'Enter'],
      Intelligence: ['Scavenge', 'Scout', 'Tactics', 'Tinker', 'Traps'],
      Cooperation: ['Medicine', 'Rationing', 'Mechanics', 'Teaching', 'Utilities'],
    };

    for (const [stat, skills] of Object.entries(groups)) {
      const group = within(sheet).getByRole('heading', { level: 4, name: stat }).parentElement;
      expect(group, `no group for ${stat}`).not.toBeNull();

      // Row zero is the header row.
      const rows = within(group!)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getByRole('rowheader').textContent);

      expect(rows).toEqual(skills);
    }
  });

  /**
   * The sheet's single most important detail, and the visible consequence of
   * `skillScore` returning null. A fresh Tier 4 has Strength 3 and no Blade
   * Weapon skill; a "3" in that row is a number somebody could roll against
   * for a check they cannot make.
   */
  it('shows a dash, not a number, for a skill the survivor does not have', async () => {
    const { sheet } = await openSheetFor('Earl Rhodes', '4');

    const row = skillRow(sheet, 'Blade Weapon');

    expect(within(row).getAllByText('—')).toHaveLength(2);
    expect(within(row).getAllByText('not learned')).toHaveLength(2);
    // Asserted as the absence of any number, not merely the presence of a dash.
    expect(row.textContent).not.toMatch(/\d/);
  });

  it('shows move and defense as scores, away from the twenty governed skills', async () => {
    const { sheet } = await openSheetFor('Earl Rhodes', '4');

    const common = within(sheet).getByText(/common skills/i).parentElement;
    expect(common).not.toBeNull();
    expect(within(common!).getByText('Move')).toBeInTheDocument();
    expect(within(common!).getAllByText('6')).toHaveLength(2);

    // Neither appears among the governed skills, where a Level column would
    // imply they have one.
    expect(within(sheet).queryByRole('row', { name: /^Move\b/ })).not.toBeInTheDocument();
  });

  it('records a wound through the store', async () => {
    const { user, sheet } = await openSheetFor('Earl Rhodes', '4');

    await user.click(within(sheet).getByRole('button', { name: /^set$/i }));
    const field = screen.getByLabelText(/current health for earl rhodes/i);
    await user.clear(field);
    await user.type(field, '1');
    await user.click(screen.getByRole('button', { name: /save health/i }));

    expect(within(sheet).getByText('1 / 4')).toBeInTheDocument();
    // The roster reads the same fact, because both compute from one survivor.
    expect(
      within(screen.getByRole('region', { name: /community/i })).getByText('1 / 4'),
    ).toBeInTheDocument();
  });

  it('closes on request', async () => {
    const { user } = await openSheetFor('Earl Rhodes', '4');

    await user.click(screen.getByRole('button', { name: /close sheet/i }));

    expect(screen.queryByRole('region', { name: 'Earl Rhodes' })).not.toBeInTheDocument();
  });

  /**
   * The dangling-selection case. Removing the survivor whose sheet is open
   * leaves the held id pointing at nobody, and the sheet has to disappear
   * rather than render an empty shell.
   */
  it('closes itself when the survivor whose sheet is open is removed', async () => {
    const { user } = await openSheetFor('Earl Rhodes', '4');

    const roster = screen.getByRole('region', { name: /community/i });
    await user.click(within(roster).getByRole('button', { name: /^remove$/i }));
    await user.click(screen.getByRole('button', { name: /remove them/i }));

    expect(screen.queryByRole('region', { name: 'Earl Rhodes' })).not.toBeInTheDocument();
  });
});

/**
 * Building a survivor. Skills start at level zero (pg. 41), so creation is
 * choosing *which* skills and how the tier's stat values are arranged — levels
 * come only from experience, which is a later story.
 */
describe('SurvivorSheet editing', () => {
  /** The Take/Drop control in one skill's row. */
  function toggle(sheet: HTMLElement, label: string) {
    return within(skillRow(sheet, label)).getByRole('button');
  }

  it('swaps stat values rather than overwriting them', async () => {
    const { user, sheet } = await openSheetFor('Earl Rhodes', '4');

    // A fresh Tier 4 is 4/3/2/1 laid out in stat order, so Strength holds 4 and
    // Cooperation holds 1. Moving the 4 onto Cooperation must send the 1 back.
    await user.selectOptions(within(sheet).getByLabelText(/^cooperation$/i), '4');

    expect(within(sheet).getByLabelText(/^cooperation$/i)).toHaveValue('4');
    expect(within(sheet).getByLabelText(/^strength$/i)).toHaveValue('1');
  });

  it('never lets a swap produce an illegal stat array', async () => {
    const { user, sheet } = await openSheetFor('Earl Rhodes', '4');

    await user.selectOptions(within(sheet).getByLabelText(/^cooperation$/i), '4');
    await user.selectOptions(within(sheet).getByLabelText(/^dexterity$/i), '4');
    await user.selectOptions(within(sheet).getByLabelText(/^strength$/i), '3');

    // Whatever the arrangement, the collection is still the tier's own, so the
    // only violation left is the unfinished build.
    expect(within(sheet).queryByText(/are not the/i)).not.toBeInTheDocument();
  });

  it('takes a skill when there is a slot free', async () => {
    const { user, sheet } = await openSheetFor('Ruby Vance', '2');

    await user.click(toggle(sheet, 'Archery'));

    // Dexterity 1 at tier 2, skill at level 0, so the score is 1 — and the row
    // now offers to drop it rather than take it.
    expect(within(skillRow(sheet, 'Archery')).getByText('1')).toBeInTheDocument();
    expect(toggle(sheet, 'Archery')).toHaveTextContent(/drop/i);
  });

  it('frees the slot again when a skill is dropped', async () => {
    const { user, sheet } = await openSheetFor('Ruby Vance', '2');

    await user.click(toggle(sheet, 'Archery'));
    await user.click(toggle(sheet, 'Archery'));

    expect(toggle(sheet, 'Archery')).toHaveTextContent(/take/i);
    expect(within(sheet).getByText(/still choosing skills: 0 of 2/i)).toBeInTheDocument();
  });

  it('reports an unfinished build without getting in the way of it', async () => {
    const { sheet } = await openSheetFor('Ruby Vance', '2');

    expect(within(sheet).getByText(/still choosing skills: 0 of 2/i)).toBeInTheDocument();
    // Shown, never blocked: every control is still live.
    expect(toggle(sheet, 'Archery')).toBeEnabled();
  });

  it('refuses a skill past the tier’s slots, and declining leaves it untaken', async () => {
    const { user, sheet } = await openSheetFor('Ruby Vance', '2');

    await user.click(toggle(sheet, 'Archery'));
    await user.click(toggle(sheet, 'Stealth'));
    await user.click(toggle(sheet, 'Enter'));

    expect(screen.getByRole('button', { name: /take it anyway/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /leave it/i }));

    expect(toggle(sheet, 'Enter')).toHaveTextContent(/take/i);
    expect(within(sheet).queryByText(/has 3 skills/i)).not.toBeInTheDocument();
  });

  /**
   * The override gates the action once; it does not silence the report. An
   * overridden survivor keeps showing the violation for exactly as long as they
   * have it, which is why nothing about the override is stored.
   */
  it('lets the rule be overridden, and still reports the survivor as illegal after', async () => {
    const { user, sheet } = await openSheetFor('Ruby Vance', '2');

    await user.click(toggle(sheet, 'Archery'));
    await user.click(toggle(sheet, 'Stealth'));
    await user.click(toggle(sheet, 'Enter'));
    await user.click(screen.getByRole('button', { name: /take it anyway/i }));

    expect(toggle(sheet, 'Enter')).toHaveTextContent(/drop/i);
    expect(within(sheet).getByText(/has 3 skills/i)).toBeInTheDocument();
  });

  it('reports nothing at all for a legal build', async () => {
    const { user, sheet } = await openSheetFor('Ruby Vance', '2');

    await user.click(toggle(sheet, 'Archery'));
    await user.click(toggle(sheet, 'Stealth'));

    expect(within(sheet).queryByText(/still choosing/i)).not.toBeInTheDocument();
    expect(within(sheet).queryByText(/has 3 skills/i)).not.toBeInTheDocument();
  });
});
