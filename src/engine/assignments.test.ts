import { describe, expect, it } from 'vitest';
import { NO_PENALTY } from './production';
import {
  createNewCampaign,
  type Assignment,
  type Base,
  type Campaign,
  type Survivor,
} from './campaign';
import { createSurvivor } from './survivor';
import { flatUtilitiesGenerated, occupants } from './base';
import { facilityProduction } from './production';
import {
  laborPool,
  projectTeam,
  sameTask,
  staffOf,
  staffedFacilityCount,
  survivorsDoing,
  taskOf,
  utilitiesScore,
  assignedTo,
} from './assignments';
import { generatingUtilities, utilityWorker } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };

const EARL = 'earl';
const CARLA = 'carla';
const RUBY = 'ruby';

/** A community of three, at Tiers 4, 2 and 1 — so 4, 2 and 1 Labor. */
function community(
  assignments: Record<string, Assignment> = {},
  base: Base | null = null,
): Campaign {
  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    survivors: [
      createSurvivor('Earl Rhodes', 4, { id: EARL }),
      createSurvivor('Carla Proust', 2, { id: CARLA }),
      createSurvivor('Ruby Vance', 1, { id: RUBY }),
    ],
    assignments,
    base,
  };
}

const farm = (slots: Base['slots'] = {}): Base => ({ id: 'hobby-farm', slots });

describe('sameTask', () => {
  it('tells two slots apart, because working them is two jobs', () => {
    expect(sameTask({ task: 'staff', slot: 'kitchen' }, { task: 'staff', slot: 'kitchen' })).toBe(
      true,
    );
    expect(sameTask({ task: 'staff', slot: 'kitchen' }, { task: 'staff', slot: 'garden' })).toBe(
      false,
    );
  });

  it('settles the tagless tasks on the tag alone', () => {
    expect(sameTask({ task: 'project' }, { task: 'project' })).toBe(true);
    expect(sameTask({ task: 'rest' }, { task: 'healing' })).toBe(false);
  });

  /**
   * Two survivors on the same mission team and two on different ones are all
   * doing the same *job* — the number says which team, not which task, and a
   * comparison that split on it would offer a checkbox per team.
   */
  it('ignores which mission team it is', () => {
    expect(sameTask({ task: 'mission', team: 1 }, { task: 'mission', team: 2 })).toBe(true);
  });

  it('never matches across tasks, whatever they carry', () => {
    expect(sameTask({ task: 'staff', slot: 'kitchen' }, { task: 'project' })).toBe(false);
    expect(sameTask({ task: 'scavenging' }, { task: 'mission', team: 1 })).toBe(false);
  });
});

describe('taskOf and survivorsDoing', () => {
  it('answers with the task, or with nothing', () => {
    const campaign = community({ [EARL]: { task: 'rest' } });

    expect(taskOf(campaign, EARL)).toEqual({ task: 'rest' });
    expect(taskOf(campaign, CARLA)).toBeUndefined();
  });

  it('lists in roster order rather than assignment order', () => {
    // Ruby was assigned first and is last on the roster; a list that followed
    // the record's insertion order would reshuffle as tasks changed.
    const campaign = community({
      [RUBY]: { task: 'project' },
      [EARL]: { task: 'project' },
    });

    expect(projectTeam(campaign).map((survivor) => survivor.name)).toEqual([
      'Earl Rhodes',
      'Ruby Vance',
    ]);
  });

  it('leaves out everybody with no task at all', () => {
    const campaign = community({ [CARLA]: { task: 'rest' } });

    expect(survivorsDoing(campaign, () => true).map((one) => one.id)).toEqual([CARLA]);
  });
});

describe('staffOf', () => {
  it('gives the slot its own staff and nobody else’s', () => {
    const campaign = community(
      {
        [EARL]: { task: 'staff', slot: 'kitchen' },
        [CARLA]: { task: 'staff', slot: 'utility-station' },
        [RUBY]: { task: 'staff', slot: 'kitchen' },
      },
      farm(),
    );

    // A Kitchen takes one (pg. 54) and no upgrade here widens it, so Ruby is
    // assigned and not working. `assignedTo` is what a screen reports with.
    expect(staffOf(campaign, 'kitchen').map((one) => one.id)).toEqual([EARL]);
    expect(assignedTo(campaign, 'kitchen').map((one) => one.id)).toEqual([EARL, RUBY]);
    expect(staffOf(campaign, 'utility-station').map((one) => one.id)).toEqual([CARLA]);
    expect(staffOf(campaign, 'front-yard')).toEqual([]);
  });

  /** No base, no facility, and so nobody working one. */
  it('is nobody before a base is claimed', () => {
    expect(staffOf(community({ [EARL]: { task: 'staff', slot: 'kitchen' } }), 'kitchen')).toEqual(
      [],
    );
  });

  /**
   * pg. 54: a staffed facility takes one survivor unless an upgrade widens it.
   * Nothing read `extraStaff` until the September playtest put three on a bare
   * Medical Clinic and got five Health out of it.
   */
  it('takes nobody at all for a facility that is not staffed', () => {
    const campaign = community({ [EARL]: { task: 'staff', slot: 'bunk-room-1' } }, farm());

    expect(staffOf(campaign, 'bunk-room-1')).toEqual([]);
    expect(assignedTo(campaign, 'bunk-room-1').map((one) => one.id)).toEqual([EARL]);
  });
});

describe('laborPool', () => {
  it('sums the Tier levels of the project team, and nothing else', () => {
    // Earl is 4 Labor and Ruby 1; Carla is resting and contributes nothing.
    const campaign = community({
      [EARL]: { task: 'project' },
      [CARLA]: { task: 'rest' },
      [RUBY]: { task: 'project' },
    });

    expect(laborPool(campaign)).toBe(5);
  });

  it('is zero at the top of a turn, when nobody is assigned', () => {
    expect(laborPool(community())).toBe(0);
  });

  it('counts a Tier 4 as four and a Tier 1 as one, rather than heads', () => {
    // The difference between summing Tiers and counting the team, which two
    // survivors of the same Tier would hide.
    expect(laborPool(community({ [EARL]: { task: 'project' } }))).toBe(4);
    expect(laborPool(community({ [RUBY]: { task: 'project' } }))).toBe(1);
  });
});

describe('staffedFacilityCount', () => {
  it('counts slots rather than survivors', () => {
    // Two people in the Kitchen is one staffed facility. Siege Threat counts
    // facilities (pg. 23), and counting heads would charge double for a Med Lab.
    const campaign = community(
      { [EARL]: { task: 'staff', slot: 'kitchen' }, [CARLA]: { task: 'staff', slot: 'kitchen' } },
      farm(),
    );

    expect(staffedFacilityCount(campaign)).toBe(1);
  });

  it('counts each staffed slot once, across several', () => {
    const campaign = community(
      {
        [EARL]: { task: 'staff', slot: 'kitchen' },
        [CARLA]: { task: 'staff', slot: 'utility-station' },
      },
      farm(),
    );

    expect(staffedFacilityCount(campaign)).toBe(2);
  });

  /**
   * The Garden's Food is a flat effect with no skill named, so it is
   * `staffed: false` and a survivor put in one is an assignment the rules do
   * not contemplate (pg. 54). It counted anyway until capacity had a reader —
   * so staffing a Bunk Room did nothing *and* cost a point of Siege Threat.
   */
  it('does not count a facility that takes no staff', () => {
    const campaign = community({ [CARLA]: { task: 'staff', slot: 'garden' } }, farm());

    expect(staffedFacilityCount(campaign)).toBe(0);
  });

  it('ignores an assignment to a slot with nothing built in it', () => {
    // A house rule rather than a damaged save — `saveFile.ts` accepts it on
    // purpose — and a Siege Threat that counted it would charge a community for
    // a facility it does not have.
    const campaign = community({ [EARL]: { task: 'staff', slot: 'front-yard' } }, farm());

    expect(staffedFacilityCount(campaign)).toBe(0);
  });

  it('is zero for a campaign with no base', () => {
    expect(staffedFacilityCount(community({ [EARL]: { task: 'staff', slot: 'kitchen' } }))).toBe(0);
  });
});

describe('utilitiesScore', () => {
  it('is the Utilities Score of whoever works a Station', () => {
    const campaign = generatingUtilities(community({}, farm()), 3, 'utility-station');

    expect(utilitiesScore(campaign)).toBe(3);
  });

  /**
   * A Utility Station takes one survivor and has no upgrade that widens it
   * (pg. 54, 72–73), so a second is assigned and not working. This asserted the
   * sum of both until capacity had a reader.
   */
  it('counts only the one a Station takes, whoever else is assigned', () => {
    const one = utilityWorker(2);
    const two = { ...utilityWorker(1), id: 'second' };

    const campaign: Campaign = {
      ...community({}, farm()),
      survivors: [one, two],
      assignments: {
        [one.id]: { task: 'staff', slot: 'utility-station' },
        [two.id]: { task: 'staff', slot: 'utility-station' },
      },
    };

    expect(utilitiesScore(campaign)).toBe(2);
  });

  it('is zero with nobody in the Station', () => {
    // The state nine of the ten bases start every turn in, and the reason
    // nothing can be assigned until somebody is put to work.
    expect(utilitiesScore(community({}, farm()))).toBe(0);
  });

  it('is zero for somebody in the Station with no Cooperation', () => {
    expect(utilitiesScore(generatingUtilities(community({}, farm()), 0, 'utility-station'))).toBe(
      0,
    );
  });

  it('ignores staff on a facility that makes something else', () => {
    // A Kitchen's staff make Food, which is not a utility and cannot be
    // assigned as one.
    //
    // **The cook has to be able to cook.** The first version of this put a
    // Utilities worker in the Kitchen, where their Rationing Score is nothing
    // at all — so the line it produced was zero, and a rule that wrongly added
    // it would have added nothing. Three mutants lived in that gap. A Score of
    // 3 is a number the assertion can see going missing.
    const cook: Survivor = {
      ...utilityWorker(3),
      id: 'cook',
      name: 'Cook',
      skills: { rationing: 0 },
    };

    const campaign: Campaign = {
      ...community({}, farm()),
      survivors: [cook],
      assignments: { cook: { task: 'staff', slot: 'kitchen' } },
    };

    // The Kitchen genuinely makes something with them in it, and none of it is
    // a utility.
    expect(
      facilityProduction(
        occupants(farm()).find((one) => one.slotId === 'kitchen') as never,
        [cook],
        NO_PENALTY,
      ),
    ).not.toEqual([]);
    expect(utilitiesScore(campaign)).toBe(0);
  });

  /**
   * The two halves of the pool must not both claim the same points.
   *
   * The Distillery's built-in Station produces a flat 2 Water whether or not
   * anybody works it (pg. 61), and that half is `flatUtilitiesGenerated`'s.
   * Counting it here would let a base spend it twice.
   */
  it('leaves the flat half of the pool to the flat half of the pool', () => {
    const campaign = community({}, { id: 'distillery', slots: {} });

    expect(utilitiesScore(campaign)).toBe(0);
    expect(flatUtilitiesGenerated(campaign.base as Base).water).toBe(2);
  });

  it('is zero for a campaign with no base', () => {
    expect(utilitiesScore(community())).toBe(0);
  });
});
