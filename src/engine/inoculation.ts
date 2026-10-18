/**
 * Inoculation and Rot Resistant, under the Viral origin (pp. 42, 48, 140;
 * R96, R97, R143; Z7-5).
 *
 * ## Chosen in Planning, given at Heal Wounds
 *
 * An Inoculation is built at a Medical Clinic like any item (pg. 42). In the
 * Planning Phase's Rest and Healing step, a survivor assigned to healing may
 * be given one from the base's Inventory instead of their healing (R97), and a
 * survivor at full Health may be assigned for it (R143). The assignment
 * carries the item, so `beforePlanning` reads it back next turn as it reads
 * every assignment. At that turn's Heal Wounds the survivor takes no share of
 * the Clinic's healing (`beingHealed`), and the Inoculation is given: the item
 * is used up and they are Rot Resistant from then on.
 *
 * ## One Infection off at the start of every Advancement Phase
 *
 * Rot Resistant takes 1 Infection off each turn, before Character Advancement
 * (R96), so Heal Wounds sees the lower count. A press at Character
 * Advancement does it for everybody at once, an entry each, and the step owes
 * it until it is done. A survivor inoculated at this turn's Heal Wounds is
 * first reached next turn, the Advancement Phase having started already.
 *
 * Pure, like the rest of `src/engine`.
 */

import { beforePlanning } from './assignments';
import type { Campaign, Item, Survivor } from './campaign';
import { logged } from './log';
import { phaseOf } from './turn';
import { suppliedOccupants } from './utilities';

/** The equipment an Inoculation is (pg. 42). */
const INOCULATION = 'inoculation';

/** The Inoculations in the base's Inventory. */
export function inoculationsHeld(campaign: Campaign): readonly Item[] {
  return campaign.inventory.filter((item) => item.item === INOCULATION);
}

/** The Inoculation a survivor's healing assignment carries, or `undefined`. */
export function inoculationFor(campaign: Campaign, survivorId: string): string | undefined {
  const assignment = campaign.assignments[survivorId];

  return assignment?.task === 'healing' ? assignment.inoculation : undefined;
}

/**
 * Why this Inoculation cannot be chosen for this survivor now, or `null`
 * (R97, R143): in the Planning Phase, for a survivor assigned to healing at a
 * base with a Medical Clinic, who is not Rot Resistant already, an
 * Inoculation in the base's Inventory that nobody else has been given. `null`
 * for an item takes one back.
 */
export function inoculationProblem(
  campaign: Campaign,
  survivorId: string,
  item: string | null,
): string | null {
  if (phaseOf(campaign.step) !== 'planning') return 'Choose Inoculations in the Planning Phase.';
  if (campaign.assignments[survivorId]?.task !== 'healing') {
    return 'Only a survivor assigned to healing is given an Inoculation.';
  }
  if (item === null) return null;

  const survivor = campaign.survivors.find((candidate) => candidate.id === survivorId);
  if (survivor?.rotResistant === true) return `${survivor.name} is Rot Resistant already.`;
  if (!suppliedOccupants(campaign).some(({ facility }) => facility.id === 'medical-clinic')) {
    return 'An Inoculation is given at a Medical Clinic, and this base has none.';
  }
  if (!inoculationsHeld(campaign).some((held) => held.id === item)) {
    return 'That isn’t an Inoculation in the base’s Inventory.';
  }

  const elsewhere = Object.entries(campaign.assignments).some(
    ([id, assignment]) =>
      id !== survivorId && assignment.task === 'healing' && assignment.inoculation === item,
  );

  return elsewhere ? 'That Inoculation is given to somebody else already.' : null;
}

/** The campaign with the Inoculation chosen, or taken back. Assumes the check passed. */
export function withInoculationChosen(
  campaign: Campaign,
  survivorId: string,
  item: string | null,
): Campaign {
  return {
    ...campaign,
    assignments: {
      ...campaign.assignments,
      [survivorId]: item === null ? { task: 'healing' } : { task: 'healing', inoculation: item },
    },
  };
}

/** Whether this survivor has been given their Inoculation this turn. */
function inoculatedThisTurn(campaign: Campaign, survivorId: string): boolean {
  return campaign.log.some(
    ({ turn, event }) =>
      turn === campaign.turn &&
      event.kind === 'survivor-inoculated' &&
      event.survivor === survivorId,
  );
}

/**
 * Who is owed an Inoculation at this turn's Heal Wounds, with the item: a
 * healing assignment from the last Planning Phase that carries one, for a
 * survivor still here and not given it yet (R97).
 */
export function inoculationsDue(
  campaign: Campaign,
): readonly { readonly survivor: Survivor; readonly item: string }[] {
  const assigned = beforePlanning(campaign).assignments;

  return campaign.survivors.flatMap((survivor) => {
    const assignment = assigned[survivor.id];
    if (assignment?.task !== 'healing' || assignment.inoculation === undefined) return [];
    if (inoculatedThisTurn(campaign, survivor.id)) return [];

    return [{ survivor, item: assignment.inoculation }];
  });
}

/**
 * Why this survivor cannot be given their Inoculation now, or `null`: in the
 * Advancement Phase, owed one, with the item still in the base's Inventory,
 * and not Rot Resistant already.
 */
export function inoculateProblem(campaign: Campaign, survivorId: string): string | null {
  if (phaseOf(campaign.step) !== 'advancement') {
    return 'An Inoculation is given in the Advancement Phase.';
  }

  const due = inoculationsDue(campaign).find((one) => one.survivor.id === survivorId);
  if (due === undefined) return 'Nobody by that name is owed an Inoculation this turn.';
  if (due.survivor.rotResistant) return `${due.survivor.name} is Rot Resistant already.`;
  if (!inoculationsHeld(campaign).some((held) => held.id === due.item)) {
    return 'The Inoculation chosen for them is no longer in the base’s Inventory.';
  }

  return null;
}

/**
 * The campaign with the survivor given their Inoculation: the item used up,
 * the survivor Rot Resistant, and an entry saying so. Assumes the check
 * passed.
 */
export function withInoculated(campaign: Campaign, survivorId: string, at: string): Campaign {
  const due = inoculationsDue(campaign).find((one) => one.survivor.id === survivorId) as {
    readonly survivor: Survivor;
    readonly item: string;
  };

  return logged(
    {
      ...campaign,
      inventory: campaign.inventory.filter((held) => held.id !== due.item),
      survivors: campaign.survivors.map((survivor) =>
        survivor.id === survivorId ? { ...survivor, rotResistant: true } : survivor,
      ),
    },
    at,
    {
      kind: 'survivor-inoculated',
      survivor: due.survivor.id,
      name: due.survivor.name,
      item: due.item,
    },
  );
}

/** Whether Rot Resistant has worked this turn. */
function resistedThisTurn(campaign: Campaign): boolean {
  return campaign.log.some(
    ({ turn, event }) => turn === campaign.turn && event.kind === 'infection-resisted',
  );
}

/**
 * Who Rot Resistant takes 1 Infection off this turn (pg. 140; R96): everybody
 * Rot Resistant who carries any, in a Viral campaign, until it has worked
 * this turn.
 */
export function rotResistanceDue(campaign: Campaign): readonly Survivor[] {
  if (campaign.origin !== 'viral' || resistedThisTurn(campaign)) return [];

  return campaign.survivors.filter((survivor) => survivor.rotResistant && survivor.infection > 0);
}

/** Why Rot Resistant cannot work now, or `null`: in the Advancement Phase, for somebody. */
export function rotResistanceProblem(campaign: Campaign): string | null {
  if (phaseOf(campaign.step) !== 'advancement') {
    return 'Rot Resistant works in the Advancement Phase.';
  }

  return rotResistanceDue(campaign).length === 0
    ? 'Nobody Rot Resistant has Infection to lose this turn.'
    : null;
}

/** The campaign with 1 Infection off everybody due, an entry each. Assumes the check passed. */
export function withRotResisted(campaign: Campaign, at: string): Campaign {
  const due = rotResistanceDue(campaign);
  const ids = new Set(due.map((survivor) => survivor.id));
  const resisted: Campaign = {
    ...campaign,
    survivors: campaign.survivors.map((survivor) =>
      ids.has(survivor.id) ? { ...survivor, infection: survivor.infection - 1 } : survivor,
    ),
  };

  return due.reduce(
    (current: Campaign, survivor) =>
      logged(current, at, {
        kind: 'infection-resisted',
        survivor: survivor.id,
        name: survivor.name,
      }),
    resisted,
  );
}
