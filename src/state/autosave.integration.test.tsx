import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewCampaign } from '../engine/campaign';
import { AUTOSAVE_KEY } from '../persistence/autosave';
import { serializeCampaign } from '../persistence/exportFile';
import { App } from '../ui/App';
import { CampaignProvider } from './CampaignProvider';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

afterEach(() => {
  localStorage.clear();
});

/**
 * The status line, scoped to the overview panel. The confirm dialog carries
 * similar wording, and jsdom does not apply the UA stylesheet that hides a
 * closed `<dialog>`, so an unscoped text query matches both.
 */
function statusLine() {
  return within(screen.getByRole('region', { name: /campaign open/i }));
}

/** Mounting fresh is this suite's stand-in for a page reload. */
function boot() {
  return render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );
}

describe('restoring on boot', () => {
  it('opens the campaign a previous session left behind', () => {
    localStorage.setItem(AUTOSAVE_KEY, serializeCampaign(createNewCampaign('Millbrook', FIXED)));

    boot();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
  });

  /**
   * The alternative — deleting the entry to tidy up — throws away what might
   * be someone's only remaining copy. Starting empty and saying so is the
   * safer half of a bad situation.
   */
  it('starts empty and keeps the entry when it no longer loads', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{"schemaVersion": 1, "name": "Ced');

    boot();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Campaign Tracker');
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
  });

  it('starts empty on a first run', () => {
    boot();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Campaign Tracker');
  });
});

describe('writing in the background', () => {
  it('keeps a campaign across a reload without any export', async () => {
    const user = userEvent.setup();
    const first = boot();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    await waitFor(() => {
      expect(localStorage.getItem(AUTOSAVE_KEY)).toContain('Cedar Hollow');
    });

    first.unmount();
    boot();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cedar Hollow');
  });
});

describe('the changed-since-export indicator', () => {
  /**
   * This asserted "Matches your last exported file." and defended it: a
   * restored campaign is identical to what was stored, and a warning that is
   * always on is one nobody reads.
   *
   * Both halves were right about the autosave and wrong about the *file*. The
   * campaign had never been written anywhere the player could recover it from,
   * and the footer said it matched one — so the fix is a third sentence rather
   * than flipping the warning on. It stays off the "changed since" wording,
   * which would have been the untrue nag the original comment feared.
   */
  it('says a restored campaign has never been exported, because it has not', () => {
    localStorage.setItem(AUTOSAVE_KEY, serializeCampaign(createNewCampaign('Millbrook', FIXED)));

    boot();

    expect(statusLine().getByText(/^never exported/i)).toBeVisible();
    expect(statusLine().queryByText(/matches your last exported file/i)).toBeNull();
  });

  it('warns once a campaign has been started but never exported', async () => {
    const user = userEvent.setup();
    boot();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    expect(statusLine().getByText(/^never exported/i)).toBeVisible();
  });
});

describe('starting a new campaign over an open one', () => {
  it('warns about losing changes, and replaces the campaign when confirmed', async () => {
    const user = userEvent.setup();
    boot();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    await user.click(screen.getByRole('button', { name: /start a new campaign/i }));

    const dialog = await screen.findByRole('dialog');
    // Never exported, so the promise the dialog must not make is "nothing is
    // lost" — it would be offering to destroy the only copy.
    expect(dialog).toHaveTextContent(/never been exported/i);
    expect(dialog).not.toHaveTextContent(/nothing is lost/i);

    await user.type(screen.getByLabelText(/new campaign name/i), 'Millbrook');
    await user.click(screen.getByRole('button', { name: /start it/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    });
  });

  it('leaves the open campaign alone when cancelled', async () => {
    const user = userEvent.setup();
    boot();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    await user.click(screen.getByRole('button', { name: /start a new campaign/i }));
    await user.click(await screen.findByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cedar Hollow');
  });
});
