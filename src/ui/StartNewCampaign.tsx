/**
 * Starting a fresh campaign while one is open.
 *
 * Deliberately behind a dialog rather than a bare button. With autosave in
 * place the browser copy is silently replaced the moment a new campaign
 * starts, so this is the one action in Phase 0 that can destroy work without
 * touching a file — and it says so, in the case where it is actually true.
 */

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useCampaign } from '../state/useCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export function StartNewCampaign() {
  const { dispatch, unsavedChanges, everExported } = useCampaign();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const nameId = useId();
  const [name, setName] = useState('');

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === '') return;

    // One clock read for both, as in `CampaignEmptyState`.
    const now = new Date().toISOString();

    dispatch({
      type: 'campaign/started',
      name: trimmed,
      id: crypto.randomUUID(),
      createdAt: now,
      at: now,
    });

    setName('');
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
      >
        Start a new campaign
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onClose={() => {
          setName('');
        }}
        className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id={headingId} className="text-xl font-semibold">
          Start a new campaign?
        </h2>

        {/*
         * Only warned about when there is something to lose. A warning shown
         * every time is one nobody reads by the third campaign.
         *
         * "Nothing is lost" is the sentence that has to be earned, and it was
         * not: a campaign restored from the autosave and never exported read
         * as matching a file, so this offered to destroy the only copy while
         * promising the opposite.
         */}
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {!everExported
            ? 'The campaign you have open has never been exported. Starting a new one replaces the browser’s copy, and it will be gone.'
            : unsavedChanges
              ? 'The campaign you have open has changed since your last export. Starting a new one replaces the browser’s copy, and those changes will be gone.'
              : 'This closes the campaign you have open. It matches your last exported file, so nothing is lost.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor={nameId} className="block text-sm font-medium">
            New campaign name
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Millbrook"
            className={`${TOUCH_TARGET} ${FOCUS_RING} mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-2 text-lg placeholder:text-stone-400 dark:border-stone-600 dark:bg-stone-800 dark:placeholder:text-stone-500`}
          />

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={trimmed === ''}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white enabled:hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:bg-amber-500 dark:text-stone-950 dark:enabled:hover:bg-amber-400 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
            >
              Start it
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
