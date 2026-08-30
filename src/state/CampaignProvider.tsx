/**
 * Wires the pure reducer into React, and owns the two facts that are about this
 * browser tab rather than about the campaign: whether there are changes since
 * the last export, and whether background saving is working.
 *
 * This is the only place `campaignReducer` meets a component: everything below
 * reads state and dispatches actions, and nothing below writes campaign state
 * itself.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { serializeCampaign } from '../persistence/exportFile';
import { readAutosave, writeAutosave } from '../persistence/autosave';
import { CampaignContext } from './campaignContext';
import { INITIAL_CAMPAIGN_STATE, campaignReducer } from './campaignStore';
import type { CampaignAction, CampaignState } from './campaignStore';

/**
 * Long enough that typing a name does not write on every keystroke, short
 * enough that a tab closed straight after an edit still keeps it.
 */
const AUTOSAVE_DEBOUNCE_MS = 400;

export interface CampaignProviderProps {
  readonly children: ReactNode;
  /**
   * Starting state. When omitted the provider restores from the autosave, which
   * is the real boot path; tests pass it explicitly to start from a known
   * point without touching storage.
   */
  readonly initialState?: CampaignState;
}

interface Restored {
  readonly state: CampaignState;
  readonly error: string | null;
}

/**
 * Read once, lazily, before the first render — so the app never flashes its
 * empty state before a restored campaign appears.
 */
function restore(given: CampaignState | undefined): Restored {
  if (given !== undefined) return { state: given, error: null };

  const found = readAutosave();
  if (found === null) return { state: INITIAL_CAMPAIGN_STATE, error: null };

  if (!found.ok) {
    return { state: INITIAL_CAMPAIGN_STATE, error: found.error.message };
  }

  return { state: { status: 'open', campaign: found.campaign }, error: null };
}

export function CampaignProvider({ children, initialState }: CampaignProviderProps) {
  const [restored] = useState(() => restore(initialState));
  const [state, rawDispatch] = useReducer(campaignReducer, restored.state);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);

  /**
   * The serialized text of the file this campaign last matched — from an
   * export, an import, or the autosave it was restored from. `null` means
   * there is no such file, which is the honest state of a campaign someone
   * just created.
   */
  const [exportedText, setExportedText] = useState<string | null>(() =>
    restored.state.status === 'open' ? serializeCampaign(restored.state.campaign) : null,
  );

  const currentText = state.status === 'open' ? serializeCampaign(state.campaign) : null;

  const markExported = useCallback(() => {
    setExportedText(currentText);
  }, [currentText]);

  /**
   * Dispatch, plus the one thing the reducer cannot know: whether the campaign
   * it is about to hold corresponds to a file.
   *
   * Reading that from the resulting state does not work — a campaign arriving
   * from an import and one just created look identical afterwards, and only
   * the first matches a file. So it is decided from the action, which says
   * exactly which happened.
   */
  const dispatch = useCallback((action: CampaignAction) => {
    if (action.type === 'campaign/loaded') {
      setExportedText(serializeCampaign(action.campaign));
    } else if (action.type === 'campaign/started') {
      // Brand new: it has never been written anywhere the user could recover
      // it from, so it is unsaved from the first moment.
      setExportedText(null);
    }

    rawDispatch(action);
  }, []);

  useEffect(() => {
    if (state.status !== 'open') return;

    const { campaign } = state;

    const timer = setTimeout(() => {
      const written = writeAutosave(campaign);
      setAutosaveError(written.ok ? null : written.reason);
    }, AUTOSAVE_DEBOUNCE_MS);

    /*
     * Debouncing leaves a window in which an edit is not yet written, and
     * closing a tab inside that window would lose it. `pagehide` is the last
     * event that reliably fires on the way out — including on mobile Safari,
     * where `beforeunload` often does not — so the pending write is flushed
     * there rather than gambling on the timer having fired.
     */
    function flush() {
      writeAutosave(campaign);
    }

    window.addEventListener('pagehide', flush);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
    };
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      unsavedChanges: currentText !== null && currentText !== exportedText,
      markExported,
      restoreError: restored.error,
      autosaveError,
    }),
    [state, dispatch, currentText, exportedText, markExported, restored.error, autosaveError],
  );

  return <CampaignContext value={value}>{children}</CampaignContext>;
}
