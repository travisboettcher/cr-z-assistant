import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Base, type Campaign } from './campaign';
import { createSurvivor } from './survivor';
import { checkAssignment, planningHasBegun, unassigned, withPlanningReset } from './planning';
import type { LogEntry } from './log';

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

    it('warns when the facility wants a utility it has not got', () => {
      // A Storage Area wants nothing; its Refrigeration wants Power, and one
      // point covers the pair — so the upgrade's need is the slot's need.
      const unpowered = home({
        garage: {
          built: { facility: 'storage-area', builtOnTurn: 1 },
          upgrades: ['refrigeration'],
        },
      });

      expect(
        codes(
          checkAssignment(community({}, unpowered), EARL, { task: 'staff', slot: 'garage' })
            .warnings,
        ),
      ).toEqual(['utility-unmet']);

      const powered = home({
        garage: {
          built: { facility: 'storage-area', builtOnTurn: 1 },
          upgrades: ['refrigeration'],
          power: true,
        },
      });

      expect(
        checkAssignment(community({}, powered), EARL, { task: 'staff', slot: 'garage' }).warnings,
      ).toEqual([]);
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
      expect(check.warnings[0]?.message).toContain('Earl Rhodes');
    });

    it('does not count the survivor’s own rest against them', () => {
      // Re-checking somebody already resting must not tell them they cannot.
      expect(
        checkAssignment(community({ [CARLA]: { task: 'rest' } }), CARLA, { task: 'rest' }).warnings,
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
  });
});
