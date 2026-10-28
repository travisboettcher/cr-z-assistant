/**
 * The project team's Humanity at Check for Rot (pg. 127; R114; Z7-9): 1 each
 * for a turn on the project team, on one press, once a turn. Shown while owed,
 * or once taken this turn.
 */

import type { Campaign } from '../engine/campaign';
import { projectTeamHumanityDue } from '../engine/humanity';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from '../labels/logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

export function ProjectTeamHumanity({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const due = projectTeamHumanityDue(campaign);
  const taken = campaign.log.filter(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'humanity-gained' &&
      entry.event.reason === 'project-team',
  );

  if (due.length === 0 && taken.length === 0) return null;

  return (
    <section aria-label="Humanity" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Humanity <PageRef pages={127} />
      </h4>
      {taken.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {due.length > 0 && (
        <>
          <p className={HINT}>
            A turn on the project team gives 1 Humanity, to no more than 5:{' '}
            {due.map((survivor) => survivor.name).join(', ')}.
          </p>
          <div>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                dispatch({ type: 'management/projectHumanity', at: new Date().toISOString() });
              }}
            >
              Give the project team its Humanity
            </button>
          </div>
        </>
      )}
    </section>
  );
}
