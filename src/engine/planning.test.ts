import { describe, expect, it } from 'vitest';
import {
  createNewCampaign,
  type Assignment,
  type Base,
  type Campaign,
  type Survivor,
} from './campaign';
import { createSurvivor } from './survivor';
import { checkAssignment, planningHasBegun, unassigned, withPlanningReset } from './planning';
import type { LogEntry } from './log';
import { generatingUtilities } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-11T09:00:00.000Z';

const EARL = 'earl';
const CARLA = 'carla';

/** Earl is a Hero at full Health; Carla a Leader who has taken a hit. */
function community(
  assignments: Record<string, Assignment> = {},
  base: Base | null = null,
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      { ...createSurvivor('Carla Proust', 3, { id: CARLA }), currentHp: 1 },
    ],
    assignments,
    base,
  };
}

const codes = (violations: readonly { code: string }[]) => violations.map(({ code }) => code);

describe('planningHasBegun', () => {
  function withLog(entries: readonly LogEntry[]): Campaign {
    return { ...community(), log: entries };
  }

  const began = (turn: number): LogEntry => ({
    turn,
    phase: 'planning',
    at: AT,
    event: { kind: 'planning-began' },
  });

  it('is false for a campaign that has not planned this turn', () => {
    expect(planningHasBegun(withLog([]))).toBe(false);
  });

  it('is true once this turn’s planning is recorded', () => {
    expect(planningHasBegun(withLog([began(3)]))).toBe(true);
  });

  it('ignores a previous turn’s planning, which is the whole point', () => {
    // The campaign is on turn 3. Turn 2's entry must not stop turn 3 clearing,
    // or the tasks would carry over for the rest of the campaign.
    expect(planningHasBegun(withLog([began(2)]))).toBe(false);
  });

  it('ignores every other kind of entry from this turn', () => {
    const other: LogEntry = { turn: 3, phase: 'planning', at: AT, event: { kind: 'turn-began' } };

    expect(planningHasBegun(withLog([other]))).toBe(false);
  });
});

describe('withPlanningReset', () => {
  it('clears every task', () => {
    const after = withPlanningReset(
      community({ [EARL]: { task: 'project' }, [CARLA]: { task: 'rest' } }),
    );

    expect(after.assignments).toEqual({});
  });

  it('clears the utility points and leaves everything else on the slot', () => {
    const after = withPlanningReset(
      community(
        {},
        {
          id: 'small-town-home',
          slots: {
            garage: { built: { facility: 'workshop', builtOnTurn: 1 }, power: true },
            kitchen: { upgrades: ['gas-range'], water: true },
          },
        },
      ),
    );

    expect(after.base?.slots).toEqual({
      garage: { built: { facility: 'workshop', builtOnTurn: 1 } },
      kitchen: { upgrades: ['gas-range'] },
    });
  });

  it('drops a slot whose only record was a utility point', () => {
    // Absent is what untouched means, so a slot left as `{}` would be a second
    // spelling for it — and would diff against a save that never had one.
    const after = withPlanningReset(
      community({}, { id: 'small-town-home', slots: { kitchen: { power: true } } }),
    );

    expect(after.base?.slots).toEqual({});
  });

  it('leaves a cleared slot cleared, because rubble does not come back', () => {
    const after = withPlanningReset(
      community({}, { id: 'hobby-farm', slots: { 'ruined-chicken-coop': { cleared: true } } }),
    );

    expect(after.base?.slots).toEqual({ 'ruined-chicken-coop': { cleared: true } });
  });

  it('handles a campaign with no base', () => {
    const after = withPlanningReset(community({ [EARL]: { task: 'project' } }));

    expect(after.assignments).toEqual({});
    expect(after.base).toBeNull();
  });
});

describe('unassigned', () => {
  it('lists whoever has nothing to do, in roster order', () => {
    expect(unassigned(community()).map((one) => one.name)).toEqual(['Earl Rhodes', 'Carla Proust']);
    expect(unassigned(community({ [EARL]: { task: 'rest' } })).map((one) => one.id)).toEqual([
      CARLA,
    ]);
  });

  it('is empty when everybody is busy', () => {
    expect(
      unassigned(community({ [EARL]: { task: 'project' }, [CARLA]: { task: 'rest' } })),
    ).toEqual([]);
  });
});

describe('checkAssignment', () => {
  const home = (slots: Base['slots'] = {}): Base => ({ id: 'small-town-home', slots });

  /**
   * Nothing here is ever a blocker. Assigning is free and reversible, and every
   * rule in this module is one a table may play differently — so the screen
   * says what is wrong and never refuses the tick.
   */
  it('never blocks anything, whatever is wrong with it', () => {
    const wrong = checkAssignment(community({}, home()), EARL, { task: 'rest' });

    expect(wrong.blockers).toEqual([]);
    expect(wrong.warnings.length).toBeGreaterThan(0);
  });

  it('finds nothing wrong with the project team, which has no rules of its own', () => {
    expect(checkAssignment(community(), EARL, { task: 'project' })).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  it('says nothing about a survivor who is not in the community', () => {
    expect(checkAssignment(community(), 'nobody', { task: 'rest' })).toEqual({
      blockers: [],
      warnings: [],
    });
  });

  describe('staffing', () => {
    it('warns when the slot holds nothing to work', () => {
      const check = checkAssignment(community({}, home()), EARL, {
        task: 'staff',
        slot: 'garage',
      });

      expect(codes(check.warnings)).toEqual(['nothing-in-slot']);
    });

    /**
     * The overstatement the September playtest caught. A Storage Area wants no
     * utility; its Refrigeration wants Power. Without it the *upgrade* does
     * nothing and the facility carries on — `working` filters entry by entry —
     * so "it produces nothing this turn" was a sentence the next Advancement
     * Phase contradicted.
     */
    it('warns about the upgrade, not the facility, when only an upgrade wants a utility', () => {
      const unpowered = home({
        garage: {
          built: { facility: 'storage-area', builtOnTurn: 1 },
          upgrades: ['refrigeration'],
        },
      });

      const check = checkAssignment(community({}, unpowered), EARL, {
        task: 'staff',
        slot: 'garage',
      });

      expect(codes(check.warnings)).toEqual(['upgrade-utility-unmet']);
      expect(check.warnings[0]?.message).toMatch(/the facility itself still works/i);
    });

    it('says nothing once the point is there and something is generating it', () => {
      const powered = home({
        garage: {
          built: { facility: 'storage-area', builtOnTurn: 1 },
          upgrades: ['refrigeration'],
          power: true,
        },
      });

      // A staffed Station behind the point, because a flag on the slot is not
      // generation: `suppliedOccupants` is what the rest of the app reads, and
      // this warning reads it too.
      const supplied = generatingUtilities(community({}, powered), 1, 'front-yard');

      expect(checkAssignment(supplied, EARL, { task: 'staff', slot: 'garage' }).warnings).toEqual(
        [],
      );
    });

    /**
     * The same falsehood the other way round, and the reason this reads
     * `suppliedOccupants`: the flag says the slot has Power and nothing is
     * generating it, so the Refrigeration is as unsupplied as if the flag were
     * absent (#111).
     */
    it('still warns when the point on the slot has no generator behind it', () => {
      const claimed = home({
        garage: {
          built: { facility: 'storage-area', builtOnTurn: 1 },
          upgrades: ['refrigeration'],
          power: true,
        },
      });

      expect(
        codes(
          checkAssignment(community({}, claimed), EARL, { task: 'staff', slot: 'garage' }).warnings,
        ),
      ).toEqual(['upgrade-utility-unmet']);
    });

    it('says nothing about a facility that wants no utility at all', () => {
      expect(
        checkAssignment(community({}, home()), EARL, { task: 'staff', slot: 'kitchen' }).warnings,
      ).toEqual([]);
    });

    it('warns about the slot rather than the utility when there is no base', () => {
      expect(
        codes(checkAssignment(community(), EARL, { task: 'staff', slot: 'kitchen' }).warnings),
      ).toEqual(['nothing-in-slot']);
    });
  });

  describe('resting', () => {
    it('warns when the survivor has nothing to heal', () => {
      expect(codes(checkAssignment(community(), EARL, { task: 'rest' }).warnings)).toEqual([
        'already-at-full-health',
      ]);
    });

    it('says nothing about a survivor who has taken a hit', () => {
      expect(checkAssignment(community(), CARLA, { task: 'rest' }).warnings).toEqual([]);
    });

    it('warns when somebody else is already resting, and names them', () => {
      const check = checkAssignment(community({ [EARL]: { task: 'rest' } }), CARLA, {
        task: 'rest',
      });

      expect(codes(check.warnings)).toEqual(['someone-else-resting']);
      expect(check.warnings[0]?.message).toContain('Earl Rhodes is');
    });

    /**
     * This warns rather than refuses, so a save can hold three resters — and
     * naming the first of them read as a rule broken once when it had been
     * broken twice (#151).
     */
    it('names everybody already resting, not the first of them', () => {
      const crowded: Campaign = {
        ...community({ [EARL]: { task: 'rest' } }),
        survivors: [
          ...community().survivors,
          { ...createSurvivor('Nell Haig', 2, { id: 'nell' }), currentHp: 1 },
        ],
      };

      const check = checkAssignment(
        { ...crowded, assignments: { [EARL]: { task: 'rest' }, nell: { task: 'rest' } } },
        CARLA,
        { task: 'rest' },
      );

      expect(codes(check.warnings)).toEqual(['someone-else-resting']);
      expect(check.warnings[0]?.message).toContain('Earl Rhodes and Nell Haig are');
    });

    it('does not count the survivor’s own rest against them', () => {
      // Re-checking somebody already resting must not tell them they cannot.
      expect(
        checkAssignment(community({ [CARLA]: { task: 'rest' } }), CARLA, { task: 'rest' }).warnings,
      ).toEqual([]);
    });

    it('counts who is resting, not who is busy', () => {
      // Earl is on the project team, which is not resting. A check that
      // answered "is anybody else assigned to anything" would warn here.
      expect(
        checkAssignment(community({ [EARL]: { task: 'project' } }), CARLA, { task: 'rest' })
          .warnings,
      ).toEqual([]);
    });
  });

  describe('healing', () => {
    const clinic = (): Base =>
      home({ garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } });

    it('warns when the base has no Medical Clinic', () => {
      expect(
        codes(checkAssignment(community({}, home()), CARLA, { task: 'healing' }).warnings),
      ).toEqual(['no-medical-clinic']);
    });

    it('warns rather than breaking when there is no base at all', () => {
      // A community with nowhere to live has no Clinic either, and the check
      // has to say so rather than go looking through a base that is not there.
      expect(codes(checkAssignment(community(), CARLA, { task: 'healing' }).warnings)).toEqual([
        'no-medical-clinic',
      ]);
    });

    it('says nothing once there is one', () => {
      expect(checkAssignment(community({}, clinic()), CARLA, { task: 'healing' }).warnings).toEqual(
        [],
      );
    });

    it('warns about full Health as well, and both at once', () => {
      expect(
        codes(checkAssignment(community({}, home()), EARL, { task: 'healing' }).warnings),
      ).toEqual(['already-at-full-health', 'no-medical-clinic']);
    });

    it('lets any number be healed, unlike resting', () => {
      const check = checkAssignment(community({ [EARL]: { task: 'healing' } }, clinic()), CARLA, {
        task: 'healing',
      });

      expect(check.warnings).toEqual([]);
    });
  });

  describe('the mission team', () => {
    it('warns about an injured survivor', () => {
      expect(
        codes(checkAssignment(community(), CARLA, { task: 'mission', team: 1 }).warnings),
      ).toEqual(['injured-on-a-mission']);
    });

    it('says nothing about one at full Health', () => {
      expect(checkAssignment(community(), EARL, { task: 'mission', team: 1 }).warnings).toEqual([]);
    });
  });

  describe('scavenging', () => {
    it('always says it needs the mission skipped, which this app cannot know', () => {
      expect(codes(checkAssignment(community(), EARL, { task: 'scavenging' }).warnings)).toEqual([
        'scavenging-needs-the-mission-skipped',
      ]);
    });

    it('warns when somebody else is already going, and names them', () => {
      const check = checkAssignment(community({ [EARL]: { task: 'scavenging' } }), CARLA, {
        task: 'scavenging',
      });

      expect(codes(check.warnings)).toEqual([
        'someone-else-scavenging',
        'scavenging-needs-the-mission-skipped',
      ]);
      expect(check.warnings[0]?.message).toContain('Earl Rhodes');
    });

    it('counts who is scavenging, not who is busy', () => {
      expect(
        codes(
          checkAssignment(community({ [EARL]: { task: 'project' } }), CARLA, { task: 'scavenging' })
            .warnings,
        ),
      ).toEqual(['scavenging-needs-the-mission-skipped']);
    });
  });
});

/**
 * pg. 7: only one Hero may be on any single mission. No violation code existed
 * for it, and the playtest put two Tier 4s on one team in silence.
 *
 * Per *team*, not per community — the base's Hero cap (`maxHeroes`) is a
 * different rule, correctly implemented elsewhere, and splitting two Heroes
 * across two teams is legal.
 */
describe('a second Hero on one mission', () => {
  const hero = (id: string, name: string): Survivor => createSurvivor(name, 4, { id });

  const codes = (campaign: Campaign, survivor: string, team: number) =>
    checkAssignment(campaign, survivor, { task: 'mission', team }).warnings.map(
      (warning) => warning.code,
    );

  const withTeam = (assignments: Record<string, Assignment>): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [
      hero('earl', 'Earl Rhodes'),
      hero('nell', 'Nell Haig'),
      createSurvivor('Ruby Vance', 1, { id: 'ruby' }),
    ],
    assignments,
  });

  it('warns, naming the Hero already going', () => {
    const campaign = withTeam({ nell: { task: 'mission', team: 1 } });

    expect(codes(campaign, 'earl', 1)).toContain('a-second-hero-on-one-mission');
    expect(
      checkAssignment(campaign, 'earl', { task: 'mission', team: 1 }).warnings.map(
        (warning) => warning.message,
      ),
    ).toContain('Only one Hero may go on a mission, and Nell Haig is.');
  });

  it('says nothing about two Heroes on two different teams', () => {
    const campaign = withTeam({ nell: { task: 'mission', team: 2 } });

    expect(codes(campaign, 'earl', 1)).not.toContain('a-second-hero-on-one-mission');
  });

  it('says nothing about a Hero going with somebody who is not one', () => {
    const campaign = withTeam({ ruby: { task: 'mission', team: 1 } });

    expect(codes(campaign, 'earl', 1)).not.toContain('a-second-hero-on-one-mission');
  });

  /** The Hero already on the team is not their own second Hero. */
  it('says nothing about the Hero who is already on it', () => {
    const campaign = withTeam({ earl: { task: 'mission', team: 1 } });

    expect(codes(campaign, 'earl', 1)).not.toContain('a-second-hero-on-one-mission');
  });

  it('warns and refuses nothing, like the rest of this phase', () => {
    const campaign = withTeam({ nell: { task: 'mission', team: 1 } });

    expect(checkAssignment(campaign, 'earl', { task: 'mission', team: 1 }).blockers).toEqual([]);
  });
});
