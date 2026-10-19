import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Base, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const clinic: Base = {
  id: 'small-town-home',
  slots: {
    garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, upgrades: ['containment'] },
  },
};

/** Turn 3 of a Viral campaign with a Containment holding two zombies. */
function viral(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    origin: 'viral',
    base: clinic,
    survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), infection: 3 }],
    heldZombies: 2,
    ...overrides,
  };
}

function open(campaign: Campaign) {
  render(
    <CampaignProvider initialState={{ status: 'open', campaign }}>
      <App />
    </CampaignProvider>,
  );
}

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });

describe('Containment and Medical Supplies on the main screen (R103, R131; Z7-6)', () => {
  it('says how many zombies the base holds and how many tokens it keeps', () => {
    open(viral({ medicalSupplies: 3 }));

    expect(
      within(screen.getByRole('region', { name: 'Base' })).getByText(/held in Containment/)
        .textContent,
    ).toBe('2 zombies held in Containment');
    expect(
      within(screen.getByRole('region', { name: 'Inventory' })).getByText(/Medical Supply/)
        .textContent,
    ).toBe('3 Medical Supply tokens');
  });

  it('says nothing of either when there are none', () => {
    open(viral({ heldZombies: 0 }));

    expect(screen.queryByText(/held in Containment/)).toBeNull();
    expect(screen.queryByText(/Medical Supply/)).toBeNull();
  });
});

describe('Containment in the turn (pg. 69; R103)', () => {
  it('shows what it takes at Heal Wounds, after the Health', () => {
    open(viral({ step: 'heal-wounds', assignments: { earl: { task: 'healing' } } }));

    expect(walk().textContent).toContain(
      'Then Containment takes Infection off everybody being healed, 1 for each zombie it holds: Earl Rhodes −2',
    );
  });

  it('adds its zombies to the Siege Threat at Check the Horde, and only when it holds some', () => {
    open(viral({ step: 'check-the-horde' }));

    expect(walk().textContent).toContain('+2 held in Containment');
  });

  it('leaves the term out of a campaign holding none', () => {
    open(viral({ step: 'check-the-horde', heldZombies: 0 }));

    expect(walk().textContent).not.toContain('held in Containment');
  });
});

describe('moving out (R105, R147)', () => {
  it('says the held zombies stay behind with Containment', () => {
    open(
      viral({
        step: 'add-facilities-and-upgrades',
        turn: 4,
        log: [
          {
            turn: 4,
            phase: 'mission',
            at: '2026-10-18T09:00:00.000Z',
            event: {
              kind: 'mission-selected',
              team: 1,
              mission: 'claim-a-new-base',
              names: [],
              base: 'distillery',
            },
          },
          {
            turn: 4,
            phase: 'mission',
            at: '2026-10-18T09:00:00.000Z',
            event: {
              kind: 'claim-a-new-base-resolved',
              team: 1,
              endCondition: 1,
              strangers: [],
              vehiclesOnArea: 0,
            },
          },
        ],
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Move into the new base' })).getByText(
        /The 2 zombies held in Containment stay behind with it/,
      ),
    ).toBeTruthy();
  });
});
