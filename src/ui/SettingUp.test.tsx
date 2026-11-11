import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { slotLabel } from '../labels/baseLabels';
import { CampaignProvider } from '../state/CampaignProvider';
import { campaignLog, lane, moveTo, openMenu, openPanel } from '../test/screens';
import { App } from './App';

const AT = '2026-11-11T09:00:00.000Z';

const picked: LogEntry = {
  turn: 5,
  phase: 'mission',
  at: AT,
  event: { kind: 'campaign-continued', turnsSinceSiege: 1 },
};

/** A campaign picked up at turn 5, still being set up, Earl a Leader with Archery. */
const settingUp = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 5,
  step: 'select-mission',
  startingCommunityBuilt: true,
  survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), skills: { archery: 0 } }],
  base: { id: 'hobby-farm', slots: {} },
  log: [picked],
  ...overrides,
});

function openWith(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const checklist = () => screen.queryByRole('region', { name: 'Setting up' });

/** The slot card for this slot, in the base's modal. */
const slotCard = (slot: string) => {
  const heading = screen.getByRole('heading', { name: slotLabel(slot) });
  return within(heading.closest('li') as HTMLElement);
};

describe('setting up a campaign picked up partway (#210)', () => {
  it('lists what to enter above the turn, until it’s done', async () => {
    const user = openWith(settingUp());

    const list = within(checklist() as HTMLElement);
    expect(list.getByText('Last turn’s assignments')).toBeTruthy();
    expect(list.getByRole('button', { name: 'Open roster' })).toBeTruthy();

    await user.click(list.getByRole('button', { name: 'Setting up is done' }));

    expect(checklist()).toBeNull();
    openMenu('log');
    expect(campaignLog().textContent).toContain(
      'Finished setting up, and the campaign is tracked from here.',
    );
  });

  it('isn’t there for a campaign tracked from turn 1', () => {
    openWith({ ...settingUp(), log: [] });

    expect(checklist()).toBeNull();
  });

  it('sets a skill level and a common skill’s Score on the sheet, without XP', async () => {
    const user = openWith(settingUp());

    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: 'Sheet' }));
    await user.selectOptions(screen.getByLabelText('Archery level'), '3');
    await user.selectOptions(screen.getByLabelText('Move Score bought'), '8');

    expect(screen.getByLabelText<HTMLSelectElement>('Archery level').value).toBe('3');
    expect(screen.getByLabelText<HTMLSelectElement>('Move Score bought').value).toBe('8');
    expect(screen.queryByRole('button', { name: /archery to level/i })).toBeNull();
  });

  it('enters what’s built in a slot, and takes it back', async () => {
    const user = openWith(settingUp());

    openPanel('base');
    const card = slotCard('front-yard');
    await user.click(card.getByRole('button', { name: /build in/i }));
    await user.selectOptions(card.getByLabelText('Facility'), 'Watchtower');
    await user.click(card.getByRole('button', { name: 'Already built' }));

    expect(slotCard('front-yard').getByText('Watchtower')).toBeTruthy();

    await user.click(
      slotCard('front-yard').getByRole('button', { name: /take back what’s entered/i }),
    );

    expect(slotCard('front-yard').queryByText('Watchtower')).toBeNull();
  });

  it('enters last turn’s order as already paid, and takes it back', async () => {
    const user = openWith(settingUp());

    openPanel('base');
    const card = slotCard('front-yard');
    await user.click(card.getByRole('button', { name: /build in/i }));
    await user.selectOptions(card.getByLabelText('Facility'), 'Watchtower');
    await user.click(card.getByRole('button', { name: 'Ordered last turn' }));

    expect(slotCard('front-yard').getByText(/on order: .*watchtower/i)).toBeTruthy();

    await user.click(slotCard('front-yard').getByRole('button', { name: /take back/i }));

    expect(slotCard('front-yard').queryByText(/on order/i)).toBeNull();
  });

  it('marks rubble already cleared', async () => {
    const user = openWith(settingUp({ base: { id: 'rural-church', slots: {} } }));

    openPanel('base');
    await user.click(slotCard('pews-1').getByRole('button', { name: /^clear/i }));
    await user.click(slotCard('pews-1').getByRole('button', { name: 'Already cleared' }));

    expect(slotCard('pews-1').getByText(/^cleared/i)).toBeTruthy();
  });

  it('enters last turn’s assignments on a board with every lane', async () => {
    const user = openWith(settingUp());

    await user.click(
      within(checklist() as HTMLElement).getByRole('button', { name: 'Enter assignments' }),
    );
    moveTo(/earl rhodes/i, /mission team 1/i);

    expect(within(lane(/mission team 1/i)).getByText('Earl Rhodes')).toBeTruthy();
    expect(lane(/project team/i)).toBeTruthy();
  });
});
