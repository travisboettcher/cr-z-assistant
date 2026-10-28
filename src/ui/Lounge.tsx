/**
 * The Lounge's Madness Recovery at Heal Wounds (pp. 21, 68; R110; Z7-7): who
 * loses how much, shared equally as healing is, and one press to hand it out.
 * Shown only when there is something to hand out or something handed out this
 * turn; what the press may do is `lounge.ts`'s answer.
 */

import type { Campaign } from '../engine/campaign';
import { loungePool, madnessAwards } from '../engine/lounge';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from '../labels/logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

export function LoungeRecovery({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const recorded = campaign.log.filter(
    (entry) => entry.turn === campaign.turn && entry.event.kind === 'madness-recovered',
  );
  const awards = recorded.length === 0 ? madnessAwards(campaign) : [];

  if (awards.length === 0 && recorded.length === 0) return null;

  return (
    <section aria-label="Madness Recovery" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Madness Recovery <PageRef pages="21, 68" />
      </h4>
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {awards.length > 0 && (
        <>
          <p className={HINT}>
            The Lounge makes <span className="tabular-nums">{loungePool(campaign)}</span> points,
            shared equally among everybody assigned to Madness Recovery:{' '}
            {awards.map((award) => `${award.survivor.name} −${String(award.madness)}`).join(', ')}.
          </p>
          <div>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                dispatch({ type: 'advancement/madnessRecovered', at: new Date().toISOString() });
              }}
            >
              Take the Madness off
            </button>
          </div>
        </>
      )}
    </section>
  );
}
