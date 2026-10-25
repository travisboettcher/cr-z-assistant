import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { openMenu, openPanel } from '../test/screens';
import { App } from './App';

function open(campaign: Campaign | null) {
  const user = userEvent.setup();

  render(
    <CampaignProvider
      initialState={campaign === null ? { status: 'empty' } : { status: 'open', campaign }}
    >
      <App />
    </CampaignProvider>,
  );

  return user;
}

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});

describe('starting a campaign with an origin and the Toolkit’s traits (R84, R98; Z7-10)', () => {
  it('asks both, and the campaign begins with them', async () => {
    const user = open(null);

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.selectOptions(screen.getByLabelText(/origin of the rot/i), 'magic');
    await user.click(screen.getByLabelText(/use the apocalypse toolkit/i));
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    openMenu('settings');
    const settings = within(screen.getByRole('dialog', { name: 'Campaign settings' }));
    expect(settings.getByText('Magic')).toBeTruthy();
    expect(settings.getByLabelText('In use')).toBeChecked();
  });

  it('starts with neither unless asked', async () => {
    const user = open(null);

    await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
    await user.click(screen.getByRole('button', { name: 'New campaign' }));

    openMenu('settings');
    const settings = within(screen.getByRole('dialog', { name: 'Campaign settings' }));
    expect(settings.getByText('None')).toBeTruthy();
    expect(settings.getByLabelText('In use')).not.toBeChecked();
  });
});

describe('switching the traits part-way (R158; Z7-10)', () => {
  it('switches them on at once', async () => {
    const user = open({ ...createNewCampaign('Cedar Hollow'), survivors: [earl()] });

    openMenu('settings');
    await user.click(screen.getByLabelText('In use'));

    expect(screen.getByLabelText('In use')).toBeChecked();
  });

  it('asks before taking Advantages away, and keeps them on “Keep them”', async () => {
    const user = open({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl({ advantages: ['forager'], xpDebt: 3 })],
    });

    openMenu('settings');
    await user.click(screen.getByLabelText('In use'));
    const confirm = within(screen.getByRole('dialog', { name: /stop using the survivor traits/i }));
    expect(
      confirm.getByText(/Earl Rhodes loses their Advantages, experience debt and/),
    ).toBeTruthy();

    await user.click(confirm.getByRole('button', { name: 'Keep them' }));
    expect(screen.getByLabelText('In use')).toBeChecked();

    await user.click(screen.getByLabelText('In use'));
    await user.click(
      within(screen.getByRole('dialog', { name: /stop using the survivor traits/i })).getByRole(
        'button',
        { name: 'Stop using them' },
      ),
    );
    expect(screen.getByLabelText('In use')).not.toBeChecked();
  });
});

describe('Advantages on the sheet (pg. 139; R158; Z7-10)', () => {
  const sheet = async (campaign: Campaign) => {
    const user = open(campaign);
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    return { user, sheet: within(screen.getByRole('region', { name: 'Earl Rhodes' })) };
  };

  it('are taken in the traits editor, each adding its debt', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl()],
    });

    expect(earlSheet.getByText(/No Advantages/)).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.click(earlSheet.getByLabelText(/^Forager/));
    await user.click(earlSheet.getByLabelText(/^Natural Leader/));
    expect(earlSheet.getByLabelText(/^Experience debt/)).toHaveValue(7);
    await user.click(earlSheet.getByLabelText(/^Forager/));
    expect(earlSheet.getByLabelText(/^Experience debt/)).toHaveValue(4);
    await user.click(earlSheet.getByRole('button', { name: 'Save traits' }));

    expect(
      earlSheet.getByText(/Advantages: Natural Leader · 4 XP of experience debt/),
    ).toBeTruthy();
  });

  it('aren’t shown with the traits off, for somebody with none', async () => {
    const { sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      survivors: [earl()],
    });

    expect(earlSheet.queryByText(/Advantages/)).toBeNull();
  });
});
