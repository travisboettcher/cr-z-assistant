/**
 * The campaign as a file: export it, see whether the browser's copy matches
 * the last export, open another, or start again.
 *
 * Opened from the header menu. None of it is part of playing a turn, so none
 * of it sits on the main screen — but the export state is the one fact here a
 * player can lose a campaign by ignoring, so the menu repeats it in a line
 * (see `CampaignMenu`).
 */

import type { Campaign } from '../engine/campaign';
import { downloadCampaign } from '../persistence/download';
import { useCampaign } from '../state/useCampaign';
import { ImportCampaign } from './ImportCampaign';
import { StartNewCampaign } from './StartNewCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export function CampaignFile({ campaign }: { readonly campaign: Campaign }) {
  const { unsavedChanges, everExported, markExported } = useCampaign();

  return (
    <div className="flex flex-col gap-6">
      <div>
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
      </div>

      {/*
       * Import stays reachable with a campaign open, not only from the empty
       * state — otherwise the only way to open a saved file would be to reload
       * the page first. Here it replaces what is loaded, so it confirms before
       * overwriting.
       */}
      <ImportCampaign confirmOverwrite />
    </div>
  );
}
