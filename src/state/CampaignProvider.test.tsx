import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNewCampaign } from '../engine/campaign';
import { CampaignProvider } from './CampaignProvider';
import { useCampaign } from './useCampaign';

const AT = '2026-09-08T21:00:00.000Z';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

/**
 * Stands in for the app shell Z0-7 will build: it reads state and dispatches,
 * and has no other way to change a campaign.
 */
function Probe() {
  const { state, dispatch } = useCampaign();

  return (
    <>
      <p>
        {state.status === 'open'
          ? `${state.campaign.name} — turn ${state.campaign.turn}`
          : 'No campaign'}
      </p>
      <button
        onClick={() =>
          dispatch({
            type: 'campaign/started',
            at: AT,
            name: 'Cedar Hollow',
            id: FIXED.id,
            createdAt: FIXED.createdAt,
          })
        }
      >
        New campaign
      </button>
      <button onClick={() => dispatch({ type: 'campaign/turnAdvanced', at: AT })}>
        Advance turn
      </button>
    </>
  );
}

describe('CampaignProvider', () => {
  it('boots with no campaign open', () => {
    render(
      <CampaignProvider>
        <Probe />
      </CampaignProvider>,
    );

    expect(screen.getByText('No campaign')).toBeInTheDocument();
  });

  it('accepts an injected initial state', () => {
    render(
      <CampaignProvider
        initialState={{ status: 'open', campaign: createNewCampaign('Millbrook', FIXED) }}
      >
        <Probe />
      </CampaignProvider>,
    );

    expect(screen.getByText('Millbrook — turn 1')).toBeInTheDocument();
  });

  it('re-renders consumers after a dispatched action', async () => {
    const user = userEvent.setup();
    render(
      <CampaignProvider>
        <Probe />
      </CampaignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'New campaign' }));
    await user.click(screen.getByRole('button', { name: 'Advance turn' }));

    expect(screen.getByText('Cedar Hollow — turn 2')).toBeInTheDocument();
  });
});

describe('useCampaign', () => {
  it('fails loudly outside a provider rather than dispatching into a void', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow(/must be used inside a <CampaignProvider>/);

    consoleError.mockRestore();
  });
});
