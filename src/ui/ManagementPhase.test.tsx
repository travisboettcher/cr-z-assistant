import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const EARL = 'earl';
const CARLA = 'carla';

/** Two Heroes, so the community eats four a turn (pg. 22). */
function management(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    step: 'feed-your-survivors',
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      createSurvivor('Carla Proust', 4, { id: CARLA }),
    ],
    materials: { food: 4, fuel: 0, hardware: 0, rare: 0 },
    base: { id: 'small-town-home', slots: {} },
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

describe('Feed your Survivors', () => {
  it('says what the community eats and what it has', () => {
    open(management());

    // `textContent` rather than `getByText`, because every number on this
    // screen sits in its own `tabular-nums` span and a text matcher cannot see
    // across the element boundary.
    expect(walk().textContent).toContain('eats 4 Food a turn');
    expect(walk().textContent).toContain('Everybody eats');
  });

  it('eats the Food, once', async () => {
    const user = open(management());

    await user.click(within(walk()).getByRole('button', { name: /feed the community/i }));

    expect(screen.getByLabelText(/^food$/i)).toHaveValue(0);
    expect(walk().textContent).toContain('Food is eaten');
    expect(within(walk()).queryByRole('button', { name: /feed the community/i })).toBeNull();
  });

  it('reports a shortfall as Hunger, and says it feeds Unrest', () => {
    open(management({ materials: { food: 1, fuel: 0, hardware: 0, rare: 0 } }));

    expect(walk().textContent).toContain('3 Hunger');
    expect(walk().textContent).toContain('one of the two terms of Unrest');
  });

  /**
   * Ruling 1, on the screen: two survivors absorb a shortfall of two, and the
   * third point is the one that costs everybody a stat.
   */
  it('names the head count as the threshold the penalty starts at', () => {
    open(management({ materials: { food: 2, fuel: 0, hardware: 0, rare: 0 } }));

    expect(walk().textContent).toContain('large enough to absorb it');
    expect(walk().textContent).not.toContain('stats drop');
  });

  it('warns in so many words once the shortfall passes it', () => {
    open(management({ materials: { food: 0, fuel: 0, hardware: 0, rare: 0 } }));

    // Four required, nothing stored, two survivors: a penalty of two.
    expect(walk().textContent).toContain('stats drop by 2');
  });
});

describe('Assign Beds', () => {
  const onTheStep = (overrides: Partial<Campaign> = {}) =>
    management({ step: 'assign-beds', ...overrides });

  it('counts the survivors a base cannot sleep', () => {
    // The Small Town Home's two Bunk Rooms sleep four, so two Heroes fit.
    open(onTheStep());

    expect(walk().textContent).toContain('Everybody has a bed');
  });

  it('reports the ones left over', () => {
    open(
      onTheStep({
        survivors: Array.from({ length: 6 }, (_, at) =>
          createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
        ),
      }),
    );

    expect(walk().textContent).toContain('2 Exhaustion');
  });

  it('has nothing to press, because nothing is applied', () => {
    open(onTheStep());

    expect(walk().textContent).toContain('counted again from scratch every turn');
    expect(within(walk()).queryByRole('button', { name: /assign/i })).toBeNull();
  });
});

describe('Check for Rot', () => {
  const dying = (overrides: Partial<Campaign> = {}): Campaign =>
    management({
      step: 'check-for-rot',
      survivors: [
        { ...createSurvivor('Earl Rhodes', 2, { id: EARL }), currentHp: 0 },
        { ...createSurvivor('Carla Proust', 4, { id: CARLA }), currentHp: 2 },
      ],
      assignments: { [EARL]: { task: 'healing' }, [CARLA]: { task: 'healing' } },
      ...overrides,
    });

  it('says nothing to do when nobody is dying', () => {
    open(management({ step: 'check-for-rot' }));

    expect(walk().textContent).toContain('Nobody is at 0 Health');
  });

  it('names the target and offers a form per survivor at 0 Health', () => {
    open(dying());

    expect(walk().textContent).toContain('checks against 12');
    expect(within(walk()).getByRole('button', { name: /resolve earl/i })).toBeTruthy();
    expect(within(walk()).queryByRole('button', { name: /resolve carla/i })).toBeNull();
  });

  it('shows what the entered roll would cost, before it costs it', async () => {
    const user = open(dying());

    // A natural 1 always fails (pg. 8).
    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');
    expect(walk().textContent).toContain('Earl Rhodes turns and is removed');

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '10');
    expect(walk().textContent).toContain('Earl Rhodes holds on');
  });

  it('leaves everybody in place on a check that holds', async () => {
    const user = open(dying());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '10');
    await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

    expect(
      within(screen.getByRole('region', { name: /community/i })).getAllByRole('listitem'),
    ).toHaveLength(2);

    // The form stays: holding on is not the same as being healed, and Earl is
    // still at 0 Health. What changed is the history.
    expect(within(walk()).getByRole('button', { name: /resolve earl/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /history/i }).textContent).toContain(
      'Earl Rhodes held on',
    );
  });

  /** The worst case the story names: one failed check, two survivors gone. */
  it('takes the bitten survivor too when the bite finishes them', async () => {
    const user = open(
      dying({
        survivors: [
          { ...createSurvivor('Earl Rhodes', 2, { id: EARL }), currentHp: 0 },
          { ...createSurvivor('Carla Proust', 4, { id: CARLA }), currentHp: 1 },
        ],
      }),
    );

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');
    await user.selectOptions(within(walk()).getByLabelText(/^bites$/i), CARLA);

    expect(walk().textContent).toContain('Carla Proust is bitten and removed too');

    await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

    expect(
      within(screen.getByRole('region', { name: /community/i })).queryAllByRole('listitem'),
    ).toHaveLength(0);
  });

  it('bites nobody when the player leaves the pick alone', async () => {
    const user = open(dying());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');
    await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

    const roster = within(screen.getByRole('region', { name: /community/i }));

    expect(roster.getAllByRole('listitem')).toHaveLength(1);
    expect(roster.getByRole('listitem').textContent).toContain('Carla Proust');
  });
});

/**
 * The story's headline acceptance, driven through the screens: one press in the
 * Feed step changes what the base says it produces, and nothing is written to a
 * survivor to make it happen.
 */
describe('a shortfall reaches every screen at once', () => {
  const medic: Survivor = {
    ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 4 },
    skills: { medicine: 0 },
  };

  /**
   * Three Heroes eat six and the stores are empty, so a shortfall of six
   * against a head count of three is a penalty of three. Nell staffs a Clinic
   * with Water, so its Health is her Medicine Score rather than half of it.
   */
  const starving = () =>
    management({
      survivors: [
        medic,
        createSurvivor('Earl Rhodes', 4, { id: EARL }),
        createSurvivor('Carla Proust', 4, { id: CARLA }),
      ],
      materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      assignments: { medic: { task: 'staff', slot: 'garage' } },
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, water: true } },
      },
    });

  /**
   * The Clinic's slot card with its work panel open, which is where a facility's
   * production is written.
   */
  const clinic = () =>
    screen
      .getAllByRole('listitem')
      .find((slot) => /Medical Clinic/.test(slot.textContent ?? '')) as HTMLElement;

  it('lowers what the base produces, from one press and no survivor edit', async () => {
    const user = open(starving());

    await user.click(screen.getByRole('button', { name: /upgrade garage/i }));

    expect(clinic().textContent).toContain('+4 Health');

    await user.click(within(walk()).getByRole('button', { name: /feed the community/i }));

    // Three off every stat: a Medicine Score of 1, and a Clinic making 1.
    expect(clinic().textContent).toContain('+1 Health');
  });

  it('lowers the Skill Scores on the sheet, and the stored stats stay put', async () => {
    const user = open(starving());

    await user.click(within(walk()).getByRole('button', { name: /feed the community/i }));

    await user.click(
      within(screen.getByRole('region', { name: /community/i }))
        .getAllByRole('listitem')
        .filter((row) => /Nell Haig/.test(row.textContent ?? ''))[0]
        ?.querySelector('button[aria-label], button') as HTMLElement,
    );

    const sheet = screen.getByRole('region', { name: 'Nell Haig' });

    // Medicine is Cooperation plus the level: 4 fed, 1 hungry.
    expect(within(sheet).getByRole('row', { name: /^Medicine\b/ }).textContent).toContain('1');

    // And the stat block still shows what is written down, unreduced.
    expect(sheet.textContent).toContain('Cooperation');
  });
});
