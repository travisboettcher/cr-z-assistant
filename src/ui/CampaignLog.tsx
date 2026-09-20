/**
 * The campaign's history — what happened, newest first, grouped by turn.
 *
 * Newest first because the question a player has at the table is "what did we
 * just do?", not "how did this campaign begin". Grouped by turn because the
 * turn is the campaign's own clock and the unit anybody thinks in; the
 * timestamp is on each entry for the evening it was played, and is shown small
 * beside the line rather than being the thing you read down.
 *
 * Renders nothing at all for an empty log. A brand-new campaign has no history,
 * and an empty panel headed "History" is a screen apologising for itself.
 */

import type { Campaign } from '../engine/campaign';
import type { LogEntry } from '../engine/log';
import { PHASE_LABELS } from './turnLabels';
import { PageRef } from './PageRef';
import { describeEvent } from './logLabels';

export interface CampaignLogProps {
  readonly campaign: Campaign;
}

interface TurnGroup {
  readonly turn: number;
  readonly entries: readonly LogEntry[];
}

/**
 * The log split into turns, newest turn first and newest entry first inside
 * each.
 *
 * Built by walking the log backwards rather than grouping into a map and
 * sorting: entries are already in the order they happened, so reversing them
 * puts both levels in the right order at once, and a turn that somehow appeared
 * twice would show as two groups rather than being silently merged into one.
 */
function byTurn(log: readonly LogEntry[]): readonly TurnGroup[] {
  const groups: TurnGroup[] = [];

  for (let index = log.length - 1; index >= 0; index -= 1) {
    const entry = log[index];
    if (entry === undefined) continue;

    const open = groups[groups.length - 1];

    if (open === undefined || open.turn !== entry.turn) {
      groups.push({ turn: entry.turn, entries: [entry] });
    } else {
      groups[groups.length - 1] = { turn: open.turn, entries: [...open.entries, entry] };
    }
  }

  return groups;
}

export function CampaignLog({ campaign }: CampaignLogProps) {
  if (campaign.log.length === 0) return null;

  const groups = byTurn(campaign.log);

  return (
    <section
      aria-labelledby="campaign-log-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="campaign-log-heading" className="text-xl font-semibold">
        History
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Everything that has happened, newest first. Nothing here can be edited.
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.turn}>
            <h3 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Turn {group.turn}
            </h3>

            <ol className="mt-2 flex flex-col gap-2">
              {group.entries.map((entry, index) => {
                const label = describeEvent(entry.event);

                return (
                  <li
                    /*
                     * The index within the turn is part of the key because two
                     * identical events can legitimately land in the same turn
                     * and phase — two Extra Beds on one facility, say — and
                     * nothing on an entry distinguishes them. Positions inside
                     * a group are stable: the log is append-only, so an entry
                     * never moves once it is written.
                     */
                    key={`${entry.at}-${index}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 border-stone-200 pl-3 dark:border-stone-700"
                  >
                    <span className="text-xs whitespace-nowrap text-stone-500 tabular-nums dark:text-stone-400">
                      {PHASE_LABELS[entry.phase]}
                    </span>
                    <span className="grow">{label.text}</span>
                    {label.pages !== undefined && <PageRef pages={label.pages} />}
                    <time
                      dateTime={entry.at}
                      className="text-xs whitespace-nowrap text-stone-400 tabular-nums dark:text-stone-500"
                    >
                      {new Date(entry.at).toLocaleString()}
                    </time>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
