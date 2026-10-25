import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { withPlanningBegun } from '../test/campaigns';
import { CampaignProvider } from '../state/CampaignProvider';
import { lane, moveTo, openPanel, pickUp } from '../test/screens';
import { App } from './App';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A campaign part-way through a turn, arranged rather than clicked.
 *
 * Reaching the Planning Phase by pressing Next is a journey the e2e suite
 * drives; what these are about is what the phase's four steps do once you are
 * in one.
 *
 * It carries the `planning-began` entry the walk writes on the way into the
 * first step, because that record is not decoration: a turn's Labor is not
 * there to spend until this turn's Planning Phase has assigned the team that
 * generates it (pg. 20). A campaign standing on a Planning step without the
 * entry is a state the app cannot reach, and the screens would price orders
 * against nothing.
 */
function planning(overrides: Partial<Campaign> = {}): Campaign {
  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    step: 'assign-facility-staff',
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 1 },
    ],
    base: { id: 'small-town-home', slots: {} },
    ...overrides,
  });
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
const next = () => screen.getByRole('button', { name: /^next:/i });

describe('the Planning Phase steps', () => {
  it('offers a lane for each built facility, and none for an empty slot', () => {
    open(planning());

    // The Small Town Home ships two Bunk Rooms and a Kitchen; the garage and
    // front yard are empty and there is nothing in them to work.
    expect(lane('Kitchen')).toBeTruthy();
    expect(within(walk()).queryByRole('region', { name: /garage/i })).toBeNull();
  });

  it('keeps whoever has nothing to do in their own lane, on every step of the phase', async () => {
    const user = open(planning());

    const idle = () => within(lane('Nothing to do'));
    expect(idle().getByRole('button', { name: /^earl rhodes/i })).toBeTruthy();
    expect(idle().getByRole('button', { name: /^carla proust/i })).toBeTruthy();

    await user.click(next());
    expect(idle().getByRole('button', { name: /^earl rhodes/i })).toBeTruthy();
    expect(idle().getByRole('button', { name: /^carla proust/i })).toBeTruthy();
  });

  it('says so plainly once everybody is busy', async () => {
    const user = open(planning({ assignments: { [EARL]: { task: 'project' } } }));
    await user.click(next());

    moveTo(/^carla proust/i, 'Project team');

    expect(within(lane('Nothing to do')).getByText(/everybody has something to do/i)).toBeTruthy();
  });

  it('shows the Labor the project team generates, and follows it', async () => {
    const user = open(planning());
    await user.click(next());

    moveTo(/^earl rhodes/i, 'Project team');

    // A Hero is four Labor.
    expect(within(walk()).getByText(/generates/i).textContent).toMatch(/4/);
  });

  /**
   * The turn after a Siege Defense left no zombie standing, the team generates
   * a point each on top of their Tiers (pg. 86, #183) — and the sentence beside
   * the number says so, or a 6 for a Tier 4 and a Tier 1 reads as a bug (#143).
   */
  it('names the point each a clean siege last turn adds', () => {
    open(
      planning({
        step: 'assign-project-team',
        assignments: { [EARL]: { task: 'project' }, [CARLA]: { task: 'project' } },
        log: [
          {
            turn: 2,
            phase: 'mission',
            at: '2026-09-12T09:00:00.000Z',
            event: { kind: 'siege-defense-resolved', zombiesLeft: 0, survivorsExited: 1 },
          },
        ],
      }),
    );

    const caption = within(walk()).getByText(/generates/i).textContent;

    // A Hero's four and a Veteran's three, and a point each.
    expect(caption).toMatch(/generates 9 Labor/);
    expect(caption).toMatch(/plus 2 — a point each — for last turn’s Siege Defense/);

    moveTo(/^carla proust/i, 'Nothing to do');

    expect(within(walk()).getByText(/generates/i).textContent).toMatch(/generates 5 Labor/);
  });

  it('warns about resting at full Health before the move, without refusing it', () => {
    open(planning({ step: 'assign-rest-and-healing' }));

    pickUp(/^earl rhodes/i);
    const resting = within(lane('Resting'));

    expect(resting.getByText(/already at full health/i)).toBeTruthy();

    // Free and reversible, so advice rather than refusal — the lesson Z2-8
    // learned by disabling a checkbox on a warning.
    const move = resting.getByRole('button', { name: 'Move Earl Rhodes here' });
    expect(move).toBeEnabled();
    fireEvent.click(move);
    expect(resting.getByRole('button', { name: /^earl rhodes/i })).toBeTruthy();
  });

  /** Infection earns a survivor at full Health no point (pg. 19, 21; #219). */
  it('warns about resting at full Health in a Viral campaign, Infection or not', () => {
    open(
      planning({
        step: 'assign-rest-and-healing',
        origin: 'viral',
        survivors: [
          { ...createSurvivor('Earl Rhodes', 4, { id: EARL }), infection: 4 },
          { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 1, infection: 4 },
        ],
      }),
    );

    const warned = /already at full health, so resting would do nothing/i;

    pickUp(/^earl rhodes/i);
    expect(within(lane('Resting')).getAllByText(warned)).toHaveLength(1);

    pickUp(/^carla proust/i);
    expect(within(lane('Resting')).queryByText(warned)).toBeNull();
  });

  it('warns that only one survivor may rest, naming who is', () => {
    open(planning({ step: 'assign-rest-and-healing' }));

    moveTo(/^carla proust/i, 'Resting');
    pickUp(/^earl rhodes/i);

    expect(
      within(lane('Resting')).getByText(/only one survivor may rest a turn, and carla proust is/i),
    ).toBeTruthy();
  });

  it('warns that healing needs a Medical Clinic', () => {
    open(planning({ step: 'assign-rest-and-healing' }));

    pickUp(/^carla proust/i);

    expect(within(lane('Being healed')).getByText(/needs a medical clinic/i)).toBeTruthy();
  });

  /** #239: a reason said once, naming everybody it applies to. */
  it('says a reason shared by a lane’s cards once', () => {
    open(
      planning({
        step: 'assign-rest-and-healing',
        assignments: { [EARL]: { task: 'healing' }, [CARLA]: { task: 'healing' } },
      }),
    );

    expect(
      within(lane('Being healed')).getAllByText(/healing needs a medical clinic/i),
    ).toHaveLength(1);
    expect(
      within(lane('Being healed')).getByText(/^Earl Rhodes, Carla Proust: Healing needs/),
    ).toBeTruthy();
  });

  it('warns about sending an injured survivor on a mission', () => {
    open(planning({ step: 'assign-mission-team' }));

    pickUp(/^carla proust/i);

    expect(
      within(lane('Mission team 1')).getByText(/injured survivors can’t be sent/i),
    ).toBeTruthy();
  });

  it('offers a second mission team once somebody is on the first (pg. 21; Z4-2)', () => {
    open(planning({ step: 'assign-mission-team' }));

    expect(within(walk()).queryByRole('region', { name: 'Mission team 2' })).toBeNull();

    moveTo(/^earl rhodes/i, 'Mission team 1');
    expect(within(lane('Mission team 2')).getByText(/nobody yet/i)).toBeTruthy();

    // Moving Earl to team 2 takes him off team 1, rather than putting him on both.
    moveTo(/^earl rhodes/i, 'Mission team 2');
    expect(
      within(lane('Mission team 2')).getByRole('button', { name: /^earl rhodes/i }),
    ).toBeTruthy();
    expect(
      within(lane('Mission team 1')).queryByRole('button', { name: /^earl rhodes/i }),
    ).toBeNull();
  });

  it('moves a survivor between tasks rather than giving them two', () => {
    open(planning({ step: 'assign-rest-and-healing' }));

    moveTo(/^carla proust/i, 'Resting');
    moveTo(/^carla proust/i, 'Being healed');

    expect(within(lane('Resting')).queryByRole('button', { name: /^carla proust/i })).toBeNull();
    expect(
      within(lane('Being healed')).getByRole('button', { name: /^carla proust/i }),
    ).toBeTruthy();
  });

  /**
   * #237. Unticking a checkbox left the survivor with nothing; moving a card
   * back puts their task back, because the move names where they go.
   */
  it('puts a survivor back where they were by moving them back', async () => {
    const user = open(planning({ assignments: { [EARL]: { task: 'staff', slot: 'kitchen' } } }));
    await user.click(next());

    // Earl is working the Kitchen, from the step before.
    expect(
      within(lane('Elsewhere')).getByRole('button', { name: /^earl rhodes/i }),
    ).toHaveTextContent('working the Kitchen');

    moveTo(/^earl rhodes/i, 'Project team');
    expect(
      within(lane('Project team')).getByRole('button', { name: /^earl rhodes/i }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^back to assign facility staff$/i }));
    moveTo(/^earl rhodes/i, 'Kitchen');

    expect(within(lane('Kitchen')).getByRole('button', { name: /^earl rhodes/i })).toBeTruthy();
  });

  it('puts a picked card down when it is pressed again', () => {
    open(planning());

    pickUp(/^earl rhodes/i);
    expect(
      within(lane('Kitchen')).getByRole('button', { name: 'Move Earl Rhodes here' }),
    ).toBeTruthy();

    pickUp(/^earl rhodes/i);
    expect(within(lane('Kitchen')).queryByRole('button', { name: /^move/i })).toBeNull();
  });

  it('does not take the screen down when a staffed slot loses its facility', () => {
    // The assignment outlives what it named. `saveFile.ts` accepts this on
    // purpose — it is a rule rather than a damaged file — so the screen has to.
    open(
      planning({
        assignments: { [EARL]: { task: 'staff', slot: 'garage' } },
        base: { id: 'small-town-home', slots: {} },
      }),
    );

    expect(within(lane('Elsewhere')).getByRole('button', { name: /^earl rhodes/i })).toBeTruthy();
    expect(lane('Kitchen')).toBeTruthy();
  });

  it('says there is nothing to staff before a base is claimed', () => {
    open(planning({ base: null }));

    expect(within(walk()).getByText(/no base, so there is nothing to staff/i)).toBeTruthy();
    expect(lane('Nothing to do')).toBeTruthy();
  });
});

/**
 * pg. 54: a staffed facility takes one survivor unless an upgrade widens it,
 * and a facility with no skill in its effect takes none at all.
 *
 * The base screen's slot card has always gated its staffing control on this.
 * The Planning screen offered one for every occupant, so a Bunk Room could be
 * "staffed" — doing nothing, and costing a point of Siege Threat for it.
 */
describe('which facilities can be staffed', () => {
  it('offers a lane only where the facility takes staff', () => {
    open(planning());

    // The Small Town Home ships two Bunk Rooms and a Kitchen. Only the Kitchen
    // names a skill.
    expect(lane('Kitchen')).toBeTruthy();
    expect(within(walk()).queryByRole('region', { name: /bunk room/i })).toBeNull();
  });

  it('says who is assigned to a full facility and not working', () => {
    open(
      planning({
        assignments: {
          [EARL]: { task: 'staff', slot: 'kitchen' },
          [CARLA]: { task: 'staff', slot: 'kitchen' },
        },
      }),
    );

    // The capacity is its own element, so the sentence is matched on the region.
    expect(lane('Kitchen').textContent).toContain(
      'Takes 1, so Carla Proust is assigned here and not working',
    );
  });

  it('says nothing when the facility has room', () => {
    open(planning({ assignments: { [EARL]: { task: 'staff', slot: 'kitchen' } } }));

    expect(within(walk()).queryByText(/not working/i)).toBeNull();
  });
});

/**
 * Z3-11 moved this note with the verb it is about. Projects are ordered in the
 * Planning Phase now (pg. 20) and finish in the next Advancement Phase, so the
 * step the app points at is this phase's rather than that one's.
 */
describe('ordering outside the step it belongs to', () => {
  const ready = (step: Campaign['step']): Campaign =>
    planning({
      step,
      materials: { food: 0, fuel: 0, hardware: 9 },
      // Somebody to do the work, since Z3-5 made Labor the project team's.
      assignments: { [EARL]: { task: 'project' } },
    });

  it('says which step orders belong to, and orders anyway', async () => {
    const user = open(ready('assign-mission-team'));

    openPanel('base');
    await user.click(screen.getByRole('button', { name: /build in garage/i }));

    expect(screen.getByText(/ordered in assign project team/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /order the build/i })).toBeEnabled();
  });

  it('says nothing on the step orders actually belong to', async () => {
    const user = open(ready('assign-project-team'));

    openPanel('base');
    await user.click(screen.getByRole('button', { name: /build in garage/i }));

    expect(screen.queryByText(/are ordered in/i)).toBeNull();
  });
});

/**
 * #235. A project team was assigned and nothing ordered, so the turn's Labor
 * was lost, and nothing said so: the base and the Inventory were two
 * underlined words in a sentence.
 */
describe('a project team with nothing ordered', () => {
  const idle = () =>
    planning({ step: 'assign-project-team', assignments: { [EARL]: { task: 'project' } } });

  it('says how much Labor is left, and opens the base to spend it', async () => {
    const user = open(idle());

    // Earl is Tier 4: four Labor (pg. 20).
    expect(walk().textContent).toMatch(/4 of 4 Labor left to spend this turn/);

    await user.click(within(walk()).getByRole('button', { name: 'Order on the base' }));

    expect(screen.getByRole('dialog', { name: 'Base' })).toBeTruthy();
  });

  it('asks before Next leaves the Labor unspent', async () => {
    const user = open(idle());

    await user.click(next());

    expect(
      screen.getByRole('dialog', { name: 'Go on to Assign Rest and Healing?' }),
    ).toHaveTextContent('4 Labor with nothing ordered. It is lost at the end of the turn.');
  });

  it('shows no Labor to spend with nobody on the team', () => {
    open(planning({ step: 'assign-project-team' }));

    expect(within(walk()).queryByText(/labor left to spend/i)).toBeNull();
    expect(within(walk()).queryByRole('button', { name: 'Order on the base' })).toBeNull();
  });
});
