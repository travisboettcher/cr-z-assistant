import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';

/** Opens the app on a campaign that already exists, for the tests that need one. */
function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

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
  it('shows the tier, and the health and Inventory Slots derived from it', async () => {
    const { sheet } = await openSheetFor('Earl Rhodes', '4');

    expect(within(sheet).getByText(/tier 4 · hero/i)).toBeInTheDocument();
    expect(within(sheet).getByText('4 / 4')).toBeInTheDocument();
    // No Carry skill yet, so Inventory Slots are the bare tier.
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
      Strength: ['Blunt Weapon', 'Bladed Weapon', 'Heavy Weapon', 'Carry', 'Break'],
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

    const row = skillRow(sheet, 'Bladed Weapon');

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

    // "Set health", not just "Set": experience is edited by hand too, and two
    // controls reading only "Set" would be indistinguishable to a screen reader.
    await user.click(within(sheet).getByRole('button', { name: /^set health$/i }));
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
 * Building a survivor. Skills start at level zero (pg. 8), so creation is
 * choosing *which* skills and how the tier's stat values are arranged — levels
 * come only from experience, which is a later story.
 */
describe('SurvivorSheet editing', () => {
  /**
   * The Take/Drop control in one skill's row, named rather than "the button":
   * a skill the survivor holds also has a "+1" control beside it.
   */
  function toggle(sheet: HTMLElement, label: string) {
    return within(skillRow(sheet, label)).getByRole('button', { name: /^(take|drop)\b/i });
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

/**
 * Spending experience (pg. 18).
 *
 * The assertions that matter are about *price*, and they are made on the
 * controls themselves — a player decides what to buy by reading the buttons, so
 * a button quoting the wrong number is the bug even if the arithmetic behind it
 * is right.
 */
describe('SurvivorSheet advancement', () => {
  async function openWithXp(name: string, tier: string, xp: number) {
    const { user, sheet } = await openSheetFor(name, tier);

    await user.click(within(sheet).getByRole('button', { name: /^set experience$/i }));
    const field = screen.getByLabelText(new RegExp(`experience for ${name}`, 'i'));
    await user.clear(field);
    await user.type(field, String(xp));
    await user.click(screen.getByRole('button', { name: /save experience/i }));

    return { user, sheet };
  }

  /** What the sheet says the survivor's balance is, read back off the field. */
  async function balance(
    user: ReturnType<typeof userEvent.setup>,
    sheet: HTMLElement,
    name: string,
  ) {
    await user.click(within(sheet).getByRole('button', { name: /^set experience$/i }));
    const field = screen.getByLabelText(new RegExp(`experience for ${name}`, 'i'));
    const value = Number((field as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: /save experience/i }));

    return value;
  }

  it('records an experience balance typed in by hand', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 20);

    expect(await balance(user, sheet, 'Marcus Webb')).toBe(20);
  });

  /**
   * The whole trap of this story, on screen: one sentence of pg. 18 covers both
   * of these and they differ by six. Asserted from the same survivor, in the
   * same test, because a wrong reading is only visible in the contrast.
   */
  it('quotes a skill level at its level and a point of move at its score', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 20);
    await user.click(toggleFor(sheet, 'Scavenge'));

    expect(
      within(sheet).getByRole('button', { name: /raise scavenge to level 1/i }),
    ).toHaveAccessibleName(/1 experience/);
    expect(within(sheet).getByRole('button', { name: /raise move to 7/i })).toHaveAccessibleName(
      /7 experience/,
    );
  });

  it('charges the balance what the button quoted', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 20);
    await user.click(toggleFor(sheet, 'Scavenge'));

    await user.click(within(sheet).getByRole('button', { name: /raise scavenge to level 1/i }));
    // Level 1, and a Score of 1 with it — Marcus's Intelligence is 0, so the
    // level is the whole of his Scavenge Score.
    const cells = within(skillRow(sheet, 'Scavenge')).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('1');
    expect(cells[1]).toHaveTextContent('1');
    expect(await balance(user, sheet, 'Marcus Webb')).toBe(19);

    await user.click(within(sheet).getByRole('button', { name: /raise move to 7/i }));
    expect(await balance(user, sheet, 'Marcus Webb')).toBe(12);

    // And the next level costs more than the last, because the price is the level.
    expect(
      within(sheet).getByRole('button', { name: /raise scavenge to level 2/i }),
    ).toHaveAccessibleName(/2 experience/);
  });

  it('offers nothing to raise on a skill the survivor has not taken', async () => {
    const { sheet } = await openWithXp('Marcus Webb', '2', 20);

    expect(
      within(sheet).queryByRole('button', { name: /raise scavenge/i }),
    ).not.toBeInTheDocument();
  });

  it('stops a skill at the tier’s maximum level, and says so', async () => {
    const { user, sheet } = await openWithXp('Ruby Vance', '1', 20);
    await user.click(toggleFor(sheet, 'Carry'));
    await user.click(within(sheet).getByRole('button', { name: /raise carry to level 1/i }));

    // A Rookie caps at level 1 (pg. 7), so the next one is refused with a reason.
    const next = within(sheet).getByRole('button', { name: /raise carry to level 2/i });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleName(/maximum level for their tier/i);
  });

  it('stops move at a score of eight, and says so', async () => {
    const { user, sheet } = await openWithXp('Earl Rhodes', '4', 40);

    await user.click(within(sheet).getByRole('button', { name: /raise move to 7/i }));
    await user.click(within(sheet).getByRole('button', { name: /raise move to 8/i }));

    const next = within(sheet).getByRole('button', { name: /raise move to 9/i });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleName(/maximum score of eight/i);
  });

  it('refuses a purchase the survivor cannot pay for, quoting the price anyway', async () => {
    const { sheet } = await openWithXp('Marcus Webb', '2', 3);

    const move = within(sheet).getByRole('button', { name: /raise move to 7/i });
    expect(move).toBeDisabled();
    expect(move).toHaveAccessibleName(/7 experience/);
    expect(move).toHaveAccessibleName(/not enough experience/i);
  });

  /**
   * Promotion rebuilds the stat array to the new Tier's, and the ordering it
   * keeps is the player's own: Marcus's 2 is moved onto Intelligence first, so
   * his 3 has to land there and not back in Strength.
   */
  it('promotes a survivor, keeping their own ordering of the stat array', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 6);

    await user.selectOptions(within(sheet).getByLabelText(/^intelligence$/i), '2');
    await user.selectOptions(within(sheet).getByLabelText(/raise from zero/i), 'strength');
    await user.click(within(sheet).getByRole('button', { name: /raise their tier/i }));

    expect(within(sheet).getByText(/tier 3 · leader/i)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^intelligence$/i)).toHaveValue('3');
    expect(within(sheet).getByLabelText(/^strength$/i)).toHaveValue('1');
    expect(await balance(user, sheet, 'Marcus Webb')).toBe(0);
  });

  /**
   * The zero-stat choice, on screen (pg. 18). A Citizen has two stats at 0 and
   * only one of them becomes the Leader's 1, so the sheet asks — and refuses,
   * with a reason, until it is answered. The other answer has to produce the
   * other character, or the control is decoration.
   */
  it('asks which stat comes off zero, and will not promote until it is told', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 6);

    const promote = within(sheet).getByRole('button', { name: /raise their tier/i });
    expect(promote).toBeDisabled();
    expect(promote).toHaveAccessibleName(/choose which stat comes off zero/i);

    await user.selectOptions(within(sheet).getByLabelText(/raise from zero/i), 'cooperation');
    await user.click(within(sheet).getByRole('button', { name: /raise their tier/i }));

    expect(within(sheet).getByText(/tier 3 · leader/i)).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^cooperation$/i)).toHaveValue('1');
    expect(within(sheet).getByLabelText(/^intelligence$/i)).toHaveValue('0');
  });

  /** A Leader has one stat left at zero, so there is nothing to ask about. */
  it('asks nothing of a survivor with a single stat at zero', async () => {
    const { user, sheet } = await openWithXp('Carla Proust', '3', 8);

    expect(within(sheet).queryByLabelText(/raise from zero/i)).not.toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /raise their tier/i }));

    expect(within(sheet).getByText(/tier 4 · hero/i)).toBeInTheDocument();
  });

  /** A slot, not a skill — so the sheet immediately says one is missing. */
  it('grants a skill slot on promotion and leaves the choosing to the player', async () => {
    const { user, sheet } = await openWithXp('Marcus Webb', '2', 6);
    await user.click(toggleFor(sheet, 'Scavenge'));
    await user.click(toggleFor(sheet, 'Medicine'));

    expect(within(sheet).queryByText(/still choosing/i)).not.toBeInTheDocument();

    await user.selectOptions(within(sheet).getByLabelText(/raise from zero/i), 'intelligence');
    await user.click(within(sheet).getByRole('button', { name: /raise their tier/i }));

    expect(within(sheet).getByText(/still choosing skills: 2 of 3/i)).toBeInTheDocument();
  });

  it('has nowhere to promote a hero, and quotes no price for it', async () => {
    const { sheet } = await openWithXp('Earl Rhodes', '4', 40);

    const promote = within(sheet).getByRole('button', { name: /raise their tier/i });
    expect(promote).toBeDisabled();
    expect(promote).toHaveAccessibleName(/top of the table/i);
    expect(promote).not.toHaveAccessibleName(/experience/i);
  });
});

/** The Take/Drop control in one skill's row, past the "+1" beside it. */
function toggleFor(sheet: HTMLElement, label: string) {
  return within(skillRow(sheet, label)).getByRole('button', { name: /^(take|drop)\b/i });
}

/**
 * Playtest finding M13: the sheet applied the hunger penalty and never
 * mentioned it. Under a −2 penalty it showed Cooperation 3 in the select and a
 * Mechanics Score of 1, directly under its own sentence saying a Score is the
 * skill's level plus its governing stat. A player checking the arithmetic gets
 * 3 and reads 1.
 *
 * The computation is right and does not change — R1 applies the penalty
 * to stats, and therefore to Inventory Slots too. This is about saying so.
 */
describe('a community that is going hungry', () => {
  /** Three Heroes eating two each against empty stores: six short of three. */
  const starving = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    survivors: [
      createSurvivor('Nell Haig', 4, { id: 'nell' }),
      createSurvivor('Tomas Ford', 4, { id: 'tomas' }),
      createSurvivor('Ada Poole', 4, { id: 'ada' }),
    ],
    materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
    log: [
      {
        turn: 3,
        phase: 'management',
        at: '2026-09-13T09:00:00.000Z',
        event: { kind: 'survivors-fed', required: 6, hunger: 6 },
      },
    ],
  });

  it('says so on the sheet, and shows what each stat is worth', async () => {
    const user = open(starving());
    await user.click(screen.getAllByRole('button', { name: /^sheet$/i })[0] as HTMLElement);

    const sheet = screen.getByRole('region', { name: 'Nell Haig' });

    expect(sheet.textContent).toContain('every stat is 3 lower until the next Management Phase');
    // A Hero's Strength is 4, so 1 under the penalty.
    expect(sheet.textContent).toContain('1 while the community is hungry');
  });

  it('says so on the roster too, which is what a player reads at the table', () => {
    open(starving());

    expect(screen.getByRole('region', { name: /community/i }).textContent).toContain(
      'The community is going hungry, so every stat is 3 lower',
    );
  });

  it('says nothing at all when the community is fed', async () => {
    const user = open({ ...starving(), log: [] });

    expect(screen.getByRole('region', { name: /community/i }).textContent).not.toContain(
      'going hungry',
    );

    await user.click(screen.getAllByRole('button', { name: /^sheet$/i })[0] as HTMLElement);

    expect(screen.getByRole('region', { name: 'Nell Haig' }).textContent).not.toContain(
      'while the community is hungry',
    );
  });
});

/**
 * **#168.** A base's Tier is the most Hero-Tier survivors the community may
 * hold (pg. 54). The base sheet computed it, printed it and reported the
 * violation — and the promotion that caused it said nothing at all.
 */
describe('promoting past what the base allows', () => {
  /** A Tier 2 base, two Heroes already, and a Leader with the XP to become a third. */
  const atTheCap = (): Campaign => ({
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    // The Hobby Farm is a Tier 2 base, so it allows two Heroes (pg. 54).
    base: { id: 'hobby-farm', slots: {} },
    survivors: [
      { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), xp: 20 },
      createSurvivor('Nell Haig', 4, { id: 'nell' }),
      createSurvivor('Tomas Ford', 4, { id: 'tomas' }),
    ],
  });

  const sheetFor = async (name: string) => {
    const user = open(atTheCap());
    const rows = screen.getAllByRole('button', { name: /^sheet$/i });
    await user.click(rows[0] as HTMLElement);

    return { user, sheet: screen.getByRole('region', { name }) };
  };

  it('warns at the moment of the purchase, and holds it', async () => {
    const { sheet } = await sheetFor('Earl Rhodes');

    expect(sheet.textContent).toContain('This base allows 2 Hero-Tier survivors');
    expect(within(sheet).getByRole('button', { name: /raise their tier/i })).toBeDisabled();
  });

  it('carries the same override the other legality checks do', async () => {
    const { user, sheet } = await sheetFor('Earl Rhodes');

    await user.click(within(sheet).getByLabelText(/promote anyway/i));

    expect(within(sheet).getByRole('button', { name: /raise their tier/i })).toBeEnabled();
  });

  /**
   * The agreement the issue asks for: buying it anyway still leaves the base
   * sheet saying the community is over, because the override is never stored
   * and the cap is still the cap.
   */
  it('still reads as over on the base sheet afterwards', async () => {
    const { user, sheet } = await sheetFor('Earl Rhodes');

    await user.click(within(sheet).getByLabelText(/promote anyway/i));
    await user.click(within(sheet).getByRole('button', { name: /raise their tier/i }));

    expect(screen.getByText(/over what this base allows/i)).toBeInTheDocument();
  });

  it('says nothing where the community is still under the cap', async () => {
    const user = open({
      ...atTheCap(),
      survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), xp: 20 }],
    });
    await user.click(screen.getAllByRole('button', { name: /^sheet$/i })[0] as HTMLElement);

    const sheet = screen.getByRole('region', { name: 'Earl Rhodes' });

    expect(sheet.textContent).not.toContain('Hero-Tier');
    expect(within(sheet).getByRole('button', { name: /raise their tier/i })).toBeEnabled();
  });
});
