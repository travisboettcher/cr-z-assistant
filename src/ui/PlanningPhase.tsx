/**
 * The Planning Phase's four steps, each on its own step of the walk.
 *
 * Assign Facility Staff → Assign Project Team → Assign Rest and Healing →
 * Assign Mission Team (pp. 20–21). The book contradicts itself about the last
 * two — see `docs/rulebook-edition.md` — and this follows the section body
 * rather than the turn summary, as `src/data/turn.ts` does.
 *
 * **Every step is the same board over the same roster** (`AssignmentBoard`,
 * `docs/assignment-board.md`; #237). What differs between steps is which lanes
 * it opens and what the screen says about them, not how assigning works.
 *
 * Staffing is a lane *per slot*, so its step opens one lane per built facility
 * that takes staff.
 */

import { InoculationChoices } from './Inoculations';
import { VeteranHealing } from './VeteranHealing';
import type { Campaign } from '../engine/campaign';
import type { TurnStepId } from '../data/turn';
import { staffCapacity, type Occupant } from '../engine/base';
import { suppliedOccupants } from '../engine/utilities';
import {
  assignedTo,
  baseLaborBonus,
  laborPool,
  siegeLaborBonus,
  traitLaborChange,
  utilitiesScore,
} from '../engine/assignments';
import { laborAvailable, laborThisTurn, projectTeamIdle } from '../engine/projects';
import { AssignmentBoard } from './AssignmentBoard';
import { facilityInSlot } from './baseLabels';
import { OpenPanel } from './OpenPanel';
import { PageRef } from './PageRef';
import { laneLabel } from './taskLabels';

export interface PlanningPhaseProps {
  readonly campaign: Campaign;
  readonly step: TurnStepId;
}

/**
 * The mission teams this step offers: team 1 always, every team somebody is on
 * already, and one more after the highest, for splitting the mission survivors
 * further (pg. 21). An empty team is not a team — `missionTeams` ignores it —
 * so offering the next one costs nothing until somebody is put on it.
 */
function missionTeamsToOffer(campaign: Campaign): readonly number[] {
  const inUse = Object.values(campaign.assignments).flatMap((assignment) =>
    assignment.task === 'mission' ? [assignment.team] : [],
  );

  if (inUse.length === 0) return [1];

  const highest = Math.max(...inUse);

  return Array.from({ length: highest + 1 }, (_, index) => index + 1);
}

export function PlanningPhase({ campaign, step }: PlanningPhaseProps) {
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
            {siegeLaborBonus(campaign) > 0 && (
              <>
                , plus <span className="tabular-nums">{siegeLaborBonus(campaign)}</span> — a point
                each — for last turn&rsquo;s Siege Defense leaving no zombie standing{' '}
                <PageRef pages={86} />
              </>
            )}
            <TraitLabor change={traitLaborChange(campaign)} />
            . Whatever is left at the end of the turn is lost <PageRef pages={20} />
          </p>
          <AssignmentBoard
            key={step}
            campaign={campaign}
            lanes={[
              {
                task: { task: 'project' },
                name: laneLabel({ task: 'project' }),
                pages: 20,
                detail: laborThisTurn(campaign) > 0 && <ProjectLabor campaign={campaign} />,
              },
            ]}
          />
          {/*
           * The team's Labor builds equipment as well as facilities, from the
           * same pool, and an item is ready at once (Z5-6). Built from the
           * Inventory's modal rather than a copy of it here.
           */}
          <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            Facilities are ordered on the <OpenPanel panel="base">base</OpenPanel>; equipment is
            built from the <OpenPanel panel="inventory">Inventory</OpenPanel>, from the same Labor,
            and is ready at once, or traded for there with Food and Fuel, and arrives next turn{' '}
            <PageRef pages="20–21" />
          </p>
        </>
      )}

      {step === 'assign-rest-and-healing' && (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Two rules in one step. Resting gives a survivor one Health nobody else can use, and{' '}
            <strong>only one survivor may rest a turn</strong>. Healing shares out what a Medical
            Clinic makes, between everybody assigned to it <PageRef pages={21} />
          </p>
          <AssignmentBoard
            key={step}
            campaign={campaign}
            lanes={[
              { task: { task: 'rest' }, name: laneLabel({ task: 'rest' }), pages: 21 },
              { task: { task: 'healing' }, name: laneLabel({ task: 'healing' }), pages: 21 },
            ]}
          />
          <InoculationChoices campaign={campaign} />
          <VeteranHealing campaign={campaign} />
        </>
      )}

      {step === 'assign-mission-team' && (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            For next turn’s mission. Injured survivors can’t go. Split them between teams and each
            team plays its own mission next turn <PageRef pages={21} />
          </p>
          <AssignmentBoard
            key={step}
            campaign={campaign}
            lanes={[
              ...missionTeamsToOffer(campaign).map((team) => ({
                task: { task: 'mission', team } as const,
                name: laneLabel({ task: 'mission', team }),
                pages: 21,
              })),
              {
                task: { task: 'scavenging' },
                name: laneLabel({ task: 'scavenging' }),
                pages: 17,
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

/**
 * What the project team has to spend, and where. Ordering is the step's action
 * once there is Labor, and the primary one while nothing is ordered: a team
 * assigned and nothing built is a turn's building lost, and the two places it
 * is spent were words in a sentence (#235). `projectTeamIdle` is what
 * `outstanding` owes here too. On the project team's lane, beside the team.
 */
function ProjectLabor({ campaign }: { readonly campaign: Campaign }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p
        className={`text-sm font-medium ${projectTeamIdle(campaign) ? 'text-amber-800 dark:text-amber-300' : ''}`}
      >
        <span className="tabular-nums">{Math.max(0, laborAvailable(campaign))}</span> of{' '}
        <span className="tabular-nums">{laborThisTurn(campaign)}</span> Labor left to spend this
        turn.
      </p>
      <div className="flex flex-wrap gap-3">
        <OpenPanel panel="base" look={projectTeamIdle(campaign) ? 'primary' : 'secondary'}>
          Order on the base
        </OpenPanel>
        <OpenPanel panel="inventory" look="secondary">
          Build from the Inventory
        </OpenPanel>
      </div>
    </div>
  );
}

/**
 * What a facility's lane says about itself: how many it takes, and who is
 * over that.
 *
 * A facility takes one survivor unless an upgrade widens it (pg. 54, 72–73).
 * The board does not refuse the extra (this phase warns rather than blocks, and
 * a save can arrive over capacity), but silently ignoring somebody is how a
 * player ends up with a Clinic they think is double-staffed. So it says who is
 * actually working and who is standing about.
 */
function StaffRoom({
  campaign,
  occupant,
}: {
  readonly campaign: Campaign;
  readonly occupant: Occupant;
}) {
  const room = staffCapacity(occupant);
  const spare = assignedTo(campaign, occupant.slotId).slice(room);

  return spare.length === 0 ? (
    <p className="text-xs text-stone-600 dark:text-stone-400">
      Takes <span className="tabular-nums">{room}</span>
    </p>
  ) : (
    <p className="text-xs text-amber-700 dark:text-amber-300">
      Takes <span className="tabular-nums">{room}</span>, so{' '}
      {spare.map((survivor) => survivor.name).join(', ')} {spare.length === 1 ? 'is' : 'are'}{' '}
      assigned here and not working <PageRef pages={54} />
    </p>
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
      <>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          This community has no base, so there is nothing to staff <PageRef pages={54} />
        </p>
        <AssignmentBoard campaign={campaign} lanes={[]} />
      </>
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
        assign it on the <OpenPanel panel="base">base</OpenPanel> <PageRef pages={20} />
      </p>

      {built.length === 0 && (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">Nothing is built yet.</p>
      )}
      <AssignmentBoard
        campaign={campaign}
        lanes={built.map((occupant) => ({
          task: { task: 'staff', slot: occupant.slotId } as const,
          name: facilityInSlot(occupant.facility.id, occupant.slotId),
          pages: '72–73',
          detail: <StaffRoom campaign={campaign} occupant={occupant} />,
        }))}
      />
    </>
  );
}

/** What the project team's Story Traits add to its Labor or take from it (pg. 88). */
function TraitLabor({ change }: { readonly change: number }) {
  if (change === 0) return null;

  return (
    <>
      , {change > 0 ? 'plus' : 'less'} <span className="tabular-nums">{Math.abs(change)}</span> from
      their Story Traits <PageRef pages={88} />
    </>
  );
}
