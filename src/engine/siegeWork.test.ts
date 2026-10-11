import { describe, expect, it } from 'vitest';
import { createNewCampaign, type Assignment, type Campaign, type Survivor } from './campaign';
import type { LogEntry } from './log';
import { createSurvivor } from './survivor';
import {
  fellInTheSiege,
  projectTeamThatWorked,
  siegeDefended,
  standInCandidates,
  standInProblem,
  standIns,
  whoWorked,
} from './siegeWork';
import { baseProduction } from './materials';
import { healingPool } from './healing';
import { deployed } from './siege';
import { projectTeam } from './assignments';
import { withPlanningBegun } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-09-12T09:00:00.000Z';

const COOK = 'cook';
const MEDIC = 'medic';
const MASON = 'mason';
const SCOUT = 'scout';

/** A Cooperation 3 survivor with this skill at level 0, so a Score of 3. */
function skilled(name: string, id: string, skill: 'rationing' | 'medicine'): Survivor {
  return {
    ...createSurvivor(name, 4, { id }),
    stats: { strength: 0, dexterity: 0, intelligence: 0, cooperation: 3 },
    skills: { [skill]: 0 },
  };
}

/** Turn 3's check called a siege, so turn 4's mission is the Siege Defense. */
const called: LogEntry = {
  turn: 3,
  phase: 'management',
  at: AT,
  event: { kind: 'horde-checked', roll: 9, threat: 8, siege: true },
};

/** Turn 4's Siege Defense, recorded. */
const defended: LogEntry = {
  turn: 4,
  phase: 'mission',
  at: AT,
  event: { kind: 'siege-defense-resolved', zombiesLeft: 1, survivorsExited: 0 },
};

/**
 * Turn 4, a siege turn, with turn 3's Planning Phase still standing: a cook in
 * the Hobby Farm's Kitchen, a medic in a Clinic in the front yard, a Tier 4 on
 * the project team, and a Tier 1 on the mission team the siege displaced.
 */
function besieged(log: readonly LogEntry[] = [called, defended], hurt: readonly string[] = []) {
  const survivors: Survivor[] = [
    skilled('Nell Haig', COOK, 'rationing'),
    skilled('Ada Ferro', MEDIC, 'medicine'),
    createSurvivor('Earl Rhodes', 4, { id: MASON }),
    createSurvivor('Ruby Vance', 1, { id: SCOUT }),
  ].map((survivor) => (hurt.includes(survivor.id) ? { ...survivor, currentHp: 0 } : survivor));

  const assignments: Record<string, Assignment> = {
    [COOK]: { task: 'staff', slot: 'kitchen' },
    [MEDIC]: { task: 'staff', slot: 'front-yard' },
    [MASON]: { task: 'project' },
    [SCOUT]: { task: 'mission', team: 1 },
  };

  return {
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 4,
    step: 'tactical-mission',
    survivors,
    assignments,
    base: {
      id: 'hobby-farm',
      slots: { 'front-yard': { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
    },
    log,
  } satisfies Campaign;
}

const ids = (survivors: readonly Survivor[]) => survivors.map((survivor) => survivor.id);

describe('siegeDefended', () => {
  it('is whether this turn’s Siege Defense outcome is on the record', () => {
    expect(siegeDefended(besieged())).toBe(true);
    expect(siegeDefended(besieged([called]))).toBe(false);
    expect(siegeDefended({ ...besieged(), turn: 5 })).toBe(false);
  });

  it('is not a Thin the Herd, which is not fought at the base', () => {
    const thinned: LogEntry = {
      ...defended,
      event: {
        kind: 'thin-the-herd-resolved',
        startingZombies: 6,
        zombiesLeft: 0,
        survivorsExited: 1,
        allIncapacitated: false,
      },
    };

    expect(siegeDefended(besieged([thinned]))).toBe(false);
  });
});

describe('fellInTheSiege', () => {
  it('is everybody put to work who is at 0 Health once the siege is recorded', () => {
    expect(ids(fellInTheSiege(besieged(undefined, [COOK, MASON])))).toEqual([COOK, MASON]);
  });

  it('is nobody before the outcome is recorded, whatever their Health', () => {
    expect(fellInTheSiege(besieged([called], [COOK, MASON]))).toEqual([]);
  });

  /**
   * The mission team was not working anything, and a survivor resting or being
   * healed has no post to leave — so neither is a casualty of the work.
   */
  it('is not somebody who had no work to fall from', () => {
    expect(fellInTheSiege(besieged(undefined, [SCOUT]))).toEqual([]);
  });

  /**
   * The work the siege interrupts is the previous Planning Phase's, and this
   * turn's Planning clears it (pg. 20). Stepping back into the Advancement
   * Phase must still see who fell from it.
   */
  it('reads the previous Planning Phase’s work once this turn’s has begun', () => {
    const planned = withPlanningBegun({
      ...besieged(undefined, [COOK]),
      assignments: {},
    });
    const cleared: Campaign = {
      ...planned,
      log: planned.log.map((entry) =>
        entry.event.kind === 'planning-began'
          ? { ...entry, event: { kind: 'planning-began', cleared: besieged().assignments } }
          : entry,
      ),
    };

    expect(ids(fellInTheSiege(cleared))).toEqual([COOK]);
  });
});

describe('whoWorked', () => {
  it('takes the siege’s casualties out of a list of workers', () => {
    const campaign = besieged(undefined, [COOK]);

    expect(ids(whoWorked(campaign, campaign.survivors))).toEqual([MEDIC, MASON, SCOUT]);
  });

  it('leaves the list alone on a turn without a recorded siege', () => {
    const campaign = besieged([], [COOK]);

    expect(whoWorked(campaign, campaign.survivors)).toEqual(campaign.survivors);
  });
});

describe('the base’s work on a siege turn', () => {
  /**
   * The Hobby Farm's Garden and its Fence make 2 Food with nobody in them, and
   * the Kitchen adds its cook's Rationing — 3, halved to 2 for want of Water.
   */
  it('keeps running through the siege', () => {
    expect(baseProduction(besieged()).food).toBe(4);
    expect(healingPool(besieged())).toBe(2);
  });

  it('loses the skills of a worker the siege left at 0 Health', () => {
    expect(baseProduction(besieged(undefined, [COOK])).food).toBe(2);
    expect(healingPool(besieged(undefined, [MEDIC]))).toBe(0);
  });

  it('loses nothing before the siege is recorded', () => {
    expect(baseProduction(besieged([called], [COOK])).food).toBe(4);
  });

  it('loses nothing on an ordinary turn, whatever a worker’s Health', () => {
    expect(baseProduction(besieged([], [COOK])).food).toBe(4);
  });

  /**
   * Everybody fought: the mission's XP is the whole community's, casualties
   * included (pg. 85, #167). Working is the question this answers, not
   * fighting.
   */
  it('leaves who fought the siege alone', () => {
    expect(deployed(besieged(undefined, [COOK, MASON]))).toHaveLength(4);
  });
});

describe('projectTeamThatWorked', () => {
  it('is the project team the previous Planning Phase assigned, less its casualties', () => {
    expect(ids(projectTeamThatWorked(besieged()))).toEqual([MASON]);
    expect(projectTeamThatWorked(besieged(undefined, [MASON]))).toEqual([]);
  });

  it('leaves the team on the campaign alone', () => {
    expect(ids(projectTeam(besieged(undefined, [MASON])))).toEqual([MASON]);
  });
});

/**
 * Because no ordinary mission went out, the mission team's fit survivors may
 * substitute for the siege's casualties (pg. 23, the FAQ; #183) — one each,
 * into the casualty's own place.
 */
describe('stand-ins', () => {
  const BAKER = 'baker';

  /** `besieged`, with a second cook on the mission team as well as the scout. */
  function withABaker(log?: readonly LogEntry[], hurt: readonly string[] = []): Campaign {
    const campaign = besieged(log, hurt);
    const baker = skilled('Iris Bell', BAKER, 'rationing');

    return {
      ...campaign,
      step: 'tactical-mission',
      survivors: [...campaign.survivors, hurt.includes(BAKER) ? { ...baker, currentHp: 0 } : baker],
      assignments: { ...campaign.assignments, [BAKER]: { task: 'mission', team: 1 } },
    };
  }

  const stoodIn = (place: string, by?: string): LogEntry => ({
    turn: 4,
    phase: 'mission',
    at: AT,
    event:
      by === undefined
        ? { kind: 'stood-in', survivor: place, name: place }
        : { kind: 'stood-in', survivor: place, name: place, by, byName: by },
  });

  const choosing = (campaign: Campaign, ...entries: readonly LogEntry[]): Campaign => ({
    ...campaign,
    log: [...campaign.log, ...entries],
  });

  describe('standInCandidates', () => {
    it('is the mission team the siege displaced, less anybody it left at 0 Health', () => {
      expect(ids(standInCandidates(withABaker()))).toEqual([SCOUT, BAKER]);
      expect(ids(standInCandidates(withABaker(undefined, [BAKER])))).toEqual([SCOUT]);
    });

    it('is nobody before the siege is recorded', () => {
      expect(standInCandidates(withABaker([called]))).toEqual([]);
    });
  });

  describe('standIns', () => {
    it('reads the latest choice for each place', () => {
      const campaign = choosing(
        withABaker(undefined, [COOK]),
        stoodIn(COOK, SCOUT),
        stoodIn(COOK, BAKER),
      );

      expect(standIns(campaign).get(COOK)?.id).toBe(BAKER);
    });

    it('lets a place be left empty again', () => {
      const campaign = choosing(withABaker(undefined, [COOK]), stoodIn(COOK, BAKER), stoodIn(COOK));

      expect(standIns(campaign).size).toBe(0);
    });

    /**
     * Checked against the campaign as it is now: a casualty whose Health is
     * corrected back up has no place to fill, and a stand-in who is hurt
     * cannot fill one.
     */
    it('drops a choice the roster no longer supports', () => {
      const chosen = choosing(withABaker(undefined, [COOK]), stoodIn(COOK, BAKER));

      // The cook's Health corrected back up: no place to fill.
      expect(standIns({ ...chosen, survivors: withABaker().survivors }).size).toBe(0);
      expect(
        standIns(choosing(withABaker(undefined, [COOK, BAKER]), stoodIn(COOK, BAKER))).size,
      ).toBe(0);
    });

    it('is only this turn’s', () => {
      const lastTurns = { ...stoodIn(COOK, BAKER), turn: 3 };

      expect(standIns(choosing(withABaker(undefined, [COOK]), lastTurns)).size).toBe(0);
    });

    it('gives one survivor one place, the first chosen', () => {
      const campaign = choosing(
        withABaker(undefined, [COOK, MASON]),
        stoodIn(COOK, BAKER),
        stoodIn(MASON, BAKER),
      );

      expect([...standIns(campaign).keys()]).toEqual([COOK]);
    });
  });

  describe('the work a stand-in does', () => {
    /** The Kitchen's 2 Food is back, from the baker's own Rationing. */
    it('puts their skills in the casualty’s facility', () => {
      const campaign = choosing(withABaker(undefined, [COOK]), stoodIn(COOK, BAKER));

      expect(baseProduction(campaign).food).toBe(4);
    });

    it('brings their own skills rather than the casualty’s', () => {
      // The scout has no Rationing, so the Kitchen makes nothing with them in it.
      const campaign = choosing(withABaker(undefined, [COOK]), stoodIn(COOK, SCOUT));

      expect(baseProduction(campaign).food).toBe(2);
    });

    it('puts their own Labor on the project team in the casualty’s place', () => {
      const campaign = choosing(withABaker(undefined, [MASON]), stoodIn(MASON, SCOUT));

      expect(ids(projectTeamThatWorked(campaign))).toEqual([SCOUT]);
    });

    it('takes their place only, so a facility nobody fell from is unchanged', () => {
      const campaign = choosing(withABaker(undefined, [MASON]), stoodIn(MASON, BAKER));

      expect(baseProduction(campaign).food).toBe(4);
      expect(ids(projectTeamThatWorked(campaign))).toEqual([BAKER]);
    });
  });

  describe('standInProblem', () => {
    const fallen = () => withABaker(undefined, [COOK, MASON]);

    it('accepts a fit mission-team survivor for a casualty', () => {
      expect(standInProblem(fallen(), COOK, BAKER)).toBeNull();
    });

    it('is in the Mission Phase only', () => {
      expect(standInProblem({ ...fallen(), step: 'heal-wounds' }, COOK, BAKER)).toMatch(
        /Mission Phase/,
      );
    });

    it('needs the siege recorded', () => {
      expect(standInProblem(withABaker([called], [COOK]), COOK, BAKER)).toMatch(/recorded/);
    });

    it('needs a casualty to stand in for', () => {
      expect(standInProblem(fallen(), MEDIC, BAKER)).toMatch(/took off their work/);
    });

    it('needs a fit survivor from the mission team', () => {
      expect(standInProblem(fallen(), COOK, MEDIC)).toMatch(/mission team/);
      expect(standInProblem(withABaker(undefined, [COOK, BAKER]), COOK, BAKER)).toMatch(
        /mission team/,
      );
    });

    it('fills one place per survivor', () => {
      const chosen = choosing(fallen(), stoodIn(MASON, BAKER));

      expect(standInProblem(chosen, COOK, BAKER)).toMatch(/somebody else/);
    });

    it('refuses a choice that changes nothing', () => {
      expect(standInProblem(fallen(), COOK, undefined)).toMatch(/Nobody is standing in/);
      expect(standInProblem(choosing(fallen(), stoodIn(COOK, BAKER)), COOK, BAKER)).toMatch(
        /already/,
      );
    });

    it('lets a choice be taken back or changed', () => {
      const chosen = choosing(fallen(), stoodIn(COOK, BAKER));

      expect(standInProblem(chosen, COOK, undefined)).toBeNull();
      expect(standInProblem(chosen, COOK, SCOUT)).toBeNull();
    });
  });
});
