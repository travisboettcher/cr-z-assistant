import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { generatingFlatUtility, withPlanningBegun } from '../test/campaigns';
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

  /**
   * pg. 22: the survivor "turns in the night and bites another survivor before
   * being destroyed". The control used to default to nobody and offer that as a
   * choice, so a failed check could skip the Damage the rule makes mandatory.
   * Who is bitten is still the player's; whether is not.
   */
  it('bites somebody even when the player never touches the picker', async () => {
    const user = open(dying());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');

    expect(walk().textContent).toContain('Carla Proust is bitten');

    await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

    expect(screen.getByRole('region', { name: /history/i }).textContent).toContain(
      'Carla Proust was bitten',
    );
  });

  /**
   * The Medical Clinic's Restraints, which sat in the catalogue with no reader
   * until now: "each set prevents one turned survivor from biting" (pg. 72).
   * The survivor still turns and is still removed — what a set prevents is the
   * bite, so the picker goes away rather than gaining a "nobody".
   */
  describe('with Restraints in the Clinic', () => {
    const restrained = (overrides: Partial<Campaign> = {}): Campaign =>
      dying({
        base: {
          id: 'small-town-home',
          slots: {
            garage: {
              built: { facility: 'medical-clinic', builtOnTurn: 1 },
              upgrades: ['restraints'],
            },
          },
        },
        ...overrides,
      });

    it('says a set is free and offers nobody to bite', () => {
      open(restrained());

      expect(walk().textContent).toContain('hold 1 more turned survivor this turn');
      expect(within(walk()).queryByLabelText(/^bites$/i)).toBeNull();
    });

    it('holds the survivor who turns, and Carla keeps her Health', async () => {
      const user = open(restrained());

      await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');
      expect(walk().textContent).toContain('The Restraints hold them, and nobody is bitten');

      await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

      // Earl is gone all the same; Carla is untouched.
      expect(
        within(screen.getByRole('region', { name: /community/i })).getAllByRole('listitem'),
      ).toHaveLength(1);
      expect(screen.getByRole('region', { name: /history/i }).textContent).toContain(
        'The Restraints held Earl Rhodes',
      );
    });

    /** One set holds one survivor: the second turning of the turn bites. */
    it('offers the bite again once the set is used', async () => {
      const user = open(
        restrained({
          survivors: [
            { ...createSurvivor('Earl Rhodes', 2, { id: EARL }), currentHp: 0 },
            { ...createSurvivor('Carla Proust', 4, { id: CARLA }), currentHp: 2 },
            { ...createSurvivor('Nell Haig', 2, { id: 'nell' }), currentHp: 0 },
          ],
          assignments: {
            [EARL]: { task: 'healing' },
            [CARLA]: { task: 'healing' },
            nell: { task: 'healing' },
          },
        }),
      );

      await user.selectOptions(
        within(walk()).getAllByLabelText(/^rolled$/i)[0] as HTMLElement,
        '1',
      );
      await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

      expect(within(walk()).getByLabelText(/^bites$/i)).toBeTruthy();
      expect(walk().textContent).not.toContain('more turned survivor this turn');
    });
  });

  it('offers no way to bite nobody while a candidate is being healed', () => {
    open(dying());

    const picker = within(walk()).getByLabelText(/^bites$/i);

    expect(within(picker).queryByRole('option', { name: /nobody/i })).toBeNull();
    expect(within(picker).getAllByRole('option')).toHaveLength(1);
  });

  /** No candidate, no bite — the control is absent and the check still runs. */
  it('resolves with no bite when nobody is being healed', async () => {
    const user = open(
      dying({
        survivors: [{ ...createSurvivor('Earl Rhodes', 2, { id: EARL }), currentHp: 0 }],
        assignments: {},
      }),
    );

    expect(within(walk()).queryByLabelText(/^bites$/i)).toBeNull();

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '1');
    await user.click(within(walk()).getByRole('button', { name: /resolve earl/i }));

    expect(
      within(screen.getByRole('region', { name: /community/i })).queryAllByRole('listitem'),
    ).toHaveLength(0);
  });
});

describe('Calculate Unrest', () => {
  it('adds the two terms up and shows the working', () => {
    // Six Rookies in a base that sleeps four: two Exhaustion, no Hunger.
    open(
      management({
        step: 'calculate-unrest',
        survivors: Array.from({ length: 6 }, (_, at) =>
          createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
        ),
      }),
    );

    expect(walk().textContent).toContain('0 Hunger + 2 Exhaustion = 2 Unrest');
  });

  it('says nothing about the mission team, which is Assign Beds’ business now', () => {
    open(
      management({
        step: 'calculate-unrest',
        survivors: Array.from({ length: 6 }, (_, at) =>
          createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
        ),
        assignments: { 'survivor-0': { task: 'mission', team: 1 } },
      }),
    );

    expect(walk().textContent).not.toContain('Exhaustion is above');
  });
});

/**
 * pg. 23 prints the penalty under Assign Beds, beside the Exhaustion it
 * follows from. It sat on Calculate Unrest until the playtest found it there.
 */
describe('the Exhaustion penalty', () => {
  const overworked = (overrides: Partial<Campaign> = {}) =>
    management({
      step: 'assign-beds',
      survivors: Array.from({ length: 8 }, (_, at) =>
        createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
      ),
      assignments: { 'survivor-0': { task: 'mission', team: 1 } },
      ...overrides,
    });

  it('offers to take somebody off an overworked mission team', async () => {
    const user = open(overworked());

    expect(walk().textContent).toContain('Exhaustion is above the mission team’s 1');

    await user.click(within(walk()).getByRole('button', { name: /take off/i }));

    expect(walk().textContent).not.toContain('Exhaustion is above');
  });

  it('is not offered on Calculate Unrest, where it used to sit', () => {
    open(overworked({ step: 'calculate-unrest' }));

    expect(within(walk()).queryByRole('button', { name: /take off/i })).toBeNull();
  });

  /**
   * The bug the guard exists for. Taking somebody off does not lower the
   * Exhaustion that called for it — beds and population are unchanged — so the
   * condition stays true, and the step went on offering the next name until the
   * mission team was empty.
   */
  it('takes one survivor, and then says it has', async () => {
    const user = open(
      overworked({
        assignments: {
          'survivor-0': { task: 'mission', team: 1 },
          'survivor-1': { task: 'mission', team: 1 },
        },
      }),
    );

    await user.click(
      within(walk()).getAllByRole('button', { name: /take off/i })[0] as HTMLElement,
    );

    expect(walk().textContent).toContain('already come off the mission team');
    expect(within(walk()).queryByRole('button', { name: /take off/i })).toBeNull();
  });

  it('says nothing about a mission team big enough for the Exhaustion', () => {
    open(
      management({
        step: 'assign-beds',
        assignments: { [EARL]: { task: 'mission', team: 1 } },
      }),
    );

    expect(walk().textContent).not.toContain('Exhaustion is above');
  });
});

describe('Check Storage', () => {
  const onTheStep = (overrides: Partial<Campaign> = {}) =>
    management({ step: 'check-storage', base: { id: 'greasy-spoon', slots: {} }, ...overrides });

  it('says so when nothing is over the cap', () => {
    open(onTheStep());

    expect(walk().textContent).toContain('Nothing is over the cap');
  });

  it('names what is about to be lost, and loses it once', async () => {
    const user = open(onTheStep({ materials: { food: 9, fuel: 0, hardware: 0, rare: 0 } }));

    expect(walk().textContent).toContain('−3 Food');

    await user.click(within(walk()).getByRole('button', { name: /lose the surplus/i }));

    expect(screen.getByLabelText(/^food$/i)).toHaveValue(6);
    expect(walk().textContent).toContain('Storage is checked for this turn');
    expect(within(walk()).queryByRole('button', { name: /lose the surplus/i })).toBeNull();
  });

  it('leaves Rare alone, however much of it there is', () => {
    open(onTheStep({ materials: { food: 0, fuel: 0, hardware: 0, rare: 99 } }));

    expect(walk().textContent).toContain('Nothing is over the cap');
  });
});

describe('Check the Horde', () => {
  const onTheStep = (overrides: Partial<Campaign> = {}) =>
    management({ step: 'check-the-horde', ...overrides });

  it('breaks the Siege Threat into the four terms it is made of', () => {
    open(onTheStep({ assignments: { [EARL]: { task: 'project' } } }));

    expect(walk().textContent).toContain('+1 on the project team');
    expect(walk().textContent).toContain('+2 turns since the last siege');
    expect(walk().textContent).toContain('Siege Threat 3');
  });

  it('says what the entered roll would mean, before it means it', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '9');
    expect(walk().textContent).toContain('Not this turn');

    // Two turns of quiet is a threat of 2, so a 10 makes 12 — still short of
    // the sixteen the rule wants.
    expect(walk().textContent).not.toContain('The horde comes');
  });

  it('calls the siege for next turn when the roll is high enough', async () => {
    // Eight on the project team is eight, plus two turns of quiet.
    const busy = onTheStep({
      survivors: Array.from({ length: 8 }, (_, at) =>
        createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
      ),
      assignments: Object.fromEntries(
        Array.from({ length: 8 }, (_, at) => [`survivor-${String(at)}`, { task: 'project' }]),
      ),
    });
    const user = open(busy);

    expect(walk().textContent).toContain('Siege Threat 10');

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '6');
    expect(walk().textContent).toContain('The horde comes');

    await user.click(within(walk()).getByRole('button', { name: /check the horde/i }));

    expect(walk().textContent).toContain('Next turn’s mission is a Siege Defense');
    expect(within(walk()).queryByRole('button', { name: /check the horde/i })).toBeNull();
  });

  it('records a quiet turn as a quiet turn', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '5');
    await user.click(within(walk()).getByRole('button', { name: /check the horde/i }));

    expect(walk().textContent).toContain('The horde stayed away');
  });
});

describe('Departures', () => {
  /** Eight Rookies with nowhere to sleep: eight Unrest and two turns of quiet. */
  const crowded = (overrides: Partial<Campaign> = {}) =>
    management({
      step: 'departures',
      base: null,
      survivors: Array.from({ length: 8 }, (_, at) =>
        createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
      ),
      ...overrides,
    });

  it('says the community holds together when it does', () => {
    open(management({ step: 'departures' }));

    expect(walk().textContent).toContain('Nobody is leaving');
  });

  it('offers the lowest Tier, and sends one away', async () => {
    const user = open(crowded());

    expect(walk().textContent).toContain('Unrest plus Siege Threat is 10');

    await user.click(
      within(walk()).getAllByRole('button', { name: /send away/i })[0] as HTMLElement,
    );

    expect(
      within(screen.getByRole('region', { name: /community/i })).getAllByRole('listitem'),
    ).toHaveLength(7);

    // And it stops there, saying what it did rather than re-deriving. It used
    // to read "Nobody is leaving. The community holds together." one line under
    // a log entry naming who had just left.
    expect(walk().textContent).toContain('Somebody has already left this turn');
    expect(within(walk()).queryByRole('button', { name: /send away/i })).toBeNull();
  });

  /**
   * The severe half of the same bug. The pressure that sent the first survivor
   * away is not the one the step re-derives afterwards — a departure unstaffs
   * what they were working and shrinks the project team — so while it stayed
   * over the threshold the step offered another name, and another.
   */
  it('sends one survivor away however far over the threshold the pressure is', async () => {
    const user = open(crowded({ turn: 8 }));

    await user.click(
      within(walk()).getAllByRole('button', { name: /send away/i })[0] as HTMLElement,
    );

    expect(
      within(screen.getByRole('region', { name: /community/i })).getAllByRole('listitem'),
    ).toHaveLength(7);
    expect(within(walk()).queryByRole('button', { name: /send away/i })).toBeNull();
  });

  /**
   * The rest of the departure rule (pg. 23): the leaver's Tier comes off the
   * turn's unused Labor, and where there is none to take it from, a project
   * goes unfinished.
   *
   * Nothing subtracts twice. The pool is the project team's summed Tiers and
   * the leaver is off the team the moment they walk, so what is left is the
   * consequence — and the consequence is a choice the screen offers rather
   * than takes.
   */
  const shorthanded = (overrides: Partial<Campaign> = {}) =>
    withPlanningBegun(
      crowded({
        base: { id: 'small-town-home', slots: {} },
        materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
        // Two Rookies making two Labor, and two Labor already ordered — so
        // this turn has nothing unused, which is the case the rule is about.
        assignments: {
          'survivor-0': { task: 'project' },
          'survivor-1': { task: 'project' },
        },
        projects: [{ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 3 }],
        // Fed first, because Feed is step 1 of this phase and Hunger is read
        // off its entry — a campaign standing at Departures has eaten.
        log: [
          {
            turn: 3,
            phase: 'management',
            at: '2026-08-30T00:00:00.000Z',
            event: { kind: 'survivors-fed', required: 8, hunger: 8, population: 8 },
          },
        ],
        ...overrides,
      }),
    );

  it('asks which project the departing Labor was paying for', async () => {
    const user = open(shorthanded());

    // Nothing to answer for until somebody has actually left.
    expect(walk().textContent).not.toContain('Labor short');

    await user.click(
      within(walk()).getAllByRole('button', { name: /send away/i })[0] as HTMLElement,
    );

    expect(walk().textContent).toContain('1 Labor short of what it ordered');
    expect(
      within(walk()).getByRole('button', { name: /leave workshop in the garage unfinished/i }),
    ).toBeTruthy();
  });

  it('drops the project the player picks, and stops asking', async () => {
    const user = open(shorthanded());

    await user.click(
      within(walk()).getAllByRole('button', { name: /send away/i })[0] as HTMLElement,
    );
    await user.click(
      within(walk()).getByRole('button', { name: /leave workshop in the garage unfinished/i }),
    );

    expect(walk().textContent).not.toContain('Labor short');
    // The Hardware comes back, as it does on a cancellation: the work was
    // never done.
    expect(screen.getByLabelText(/^hardware$/i)).toHaveValue(12);
    // Named, not just placed: the entry says which project left the queue, the
    // way the order and built entries always have (#151).
    expect(screen.getByRole('region', { name: /history/i }).textContent).toContain(
      'The Workshop on the Garage went unfinished',
    );
  });

  /**
   * A departure from outside the project team costs the turn no Labor at all,
   * and a screen that asked anyway would be taking a project for nothing.
   */
  it('asks nothing when the survivor who left was not on the project team', async () => {
    const user = open(shorthanded());

    await user.click(
      within(walk()).getAllByRole('button', { name: /send away/i })[2] as HTMLElement,
    );

    expect(walk().textContent).not.toContain('Labor short');
  });

  it('says so when everybody left is in no state to walk anywhere', () => {
    open(
      crowded({
        survivors: Array.from({ length: 9 }, (_, at) => ({
          ...createSurvivor(`Survivor ${String(at)}`, 1, { id: `survivor-${String(at)}` }),
          currentHp: 0,
        })),
      }),
    );

    expect(walk().textContent).toContain('in no state to walk anywhere');
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
    // Rain Collectors rather than a second Station worker: the head count is
    // half this fixture's arrangement, and flat generation backs the Clinic's
    // point (#139) without adding a mouth to feed.
    generatingFlatUtility(
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
      }),
      'water',
    );

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
