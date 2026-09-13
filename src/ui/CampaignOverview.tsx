/**
 * What `<main>` holds while a campaign is open.
 *
 * Phase 0 ships no game rules, so there is genuinely nothing to *do* with an
 * open campaign yet. This panel says that plainly and shows the stored facts
 * that are not already in the header, rather than mocking up screens the later
 * phases will build for real.
 */

import { useId } from 'react';
import { MATERIALS } from '../data/materials';
import type { Campaign } from '../engine/campaign';
import { downloadCampaign } from '../persistence/exportFile';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { StartNewCampaign } from './StartNewCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface CampaignOverviewProps {
  readonly campaign: Campaign;
}

export function CampaignOverview({ campaign }: CampaignOverviewProps) {
  const { unsavedChanges, everExported, markExported, autosaveError, dispatch } = useCampaign();
  const materialsId = useId();

  return (
    <section
      aria-labelledby="campaign-overview-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="campaign-overview-heading" className="text-xl font-semibold">
        Campaign open
      </h2>
      <p className="mt-1 text-stone-600 dark:text-stone-400">
        Started{' '}
        <time dateTime={campaign.createdAt}>
          {new Date(campaign.createdAt).toLocaleDateString()}
        </time>
        .
      </p>
      <p className="mt-4 text-stone-600 dark:text-stone-400">
        The mission and equipment screens are not built yet. Until then this is the shell they will
        hang off.
      </p>

      {/*
       * Typed in by hand, for the reason Phase 1 let XP be typed in: materials
       * are produced and spent by the Advancement and Management Phases, which
       * are Phase 3, and until then nothing in the app can put a Hardware into
       * a community. A base screen whose Build button can never be pressed
       * would be no base screen at all.
       */}
      <fieldset className="mt-6">
        <legend className="font-medium" id={materialsId}>
          Materials in storage
        </legend>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Entered by hand until the Advancement Phase produces them <PageRef pages={19} />
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          {MATERIALS.map((material) => (
            <div key={material} className="flex flex-col gap-1">
              <label htmlFor={`${materialsId}-${material}`} className="text-sm capitalize">
                {material}
              </label>
              <input
                id={`${materialsId}-${material}`}
                type="number"
                min={0}
                value={campaign.materials[material]}
                onChange={(event) => {
                  dispatch({
                    type: 'campaign/materialSet',
                    material,
                    count: Math.max(0, Number(event.target.value)),
                  });
                }}
                className={`${TOUCH_TARGET} ${FOCUS_RING} w-24 rounded-lg border border-stone-300 bg-white px-3 tabular-nums dark:border-stone-700 dark:bg-stone-950`}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              downloadCampaign(campaign);
              markExported();
            }}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
          >
            Export campaign
          </button>
          <StartNewCampaign />
        </div>
        {/*
         * The wording carries the distinction the whole persistence layer
         * rests on: the browser copy is a convenience that a cleared browser
         * takes with it, and the exported file is the one that lasts. Calling
         * the autosave "saved" without that qualifier is how someone
         * eventually loses a campaign.
         *
         * Three states rather than two, because "changed since your last
         * export" is not true of a campaign that has never had one — and the
         * restore path used to seed itself from the autosave, so a campaign
         * written nowhere reported that it matched a file.
         */}
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {!everExported
            ? 'Never exported. The browser is keeping a copy, but only an exported file survives clearing your browser data.'
            : unsavedChanges
              ? 'Changed since your last export. The browser is keeping a copy, but only an exported file survives clearing your browser data.'
              : 'Matches your last exported file.'}
        </p>

        {autosaveError !== null && (
          <p
            role="status"
            className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {autosaveError}
          </p>
        )}
      </div>
    </section>
  );
}
