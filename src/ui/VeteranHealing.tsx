/**
 * A Veteran's healing, on the Planning Phase's Rest and Healing step (pg. 88;
 * R91, R137; Z7-2).
 *
 * Shown only when there is somebody to do it and somebody to do it for: a
 * Veteran with XP, and a survivor at 0 Health. Each press spends 1 of the
 * Veteran's XP on one survivor, and this turn's are listed in the log's own
 * words above. Who can be reached, and why not, are `veteran.ts`'s answers.
 */

import type { Campaign } from '../engine/campaign';
import { veteranCanReach } from '../engine/veteran';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from './logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

export function VeteranHealing({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const recorded = campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'veteran-healed',
  );
  const veterans = campaign.survivors
    .filter((survivor) => survivor.veteran)
    .map((veteran) => ({ veteran, reach: veteranCanReach(campaign, veteran.id) }))
    .filter(({ reach }) => reach.length > 0);

  if (veterans.length === 0 && recorded.length === 0) return null;

  return (
    <section aria-label="A Veteran’s healing" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        A Veteran’s healing <PageRef pages={88} />
      </h4>
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {veterans.map(({ veteran, reach }) => (
        <div key={veteran.id} className="flex flex-col gap-1">
          <p className={HINT}>
            {veteran.name} has {veteran.xp} XP. Each 1 brings a survivor at 0 Health up to 1, and
            they make no Rot check this turn.
          </p>
          <div className="flex flex-wrap gap-2">
            {reach.map((survivor) => (
              <button
                key={survivor.id}
                type="button"
                className={BUTTON}
                onClick={() => {
                  dispatch({
                    type: 'planning/veteranHealed',
                    veteran: veteran.id,
                    survivor: survivor.id,
                    at: new Date().toISOString(),
                  });
                }}
              >
                Bring {survivor.name} up <span className="sr-only">, {veteran.name}’s 1 XP</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
