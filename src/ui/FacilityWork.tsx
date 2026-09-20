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
import { STAFF_STEP } from '../data/turn';
import { PageRef } from './PageRef';
import { STEP_LABELS } from './turnLabels';
import type { Campaign } from '../engine/campaign';
import { staffOf } from '../engine/assignments';
import { hungerPenalty } from '../engine/feeding';
import { planningHasBegun } from '../engine/planning';
import { facilityProduction, wantsStaff, type ProducedOutput } from '../engine/production';
import { AssignTask } from './AssignTask';
import { STAT_LABELS } from './skillLabels';
import { MATERIAL_LABELS, UTILITY_LABELS, builtThingLabel } from './baseLabels';
import { unmodelledExchanges } from '../engine/conversions';

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
        <>
          <AssignTask
            campaign={campaign}
            task={{ task: 'staff', slot: occupant.slotId }}
            legend="Working here"
            pages="72–73"
          />

          {/*
           * The same note the build controls on this card already carry, for
           * the same reason. Tasks expire at the top of a Planning Phase
           * (pg. 20), so staffing assigned before the turn reaches Planning is
           * wiped — silently, until the September playtest found it. Z3-6
           * guides rather than refuses, so this says what will happen rather
           * than taking the control away.
           *
           * **Which of two things will happen turns on the clear, not on the
           * step.** Once this turn's Planning Phase has begun the clear is
           * behind the assignment, and it stands until the next one — so the
           * note went on promising to wipe an assignment that survived into the
           * Management Phase, which the playtest checked and it did (#151).
           */}
          {campaign.step !== STAFF_STEP &&
            (planningHasBegun(campaign) ? (
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                Staff are assigned in {STEP_LABELS[STAFF_STEP]}, and this turn is past it — so this
                stands until next turn&rsquo;s Planning Phase clears it <PageRef pages={20} />
              </p>
            ) : (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
                Staff are assigned in {STEP_LABELS[STAFF_STEP]}, and the turn is at{' '}
                {STEP_LABELS[campaign.step]} — so this will be cleared when the Planning Phase
                begins. <PageRef pages={20} />
              </p>
            ))}
        </>
      )}

      {/*
       * Said on the card rather than left in a code comment (#150). The
       * Generator and the Well Pump trade Fuel for a *utility*, and which step
       * owns that trade is an open design question — a point bought in the
       * Advancement Phase would be cleared by the Planning Phase one phase
       * later (pg. 20, 67). Until it is answered a player builds either
       * upgrade, pays its Hardware and Labor, and gets nothing; the whole trace
       * of it on screen was a slot-card line naming the upgrade.
       *
       * The same shape as this app's other "a later phase owns this" notes,
       * which is what the clearing yields and the mission steps already do.
       */}
      {unmodelledExchanges(occupant).length > 0 && (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
          {unmodelledExchanges(occupant)
            .map((entry) => builtThingLabel(entry.id))
            .join(' and ')}{' '}
          trade{unmodelledExchanges(occupant).length === 1 ? 's' : ''} Fuel for a utility, and this
          version does not run that trade — which phase owns it is still open. Work it at the table{' '}
          <PageRef pages={67} />
        </p>
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
