import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CampaignProvider } from '../state/CampaignProvider';
import { campaignLog, openMenu } from '../test/screens';
import { App } from './App';

function openEmpty() {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'empty' }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

/** Fill a number field with this, from empty. */
async function typeIn(user: ReturnType<typeof userEvent.setup>, label: RegExp, value: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  await user.type(field, value);
}

describe('continuing a campaign already under way (#210)', () => {
  it('asks nothing more until it’s ticked', () => {
    openEmpty();

    expect(screen.getByLabelText(/continue a campaign already under way/i)).not.toBeChecked();
    expect(screen.queryByLabelText(/turns since the last siege/i)).toBeNull();
  });

  it('opens at the turn named, with what it brings in the history', async () => {
    const user = openEmpty();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.selectOptions(screen.getByLabelText(/origin of the rot/i), 'viral');
    await user.click(screen.getByLabelText(/continue a campaign already under way/i));
    await typeIn(user, /^turn$/i, '5');
    await typeIn(user, /turns since the last siege/i, '3');
    await user.click(screen.getByLabelText(/went short at last turn’s feed/i));
    await typeIn(user, /^hunger$/i, '6');
    await typeIn(user, /head count then/i, '4');
    await user.click(screen.getByLabelText(/unlocked by experimental data/i));
    await typeIn(user, /hardware it costs/i, '3');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    expect(screen.getByRole('region', { name: 'Turn 5' })).toBeTruthy();
    expect(campaignLog().textContent).toContain(
      'Picked up the campaign at turn 5, with 3 turns since the last siege; last turn 6 Food short against a head count of 4; Containment unlocked at 3 Hardware.',
    );
  });

  it('waits, and says why, for answers it can’t take', async () => {
    const user = openEmpty();

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByLabelText(/continue a campaign already under way/i));
    await typeIn(user, /^turn$/i, '3');
    await typeIn(user, /turns since the last siege/i, '4');

    expect(
      screen.getByText('The turns since the last siege are a whole number from 0 to 2.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeDisabled();
  });

  it('asks Magic’s history only under the Magic origin', async () => {
    const user = openEmpty();

    await user.click(screen.getByLabelText(/continue a campaign already under way/i));
    expect(screen.queryByLabelText(/teleport seen/i)).toBeNull();
    expect(screen.queryByLabelText(/unlocked by experimental data/i)).toBeNull();

    await user.selectOptions(screen.getByLabelText(/origin of the rot/i), 'magic');
    await user.click(screen.getByLabelText(/teleport seen/i));
    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    expect(campaignLog().textContent).toContain('spells seen: Teleport');
  });

  it('is offered from the menu too, while a campaign is open', async () => {
    const user = openEmpty();
    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    openMenu('file');
    await user.click(screen.getByRole('button', { name: 'Start a new campaign' }));
    const dialog = within(screen.getByRole('dialog', { name: /start a new campaign/i }));
    await user.type(dialog.getByLabelText(/new campaign name/i), 'Millbrook');
    await user.click(dialog.getByLabelText(/continue a campaign already under way/i));
    await typeIn(user, /^turn$/i, '4');
    await user.click(dialog.getByRole('button', { name: 'Start campaign' }));

    expect(screen.getByRole('region', { name: 'Turn 4' })).toBeTruthy();
  });
});
