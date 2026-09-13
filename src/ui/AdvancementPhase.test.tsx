import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const EARL = 'earl';
const CARLA = 'carla';

/**
 * A campaign part-way through a turn, arranged rather than clicked.
 *
 * Getting to the Advancement Phase by pressing Next is a journey the e2e suite
 * drives; these are about what the five steps do once you are in one.
 *
 * **Earl went on the mission and Carla did not**, which is the distinction
 * three of the four XP pools turn on.
 */
function advancement(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 3,
    step: 'character-advancement',
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      createSurvivor('Carla Proust', 3, { id: CARLA }),
    ],
    assignments: { [EARL]: { task: 'mission', team: 1 } },
    base: { id: 'small-town-home', slots: {} },
    ...overrides,
  };
}

/** A survivor whose Teaching Score is exactly this (pg. 8). */
function teacher(id: string, name: string, score: number): Survivor {
  return {
    ...createSurvivor(name, 4, { id }),
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: score },
    skills: { teaching: 0 },
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

/** The +1 XP button on the row for this survivor, under this pool. */
function award(pool: RegExp, survivor: RegExp) {
  const heading = within(walk()).getByText(pool);
  const row = within(heading.closest('li') as HTMLElement)
    .getAllByRole('listitem')
    .find((item) => survivor.test(item.textContent ?? ''));

  return within(row as HTMLElement).getByRole('button', { name: /\+1 xp/i });
}

describe('Character Advancement', () => {
  it('offers the mission’s XP only to the survivors who went', () => {
    open(advancement());

    const heading = within(walk()).getByText(/for going on the mission/i);
    const rows = within(heading.closest('li') as HTMLElement).getAllByRole('listitem');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Earl Rhodes');
  });

  it('hands a point over, and says so on the survivor’s row', async () => {
    const user = open(advancement());

    expect(within(walk()).getByText(/for going on the mission/i).textContent).toContain('1 of 1');

    await user.click(award(/for going on the mission/i, /earl/i));

    expect(within(walk()).getByText(/for going on the mission/i).textContent).toContain('0 of 1');
    expect(award(/for going on the mission/i, /earl/i)).toBeDisabled();
  });

  /**
   * pg. 12: a Teacher on the mission **replaces** the discretionary point. The
   * screen has to show the replacement as a replacement — an app that offered
   * both would hand out one XP more than the book does, every turn.
   */
  it('takes the discretionary point away when a Teacher went out', () => {
    open(
      advancement({
        survivors: [
          teacher(EARL, 'Earl Rhodes', 2),
          createSurvivor('Carla Proust', 3, { id: CARLA }),
        ],
      }),
    );

    expect(within(walk()).getByText(/the discretionary point/i).textContent).toContain('0 of 0');
    expect(within(walk()).getByText(/a teacher on the mission takes this point/i)).toBeTruthy();
    expect(within(walk()).getByText(/from a teacher on the mission/i).textContent).toContain(
      '2 of 2',
    );
  });

  it('says why an empty pool is empty rather than showing nothing', () => {
    open(advancement({ assignments: {} }));

    expect(within(walk()).getByText(/nobody is on a mission team/i)).toBeTruthy();
    expect(within(walk()).getByText(/no staffed training room/i)).toBeTruthy();
  });

  it('stops at the cap for one survivor while the pool still has XP', async () => {
    const user = open(
      advancement({
        survivors: [
          teacher(EARL, 'Earl Rhodes', 4),
          createSurvivor('Carla Proust', 3, { id: CARLA }),
        ],
      }),
    );

    const pool = /from a teacher on the mission/i;

    await user.click(award(pool, /carla/i));
    await user.click(award(pool, /carla/i));

    // Two is all one survivor may take (pg. 12) — and the pool of four is not
    // the reason, because Earl can still be taught.
    expect(award(pool, /carla/i)).toBeDisabled();
    expect(award(pool, /earl/i)).toBeEnabled();
  });
});

describe('Add Materials to Storage', () => {
  const onTheStep = (overrides: Partial<Campaign> = {}) =>
    advancement({ step: 'add-materials-to-storage', ...overrides });

  it('proposes the base’s own production before any roll is entered', () => {
    open(onTheStep());

    // The Small Town Home's built-in Kitchen is staffed and empty, so nothing
    // is produced and the step still says what it is proposing.
    expect(within(walk()).getByText(/going into storage/i)).toBeTruthy();
    expect(within(walk()).getByText(/\+0 Food/)).toBeTruthy();
  });

  it('turns a roll into the material the table gives', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();
    expect(within(walk()).getByText(/rolled 4/i)).toBeTruthy();
  });

  /**
   * The story's headline acceptance, driven through the screen: a substitution
   * **changes** a result. Two rolls in, two materials out — never three.
   */
  it('forces a result without adding a material', async () => {
    const user = open(
      onTheStep({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 4, { id: EARL }),
            stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
            skills: { mechanics: 0 },
          },
          createSurvivor('Carla Proust', 3, { id: CARLA }),
        ],
      }),
    );

    const rolled = within(walk()).getByLabelText(/^rolled$/i);
    await user.selectOptions(rolled, '4');
    await user.selectOptions(rolled, '5');

    expect(within(walk()).getByText(/\+2 Food/)).toBeTruthy();

    const [first] = within(walk()).getAllByLabelText(/force the result of this roll/i);
    await user.selectOptions(first as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();
    expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
  });

  it('offers no way to force a result when nobody who went can', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).queryByLabelText(/force the result of this roll/i)).toBeNull();
  });

  /**
   * The over-spend is a warning, not a refusal: the pool is a Skill Score
   * somebody typed in, and a control that vanished could not say what it was
   * for. Same posture as the whole of the Planning Phase.
   */
  it('warns about forcing more results than the team’s Score allows', async () => {
    const user = open(
      onTheStep({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 4, { id: EARL }),
            // A Score of one: one result, and no more.
            stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 1 },
            skills: { mechanics: 0 },
          },
        ],
      }),
    );

    const rolled = within(walk()).getByLabelText(/^rolled$/i);
    await user.selectOptions(rolled, '4');
    await user.selectOptions(rolled, '5');

    const forcers = within(walk()).getAllByLabelText(/force the result of this roll/i);
    await user.selectOptions(forcers[0] as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).queryByText(/results forced with mechanics/i)).toBeNull();

    await user.selectOptions(forcers[1] as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).getByText(/2 results forced with mechanics/i)).toBeTruthy();
    expect(within(walk()).getByRole('button', { name: /add to storage/i })).toBeEnabled();
  });

  it('puts the haul in storage once, and refuses to do it twice', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '10');
    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(within(walk()).getByText(/already in storage/i)).toBeTruthy();
    expect(within(walk()).queryByRole('button', { name: /add to storage/i })).toBeNull();

    // And it landed: the overview's Rare count moved.
    expect(screen.getByLabelText(/^rare$/i)).toHaveValue(1);
  });

  it('takes a roll back off the list', async () => {
    const user = open(onTheStep());

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');
    await user.click(within(walk()).getByRole('button', { name: /remove/i }));

    expect(within(walk()).queryByText(/rolled 4/i)).toBeNull();
    expect(within(walk()).getByText(/\+0 Food/)).toBeTruthy();
  });

  it('reports a haul over the cap and stores all of it anyway', async () => {
    const user = open(
      onTheStep({
        // The Small Town Home stores 4 Food (pg. 54).
        materials: { food: 4, fuel: 0, hardware: 0, rare: 0 },
      }),
    );

    await user.selectOptions(within(walk()).getByLabelText(/^rolled$/i), '4');

    expect(within(walk()).getByText(/is over this base’s/i)).toBeTruthy();

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(screen.getByLabelText(/^food$/i)).toHaveValue(5);
  });
});

/**
 * Issue #108: `Effects.exchange` had been in the catalogue since Phase 2 and
 * nothing read it, so a community holding Fuel and short of Food could not use
 * a Gas Range it had paid 2 Hardware and 1 Labor for.
 */
describe('conversions', () => {
  /** The Small Town Home's built-in Kitchen, with a Gas Range on it. */
  const withGasRange = (overrides: Partial<Campaign> = {}) =>
    advancement({
      step: 'add-materials-to-storage',
      materials: { food: 0, fuel: 4, hardware: 0, rare: 0 },
      base: { id: 'small-town-home', slots: { kitchen: { upgrades: ['gas-range'] } } },
      ...overrides,
    });

  const trade = () => within(walk()).getByRole('button', { name: /2 fuel → 1 food/i });

  /**
   * pg. 19 applies conversions in this step, *after* production. Offering them
   * first would let a player spend Fuel the base is about to make.
   */
  it('waits until the haul is in', async () => {
    const user = open(withGasRange());

    expect(within(walk()).queryByRole('button', { name: /2 fuel → 1 food/i })).toBeNull();

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(trade()).toBeTruthy();
  });

  it('runs the trade, and says where it came from', async () => {
    const user = open(withGasRange());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(trade());

    // The Gas Range produces a Food of its own as well (pg. 72), so Add to
    // storage left one there before the trade added the second.
    expect(screen.getByLabelText(/^food$/i)).toHaveValue(2);
    expect(screen.getByLabelText(/^fuel$/i)).toHaveValue(2);
    expect(within(walk()).getByText(/gas range in the kitchen/i)).toBeTruthy();
  });

  it('runs it again while the Fuel lasts, and then refuses', async () => {
    const user = open(withGasRange());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(trade());
    await user.click(trade());

    expect(screen.getByLabelText(/^food$/i)).toHaveValue(3);
    expect(screen.getByLabelText(/^fuel$/i)).toHaveValue(0);

    // A store cannot go negative, so this is a refusal rather than a warning.
    expect(trade()).toBeDisabled();
    expect(within(walk()).getByText(/not enough fuel in storage/i)).toBeTruthy();
  });

  it('says nothing at all when the base has no conversion to offer', async () => {
    const user = open(withGasRange({ base: { id: 'small-town-home', slots: {} } }));

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(within(walk()).queryByText(/^conversions$/i)).toBeNull();
  });
});

describe('Heal Wounds', () => {
  /**
   * A staffed Medical Clinic with Water, so the pool is the medic's Medicine
   * Score rather than half of it — the size of the pool is what these are
   * about, and a halving in the middle only obscures it.
   */
  function withClinic(overrides: Partial<Campaign> = {}): Campaign {
    const medic: Survivor = {
      ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
      skills: { medicine: 0 },
    };

    return advancement({
      step: 'heal-wounds',
      survivors: [
        medic,
        { ...createSurvivor('Earl Rhodes', 4, { id: EARL }), currentHp: 1 },
        { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 2 },
      ],
      assignments: {
        medic: { task: 'staff', slot: 'garage' },
        [EARL]: { task: 'healing' },
        [CARLA]: { task: 'healing' },
      },
      base: {
        id: 'small-town-home',
        slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, water: true } },
      },
      ...overrides,
    });
  }

  it('shows the distribution before it is applied', () => {
    open(withClinic());

    // Three points across two wounded survivors: two to Earl, one to Carla,
    // because nobody takes a second until everybody has had a first.
    expect(within(walk()).getByText(/Earl Rhodes \+2 Health/)).toBeTruthy();
    expect(within(walk()).getByText(/Carla Proust \+1 Health/)).toBeTruthy();
  });

  it('applies it once, and refuses to do it twice', async () => {
    const user = open(withClinic());

    await user.click(within(walk()).getByRole('button', { name: /heal wounds/i }));

    expect(within(walk()).getByText(/wounds are healed/i)).toBeTruthy();
    expect(within(walk()).queryByRole('button', { name: /heal wounds/i })).toBeNull();

    // And it landed on the roster: Earl was at 1 of 4.
    expect(
      within(screen.getByRole('region', { name: /community/i }))
        .getAllByRole('listitem')
        .find((row) => /Earl Rhodes/.test(row.textContent ?? ''))?.textContent,
    ).toContain('3');
  });

  it('reports Health the wounded cannot take', () => {
    open(
      withClinic({
        survivors: [
          {
            ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
            stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
            skills: { medicine: 0 },
          },
          { ...createSurvivor('Earl Rhodes', 4, { id: EARL }), currentHp: 3 },
        ],
        assignments: { medic: { task: 'staff', slot: 'garage' }, [EARL]: { task: 'healing' } },
      }),
    );

    expect(within(walk()).getByText(/more than the wounded can take/i)).toBeTruthy();
  });

  it('says so plainly when there is nothing to heal', () => {
    open(advancement({ step: 'heal-wounds' }));

    expect(within(walk()).getByText(/nobody has a wound this step can close/i)).toBeTruthy();
  });
});

describe('the step that points somewhere else', () => {
  it('says what create-new-survivors is for', () => {
    open(advancement({ step: 'create-new-survivors' }));

    expect(within(walk()).getByText(/strangers rescued on the mission/i)).toBeTruthy();
  });
});

/**
 * Step 5, which Z3-11 turned from a pointer into the step itself: the projects
 * ordered in the last Planning Phase land here (pg. 19).
 */
describe('Add Facilities and Upgrades', () => {
  const queued = (orderedOnTurn: number): Campaign =>
    advancement({
      step: 'add-facilities-and-upgrades',
      materials: { food: 0, fuel: 0, hardware: 0, rare: 0 },
      projects: [
        { kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn },
        { kind: 'upgrade', slot: 'kitchen', upgrade: 'gas-range', orderedOnTurn },
      ],
    });

  it('says nothing was ordered when the queue is empty', () => {
    open(advancement({ step: 'add-facilities-and-upgrades' }));

    expect(within(walk()).getByText(/nothing was ordered/i)).toBeTruthy();
  });

  it('says so when everything in the queue was ordered this turn', () => {
    open(queued(3));

    expect(within(walk()).getByText(/ordered this turn, and finishes next turn/i)).toBeTruthy();
  });

  it('names what is about to finish before anything is pressed', () => {
    open(queued(2));

    expect(within(walk()).getByText(/workshop in the garage/i)).toBeTruthy();
    expect(within(walk()).getByText(/gas range on the kitchen/i)).toBeTruthy();
  });

  it('finishes them, and the base has them afterwards', async () => {
    const user = open(queued(2));

    await user.click(within(walk()).getByRole('button', { name: /finish 2 projects/i }));

    const map = screen.getByRole('region', { name: /small town home/i });
    expect(within(map).getByText(/^workshop$/i)).toBeTruthy();
    expect(within(map).getByText(/gas range — 1 of 3/i)).toBeTruthy();
  });

  /** Nothing is spent here, so the step has nothing left to offer afterwards. */
  it('has nothing to finish once it has been pressed', async () => {
    const user = open(queued(2));

    await user.click(within(walk()).getByRole('button', { name: /finish 2 projects/i }));

    expect(within(walk()).queryByRole('button', { name: /^finish /i })).toBeNull();
    expect(within(walk()).getByText(/nothing was ordered/i)).toBeTruthy();
  });

  it('names one project in the singular', () => {
    open(
      advancement({
        step: 'add-facilities-and-upgrades',
        projects: [{ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 }],
      }),
    );

    expect(within(walk()).getByRole('button', { name: /finish the project/i })).toBeTruthy();
  });
});

/**
 * Playtest finding H1 (issue #95), driven through the walk that caused it.
 *
 * "Skip to Planning" sits on every Advancement step and clears the assignments
 * the phase behind it is reading. The playtest lost two survivors' Health that
 * way — permanently, and both then faced a Rot check at 0 — so these walk the
 * repro rather than arranging the end state.
 */
describe('stepping out to the Planning Phase and back', () => {
  const skipToPlanning = () => screen.getByRole('button', { name: /^skip to planning$/i });
  const back = (step: RegExp) => screen.getByRole('button', { name: step });

  /** Turn 3, mid-Advancement: Earl went out, Nell is healing, Gil staffs the Kitchen. */
  function midTurn(step: Campaign['step']): Campaign {
    return advancement({
      step,
      survivors: [
        createSurvivor('Earl Rhodes', 4, { id: EARL }),
        { ...createSurvivor('Nell Haig', 2, { id: 'nell' }), currentHp: 1 },
        {
          ...createSurvivor('Gil Okonkwo', 4, { id: 'gil' }),
          stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
          skills: { rationing: 0 },
        },
      ],
      assignments: {
        [EARL]: { task: 'mission', team: 1 },
        nell: { task: 'rest' },
        gil: { task: 'staff', slot: 'kitchen' },
      },
      base: { id: 'small-town-home', slots: {} },
    });
  }

  it('still owes the resting survivor the Health the rules owed them', async () => {
    const user = open(midTurn('heal-wounds'));

    expect(within(walk()).getByText(/Nell Haig \+1 Health/)).toBeTruthy();

    await user.click(skipToPlanning());
    await user.click(back(/^back to add facilities and upgrades$/i));
    await user.click(back(/^back to heal wounds$/i));

    expect(within(walk()).getByText(/Nell Haig \+1 Health/)).toBeTruthy();
    expect(within(walk()).queryByText(/nobody has a wound this step can close/i)).toBeNull();
  });

  it('still knows who went on the mission', async () => {
    const user = open(midTurn('character-advancement'));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');

    await user.click(skipToPlanning());
    for (const step of [
      /^back to add facilities and upgrades$/i,
      /^back to heal wounds$/i,
      /^back to add materials to storage$/i,
      /^back to create new survivors$/i,
      /^back to character advancement$/i,
    ]) {
      await user.click(back(step));
    }

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');
    expect(within(walk()).queryByText(/nobody is on a mission team/i)).toBeNull();
  });

  /**
   * The pool going negative was the visible symptom — "-2 of 0 left" beside
   * "nobody is on a mission team". The award is taken *before* the skip, so
   * `awarded` is 1 against a total the clear used to drop to 0.
   */
  it('never counts down past nothing', async () => {
    const user = open(midTurn('character-advancement'));

    await user.click(award(/for going on the mission/i, /earl/i));
    await user.click(skipToPlanning());
    for (const step of [
      /^back to add facilities and upgrades$/i,
      /^back to heal wounds$/i,
      /^back to add materials to storage$/i,
      /^back to create new survivors$/i,
      /^back to character advancement$/i,
    ]) {
      await user.click(back(step));
    }

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('0 of 1');
    expect(within(walk()).queryByText(/-\d+ of/)).toBeNull();
  });

  /**
   * The floor under the counter, for the one way a pool can still shrink under
   * an award: the survivor it was given to leaves the roster afterwards. The
   * root cause is fixed above, so this is the belt rather than the braces —
   * but "-1 of 0 left" is not a state a screen can ask anybody to act on.
   */
  it('shows nothing left rather than a negative, if a pool shrinks under an award', () => {
    open(
      advancement({
        step: 'character-advancement',
        assignments: {},
        log: [
          {
            turn: 3,
            phase: 'advancement',
            at: '2026-08-30T00:00:00.000Z',
            event: {
              kind: 'xp-awarded',
              survivor: 'someone-who-left',
              name: 'Zed Marrow',
              amount: 1,
              source: 'mission',
            },
          },
        ],
      }),
    );

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('0 of 0');
  });

  it('still counts the Kitchen its staff were working', async () => {
    const user = open(midTurn('add-materials-to-storage'));

    // The Small Town Home's built-in Kitchen, staffed by Gil: +1 Food.
    expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();

    await user.click(skipToPlanning());
    await user.click(back(/^back to add facilities and upgrades$/i));
    await user.click(back(/^back to heal wounds$/i));
    await user.click(back(/^back to add materials to storage$/i));

    expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();
  });

  /**
   * The other direction, which must keep working: the clear is real, and the
   * Planning Phase in front of it is assigning next turn from a clean slate.
   */
  it('leaves the Planning Phase itself looking at an empty board', async () => {
    const user = open(midTurn('heal-wounds'));

    await user.click(skipToPlanning());

    expect(screen.getByText(/3 with nothing to do/i)).toBeTruthy();
  });
});

describe('walking through the phase', () => {
  it('changes what the step shows without leaving the phase', async () => {
    const user = open(advancement());

    expect(within(walk()).getByText(/for going on the mission/i)).toBeTruthy();

    await user.click(next());

    expect(within(walk()).queryByText(/for going on the mission/i)).toBeNull();
    expect(within(walk()).getByText(/strangers rescued on the mission/i)).toBeTruthy();
  });
});
