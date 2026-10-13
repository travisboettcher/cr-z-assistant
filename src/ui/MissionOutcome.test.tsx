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

  it('names an overrun base before it is recorded', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');

    expect(walk().textContent).toContain('keep counting');
    expect(walk().textContent).toContain('The base is overrun');
  });
});

/** How the community goes on from an overrun base (pg. 86; R27, R28; Z4-9). */
describe('the overrun base', () => {
  const overran: LogEntry = {
    turn: 4,
    phase: 'mission',
    at: AT,
    event: { kind: 'siege-defense-resolved', zombiesLeft: 2, survivorsExited: 1, team: 1 },
  };

  const besieged = () =>
    playing({
      base: { id: 'hobby-farm', slots: {} },
      survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
      log: [called, chose('siege-defense'), overran],
    });

  const choice = () =>
    within(within(walk()).getByRole('group', { name: /how does the community go on/i }));

  it('asks how the community goes on once the siege is recorded', () => {
    open(besieged());

    expect(choice().getByRole('radio', { name: 'Claim a new base' })).toBeChecked();
    expect(choice().getByRole('radio', { name: 'Start a new community' })).toBeInTheDocument();
  });

  it('plays the claim it chooses at once, with no strangers and a question about the map', async () => {
    const user = open(besieged());

    // The overrun base's own type is the default, which is the one that asks.
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const claim = group(/how claim a new base ended/i);
    expect(claim.getByText('Claiming a Hobby Farm.')).toBeInTheDocument();
    expect(claim.queryByLabelText('Stranger’s Tier')).toBeNull();

    await user.selectOptions(claim.getByLabelText(/end condition met/i), '1');
    await user.click(claim.getByLabelText(/overrun base’s own map/i));
    await user.click(claim.getByRole('button', { name: 'Record Claim a New Base' }));

    expect(walk().textContent).toContain('on the overrun base’s own map');
    expect(
      within(walk()).queryByRole('group', { name: /how does the community go on/i }),
    ).toBeNull();
  });

  it('leaves the survivors behind, then plays the new community’s First Mission (R31)', async () => {
    const user = open(besieged());

    await user.click(
      choice().getByRole('radio', { name: 'Leave the survivors behind and begin a new community' }),
    );
    expect(choice().queryByLabelText(/^Base/)).toBeNull();
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const next = group(/the new community’s first mission/i);
    expect(
      next.getByText('Add the new community’s survivors on the roster first.'),
    ).toBeInTheDocument();
    expect(next.getByRole('button', { name: 'Play the First Mission' })).toBeDisabled();
    expect(walk().textContent).not.toContain('how does the community go on');
  });

  it('asks again when the way on fails (R28)', async () => {
    const user = open(besieged());

    await user.click(choice().getByRole('radio', { name: 'Start a new community' }));
    await user.selectOptions(
      choice().getByLabelText('Base the new community claims'),
      'summer-camp',
    );
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const first = group(/how the first mission ended/i);
    await user.selectOptions(first.getByLabelText(/end condition met/i), 'none');
    await user.click(first.getByRole('button', { name: 'Record the First Mission' }));

    // Not R21's replay, which is turn 1's.
    expect(walk().textContent).toContain('the community chooses again how it goes on (R28)');
    expect(choice().getByRole('button', { name: 'Go on this way' })).toBeEnabled();
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
          createSurvivor('Ruby Vance', 2, { id: 'ruby' }),
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

    // Ruby is Tier 2: a Leader is past anybody on her team (pg. 31), and no
    // stranger is a Hero (pg. 7; R24), so Tier 4 is not on offer.
    expect(
      within(rescuing.getByLabelText('Stranger’s Tier'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['1', '2', '3']);
    await user.selectOptions(rescuing.getByLabelText('Stranger’s Tier'), '3');
    await user.click(rescuing.getByRole('button', { name: 'Add a stranger' }));
    expect(rescuing.getByText(/Tier 3 or higher/)).toBeInTheDocument();

    await user.click(rescuing.getByRole('button', { name: 'Record Rescue Strangers' }));
    expect(walk().textContent).toContain(
      'Rescue Strangers (mission team 2): 1 stranger rescued (Tier 3).',
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

  it('names the base a claim is aiming at (pg. 78; Z4-7)', () => {
    open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [
          {
            ...teamChose(1, 'claim-a-new-base'),
            event: {
              kind: 'mission-selected',
              team: 1,
              mission: 'claim-a-new-base',
              names: [],
              base: 'outdoor-sports-shop',
            },
          },
        ],
      }),
    );

    expect(
      group(/how claim a new base ended/i).getByText('Claiming an Outdoor Sports Shop.'),
    ).toBeInTheDocument();
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

/** Survivors set aside, brought back by Rescue Strangers (R31; Z4-11). */
describe('bringing back a survivor set aside', () => {
  it('offers everybody set aside, and records who came back', async () => {
    const user = open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
        setAside: [createSurvivor('Hera Okafor', 4, { id: 'hera' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'rescue-strangers')],
      }),
    );

    const rescue = group(/how rescue strangers ended/i);
    await user.click(rescue.getByRole('checkbox', { name: 'Hera Okafor (Tier 4)' }));
    await user.click(rescue.getByRole('button', { name: 'Record Rescue Strangers' }));

    expect(walk().textContent).toContain(
      'Rescue Strangers: no strangers rescued, and 1 survivor set aside brought back.',
    );
  });

  it('asks nothing of a community with nobody set aside', () => {
    open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'rescue-strangers')],
      }),
    );

    expect(within(walk()).queryByText(/Brought back from those set aside/)).toBeNull();
  });
});
