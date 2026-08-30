/**
 * The context object shared by `CampaignProvider` and `useCampaign`.
 *
 * Kept in its own module — and out of the provider's `.tsx` — so neither file
 * mixes a component export with a non-component one, which is what keeps React
 * Fast Refresh able to hot-swap the provider during `npm run dev`.
 */

import { createContext } from 'react';
import type { Dispatch } from 'react';
import type { CampaignAction, CampaignState } from './campaignStore';

export interface CampaignContextValue {
  readonly state: CampaignState;
  readonly dispatch: Dispatch<CampaignAction>;

  /**
   * Whether the open campaign differs from the last file exported.
   *
   * Deliberately **not** a field on `Campaign`: anything there would be written
   * into the save file and become part of the persisted schema, needing a
   * migration, for what is really a fact about this browser tab. It is derived
   * by comparing the campaign's serialized form against the text captured at
   * the last export — exact, and impossible to leave stale the way a flag set
   * by hand can be.
   */
  readonly unsavedChanges: boolean;

  /** Called after a successful export, to reset `unsavedChanges`. */
  readonly markExported: () => void;

  /**
   * Set when a previous session left an autosave that no longer loads. The
   * entry is kept rather than deleted — discarding someone's only remaining
   * copy to tidy up is the wrong trade — so this is how the UI can say what
   * happened instead of silently starting empty.
   */
  readonly restoreError: string | null;

  /**
   * Set when background saving is not working — no room, or a browser refusing
   * site data. The exported file is the real save, so this is a warning rather
   * than an error, but it must not be swallowed.
   */
  readonly autosaveError: string | null;
}

/**
 * `null` rather than a working default: a component rendered outside the
 * provider would otherwise dispatch into a void and appear to do nothing, which
 * is far harder to diagnose than the error `useCampaign` throws.
 */
export const CampaignContext = createContext<CampaignContextValue | null>(null);
