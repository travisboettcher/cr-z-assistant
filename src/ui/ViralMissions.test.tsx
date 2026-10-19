import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MissionId } from '../data/missions';
import { createNewCampaign, type Base, type Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-10-18T09:00:00.000Z';

const chose = (mission: MissionId): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team: 1, mission, names: [] },
});

const clinic = (containment: boolean): Base => ({
  id: 'small-town-home',
  slots: {
    garage: {
      built: { facility: 'medical-clinic', builtOnTurn: 1 },
      ...(containment ? { upgrades: ['containment'] } : {}),
    },
  },
});

/** Turn 4 of a Viral campaign, Earl on team 1 playing `mission`. */
function playing(mission: MissionId, overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
    origin: 'viral',
    base: clinic(true),
    survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
    assignments: { earl: { task: 'mission', team: 1 } },
    log: [chose(mission)],
    ...overrides,
  };
}

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });
const group = (name: RegExp) => within(within(walk()).getByRole('group', { name }));

describe('recording a Viral mission (pp. 103–107; Z7-6)', () => {
  it('asks Experimental Data for its points of interest and the Broken Cage, and says what it unlocks', async () => {
    const user = open(playing('experimental-data'));
    const form = group(/how experimental data ended/i);
    const record = form.getByRole('button', { name: 'Record Experimental Data' });

    expect(record).toBeDisabled();
    await user.type(form.getByLabelText('Points of interest investigated'), '1');
    await user.click(form.getByLabelText('The Broken Cage check passed'));

    expect(
      form.getByText('Containment is unlocked for the Medical Clinic, at its usual Hardware.'),
    ).toBeInTheDocument();
    await user.click(record);

    expect(walk().textContent).toContain(
      'Experimental Data: 1 point of interest investigated, the Broken Cage check passed',
    );
  });

  it('says Experimental Data can be played again when nothing was investigated', async () => {
    const user = open(playing('experimental-data'));
    const form = group(/how experimental data ended/i);

    await user.type(form.getByLabelText('Points of interest investigated'), '0');

    expect(
      form.getByText(
        'No point of interest was investigated, so Experimental Data can be played again.',
      ),
    ).toBeInTheDocument();
  });

  it('puts Bring It On Home’s zombie into Containment, or says there is none', async () => {
    const user = open(playing('bring-it-on-home'));
    const form = group(/how bring it on home ended/i);

    await user.type(form.getByLabelText('Ensnared zombies that left the area'), '2');

    expect(form.getByText(/^One zombie goes into Containment\./)).toBeInTheDocument();
    expect(
      form.getByText(
        /The XP for the other zombies and the special zombies’ items are added by hand\./,
      ),
    ).toBeInTheDocument();
  });

  it('holds no zombie without a Containment on the base', async () => {
    const user = open(playing('bring-it-on-home', { base: clinic(false) }));
    const form = group(/how bring it on home ended/i);

    await user.type(form.getByLabelText('Ensnared zombies that left the area'), '2');

    expect(
      form.getByText(/^No Containment stands on the base, so no zombie is held\./),
    ).toBeInTheDocument();
  });

  it('keeps Medical Salvage’s tokens at the base', async () => {
    const user = open(playing('medical-salvage'));
    const form = group(/how medical salvage ended/i);

    await user.type(form.getByLabelText('Medical Supply tokens'), '3');
    expect(form.getByText('The base keeps 3 Medical Supply tokens.')).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Record Medical Salvage' }));

    expect(walk().textContent).toContain('Medical Salvage: 3 Medical Supply tokens');
  });
});
