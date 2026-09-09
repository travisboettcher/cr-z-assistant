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

import { useState } from 'react';
import { useCampaign } from '../state/useCampaign';
import { AppHeader } from './AppHeader';
import { BaseSlotMap } from './BaseSlotMap';
import { CampaignLog } from './CampaignLog';
import { TurnWalk } from './TurnWalk';
import { ClaimBase } from './ClaimBase';
import { CampaignEmptyState } from './CampaignEmptyState';
import { CampaignOverview } from './CampaignOverview';
import { ImportCampaign } from './ImportCampaign';
import { SectionNav } from './SectionNav';
import { SurvivorRoster } from './SurvivorRoster';
import { SurvivorSheet } from './SurvivorSheet';

export function App() {
  const { state } = useCampaign();

  /**
   * Which sheet is open is **UI state, not campaign state**. It never goes
   * through the store and never reaches the save file: who you happen to be
   * looking at is not a fact about the campaign, and putting it on the
   * persisted shape would mean a migration for something that does not even
   * survive a reload.
   *
   * Held as an id rather than a survivor, so the object rendered is always the
   * current one from the store rather than a copy taken when it was opened.
   */
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  /**
   * Resolved every render, and deliberately allowed to come back undefined:
   * the open survivor can be removed, and importing a campaign replaces the
   * whole roster. Both leave the id dangling, and both should simply close the
   * sheet rather than render an empty one.
   */
  const openSurvivor =
    state.status === 'open'
      ? state.campaign.survivors.find((survivor) => survivor.id === openSheetId)
      : undefined;

  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Two call sites rather than one with an optional prop: under
          `exactOptionalPropertyTypes`, passing a possibly-undefined campaign is
          not the same as omitting it, and the narrowing here is free. */}
      {state.status === 'open' ? <AppHeader campaign={state.campaign} /> : <AppHeader />}

      <SectionNav />

      <main className="mx-auto w-full max-w-4xl grow px-5 py-8">
        {state.status === 'open' ? (
          <div className="flex flex-col gap-6">
            {/*
             * First, above everything: the turn is the frame the rest of Phase
             * 3 hangs inside, and where the table is in it is the question this
             * screen exists to answer.
             */}
            <TurnWalk campaign={state.campaign} />
            <CampaignOverview campaign={state.campaign} />
            <SurvivorRoster campaign={state.campaign} onOpenSheet={setOpenSheetId} />
            {/*
             * One or the other, never both: a campaign either has a base to
             * show or has not claimed one. Null is the real state rather than
             * an empty base, so there is nothing to render a slot map from.
             */}
            {state.campaign.base === null ? (
              <ClaimBase />
            ) : (
              <BaseSlotMap campaign={state.campaign} />
            )}
            {/*
             * Below the base rather than above it: the history is what the
             * campaign *did*, and the screens above are what it can do next.
             * It renders nothing at all until there is something to show.
             */}
            <CampaignLog campaign={state.campaign} />
            {openSurvivor !== undefined && (
              <SurvivorSheet
                survivor={openSurvivor}
                onClose={() => {
                  setOpenSheetId(null);
                }}
              />
            )}
            {/*
             * Import stays reachable with a campaign open, not only from the
             * empty state — otherwise the only way to open a saved file would
             * be to reload the page first. Here it replaces what is loaded, so
             * it confirms before overwriting.
             */}
            <ImportCampaign confirmOverwrite />
          </div>
        ) : (
          <CampaignEmptyState />
        )}
      </main>

      {/*
       * On every screen. The app tracks a campaign; it is not a substitute for
       * the rules and must not read like one. Screens cite pages with
       * `PageRef`; this is where the app says once, plainly, whose rules these
       * are and that it does not reproduce them.
       */}
      <footer className="border-t border-stone-200 px-5 py-4 dark:border-stone-800">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 text-sm text-stone-600 dark:text-stone-400">
          <p>A campaign tracker only — you need the County Road Z rulebook to play.</p>
          <p>
            It ships no rule text and cites page numbers instead. County Road Z is copyright Jordan
            Heckman; this project is unaffiliated.
          </p>
        </div>
      </footer>
    </div>
  );
}
