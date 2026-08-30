import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewCampaign } from '../engine/campaign';
import { serializeCampaign } from '../persistence/exportFile';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

function saveFile(contents: string, name = 'cedar-hollow.json') {
  return new File([contents], name, { type: 'application/json' });
}

/** A real exported save, produced by the same function that writes them. */
function exportedCampaign(name: string, turn = 1) {
  return serializeCampaign({ ...createNewCampaign(name, FIXED), turn });
}

function renderApp() {
  render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );
}

async function startCampaign(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText(/campaign name/i), name);
  await user.click(screen.getByRole('button', { name: 'New campaign' }));
}

/** The file input is hidden behind a button, so tests drive it directly. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error('no file input rendered');
  return input;
}

describe('importing into an empty app', () => {
  it('opens a campaign from an exported file', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.upload(fileInput(), saveFile(exportedCampaign('Millbrook', 4)));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    });
  });

  /**
   * Nothing is open, so there is nothing to lose — asking would be a dialog
   * whose only honest answer is yes.
   */
  it('does not ask for confirmation when nothing is open', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.upload(fileInput(), saveFile(exportedCampaign('Millbrook')));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('importing over an open campaign', () => {
  it('asks before replacing, and keeps the open campaign when declined', async () => {
    const user = userEvent.setup();
    renderApp();
    await startCampaign(user, 'Cedar Hollow');

    await user.upload(fileInput(), saveFile(exportedCampaign('Millbrook')));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/millbrook/i);

    await user.click(screen.getByRole('button', { name: /keep the open campaign/i }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cedar Hollow');
  });

  it('replaces the open campaign when confirmed', async () => {
    const user = userEvent.setup();
    renderApp();
    await startCampaign(user, 'Cedar Hollow');

    await user.upload(fileInput(), saveFile(exportedCampaign('Millbrook', 6)));
    await user.click(await screen.findByRole('button', { name: /replace it/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    });
  });
});

describe('when the file is not a usable campaign', () => {
  it.each([
    ['truncated JSON', '{"schemaVersion": 1, "name": "Ced', /cut short|could not be read/i],
    ['a different JSON file', '{"hello": "world"}', /not a County Road Z campaign|not complete/i],
    [
      'a save from a newer version',
      JSON.stringify({ ...createNewCampaign('Millbrook', FIXED), schemaVersion: 99 }),
      /newer version/i,
    ],
  ])('explains %s rather than failing silently', async (_label, contents, expected) => {
    const user = userEvent.setup();
    renderApp();

    await user.upload(fileInput(), saveFile(contents));

    expect(await screen.findByRole('alert')).toHaveTextContent(expected);
    // Still on the empty state: a bad file must not half-open anything.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Campaign Tracker');
  });

  it('leaves the open campaign untouched when the file is bad', async () => {
    const user = userEvent.setup();
    renderApp();
    await startCampaign(user, 'Cedar Hollow');

    await user.upload(fileInput(), saveFile('not json at all'));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cedar Hollow');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
