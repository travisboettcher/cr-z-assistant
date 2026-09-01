/**
 * The community roster — who is here, and the three things you can do about it.
 *
 * The first screen in the app that holds game state a player created. It shows
 * the stored facts and the derived ones side by side without storing any of the
 * derived ones: HP and item slots are computed on every render by `src/engine`,
 * because the Phase 3 hunger penalty will make any cached value wrong for a
 * whole turn.
 *
 * The full character sheet — stats, all twenty skills, Skill Scores, XP — is
 * its own story. This is the list you build first and glance at afterwards.
 */

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { TIERS, type Tier } from '../data/tiers';
import type { Campaign, Survivor } from '../engine/campaign';
import { communityTierLevels, itemSlots, maxHp } from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';
import { TIER_LABELS } from './tierLabels';

export interface SurvivorRosterProps {
  readonly campaign: Campaign;
}

export function SurvivorRoster({ campaign }: SurvivorRosterProps) {
  const { dispatch } = useCampaign();
  const headingId = useId();
  const nameId = useId();
  const tierId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [tier, setTier] = useState<Tier>(1);
  const [pendingRemoval, setPendingRemoval] = useState<Survivor | null>(null);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === '') return;

    // The UUID is generated here rather than in the reducer: it is the impure
    // part, and the store stays a pure function by taking it as an argument.
    dispatch({ type: 'survivor/added', name: trimmed, tier, id: crypto.randomUUID() });
    setName('');
  }

  function confirmRemoval() {
    if (pendingRemoval !== null) {
      dispatch({ type: 'survivor/removed', id: pendingRemoval.id });
    }
    setPendingRemoval(null);
    dialogRef.current?.close();
  }

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-xl font-semibold">
          Community
        </h2>
        {/*
         * The tier-level total, not a headcount: ten Tier levels is what a
         * starting community is built from, so it is the number a player is
         * actually spending. <PageRef> so they can check the rule rather than
         * take this screen's word for it.
         */}
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {campaign.survivors.length} survivor{campaign.survivors.length === 1 ? '' : 's'} ·{' '}
          {communityTierLevels(campaign.survivors)} tier levels <PageRef pages={48} />
        </p>
      </div>

      <form onSubmit={handleAdd} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="grow basis-48">
          <label htmlFor={nameId} className="block text-sm font-medium">
            Survivor name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          />
        </div>

        <div>
          <label htmlFor={tierId} className="block text-sm font-medium">
            Tier
          </label>
          <select
            id={tierId}
            value={tier}
            onChange={(event) => setTier(Number(event.target.value) as Tier)}
            className={`${FOCUS_RING} mt-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          >
            {TIERS.map((value) => (
              <option key={value} value={value}>
                {value} — {TIER_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
        >
          Add survivor
        </button>
      </form>

      {campaign.survivors.length === 0 ? (
        <p className="mt-6 text-stone-600 dark:text-stone-400">
          No survivors yet. A starting community is built from ten tier levels{' '}
          <PageRef pages={48} />.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {campaign.survivors.map((survivor) => (
            <RosterRow
              key={survivor.id}
              survivor={survivor}
              onRename={(newName) => {
                dispatch({ type: 'survivor/renamed', id: survivor.id, name: newName });
              }}
              onRemove={() => {
                setPendingRemoval(survivor);
                dialogRef.current?.showModal();
              }}
            />
          ))}
        </ul>
      )}

      {/*
       * A real <dialog>, matching the import confirmation: focus trapping and
       * Escape for free, and it looks like part of the app rather than a
       * browser warning. Removing someone is not undoable yet, so it is
       * confirmed.
       */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${headingId}-remove`}
        onClose={() => {
          setPendingRemoval(null);
        }}
        className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id={`${headingId}-remove`} className="text-xl font-semibold">
          Remove this survivor?
        </h2>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {pendingRemoval === null
            ? null
            : `“${pendingRemoval.name}” will be taken off the roster. This cannot be undone.`}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Keep them
          </button>
          <button
            type="button"
            onClick={confirmRemoval}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-red-700 px-5 font-semibold text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500`}
          >
            {/* "Remove them", not "Remove": it mirrors "Keep them", and a
                confirmation button that reads the same as the button that
                opened it is one misread away from the wrong click. */}
            Remove them
          </button>
        </div>
      </dialog>
    </section>
  );
}

interface RosterRowProps {
  readonly survivor: Survivor;
  readonly onRename: (name: string) => void;
  readonly onRemove: () => void;
}

/**
 * Renaming is behind an explicit control rather than an always-live input: on a
 * tablet an always-editable field beside a table is one stray thumb away from
 * quietly renaming somebody.
 */
function RosterRow({ survivor, onRename, onRemove }: RosterRowProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = draft?.trim() ?? '';
    if (trimmed !== '') onRename(trimmed);
    setDraft(null);
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-stone-200 p-4 dark:border-stone-700">
      {draft === null ? (
        <div className="grow basis-48">
          <p className="text-lg font-semibold">{survivor.name}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Tier {survivor.tier} · {TIER_LABELS[survivor.tier]}
          </p>
        </div>
      ) : (
        <form onSubmit={save} className="flex grow basis-48 flex-wrap items-end gap-3">
          <div className="grow">
            <label htmlFor={fieldId} className="block text-sm font-medium">
              Rename {survivor.name}
            </label>
            <input
              id={fieldId}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
            />
          </div>
          <button
            type="submit"
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Save
          </button>
        </form>
      )}

      {/*
       * Both derived, both recomputed here rather than read off the survivor:
       * item slots move with Strength and with the Carry skill, and HP with the
       * Tier. Neither is stored.
       */}
      <dl className="flex shrink-0 gap-4 text-sm">
        <div>
          <dt className="text-stone-500 dark:text-stone-400">HP</dt>
          <dd className="font-semibold tabular-nums">
            {survivor.currentHp} / {maxHp(survivor)}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Slots</dt>
          <dd className="font-semibold tabular-nums">{itemSlots(survivor)}</dd>
        </div>
      </dl>

      <div className="flex shrink-0 flex-wrap gap-2">
        {draft === null && (
          <button
            type="button"
            onClick={() => setDraft(survivor.name)}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Rename
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
