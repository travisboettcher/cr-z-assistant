/**
 * A campaign picked up partway (#210; `docs/continue-campaign.md`).
 *
 * Such a campaign starts at the beginning of a turn with one
 * `campaign-continued` entry holding what the log would otherwise know from
 * the turns before it. The readers that look back across turns (the siege
 * counter, last turn's Feed, the stories finished, the Magic and Viral
 * unlocks) each read it here beside the entries they read already, so the
 * answer comes from one function whether the history was played here or
 * entered.
 *
 * Pure, like the rest of `src/engine`.
 */

import type { Campaign } from './campaign';
import type { ContinuedHistory, LogEntry } from './log';

/** The `campaign-continued` entry and the turn it was picked up at, or `undefined`. */
export function continuedFrom(
  campaign: Campaign,
): { readonly turn: number; readonly history: ContinuedHistory } | undefined {
  const entry = campaign.log.find(
    (one): one is LogEntry & { readonly event: { readonly kind: 'campaign-continued' } } =>
      one.event.kind === 'campaign-continued',
  );

  return entry === undefined
    ? undefined
    : { turn: entry.turn, history: entry.event as ContinuedHistory };
}
