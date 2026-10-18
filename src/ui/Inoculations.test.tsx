import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { withPlanningBegun } from '../test/campaigns';
import { campaignLog, openPanel } from '../test/screens';
import { App } from './App';

const SHOT = { id: 'shot', item: 'inoculation' as const, grade: 'standard' as const };

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

/** Turn 3 of a Viral campaign with a Medical Clinic and an Inoculation in the Inventory. */
function viral(survivors: readonly Survivor[], overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    origin: 'viral',
    survivors,
    base: {
      id: 'small-town-home',
      slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
    },
    inventory: [SHOT],
    ...overrides,
  };
}

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  ...overrides,
});

describe('choosing an Inoculation at Rest and Healing (pg. 48; R97, R143; Z7-5)', () => {
  it('offers one to somebody assigned to healing, even at full Health', async () => {
    const user = open(
      withPlanningBegun(
        viral([earl()], {
          step: 'assign-rest-and-healing',
          assignments: { earl: { task: 'healing' } },
        }),
      ),
    );
    const section = within(within(walk()).getByRole('region', { name: 'Inoculations' }));

    expect(section.getByText(/They can be at full Health/)).toBeTruthy();
    await user.selectOptions(section.getByLabelText('Earl Rhodes'), 'shot');

    expect(section.getByLabelText('Earl Rhodes')).toHaveDisplayValue('An Inoculation');
  });

  it('shows nothing without an Inoculation in the Inventory', () => {
    open(
      withPlanningBegun(
        viral([earl()], {
          step: 'assign-rest-and-healing',
          assignments: { earl: { task: 'healing' } },
          inventory: [],
        }),
      ),
    );

    expect(within(walk()).queryByRole('region', { name: 'Inoculations' })).toBeNull();
  });
});

describe('giving it at Heal Wounds (R97)', () => {
  it('gives the Inoculation chosen last Planning Phase, and says so', async () => {
    const user = open(
      viral([earl()], {
        step: 'heal-wounds',
        assignments: { earl: { task: 'healing', inoculation: 'shot' } },
      }),
    );
    const section = within(within(walk()).getByRole('region', { name: 'Inoculations' }));

    await user.click(section.getByRole('button', { name: 'Give Earl Rhodes the Inoculation' }));

    expect(
      section.getByText(
        'Earl Rhodes was given an Inoculation at the Medical Clinic, and is Rot Resistant.',
      ),
    ).toBeTruthy();
    expect(section.queryByRole('button', { name: /Give/ })).toBeNull();
  });
});

describe('Rot Resistant at Character Advancement (pg. 140; R96)', () => {
  it('takes 1 Infection off everybody Rot Resistant, once', async () => {
    const user = open(
      viral([earl({ rotResistant: true, infection: 3 })], { step: 'character-advancement' }),
    );
    const section = within(within(walk()).getByRole('region', { name: 'Rot Resistant' }));

    expect(
      section.getByText(/loses 1 Infection at the start of the Advancement Phase: Earl Rhodes/),
    ).toBeTruthy();
    await user.click(section.getByRole('button', { name: 'Take 1 Infection off' }));

    expect(section.getByText('Earl Rhodes lost 1 Infection, being Rot Resistant.')).toBeTruthy();
    expect(section.queryByRole('button', { name: 'Take 1 Infection off' })).toBeNull();
    expect(campaignLog().textContent).toContain(
      'Earl Rhodes lost 1 Infection, being Rot Resistant.',
    );
  });
});

describe('Rot Resistant on the sheet (R97)', () => {
  it('reads beside the traits, and can be set by hand in a Viral campaign', async () => {
    const user = open(viral([earl({ rotResistant: true })]));
    openPanel('survivors');
    await user.click(screen.getByRole('button', { name: /^sheet$/i }));
    const sheet = within(screen.getByRole('region', { name: 'Earl Rhodes' }));

    expect(sheet.getByText('Rot Resistant')).toBeTruthy();

    await user.click(sheet.getByRole('button', { name: 'Edit traits' }));
    await user.click(sheet.getByLabelText(/Rot Resistant/));
    await user.click(sheet.getByRole('button', { name: 'Save traits' }));

    expect(sheet.getByText('None')).toBeTruthy();
  });
});
