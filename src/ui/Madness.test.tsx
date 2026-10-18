import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { openPanel } from '../test/screens';
import { App } from './App';

const AT = '2026-10-18T09:00:00.000Z';

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});

/** Turn 3 of a Cosmic Horror campaign with Earl. */
const cosmic = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 3,
  origin: 'cosmic-horror',
  survivors: [earl({ madness: 13 })],
  ...overrides,
});

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });

describe('Madness on the sheet (pg. 124; Z7-7)', () => {
  it('reads beside Health in a Cosmic Horror campaign, saying when they will go Lost', async () => {
    const user = open(cosmic());
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));
    const sheet = within(screen.getByRole('region', { name: 'Earl Rhodes' }));

    expect(sheet.getByText('goes Lost at Departures')).toBeTruthy();
    expect(sheet.getByText(/^Madness/)).toBeTruthy();
  });

  it('is not there in any other campaign', async () => {
    const user = open(cosmic({ origin: 'viral' }));
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    expect(
      within(screen.getByRole('region', { name: 'Earl Rhodes' })).queryByText(/^Madness/),
    ).toBeNull();
  });
});

describe('Madness at the end of a mission (Z7-7)', () => {
  it('is asked of each member, and recorded with their Health', async () => {
    const user = open(
      cosmic({
        turn: 4,
        step: 'tactical-mission',
        survivors: [earl({ madness: 2 })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [
          {
            turn: 4,
            phase: 'mission',
            at: AT,
            event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
          },
        ],
      }),
    );
    const madness = within(walk()).getByLabelText('Earl Rhodes’s Madness');

    expect(madness).toHaveValue(2);
    await user.clear(madness);
    await user.type(madness, '6');
    await user.click(within(walk()).getByRole('button', { name: 'Record Rescue Strangers' }));

    expect(walk().textContent).toContain('Earl Rhodes at 2 Health and 6 Madness');
  });
});
