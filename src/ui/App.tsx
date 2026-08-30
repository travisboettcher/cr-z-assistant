/**
 * The app shell: header, section navigation, one content region, one footer
 * line. Tablet-first — this gets used standing next to a table with miniatures
 * on it, so the status a player glances for stays pinned at the top and every
 * interactive target is thumb-sized.
 *
 * The shell only renders and dispatches. It reads `status` off the store to
 * decide between the empty state and an open campaign; it holds no campaign
 * state of its own and changes nothing except through an action.
 */

import { useCampaign } from '../state/useCampaign';
import { AppHeader } from './AppHeader';
import { CampaignEmptyState } from './CampaignEmptyState';
import { CampaignOverview } from './CampaignOverview';
import { SectionNav } from './SectionNav';

export function App() {
  const { state } = useCampaign();

  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Two call sites rather than one with an optional prop: under
          `exactOptionalPropertyTypes`, passing a possibly-undefined campaign is
          not the same as omitting it, and the narrowing here is free. */}
      {state.status === 'open' ? <AppHeader campaign={state.campaign} /> : <AppHeader />}

      <SectionNav />

      <main className="mx-auto w-full max-w-4xl grow px-5 py-8">
        {state.status === 'open' ? (
          <CampaignOverview campaign={state.campaign} />
        ) : (
          <CampaignEmptyState />
        )}
      </main>

      {/*
       * One line, on every screen. The app tracks a campaign; it is not a
       * substitute for the rules and must not read like one. The fuller
       * copyright treatment and per-screen page citations are Phase 1, once
       * there is a screen that actually cites a page.
       */}
      <footer className="border-t border-stone-200 px-5 py-4 dark:border-stone-800">
        <p className="mx-auto w-full max-w-4xl text-sm text-stone-600 dark:text-stone-400">
          A campaign tracker only — you need the County Road Z rulebook to play.
        </p>
      </footer>
    </div>
  );
}
