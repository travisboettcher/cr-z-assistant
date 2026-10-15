import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Item } from '../engine/campaign';
import type { CampaignEvent, LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-10-15T09:00:00.000Z';

const rifle: Item = { id: 'rifle-1', item: 'rifle', grade: 'standard' };
const bat: Item = { id: 'bat-1', item: 'blunt', grade: 'standard' };

const on4 = (event: CampaignEvent): LogEntry => ({ turn: 4, phase: 'mission', at: AT, event });

/** Turn 4 at Play the Mission: Earl and Carla's Thin the Herd is played. */
function played(log: readonly LogEntry[] = []): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
    survivors: [
      { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), items: [rifle, bat] },
      createSurvivor('Carla Proust', 3, { id: 'carla' }),
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
    },
    log: [
      on4({
        kind: 'mission-selected',
        team: 1,
        mission: 'thin-the-herd',
        names: ['Earl Rhodes', 'Carla Proust'],
      }),
      ...log,
    ],
  };
}

const OUTCOME = on4({
  kind: 'thin-the-herd-resolved',
  team: 1,
  startingZombies: 4,
  zombiesLeft: 2,
  survivorsExited: 1,
  allIncapacitated: false,
  wounds: [
    { survivor: 'earl', name: 'Earl Rhodes', health: 0 },
    { survivor: 'carla', name: 'Carla Proust', health: 3 },
  ],
});

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

const walk = () => within(screen.getByRole('region', { name: /^turn \d+$/i }));

describe('a death on a mission (pp. 31, 34; R71; Z5-13)', () => {
  it('waits for the team’s outcome', () => {
    open(played());

    expect(walk().queryByText(/Somebody died on mission team 1/)).toBeNull();
  });

  it('records who died, what a teammate took, and what stayed on the map', async () => {
    const user = open(played([OUTCOME]));

    await user.click(walk().getByText('Somebody died on mission team 1’s mission'));
    await user.selectOptions(walk().getByLabelText('Who died'), 'earl');
    await user.selectOptions(walk().getByLabelText('standard rifle'), 'carla');
    await user.click(walk().getByRole('button', { name: 'Record Earl Rhodes’s death' }));

    expect(
      walk().getByText(
        'Earl Rhodes, a Leader, died on mission team 1’s mission, and standard blunt weapon stayed on the map.',
      ),
    ).toBeInTheDocument();
    // Carla went out alone now, so she is all the picker offers.
    expect(walk().getByLabelText('Who died')).toHaveDisplayValue('Carla Proust');
  });

  it('says when the one who died carried nothing', async () => {
    const user = open(played([OUTCOME]));

    await user.click(walk().getByText('Somebody died on mission team 1’s mission'));
    await user.selectOptions(walk().getByLabelText('Who died'), 'carla');

    expect(walk().getByText('Carla Proust carried nothing.')).toBeInTheDocument();
  });
});
