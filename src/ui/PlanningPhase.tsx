/**
 * The Planning Phase's four steps, each on its own step of the walk.
 *
 * Assign Facility Staff → Assign Project Team → Assign Rest and Healing →
 * Assign Mission Team (pp. 20–21). The book contradicts itself about the last
 * two — see `docs/rulebook-edition.md` — and this follows the section body
 * rather than the turn summary, as `src/data/turn.ts` does.
 *
 * **Every step is the same control over the same roster**, which is why they
 * share one: `AssignTask` from Z3-5, already used by the base screen. What
 * differs between steps is which task a tick gives and what the screen says
 * about it, not how assigning works.
 *
 * Staffing is the exception, and has to be: it is a task *per slot*, so the
 * step shows one control per built facility rather than one for the phase.
 */

import type { Campaign } from '../engine/campaign';
import type { TurnStepId } from '../data/turn';
import { staffCapacity, type Occupant } from '../engine/base';
import { suppliedOccupants } from '../engine/utilities';
import { assignedTo, baseLaborBonus, laborPool, utilitiesScore } from '../engine/assignments';
import { unassigned } from '../engine/planning';
import { AssignTask } from './AssignTask';
import { FACILITY_LABELS, slotLabel } from './baseLabels';
import { PageRef } from './PageRef';

export interface PlanningPhaseProps {
  readonly campaign: Campaign;
  readonly step: TurnStepId;
}

export function PlanningPhase({ campaign, step }: PlanningPhaseProps) {
  const idle = unassigned(campaign);

  return (
    <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
      {step === 'assign-facility-staff' && <FacilityStaff campaign={campaign} />}

      {step === 'assign-project-team' && (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            The project team generates <span className="tabular-nums">{laborPool(campaign)}</span>{' '}
            Labor between them — the sum of their Tier levels
            {baseLaborBonus(campaign) > 0 && (
              <>
                , plus the <span className="tabular-nums">{baseLaborBonus(campaign)}</span> this
                base adds while somebody is on the team
              </>
            )}
            . Whatever is left at the end of the turn is lost <PageRef pages={20} />
          </p>
          <AssignTask
            campaign={campaign}
            task={{ task: 'project' }}
            legend="On the project team"
            pages={20}
          />
        </>
      )}

      {step === 'assign-rest-and-healing' && (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Two rules in one step. Resting gives a survivor one Health nobody else can use, and{' '}
            <strong>only one survivor may rest a turn</strong>. Healing shares out what a Medical
            Clinic makes, between everybody assigned to it <PageRef pages={21} />
          </p>
          <AssignTask campaign={campaign} task={{ task: 'rest' }} legend="Resting" pages={21} />
          <AssignTask
            campaign={campaign}
            task={{ task: 'healing' }}
            legend="Being healed"
            pages={21}
          />
        </>
      )}

      {step === 'assign-mission-team' && (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            For next turn’s mission. Injured survivors cannot go <PageRef pages={21} />
          </p>
          <AssignTask
            campaign={campaign}
            task={{ task: 'mission', team: 1 }}
            legend="On the mission team"
            pages={21}
          />
          <AssignTask
            campaign={campaign}
            task={{ task: 'scavenging' }}
            legend="Scavenging instead of the mission"
            pages={17}
          />
        </>
      )}

      {/*
       * On every step of the phase, because leaving somebody idle by accident
       * is the mistake this screen exists to prevent — and the step where it
       * becomes visible is not the step where it happened.
       */}
      <p className="mt-4 text-sm">
        {idle.length === 0 ? (
          <span className="text-stone-600 dark:text-stone-400">Everybody has something to do.</span>
        ) : (
          <>
            <span className="font-medium">
              {idle.length} with nothing to do
              {': '}
            </span>
            <span className="text-stone-600 dark:text-stone-400">
              {idle.map((survivor) => survivor.name).join(', ')}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/**
 * One slot's staffing control, and what it does with more people than it takes.
 *
 * A facility takes one survivor unless an upgrade widens it (pg. 54, 72–73).
 * The control does not refuse the extra — this phase warns rather than blocks,
 * and a save can arrive over capacity — but silently ignoring somebody is how a
 * player ends up with a Clinic they think is double-staffed. So it says who is
 * actually working and who is standing about.
 */
function FacilitySlotStaff({
  campaign,
  occupant,
}: {
  readonly campaign: Campaign;
  readonly occupant: Occupant;
}) {
  const room = staffCapacity(occupant);
  const assigned = assignedTo(campaign, occupant.slotId);
  const spare = assigned.slice(room);

  return (
    <>
      <AssignTask
        campaign={campaign}
        task={{ task: 'staff', slot: occupant.slotId }}
        legend={`${FACILITY_LABELS[occupant.facility.id]} — ${slotLabel(occupant.slotId)}`}
        pages="72–73"
      />

      {spare.length > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Takes <span className="tabular-nums">{room}</span>, so{' '}
          {spare.map((survivor) => survivor.name).join(', ')} {spare.length === 1 ? 'is' : 'are'}{' '}
          assigned here and not working <PageRef pages={54} />
        </p>
      )}
    </>
  );
}

/**
 * Step 1, which is a task per slot rather than one for the phase — and the
 * step that decides the utility pool.
 *
 * Power and Water are generated and assigned **at the end of this step**
 * (pg. 20, 67), so the Score the Stations' staff make is shown here rather than
 * on the base screen where it is spent. Spending it is still the slot card's:
 * this step says how much there is.
 *
 * The slot cards keep a staffing control of their own, where the project team's
 * was taken away, because the two questions are not alike. A slot card answers
 * "what does this facility make", and it makes nothing with nobody in it — the
 * assignment and its consequence belong on the same card. The project team has
 * no card and no consequence to sit beside, so one control in the step the book
 * names is the whole of it.
 */
function FacilityStaff({ campaign }: { readonly campaign: Campaign }) {
  const base = campaign.base;

  if (base === null) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        This community has no base, so there is nothing to staff <PageRef pages={54} />
      </p>
    );
  }

  /*
   * Only facilities that take staff (pg. 54). A Bunk Room's two beds are a flat
   * effect with no skill named, so a survivor put in one does nothing the rules
   * contemplate — and used to cost a point of Siege Threat for the privilege,
   * because the count saw an occupied slot.
   *
   * The base screen's own slot card has always gated this control; the two
   * screens simply disagreed, and the data agreed with the card.
   */
  const built = suppliedOccupants(campaign).filter((occupant) => staffCapacity(occupant) > 0);

  return (
    <>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Power and Water are generated and assigned at the end of this step, and last until the next
        turn’s Planning Phase. This base’s staff make{' '}
        <span className="tabular-nums">{utilitiesScore(campaign)}</span> to split between them —
        assign it on the base below <PageRef pages={20} />
      </p>

      {built.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">Nothing is built yet.</p>
      ) : (
        built.map((occupant) => (
          <FacilitySlotStaff key={occupant.slotId} campaign={campaign} occupant={occupant} />
        ))
      )}
    </>
  );
}
