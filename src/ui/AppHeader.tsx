/**
 * The standing-at-the-table status bar: which campaign, which turn, which
 * phase. Those three facts are the reason to glance at a tablet mid-game, so
 * they stay pinned at the top and never scroll away.
 */

import type { ReactNode } from 'react';
import type { Campaign } from '../engine/campaign';
import { phaseOf } from '../engine/turn';
import { PHASE_LABELS, STEP_LABELS } from '../labels/turnLabels';

export interface AppHeaderProps {
  /** Omitted while the store reports `status: 'empty'`. */
  readonly campaign?: Campaign;
  /** The campaign menu, at the end of the bar. Absent with nothing open. */
  readonly menu?: ReactNode;
}

export function AppHeader({ campaign, menu }: AppHeaderProps) {
  return (
    <header className="border-b border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
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
           * A description list rather than three spans: "Turn", "Phase" and
           * "Step" are labels for their values, and a screen reader announcing
           * "Turn, 3" beats announcing "3".
           *
           * The step is here as well as on the walk itself, because this is the
           * line that stays put while the rest of the screen scrolls — and
           * "where are we?" is the question a tablet on a table gets asked most.
           *
           * Below `sm` it goes under the name and the menu, with the step on a
           * row of its own where a long name can wrap, rather than pushing the
           * page wider than a phone (#232). A fixed grid, so the header is the
           * same height whichever step it names.
           */
          <dl className="order-last grid w-full grid-cols-[auto_1fr] gap-2 sm:order-none sm:flex sm:w-auto sm:items-stretch">
            <Fact label="Turn" value={String(campaign.turn)} />
            <Fact label="Phase" value={PHASE_LABELS[phaseOf(campaign.step)]} />
            <Fact label="Step" value={STEP_LABELS[campaign.step]} className="col-span-2" />
          </dl>
        ) : null}

        {menu}
      </div>
    </header>
  );
}

function Fact({
  label,
  value,
  className = '',
}: {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <div
      // Plain text with a rule between, not a bordered box: the boxes shared
      // the ☰ button's style and read as something to press (#240).
      className={`${className} border-stone-200 px-4 py-1 text-left first:pl-0 sm:border-l sm:first:border-l-0 dark:border-stone-700`}
    >
      <dt className="text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
