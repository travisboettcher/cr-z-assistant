/**
 * Inoculation and Rot Resistant, on the three steps they touch (pp. 42, 48,
 * 140; R96, R97, R143; Z7-5): chosen for a survivor assigned to healing in
 * the Planning Phase, given at Heal Wounds, and Rot Resistant's 1 Infection
 * at the start of the Advancement Phase. Each is a small section shown only
 * when it has something to do or something it did this turn, and what each
 * press may do is `inoculation.ts`'s answer.
 */

import type { Campaign } from '../engine/campaign';
import {
  inoculateProblem,
  inoculationFor,
  inoculationProblem,
  inoculationsDue,
  inoculationsHeld,
  rotResistanceDue,
} from '../engine/inoculation';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from '../labels/logLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-600 dark:hover:bg-stone-800`;

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

/** This turn's entries of one kind, in the log's own words. */
function recordedThisTurn(campaign: Campaign, kind: 'survivor-inoculated' | 'infection-resisted') {
  return campaign.log.filter((entry) => entry.turn === campaign.turn && entry.event.kind === kind);
}

/**
 * Planning's Rest and Healing step: an Inoculation from the base's Inventory
 * for anybody assigned to healing, given at the next Heal Wounds in place of
 * their healing (R97, R143).
 */
export function InoculationChoices({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const held = inoculationsHeld(campaign);
  const healing = campaign.survivors.filter(
    (survivor) => campaign.assignments[survivor.id]?.task === 'healing',
  );

  if (held.length === 0 || healing.length === 0) return null;

  return (
    <section aria-label="Inoculations" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Inoculations <PageRef pages={48} />
      </h4>
      <p className={HINT}>
        Somebody assigned to healing can be given an Inoculation at the next Heal Wounds instead of
        their healing, and is Rot Resistant from then on. They can be at full Health.
      </p>
      <ul className="flex flex-col gap-2">
        {healing.map((survivor) => {
          const chosen = inoculationFor(campaign, survivor.id) ?? '';
          const id = `inoculation-${survivor.id}`;
          const offered = held.filter(
            (item) =>
              item.id === chosen || inoculationProblem(campaign, survivor.id, item.id) === null,
          );
          const reason =
            offered.length === 0
              ? inoculationProblem(campaign, survivor.id, held[0]?.id ?? null)
              : null;

          return (
            <li key={survivor.id} className="flex flex-wrap items-center gap-2">
              <label className="text-sm" htmlFor={id}>
                {survivor.name}
              </label>
              <select
                id={id}
                className={SELECT}
                value={chosen}
                disabled={offered.length === 0}
                onChange={(changed) => {
                  dispatch({
                    type: 'planning/inoculationChosen',
                    survivor: survivor.id,
                    item: changed.target.value === '' ? null : changed.target.value,
                  });
                }}
              >
                <option value="">Healing</option>
                {offered.map((item, at) => (
                  <option key={item.id} value={item.id}>
                    An Inoculation{held.length > 1 ? ` (${String(at + 1)})` : ''}
                  </option>
                ))}
              </select>
              {reason !== null && <span className={HINT}>{reason}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Heal Wounds: each Inoculation chosen last Planning Phase, given on a press (R97). */
export function InoculationsGiven({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const due = inoculationsDue(campaign);
  const recorded = recordedThisTurn(campaign, 'survivor-inoculated');

  if (due.length === 0 && recorded.length === 0) return null;

  return (
    <section aria-label="Inoculations" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Inoculations <PageRef pages={48} />
      </h4>
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {due.length > 0 && (
        <p className={HINT}>
          Given in place of healing, so they take no share of the Clinic’s Health this turn.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {due.map(({ survivor }) => {
          const problem = inoculateProblem(campaign, survivor.id);

          return (
            <li key={survivor.id} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={problem !== null}
                onClick={() => {
                  dispatch({
                    type: 'advancement/inoculated',
                    survivor: survivor.id,
                    at: new Date().toISOString(),
                  });
                }}
              >
                Give {survivor.name} the Inoculation
              </button>
              {problem !== null && <span className={HINT}>{problem}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Character Advancement: Rot Resistant's 1 Infection off, first, once a turn (R96). */
export function RotResistance({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const due = rotResistanceDue(campaign);
  const recorded = recordedThisTurn(campaign, 'infection-resisted');

  if (due.length === 0 && recorded.length === 0) return null;

  return (
    <section aria-label="Rot Resistant" className="mb-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Rot Resistant <PageRef pages={140} />
      </h4>
      {recorded.map((entry, index) => (
        <p key={index} className={HINT}>
          {describeEvent(entry.event, entry.turn).text}
        </p>
      ))}
      {due.length > 0 && (
        <>
          <p className={HINT}>
            Everybody Rot Resistant loses 1 Infection at the start of the Advancement Phase:{' '}
            {due.map((survivor) => survivor.name).join(', ')}.
          </p>
          <div>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                dispatch({ type: 'advancement/rotResisted', at: new Date().toISOString() });
              }}
            >
              Take 1 Infection off
            </button>
          </div>
        </>
      )}
    </section>
  );
}
