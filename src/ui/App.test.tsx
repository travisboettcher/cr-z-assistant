import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewCampaign } from '../engine/campaign';
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
  render(
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

  it('renders the not-yet sections as placeholders nobody can act on', () => {
    renderApp();

    const nav = within(screen.getByRole('navigation', { name: /campaign sections/i }));

    for (const label of ['Roster', 'Base', 'Turn', 'Missions', 'Equipment']) {
      const button = nav.getByRole('button', { name: new RegExp(`^${label}\\b`) });
      // Genuinely inert: disabled, so it cannot be clicked and cannot take
      // keyboard focus from a control that actually does something.
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/not yet/i);
    }

    expect(nav.queryAllByRole('link')).toHaveLength(0);
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

    expect(screen.getByRole('button', { name: /export campaign/i })).toBeEnabled();
  });
});

/**
 * The section strip, which spent three phases announcing that screens which
 * already existed did not.
 *
 * Phase 0 shipped it as five disabled placeholders, and the reasoning was
 * right at the time: a control that looks tappable and does nothing is worse
 * than one that plainly says "not yet". It stopped being true a screen at a
 * time, and by Z3-3 it was saying "Turn — not yet" directly above a working
 * turn walk.
 */
describe('the section strip', () => {
  const navigation = () => screen.getByRole('navigation', { name: /campaign sections/i });

  it('says nothing is reachable when no campaign is open', () => {
    renderApp();

    // Not "the links are wrong" — there is nowhere to go, because the empty
    // state is the whole page.
    expect(within(navigation()).queryByRole('link')).toBeNull();
  });

  it('links to the sections that exist and still refuses the ones that do not', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    const nav = within(navigation());

    for (const [label, target] of [
      ['Turn', '#turn'],
      ['Roster', '#roster'],
      ['Base', '#base'],
    ] as const) {
      expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', target);
    }

    for (const label of ['Missions', 'Equipment']) {
      expect(nav.getByRole('button', { name: `${label} Not yet` })).toBeDisabled();
    }
  });

  it('points at sections that are actually on the page', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    // The half a link check cannot make on its own: an href to an id nothing
    // carries is a link that silently goes nowhere.
    for (const id of ['turn', 'roster', 'base']) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});
