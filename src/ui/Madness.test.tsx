import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { withPlanningBegun } from '../test/campaigns';
import { lane, moveTo, openPanel } from '../test/screens';
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

  it('shows XP spent and Found beside it (R149, R109)', async () => {
    const user = open(cosmic({ survivors: [earl({ xpSpent: 7, found: true })] }));
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));
    const sheet = within(screen.getByRole('region', { name: 'Earl Rhodes' }));

    expect(sheet.getByText(/^XP spent/)).toBeTruthy();
    expect(sheet.getByText('Found')).toBeTruthy();
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

describe('Madness Recovery in the Lounge (pp. 21, 68; R110; Z7-7)', () => {
  const lounge = {
    id: 'small-town-home',
    slots: { 'bunk-room-1': { upgrades: ['lounge'] } },
  } as const satisfies Campaign['base'];

  it('is a lane at Rest and Healing in a Cosmic Horror campaign, and only there', () => {
    open(withPlanningBegun(cosmic({ step: 'assign-rest-and-healing', base: lounge })));

    moveTo(/^earl rhodes/i, 'Madness Recovery');
    expect(within(lane('Madness Recovery')).getByText(/Earl Rhodes/)).toBeTruthy();
  });

  it('has no lane in another campaign', () => {
    open(withPlanningBegun(cosmic({ step: 'assign-rest-and-healing', origin: 'viral' })));

    expect(screen.queryByRole('group', { name: 'Madness Recovery' })).toBeNull();
    expect(screen.queryByText('Madness Recovery')).toBeNull();
  });

  it('is handed out at Heal Wounds, and says so', async () => {
    const user = open(
      cosmic({
        step: 'heal-wounds',
        base: lounge,
        survivors: [earl({ madness: 5 })],
        assignments: { earl: { task: 'madness-recovery' } },
      }),
    );
    const region = within(walk()).getByRole('region', { name: 'Madness Recovery' });
    const section = within(region);

    expect(region.textContent).toContain(
      'The Lounge makes 2 points, shared equally among everybody assigned to Madness Recovery: Earl Rhodes −2.',
    );
    await user.click(section.getByRole('button', { name: 'Take the Madness off' }));

    expect(section.getByText('Earl Rhodes recovered from 2 Madness in the Lounge.')).toBeTruthy();
    expect(section.queryByRole('button')).toBeNull();
  });
});

describe('going Lost at Departures (pp. 23, 124; R106; Z7-7)', () => {
  it('sends them first, then the Unrest check, and counts the Lost on the card', async () => {
    const user = open(
      cosmic({
        step: 'departures',
        survivors: [earl({ madness: 13 }), createSurvivor('Ruby Vance', 2, { id: 'ruby' })],
      }),
    );
    const region = within(walk()).getByRole('region', { name: 'Lost to Madness' });

    expect(region.textContent).toContain('Going: Earl Rhodes.');
    expect(walk().textContent).toContain('The Unrest check follows once the Lost have gone');
    await user.click(within(region).getByRole('button', { name: 'They go Lost' }));

    expect(within(region).getByText('Earl Rhodes went Lost at 13 Madness.')).toBeTruthy();
    expect(walk().textContent).toContain('Nobody is leaving. The community holds together.');
    expect(
      within(screen.getByRole('region', { name: 'Survivors' })).getByText(/Lost$/).textContent,
    ).toBe('1 Lost');
  });
});

describe('the Lost roll at Select Mission (pp. 25, 124; R108; Z7-8)', () => {
  const selecting = () =>
    cosmic({
      turn: 4,
      step: 'select-mission',
      survivors: [earl()],
      lost: [{ ...createSurvivor('June Park', 2, { id: 'june' }), xpSpent: 10 }],
      assignments: { earl: { task: 'mission', team: 1 } },
    });

  it('places a pass on the team chosen', async () => {
    const user = open(selecting());
    const region = within(walk()).getByRole('region', { name: 'The Lost roll' });

    await user.selectOptions(
      within(region).getByLabelText('June Park’s d10, with 10 XP spent'),
      '9',
    );
    expect(within(region).getByLabelText('joins')).toHaveDisplayValue('Mission team 1');
    await user.click(within(region).getByRole('button', { name: 'Record June Park’s roll' }));

    expect(region.textContent).toContain(
      'June Park, Lost, rolled a 9 with 10 XP spent, and is on mission team 1’s area as a stranger.',
    );
  });

  it('gives a fail its 1 XP, with no team asked', async () => {
    const user = open(selecting());
    const region = within(walk()).getByRole('region', { name: 'The Lost roll' });

    await user.selectOptions(
      within(region).getByLabelText('June Park’s d10, with 10 XP spent'),
      '3',
    );
    expect(within(region).queryByLabelText('joins')).toBeNull();
    await user.click(within(region).getByRole('button', { name: 'Record June Park’s roll' }));

    expect(region.textContent).toContain('and gained 1 XP.');
  });
});

describe('a Lost survivor on a mission (pg. 124; R109; Z7-8)', () => {
  it('is rescued and Found, back on the roster', async () => {
    const user = open(
      cosmic({
        turn: 4,
        step: 'tactical-mission',
        survivors: [earl()],
        lost: [{ ...createSurvivor('June Park', 2, { id: 'june' }), madness: 14 }],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [
          {
            turn: 4,
            phase: 'mission',
            at: AT,
            event: {
              kind: 'lost-rolled',
              survivor: 'june',
              name: 'June Park',
              roll: 10,
              xpSpent: 0,
              team: 1,
            },
          },
        ],
      }),
    );
    const region = within(walk()).getByRole('region', { name: 'The Lost on a mission' });

    await user.click(within(region).getByRole('button', { name: 'Rescued, and Found' }));

    expect(
      within(region).getByText(
        'June Park was rescued from the Lost and is Found, back in the community.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/^1 Lost$/)).toBeNull();
  });

  it('lists the Lost in the roster', () => {
    open(cosmic({ lost: [{ ...createSurvivor('June Park', 2, { id: 'june' }), xpSpent: 4 }] }));
    openPanel('survivors');

    expect(
      within(screen.getByRole('list', { name: 'Lost' })).getByText(/June Park/).textContent,
    ).toBe('June Park, Citizen, 4 XP spent');
  });
});

describe('the Found check on the outcome (pg. 130; R111; Z7-8)', () => {
  it('asks a Found survivor’s d10 when their Madness goes up, and caps a pass at 6', async () => {
    const user = open(
      cosmic({
        turn: 4,
        step: 'tactical-mission',
        survivors: [earl({ madness: 2, found: true, tier: 3 })],
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

    expect(within(walk()).queryByLabelText(/Tier check against 8/)).toBeNull();
    await user.clear(madness);
    await user.type(madness, '9');
    await user.selectOptions(within(walk()).getByLabelText(/Tier check against 8/), '7');
    await user.click(within(walk()).getByRole('button', { name: 'Record Rescue Strangers' }));

    expect(walk().textContent).toContain(
      'Earl Rhodes at 2 Health and 6 Madness, rolling 7 for the Found check',
    );
  });
});
