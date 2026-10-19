import { describe, expect, it } from 'vitest';
import type { SpellId } from '../data/origins';
import { submitSpellLearned } from './advancementForms';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import type { LogEntry } from './log';
import { submitMissionEnded } from './missionForms';
import {
  learnableSpells,
  learnedThisTurn,
  spellCost,
  spellDiscountsLeft,
  spellLearners,
  spellLearningProblem,
  spellsCastProblem,
  spellsSeen,
  withSpellLearned,
  withSpellsCast,
} from './spells';
import { createSurvivor } from './survivor';
import { traitsProblem } from './traits';

const AT = '2026-10-19T09:00:00.000Z';

const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Earl Rhodes', 2, { id: 'earl' }),
  xp: 10,
  ...overrides,
});
const carla = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Carla Proust', 3, { id: 'carla' }),
  xp: 10,
  ...overrides,
});
const ruby = (overrides: Partial<Survivor> = {}): Survivor => ({
  ...createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
  xp: 10,
  ...overrides,
});

const cast = (spells: readonly SpellId[], turn = 2): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: { kind: 'spells-cast', team: 1, spells },
});

const necromancerWon = (turn = 2): LogEntry => ({
  turn,
  phase: 'mission',
  at: AT,
  event: {
    kind: 'mission-played',
    team: 1,
    mission: 'the-necromancer',
    magic: { completed: true, killed: false },
  },
});

const library = (upgrades: readonly string[] = []): Base => ({
  id: 'small-town-home',
  slots: {
    garage: {
      built: { facility: 'mystic-library', builtOnTurn: 1 },
      ...(upgrades.length === 0 ? {} : { upgrades: upgrades as never }),
    },
  },
});

/** Turn 4's Character Advancement in a Magic campaign: Earl staffing the Library, Carla resting. */
const advancing = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...createNewCampaign('Cedar Hollow'),
  turn: 4,
  step: 'character-advancement',
  origin: 'magic',
  base: library(),
  survivors: [earl(), carla()],
  assignments: { earl: { task: 'staff', slot: 'garage' }, carla: { task: 'rest' } },
  log: [cast(['teleport', 'restoration'])],
  ...overrides,
});

const learner = (campaign: Campaign, id = 'earl') => {
  const found = spellLearners(campaign).find((one) => one.survivor.id === id);
  if (found === undefined) throw new Error(`${id} is not learning`);

  return found;
};

describe('the spells seen (R112, R154)', () => {
  it('are every spell an enemy cast in the campaign, once, in the book’s order', () => {
    const campaign = advancing({
      log: [cast(['mass-recall', 'teleport']), cast(['teleport', 'dominate-enemy'], 3)],
    });

    expect(spellsSeen(campaign)).toEqual(['dominate-enemy', 'teleport', 'mass-recall']);
    expect(spellsSeen(advancing({ log: [] }))).toEqual([]);
  });

  it('are recorded with a mission’s outcome, after it, in a Magic campaign only', () => {
    const playing: Campaign = {
      ...advancing({ log: [] }),
      step: 'tactical-mission',
      assignments: { earl: { task: 'mission', team: 1 } },
      survivors: [earl()],
      log: [
        {
          turn: 4,
          phase: 'mission',
          at: AT,
          event: { kind: 'mission-selected', team: 1, mission: 'rescue-strangers', names: [] },
        },
      ],
    };
    const outcome = {
      kind: 'rescue-strangers-resolved',
      team: 1,
      strangers: [],
      wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2, humanity: 3 }],
    } as const;
    const result = submitMissionEnded(playing, outcome, [], AT, ['restoration', 'teleport']);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.log.map((entry) => entry.event.kind).slice(-2)).toEqual([
      'rescue-strangers-resolved',
      'spells-cast',
    ]);
    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'spells-cast',
      team: 1,
      spells: ['teleport', 'restoration'],
    });
    expect(spellsSeen(result.campaign)).toEqual(['teleport', 'restoration']);

    const plain = submitMissionEnded(playing, outcome, [], AT);
    expect(plain.ok && plain.campaign.log.at(-1)?.event.kind).toBe('rescue-strangers-resolved');

    const { origin, ...none } = playing;
    void origin;
    expect(
      submitMissionEnded(
        none,
        { ...outcome, wounds: [{ survivor: 'earl', name: 'Earl Rhodes', health: 2 }] },
        [],
        AT,
        ['teleport'],
      ),
    ).toEqual({ ok: false, problem: 'Only a Magic campaign records the spells an enemy cast.' });
  });

  it('take each spell once, and none anywhere', () => {
    expect(spellsCastProblem(advancing(), ['teleport', 'duplicate'])).toBeNull();
    expect(spellsCastProblem({ ...advancing(), origin: 'viral' }, [])).toBeNull();
    expect(spellsCastProblem(advancing(), ['teleport', 'teleport'])).toBe(
      'Name each spell an enemy cast once.',
    );
    expect(spellsCastProblem(advancing(), ['fireball' as SpellId])).toBe(
      'Name each spell an enemy cast once.',
    );
    expect(spellsCastProblem({ ...advancing(), origin: 'cosmic-horror' }, ['teleport'])).toBe(
      'Only a Magic campaign records the spells an enemy cast.',
    );
  });

  it('log nothing for none', () => {
    const campaign = advancing();

    expect(withSpellsCast(campaign, 1, [], AT)).toBe(campaign);
    expect(withSpellsCast(campaign, 2, ['duplicate'], AT).log.at(-1)).toEqual({
      turn: 4,
      phase: 'advancement',
      at: AT,
      event: { kind: 'spells-cast', team: 2, spells: ['duplicate'] },
    });
  });
});

describe('who learns at the Mystic Library (pg. 70; R113)', () => {
  it('is whoever staffed it, as they are now, with the Library’s price', () => {
    expect(spellLearners(advancing())).toEqual([{ survivor: earl(), xpCost: 6, maxHumanity: 3 }]);
  });

  it('is one a staff place, the Study Room’s included', () => {
    const three = {
      survivors: [earl(), carla(), ruby()],
      assignments: {
        earl: { task: 'staff', slot: 'garage' },
        carla: { task: 'staff', slot: 'garage' },
        ruby: { task: 'staff', slot: 'garage' },
      },
    } as const;

    expect(spellLearners(advancing(three)).map((one) => one.survivor.id)).toEqual(['earl']);
    expect(
      spellLearners(advancing({ ...three, base: library(['study-room']) })).map(
        (one) => one.survivor.id,
      ),
    ).toEqual(['earl', 'carla']);
  });

  it('is read off the last Planning Phase, and nobody gone from the community', () => {
    const planned = advancing({
      assignments: { carla: { task: 'staff', slot: 'garage' } },
      log: [
        {
          turn: 4,
          phase: 'planning',
          at: AT,
          event: { kind: 'planning-began', cleared: { earl: { task: 'staff', slot: 'garage' } } },
        },
      ],
    });

    expect(spellLearners(planned).map((one) => one.survivor.id)).toEqual(['earl']);
    expect(spellLearners({ ...advancing(), survivors: [carla()] })).toEqual([]);
  });

  it('is nobody outside a Magic campaign, or without a Library', () => {
    expect(spellLearners({ ...advancing(), origin: 'viral' })).toEqual([]);
    expect(
      spellLearners(
        advancing({
          base: {
            id: 'small-town-home',
            slots: { garage: { built: { facility: 'workshop', builtOnTurn: 1 } } },
          },
        }),
      ),
    ).toEqual([]);
  });
});

describe('what a spell costs (R113, R124, R153)', () => {
  it('is 6 XP, or 3 for each win of The Necromancer until a spell uses it', () => {
    const plain = advancing();
    const won = advancing({ log: [necromancerWon(), necromancerWon(3)] });

    expect(spellCost(plain, learner(plain))).toEqual({ xp: 6, discounted: false });
    expect(spellDiscountsLeft(won)).toBe(2);
    expect(spellCost(won, learner(won))).toEqual({ xp: 3, discounted: true });

    const once = withSpellLearned(
      advancing({ log: [cast(['teleport']), necromancerWon()] }),
      'earl',
      'teleport',
      AT,
    );
    expect(spellDiscountsLeft(once)).toBe(0);
    expect(spellCost(once, learner(once))).toEqual({ xp: 6, discounted: false });
    expect(spellDiscountsLeft(advancing({ log: [] }))).toBe(0);

    // A spell learned at full price, before the win, leaves the win's discount.
    const paid = withSpellLearned(advancing(), 'earl', 'teleport', AT);
    expect(spellDiscountsLeft({ ...paid, log: [...paid.log, necromancerWon(4)] })).toBe(1);
  });
});

describe('learning a spell (pg. 70; R113)', () => {
  it('pays the XP as spent, knows it in the book’s order, and logs it', () => {
    const before = advancing({ survivors: [earl({ spells: ['restoration'] }), carla()] });
    const after = withSpellLearned(before, 'earl', 'teleport', AT);
    const learned = after.survivors[0];

    expect(learned?.xp).toBe(4);
    expect(learned?.xpSpent).toBe(6);
    expect(learned?.spells).toEqual(['teleport', 'restoration']);
    expect(after.survivors[1]).toEqual(carla());
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'spell-learned',
      survivor: 'earl',
      name: 'Earl Rhodes',
      spell: 'teleport',
      xp: 6,
    });
    expect(learnedThisTurn(after, 'earl')).toBe(true);
    expect(learnedThisTurn({ ...after, turn: 5 }, 'earl')).toBe(false);
    expect(learnedThisTurn(after, 'carla')).toBe(false);
    // Another entry about them this turn is not a spell.
    const gained: LogEntry = {
      turn: 4,
      phase: 'advancement',
      at: AT,
      event: {
        kind: 'humanity-gained',
        survivor: 'earl',
        name: 'Earl Rhodes',
        reason: 'healed-from-0',
      },
    };
    expect(learnedThisTurn({ ...before, log: [...before.log, gained] }, 'earl')).toBe(false);
  });

  it('marks a discounted spell as one', () => {
    const after = withSpellLearned(
      advancing({ log: [cast(['teleport']), necromancerWon()] }),
      'earl',
      'teleport',
      AT,
    );

    expect(after.survivors[0]?.xp).toBe(7);
    expect(after.log.at(-1)?.event).toMatchObject({ xp: 3, discounted: true });
  });

  it('offers the spells seen they don’t know', () => {
    expect(learnableSpells(advancing(), earl({ spells: ['teleport'] }))).toEqual(['restoration']);
  });

  it('is refused for each thing it needs', () => {
    const problem = (campaign: Campaign, spell: SpellId = 'teleport', who = 'earl') =>
      spellLearningProblem(campaign, who, spell);

    expect(problem(advancing())).toBeNull();
    expect(problem(advancing({ step: 'heal-wounds' }))).toBe(
      'A spell is learned at Character Advancement.',
    );
    expect(problem(advancing(), 'teleport', 'carla')).toBe(
      'Only somebody who staffed a working Mystic Library learns a spell.',
    );
    expect(problem(withSpellLearned(advancing(), 'earl', 'restoration', AT))).toBe(
      'They have learned a spell this turn already.',
    );
    expect(problem(advancing({ survivors: [earl({ humanity: 4 })] }))).toBe(
      'Only somebody with Humanity 3 or less learns a spell.',
    );
    expect(problem(advancing({ survivors: [earl({ humanity: 3 })] }))).toBeNull();
    expect(problem(advancing({ survivors: [earl({ spells: ['teleport'] })] }))).toBe(
      'They know that spell already.',
    );
    expect(problem(advancing(), 'duplicate')).toBe(
      'An enemy has to cast a spell before anybody can learn it.',
    );
    expect(problem(advancing({ survivors: [earl({ xp: 5 })] }))).toBe(
      'They don’t have the experience for this yet.',
    );
    expect(problem(advancing({ survivors: [earl({ xp: 6 })] }))).toBeNull();
    expect(
      problem(
        advancing({ survivors: [earl({ xp: 3 })], log: [cast(['teleport']), necromancerWon()] }),
      ),
    ).toBeNull();
  });

  it('goes through the Advancement form, or is refused with the reason', () => {
    const result = submitSpellLearned(advancing(), { survivor: 'earl', spell: 'teleport' }, AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.survivors[0]?.spells).toEqual(['teleport']);
    expect(submitSpellLearned(advancing(), { survivor: 'carla', spell: 'teleport' }, AT)).toEqual({
      ok: false,
      problem: 'Only somebody who staffed a working Mystic Library learns a spell.',
    });
  });
});

describe('spells set by hand on the sheet (R155)', () => {
  const traits = { storyTrait: null, veteran: false, bondGroup: null, stories: [] } as const;

  it('take each spell once', () => {
    expect(traitsProblem({ ...traits, spells: ['teleport', 'duplicate'] })).toBeNull();
    expect(traitsProblem({ ...traits, spells: ['teleport', 'teleport'] })).toBe(
      'Each spell is known once.',
    );
    expect(traitsProblem({ ...traits, spells: ['fireball' as SpellId] })).toBe(
      'Each spell is known once.',
    );
  });
});
