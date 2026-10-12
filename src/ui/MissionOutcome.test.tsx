import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { MissionId } from '../data/missions';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-09-12T09:00:00.000Z';

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

/** A team's choice at Select Mission, which the outcome is asked for (Z4-2). */
const chose = (mission: 'siege-defense' | 'thin-the-herd'): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team: 1, mission, names: [] },
});

function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
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
const field = (name: RegExp) => within(walk()).getByLabelText(name);

describe('the outcome of a Siege Defense (pg. 86)', () => {
  it('waits for the counts before it can be recorded', () => {
    open(playing({ log: [called, chose('siege-defense')] }));

    expect(
      within(walk()).getByRole('button', { name: /record the siege defense/i }),
    ).toBeDisabled();
  });

  it('says what a clean siege does, and keeps saying it once recorded', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '0');
    await user.type(field(/out over the map edge/i), '2');

    expect(walk().textContent).toContain('go back to 0');

    await user.click(within(walk()).getByRole('button', { name: /record the siege defense/i }));

    expect(within(walk()).queryByRole('button', { name: /record/i })).toBeNull();
    expect(walk().textContent).toContain('Siege Defense: 0 zombies left, 2 survivors out');
  });

  it('names an overrun base, and the choice the app leaves to the table', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');

    expect(walk().textContent).toContain('keep counting');
    expect(walk().textContent).toContain('The base is overrun');
  });
});

describe('the outcome of a Thin the Herd (pg. 81)', () => {
  it('is offered when a team chose it', () => {
    open(playing({ log: [chose('thin-the-herd')] }));

    expect(within(walk()).getByRole('group', { name: /thin the herd/i })).toBeInTheDocument();
  });

  it('is not offered when no team chose it', () => {
    open(playing());

    expect(within(walk()).queryByRole('group', { name: /thin the herd/i })).toBeNull();
  });

  it('halves the counter, and says everybody down brings the horde', async () => {
    const user = open(playing({ log: [chose('thin-the-herd')] }));

    await user.type(field(/at the start/i), '8');
    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');
    expect(walk().textContent).toContain('halved, rounding down');

    await user.click(within(walk()).getByLabelText(/incapacitated/i));
    expect(walk().textContent).toContain('next roll against the horde succeeds on its own');
  });
});

/** A choice by any team for any mission, for the Z4-3 forms below. */
const teamChose = (team: number, mission: MissionId, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team, mission, names: [] },
});

const group = (name: RegExp) => within(within(walk()).getByRole('group', { name }));

describe('an outcome for every mission a team chose (Z4-3)', () => {
  it('asks each team for its own mission’s counts, and names the teams', async () => {
    const user = open(
      playing({
        survivors: [
          createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
          createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
        ],
        assignments: {
          earl: { task: 'mission', team: 1 },
          ruby: { task: 'mission', team: 2 },
        },
        log: [teamChose(1, 'gather-materials'), teamChose(2, 'rescue-strangers')],
      }),
    );

    const gathering = group(/mission team 1: how gather materials ended/i);
    const rescuing = group(/mission team 2: how rescue strangers ended/i);

    await user.type(gathering.getByLabelText(/materials carried off the map/i), '5');
    await user.click(gathering.getByRole('button', { name: 'Record Gather Materials' }));
    expect(walk().textContent).toContain('Gather Materials: 5 materials carried off the map.');

    // Ruby is Tier 3: a Tier 4 stranger is past anybody on her team (pg. 31).
    await user.selectOptions(rescuing.getByLabelText('Stranger’s Tier'), '4');
    await user.click(rescuing.getByRole('button', { name: 'Add a stranger' }));
    expect(rescuing.getByText(/Tier 4 or higher/)).toBeInTheDocument();

    await user.click(rescuing.getByRole('button', { name: 'Record Rescue Strangers' }));
    expect(walk().textContent).toContain(
      'Rescue Strangers (mission team 2): 1 stranger rescued (Tier 4).',
    );
  });

  it('waits for an end condition, and plays a failed First Mission again (R21)', async () => {
    const user = open(
      playing({
        turn: 1,
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'first-mission', 1)],
      }),
    );

    const first = group(/how the first mission ended/i);
    const record = first.getByRole('button', { name: 'Record the First Mission' });
    expect(record).toBeDisabled();

    await user.selectOptions(first.getByLabelText(/end condition met/i), 'none');
    expect(walk().textContent).toContain('turn 1 plays the First Mission again');

    await user.click(record);
    expect(walk().textContent).toContain(
      'First Mission: no end condition met, no strangers rescued.',
    );
  });

  it('records a story mission as played, with nothing to count', async () => {
    const user = open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'sentimental-value')],
      }),
    );

    await user.click(
      group(/how sentimental value ended/i).getByRole('button', {
        name: 'Record Sentimental Value',
      }),
    );
    expect(walk().textContent).toContain('Sentimental Value: played.');
  });
});

describe('the Health a team came home with (Z4-4)', () => {
  /** Earl (Tier 2, at 1 of 2) and Ruby (Tier 3, unhurt) on team 1, playing Gather Materials. */
  const gathering = (overrides: Partial<Campaign> = {}) =>
    playing({
      survivors: [
        { ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }), currentHp: 1 },
        createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
      ],
      assignments: {
        earl: { task: 'mission', team: 1 },
        ruby: { task: 'mission', team: 1 },
      },
      log: [teamChose(1, 'gather-materials')],
      ...overrides,
    });

  it('starts each member at their Health now, and records it with the outcome', async () => {
    const user = open(gathering());
    const form = group(/how gather materials ended/i);

    expect(form.getByLabelText('Earl Rhodes’s Health')).toHaveValue(1);
    expect(form.getByLabelText('Ruby Vance’s Health')).toHaveValue(3);
    expect(form.queryByLabelText(/Infection/)).toBeNull();

    await user.type(form.getByLabelText(/materials carried off the map/i), '2');
    await user.clear(form.getByLabelText('Ruby Vance’s Health'));
    await user.type(form.getByLabelText('Ruby Vance’s Health'), '0');
    await user.click(form.getByRole('button', { name: 'Record Gather Materials' }));

    expect(walk().textContent).toContain(
      'Gather Materials: 2 materials carried off the map. At the end: Earl Rhodes at 1 Health, Ruby Vance at 0 Health.',
    );
  });

  it('refuses Health above a survivor’s maximum, or none at all', async () => {
    const user = open(gathering());
    const form = group(/how gather materials ended/i);
    const record = form.getByRole('button', { name: 'Record Gather Materials' });

    await user.type(form.getByLabelText(/materials carried off the map/i), '2');
    expect(record).toBeEnabled();

    await user.type(form.getByLabelText('Earl Rhodes’s Health'), '5');
    expect(record).toBeDisabled();
    expect(form.getByText('Earl Rhodes’s Health is a whole number from 0 to 2.')).toBeTruthy();

    await user.clear(form.getByLabelText('Earl Rhodes’s Health'));
    expect(record).toBeDisabled();
  });

  it('asks for Infection as well in a Viral campaign (pg. 123)', async () => {
    const user = open(
      gathering({
        origin: 'viral',
        survivors: [
          createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
          { ...createSurvivor('Ruby Vance', 3, { id: 'ruby' }), infection: 2 },
        ],
      }),
    );
    const form = group(/how gather materials ended/i);

    expect(form.getByLabelText('Ruby Vance’s Infection')).toHaveValue(2);

    await user.type(form.getByLabelText(/materials carried off the map/i), '1');
    await user.type(form.getByLabelText('Earl Rhodes’s Infection'), '3');
    await user.click(form.getByRole('button', { name: 'Record Gather Materials' }));

    expect(walk().textContent).toContain(
      'At the end: Earl Rhodes at 2 Health and 3 Infection, Ruby Vance at 3 Health and 2 Infection.',
    );
  });
});
