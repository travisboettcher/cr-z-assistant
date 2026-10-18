import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Campaign } from '../engine/campaign';
import type { MissionId } from '../data/missions';
import type { LogEntry } from '../engine/log';
import { createSurvivor } from '../engine/survivor';
import { CampaignProvider } from '../state/CampaignProvider';
import { App } from './App';

const AT = '2026-09-12T09:00:00.000Z';

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

/** A team's choice at Select Mission, which the outcome is asked for (Z4-2). */
const chose = (mission: 'siege-defense' | 'thin-the-herd'): LogEntry => ({
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team: 1, mission, names: [] },
});

function playing(overrides: Partial<Campaign> = {}): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow'),
    turn: 4,
    step: 'tactical-mission',
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
const field = (name: RegExp) => within(walk()).getByLabelText(name);

describe('the outcome of a Siege Defense (pg. 86)', () => {
  it('waits for the counts before it can be recorded', () => {
    open(playing({ log: [called, chose('siege-defense')] }));

    expect(
      within(walk()).getByRole('button', { name: /record the siege defense/i }),
    ).toBeDisabled();
  });

  it('says what a clean siege does, and keeps saying it once recorded', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '0');
    await user.type(field(/out over the map edge/i), '2');

    expect(walk().textContent).toContain('go back to 0');

    await user.click(within(walk()).getByRole('button', { name: /record the siege defense/i }));

    expect(within(walk()).queryByRole('button', { name: /record/i })).toBeNull();
    expect(walk().textContent).toContain('Siege Defense: 0 zombies left, 2 survivors out');
  });

  it('names an overrun base before it is recorded', async () => {
    const user = open(playing({ log: [called, chose('siege-defense')] }));

    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');

    expect(walk().textContent).toContain('keep counting');
    expect(walk().textContent).toContain('The base is overrun');
  });
});

/** How the community goes on from an overrun base (pg. 86; R27, R28; Z4-9). */
describe('the overrun base', () => {
  const overran: LogEntry = {
    turn: 4,
    phase: 'mission',
    at: AT,
    event: { kind: 'siege-defense-resolved', zombiesLeft: 2, survivorsExited: 1, team: 1 },
  };

  const besieged = () =>
    playing({
      base: { id: 'hobby-farm', slots: {} },
      survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
      log: [called, chose('siege-defense'), overran],
    });

  const choice = () =>
    within(within(walk()).getByRole('group', { name: /how does the community go on/i }));

  it('asks how the community goes on once the siege is recorded', () => {
    open(besieged());

    expect(choice().getByRole('radio', { name: 'Claim a new base' })).toBeChecked();
    expect(choice().getByRole('radio', { name: 'Start a new community' })).toBeInTheDocument();
  });

  it('plays the claim it chooses at once, with no strangers and a question about the map', async () => {
    const user = open(besieged());

    // The overrun base's own type is the default, which is the one that asks.
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const claim = group(/how claim a new base ended/i);
    expect(claim.getByText('Claiming a Hobby Farm.')).toBeInTheDocument();
    expect(claim.queryByLabelText('Stranger’s Tier')).toBeNull();

    await user.selectOptions(claim.getByLabelText(/end condition met/i), '1');
    await user.click(claim.getByLabelText(/overrun base’s own map/i));
    await user.click(claim.getByRole('button', { name: 'Record Claim a New Base' }));

    expect(walk().textContent).toContain('on the overrun base’s own map');
    expect(
      within(walk()).queryByRole('group', { name: /how does the community go on/i }),
    ).toBeNull();
  });

  it('leaves the survivors behind, then plays the new community’s First Mission (R31)', async () => {
    const user = open(besieged());

    await user.click(
      choice().getByRole('radio', { name: 'Leave the survivors behind and begin a new community' }),
    );
    expect(choice().queryByLabelText(/^Base/)).toBeNull();
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const next = group(/the new community’s first mission/i);
    expect(
      next.getByText('Add the new community’s survivors on the roster first.'),
    ).toBeInTheDocument();
    expect(next.getByRole('button', { name: 'Play the First Mission' })).toBeDisabled();
    expect(walk().textContent).not.toContain('how does the community go on');
  });

  it('asks again when the way on fails (R28)', async () => {
    const user = open(besieged());

    await user.click(choice().getByRole('radio', { name: 'Start a new community' }));
    await user.selectOptions(
      choice().getByLabelText('Base the new community claims'),
      'summer-camp',
    );
    await user.click(choice().getByRole('button', { name: 'Go on this way' }));

    const first = group(/how the first mission ended/i);
    await user.selectOptions(first.getByLabelText(/end condition met/i), '4');
    await user.click(first.getByRole('button', { name: 'Record the First Mission' }));

    // Not R21's replay, which is turn 1's.
    expect(walk().textContent).toContain('the community chooses again how it goes on');
    expect(choice().getByRole('button', { name: 'Go on this way' })).toBeEnabled();
  });
});

describe('the outcome of a Thin the Herd (pg. 81)', () => {
  it('is offered when a team chose it', () => {
    open(playing({ log: [chose('thin-the-herd')] }));

    expect(within(walk()).getByRole('group', { name: /thin the herd/i })).toBeInTheDocument();
  });

  it('is not offered when no team chose it', () => {
    open(playing());

    expect(within(walk()).queryByRole('group', { name: /thin the herd/i })).toBeNull();
  });

  it('halves the counter, and says everybody down brings the horde', async () => {
    const user = open(playing({ log: [chose('thin-the-herd')] }));

    await user.type(field(/at the start/i), '8');
    await user.type(field(/zombies left/i), '3');
    await user.type(field(/out over the map edge/i), '1');
    expect(walk().textContent).toContain('halved, rounding down');

    await user.click(within(walk()).getByLabelText(/incapacitated/i));
    expect(walk().textContent).toContain('next roll against the horde succeeds on its own');
  });
});

/** A choice by any team for any mission, for the Z4-3 forms below. */
const teamChose = (team: number, mission: MissionId, turn = 4): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: { kind: 'mission-selected', team, mission, names: [] },
});

const group = (name: RegExp) => within(within(walk()).getByRole('group', { name }));

describe('an outcome for every mission a team chose (Z4-3)', () => {
  it('asks each team for its own mission’s counts, and names the teams', async () => {
    const user = open(
      playing({
        survivors: [
          createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
          createSurvivor('Ruby Vance', 2, { id: 'ruby' }),
        ],
        assignments: {
          earl: { task: 'mission', team: 1 },
          ruby: { task: 'mission', team: 2 },
        },
        log: [teamChose(1, 'gather-materials'), teamChose(2, 'rescue-strangers')],
      }),
    );

    const gathering = group(/mission team 1: how gather materials ended/i);
    const rescuing = group(/mission team 2: how rescue strangers ended/i);

    await user.type(gathering.getByLabelText(/materials carried off the map/i), '5');
    await user.click(gathering.getByRole('button', { name: 'Record Gather Materials' }));
    expect(walk().textContent).toContain('Gather Materials: 5 materials carried off the map.');

    // Ruby is Tier 2: a Leader is past anybody on her team (pg. 31), and no
    // stranger is a Hero (pg. 7; R24), so Tier 4 is not on offer.
    expect(
      within(rescuing.getByLabelText('Stranger’s Tier'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['1', '2', '3']);
    await user.selectOptions(rescuing.getByLabelText('Stranger’s Tier'), '3');
    await user.click(rescuing.getByRole('button', { name: 'Add a stranger' }));
    expect(rescuing.getByText(/Tier 3 or higher/)).toBeInTheDocument();

    await user.click(rescuing.getByRole('button', { name: 'Record Rescue Strangers' }));
    expect(walk().textContent).toContain(
      'Rescue Strangers (mission team 2): 1 stranger rescued (Tier 3).',
    );
  });

  it('waits for an end condition, and plays a failed First Mission again (R21)', async () => {
    const user = open(
      playing({
        turn: 1,
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'first-mission', 1)],
      }),
    );

    const first = group(/how the first mission ended/i);
    const record = first.getByRole('button', { name: 'Record the First Mission' });
    expect(record).toBeDisabled();

    await user.selectOptions(first.getByLabelText(/end condition met/i), '4');
    expect(walk().textContent).toContain('The First Mission failed, so turn 1 plays it again');

    await user.click(record);
    expect(walk().textContent).toContain(
      'First Mission: end condition 4, failed, no strangers rescued.',
    );
  });

  it('names the base a claim is aiming at (pg. 78; Z4-7)', () => {
    open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [
          {
            ...teamChose(1, 'claim-a-new-base'),
            event: {
              kind: 'mission-selected',
              team: 1,
              mission: 'claim-a-new-base',
              names: [],
              base: 'outdoor-sports-shop',
            },
          },
        ],
      }),
    );

    expect(
      group(/how claim a new base ended/i).getByText('Claiming an Outdoor Sports Shop.'),
    ).toBeInTheDocument();
  });

  it('records how a story ended, and says what it gave (Z7-3)', async () => {
    const user = open(
      playing({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
            stories: [{ mission: 'sentimental-value', attachedOnTurn: 2 }],
          },
        ],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'sentimental-value')],
      }),
    );
    const form = group(/how sentimental value ended/i);
    const record = form.getByRole('button', { name: 'Record Sentimental Value' });

    expect(form.getByText('Choose one to record the story.')).toBeInTheDocument();
    expect(record).toBeDisabled();

    await user.click(form.getByLabelText(/The heirloom was recovered/));
    expect(
      form.getByText(/Earl Rhodes is now Driven, in place of any other Story Trait\./),
    ).toBeInTheDocument();
    await user.click(record);

    expect(walk().textContent).toContain('Sentimental Value: the heirloom was recovered.');
    expect(walk().textContent).toContain(
      'Earl Rhodes is now Driven, in place of any other Story Trait. Sentimental Value is done.',
    );
  });
});

/** What a story's ending gives as things, entered on its form (Z7-4). */
describe('a story’s rewards that are things (pp. 90–102; Z7-4)', () => {
  /** Earl, with Long Guns, and Carla on team 1, Earl holding `story`. */
  const storied = (story: MissionId) =>
    playing({
      survivors: [
        {
          ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
          skills: { 'long-guns': 0 },
          stories: [{ mission: story as 'warehouse', attachedOnTurn: 2 }],
        },
        createSurvivor('Carla Proust', 3, { id: 'carla' }),
      ],
      assignments: {
        earl: { task: 'mission', team: 1 },
        carla: { task: 'mission', team: 1 },
      },
      log: [teamChose(1, story)],
    });

  it('picks three of the trap door’s items, or rolls six, and adds 6 Food (R127)', async () => {
    const user = open(storied('preppers-stash-2'));
    const form = group(/how prepper’s stash \(part 2\) ended/i);
    const record = form.getByRole('button', { name: 'Record Prepper’s Stash (Part 2)' });

    await user.click(form.getByLabelText(/The trap door was opened/));
    expect(
      form.getByText(/Enter 6 Rare Item Table rolls, or pick 3 of its items/),
    ).toBeInTheDocument();
    expect(form.getAllByLabelText(/^Roll \d, first d10$/)).toHaveLength(6);

    await user.click(form.getByLabelText('3 items picked from it'));
    await user.selectOptions(form.getByLabelText('Item 1'), 'tool-belt:quality');
    await user.selectOptions(form.getByLabelText('Item 2'), 'gas-grill:standard');
    expect(record).toBeDisabled();
    await user.selectOptions(form.getByLabelText('Item 3'), 'riot-shield:standard');
    await user.click(record);

    expect(walk().textContent).toContain('A quality tool belt goes into the base’s Inventory.');
    expect(walk().textContent).toContain('6 Food goes into storage.');
  });

  it('rolls six on the table, naming what each finds', async () => {
    const user = open(storied('preppers-stash-2'));
    const form = group(/how prepper’s stash \(part 2\) ended/i);

    await user.click(form.getByLabelText(/The trap door was opened/));
    for (const roll of [1, 2, 3, 4, 5, 6]) {
      await user.selectOptions(form.getByLabelText(`Roll ${String(roll)}, first d10`), '3');
      await user.selectOptions(form.getByLabelText(`Roll ${String(roll)}, second d10`), '1');
    }
    expect(form.getAllByText('standard riot shield')).toHaveLength(6);
    await user.click(form.getByRole('button', { name: 'Record Prepper’s Stash (Part 2)' }));

    expect(walk().textContent).toContain('A standard riot shield goes into the base’s Inventory.');
  });

  it('takes Part 1’s duffel roll on the Quality Items subtable', async () => {
    const user = open(storied('preppers-stash-1'));
    const form = group(/how prepper’s stash \(part 1\) ended/i);

    await user.click(form.getByLabelText(/The Prepper’s Duffel was recovered/));
    await user.selectOptions(form.getByLabelText('Quality Items roll'), '1');
    expect(form.getByText('quality bladed weapon')).toBeInTheDocument();
    await user.selectOptions(form.getByLabelText('Attach Prepper’s Stash (Part 2) to'), 'carla');
    await user.click(form.getByRole('button', { name: 'Record Prepper’s Stash (Part 1)' }));

    expect(walk().textContent).toContain('A quality bladed weapon goes into the base’s Inventory.');
  });

  it('counts the Warehouse’s resources, and says more than 10 quiets the turn', async () => {
    const user = open(storied('warehouse'));
    const form = group(/how warehouse ended/i);
    const record = form.getByRole('button', { name: 'Record Warehouse' });

    await user.click(form.getByLabelText(/^Played/));
    expect(form.getByText(/More than 10 makes Unrest 0 this turn/)).toBeInTheDocument();
    expect(record).toBeDisabled();
    await user.type(form.getByLabelText('Resource and material tokens carried home'), '11');
    await user.click(record);

    expect(walk().textContent).toContain('11 resource and material tokens came home.');
  });

  it('takes Part 2b’s boat and makes somebody else Jaded, if the table says so (R128)', async () => {
    const user = open(storied('left-behind-2b'));
    const form = group(/how left behind \(part 2b\) ended/i);

    await user.click(form.getByLabelText(/the body was left/));
    await user.click(form.getByLabelText(/The team left in the boat, a Tier 2 vehicle/));
    await user.clear(form.getByLabelText('The boat’s name'));
    await user.type(form.getByLabelText('The boat’s name'), 'Mabel');
    await user.selectOptions(
      form.getByLabelText('Who becomes Jaded, if Earl Rhodes fell while Berserk'),
      'carla',
    );
    expect(
      within(
        form.getByLabelText('Who becomes Jaded, if Earl Rhodes fell while Berserk'),
      ).queryByRole('option', { name: 'Earl Rhodes' }),
    ).toBeNull();
    await user.click(form.getByRole('button', { name: 'Record Left Behind (Part 2B)' }));

    expect(walk().textContent).toContain('Mabel, a Tier 2 boat, joins the community.');
    expect(walk().textContent).toContain(
      'Carla Proust is now Jaded, in place of any other Story Trait.',
    );
  });

  it('attaches Prepper’s Stash to whoever used the Computer twice, or nobody (pg. 90)', async () => {
    const user = open(storied('left-behind-1'));
    const form = group(/how left behind \(part 1\) ended/i);

    await user.click(form.getByLabelText(/The loved one was rescued/));
    await user.selectOptions(form.getByLabelText('Who used the Computer twice'), 'carla');
    await user.click(form.getByRole('button', { name: 'Record Left Behind (Part 1)' }));

    expect(walk().textContent).toContain('Prepper’s Stash (Part 1) is attached to Carla Proust.');
  });

  it('says a story held already is not attached again (R139)', async () => {
    const campaign = storied('left-behind-2a');
    const user = open({
      ...campaign,
      survivors: campaign.survivors.map((survivor) =>
        survivor.id === 'carla'
          ? { ...survivor, stories: [{ mission: 'crashed-convoy' as const, attachedOnTurn: 1 }] }
          : survivor,
      ),
    });
    const form = group(/how left behind \(part 2a\) ended/i);

    await user.click(form.getByLabelText(/Nobody was rescued/));

    expect(form.getByLabelText('Who opened the safe on a roll of 1')).toBeInTheDocument();
    expect(
      form.getByText('Crashed Convoy is attached to somebody or done, so nothing is attached.'),
    ).toBeInTheDocument();
  });

  it('gives Neighbor’s Rifle’s rifle to whoever took it', async () => {
    const user = open(storied('neighbors-rifle'));
    const form = group(/how neighbor’s rifle ended/i);

    await user.click(form.getByLabelText(/The Seating check failed/));
    await user.selectOptions(form.getByLabelText('Who took the quality rifle'), 'carla');
    await user.click(form.getByRole('button', { name: 'Record Neighbor’s Rifle' }));

    expect(walk().textContent).toContain('Carla Proust takes a quality rifle.');
  });
});

describe('a story’s next part, attached to whom the player chooses (pp. 99, 101; Z7-3)', () => {
  it('asks which Tier 2 or 3 on the team takes the Warehouse, and records it', async () => {
    const user = open(
      playing({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
            stories: [{ mission: 'crashed-convoy', attachedOnTurn: 2 }],
          },
          createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
          createSurvivor('Nell Haig', 1, { id: 'nell' }),
        ],
        assignments: {
          earl: { task: 'mission', team: 1 },
          ruby: { task: 'mission', team: 1 },
          nell: { task: 'mission', team: 1 },
        },
        log: [teamChose(1, 'crashed-convoy')],
      }),
    );
    const form = group(/how crashed convoy ended/i);
    const record = form.getByRole('button', { name: 'Record Crashed Convoy' });

    await user.click(form.getByLabelText(/The search check passed/));
    expect(form.getByText('Choose who the next part is attached to.')).toBeInTheDocument();
    expect(record).toBeDisabled();

    const to = form.getByLabelText('Attach Warehouse to');
    expect(within(to).queryByRole('option', { name: /Nell Haig/ })).toBeNull();
    await user.selectOptions(to, 'ruby');
    await user.click(record);

    expect(walk().textContent).toContain(
      'Earl Rhodes gains 1 XP. Crashed Convoy is done. Warehouse is attached to Ruby Vance.',
    );
  });

  it('goes straight on to Left Behind Part 2b when the loved one is lost (R119)', async () => {
    const user = open(
      playing({
        survivors: [
          {
            ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
            skills: { 'long-guns': 0 },
            stories: [{ mission: 'left-behind-1', attachedOnTurn: 2 }],
          },
        ],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'left-behind-1')],
      }),
    );
    const first = group(/how left behind \(part 1\) ended/i);

    // Attached on turn 2, played on turn 4 (R118).
    expect(
      first.getByText(/Attached 2 turns ago, which is inside its window of 3 turns/),
    ).toBeInTheDocument();

    await user.click(first.getByLabelText(/The loved one was not rescued/));
    expect(first.getByText(/Choose the quality weapon the loved one carried/)).toBeInTheDocument();
    await user.selectOptions(
      first.getByLabelText('The quality weapon the loved one carried'),
      'rifle',
    );
    expect(first.getByText(/Earl Rhodes takes a quality rifle\./)).toBeInTheDocument();
    await user.click(first.getByRole('button', { name: 'Record Left Behind (Part 1)' }));

    const second = group(/how left behind \(part 2b\) ended/i);
    expect(second.getByText(/straight after Part 1/)).toBeInTheDocument();
    expect(second.getByText('How Earl Rhodes’s story ended')).toBeInTheDocument();
  });

  it('says so when nobody on the team has the story attached', () => {
    open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'warehouse')],
      }),
    );

    expect(
      group(/how warehouse ended/i).getByText('Nobody on this team has Warehouse attached.'),
    ).toBeInTheDocument();
  });
});

describe('the Health a team came home with (Z4-4)', () => {
  /** Earl (Tier 2, at 1 of 2) and Ruby (Tier 3, unhurt) on team 1, playing Gather Materials. */
  const gathering = (overrides: Partial<Campaign> = {}) =>
    playing({
      survivors: [
        { ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }), currentHp: 1 },
        createSurvivor('Ruby Vance', 3, { id: 'ruby' }),
      ],
      assignments: {
        earl: { task: 'mission', team: 1 },
        ruby: { task: 'mission', team: 1 },
      },
      log: [teamChose(1, 'gather-materials')],
      ...overrides,
    });

  it('starts each member at their Health now, and records it with the outcome', async () => {
    const user = open(gathering());
    const form = group(/how gather materials ended/i);

    expect(form.getByLabelText('Earl Rhodes’s Health')).toHaveValue(1);
    expect(form.getByLabelText('Ruby Vance’s Health')).toHaveValue(3);
    expect(form.queryByLabelText(/Infection/)).toBeNull();

    await user.type(form.getByLabelText(/materials carried off the map/i), '2');
    await user.clear(form.getByLabelText('Ruby Vance’s Health'));
    await user.type(form.getByLabelText('Ruby Vance’s Health'), '0');
    await user.click(form.getByRole('button', { name: 'Record Gather Materials' }));

    expect(walk().textContent).toContain(
      'Gather Materials: 2 materials carried off the map. At the end: Earl Rhodes at 1 Health, Ruby Vance at 0 Health.',
    );
  });

  it('refuses Health above a survivor’s maximum, or none at all', async () => {
    const user = open(gathering());
    const form = group(/how gather materials ended/i);
    const record = form.getByRole('button', { name: 'Record Gather Materials' });

    await user.type(form.getByLabelText(/materials carried off the map/i), '2');
    expect(record).toBeEnabled();

    await user.type(form.getByLabelText('Earl Rhodes’s Health'), '5');
    expect(record).toBeDisabled();
    expect(form.getByText('Earl Rhodes’s Health must be a whole number from 0 to 2.')).toBeTruthy();

    await user.clear(form.getByLabelText('Earl Rhodes’s Health'));
    expect(record).toBeDisabled();
  });

  it('asks for Infection as well in a Viral campaign (pg. 123)', async () => {
    const user = open(
      gathering({
        origin: 'viral',
        survivors: [
          createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
          { ...createSurvivor('Ruby Vance', 3, { id: 'ruby' }), infection: 2 },
        ],
      }),
    );
    const form = group(/how gather materials ended/i);

    expect(form.getByLabelText('Ruby Vance’s Infection')).toHaveValue(2);

    await user.type(form.getByLabelText(/materials carried off the map/i), '1');
    await user.type(form.getByLabelText('Earl Rhodes’s Infection'), '3');
    await user.click(form.getByRole('button', { name: 'Record Gather Materials' }));

    expect(walk().textContent).toContain(
      'At the end: Earl Rhodes at 2 Health and 3 Infection, Ruby Vance at 3 Health and 2 Infection.',
    );
  });
});

/** Survivors set aside, brought back by Rescue Strangers (R31; Z4-11). */
describe('bringing back a survivor set aside', () => {
  it('offers everybody set aside, and records who came back', async () => {
    const user = open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 4, { id: 'earl' })],
        setAside: [createSurvivor('Hera Okafor', 4, { id: 'hera' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'rescue-strangers')],
      }),
    );

    const rescue = group(/how rescue strangers ended/i);
    await user.click(rescue.getByRole('checkbox', { name: 'Hera Okafor (Tier 4)' }));
    await user.click(rescue.getByRole('button', { name: 'Record Rescue Strangers' }));

    expect(walk().textContent).toContain(
      'Rescue Strangers: no strangers rescued, and 1 survivor set aside brought back.',
    );
  });

  it('asks nothing of a community with nobody set aside', () => {
    open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'rescue-strangers')],
      }),
    );

    expect(within(walk()).queryByText(/Brought back from those set aside/)).toBeNull();
  });
});

/** A Rare Items trade the Rare Goods Trader settles (pg. 84; R61; Z5-10). */
describe('the Rare Goods Trader with a trade under way', () => {
  it('asks how many items were handed over, and settles the trade', async () => {
    const shield = {
      id: 'shield',
      item: 'riot-shield',
      grade: 'standard',
      subtable: 3,
      entry: 1,
      food: 4,
      fuel: 6,
    } as const;
    const user = open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        rareTrade: { madeOnTurn: 3, items: [shield, { ...shield, id: 'second' }] },
        log: [teamChose(1, 'rare-goods-trader')],
      }),
    );

    const trader = group(/how rare goods trader ended/i);
    expect(
      trader.getByText(/First in priority first: standard riot shield, standard riot shield/),
    ).toBeInTheDocument();
    await user.type(trader.getByLabelText(/out over the map edge/i), '1');
    await user.selectOptions(trader.getByLabelText('Items the trader handed over'), '1');
    await user.click(trader.getByRole('button', { name: 'Record Rare Goods Trader' }));

    expect(walk().textContent).toContain('1 survivor out over the map edge, 1 item traded');
  });
});

/** The vehicles a Retrieve New Vehicles team drove off (pg. 82; R63; Z5-11). */
describe('Retrieve New Vehicles', () => {
  it('asks what each vehicle driven off was, and adds it', async () => {
    const user = open(
      playing({
        survivors: [createSurvivor('Earl Rhodes', 2, { id: 'earl' })],
        assignments: { earl: { task: 'mission', team: 1 } },
        log: [teamChose(1, 'retrieve-new-vehicles')],
      }),
    );

    const retrieving = group(/how retrieve new vehicles ended/i);
    await user.type(retrieving.getByLabelText(/vehicles repaired and driven off/i), '2');
    const record = retrieving.getByRole('button', { name: 'Record Retrieve New Vehicles' });
    expect(record).toBeDisabled();

    await user.selectOptions(retrieving.getByLabelText('Vehicle 1: its setup d10'), '5');
    // A 5 is a Tier 2, so nothing higher is on offer.
    expect(
      within(retrieving.getByLabelText('Vehicle 1: Tier'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['1', '2']);
    await user.clear(retrieving.getByLabelText('Vehicle 1: name'));
    await user.type(retrieving.getByLabelText('Vehicle 1: name'), 'Red pickup');

    await user.selectOptions(retrieving.getByLabelText('Vehicle 2: its setup d10'), '10');
    await user.selectOptions(retrieving.getByLabelText('Vehicle 2: Inventory Slots of 20'), '12');
    await user.click(record);

    expect(walk().textContent).toContain(
      '2 vehicles repaired and driven off (Red pickup, Tier 2; Vehicle 2, Tier 4)',
    );
  });
});

/** #236, R3: who died is part of how the mission ended, so it is in the outcome's form. */
describe('a death on a mission (pp. 31, 34; R71)', () => {
  const rifle = { id: 'rifle-1', item: 'rifle', grade: 'standard' } as const;
  const bat = { id: 'bat-1', item: 'blunt', grade: 'standard' } as const;

  /** Earl, carrying a rifle and a bat, and Carla on team 1's Thin the Herd. */
  const team = (): Campaign =>
    playing({
      survivors: [
        { ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }), items: [rifle, bat] },
        createSurvivor('Carla Proust', 3, { id: 'carla' }),
      ],
      assignments: {
        earl: { task: 'mission', team: 1 },
        carla: { task: 'mission', team: 1 },
      },
      log: [chose('thin-the-herd')],
    });

  const counted = async (user: ReturnType<typeof open>) => {
    await user.type(field(/at the start/i), '4');
    await user.type(field(/zombies left/i), '2');
    await user.type(field(/out over the map edge/i), '1');
  };

  it('records who died, what a teammate took, and what stayed on the map, with the outcome', async () => {
    const user = open(team());

    await counted(user);
    await user.click(within(walk()).getByRole('checkbox', { name: 'Earl Rhodes died' }));
    // The dead are not asked how much Health they came home with.
    expect(within(walk()).queryByLabelText('Earl Rhodes’s Health')).toBeNull();

    await user.selectOptions(field(/Earl Rhodes’s standard rifle/), 'carla');
    await user.click(within(walk()).getByRole('button', { name: /record thin the herd/i }));

    expect(
      within(walk()).getByText(
        'Earl Rhodes, a Leader, died on mission team 1’s mission, and standard blunt weapon stayed on the map.',
      ),
    ).toBeInTheDocument();
    expect(within(walk()).queryByRole('checkbox', { name: /died$/ })).toBeNull();
  });

  it('offers what the dead carried only to somebody who came home', async () => {
    const user = open(team());

    await user.click(within(walk()).getByRole('checkbox', { name: 'Earl Rhodes died' }));
    await user.click(within(walk()).getByRole('checkbox', { name: 'Carla Proust died' }));

    expect(
      within(field(/Earl Rhodes’s standard rifle/))
        .getAllByRole('option')
        .map((one) => one.textContent),
    ).toEqual(['Lost on the map']);
  });

  it('asks nothing about the gear of somebody who carried none', async () => {
    const user = open(team());

    await user.click(within(walk()).getByRole('checkbox', { name: 'Carla Proust died' }));

    expect(within(walk()).queryByText(/stays on the map/)).toBeNull();
  });
});

describe('an end condition not chosen yet (#240)', () => {
  it('says so beside its picker, rather than as a refusal under the form', () => {
    open(playing({ log: [teamChose(1, 'first-mission', 4)] }));

    expect(within(walk()).getByText('Choose one to record the First Mission.')).toBeInTheDocument();
    expect(within(walk()).queryByText(/Choose an end condition from/)).toBeNull();
  });
});
