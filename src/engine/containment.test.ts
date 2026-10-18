import { describe, expect, it } from 'vitest';
import type { UpgradeId } from '../data/facilities';
import { submitHealing } from './advancementForms';
import { createNewCampaign, type Base, type Campaign, type Survivor } from './campaign';
import { awardKey, containmentDraws, healthAwards, woundsHealed } from './healing';
import type { LogEntry } from './log';
import { outstanding } from './outstanding';
import { createSurvivor } from './survivor';
import { checkUpgrade, upgradeOrder } from './upgrade';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

/** A Medical Clinic in the Garage, with these upgrades. */
const clinic = (upgrades: readonly UpgradeId[] = []): Base => ({
  id: 'small-town-home',
  slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 }, upgrades } },
});

/** An Experimental Data that investigated `investigated` points of interest. */
const experimented = (investigated: number, brokenCage = false): LogEntry => ({
  turn: 2,
  phase: 'mission',
  at: AT,
  event: {
    kind: 'mission-played',
    team: 1,
    mission: 'experimental-data',
    viral: { investigated, brokenCage },
  },
});

describe('building Containment (pp. 72, 104; R122, R144)', () => {
  /** Turn 4's Planning Phase in a Viral campaign, with a project team and Hardware to spare. */
  const planning = (log: readonly LogEntry[]): Campaign =>
    withPlanningBegun({
      ...createNewCampaign('Cedar Hollow', FIXED),
      origin: 'viral',
      materials: { food: 0, fuel: 0, hardware: 20 },
      ...projectTeamWorth(9),
      turn: 4,
      base: clinic(),
      log,
    });
  const request = { slot: 'garage', upgrade: 'containment' } as const;
  const warned = (campaign: Campaign) =>
    checkUpgrade(campaign, request).warnings.map((warning) => warning.code);

  it('is warned about until Experimental Data has unlocked it', () => {
    expect(warned(planning([]))).toContain('mission-locked');
    expect(warned(planning([experimented(0)]))).toContain('mission-locked');
    expect(warned(planning([experimented(2)]))).not.toContain('mission-locked');
  });

  it('costs its Hardware changed by the unlock, never below nothing', () => {
    const hardware = (log: readonly LogEntry[]) => upgradeOrder(planning(log), request).cost;

    expect(hardware([])).toEqual({ hardware: 4, labor: 2 });
    expect(hardware([experimented(1)])).toEqual({ hardware: 6, labor: 2 });
    expect(hardware([experimented(1, true)])).toEqual({ hardware: 4, labor: 2 });
    expect(hardware([experimented(3, true)])).toEqual({ hardware: 2, labor: 2 });
  });

  it('leaves every other upgrade at its own price', () => {
    expect(
      upgradeOrder(planning([experimented(1)]), { slot: 'garage', upgrade: 'restraints' }).cost,
    ).toEqual({ hardware: 1, labor: 1 });
  });
});

describe('Containment’s Infection at Heal Wounds (pg. 69; R103, R148)', () => {
  const earl = (overrides: Partial<Survivor> = {}): Survivor => ({
    ...createSurvivor('Earl Rhodes', 3, { id: 'earl' }),
    infection: 3,
    ...overrides,
  });
  const carla = (overrides: Partial<Survivor> = {}): Survivor => ({
    ...createSurvivor('Carla Proust', 2, { id: 'carla' }),
    infection: 1,
    ...overrides,
  });

  /** Turn 3's Heal Wounds with two zombies held, Earl and Carla assigned to healing. */
  const healing = (overrides: Partial<Campaign> = {}): Campaign => ({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'heal-wounds',
    origin: 'viral',
    base: clinic(['containment']),
    survivors: [earl(), carla()],
    assignments: { earl: { task: 'healing' }, carla: { task: 'healing' } },
    heldZombies: 2,
    ...overrides,
  });

  const drawn = (campaign: Campaign) =>
    containmentDraws(campaign, healthAwards(campaign)).map(({ survivor, infection }) => [
      survivor.id,
      infection,
    ]);

  it('takes 1 for each zombie held, never more than they carry', () => {
    expect(drawn(healing())).toEqual([
      ['earl', 2],
      ['carla', 1],
    ]);
    expect(drawn(healing({ heldZombies: 0 }))).toEqual([]);
    expect(drawn(healing({ survivors: [earl({ infection: 0 }), carla()] }))).toEqual([
      ['carla', 1],
    ]);
  });

  it('reaches only those being healed, and not somebody given an Inoculation (R148)', () => {
    expect(
      drawn(
        healing({
          assignments: { earl: { task: 'healing', inoculation: 'shot' }, carla: { task: 'rest' } },
        }),
      ),
    ).toEqual([]);
  });

  it('is applied and logged by the Heal Wounds press, which then counts as done', () => {
    const before = healing();

    expect(woundsHealed(before)).toBe(false);
    expect(outstanding(before).map((one) => one.says)).toContain(
      'This turn’s Health hasn’t been handed out.',
    );

    const result = submitHealing(before, {}, AT);
    if (!result.ok) throw new Error(result.problem);
    const after = result.campaign;

    expect(after.survivors.map((survivor) => survivor.infection)).toEqual([1, 0]);
    expect(
      after.log
        .filter((entry) => entry.event.kind === 'infection-contained')
        .map((entry) => entry.event),
    ).toEqual([
      { kind: 'infection-contained', survivor: 'earl', name: 'Earl Rhodes', infection: 2 },
      { kind: 'infection-contained', survivor: 'carla', name: 'Carla Proust', infection: 1 },
    ]);
    expect(woundsHealed(after)).toBe(true);
    expect(outstanding(after).map((one) => one.says)).not.toContain(
      'This turn’s Health hasn’t been handed out.',
    );
    expect(submitHealing(after, {}, AT)).toEqual({
      ok: false,
      problem: 'This turn’s Health has already been shared out.',
    });
  });

  it('takes what the healing points left, after they are split', () => {
    // The Recovery Room's 2 Health go to Earl alone, both spent on Infection.
    const campaign = healing({
      base: clinic(['recovery-room', 'containment']),
      survivors: [earl({ currentHp: 1 })],
      assignments: { earl: { task: 'healing' } },
    });
    const awards = healthAwards(campaign);
    const result = submitHealing(
      campaign,
      Object.fromEntries(awards.map((award) => [awardKey(award), award.health])),
      AT,
    );
    if (!result.ok) throw new Error(result.problem);

    expect(awards.map((award) => award.health)).toEqual([2]);
    // 3 Infection, 2 off by the points, then 1 of Containment's 2.
    expect(result.campaign.survivors[0]?.infection).toBe(0);
    expect(result.campaign.log.at(-1)?.event).toEqual({
      kind: 'infection-contained',
      survivor: 'earl',
      name: 'Earl Rhodes',
      infection: 1,
    });
  });

  it('owes nothing with nobody to heal and nothing to draw', () => {
    expect(outstanding(healing({ heldZombies: 0 })).map((one) => one.says)).not.toContain(
      'This turn’s Health hasn’t been handed out.',
    );
  });
});
