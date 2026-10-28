/**
 * What a campaign is played with: its origin and whether the Apocalypse
 * Toolkit's survivor traits are in use (pp. 88, 122, 137; R84, R98, R158;
 * Z7-10).
 *
 * Both are chosen when a campaign starts (`NewCampaignChoices`). The origin is
 * fixed for the campaign's life (R98), so the settings modal only says it. The
 * traits can be switched part-way (R158): on, survivors already playing take
 * nothing at once; off, every survivor's Advantages and debt go with it, which
 * a confirmation says first.
 */

import { useId, useRef } from 'react';
import { CAMPAIGN_ORIGINS, type CampaignOrigin } from '../data/origins';
import type { Campaign } from '../engine/campaign';
import { keptSurvivors } from '../engine/campaign';
import { useCampaign } from '../state/useCampaign';
import { ORIGIN_LABELS } from '../labels/originLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, PRIMARY_FILL, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';
const SELECT = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-stone-50 px-3 dark:border-stone-600 dark:bg-stone-800`;

/** The origin and the Toolkit's traits, as a new campaign's form asks them. */
export function NewCampaignChoices({
  origin,
  traits,
  onOrigin,
  onTraits,
}: {
  readonly origin: CampaignOrigin | undefined;
  readonly traits: boolean;
  readonly onOrigin: (origin: CampaignOrigin | undefined) => void;
  readonly onTraits: (traits: boolean) => void;
}) {
  const originId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={originId} className="text-sm font-medium">
          Origin of the Rot <PageRef pages={122} />
        </label>
        <select
          id={originId}
          className={SELECT}
          value={origin ?? ''}
          onChange={(event) => {
            onOrigin(
              event.target.value === '' ? undefined : (event.target.value as CampaignOrigin),
            );
          }}
        >
          <option value="">None</option>
          {CAMPAIGN_ORIGINS.map((one) => (
            <option key={one} value={one}>
              {ORIGIN_LABELS[one]}
            </option>
          ))}
        </select>
        <p className={HINT}>Fixed for the whole campaign.</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className={`${FOCUS_RING} size-5`}
          checked={traits}
          onChange={(event) => {
            onTraits(event.target.checked);
          }}
        />
        Use the Apocalypse Toolkit’s survivor traits <PageRef pages={137} />
      </label>
    </div>
  );
}

export function CampaignSettings({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const confirmRef = useRef<HTMLDialogElement>(null);
  const confirmId = useId();
  const holders = keptSurvivors(campaign).filter(
    (survivor) =>
      survivor.advantages.length > 0 ||
      survivor.xpDebt > 0 ||
      Object.keys(survivor.injuries).length > 0,
  );

  const switchTo = (enabled: boolean) => {
    dispatch({ type: 'campaign/traitsSwitched', enabled, at: new Date().toISOString() });
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Origin">
        <h3 className="text-sm font-semibold">
          Origin of the Rot <PageRef pages={122} />
        </h3>
        <p className="mt-1">
          {campaign.origin === undefined ? 'None' : ORIGIN_LABELS[campaign.origin]}
        </p>
        <p className={`mt-1 ${HINT}`}>Chosen when the campaign started, and fixed for its life.</p>
      </section>

      <section aria-label="Survivor traits">
        <h3 className="text-sm font-semibold">
          The Apocalypse Toolkit’s survivor traits <PageRef pages="88, 137" />
        </h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={`${FOCUS_RING} size-5`}
            checked={campaign.traitsEnabled}
            onChange={(event) => {
              if (!event.target.checked && holders.length > 0) {
                confirmRef.current?.showModal();
                return;
              }
              switchTo(event.target.checked);
            }}
          />
          In use
        </label>
        <p className={`mt-1 ${HINT}`}>
          Advantages and their experience debt, and Permanent Injuries. Survivors already playing
          take no Advantages when they’re switched on; survivors who join afterwards may. Story
          Traits are always in use.
        </p>

        <dialog
          ref={confirmRef}
          aria-labelledby={confirmId}
          className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
        >
          <h2 id={confirmId} className="text-xl font-semibold">
            Stop using the survivor traits?
          </h2>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            {holders.map((survivor) => survivor.name).join(', ')}{' '}
            {holders.length === 1 ? 'loses their' : 'lose their'} Advantages, experience debt and
            Permanent Injuries. Switching back on doesn’t return them.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => confirmRef.current?.close()}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            >
              Keep them
            </button>
            <button
              type="button"
              onClick={() => {
                confirmRef.current?.close();
                switchTo(false);
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg ${PRIMARY_FILL} px-5 font-semibold`}
            >
              Stop using them
            </button>
          </div>
        </dialog>
      </section>
    </div>
  );
}
