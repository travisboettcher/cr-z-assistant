/**
 * The app shell: a header, one screen, one footer line.
 *
 * **One screen, not a page of sections.** The turn walk is the screen; beside
 * it (below it, on a portrait tablet) a summary of the community; above it, on
 * turn 1 only, what a new campaign needs first. Anything with a form in it —
 * the roster, the base, the materials, the log, the campaign file — opens in a
 * modal over that screen and closes back to it. The rules behind that are in
 * `docs/ux-principles.md`.
 *
 * The shell only renders and dispatches. Which modal is open is UI state, held
 * here, and never reaches the campaign.
 */

import { useState, type ReactNode } from 'react';
import { useCampaign } from '../state/useCampaign';
import { AppHeader } from './AppHeader';
import { AppVersion } from './AppVersion';
import { BaseSlotMap } from './BaseSlotMap';
import { CampaignFile } from './CampaignFile';
import { CampaignLog } from './CampaignLog';
import { CampaignMenu, type MenuPanel } from './CampaignMenu';
import { ClaimBase } from './ClaimBase';
import { CampaignEmptyState } from './CampaignEmptyState';
import { CommunitySummary, type CommunityPanel } from './CommunitySummary';
import { GettingStarted } from './GettingStarted';
import { MaterialsEditor } from './MaterialsEditor';
import { Modal } from './Modal';
import { PanelOpener } from './panelOpener';
import { SurvivorRoster } from './SurvivorRoster';
import { SurvivorSheet } from './SurvivorSheet';
import { TurnWalk } from './TurnWalk';
import { hungerPenalty } from '../engine/feeding';

/** Every modal the shell can open, one at a time. */
type Panel = CommunityPanel | MenuPanel;

const TITLES: Record<Panel, string> = {
  survivors: 'Survivors',
  base: 'Base',
  materials: 'Materials',
  log: 'Campaign log',
  file: 'Campaign file',
};

export function App() {
  const { state, autosaveError } = useCampaign();

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
   * Which modal is open, and for which campaign. Starting or importing a
   * campaign from inside the file modal replaces the campaign under it, and
   * the modal belongs to the one it was opened for — so it closes rather than
   * staying open over a different campaign.
   */
  const [open, setOpen] = useState<{ readonly panel: Panel; readonly campaign: string } | null>(
    null,
  );

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

  if (state.status !== 'open') {
    return (
      <Shell header={<AppHeader />}>
        <main className="mx-auto w-full max-w-4xl grow px-5 py-8">
          <CampaignEmptyState />
        </main>
      </Shell>
    );
  }

  const { campaign } = state;
  const panel = open !== null && open.campaign === campaign.id ? open.panel : null;
  const show = (next: Panel) => {
    setOpen({ panel: next, campaign: campaign.id });
  };
  const close = () => {
    setOpen(null);
    setOpenSheetId(null);
  };

  return (
    <PanelOpener value={show}>
      <Shell header={<AppHeader campaign={campaign} menu={<CampaignMenu onOpen={show} />} />}>
        <main className="mx-auto grid w-full max-w-7xl grow gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/*
           * The summary comes first in the source, so on a portrait tablet it is
           * a row of three cards above the turn; from a landscape tablet up it
           * moves to a column on the right and the turn takes the left.
           */}
          <div className="lg:col-start-2 lg:row-start-1">
            <CommunitySummary campaign={campaign} onOpen={show} />
          </div>

          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            {/*
             * Never only in the menu: a browser refusing to keep the campaign is
             * the one failure that loses it, so it stays on the screen.
             */}
            {autosaveError !== null && (
              <p
                role="status"
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              >
                {autosaveError}
              </p>
            )}
            <GettingStarted
              campaign={campaign}
              onAddSurvivors={() => {
                show('survivors');
              }}
              onClaimBase={() => {
                show('base');
              }}
            />
            <TurnWalk campaign={campaign} />
          </div>
        </main>

        <Modal open={panel !== null} title={panel === null ? '' : TITLES[panel]} onClose={close}>
          {panel === 'survivors' &&
            /*
             * The sheet replaces the list rather than opening a second modal on
             * top of it: one layer over the turn, and "Close sheet" goes back to
             * the list it came from.
             */
            (openSurvivor !== undefined ? (
              <SurvivorSheet
                survivor={openSurvivor}
                penalty={hungerPenalty(campaign)}
                onClose={() => {
                  setOpenSheetId(null);
                }}
              />
            ) : (
              <SurvivorRoster campaign={campaign} onOpenSheet={setOpenSheetId} />
            ))}
          {/*
           * One or the other, never both: a campaign either has a base to show
           * or has not claimed one. Null is the real state rather than an empty
           * base, so there is nothing to render a slot map from.
           */}
          {panel === 'base' &&
            (campaign.base === null ? <ClaimBase /> : <BaseSlotMap campaign={campaign} />)}
          {panel === 'materials' && <MaterialsEditor campaign={campaign} />}
          {panel === 'log' &&
            (campaign.log.length === 0 ? (
              <p className="text-stone-600 dark:text-stone-400">Nothing has happened yet.</p>
            ) : (
              <CampaignLog campaign={campaign} />
            ))}
          {panel === 'file' && <CampaignFile campaign={campaign} />}
        </Modal>
      </Shell>
    </PanelOpener>
  );
}

/**
 * The frame both states share: the header, whatever the screen is, and the
 * footer.
 */
function Shell({ header, children }: { readonly header: ReactNode; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {header}
      {children}

      {/*
       * On every screen. The app tracks a campaign; it is not a substitute for
       * the rules and must not read like one. Screens cite pages with
       * `PageRef`; this is where the app says once, plainly, whose rules these
       * are and that it does not reproduce them.
       */}
      <footer className="border-t border-stone-200 px-5 py-4 dark:border-stone-800">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 text-sm text-stone-600 dark:text-stone-400">
          <p>A campaign tracker only — you need the County Road Z rulebook to play.</p>
          <p>
            It ships no rule text and cites page numbers instead. County Road Z is copyright Jordan
            Heckman; this project is unaffiliated.
          </p>
          <AppVersion version={import.meta.env.VITE_APP_VERSION} />
        </div>
      </footer>
    </div>
  );
}
