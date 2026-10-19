import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { openPanel } from '../test/screens';
import { App } from './App';

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const earl = createSurvivor('Earl Rhodes', 2, { id: 'earl' });

const magic = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 3,
  origin: 'magic',
  survivors: [earl],
  ...overrides,
});

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });

describe('Humanity (pg. 127; R114; Z7-9)', () => {
  it('reads out of 5 on a Magic campaign’s sheet, and not on another', async () => {
    const user = open(magic());
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    expect(
      within(screen.getByRole('region', { name: 'Earl Rhodes' })).getByText('3 / 5'),
    ).toBeTruthy();
  });

  it('has no field outside a Magic campaign', async () => {
    const user = open(magic({ origin: 'viral' }));
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    expect(
      within(screen.getByRole('region', { name: 'Earl Rhodes' })).queryByText(/^Humanity/),
    ).toBeNull();
  });

  it('gives the project team its 1 at Check for Rot, once', async () => {
    const user = open(magic({ step: 'check-for-rot', assignments: { earl: { task: 'project' } } }));
    const region = within(walk()).getByRole('region', { name: 'Humanity' });

    expect(region.textContent).toContain('A turn on the project team gives 1 Humanity');
    await user.click(
      within(region).getByRole('button', { name: 'Give the project team its Humanity' }),
    );

    expect(
      within(region).getByText('Earl Rhodes gained 1 Humanity for a turn on the project team.'),
    ).toBeTruthy();
    expect(within(region).queryByRole('button')).toBeNull();
  });
});

describe('recording a Magic mission (pp. 112–114; R123, R124; Z7-9)', () => {
  const playing = (mission: 'the-graveyard' | 'the-necromancer' | 'the-dark') =>
    magic({
      turn: 4,
      step: 'tactical-mission',
      assignments: { earl: { task: 'mission', team: 1 } },
      log: [
        {
          turn: 4,
          phase: 'mission',
          at: '2026-10-19T09:00:00.000Z',
          event: { kind: 'mission-selected', team: 1, mission, names: [] },
        },
      ],
    });
  const group = (name: RegExp) => within(within(walk()).getByRole('group', { name }));

  it('asks whether The Graveyard was completed, and says it unlocks the Library', async () => {
    const user = open(playing('the-graveyard'));
    const form = group(/how the graveyard ended/i);

    await user.click(form.getByLabelText('The mission was completed'));
    expect(form.getByText(/The Mystic Library is unlocked\./)).toBeTruthy();
    await user.click(form.getByRole('button', { name: 'Record The Graveyard' }));

    expect(walk().textContent).toContain('The Graveyard: completed');
  });

  it('asks The Necromancer both, and says what each gives', async () => {
    const user = open(playing('the-necromancer'));
    const form = group(/how the necromancer ended/i);

    await user.click(form.getByLabelText('The mission was completed'));
    await user.click(form.getByLabelText('The Necromancer was killed'));

    expect(form.getByText(/The next spell learned costs 3 XP less\./)).toBeTruthy();
    expect(form.getByText(/cost 1 Labor less from now on\./)).toBeTruthy();
  });

  it('asks The Dark nothing more than Humanity and Health', () => {
    open(playing('the-dark'));
    const form = group(/how the dark ended/i);

    expect(form.queryByLabelText('The mission was completed')).toBeNull();
    expect(form.getByLabelText('Earl Rhodes’s Humanity')).toHaveValue(3);
  });
});
