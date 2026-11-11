/**
 * Setting up a campaign picked up partway, above the turn walk (#210;
 * `docs/continue-campaign.md`).
 *
 * What turn 1's Getting started is for a new campaign: the things to enter
 * before the turn is played, each with the modal that enters it. A campaign
 * picked up partway opens on its turn's Select Mission with nobody in it and
 * no base, and the table enters the community, the base, the stores and last
 * turn's Planning as they stand. Until "Setting up is done" is pressed, skill
 * levels and the base are entered free (`settingUp`), and the turn owes the
 * setting up before anything else.
 *
 * A list rather than ticks: nothing here can tell when the table has entered
 * all of something, so it says what each is and where it goes. Guidance, never
 * a gate (R33): the walk goes on whether or not it is done.
 *
 * Last turn's assignments have no step to be entered in before this turn's
 * Planning, so they open here, as a board with every lane (`LastTurnAssignments`).
 */

import type { ReactNode } from 'react';
import { staffCapacity } from '../engine/base';
import type { Campaign } from '../engine/campaign';
import { settingUp } from '../engine/continued';
import { suppliedOccupants } from '../engine/utilities';
import { facilityInSlot } from '../labels/baseLabels';
import { laneLabel } from '../labels/taskLabels';
import { useCampaign } from '../state/useCampaign';
import { AssignmentBoard, type Lane } from './AssignmentBoard';
import type { CommunityPanel } from './CommunitySummary';
import { PageRef } from './PageRef';
import { missionTeamsToOffer } from './planningLanes';
import { FOCUS_RING, PRIMARY_FILL, SECONDARY_FILL, TOUCH_TARGET } from './styles';

/** The modal only setting up opens. */
export type SetUpPanel = 'assignments';

export interface SettingUpProps {
  readonly campaign: Campaign;
  readonly onOpen: (panel: CommunityPanel | SetUpPanel) => void;
}

const OPEN = `${TOUCH_TARGET} ${FOCUS_RING} inline-flex shrink-0 items-center rounded-lg px-4 font-medium ${SECONDARY_FILL}`;

export function SettingUp({ campaign, onOpen }: SettingUpProps) {
  const { dispatch } = useCampaign();
  if (!settingUp(campaign)) return null;

  const open = (panel: CommunityPanel | SetUpPanel, label: string) => (
    <button
      type="button"
      onClick={() => {
        onOpen(panel);
      }}
      className={OPEN}
    >
      {label}
    </button>
  );
  const claimed = campaign.base !== null;

  return (
    <section
      aria-labelledby="setting-up-heading"
      className="rounded-xl border-2 border-amber-500 bg-amber-50 p-5 dark:border-amber-400 dark:bg-amber-950/30"
    >
      <h2 id="setting-up-heading" className="text-lg font-semibold">
        Setting up
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Enter the campaign as it stands at the start of turn {campaign.turn}. Until setting up is
        done, skill levels and the base go in free.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        <Item
          title="The survivors"
          detail={
            <>
              <span className="tabular-nums">{campaign.survivors.length}</span> in the community.
              Set each one’s skill levels and Scores on their sheet <PageRef pages="8–9" />
            </>
          }
          action={open(
            'survivors',
            campaign.survivors.length === 0 ? 'Add survivors' : 'Open roster',
          )}
        />
        <Item
          title="The base"
          detail={
            claimed ? (
              <>
                What’s built in each slot, its upgrades, and its Power and Water{' '}
                <PageRef pages={54} />
              </>
            ) : (
              <>
                Claim it, then enter what’s built in each slot <PageRef pages={54} />
              </>
            )
          }
          action={open('base', claimed ? 'Open base' : 'Claim your base')}
        />
        <Item
          title="The stores"
          detail="The materials and the Inventory, with its vehicles."
          action={
            <div className="flex flex-wrap gap-2">
              {open('materials', 'Edit materials')}
              {open('inventory', 'Open Inventory')}
            </div>
          }
        />
        <Item
          title="Last turn’s assignments"
          detail={
            <>
              Who staffs what, the project team, rest and healing, and the mission teams playing
              this turn <PageRef pages="20–21" />
            </>
          }
          action={open('assignments', 'Enter assignments')}
        />
        <Item
          title="Last turn’s orders"
          detail={
            <>
              Each slot on the base takes what was ordered last turn, already paid{' '}
              <PageRef pages={20} />
            </>
          }
          action={claimed && open('base', 'Open base')}
        />
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'campaign/settingUpFinished', at: new Date().toISOString() });
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg ${PRIMARY_FILL} px-5 font-semibold`}
        >
          Setting up is done
        </button>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          After this, changes are corrections, and nothing goes in free.
        </p>
      </div>
    </section>
  );
}

function Item({
  title,
  detail,
  action,
}: {
  readonly title: string;
  readonly detail: ReactNode;
  readonly action: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="min-w-0 grow basis-48">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{detail}</p>
      </div>
      {action}
    </li>
  );
}

/**
 * Last turn's assignments, as a board with every lane the Planning Phase's
 * steps open between them (#210). The Mission Phase plays the teams it
 * assigned, and the Advancement Phase reads the rest as they stood before
 * this turn's Planning (`beforePlanning`).
 */
export function LastTurnAssignments({ campaign }: { readonly campaign: Campaign }) {
  const staffed = suppliedOccupants(campaign).filter((occupant) => staffCapacity(occupant) > 0);
  const lanes: readonly Lane[] = [
    ...staffed.map((occupant) => ({
      task: { task: 'staff', slot: occupant.slotId } as const,
      name: facilityInSlot(occupant.facility.id, occupant.slotId),
      pages: '72–73',
    })),
    { task: { task: 'project' }, name: laneLabel({ task: 'project' }), pages: 20 },
    { task: { task: 'rest' }, name: laneLabel({ task: 'rest' }), pages: 21 },
    { task: { task: 'healing' }, name: laneLabel({ task: 'healing' }), pages: 21 },
    ...(campaign.origin === 'cosmic-horror'
      ? [
          {
            task: { task: 'madness-recovery' } as const,
            name: laneLabel({ task: 'madness-recovery' }),
            pages: '21, 68',
          },
        ]
      : []),
    ...missionTeamsToOffer(campaign).map((team) => ({
      task: { task: 'mission', team } as const,
      name: laneLabel({ task: 'mission', team }),
      pages: 21,
    })),
    { task: { task: 'scavenging' }, name: laneLabel({ task: 'scavenging' }), pages: 17 },
  ];

  return (
    <div>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        As last turn’s Planning Phase left them. Facilities are staffed once they’re on the base{' '}
        <PageRef pages="20–21" />
      </p>
      <AssignmentBoard campaign={campaign} lanes={lanes} />
    </div>
  );
}
