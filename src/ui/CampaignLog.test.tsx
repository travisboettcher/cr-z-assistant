import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_EVENT_SAMPLES } from '../test/logSamples';
import { describeEvent } from './logLabels';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

/**
 * Driven through `App` and the real provider, for the reason the roster and
 * slot-map tests give: the story is that something done on screen reaches the
 * store and comes back out of it as history, and a test that hands the
 * component a hand-built log cannot show that.
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

const history = () => screen.getByRole('region', { name: /^history$/i });

describe('the campaign log on screen', () => {
  it('shows nothing at all before anything has happened', () => {
    render(
      <CampaignProvider>
        <App />
      </CampaignProvider>,
    );

    expect(screen.queryByRole('region', { name: /^history$/i })).toBeNull();
  });

  it('records the campaign starting, under its turn', async () => {
    await openCampaign();

    const turn = within(history()).getByRole('heading', { name: /turn 1/i });
    expect(turn).toBeTruthy();
    expect(within(history()).getByText(/started the campaign “cedar hollow”/i)).toBeTruthy();
  });

  it('adds what happens next, and keeps what it already said', async () => {
    const user = await openCampaign();

    await user.selectOptions(screen.getByLabelText(/choose a base/i), ['Hobby Farm — Tier 2']);
    await user.click(screen.getByRole('button', { name: /claim this base/i }));

    const lines = within(history()).getAllByRole('listitem');

    // Newest first, and claiming a first base is two things that happened: the
    // claim, and the stocking it brings with it (pg. 19).
    expect(lines[0]?.textContent).toMatch(/stocked to its caps/i);
    expect(lines[1]?.textContent).toMatch(/claimed the hobby farm/i);
    expect(lines[2]?.textContent).toMatch(/started the campaign/i);
  });

  /**
   * Renaming is the clearest of the things the log ignores: something visibly
   * changed on screen, and nothing happened to the community.
   */
  it('ignores a rename, which is a correction rather than an event', async () => {
    const user = await openCampaign();

    const before = within(history()).getAllByRole('listitem').length;

    const name = screen.getByLabelText(/campaign name/i);
    await user.clear(name);
    await user.type(name, 'Millbrook');

    expect(within(history()).getAllByRole('listitem')).toHaveLength(before);
  });
});

describe('describeEvent', () => {
  /**
   * Every kind gets a line, and no line is a placeholder.
   *
   * The switch in `logLabels.ts` is exhaustive by typecheck, so a missing case
   * cannot compile — but a case returning an empty string, or one that renders
   * `undefined` because it read a label out of a `Record` that has no entry for
   * the id, compiles perfectly. This is the check on that.
   */
  it.each(CAMPAIGN_EVENT_SAMPLES)('describes $kind without leaving a hole', (event) => {
    const { text } = describeEvent(event);

    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/undefined|null|\[object/i);
  });
});

/**
 * **#173's log lines.** Each of these was a sentence the history got wrong and
 * a player could not edit — the article, the preposition, a refund the entry
 * did not mention, and a turn 1 that claimed to have cleared a turn 0.
 */
describe('the sentences the log writes', () => {
  it('agrees the article with what follows it', () => {
    expect(
      describeEvent({ kind: 'upgrade-ordered', slot: 'kitchen', upgrade: 'extra-bed' }).text,
    ).toContain('an Extra Bed');

    expect(
      describeEvent({ kind: 'upgrade-ordered', slot: 'kitchen', upgrade: 'restraints' }).text,
    ).toContain('Ordered Restraints');
  });

  it('agrees it with a number too', () => {
    const rolled = describeEvent({
      kind: 'rot-checked',
      survivor: 'earl',
      name: 'Earl Rhodes',
      roll: 8,
      target: 12,
      passed: false,
    });

    expect(rolled.text).toContain('rolling an 8');
  });

  /**
   * The queue line says "Bunk Room **in** the Overflow Parking" and the log
   * used to say "on the", because the entry carries a bare id with no kind.
   * The id is enough: the two label maps share no key.
   */
  it('puts a facility in a slot and an upgrade on one', () => {
    expect(
      describeEvent({ kind: 'project-cancelled', slot: 'garage', built: 'workshop', hardware: 3 })
        .text,
    ).toContain('the Workshop in the Garage');

    expect(
      describeEvent({ kind: 'project-cancelled', slot: 'kitchen', built: 'gas-range', hardware: 2 })
        .text,
    ).toContain('the Gas Range on the Kitchen');
  });

  /** The sibling entry names the materials; this one named only the Labor. */
  it('says what came back when a project went unfinished', () => {
    expect(
      describeEvent({ kind: 'project-unfinished', slot: 'garage', built: 'workshop', hardware: 3 })
        .text,
    ).toContain('3 Hardware came back');
  });

  it('does not clear a turn that never happened', () => {
    expect(describeEvent({ kind: 'planning-began' }, 1).text).toBe('Started planning.');
    expect(describeEvent({ kind: 'planning-began' }, 2).text).toContain('last turn’s tasks');
  });
});
