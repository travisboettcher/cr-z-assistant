import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewCampaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import type { CampaignState } from '../state/campaignStore';
import { App } from './App';

/**
 * The shell is meaningless without the store, so every test renders it inside
 * the real provider and drives it the way a player would — by typing and
 * clicking. These assertions are behavioural on purpose: a snapshot of this
 * markup would fail on every layout tweak while proving nothing about whether
 * the app works.
 */
function renderApp(initialState?: CampaignState) {
  // `exactOptionalPropertyTypes` means passing `initialState={undefined}` is
  // not the same as omitting the prop, hence the branch rather than a spread.
  return render(
    initialState === undefined ? (
      <CampaignProvider>
        <App />
      </CampaignProvider>
    ) : (
      <CampaignProvider initialState={initialState}>
        <App />
      </CampaignProvider>
    ),
  );
}

/** Turn and phase are a description list, so a value is found via its label. */
function headerFact(label: string): HTMLElement | null {
  const term = within(screen.getByRole('banner')).getByText(label);
  return term.nextElementSibling as HTMLElement | null;
}

describe('App shell', () => {
  it('says in the footer which build is running', () => {
    renderApp();

    expect(within(screen.getByRole('contentinfo')).getByText(/^version/i)).toBeVisible();
  });

  it('offers a new campaign and an import when nothing is open', () => {
    renderApp();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Campaign Tracker');
    expect(screen.getByRole('heading', { level: 2, name: /start a new campaign/i })).toBeVisible();
    expect(screen.getByLabelText(/^campaign name$/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /new campaign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose a file/i })).toBeEnabled();
  });

  it('will not start a campaign without a name', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('button', { name: /new campaign/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/^campaign name$/i), '   ');
    expect(screen.getByRole('button', { name: /new campaign/i })).toBeDisabled();
  });

  it('shows the campaign name, turn and phase in the header once started', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: /new campaign/i }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cedar Hollow');
    expect(headerFact('Turn')).toHaveTextContent('1');
    expect(headerFact('Phase')).toHaveTextContent('Mission');

    // The way in is gone once you are in.
    expect(screen.queryByLabelText(/^campaign name$/i)).not.toBeInTheDocument();
  });

  it('reflects a campaign already open at boot', () => {
    renderApp({
      status: 'open',
      campaign: {
        ...createNewCampaign('Millbrook', {
          id: '11111111-2222-3333-4444-555555555555',
          createdAt: '2026-08-30T00:00:00.000Z',
        }),
        turn: 4,
        step: 'assign-rest-and-healing',
      },
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    expect(headerFact('Turn')).toHaveTextContent('4');
    expect(headerFact('Phase')).toHaveTextContent('Planning');
  });

  it('says on every screen that the rulebook is required', () => {
    renderApp();

    expect(screen.getByRole('contentinfo')).toHaveTextContent(/rulebook/i);
  });

  /**
   * The export affordance only makes sense with a campaign open, and it is the
   * only durable save until Z0-10 lands, so its absence would be a silent data
   * loss rather than a missing button.
   */
  it('offers export once a campaign is open, and not before', async () => {
    const user = userEvent.setup();
    render(
      <CampaignProvider>
        <App />
      </CampaignProvider>,
    );

    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));
    await user.click(screen.getByRole('button', { name: /^menu$/i }));
    await user.click(screen.getByRole('button', { name: /export, import or start new/i }));

    expect(screen.getByRole('button', { name: /export campaign/i })).toBeEnabled();
  });
});

/**
 * One screen: the turn, a summary of the community beside it, and a modal for
 * anything that edits (docs/ux-principles.md). The page used to be five
 * sections stacked one under another, with jump links to scroll between them.
 */
describe('the one-screen layout', () => {
  async function started() {
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));
    return user;
  }

  const summary = () => screen.getByRole('complementary', { name: /community summary/i });

  it('shows the turn and the community summary, and keeps the editors closed', async () => {
    await started();

    expect(screen.getByRole('region', { name: /^turn 1$/i })).toBeVisible();
    for (const card of [/^survivors$/i, /^base$/i, /^materials$/i]) {
      expect(within(summary()).getByRole('region', { name: card })).toBeVisible();
    }
    expect(screen.queryByLabelText(/survivor name/i)).toBeNull();
    expect(screen.queryByLabelText(/choose a base/i)).toBeNull();
  });

  it('opens the roster in a modal, and Done closes it back to the turn', async () => {
    const user = await started();

    await user.click(within(summary()).getByRole('button', { name: /add survivors/i }));
    const dialog = screen.getByRole('dialog', { name: /^survivors$/i });
    expect(within(dialog).getByLabelText(/survivor name/i)).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: /^done$/i }));
    expect(screen.queryByLabelText(/survivor name/i)).toBeNull();
    expect(screen.getByRole('region', { name: /^turn 1$/i })).toBeVisible();
  });

  it('summarises what the roster holds once somebody is in it', async () => {
    const user = await started();

    await user.click(within(summary()).getByRole('button', { name: /add survivors/i }));
    await user.type(screen.getByLabelText(/survivor name/i), 'Earl Rhodes');
    await user.selectOptions(screen.getByLabelText(/^Tier$/i), '4');
    await user.click(screen.getByRole('button', { name: /^add survivor$/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    const card = within(summary()).getByRole('region', { name: /^survivors$/i });
    expect(card).toHaveTextContent('Earl Rhodes');
    expect(card).toHaveTextContent('T4 · 4/4');
    expect(within(card).getByRole('button', { name: /^manage$/i })).toBeVisible();
  });

  it('claims a base from its card, and then summarises it', async () => {
    const user = await started();

    await user.click(within(summary()).getByRole('button', { name: /claim a base/i }));
    await user.click(screen.getByRole('button', { name: /claim this base/i }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));

    const card = within(summary()).getByRole('region', { name: /^base$/i });
    // The Small Town Home: five slots, two of them empty.
    expect(card).toHaveTextContent('Small Town Home');
    expect(card).toHaveTextContent('5 slots, 2 empty');
  });

  it('keeps the log and the campaign file in the header menu, with the version', async () => {
    const user = await started();

    await user.click(screen.getByRole('button', { name: /^menu$/i }));
    expect(screen.getByText('Never exported')).toBeVisible();
    expect(screen.getAllByText(/^version/i)).not.toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^campaign log$/i }));
    expect(
      within(screen.getByRole('dialog', { name: /^campaign log$/i })).getByRole('region', {
        name: /^history$/i,
      }),
    ).toBeVisible();
  });

  it('closes the file modal over a campaign it was not opened for', async () => {
    const user = await started();

    await user.click(screen.getByRole('button', { name: /^menu$/i }));
    await user.click(screen.getByRole('button', { name: /export, import or start new/i }));
    await user.click(screen.getByRole('button', { name: /start a new campaign/i }));
    await user.type(screen.getByLabelText(/new campaign name/i), 'Millbrook');
    await user.click(screen.getByRole('button', { name: /start campaign/i }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    expect(screen.queryByRole('dialog', { name: /^campaign file$/i })).toBeNull();
  });
});

/** What a new campaign's first turn needs, said above the turn (R33). */
describe('getting started', () => {
  const checklist = () => screen.queryByRole('region', { name: /getting started/i });

  it('asks for the community first, on a new campaign', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    const list = checklist();
    expect(list).not.toBeNull();
    const current = within(list as HTMLElement)
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent(/build your starting community/i);

    await user.click(within(list as HTMLElement).getByRole('button', { name: /add survivors/i }));
    expect(screen.getByRole('dialog', { name: /^survivors$/i })).toBeVisible();
  });

  /** Earl, finished: a Tier 2 with both skills chosen (pg. 7). */
  const earl = () => ({
    ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
    skills: { tactics: 0, carry: 0 },
  });
  const firstMissionWon = {
    turn: 1,
    phase: 'mission' as const,
    at: '2026-08-30T00:00:00.000Z',
    event: { kind: 'first-mission-resolved' as const, team: 1, endCondition: 2, strangers: [] },
  };
  const current = () =>
    within(checklist() as HTMLElement)
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('aria-current') === 'step');

  it('is gone once the community, the team, the mission and the base are done', () => {
    renderApp({
      status: 'open',
      campaign: {
        ...createNewCampaign('Cedar Hollow'),
        startingCommunityBuilt: true,
        survivors: [earl()],
        assignments: { earl: { task: 'mission', team: 1 } },
        base: { id: 'small-town-home', slots: {} },
        log: [firstMissionWon],
      },
    });

    expect(checklist()).toBeNull();
  });

  /** #238. A community ticked built with every survivor still owing their skills read as done. */
  it('names who is not finished, and keeps the community current until they are', () => {
    renderApp({
      status: 'open',
      campaign: {
        ...createNewCampaign('Cedar Hollow'),
        startingCommunityBuilt: true,
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
      },
    });

    expect(current()).toHaveTextContent(/build your starting community/i);
    expect(current()).toHaveTextContent('Not finished yet: Earl Rhodes.');
  });

  it('jumps to the First Mission’s team when that is next', () => {
    renderApp({
      status: 'open',
      campaign: {
        ...createNewCampaign('Cedar Hollow'),
        startingCommunityBuilt: true,
        survivors: [earl()],
      },
    });

    const link = within(current() as HTMLElement).getByRole('link', { name: 'Choose the team' });
    expect(link).toHaveAttribute('href', '#first-mission-team');
    expect(document.getElementById('first-mission-team')).toHaveAccessibleName(
      'On the First Mission',
    );
  });

  /** #238. The claim was amber from the start of turn 1 and never offered once it was due. */
  it('offers the claim once the First Mission is played, and not before', () => {
    const turnOne = {
      ...createNewCampaign('Cedar Hollow'),
      step: 'tactical-mission' as const,
      startingCommunityBuilt: true,
      survivors: [earl()],
      assignments: { earl: { task: 'mission' as const, team: 1 } },
    };

    const { unmount } = renderApp({ status: 'open', campaign: turnOne });
    expect(current()).toHaveTextContent(/play the first mission/i);
    expect(screen.queryByRole('button', { name: 'Claim your base' })).toBeNull();
    unmount();

    renderApp({ status: 'open', campaign: { ...turnOne, log: [firstMissionWon] } });
    expect(current()).toHaveTextContent(/claim your base/i);
    // On the checklist and on the step that won it.
    expect(screen.getAllByRole('button', { name: 'Claim your base' })).toHaveLength(2);
  });

  it('is gone after the first turn, whatever is missing', () => {
    renderApp({ status: 'open', campaign: { ...createNewCampaign('Cedar Hollow'), turn: 2 } });

    expect(checklist()).toBeNull();
  });
});
