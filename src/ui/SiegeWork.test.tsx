import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { queued } from '../test/queued';
import { App } from './App';

const AT = '2026-09-12T09:00:00.000Z';

const COOK = 'cook';
const MASON = 'mason';
const SCOUT = 'scout';

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

const defended: LogEntry = {
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'siege-defense-resolved', zombiesLeft: 1, survivorsExited: 0 },
};

/**
 * Turn 4 of a campaign whose turn 3 Planning Phase put a cook in the Kitchen,
 * a Veteran on the project team and a Rookie on the mission team — and ordered
 * a Workshop with the Veteran's three Labor.
 */
function besieged(overrides: Partial<Campaign> = {}, hurt: readonly string[] = []): Campaign {
  const survivors: Survivor[] = [
    createSurvivor('Nell Haig', 2, { id: COOK }),
    createSurvivor('Earl Rhodes', 3, { id: MASON }),
    createSurvivor('Ruby Vance', 1, { id: SCOUT }),
  ].map((survivor) => (hurt.includes(survivor.id) ? { ...survivor, currentHp: 0 } : survivor));

  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
    materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
    survivors,
    assignments: {
      [COOK]: { task: 'staff', slot: 'kitchen' },
      [MASON]: { task: 'project' },
      [SCOUT]: { task: 'mission', team: 1 },
    },
    base: { id: 'small-town-home', slots: {} },
    projects: [
      queued(
        { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 },
        { hardware: 3, labor: 3 },
      ),
    ],
    log: [called, defended],
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
const panel = () => within(walk()).getByRole('region', { name: /who still works this turn/i });

describe('who still works on a siege turn (pg. 23, #183)', () => {
  it('is not asked before the siege is recorded', () => {
    open(besieged({ log: [called] }, [COOK]));

    expect(within(walk()).queryByRole('region', { name: /who still works/i })).toBeNull();
  });

  it('says the base’s work goes on when nobody working fell', () => {
    open(besieged());

    expect(panel().textContent).toContain('goes on as assigned');
  });

  it('names who the siege took off which post', () => {
    open(besieged({}, [COOK, MASON]));

    expect(panel().textContent).toContain('Nell Haig was working the Kitchen');
    expect(panel().textContent).toContain('Earl Rhodes was on the project team');
    expect(panel().textContent).toContain('3 Labor short');
  });

  /**
   * The orders the casualty's Labor paid for land at Add Facilities and
   * Upgrades, and the store will not land them all — so the step offers the
   * choice the rule leaves to the player instead of the Finish button.
   */
  it('makes the player choose what goes unfinished before the projects land', async () => {
    const user = open(besieged({ step: 'add-facilities-and-upgrades' }, [MASON]));

    // The reason sits above the Advancement Phase as well, where the number moves.
    expect(panel().textContent).toContain('Earl Rhodes was on the project team');
    expect(within(walk()).queryByRole('button', { name: /^finish/i })).toBeNull();

    await user.click(
      within(walk()).getByRole('button', { name: /leave .*workshop.* unfinished/i }),
    );

    expect(within(walk()).queryByRole('button', { name: /unfinished/i })).toBeNull();
    expect(within(walk()).getByText(/nothing was ordered|everything in the queue/i)).toBeTruthy();
  });

  it('leaves the projects alone when the team that is left can pay', () => {
    open(besieged({ step: 'add-facilities-and-upgrades' }, [COOK]));

    expect(within(walk()).getByRole('button', { name: /finish the project/i })).toBeEnabled();
  });
});

/**
 * No ordinary mission went out, so the mission team's fit survivors may take
 * a casualty's place (pg. 23, the FAQ; #183).
 */
describe('standing in for a casualty of the siege', () => {
  const MEDIC = 'medic';

  /** `besieged`, with a second Veteran on the mission team. */
  function withAMedic(overrides: Partial<Campaign> = {}, hurt: readonly string[] = []): Campaign {
    const campaign = besieged(overrides, hurt);

    return {
      ...campaign,
      survivors: [...campaign.survivors, createSurvivor('Ada Ferro', 3, { id: MEDIC })],
      assignments: { ...campaign.assignments, [MEDIC]: { task: 'mission', team: 1 } },
    };
  }

  it('offers the fit mission team, and nobody else, for each casualty', () => {
    open(withAMedic({}, [COOK, MASON]));

    const choice = within(panel()).getByLabelText(/standing in for nell haig/i);
    const options = within(choice)
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(options).toEqual(['Nobody', 'Ruby Vance', 'Ada Ferro']);
  });

  it('names the stand-in, and keeps one survivor to one place', async () => {
    const user = open(withAMedic({}, [COOK, MASON]));

    await user.selectOptions(
      within(panel()).getByLabelText(/standing in for earl rhodes/i),
      'Ada Ferro',
    );

    expect(panel().textContent).toContain(
      'Earl Rhodes was on the project team, and Ada Ferro stands in.',
    );
    expect(
      within(panel()).getByRole('option', { name: /ada ferro \(standing in for earl rhodes\)/i }),
    ).toBeDisabled();
  });

  /**
   * A Veteran's three Labor in the Veteran's place: the Workshop is paid for
   * again, and lands.
   */
  it('pays for last turn’s orders with the stand-in’s Labor', async () => {
    const user = open(withAMedic({}, [MASON]));
    expect(panel().textContent).toContain('3 Labor short');

    await user.selectOptions(
      within(panel()).getByLabelText(/standing in for earl rhodes/i),
      'Ada Ferro',
    );

    expect(panel().textContent).not.toContain('Labor short');
  });

  it('can be taken back', async () => {
    const user = open(withAMedic({}, [MASON]));
    const choice = () => within(panel()).getByLabelText(/standing in for earl rhodes/i);

    await user.selectOptions(choice(), 'Ada Ferro');
    await user.selectOptions(choice(), 'Nobody');

    expect(panel().textContent).toContain('Earl Rhodes was on the project team, and works nothing');
  });

  it('is a record, not a choice, once the Mission Phase is over', () => {
    open(
      withAMedic(
        {
          step: 'character-advancement',
          log: [
            called,
            defended,
            {
              turn: 4,
              phase: 'mission',
              at: AT,
              event: {
                kind: 'stood-in',
                survivor: MASON,
                name: 'Earl Rhodes',
                by: MEDIC,
                byName: 'Ada Ferro',
              },
            },
          ],
        },
        [MASON],
      ),
    );

    expect(panel().textContent).toContain('Ada Ferro stands in.');
    expect(within(panel()).queryByRole('combobox')).toBeNull();
  });
});
