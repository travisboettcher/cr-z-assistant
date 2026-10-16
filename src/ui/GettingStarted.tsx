/**
 * The three things a new campaign's first turn needs, above the turn walk.
 *
 * A new campaign opened onto a turn walk at Select Mission with nobody in the
 * community and no base, and nothing said that either was wrong: the roster
 * and the base were further down the page, and the whole of turn 1 could be
 * walked without them. This says what to do first, in order, and goes away
 * once it is done or the first turn is over.
 *
 * What is done and what is next is `firstTurnChecklist`'s answer, which the
 * summary cards read too: while this is on screen it holds turn 1's primary
 * action, and their empty states stand back (#231). It is guidance, never a
 * gate: nothing here stops the walk (R33).
 */

import { STARTING_COMMUNITY_TIER_LEVELS } from '../data/tiers';
import type { Campaign } from '../engine/campaign';
import { firstTurnChecklist } from '../engine/firstTurn';
import { communityTierLevels } from '../engine/survivor';
import type { ReactNode } from 'react';
import { PageRef } from './PageRef';
import { FOCUS_RING, PRIMARY_FILL, TOUCH_TARGET } from './styles';

export interface GettingStartedProps {
  readonly campaign: Campaign;
  readonly onAddSurvivors: () => void;
  readonly onClaimBase: () => void;
}

const ACT = `${TOUCH_TARGET} ${FOCUS_RING} shrink-0 rounded-lg ${PRIMARY_FILL} px-4 font-semibold`;

export function GettingStarted({ campaign, onAddSurvivors, onClaimBase }: GettingStartedProps) {
  const checklist = firstTurnChecklist(campaign);
  if (checklist === null) return null;

  const { community, team, base, next } = checklist;

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="rounded-xl border-2 border-amber-500 bg-amber-50 p-5 dark:border-amber-400 dark:bg-amber-950/30"
    >
      <h2 id="getting-started-heading" className="text-lg font-semibold">
        Getting started
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Three things to do on your first turn. This list goes away when they are done.
      </p>

      <ol className="mt-4 flex flex-col gap-2">
        <Item
          number={1}
          done={community}
          current={next === 'community'}
          title="Build your starting community"
          detail={
            <>
              <span className="tabular-nums">{communityTierLevels(campaign.survivors)}</span> of{' '}
              {STARTING_COMMUNITY_TIER_LEVELS} Tier levels so far. When it is complete, mark it
              built in the roster <PageRef pages={48} />
            </>
          }
          action={
            <button type="button" onClick={onAddSurvivors} className={ACT}>
              {campaign.survivors.length === 0 ? 'Add survivors' : 'Open roster'}
            </button>
          }
        />
        <Item
          number={2}
          done={team}
          current={next === 'team'}
          title="Choose who plays the First Mission"
          detail={
            <>
              In this turn’s Mission Phase <PageRef pages={75} />
            </>
          }
        />
        <Item
          number={3}
          done={base}
          current={next === 'base'}
          title="Claim your base"
          detail={
            <>
              Playing the First Mission claims it <PageRef pages="54, 76–77" />
            </>
          }
          action={
            <button type="button" onClick={onClaimBase} className={ACT}>
              Claim a base
            </button>
          }
        />
      </ol>
    </section>
  );
}

interface ItemProps {
  readonly number: number;
  readonly done: boolean;
  /** The first item not done: the one with the action shown. */
  readonly current: boolean;
  readonly title: string;
  readonly detail: ReactNode;
  readonly action?: ReactNode;
}

function Item({ number, done, current, title, detail, action }: ItemProps) {
  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 dark:bg-stone-900 ${
        current
          ? 'border-amber-300 dark:border-amber-700'
          : 'border-stone-200 dark:border-stone-800'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-full font-bold ${
          done
            ? 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
            : current
              ? PRIMARY_FILL
              : 'border-2 border-stone-400 text-stone-600 dark:text-stone-400'
        }`}
      >
        {done ? '✓' : number}
      </span>
      <div className="min-w-0 grow basis-48">
        <p
          className={`font-semibold ${done ? 'text-stone-500 line-through dark:text-stone-400' : ''}`}
        >
          {title}
          {/* Words for what the tick and the strike-through show. */}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        {!done && <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{detail}</p>}
      </div>
      {current && action}
    </li>
  );
}
