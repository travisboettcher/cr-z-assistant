import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TURN_SEQUENCE } from '../engine/turn';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

/**
 * Driven through `App` and the real provider, like the roster and slot-map
 * suites: the story is that pressing Next on screen moves the campaign in the
 * store, and a test that hands the component a campaign cannot show that.
 */
async function openCampaign() {
  const user = userEvent.setup();

  render(
    <CampaignProvider>
      <App />
    </CampaignProvider>,
  );

  await user.type(screen.getByLabelText(/^campaign name$/i), 'Cedar Hollow');
  await user.click(screen.getByRole('button', { name: 'New campaign' }));

  return user;
}

const walk = () => screen.getByRole('region', { name: /^turn \d+$/i });
const header = () => screen.getByRole('banner');
const next = () => screen.getByRole('button', { name: /^next:/i });
const skip = () => screen.getByRole('button', { name: /^skip to/i });
const back = () => screen.getByRole('button', { name: /^back/i });

describe('walking the turn', () => {
  it('opens a campaign at the first step of the first phase', async () => {
    await openCampaign();

    expect(walk()).toHaveTextContent('Turn 1');
    expect(next()).toHaveTextContent('Next: Equip the Mission Team');
    expect(within(header()).getByText('Select Mission')).toBeInTheDocument();
  });

  it('moves one step, and says where the next one goes', async () => {
    const user = await openCampaign();

    await user.click(next());

    expect(next()).toHaveTextContent('Next: Play the Mission');
    expect(within(header()).getByText('Equip the Mission Team')).toBeInTheDocument();
  });

  it('skips the rest of a phase, naming the phase it opens', async () => {
    const user = await openCampaign();

    expect(skip()).toHaveTextContent('Skip to Advancement');
    await user.click(skip());

    expect(within(header()).getByText('Character Advancement')).toBeInTheDocument();
    expect(within(header()).getByText('Advancement')).toBeInTheDocument();
  });

  it('offers no skip when the next step is already the next phase', async () => {
    const user = await openCampaign();

    // Two steps on is the last of the Mission Phase, where "next step" and
    // "next phase" are one move — and two buttons for one move is a choice
    // nobody should have to make.
    await user.click(next());
    await user.click(next());

    expect(screen.queryByRole('button', { name: /^skip to/i })).toBeNull();
  });

  it('steps back to where it came from, and stops at the top of the turn', async () => {
    const user = await openCampaign();

    expect(back()).toBeDisabled();

    await user.click(next());
    expect(back()).toHaveTextContent('Back to Select Mission');

    await user.click(back());
    expect(within(header()).getByText('Select Mission')).toBeInTheDocument();
    expect(back()).toBeDisabled();
  });

  it('asks before ending the turn, and stays put if told to', async () => {
    const user = await openCampaign();

    for (let move = 0; move < TURN_SEQUENCE.length - 1; move += 1) {
      await user.click(next());
    }

    const end = screen.getByRole('button', { name: 'End turn 1' });
    await user.click(end);

    await user.click(screen.getByRole('button', { name: /stay on this turn/i }));

    expect(walk()).toHaveTextContent('Turn 1');
    expect(within(header()).getByText('Departures')).toBeInTheDocument();
  });

  it('ends the turn when the asking is answered, and opens the next one', async () => {
    const user = await openCampaign();

    // Four skips is a whole turn: the Management Phase's skip is what ends it.
    for (let phase = 0; phase < 3; phase += 1) {
      await user.click(skip());
    }

    await user.click(screen.getByRole('button', { name: 'End turn 1' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'End turn 1' }),
    );

    expect(walk()).toHaveTextContent('Turn 2');
    expect(within(header()).getByText('Select Mission')).toBeInTheDocument();
    expect(back()).toBeDisabled();
  });

  it('marks the steps behind it done and the one it is on current', async () => {
    const user = await openCampaign();

    await user.click(next());

    const steps = within(walk()).getAllByRole('listitem');
    const current = steps.filter((step) => step.getAttribute('aria-current') === 'step');

    // Two: the phase in the orientation strip, and the step in the list. Both
    // are "where you are", at different grains.
    expect(current).toHaveLength(2);
    expect(current[1]).toHaveTextContent('Equip the Mission Team');
  });
});
