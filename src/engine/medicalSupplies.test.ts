import { describe, expect, it } from 'vitest';
import { projectTeamWorth, withPlanningBegun } from '../test/campaigns';
import { createNewCampaign, type Base, type Campaign } from './campaign';
import { submitItemBuilt } from './campaignForms';
import { buildCheck, type BuildOrder } from './making';
import { laborCommitted } from './projects';

const FIXED = { id: '11111111-2222-3333-4444-555555555555', createdAt: '2026-08-30T00:00:00.000Z' };
const AT = '2026-10-18T09:00:00.000Z';

/** A Medical Clinic in the Garage. */
const base: Base = {
  id: 'small-town-home',
  slots: { garage: { built: { facility: 'medical-clinic', builtOnTurn: 1 } } },
};

/** Turn 3 at Assign Project Team in a Viral campaign keeping `supplies` tokens. */
function planning(supplies: number, labor = 0): Campaign {
  const team = projectTeamWorth(labor);

  return withPlanningBegun({
    ...createNewCampaign('Cedar Hollow', FIXED),
    turn: 3,
    step: 'assign-project-team',
    origin: 'viral',
    base,
    materials: { food: 0, fuel: 0, hardware: 9 },
    medicalSupplies: supplies,
    survivors: team.survivors,
    assignments: team.assignments,
  });
}

const bandages = (supplies?: number): BuildOrder => ({
  id: 'roll',
  item: 'bandages',
  grade: 'standard',
  ...(supplies === undefined ? {} : { supplies }),
});

const refusal = (campaign: Campaign, order: BuildOrder) =>
  buildCheck(campaign, order).blockers.map((violation) => violation.message);

describe('Medical Supply tokens toward a build (pg. 107; R131)', () => {
  it('pay its Labor, 1 each, so no project team need pay it', () => {
    expect(refusal(planning(2), bandages())).toEqual([
      expect.stringMatching(/Labor/) as unknown as string,
    ]);
    expect(refusal(planning(2), bandages(1))).toEqual([]);

    const result = submitItemBuilt(planning(2), bandages(1), AT);
    if (!result.ok) throw new Error(result.problem);
    const after = result.campaign;

    expect(after.medicalSupplies).toBe(1);
    expect(after.inventory.map((item) => item.id)).toEqual(['roll']);
    expect(after.log.at(-1)?.event).toEqual({
      kind: 'item-built',
      id: 'roll',
      item: 'bandages',
      grade: 'standard',
      hardware: 2,
      labor: 0,
      supplies: 1,
    });
    expect(laborCommitted(after)).toBe(0);
  });

  it('records no tokens on a build that spent none', () => {
    const result = submitItemBuilt(planning(2, 4), bandages(0), AT);
    if (!result.ok) throw new Error(result.problem);

    expect(result.campaign.medicalSupplies).toBe(2);
    expect(result.campaign.log.at(-1)?.event).not.toHaveProperty('supplies');
    expect(laborCommitted(result.campaign)).toBe(1);
  });

  it('are refused beyond what the base keeps, the build’s Labor, or a whole number', () => {
    expect(refusal(planning(1, 4), bandages(2))).toEqual([
      'The base keeps 1 Medical Supply token.',
    ]);
    expect(refusal(planning(0, 4), bandages(1))).toEqual([
      'The base keeps 0 Medical Supply tokens.',
    ]);
    expect(refusal(planning(5, 4), bandages(2))).toEqual(['It takes only 1 Labor.']);
    expect(refusal(planning(5, 4), bandages(-1))).toEqual([
      'Spend a whole number of Medical Supply tokens.',
    ]);
    expect(refusal(planning(5, 4), bandages(0.5))).toEqual([
      'Spend a whole number of Medical Supply tokens.',
    ]);
  });

  it('pay only for the medical builds', () => {
    expect(
      refusal(planning(5, 4), { id: 'club', item: 'blunt', grade: 'standard', supplies: 1 }),
    ).toEqual([
      'Medical Supply tokens pay only for bandages, disinfectant, medicated wraps and inoculations.',
    ]);
  });
});
