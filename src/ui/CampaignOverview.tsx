/**
 * What `<main>` holds while a campaign is open.
 *
 * Phase 0 ships no game rules, so there is genuinely nothing to *do* with an
 * open campaign yet. This panel says that plainly and shows the stored facts
 * that are not already in the header, rather than mocking up screens the later
 * phases will build for real.
 */

import type { Campaign } from '../engine/campaign';

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
    </section>
  );
}
