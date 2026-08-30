/**
 * Autosave — a convenience layer, never the durable save.
 *
 * The copy that survives a cleared browser is the exported `.json`. This exists
 * so closing a tab mid-turn does not cost the turn, and every message in the UI
 * has to keep that distinction honest: if this is ever presented as "your
 * campaign is saved", someone will eventually lose one.
 *
 * **The stored text is exactly what an export writes.** `serializeCampaign` in,
 * `parseCampaignFile` out. That is deliberate rather than convenient: it means
 * an autosave written by an older build is brought forward by the same
 * migration chain that handles files, and a corrupt entry produces the same
 * readable message. A bespoke storage shape would be a second save format
 * outside everything Z0-4 built to keep old campaigns loadable.
 */

import type { Campaign } from '../engine/campaign';
import { serializeCampaign } from './exportFile';
import { parseCampaignFile, type SaveFileResult } from './saveFile';

/** Namespaced so a future second slot does not collide with this one. */
export const AUTOSAVE_KEY = 'crz.campaign.autosave.v1';

/**
 * Whether a write succeeded.
 *
 * `localStorage` throws when a quota is exhausted and in some private-browsing
 * modes, and it can be absent entirely. None of that is worth taking the app
 * down for — the exported file is the real save — so failures are reported
 * rather than raised, and the caller decides whether to say anything.
 */
export type AutosaveWrite = { readonly ok: true } | { readonly ok: false; readonly reason: string };

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Accessing the property itself throws when site data is blocked.
    return null;
  }
}

export function writeAutosave(campaign: Campaign): AutosaveWrite {
  const store = storage();
  if (store === null) {
    return { ok: false, reason: 'This browser is not allowing the app to save in the background.' };
  }

  try {
    store.setItem(AUTOSAVE_KEY, serializeCampaign(campaign));
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'There was no room to save in the background. Export the campaign to a file.',
    };
  }
}

/**
 * The campaign left behind by a previous session, if there is a readable one.
 *
 * Returns `null` when nothing is stored — the ordinary first-run case, not a
 * failure. A stored entry that no longer parses comes back as an error result
 * so the caller can start empty and say why, rather than half-opening
 * something.
 */
export function readAutosave(): SaveFileResult | null {
  const store = storage();
  if (store === null) return null;

  let text: string | null;
  try {
    text = store.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }

  if (text === null) return null;

  return parseCampaignFile(text);
}

export function clearAutosave(): void {
  try {
    storage()?.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing useful to do: the entry is either gone or unreachable, and both
    // leave the exported file as the copy that matters.
  }
}
