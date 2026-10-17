import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { withPlanningBegun } from '../test/campaigns';
import { lane, openPanel, pickUp } from '../test/screens';
import { App } from './App';

const rex: Survivor = { ...createSurvivor('Rex Moor', 2, { id: 'rex' }), storyTrait: 'berserk' };

function open(campaign: Campaign) {
  const user = userEvent.setup();

  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );

  return user;
}

function community(survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    survivors,
    base: { id: 'small-town-home', slots: {} },
    ...overrides,
  };
}

async function sheetFor(user: ReturnType<typeof userEvent.setup>, name: string) {
  if (screen.queryAllByRole('button', { name: /^sheet$/i }).length === 0) openPanel('survivors');
  const rows = screen.getAllByRole('button', { name: /^sheet$/i });
  const index = ['Earl Rhodes', 'Rex Moor'].indexOf(name);
  await user.click(rows[Math.max(0, index)] as HTMLElement);

  return within(screen.getByRole('region', { name }));
}

describe('Story Traits on the sheet (pg. 88; Z7-1)', () => {
  it('sets a trait, Veteran and a bond group behind Edit, and says what is held', async () => {
    const user = open(community([createSurvivor('Earl Rhodes', 4, { id: 'earl' })]));
    const sheet = await sheetFor(user, 'Earl Rhodes');

    expect(sheet.getByText('None')).toBeInTheDocument();

    await user.click(sheet.getByRole('button', { name: 'Edit traits' }));
    await user.selectOptions(sheet.getByLabelText('Story Trait'), 'bonded');
    expect(sheet.getByLabelText('Bond group')).toHaveDisplayValue('New group 1');
    await user.click(sheet.getByLabelText(/Veteran/));
    await user.click(sheet.getByRole('button', { name: 'Save traits' }));

    expect(sheet.getByText('Bonded (bond group 1), Veteran')).toBeInTheDocument();
    expect(sheet.queryByLabelText('Story Trait')).toBeNull();
  });

  it('cancels without changing anything', async () => {
    const user = open(community([createSurvivor('Earl Rhodes', 4, { id: 'earl' })]));
    const sheet = await sheetFor(user, 'Earl Rhodes');

    await user.click(sheet.getByRole('button', { name: 'Edit traits' }));
    await user.selectOptions(sheet.getByLabelText('Story Trait'), 'jaded');
    await user.click(sheet.getByRole('button', { name: 'Cancel' }));

    expect(sheet.getByText('None')).toBeInTheDocument();
  });

  it('shows Berserk’s maximum Health, and Driven’s stats (R133, R135)', async () => {
    const dee: Survivor = {
      ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }),
      storyTrait: 'driven',
      stats: { strength: 3, dexterity: 2, intelligence: 1, cooperation: 0 },
    };
    const user = open(community([dee, rex]));

    const driven = await sheetFor(user, 'Earl Rhodes');
    expect(driven.getAllByText(/with Driven/)).toHaveLength(3);

    await user.click(driven.getByRole('button', { name: 'Close sheet' }));
    const berserk = await sheetFor(user, 'Rex Moor');
    expect(berserk.getByText('2 / 3')).toBeInTheDocument();
  });
});

describe('a Berserk survivor on the board (pg. 88; R93)', () => {
  /** The acceptance. */
  it('shows a grey zone, naming Berserk, on the project team’s lane', () => {
    open(
      withPlanningBegun(
        community([createSurvivor('Earl Rhodes', 4, { id: 'earl' }), rex], {
          step: 'assign-project-team',
        }),
      ),
    );

    pickUp(/^rex moor/i);
    const project = within(lane('Project team'));

    expect(project.getByText('Can’t go here')).toBeInTheDocument();
    expect(
      project.getByText(/A Berserk survivor only rests, heals or goes on a mission\./),
    ).toBeInTheDocument();
    expect(project.queryByRole('button', { name: 'Move Rex Moor here' })).toBeNull();
  });
});

describe('the project team’s Labor, with traits (pg. 88; R89)', () => {
  it('names what the Story Traits add to the pool', () => {
    const bonded = (name: string, id: string): Survivor => ({
      ...createSurvivor(name, 3, { id }),
      storyTrait: 'bonded',
      bondGroup: 1,
    });

    open(
      withPlanningBegun(
        community([bonded('Earl Rhodes', 'earl'), bonded('Ada Moss', 'ada')], {
          step: 'assign-project-team',
          assignments: { earl: { task: 'project' }, ada: { task: 'project' } },
        }),
      ),
    );

    const walk = screen.getByRole('region', { name: /^turn \d+$/i });
    const caption = within(walk).getByText(/generates/i).textContent;

    expect(caption).toMatch(/generates 12 Labor/);
    expect(caption).toMatch(/plus 6 from their Story Traits/);
  });
});
