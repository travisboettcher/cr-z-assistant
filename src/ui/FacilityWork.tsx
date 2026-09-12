/**
 * Who works this facility, and what it makes because of them.
 *
 * **Was a preview until Z3-5.** Phase 2 let a player pick somebody to see what
 * a facility *would* make and never wrote it down, because assigning a survivor
 * is Planning Step 1 and the rules that make it correct — one task each, the
 * pool it feeds — did not exist. They do now, so the picker is an assignment
 * and the numbers below it are what the base actually produces.
 *
 * Staffing and production sit in one region rather than two, because they are
 * one question. A player looking at a Medical Clinic wants to know what it
 * makes *and* that it makes nothing with nobody in it, and splitting those puts
 * the answer and the reason on different parts of the screen.
 */

import type { Occupant } from '../engine/base';
import type { Campaign } from '../engine/campaign';
import { staffOf } from '../engine/assignments';
import { hungerPenalty } from '../engine/feeding';
import { facilityProduction, wantsStaff, type ProducedOutput } from '../engine/production';
import { AssignTask } from './AssignTask';
import { STAT_LABELS } from './skillLabels';
import { MATERIAL_LABELS, UTILITY_LABELS } from './baseLabels';

export interface FacilityWorkProps {
  readonly campaign: Campaign;
  readonly occupant: Occupant;
}

const OUTPUT_LABELS: Record<ProducedOutput, string> = {
  ...MATERIAL_LABELS,
  health: 'Health',
  xp: 'XP',
  power: UTILITY_LABELS.power,
  water: UTILITY_LABELS.water,
  'siege-threat': 'Siege Threat',
};

export function FacilityWork({ campaign, occupant }: FacilityWorkProps) {
  const staff = staffOf(campaign, occupant.slotId);
  // What a facility makes moves with its staff's Skill Scores, and a starving
  // community's Scores are lower (pg. 22) — so the number on this card drops
  // the turn the stores run out, without anything being written down.
  const lines = facilityProduction(occupant, staff, hungerPenalty(campaign));

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      {/*
       * Only where somebody working it would change something. A Bunk Room
       * makes beds whoever is or is not in it, and offering to assign a
       * survivor to one would be offering to waste them.
       */}
      {wantsStaff(occupant) && (
        <AssignTask
          campaign={campaign}
          task={{ task: 'staff', slot: occupant.slotId }}
          legend="Working here"
          pages="72–73"
        />
      )}

      <p className="mt-3 text-sm font-medium">Produces</p>

      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Nothing this turn.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {lines.map((line, index) => (
            // Index-keyed because a facility can hold two lines that are equal
            // in every field — three Extra Beds produce nothing, but two Gas
            // Ranges each produce a Food, and neither has an identity of its
            // own to key on.
            <li key={index} className="text-sm text-stone-600 dark:text-stone-400">
              {line.amount >= 0 ? '+' : ''}
              {line.amount} {line.outputs.map((output) => OUTPUT_LABELS[output]).join(' or ')}
              {line.outputs.length > 1 && ', in any mix'}
              {line.restrictedToStat !== undefined &&
                `, ${STAT_LABELS[line.restrictedToStat]} skills only`}
              {line.halved && ', halved for want of a utility'}
              {line.staffed && line.missingSkill && ', but they do not have the skill'}
              {line.staffed && staff.length === 0 && ' — needs someone assigned'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
