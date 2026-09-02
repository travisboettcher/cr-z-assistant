/**
 * What `<main>` holds while a campaign is open.
 *
 * Phase 0 ships no game rules, so there is genuinely nothing to *do* with an
 * open campaign yet. This panel says that plainly and shows the stored facts
 * that are not already in the header, rather than mocking up screens the later
 * phases will build for real.
 */

import type { Campaign } from '../engine/campaign';
import { downloadCampaign } from '../persistence/exportFile';
import { useCampaign } from '../state/useCampaign';
import { StartNewCampaign } from './StartNewCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface CampaignOverviewProps {
  readonly campaign: Campaign;
}

export function CampaignOverview({ campaign }: CampaignOverviewProps) {
  const { unsavedChanges, markExported, autosaveError } = useCampaign();

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
        The base, turn, mission and equipment screens are not built yet. Until then this is the
        shell they will hang off.
      </p>

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
         */}
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {unsavedChanges
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
