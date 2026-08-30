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
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface CampaignOverviewProps {
  readonly campaign: Campaign;
}

export function CampaignOverview({ campaign }: CampaignOverviewProps) {
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
        The roster, base, turn, mission and equipment screens are not built yet. Until then this is
        the shell they will hang off.
      </p>

      {/*
       * The exported file is the durable save — the copy that survives a
       * cleared browser — so the button says what it produces rather than a
       * bare "Export", and the line under it says plainly that nothing is
       * being kept anywhere else yet. Autosave arrives in Z0-10 (#10); until
       * it does, this is the only way a campaign outlives the tab.
       */}
      <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
        <button
          type="button"
          onClick={() => {
            downloadCampaign(campaign);
          }}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
        >
          Export campaign
        </button>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Downloads a <code>.json</code> file. This is the only saved copy — nothing is kept in the
          browser yet.
        </p>
      </div>
    </section>
  );
}
