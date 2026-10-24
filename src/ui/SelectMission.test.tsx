import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-10-12T09:00:00.000Z';

/** Turn 4 at Select Mission: Earl and Carla on team 1, Ruby on team 2. */
function selecting(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'select-mission',
    survivors: [
      createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
      createSurvivor('Carla Proust', 2, { id: 'carla' }),
      createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
    ],
    assignments: {
      earl: { task: 'mission', team: 1 },
      carla: { task: 'mission', team: 1 },
      ruby: { task: 'mission', team: 2 },
    },
    ...overrides,
  };
}

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

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
const team = (number: number) =>
  within(walk().getByRole('group', { name: `Mission team ${String(number)}` }));

describe('Select Mission (pg. 17; Z4-2)', () => {
  it('says a siege is due, and the Threat it was called at (pp. 23, 85; #198)', () => {
    open(selecting({ log: [called] }));

    expect(walk().getByText(/The horde came at Siege Threat 8, so/)).toBeInTheDocument();
  });

  it('asks each team the Planning Phase assigned for its own mission (pg. 21)', async () => {
    const user = open(selecting());

    expect(team(1).getByText('Earl Rhodes, Carla Proust')).toBeInTheDocument();
    expect(team(2).getByText('Ruby Vance')).toBeInTheDocument();

    await user.selectOptions(team(1).getByLabelText('Mission'), 'thin-the-herd');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));

    expect(
      team(1).getByText(/Mission team 1 chose Thin the Herd: Earl Rhodes, Carla Proust\./),
    ).toBeInTheDocument();
    expect(team(2).queryByText(/chose/)).toBeNull();
  });

  it('asks Gather Materials for the type it takes the rest in (pg. 80)', async () => {
    const user = open(selecting());

    expect(team(2).queryByLabelText('The rest in')).toBeNull();

    await user.selectOptions(team(2).getByLabelText('Mission'), 'gather-materials');
    // Food, Fuel and Hardware, and not Rare (pg. 80; Z4-6).
    expect(
      within(team(2).getByLabelText('The rest in'))
        .getAllByRole('option')
        .map((option) => option.textContent)
        .sort(),
    ).toEqual(['Food', 'Fuel', 'Hardware']);
    await user.selectOptions(team(2).getByLabelText('The rest in'), 'fuel');
    await user.click(team(2).getByRole('button', { name: 'Choose for team 2' }));

    expect(
      team(2).getByText(/chose Gather Materials, taking the rest in Fuel: Ruby Vance\./),
    ).toBeInTheDocument();
  });

  it('asks Claim a New Base for the base it claims, and names it (pg. 78; Z4-7)', async () => {
    const user = open(selecting());

    await user.selectOptions(team(1).getByLabelText('Mission'), 'thin-the-herd');
    expect(team(1).queryByLabelText('Base to claim')).toBeNull();

    await user.selectOptions(team(1).getByLabelText('Mission'), 'claim-a-new-base');
    expect(
      within(team(1).getByLabelText('Base to claim')).getByRole('option', {
        name: 'Distillery (Tier 2)',
      }),
    ).toBeInTheDocument();
    await user.selectOptions(team(1).getByLabelText('Base to claim'), 'distillery');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));

    expect(
      team(1).getByText(
        /Mission team 1 chose Claim a New Base, claiming a Distillery: Earl Rhodes, Carla Proust\./,
      ),
    ).toBeInTheDocument();
  });

  it('warns when the base would hold fewer Heroes than the community has (pg. 54)', async () => {
    const user = open(
      selecting({
        survivors: [
          createSurvivor('Earl Rhodes', 4, { id: 'earl' }),
          createSurvivor('Carla Proust', 4, { id: 'carla' }),
          createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
        ],
      }),
    );

    await user.selectOptions(team(1).getByLabelText('Mission'), 'claim-a-new-base');
    await user.selectOptions(team(1).getByLabelText('Base to claim'), 'summer-camp');

    expect(team(1).getByText(/This base holds 1 Hero and the community has 2/)).toBeInTheDocument();
    // A warning, not a refusal: the book lets a community claim any base.
    expect(team(1).getByRole('button', { name: 'Choose for team 1' })).toBeEnabled();

    await user.selectOptions(team(1).getByLabelText('Base to claim'), 'distillery');
    expect(team(1).queryByText(/This base holds/)).toBeNull();
  });

  it('refuses a second Claim a New Base, and says why (R20)', async () => {
    const user = open(selecting());

    await user.selectOptions(team(1).getByLabelText('Mission'), 'claim-a-new-base');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));
    await user.selectOptions(team(2).getByLabelText('Mission'), 'claim-a-new-base');

    expect(team(2).getByText(/already claiming a new base/)).toBeInTheDocument();
    expect(team(2).getByRole('button', { name: 'Choose for team 2' })).toBeDisabled();
  });

  it('lets the community skip the mission, and a choice take that back (pg. 17)', async () => {
    const user = open(selecting());

    await user.click(walk().getByRole('button', { name: 'Skip this turn’s mission' }));
    expect(walk().getByText(/skipped this turn’s mission/)).toBeInTheDocument();
    expect(walk().queryByRole('button', { name: 'Skip this turn’s mission' })).toBeNull();

    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));
    expect(walk().queryByText(/The community skipped/)).toBeNull();
  });

  it('offers only the Siege Defense, to everybody, when the horde called one', () => {
    open(selecting({ log: [called] }));

    expect(walk().queryByRole('group', { name: 'Mission team 2' })).toBeNull();
    expect(team(1).getByText('Earl Rhodes, Carla Proust, Ruby Vance')).toBeInTheDocument();
    expect(
      team(1)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['The Siege Defense']);
    expect(walk().queryByRole('button', { name: 'Skip this turn’s mission' })).toBeNull();
  });

  /** #237: one mission on offer is nothing to choose, so turn 1 asks nothing here. */
  it('asks nothing on turn 1, which plays the First Mission (pg. 76)', () => {
    open(selecting({ turn: 1, assignments: { earl: { task: 'mission', team: 1 } } }));

    expect(walk().queryByRole('combobox', { name: /mission/i })).toBeNull();
    expect(walk().queryByRole('button', { name: /choose for team/i })).toBeNull();
  });
});

/** A Rare Items trade made last turn binds this turn's first choice (R60; Z5-10). */
describe('a Rare Items trade under way', () => {
  it('says the first mission must be the Rare Goods Trader', () => {
    open(
      selecting({
        rareTrade: {
          madeOnTurn: 3,
          items: [
            {
              id: 'shield',
              item: 'riot-shield',
              grade: 'standard',
              subtable: 3,
              entry: 1,
              food: 4,
              fuel: 6,
            },
          ],
        },
      }),
    );

    expect(
      walk().getByText(/the first mission chosen must be the Rare Goods Trader/),
    ).toBeInTheDocument();
  });

  it('says nothing without one', () => {
    open(selecting());

    expect(walk().queryByText(/must be the Rare Goods Trader/)).toBeNull();
  });
});

/**
 * #236, R1. A recorded choice drew a live mission <select> beside its own
 * record, and the record named the team as it was now rather than when it was
 * chosen.
 */
describe('a team’s recorded choice', () => {
  const chose = (names: readonly string[]): LogEntry => ({
    turn: 4,
    phase: 'mission',
    at: AT,
    event: { kind: 'mission-selected', team: 1, mission: 'thin-the-herd', names },
  });

  it('is a record once chosen, with no live control beside it', async () => {
    const user = open(selecting());

    await user.selectOptions(team(1).getByLabelText('Mission'), 'thin-the-herd');
    await user.click(team(1).getByRole('button', { name: 'Choose for team 1' }));

    expect(team(1).getByText(/Mission team 1 chose Thin the Herd/)).toBeInTheDocument();
    expect(team(1).queryByLabelText('Mission')).toBeNull();
    expect(team(1).getByRole('button', { name: 'Change team 1’s mission' })).toBeInTheDocument();
  });

  it('names who was on the team when it was chosen, and says who is now', () => {
    // Recorded with Earl and Carla; Carla has come off the team since.
    open(
      selecting({
        assignments: { earl: { task: 'mission', team: 1 }, ruby: { task: 'mission', team: 2 } },
        log: [chose(['Earl Rhodes', 'Carla Proust'])],
      }),
    );

    expect(
      team(1).getByText(/Mission team 1 chose Thin the Herd: Earl Rhodes, Carla Proust\./),
    ).toBeInTheDocument();
    expect(team(1).getByText('The team is now Earl Rhodes.')).toBeInTheDocument();
  });

  it('says nothing more when the team is the one it was recorded with', () => {
    open(selecting({ log: [chose(['Earl Rhodes', 'Carla Proust'])] }));

    expect(team(1).queryByText(/the team is now/i)).toBeNull();
  });

  it('opens the form from the record on Change, and records the new choice', async () => {
    const user = open(selecting({ log: [chose(['Earl Rhodes', 'Carla Proust'])] }));

    await user.click(team(1).getByRole('button', { name: 'Change team 1’s mission' }));
    expect(team(1).getByLabelText('Mission')).toHaveValue('thin-the-herd');

    await user.selectOptions(team(1).getByLabelText('Mission'), 'rescue-strangers');
    await user.click(team(1).getByRole('button', { name: 'Choose again for team 1' }));

    expect(team(1).getByText(/Mission team 1 chose Rescue Strangers/)).toBeInTheDocument();
    expect(team(1).queryByLabelText('Mission')).toBeNull();
  });

  it('keeps the recorded choice when the change is abandoned', async () => {
    const user = open(selecting({ log: [chose(['Earl Rhodes', 'Carla Proust'])] }));

    await user.click(team(1).getByRole('button', { name: 'Change team 1’s mission' }));
    await user.selectOptions(team(1).getByLabelText('Mission'), 'rescue-strangers');
    await user.click(team(1).getByRole('button', { name: 'Keep Thin the Herd' }));

    expect(team(1).getByText(/Mission team 1 chose Thin the Herd/)).toBeInTheDocument();
  });

  it('offers no Change once the team’s outcome is recorded', () => {
    open(
      selecting({
        log: [
          chose(['Earl Rhodes', 'Carla Proust']),
          {
            turn: 4,
            phase: 'mission',
            at: AT,
            event: {
              kind: 'thin-the-herd-resolved',
              startingZombies: 6,
              zombiesLeft: 0,
              survivorsExited: 1,
              allIncapacitated: false,
              team: 1,
            },
          },
        ],
      }),
    );

    expect(team(1).getByText(/Mission team 1 chose Thin the Herd/)).toBeInTheDocument();
    expect(team(1).queryByRole('button', { name: /change/i })).toBeNull();
  });
});

describe('an Other mission (#259; R157)', () => {
  it('is named at Select Mission, and recorded by its name', async () => {
    const user = open(selecting());

    await user.selectOptions(team(2).getByLabelText('Mission'), 'other');
    expect(team(2).getByRole('button', { name: 'Choose for team 2' })).toBeDisabled();
    expect(team(2).getByText('Name the mission.')).toBeInTheDocument();
    await user.type(team(2).getByLabelText('Mission name'), 'The Lighthouse');
    await user.click(team(2).getByRole('button', { name: 'Choose for team 2' }));

    expect(
      team(2).getByText('Mission team 2 chose The Lighthouse (other): Ruby Vance.'),
    ).toBeInTheDocument();
  });

  it('isn’t offered when the horde called a siege', () => {
    open(selecting({ log: [called] }));

    expect(walk().queryByRole('option', { name: 'Other mission' })).toBeNull();
  });
});
