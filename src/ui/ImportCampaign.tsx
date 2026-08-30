/**
 * Importing a saved campaign — the other half of the round trip.
 *
 * Used from two places: the empty state, where it is one of the two ways in,
 * and the open campaign, where it replaces what is already loaded. Those differ
 * only in whether the overwrite has to be confirmed, so they share this
 * component rather than growing two that drift apart.
 *
 * The UI only renders and dispatches: reading and validating the file belongs
 * to `src/persistence`, and the campaign reaches the store as one
 * `campaign/loaded` action.
 */

import { useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { Campaign } from '../engine/campaign';
import { readCampaignFile } from '../persistence/saveFile';
import { useCampaign } from '../state/useCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface ImportCampaignProps {
  /**
   * When a campaign is already open, importing throws away unsaved work, so it
   * is confirmed first. The empty state has nothing to lose and imports
   * straight away.
   */
  readonly confirmOverwrite: boolean;
}

export function ImportCampaign({ confirmOverwrite }: ImportCampaignProps) {
  const { dispatch } = useCampaign();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<Campaign | null>(null);

  async function handleFile(file: File | undefined) {
    if (file === undefined) return;

    setError(null);
    const result = await readCampaignFile(file);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    if (confirmOverwrite) {
      setPending(result.campaign);
      dialogRef.current?.showModal();
      return;
    }

    dispatch({ type: 'campaign/loaded', campaign: result.campaign });
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    // Cleared so picking the same file twice in a row still fires a change.
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  function confirm() {
    if (pending !== null) {
      dispatch({ type: 'campaign/loaded', campaign: pending });
    }
    setPending(null);
    dialogRef.current?.close();
  }

  return (
    <>
      {/*
       * The drop target is the panel itself. Drag and drop is a desktop
       * affordance — there is no dragging a file on a tablet — so it augments
       * the picker rather than replacing it, and the button is what the tablet
       * actually uses.
       */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={handleDrop}
        className={`rounded-xl border border-dashed p-6 transition-colors ${
          dragging
            ? 'border-amber-600 bg-amber-50 dark:border-amber-400 dark:bg-amber-950/30'
            : 'border-stone-300 dark:border-stone-700'
        }`}
      >
        <h2 className="text-xl font-semibold">Import a saved campaign</h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          Open a <code>.json</code> file exported from this app. You can also drag one onto this
          panel.
        </p>

        <label htmlFor={inputId} className="sr-only">
          Campaign file
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/json,.json"
          onChange={handleChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`${TOUCH_TARGET} ${FOCUS_RING} mt-5 rounded-lg border border-stone-300 px-6 py-2 text-lg font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          Choose a file
        </button>

        {/*
         * The message is the whole point of the parser returning results
         * instead of throwing: every failure has a sentence someone can act on,
         * and it belongs next to the control that produced it.
         */}
        {error !== null && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </p>
        )}
      </div>

      {/*
       * A real <dialog> rather than window.confirm: the native one cannot be
       * styled or tested, and reads as a browser warning rather than part of
       * the app. This gets focus trapping and Escape for free.
       */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${inputId}-confirm`}
        onClose={() => {
          setPending(null);
        }}
        className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id={`${inputId}-confirm`} className="text-xl font-semibold">
          Replace the open campaign?
        </h2>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {pending === null
            ? null
            : `Opening “${pending.name}” closes the campaign you have open. Anything not exported ` +
              'to a file will be lost.'}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Keep the open campaign
          </button>
          <button
            type="button"
            onClick={confirm}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
          >
            Replace it
          </button>
        </div>
      </dialog>
    </>
  );
}
