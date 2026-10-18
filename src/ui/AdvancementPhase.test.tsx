import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign, type Survivor } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { PENDING_ROLLS_KEY } from '../persistence/pendingRolls';
import { serializeCampaign } from '../persistence/exportFile';
import { CampaignProvider } from '../state/CampaignProvider';
import {
  campaignLog,
  communityRoster,
  goOn,
  lane,
  openMenu,
  openPanel,
  stored,
} from '../test/screens';
import { App } from './App';
import { generatingUtilities } from '../test/campaigns';
import { continued, overrun, wentOn } from '../test/overrun';
import { queued as onOrder } from '../test/queued';

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

/** The two Rare Item Table dice for the first roll owed (pg. 43; Z5-7). */
async function rollRare(user: ReturnType<typeof userEvent.setup>, subtable: number, entry: number) {
  await user.selectOptions(
    within(walk()).getByLabelText('Rare Item Table roll 1, first d10'),
    String(subtable),
  );
  await user.selectOptions(
    within(walk()).getByLabelText('Rare Item Table roll 1, second d10'),
    String(entry),
  );
}

/** What the Inventory card beside the turn counts. */
const inventoryCount = () =>
  within(
    within(screen.getByRole('complementary', { name: /community summary/i })).getByRole('region', {
      name: /^inventory$/i,
    }),
  ).getByText(/item/).textContent;
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

/** Left Behind Part 2a's XP to its survivor and every bondmate (pg. 91; R140; Z7-4). */
describe('Part 2a’s extra XP', () => {
  it('goes to the survivor and each bondmate, 1 each, and says why', async () => {
    const bonded = (survivor: Survivor): Survivor => ({
      ...survivor,
      storyTrait: 'bonded',
      bondGroup: 1,
    });
    const user = open(
      advancement({
        survivors: [
          bonded(createSurvivor('Earl Rhodes', 4, { id: EARL })),
          bonded(createSurvivor('Carla Proust', 3, { id: CARLA })),
          createSurvivor('Ruby Vance', 2, { id: 'ruby' }),
        ],
        log: [
          {
            turn: 3,
            phase: 'mission',
            at: '2026-10-12T09:00:00.000Z',
            event: {
              kind: 'mission-played',
              team: 1,
              mission: 'left-behind-2a',
              story: { survivor: EARL, name: 'Earl Rhodes', result: 'nobody-rescued' },
            },
          },
        ],
      }),
    );

    expect(within(walk()).getByText(/Left Behind Part 2a sends it to its survivor/)).toBeTruthy();
    expect(within(walk()).getByText(/The discretionary point/).textContent).toContain(
      '2 of 2 left',
    );

    await user.click(award(/The discretionary point/, /Carla Proust/));
    expect(award(/The discretionary point/, /Carla Proust/)).toBeDisabled();
    expect(award(/The discretionary point/, /Earl Rhodes/)).toBeEnabled();
    // Nobody else is offered it.
    expect(
      within(walk())
        .getByText(/The discretionary point/)
        .closest('li')?.textContent,
    ).not.toContain('Ruby Vance');
  });
});

describe('naming the award buttons', () => {
  /**
   * Three pools can be on screen at once, and every award button used to read
   * as "+1 XP" on its own — the pool and the survivor were beside it in text a
   * screen reader announces separately, if at all. Every other button in the
   * app carries its whole sentence.
   */
  it('says who is being given the point, and out of which pool', () => {
    open(advancement());

    expect(
      screen.getByRole('button', { name: /\+1 xp earl rhodes for going on the mission/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /\+1 xp carla proust the discretionary point/i }),
    ).toBeTruthy();
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

  /** A Gather Materials team's choice and outcome on turn 3 (pg. 80; Z4-6). */
  const gatheredLog = (carried: number): LogEntry[] => [
    {
      turn: 3,
      phase: 'mission',
      at: '2026-10-12T09:00:00.000Z',
      event: {
        kind: 'mission-selected',
        team: 1,
        mission: 'gather-materials',
        names: ['Earl Rhodes'],
        material: 'fuel',
      },
    },
    {
      turn: 3,
      phase: 'mission',
      at: '2026-10-12T09:00:00.000Z',
      event: {
        kind: 'gather-materials-resolved',
        team: 1,
        materialsCarriedOut: carried,
        strangers: [],
      },
    },
  ];

  it('counts what Gather Materials brought back without a roll (pg. 80; Z4-6)', () => {
    open(onTheStep({ log: gatheredLog(5) }));

    expect(within(walk()).getByText(/5 carried off come without a roll/i)).toBeTruthy();
    // One each, and the two over in Fuel.
    expect(within(walk()).getByText(/\+3 Fuel/)).toBeTruthy();
    expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
  });

  it('says a short Gather Materials haul is rolled with the rest', () => {
    open(onTheStep({ log: gatheredLog(2) }));

    expect(within(walk()).getByText(/2 carried off are fewer than one of each/i)).toBeTruthy();
    expect(within(walk()).queryByText(/without a roll/i)).toBeNull();
  });

  /**
   * **#163, on the screen it went missing from.** Every visible part of
   * scavenging existed — the Planning control, the warnings, the label — and
   * the step that adds materials said nothing about it and added nothing.
   */
  describe('a survivor who scavenged instead', () => {
    const scavenging = (skills: Partial<Record<'scavenge', number>>) =>
      onTheStep({
        survivors: [{ ...createSurvivor('Earl Rhodes', 3, { id: EARL }), skills }],
        assignments: { [EARL]: { task: 'scavenging' } },
      });

    it('says a scavenger on a siege turn deployed instead, and finds nothing (R42)', () => {
      open({
        ...scavenging({ scavenge: 0 }),
        log: [
          {
            turn: 2,
            phase: 'management',
            at: '2026-10-13T09:00:00.000Z',
            event: { kind: 'horde-checked', roll: 10, threat: 6, siege: true },
          },
        ],
      });

      expect(
        within(walk()).getByText(/earl rhodes was assigned to scavenge, but the siege deployed/i),
      ).toBeTruthy();
      expect(within(walk()).queryByText(/scavenged instead/i)).toBeNull();
    });

    it('names them and counts one of every material, with the skill', () => {
      open(scavenging({ scavenge: 0 }));

      expect(within(walk()).getByText(/earl rhodes scavenged instead/i)).toBeTruthy();
      expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();
      expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
    });

    it('asks which material an unskilled scavenger brought back', async () => {
      const user = open(scavenging({}));

      // Nothing yet, and the screen says what that costs rather than letting
      // the turn quietly come to nothing.
      expect(within(walk()).getByText(/brings back nothing/i)).toBeTruthy();

      await user.selectOptions(within(walk()).getByLabelText(/brought back/i), 'hardware');

      expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
      expect(within(walk()).queryByText(/brings back nothing/i)).toBeNull();
    });

    it('puts it in storage and writes it in the history', async () => {
      const user = open(scavenging({ scavenge: 0 }));

      await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

      expect(
        within(campaignLog()).getByText(/earl rhodes scavenged 1 food, 1 fuel, 1 hardware\./i),
      ).toBeTruthy();
    });

    it('says nothing at all when nobody scavenged', () => {
      open(onTheStep());

      expect(within(walk()).queryByText(/scavenged instead/i)).toBeNull();
    });
  });

  it('turns a roll into the material the table gives', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));

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

    const rolled = (face: string) =>
      within(walk()).getByRole('button', { name: `Add a roll of ${face}` });
    await user.click(rolled('4'));
    await user.click(rolled('5'));

    expect(within(walk()).getByText(/\+2 Food/)).toBeTruthy();

    const [first] = within(walk()).getAllByLabelText(/force the result of this roll/i);
    await user.selectOptions(first as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).getByText(/\+1 Food/)).toBeTruthy();
    expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
  });

  /** R4 (#236): the d10's faces, a press for each roll. */
  it('adds a roll for each press of a face, the same face as often as it came up', async () => {
    const user = open(onTheStep());
    const pad = within(within(walk()).getByRole('group', { name: 'Add a roll' }));

    expect(pad.getAllByRole('button').map((face) => face.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);

    await user.click(pad.getByRole('button', { name: 'Add a roll of 7' }));
    await user.click(pad.getByRole('button', { name: 'Add a roll of 7' }));

    expect(within(walk()).getAllByText(/^rolled 7$/i)).toHaveLength(2);
  });

  it('offers no way to force a result when nobody who went can', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));

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

    const rolled = (face: string) =>
      within(walk()).getByRole('button', { name: `Add a roll of ${face}` });
    await user.click(rolled('4'));
    await user.click(rolled('5'));

    const forcers = within(walk()).getAllByLabelText(/force the result of this roll/i);
    await user.selectOptions(forcers[0] as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).queryByText(/results forced with mechanics/i)).toBeNull();

    await user.selectOptions(forcers[1] as HTMLElement, 'mechanics:hardware');

    expect(within(walk()).getByText(/2 results forced with mechanics/i)).toBeTruthy();
    expect(within(walk()).getByRole('button', { name: /add to storage/i })).toBeEnabled();
  });

  it('lets Crashed Convoy make two rolls 10s, each a Rare Item Table roll (pg. 101; R126)', async () => {
    const user = open(
      onTheStep({
        log: [
          {
            turn: 3,
            phase: 'mission',
            at: '2026-10-12T09:00:00.000Z',
            event: {
              kind: 'mission-played',
              team: 1,
              mission: 'crashed-convoy',
              story: { survivor: EARL, name: 'Earl Rhodes', result: 'search-failed', xp: 1 },
            },
          },
        ],
      }),
    );

    expect(
      within(walk()).getByText(/Crashed Convoy makes 2 of this turn’s rolls 10s/),
    ).toBeTruthy();
    for (const face of [1, 2, 3]) {
      await user.click(
        within(walk()).getByRole('button', { name: `Add a roll of ${String(face)}` }),
      );
    }
    const tens = () => within(walk()).queryAllByLabelText('Make it a 10');

    expect(tens()).toHaveLength(3);
    await user.click(tens()[0] as HTMLElement);
    await user.click(tens()[1] as HTMLElement);
    // Two are made; the third is offered no more.
    expect(tens()).toHaveLength(2);
    expect(within(walk()).getAllByLabelText(/Rare Item Table roll \d, first d10/)).toHaveLength(2);

    await user.click(tens()[0] as HTMLElement);
    expect(tens()).toHaveLength(3);
  });

  it('offers no 10s on a turn without Crashed Convoy', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));

    expect(within(walk()).queryByLabelText('Make it a 10')).toBeNull();
  });

  it('puts the haul in storage once, and refuses to do it twice', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 10' }));
    await rollRare(user, 3, 1);
    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(within(walk()).getByText(/already in storage/i)).toBeTruthy();
    expect(within(walk()).queryByRole('button', { name: /add to storage/i })).toBeNull();

    // And it landed: the 10 is an item in the Inventory (Z5-7).
    expect(inventoryCount()).toBe('1 item');
  });

  /** A 10 is a roll on the Rare Item Table, instead of a material (pp. 19, 43; Z5-7). */
  it('asks for the Rare Item Table’s dice for a 10, and names what they find', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 10' }));

    expect(within(walk()).getByRole('button', { name: /add to storage/i })).toBeDisabled();
    expect(within(walk()).getByText(/needs its two dice/i)).toBeTruthy();

    await rollRare(user, 3, 1);

    expect(within(walk()).getByText('standard riot shield')).toBeTruthy();
    expect(within(walk()).getByRole('button', { name: /add to storage/i })).toBeEnabled();

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(within(campaignLog()).getByText(/rolling 3 then 1: standard riot shield/i)).toBeTruthy();
  });

  /** R49: each Rare a save from before v17 held is a roll owed here. */
  it('asks for a roll for each Rare the campaign held', () => {
    open({ ...onTheStep(), rareRollsOwed: 2 });

    expect(within(walk()).getByText(/2 more are owed for the Rare/i)).toBeTruthy();
    expect(within(walk()).getByLabelText('Rare Item Table roll 2, first d10')).toBeTruthy();
  });

  it('takes a roll back off the list', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));
    await user.click(within(walk()).getByRole('button', { name: /remove/i }));

    expect(within(walk()).queryByText(/rolled 4/i)).toBeNull();
    expect(within(walk()).getByText(/\+0 Food/)).toBeTruthy();
  });

  /**
   * The bug in issue #96, driven the way it was found: the dice were in
   * component state and nowhere else, so a discarded tab lost a mission's haul
   * while the step stayed armed. `cleanup()` and a second `open` of the *same*
   * campaign is exactly a reload — nothing about the campaign changed, because
   * the rolls were never part of it.
   */
  it('brings the rolls back after a reload', async () => {
    const campaign = onTheStep();
    const user = open(campaign);

    const rolled = (face: string) =>
      within(walk()).getByRole('button', { name: `Add a roll of ${face}` });
    await user.click(rolled('7'));
    await user.click(rolled('8'));

    expect(within(walk()).getByText(/\+2 Hardware/)).toBeTruthy();

    cleanup();
    open(campaign);

    expect(within(walk()).getByText(/\+2 Hardware/)).toBeTruthy();
    expect(within(walk()).getAllByText(/^rolled [78]$/i)).toHaveLength(2);
  });

  /**
   * R2-H3 (#141). Persisting the rolls was right; what was wrong was the
   * component's idea of when a campaign becomes a different campaign. A reload
   * remounts and an **import does not**, so a list of dice rolled for Cedar
   * Hollow sat there while Millbrook was loaded underneath it, and Add to
   * storage credited Millbrook with them — one-shot, no undo, and a later
   * reload showing an empty list.
   */
  it('drops rolls entered for another campaign when one is imported over it', async () => {
    const user = open(onTheStep());

    const rolled = (face: string) =>
      within(walk()).getByRole('button', { name: `Add a roll of ${face}` });
    await user.click(rolled('7'));
    await user.click(rolled('8'));

    expect(within(walk()).getByText(/\+2 Hardware/)).toBeTruthy();

    const incoming = serializeCampaign(
      advancement({ name: 'Millbrook', step: 'add-materials-to-storage' }),
    );
    openMenu('file');
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');

    await user.upload(
      input as HTMLInputElement,
      new File([incoming], 'millbrook.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: /replace it/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Millbrook');
    });

    // Millbrook's own step, with nobody's dice in it.
    expect(within(walk()).queryByText(/^rolled [78]$/i)).toBeNull();
    expect(within(walk()).getByText(/\+0 Hardware/)).toBeTruthy();
  });

  it('brings a forced result back with its roll', async () => {
    const campaign = onTheStep({
      survivors: [
        {
          ...createSurvivor('Earl Rhodes', 4, { id: EARL }),
          stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 2 },
          skills: { mechanics: 0 },
        },
      ],
    });
    const user = open(campaign);

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));
    const [forcer] = within(walk()).getAllByLabelText(/force the result of this roll/i);
    await user.selectOptions(forcer as HTMLElement, 'mechanics:hardware');

    cleanup();
    open(campaign);

    expect(within(walk()).getByText(/\+1 Hardware/)).toBeTruthy();
    expect(within(walk()).getByText(/\+0 Food/)).toBeTruthy();
  });

  /**
   * The stamp, through the screen: input belongs to one campaign and one turn,
   * so a reload after ending the turn must not hand this turn's step last
   * turn's dice.
   */
  it('does not offer input left behind by another turn', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 7' }));

    cleanup();
    open(onTheStep({ turn: 4 }));

    expect(within(walk()).queryByText(/^rolled 7$/i)).toBeNull();
    expect(within(walk()).getByText(/\+0 Hardware/)).toBeTruthy();
  });

  it('has nothing left over once the haul is in storage', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 7' }));
    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(localStorage.getItem(PENDING_ROLLS_KEY)).toBeNull();
  });

  /**
   * The second half of #96. Committing zero rolls is legitimate — a turn with
   * no mission still adds the base's production — so the button cannot be
   * disabled at zero. What it can do is ask, and only in the shape the bug
   * takes: somebody went out and nothing was entered.
   */
  it('asks before storing nothing when a mission team went out', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(
      screen.getByRole('heading', { name: /add nothing the mission recovered/i }),
    ).toBeTruthy();
    expect(screen.getByText(/1 survivor went out this turn/i)).toBeTruthy();
    expect(within(walk()).queryByText(/already in storage/i)).toBeNull();
  });

  it('leaves the step armed when the question is declined', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(screen.getByRole('button', { name: /enter the rolls/i }));

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 10' }));
    await rollRare(user, 3, 1);
    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(inventoryCount()).toBe('1 item');
  });

  it('stores the base’s production alone when the question is accepted', async () => {
    const user = open(onTheStep());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(screen.getByRole('button', { name: /add production only/i }));

    expect(within(walk()).getByText(/already in storage/i)).toBeTruthy();
  });

  /**
   * No mission, no question. A community that stayed home has an empty roll
   * list as its ordinary answer, and a dialog there would be a confirmation
   * players learn to click through.
   */
  it('asks nothing when nobody went out', async () => {
    const user = open(onTheStep({ assignments: {} }));

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(within(walk()).getByText(/already in storage/i)).toBeTruthy();
  });

  it('reports a haul over the cap and stores all of it anyway', async () => {
    const user = open(
      onTheStep({
        // The Small Town Home stores 4 Food (pg. 54).
        materials: { food: 4, fuel: 0, hardware: 0 },
      }),
    );

    await user.click(within(walk()).getByRole('button', { name: 'Add a roll of 4' }));

    expect(within(walk()).getByText(/is over this base’s/i)).toBeTruthy();

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));

    expect(stored(/^food$/i)).toBe(5);
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
      materials: { food: 0, fuel: 4, hardware: 0 },
      base: { id: 'small-town-home', slots: { kitchen: { upgrades: ['gas-range'] } } },
      // Nobody went out, so pressing Add to storage with no rolls commits
      // rather than asking (issue #96's dialog). These are about the trades,
      // and a confirmation in the middle of each would be about something
      // else.
      assignments: {},
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
    expect(stored(/^food$/i)).toBe(2);
    expect(stored(/^fuel$/i)).toBe(2);
    expect(within(walk()).getByText(/gas range in the kitchen/i)).toBeTruthy();
  });

  it('runs it again while the Fuel lasts, and then refuses', async () => {
    const user = open(withGasRange());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(trade());
    await user.click(trade());

    expect(stored(/^food$/i)).toBe(3);
    expect(stored(/^fuel$/i)).toBe(0);

    // A store cannot go negative, so this is a refusal rather than a warning.
    expect(trade()).toBeDisabled();
    expect(within(walk()).getByText(/not enough fuel in storage/i)).toBeTruthy();
  });

  /**
   * The history names the slot as well as the thing (#151). The comment beside
   * that label already claimed as much — "a base can hold two of them and the
   * history is where a player checks a per-turn allowance" — while the sentence
   * dropped the slot the event had been carrying all along.
   */
  it('writes the slot into the history, which is where an allowance is checked', async () => {
    const user = open(withGasRange());

    await user.click(within(walk()).getByRole('button', { name: /add to storage/i }));
    await user.click(trade());

    expect(campaignLog().textContent).toContain('The Gas Range on the Kitchen traded');
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

    // Somebody in the Station as well, because the Clinic's Water has to be
    // generated and not merely assigned for the Score to come through whole
    // (#139).
    return generatingUtilities(
      advancement({
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
      }),
      1,
    );
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
      within(communityRoster())
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

  /**
   * Under the Viral origin each point may remove Infection instead, decided
   * point by point (pg. 19, 123; #176). Everywhere else there is no choice to
   * offer, and offering one would be a control for a number nothing raises.
   */
  describe('under the Viral origin', () => {
    const medic: Survivor = {
      ...createSurvivor('Nell Haig', 4, { id: 'medic' }),
      stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
      skills: { medicine: 0 },
    };

    /**
     * Earl at 1 of 4 with 3 Infection, Carla at full Health with 2. Three
     * points, all of them Earl's: only a survivor below their maximum is given
     * Health, so Carla's Infection earns her none (pg. 19, 21; #219).
     */
    const fevered = () =>
      withClinic({
        origin: 'viral',
        survivors: [
          medic,
          { ...createSurvivor('Earl Rhodes', 4, { id: EARL }), currentHp: 1, infection: 3 },
          { ...createSurvivor('Carla Proust', 3, { id: CARLA }), infection: 2 },
        ],
      });

    it('offers no Infection choice to a campaign that is not Viral', () => {
      open(withClinic());

      expect(within(walk()).queryByLabelText(/points against infection/i)).toBeNull();
      expect(within(walk()).queryByText(/infection/i)).toBeNull();
    });

    it('shares nothing with somebody at full Health for their Infection', () => {
      open(fevered());

      expect(within(walk()).getByText(/Earl Rhodes \+3 Health/)).toBeTruthy();
      expect(within(walk()).queryByText(/Carla Proust/)).toBeNull();
      expect(within(walk()).queryByLabelText(/points against infection for carla/i)).toBeNull();
    });

    /**
     * Carla at 2 of 3 with 1 Infection, and Earl at full Health with 3, so
     * Carla takes two points: one closes her wound and the other has nowhere
     * to go but Infection.
     */
    it('says where a point Health cannot hold goes, rather than offering one option', () => {
      open(
        withClinic({
          origin: 'viral',
          survivors: [
            medic,
            { ...createSurvivor('Earl Rhodes', 4, { id: EARL }), infection: 3 },
            { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 2, infection: 1 },
          ],
        }),
      );

      expect(within(walk()).getByText(/Carla Proust \+2 Health/)).toBeTruthy();
      expect(
        within(walk()).getByText(/1 against infection — health can take no more/i),
      ).toBeTruthy();
      expect(within(walk()).queryByLabelText(/points against infection/i)).toBeNull();
      expect(within(walk()).queryByText(/Earl Rhodes/)).toBeNull();
    });

    it('spends the points as chosen, and the history says how', async () => {
      const user = open(fevered());

      await user.selectOptions(
        within(walk()).getByLabelText(/points against infection for earl rhodes/i),
        '1',
      );
      // Shown before it is applied: two on a wound, one on Infection.
      expect(within(walk()).getByText(/to 3, Infection 2/)).toBeTruthy();

      await user.click(within(walk()).getByRole('button', { name: /heal wounds/i }));

      const history = campaignLog().textContent;
      expect(history).toContain(
        'Earl Rhodes took 3 Health from the community’s Health: 1 of it against Infection, 2 on wounds.',
      );
      expect(history).not.toContain('Carla Proust took');
    });
  });
});

/**
 * Step 2, which Z4-5 turned from a pointer to the roster into the step itself:
 * every stranger the turn's outcomes counted, each offered once (pg. 19).
 */
describe('Create New Survivors', () => {
  const rescuedBy = (team: number, strangers: readonly (1 | 2 | 3)[]): LogEntry => ({
    turn: 3,
    phase: 'mission',
    at: '2026-10-12T09:00:00.000Z',
    event: { kind: 'rescue-strangers-resolved', team, strangers },
  });

  /** Earl's team rescued a Citizen; Carla's, out as team 2, a Rookie. */
  const twoRescues = (): Campaign =>
    advancement({
      step: 'create-new-survivors',
      startingCommunityBuilt: true,
      assignments: { [EARL]: { task: 'mission', team: 1 }, [CARLA]: { task: 'mission', team: 2 } },
      log: [rescuedBy(1, [2]), rescuedBy(2, [1])],
    });

  const stranger = (name: RegExp) => within(within(walk()).getByRole('group', { name }));

  it('says what the step is for, and that nobody was rescued', () => {
    open(advancement({ step: 'create-new-survivors' }));

    expect(within(walk()).getByText(/strangers rescued on the missions/i)).toBeTruthy();
    expect(within(walk()).getByText(/nobody was rescued/i)).toBeTruthy();
  });

  it('offers each team’s stranger at the Tier the mission counted', () => {
    open(twoRescues());

    expect(
      stranger(/mission team 1, stranger 1: a citizen/i).getByLabelText('Skill roll'),
    ).toBeTruthy();
    // A Rookie does not roll for a skill (pg. 7), so is not asked to.
    expect(
      stranger(/mission team 2, stranger 1: a rookie/i).queryByLabelText('Skill roll'),
    ).toBeNull();
  });

  it('offers a survivor a story brought, named by the story, with what it gave them (Z7-3)', async () => {
    const user = open(
      advancement({
        step: 'create-new-survivors',
        startingCommunityBuilt: true,
        assignments: { [EARL]: { task: 'mission', team: 1 } },
        log: [
          {
            ...rescuedBy(1, []),
            event: {
              kind: 'mission-played',
              team: 1,
              mission: 'left-behind-1',
              story: {
                survivor: EARL,
                name: 'Earl Rhodes',
                result: 'rescued',
                xp: 1,
                trait: 'bonded',
                bondGroup: 1,
                joins: { tier: 2, bondGroup: 1, xp: 1 },
              },
            },
          },
        ],
      }),
    );
    const joining = stranger(/mission team 1, from left behind \(part 1\): a citizen/i);

    expect(joining.getByText(/Joins with Bonded in bond group 1 and 1 XP/)).toBeTruthy();

    await user.type(joining.getByLabelText('Name'), 'June Rhodes');
    await user.click(joining.getByRole('button', { name: 'Join the community' }));

    expect(campaignLog().textContent).toContain(
      'June Rhodes joined as a Citizen, rescued by mission team 1, Bonded in bond group 1, with 1 XP.',
    );
  });

  it('says what Neighbor’s Rifle gives its Tier 3’s build (pg. 99; R142)', async () => {
    const user = open(
      advancement({
        step: 'create-new-survivors',
        startingCommunityBuilt: true,
        log: [
          {
            ...rescuedBy(1, []),
            event: {
              kind: 'mission-played',
              team: 1,
              mission: 'neighbors-rifle',
              story: {
                survivor: EARL,
                name: 'Earl Rhodes',
                result: 'seating-failed',
                xp: 1,
                joins: {
                  tier: 3,
                  build: {
                    skill: 'long-guns',
                    stat: { dexterity: 3 },
                    item: { item: 'rifle', grade: 'quality' },
                  },
                },
              },
            },
          },
        ],
      }),
    );
    const joining = stranger(/mission team 1, from neighbor’s rifle: a leader/i);

    expect(joining.getByText(/Joins with Long Guns, Dexterity 3 and a quality rifle/)).toBeTruthy();

    await user.type(joining.getByLabelText('Name'), 'Dale Hart');
    await user.click(joining.getByRole('button', { name: 'Join the community' }));

    expect(campaignLog().textContent).toContain(
      'Dale Hart joined as a Leader, rescued by mission team 1, with Long Guns, Dexterity 3 and a quality rifle.',
    );
  });

  it('waits for a name before it lets anybody join', async () => {
    const user = open(twoRescues());
    const citizen = stranger(/mission team 1/i);

    expect(citizen.getByRole('button', { name: 'Join the community' })).toBeDisabled();

    await user.type(citizen.getByLabelText('Name'), 'Ruby Vance');

    expect(citizen.getByRole('button', { name: 'Join the community' })).toBeEnabled();
  });

  /** The acceptance: two strangers from two teams are two survivors, each offered once. */
  it('adds each stranger to the roster once', async () => {
    const user = open(twoRescues());

    await user.type(stranger(/mission team 1/i).getByLabelText('Name'), 'Ruby Vance');
    await user.selectOptions(stranger(/mission team 1/i).getByLabelText('Skill roll'), '6');
    await user.click(
      stranger(/mission team 1/i).getByRole('button', { name: 'Join the community' }),
    );

    expect(within(walk()).queryByRole('group', { name: /mission team 1/i })).toBeNull();

    await user.type(stranger(/mission team 2/i).getByLabelText('Name'), 'Pip');
    await user.click(
      stranger(/mission team 2/i).getByRole('button', { name: 'Join the community' }),
    );

    expect(within(walk()).getByText(/every stranger rescued this turn has joined/i)).toBeTruthy();

    const roster = within(communityRoster());
    expect(roster.getByText('Ruby Vance')).toBeTruthy();
    expect(roster.getByText('Pip')).toBeTruthy();
  });

  it('does not offer a stranger again after the walk goes back over the step', async () => {
    const user = open(twoRescues());

    await user.type(stranger(/mission team 2/i).getByLabelText('Name'), 'Pip');
    await user.click(
      stranger(/mission team 2/i).getByRole('button', { name: 'Join the community' }),
    );
    await user.click(next());
    goOn();
    await user.click(screen.getByRole('button', { name: /^back to create new survivors$/i }));

    expect(within(walk()).queryByRole('group', { name: /mission team 2/i })).toBeNull();
    expect(within(walk()).getByRole('group', { name: /mission team 1/i })).toBeTruthy();
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
      materials: { food: 0, fuel: 0, hardware: 0 },
      projects: [
        onOrder({ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn }),
        onOrder({ kind: 'upgrade', slot: 'kitchen', upgrade: 'gas-range', orderedOnTurn }),
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

    openPanel('base');
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
        projects: [
          onOrder({ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 }),
        ],
      }),
    );

    expect(within(walk()).getByRole('button', { name: /finish the project/i })).toBeTruthy();
  });

  /** The Outdoor Sports Shop's Inventory slot hands over four weapons the player picks (R45). */
  it('asks for the Sports Shop’s weapons before it finishes, and puts them in the Inventory', async () => {
    const user = open(
      advancement({
        step: 'add-facilities-and-upgrades',
        base: { id: 'outdoor-sports-shop', slots: {} },
        projects: [onOrder({ kind: 'clearing', slot: 'inventory', orderedOnTurn: 2 })],
      }),
    );
    const finish = within(walk()).getByRole('button', { name: /finish the project/i });

    expect(finish).toHaveProperty('disabled', true);

    for (const at of [1, 2, 3, 4]) {
      await user.selectOptions(within(walk()).getByLabelText(`Weapon ${String(at)}`), 'bow');
    }
    expect(finish).toHaveProperty('disabled', false);
    await user.click(finish);

    expect(inventoryCount()).toBe('4 items');
    expect(within(walk()).queryByLabelText('Weapon 1')).toBeNull();
  });

  /** Last turn's trades land here too (pg. 19; R53; Z5-9). */
  it('takes in last turn’s trade, alone or with the projects', async () => {
    const pistol = {
      id: 'traded',
      item: 'pistol',
      grade: 'standard',
      food: 2,
      fuel: 4,
      orderedOnTurn: 2,
    } as const;
    const user = open(
      advancement({
        step: 'add-facilities-and-upgrades',
        trades: [pistol, { ...pistol, id: 'later', orderedOnTurn: 3 }],
      }),
    );

    expect(within(walk()).getByText(/A standard pistol, from a trade/)).toBeTruthy();
    await user.click(within(walk()).getByRole('button', { name: 'Finish the trade' }));

    expect(inventoryCount()).toBe('1 item');
    // The one ordered this turn waits for next turn's.
    expect(within(walk()).getByText(/ordered this turn, and finishes next turn/i)).toBeTruthy();
  });

  it('names both on the button when projects and trades land together', () => {
    open(
      advancement({
        step: 'add-facilities-and-upgrades',
        projects: [
          onOrder({ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 }),
        ],
        trades: [
          { id: 't', item: 'trap', grade: 'standard', food: 2, fuel: 0, orderedOnTurn: 2 },
          { id: 'u', item: 'trap', grade: 'standard', food: 2, fuel: 0, orderedOnTurn: 2 },
        ],
      }),
    );

    expect(
      within(walk()).getByRole('button', { name: 'Finish the project and 2 trades' }),
    ).toBeTruthy();
  });

  it('points at the Inventory while it holds a rare upgrade to install', () => {
    open(
      advancement({
        step: 'add-facilities-and-upgrades',
        inventory: [{ id: 'g', item: 'gas-grill', grade: 'standard' }],
      }),
    );

    expect(within(walk()).getByText(/holds a rare upgrade/i)).toBeTruthy();
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
    goOn();
    await user.click(back(/^back to add facilities and upgrades$/i));
    await user.click(back(/^back to heal wounds$/i));

    expect(within(walk()).getByText(/Nell Haig \+1 Health/)).toBeTruthy();
    expect(within(walk()).queryByText(/nobody has a wound this step can close/i)).toBeNull();
  });

  it('still knows who went on the mission', async () => {
    const user = open(midTurn('character-advancement'));

    expect(within(walk()).getByText(/for going on the mission/i)).toHaveTextContent('1 of 1');

    await user.click(skipToPlanning());
    goOn();
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
    goOn();
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
    goOn();
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
    goOn();

    // Everybody's task was last turn's: the board starts with all three idle.
    expect(within(lane('Nothing to do')).getAllByRole('button')).toHaveLength(3);
  });
});

describe('walking through the phase', () => {
  it('changes what the step shows without leaving the phase', async () => {
    const user = open(advancement());

    expect(within(walk()).getByText(/for going on the mission/i)).toBeTruthy();

    await user.click(next());

    expect(within(walk()).queryByText(/for going on the mission/i)).toBeNull();
    expect(within(walk()).getByText(/strangers rescued on the missions/i)).toBeTruthy();
  });
});

/**
 * The end of the phase after a claim was won (pp. 19, 54, 79; R25; Z4-8): the
 * community moves in, once the projects have landed in the old base.
 */
describe('Moving into the new base', () => {
  const claimOn = (base: 'distillery' | 'summer-camp'): LogEntry[] => [
    {
      turn: 3,
      phase: 'mission',
      at: '2026-10-13T09:00:00.000Z',
      event: { kind: 'mission-selected', team: 1, mission: 'claim-a-new-base', names: [], base },
    },
    {
      turn: 3,
      phase: 'mission',
      at: '2026-10-13T09:00:00.000Z',
      event: {
        kind: 'claim-a-new-base-resolved',
        team: 1,
        endCondition: 1,
        strangers: [],
        vehiclesOnArea: 0,
      },
    },
  ];

  const moving = (overrides: Partial<Campaign> = {}): Campaign =>
    advancement({
      step: 'add-facilities-and-upgrades',
      log: claimOn('distillery'),
      ...overrides,
    });

  const panel = () => within(screen.getByRole('region', { name: 'Move into the new base' }));

  it('is not offered on a turn without a claim won', () => {
    open(advancement({ step: 'add-facilities-and-upgrades' }));

    expect(screen.queryByRole('region', { name: 'Move into the new base' })).toBeNull();
  });

  it('moves the community, and the base sheet shows the new base', async () => {
    const user = open(moving());

    expect(panel().getByText(/What was built in the Small Town Home stays there/)).toBeTruthy();
    await user.click(panel().getByRole('button', { name: 'Move into the Distillery' }));

    expect(within(walk()).getByText(/The community has moved into the Distillery/)).toBeTruthy();
    openPanel('base');
    expect(screen.getByRole('region', { name: /distillery/i })).toBeTruthy();
  });

  it('waits for last turn’s projects, which land in the old base (R25)', () => {
    open(
      moving({
        projects: [
          onOrder({ kind: 'facility', slot: 'garage', facility: 'workshop', orderedOnTurn: 2 }),
        ],
      }),
    );

    expect(panel().getByText(/Finish last turn’s projects first/)).toBeTruthy();
    expect(panel().getByRole('button', { name: 'Move into the Distillery' })).toBeDisabled();
  });

  it('asks which Hero leaves when the new base holds fewer (pg. 54; R32)', async () => {
    const user = open(
      moving({
        log: claimOn('summer-camp'),
        survivors: [
          createSurvivor('Earl Rhodes', 4, { id: EARL }),
          createSurvivor('Carla Proust', 4, { id: CARLA }),
        ],
      }),
    );

    const move = panel().getByRole('button', { name: 'Move into the Summer Camp' });
    expect(move).toBeDisabled();

    await user.click(panel().getByRole('checkbox', { name: 'Carla Proust' }));
    expect(move).toBeEnabled();
    await user.click(move);

    expect(
      within(campaignLog()).getByText(/Carla Proust left to start a community of their own/),
    ).toBeTruthy();
  });
});

/** A move after an overrun keeps half the stores, none, or a first base's stock (R29, R30). */
describe('Moving in after an overrun', () => {
  it('says what the stores will hold before the move is made', () => {
    open(
      overrun([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)], {
        step: 'add-facilities-and-upgrades',
      }),
    );

    // From 7 Food, 3 Fuel and 5 Hardware, halved and rounded down.
    expect(
      within(screen.getByRole('region', { name: 'Move into the new base' })).getByText(
        /the stores will hold 3 Food, 1 Fuel, 2 Hardware/,
      ),
    ).toBeTruthy();
  });

  it('says what is lost with the overrun base, and nothing when nothing is (R78, R79)', () => {
    const order = {
      id: 'club-1',
      item: 'blunt',
      grade: 'standard',
      food: 1,
      fuel: 0,
      orderedOnTurn: 4,
    } as const;

    open(
      overrun([...wentOn('start-over', 'summer-camp'), continued('start-over', true)], {
        step: 'add-facilities-and-upgrades',
        inventory: [
          { id: 'bat-1', item: 'blunt', grade: 'standard' },
          { id: 'bat-2', item: 'blunt', grade: 'standard' },
        ],
        vehicles: [{ id: 'truck', tier: 3, label: 'Box truck', water: false }],
        trades: [order, { ...order, id: 'club-2' }],
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Move into the new base' })).getByText(
        /^Lost with the overrun base: the 2 items in the Inventory, Box truck, 2 orders on their way\./,
      ),
    ).toBeTruthy();
  });

  it('names one item and one order in the singular', () => {
    open(
      overrun([...wentOn('start-over', 'summer-camp'), continued('start-over', true)], {
        step: 'add-facilities-and-upgrades',
        inventory: [{ id: 'bat-1', item: 'blunt', grade: 'standard' }],
        trades: [
          {
            id: 'club-1',
            item: 'blunt',
            grade: 'standard',
            food: 1,
            fuel: 0,
            orderedOnTurn: 4,
          },
        ],
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Move into the new base' })).getByText(
        /^Lost with the overrun base: the 1 item in the Inventory, 1 order on its way\./,
      ),
    ).toBeTruthy();
  });

  it('warns of no loss when the overrun base held nothing', () => {
    open(
      overrun([...wentOn('claim', 'hobby-farm'), continued('claim', true, true)], {
        step: 'add-facilities-and-upgrades',
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Move into the new base' })).queryByText(
        /Lost with the overrun base/,
      ),
    ).toBeNull();
  });
});

/** A survivor set aside, brought back this turn, rejoins at Step 2 (R31; Z4-11). */
describe('Welcoming back a survivor set aside', () => {
  it('rejoins them as themselves, and lists nobody once they have', async () => {
    const hera = { ...createSurvivor('Hera Okafor', 4, { id: 'hera' }), xp: 12 };
    const user = open(
      advancement({
        step: 'create-new-survivors',
        startingCommunityBuilt: true,
        setAside: [hera],
        log: [
          {
            turn: 3,
            phase: 'mission',
            at: '2026-10-13T09:00:00.000Z',
            event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
          },
          {
            turn: 3,
            phase: 'mission',
            at: '2026-10-13T09:00:00.000Z',
            event: {
              kind: 'rescue-strangers-resolved',
              team: 1,
              strangers: [],
              returned: ['hera'],
            },
          },
        ],
      }),
    );

    await user.click(within(walk()).getByRole('button', { name: 'Welcome Hera Okafor back' }));

    expect(within(walk()).queryByRole('button', { name: /Welcome .* back/ })).toBeNull();
    expect(within(campaignLog()).getByText(/Hera Okafor returned to the community/)).toBeTruthy();
  });
});
