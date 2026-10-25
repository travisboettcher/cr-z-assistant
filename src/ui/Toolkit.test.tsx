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

describe('Permanent Injuries on the sheet (pp. 137–138; R86; Z7-11)', () => {
  const sheet = async (campaign: Campaign) => {
    const user = open(campaign);
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    return { user, sheet: within(screen.getByRole('region', { name: 'Earl Rhodes' })) };
  };

  it('are taken at creation for their XP, paying debt first, and taken back off', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl({ advantages: ['forager'], xpDebt: 3 })],
    });

    expect(earlSheet.getByText(/No Permanent Injuries/)).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.selectOptions(earlSheet.getByLabelText(/^One-handed/), '2');
    expect(earlSheet.getByLabelText(/^Experience debt/)).toHaveValue(0);
    expect(earlSheet.getByText('5 XP once saved')).toBeTruthy();
    await user.selectOptions(earlSheet.getByLabelText(/^One-handed/), '1');
    expect(earlSheet.getByText('1 XP once saved')).toBeTruthy();
    await user.selectOptions(earlSheet.getByLabelText(/^Deaf/), '1');
    await user.click(earlSheet.getByRole('button', { name: 'Save traits' }));

    expect(earlSheet.getByText(/Injuries: One-handed, Deaf/)).toBeTruthy();
  });

  it('are corrected without XP with the box unticked, and count a repeat', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl({ xp: 2 })],
    });

    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.click(earlSheet.getByLabelText(/^Taken at creation/));
    await user.selectOptions(earlSheet.getByLabelText(/^Bad knee/), '2');
    expect(earlSheet.getByText('2 XP once saved')).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Save traits' }));

    expect(earlSheet.getByText(/Injuries: Bad knee ×2/)).toBeTruthy();
  });

  it('keep XP set above while the editor is open, adding theirs to it', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl()],
    });

    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.selectOptions(earlSheet.getByLabelText(/^Deaf/), '1');
    await user.click(earlSheet.getByRole('button', { name: /^set experience$/i }));
    const field = screen.getByLabelText(/experience for Earl Rhodes/i);
    await user.clear(field);
    await user.type(field, '10');
    await user.click(screen.getByRole('button', { name: /save experience/i }));
    expect(earlSheet.getByText('12 XP once saved')).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Save traits' }));
    await user.click(earlSheet.getByRole('button', { name: /^set experience$/i }));

    expect(screen.getByLabelText(/experience for Earl Rhodes/i)).toHaveValue(12);
  });

  it('rule out Ambidextrous with One-handed, either way round', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      traitsEnabled: true,
      survivors: [earl()],
    });

    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.click(earlSheet.getByLabelText(/^Ambidextrous/));
    const oneHanded = within(earlSheet.getByLabelText(/^One-handed/));
    expect(oneHanded.getByRole('option', { name: 'Once' })).toBeDisabled();
    expect(oneHanded.getByRole('option', { name: 'None' })).toBeEnabled();
    await user.click(earlSheet.getByLabelText(/^Ambidextrous/));
    await user.selectOptions(earlSheet.getByLabelText(/^One-handed/), '1');
    expect(earlSheet.getByLabelText(/^Ambidextrous/)).toBeDisabled();
  });

  it('offer only this campaign’s origin injury, or one already held', async () => {
    const { user, sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow', { origin: 'magic' }),
      traitsEnabled: true,
      survivors: [earl({ injuries: { sickly: 1 } })],
    });

    expect(earlSheet.getByText(/Injuries: Sickly/)).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    expect(earlSheet.getByLabelText(/^Touched/)).toBeTruthy();
    expect(earlSheet.getByLabelText(/^Sickly/)).toBeTruthy();
    expect(earlSheet.queryByLabelText(/^Psychic Scars/)).toBeNull();
  });

  it('show for somebody injured with the traits off', async () => {
    const { sheet: earlSheet } = await sheet({
      ...createNewCampaign('Cedar Hollow'),
      survivors: [earl({ injuries: { deaf: 1 } })],
    });

    expect(earlSheet.getByText(/Injuries: Deaf/)).toBeTruthy();
  });
});
