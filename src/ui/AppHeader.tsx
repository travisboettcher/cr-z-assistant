/**
 * The standing-at-the-table status bar: which campaign, which turn, which
 * phase. Those three facts are the reason to glance at a tablet mid-game, so
 * they stay pinned at the top and never scroll away.
 */

import type { Campaign } from '../engine/campaign';
import { PHASE_LABELS } from './phaseLabels';

export interface AppHeaderProps {
  /** Omitted while the store reports `status: 'empty'`. */
  readonly campaign?: Campaign;
}

export function AppHeader({ campaign }: AppHeaderProps) {
  return (
    <header className="border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-baseline gap-x-4 gap-y-2">
        <div className="grow">
          <p className="text-xs font-semibold tracking-[0.2em] text-stone-500 uppercase dark:text-stone-400">
            County Road Z
          </p>
          {/*
           * The page is *about* the open campaign, so its name is the h1 and
           * the product name is the eyebrow above it. With nothing open the
           * app itself is the subject and the h1 says so.
           */}
          <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">
            {campaign ? campaign.name : 'Campaign Tracker'}
          </h1>
        </div>

        {campaign ? (
          /*
           * A description list rather than two spans: "Turn" and "Phase" are
           * labels for their values, and a screen reader announcing
           * "Turn, 3" beats announcing "3".
           */
          <dl className="flex shrink-0 items-stretch gap-2">
            <Fact label="Turn" value={String(campaign.turn)} />
            <Fact label="Phase" value={PHASE_LABELS[campaign.phase]} />
          </dl>
        ) : null}
      </div>
    </header>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-center dark:border-stone-700 dark:bg-stone-800">
      <dt className="text-[0.65rem] font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
