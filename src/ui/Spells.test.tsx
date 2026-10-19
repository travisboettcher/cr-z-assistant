import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { openPanel } from '../test/screens';
import { App } from './App';

const AT = '2026-10-19T09:00:00.000Z';

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
  xp: 8,
  ...overrides,
});

const magic = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  origin: 'magic',
  survivors: [earl()],
  ...overrides,
});

const cast: LogEntry = {
  turn: 3,
  phase: 'mission',
  at: AT,
  event: { kind: 'spells-cast', team: 1, spells: ['teleport', 'mass-recall'] },
};

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });

describe('the spells an enemy cast, on a mission’s outcome (R112; Z7-9)', () => {
  const playing = (origin: 'magic' | 'viral') =>
    magic({
      origin,
      step: 'tactical-mission',
      assignments: { earl: { task: 'mission', team: 1 } },
      log: [
        {
          turn: 4,
          phase: 'mission',
          at: AT,
          event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
        },
      ],
    });

  it('are ticked in a Magic campaign, and recorded with it', async () => {
    const user = open(playing('magic'));
    const spells = within(within(walk()).getByRole('group', { name: /spells an enemy cast/i }));

    await user.click(spells.getByLabelText('Mass Recall'));
    await user.click(spells.getByLabelText('Teleport'));
    await user.click(within(walk()).getByRole('button', { name: 'Record Rescue Strangers' }));

    expect(walk().textContent).toContain(
      'An enemy cast Teleport and Mass Recall on mission team 1’s mission.',
    );
  });

  it('are not asked anywhere else', () => {
    open(playing('viral'));

    expect(within(walk()).queryByRole('group', { name: /spells an enemy cast/i })).toBeNull();
  });
});

describe('learning a spell at the Mystic Library (pg. 70; R113; Z7-9)', () => {
  const advancing = (survivor: Survivor = earl()) =>
    magic({
      step: 'character-advancement',
      survivors: [survivor],
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'mystic-library', builtOnTurn: 1 } } },
      },
      assignments: { earl: { task: 'staff', slot: 'garage' } },
      log: [cast],
    });
  const section = () => within(within(walk()).getByRole('region', { name: 'Spells' }));

  it('offers whoever staffed it the spells cast, and learns the one picked', async () => {
    const user = open(advancing());

    expect(section().getByText(/Cast so far: Teleport and Mass Recall\./)).toBeTruthy();
    expect(section().getByText(/a spell costs 6 XP/)).toBeTruthy();
    await user.selectOptions(
      section().getByLabelText('Spell for Earl Rhodes to learn'),
      'mass-recall',
    );
    await user.click(section().getByRole('button', { name: 'Learn it' }));

    expect(
      section().getByText('Earl Rhodes learned Mass Recall at the Mystic Library for 6 XP.'),
    ).toBeTruthy();
    expect(section().queryByRole('button')).toBeNull();
  });

  it('says why somebody cannot learn one', () => {
    open(advancing(earl({ humanity: 4 })));

    expect(section().getByRole('button', { name: 'Learn it' })).toBeDisabled();
    expect(
      section().getByText('Only somebody with Humanity 3 or less learns a spell.'),
    ).toBeTruthy();
  });

  it('says when there is nothing they don’t know yet', () => {
    open(advancing(earl({ spells: ['teleport', 'mass-recall'] })));

    expect(section().queryByRole('button')).toBeNull();
    expect(
      section().getByText(
        'An enemy has to cast a spell they don’t know before they can learn one.',
      ),
    ).toBeTruthy();
  });

  it('is not shown with nobody staffing a Library', () => {
    open(magic({ step: 'character-advancement' }));

    expect(within(walk()).queryByRole('region', { name: 'Spells' })).toBeNull();
  });
});

describe('the spells known, on the sheet (R112, R155; Z7-9)', () => {
  const sheet = async (campaign: Campaign) => {
    const user = open(campaign);
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));

    return { user, sheet: within(screen.getByRole('region', { name: 'Earl Rhodes' })) };
  };

  it('are listed in a Magic campaign, and corrected by hand', async () => {
    const { user, sheet: earlSheet } = await sheet(magic());

    expect(earlSheet.getByText(/Knows no spells/)).toBeTruthy();
    await user.click(earlSheet.getByRole('button', { name: 'Edit traits' }));
    await user.click(earlSheet.getByLabelText('Restoration'));
    await user.click(earlSheet.getByLabelText('Dominate Enemy'));
    await user.click(earlSheet.getByRole('button', { name: 'Save traits' }));

    expect(earlSheet.getByText(/Knows Dominate Enemy and Restoration/)).toBeTruthy();
  });

  it('are not shown elsewhere, unless somebody knows one', async () => {
    const { sheet: plain } = await sheet(magic({ origin: 'viral' }));

    expect(plain.queryByText(/Knows/)).toBeNull();
  });

  it('are shown for somebody who knows one, whatever the origin', async () => {
    const { sheet: known } = await sheet(
      magic({ origin: 'viral', survivors: [earl({ spells: ['duplicate'] })] }),
    );

    expect(known.getByText(/Knows Duplicate/)).toBeTruthy();
  });
});
