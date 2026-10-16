import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';
import { goOn, lane, moveTo } from '../test/screens';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A turn-1 campaign standing in its Mission Phase, which is where the First
 * Mission's team has to be recorded — no Planning Phase has run, so there is
 * nothing for the Advancement Phase behind it to read (issue #116).
 *
 * Earl can force a material roll and Carla cannot, which is what makes the
 * substitution assertion below about the team rather than about the roster.
 */
function turnOne(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    step: 'select-mission',
    survivors: [
      {
        ...createSurvivor('Earl Rhodes', 4, { id: EARL }),
        stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
        skills: { mechanics: 0 },
      },
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ],
    base: { id: 'small-town-home', slots: {} },
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

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });
const team = () => lane('On the First Mission');

/** The +1 XP button on the mission pool's row for this survivor. */
function missionAward(survivor: RegExp) {
  const heading = within(walk()).getByText(/for going on the mission/i);
  const row = within(heading.closest('li') as HTMLElement)
    .getAllByRole('listitem')
    .find((item) => survivor.test(item.textContent ?? ''));

  return within(row as HTMLElement).getByRole('button', { name: /\+1 xp/i });
}

describe('the First Mission team', () => {
  it('is asked for on turn 1, where no Planning Phase has assigned one', () => {
    open(turnOne());

    expect(team()).toBeTruthy();
    expect(within(walk()).getByText(/the first mission is played on turn 1/i)).toBeTruthy();
  });

  /**
   * Every later turn's team was chosen in the Planning Phase before it. A
   * second place to answer the same question is a second answer waiting to
   * disagree with the first.
   */
  it('is not asked for again on a later turn', () => {
    open(turnOne({ turn: 2 }));

    expect(within(walk()).queryByRole('region', { name: 'On the First Mission' })).toBeNull();
  });

  it('stays on offer across the phase’s steps', async () => {
    const user = open(turnOne());

    await user.click(screen.getByRole('button', { name: /^next: equip the mission team$/i }));

    expect(team()).toBeTruthy();
  });

  it('gives turn 1 the mission XP the book owes it', async () => {
    const user = open(turnOne());

    moveTo(/^earl rhodes/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    goOn();

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
    expect(within(walk()).queryByText(/nobody is on a mission team/i)).toBeNull();

    await user.click(missionAward(/earl/i));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('0 of 1');
  });

  /**
   * #145, and [R7](../../docs/rulings.md): a point handed out
   * stays handed out. A team edited after its XP is spent leaves a later
   * arrival eligible with nothing to give them — which is a fine rule and was
   * an unexplained dead button, the thing `advancement.ts` argues against in as
   * many words.
   */
  it('says why an award cannot be made after the team changed under it', async () => {
    const user = open(turnOne());

    moveTo(/^earl rhodes/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    goOn();
    await user.click(missionAward(/earl/i));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('0 of 1');

    // Back to the Mission Phase and swap the team: Earl off, Carla on. Earl
    // keeps the point he was given, so there is none left for Carla.
    await user.click(screen.getByRole('button', { name: /^back to play the mission$/i }));
    moveTo(/^earl rhodes/i, 'Nothing to do');
    moveTo(/^carla proust/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^next: character advancement$/i }));

    const carla = missionAward(/carla/i);

    expect(carla).toBeDisabled();
    expect(carla.closest('li')?.textContent).toContain('no XP left from this source');
  });

  /**
   * The quieter half of #116: substitutions are the combined Score of whoever
   * was on the mission (pg. 12), so with no team recorded a turn-1 haul could
   * not be redirected at all — and nothing said why.
   */
  it('gives turn 1 the substitutions that team’s skills allow', async () => {
    const user = open(turnOne());

    moveTo(/^earl rhodes/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    goOn();
    await user.click(screen.getByRole('button', { name: /^next: create new survivors$/i }));
    await user.click(screen.getByRole('button', { name: /^next: add materials to storage$/i }));
    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).getByLabelText(/force the result of this roll/i)).toBeTruthy();
  });

  it('offers nothing to force when the one who can stayed home', async () => {
    const user = open(turnOne());

    moveTo(/^carla proust/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    goOn();
    await user.click(screen.getByRole('button', { name: /^next: create new survivors$/i }));
    await user.click(screen.getByRole('button', { name: /^next: add materials to storage$/i }));
    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).queryByLabelText(/force the result of this roll/i)).toBeNull();
  });

  /**
   * The assignment is an ordinary one, so turn 1's Planning Phase clears it
   * like any other — and the Advancement Phase behind it still reads it,
   * through the entry that recorded the clearing (issue #95).
   */
  it('survives a step out to Planning and back', async () => {
    const user = open(turnOne());

    moveTo(/^earl rhodes/i, 'On the First Mission');
    await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
    goOn();
    await user.click(screen.getByRole('button', { name: /^skip to planning$/i }));
    goOn();
    for (const step of [
      /^back to add facilities and upgrades$/i,
      /^back to heal wounds$/i,
      /^back to add materials to storage$/i,
      /^back to create new survivors$/i,
      /^back to character advancement$/i,
    ]) {
      await user.click(screen.getByRole('button', { name: step }));
    }

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
  });

  /**
   * R2-M2 (#144). The walk lets a player step back within a turn, so this panel
   * outlived the phase it belongs to — and by then it showed **nobody** on the
   * First Mission, because Planning had cleared the assignments it reads, while
   * the Advancement Phase went on naming whoever went. Ticking a name there
   * wrote into the *current* turn: the survivor left the project team, taking
   * Labor with them after projects had been ordered against it, and joined turn
   * 2's mission team instead.
   */
  describe('once turn 1’s Planning Phase has begun', () => {
    /**
     * Turn 1 stepped back into its Mission Phase after Planning cleared the
     * tasks — assignments empty, the team in the entry that recorded the
     * clearing. Arranged rather than clicked: getting here is a dozen presses
     * through two phases, and what is under test is the panel.
     */
    const steppedBack = (cleared: Record<string, Assignment>): Campaign =>
      turnOne({
        assignments: {},
        log: [
          {
            turn: 1,
            phase: 'planning',
            at: '2026-08-30T00:00:00.000Z',
            event: { kind: 'planning-began', cleared },
          },
        ],
      });

    it('says who went, and stops being a control', () => {
      open(steppedBack({ [EARL]: { task: 'mission', team: 1 } }));

      expect(within(walk()).queryByRole('region', { name: 'On the First Mission' })).toBeNull();
      expect(walk().textContent).toContain('Earl Rhodes went on the First Mission');
    });

    it('agrees with what the Advancement Phase awards for', async () => {
      const user = open(steppedBack({ [EARL]: { task: 'mission', team: 1 } }));

      expect(walk().textContent).toContain('Earl Rhodes went on the First Mission');

      await user.click(screen.getByRole('button', { name: /^skip to advancement$/i }));
      goOn();

      // The same record, read by the pool that awards for it.
      expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
    });

    it('says so plainly when nobody was recorded', () => {
      open(steppedBack({}));

      expect(walk().textContent).toContain('Nobody went on the First Mission');
    });
  });

  /**
   * #236 (R2) and #237 (B2). The team's checkboxes stayed live after the
   * mission was played, and unticking somebody rewrote who went; and the team
   * and the mission it played were two boxes with nothing joining them.
   */
  describe('as a board, and a record once played', () => {
    const selected = {
      turn: 1,
      phase: 'mission' as const,
      at: '2026-08-30T00:00:00.000Z',
      event: {
        kind: 'mission-selected' as const,
        team: 1,
        mission: 'first-mission' as const,
        names: ['Earl Rhodes'],
      },
    };
    const ended = (endCondition: number | null) => ({
      turn: 1,
      phase: 'mission' as const,
      at: '2026-08-30T00:00:00.000Z',
      event: { kind: 'first-mission-resolved' as const, team: 1, endCondition, strangers: [] },
    });
    const played = (endCondition: number | null) =>
      turnOne({
        step: 'tactical-mission',
        assignments: { [EARL]: { task: 'mission', team: 1 } },
        log: [selected, ended(endCondition)],
      });

    it('chooses the team’s mission in the team’s own lane, and nowhere else', async () => {
      const user = open(turnOne());

      moveTo(/^earl rhodes/i, 'On the First Mission');
      await user.click(within(team()).getByRole('button', { name: 'Choose for team 1' }));

      expect(within(team()).getByText(/Mission team 1 chose the First Mission/)).toBeTruthy();
      expect(within(walk()).getAllByRole('group', { name: 'Mission team 1' })).toHaveLength(1);
      // No Planning Phase has assigned turn 1's team, so nothing says one did.
      expect(within(walk()).queryByText(/the planning phase assigned/i)).toBeNull();
    });

    it('is a record once the mission is played, with no board', () => {
      open(played(2));

      expect(walk().textContent).toContain('Earl Rhodes went on the First Mission');
      expect(within(walk()).queryByRole('region', { name: 'On the First Mission' })).toBeNull();
      expect(within(walk()).getByRole('button', { name: 'Change who went' })).toBeTruthy();
    });

    it('changes who went behind a warning, and goes back to the record', async () => {
      const user = open(played(2));

      await user.click(within(walk()).getByRole('button', { name: 'Change who went' }));

      expect(
        within(walk()).getByText(/the first mission is played\. who went/i).textContent,
      ).toMatch(/stay handed out/);
      moveTo(/^carla proust/i, 'On the First Mission');
      await user.click(within(walk()).getByRole('button', { name: 'Keep this team' }));

      expect(walk().textContent).toContain('Earl Rhodes, Carla Proust went on the First Mission');
    });

    it('stays a form after a failed First Mission, which turn 1 plays again (R21)', () => {
      open(played(null));

      expect(team()).toBeTruthy();
      expect(within(walk()).queryByRole('button', { name: 'Change who went' })).toBeNull();
    });
  });
});
