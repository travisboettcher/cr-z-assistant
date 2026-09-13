import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A campaign part-way through a turn, arranged rather than clicked.
 *
 * Reaching the Planning Phase by pressing Next is a journey the e2e suite
 * drives; what these are about is what the phase's four steps do once you are
 * in one.
 */
function planning(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    step: 'assign-facility-staff',
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 1 },
    ],
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
const next = () => screen.getByRole('button', { name: /^next:/i });

describe('the Planning Phase steps', () => {
  it('offers a control for each built facility, and none for an empty slot', () => {
    open(planning());

    // The Small Town Home ships two Bunk Rooms and a Kitchen; the garage and
    // front yard are empty and there is nothing in them to work.
    expect(within(walk()).getByRole('group', { name: /kitchen — kitchen/i })).toBeTruthy();
    expect(within(walk()).queryByRole('group', { name: /garage/i })).toBeNull();
  });

  it('counts whoever has nothing to do, on every step of the phase', async () => {
    const user = open(planning());

    expect(within(walk()).getByText(/2 with nothing to do/i)).toBeTruthy();

    await user.click(next());
    expect(within(walk()).getByText(/2 with nothing to do/i)).toBeTruthy();
  });

  it('says so plainly once everybody is busy', async () => {
    const user = open(planning({ assignments: { [EARL]: { task: 'project' } } }));
    await user.click(next());

    await user.click(
      within(screen.getByRole('group', { name: /on the project team/i })).getByRole('checkbox', {
        name: /carla/i,
      }),
    );

    expect(within(walk()).getByText(/everybody has something to do/i)).toBeTruthy();
  });

  it('shows the Labor the project team generates, and follows it', async () => {
    const user = open(planning());
    await user.click(next());

    const team = within(screen.getByRole('group', { name: /on the project team/i }));
    await user.click(team.getByRole('checkbox', { name: /earl/i }));

    // A Hero is four Labor.
    expect(within(walk()).getByText(/generates/i).textContent).toMatch(/4/);
  });

  it('warns about resting at full Health without refusing it', async () => {
    const user = open(planning({ step: 'assign-rest-and-healing' }));

    const resting = within(screen.getByRole('group', { name: /^resting/i }));
    const earl = resting.getByRole('checkbox', { name: /earl/i });

    expect(resting.getByText(/already at full health/i)).toBeTruthy();
    expect(earl).toBeEnabled();

    // Free and reversible, so advice rather than refusal — the lesson Z2-8
    // learned by disabling a checkbox on a warning.
    await user.click(earl);
    expect(earl).toBeChecked();
  });

  it('warns that only one survivor may rest, naming who is', async () => {
    const user = open(planning({ step: 'assign-rest-and-healing' }));

    const resting = within(screen.getByRole('group', { name: /^resting/i }));
    await user.click(resting.getByRole('checkbox', { name: /carla/i }));

    expect(
      resting.getByText(/only one survivor may rest a turn, and carla proust is/i),
    ).toBeTruthy();
  });

  it('warns that healing needs a Medical Clinic', () => {
    open(planning({ step: 'assign-rest-and-healing' }));

    const healing = within(screen.getByRole('group', { name: /being healed/i }));
    expect(healing.getAllByText(/needs a medical clinic/i).length).toBeGreaterThan(0);
  });

  it('warns about sending an injured survivor on a mission', () => {
    open(planning({ step: 'assign-mission-team' }));

    const team = within(screen.getByRole('group', { name: /on the mission team/i }));
    expect(team.getByText(/injured survivors cannot be sent/i)).toBeTruthy();
  });

  it('moves a survivor between tasks rather than giving them two', async () => {
    const user = open(planning({ step: 'assign-rest-and-healing' }));

    const resting = within(screen.getByRole('group', { name: /^resting/i }));
    const healing = within(screen.getByRole('group', { name: /being healed/i }));

    await user.click(resting.getByRole('checkbox', { name: /carla/i }));
    expect(healing.getByText(/currently resting/i)).toBeTruthy();

    await user.click(healing.getByRole('checkbox', { name: /carla/i }));
    expect(resting.getByRole('checkbox', { name: /carla/i })).not.toBeChecked();
    expect(healing.getByRole('checkbox', { name: /carla/i })).toBeChecked();
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

    expect(within(walk()).getByText(/1 with nothing to do/i)).toBeTruthy();
    expect(within(walk()).getByRole('group', { name: /kitchen — kitchen/i })).toBeTruthy();
  });

  it('says there is nothing to staff before a base is claimed', () => {
    open(planning({ base: null }));

    expect(within(walk()).getByText(/no base, so there is nothing to staff/i)).toBeTruthy();
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
  it('offers a control only where the facility takes staff', () => {
    open(planning());

    // The Small Town Home ships two Bunk Rooms and a Kitchen. Only the Kitchen
    // names a skill.
    expect(within(walk()).getByRole('group', { name: /kitchen — kitchen/i })).toBeTruthy();
    expect(within(walk()).queryByRole('group', { name: /bunk room/i })).toBeNull();
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
    expect(walk().textContent).toContain(
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
      materials: { food: 0, fuel: 0, hardware: 9, rare: 0 },
      // Somebody to do the work, since Z3-5 made Labor the project team's.
      assignments: { [EARL]: { task: 'project' } },
    });

  it('says which step orders belong to, and orders anyway', async () => {
    const user = open(ready('assign-mission-team'));

    await user.click(screen.getByRole('button', { name: /build in garage/i }));

    expect(screen.getByText(/ordered in assign project team/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /order the build/i })).toBeEnabled();
  });

  it('says nothing on the step orders actually belong to', async () => {
    const user = open(ready('assign-project-team'));

    await user.click(screen.getByRole('button', { name: /build in garage/i }));

    expect(screen.queryByText(/are ordered in/i)).toBeNull();
  });
});
