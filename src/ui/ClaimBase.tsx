/**
 * Choosing where the community lives.
 *
 * A campaign starts with no base, which is a real state rather than a missing
 * one — Start a New Community and Claim a New Base are the missions that
 * resolve it (pg. 54). Until one is claimed there is no slot map to show, so
 * this stands in its place.
 *
 * It lists what a player picking a base actually compares: the Tier, how many
 * slots there are and how many of those start empty, how many Heroes the base
 * allows, and whether it ships a special ability. Nothing it shows is stored —
 * every number is read from the rules data or derived from it.
 */

import { useId, useState } from 'react';
import { BASES, BASE_IDS, maxHeroes, type BaseId } from '../data/bases';
import { useCampaign } from '../state/useCampaign';
import { BASE_LABELS } from './baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export function ClaimBase() {
  const { dispatch } = useCampaign();
  const headingId = useId();
  const chooserId = useId();

  const [choice, setChoice] = useState<BaseId>('small-town-home');

  const rules = BASES[choice];
  const empty = rules.slots.filter((slot) => slot.state === 'empty').length;

  return (
    <section
      id="base"
      aria-labelledby={headingId}
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id={headingId} className="text-xl font-semibold">
        Base
      </h2>
      <p className="mt-1 text-stone-600 dark:text-stone-400">
        No base claimed yet. The Small Town Home is where a new community starts{' '}
        <PageRef pages={54} />.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={chooserId} className="font-medium">
            Choose a base
          </label>
          <select
            id={chooserId}
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value as BaseId);
            }}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`}
          >
            {BASE_IDS.map((id) => (
              <option key={id} value={id}>
                {BASE_LABELS[id]} — Tier {BASES[id].tier}
              </option>
            ))}
          </select>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Tier
            </dt>
            <dd className="text-lg tabular-nums">{rules.tier}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Slots
            </dt>
            <dd className="text-lg tabular-nums">{rules.slots.length}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Start empty
            </dt>
            <dd className="text-lg tabular-nums">{empty}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
              Max Heroes
            </dt>
            {/*
             * The cap Z1-7 deferred for want of a base. It is guidance here
             * rather than a rule with teeth: a community over it loses a Hero
             * of the player's choice, and making someone leave is Phase 3's.
             */}
            <dd className="text-lg tabular-nums">{maxHeroes(rules.tier)}</dd>
          </div>
        </dl>

        {rules.specials.length > 0 && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {/*
             * Phrased as a count after a label rather than a sentence, so there
             * is no plural to agree with. The typecheck rejected the version
             * that had one: every base with specials has two or three, so the
             * singular branch was unreachable — and a phrase that cannot go
             * wrong beats a branch that only exists for data that never occurs.
             */}
            Special abilities: {rules.specials.length} — see the rulebook <PageRef pages="54–71" />
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'base/claimed', base: choice, at: new Date().toISOString() });
            }}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
          >
            Claim this base
          </button>
          {/*
           * Said before the click, not after. Moving house is the Claim a New
           * Base mission and it is Phase 4; until then a claim is the one base
           * decision a campaign gets, and someone should know that before
           * making it rather than discover it when they want to change.
           */}
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Moving to a different base is the Claim a New Base mission, which this version does not
            build yet.
          </p>
        </div>
      </div>
    </section>
  );
}
