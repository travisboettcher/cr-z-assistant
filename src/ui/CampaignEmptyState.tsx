/**
 * What the app shows with nothing loaded — rendered off the store's
 * `status: 'empty'` rather than off a blank campaign, so "no campaign open" is
 * a state the UI reads instead of a shape it fakes.
 *
 * Two ways in: name a new campaign, or import a saved file.
 */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCampaign } from '../state/useCampaign';
import { ImportCampaign } from './ImportCampaign';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export function CampaignEmptyState() {
  const { dispatch } = useCampaign();
  const [name, setName] = useState('');

  const trimmed = name.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === '') {
      return;
    }

    /*
     * The id and timestamp are generated here, at the click, and passed on the
     * action. That is what keeps the reducer a pure function of its inputs —
     * the impure values are the UI's job to capture, not the store's to invent.
     *
     * One clock read for both: the campaign's creation and the log entry that
     * records it are the same moment, and two calls would put a millisecond
     * between them for no reason anyone could explain later.
     */
    const now = new Date().toISOString();

    dispatch({
      type: 'campaign/started',
      name: trimmed,
      id: crypto.randomUUID(),
      createdAt: now,
      at: now,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="new-campaign-heading"
        className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="new-campaign-heading" className="text-xl font-semibold">
          Start a new campaign
        </h2>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          Name it now — you can rename it later.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grow">
            <label htmlFor="campaign-name" className="block text-sm font-medium">
              Campaign name
            </label>
            {/* text-lg is not decoration: below 16px, tablet browsers zoom the
                page on focus and knock the layout sideways mid-game. */}
            <input
              id="campaign-name"
              name="campaign-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Cedar Hollow"
              className={`${TOUCH_TARGET} ${FOCUS_RING} mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-4 py-2 text-lg placeholder:text-stone-400 dark:border-stone-600 dark:bg-stone-800 dark:placeholder:text-stone-500`}
            />
          </div>

          <button
            type="submit"
            disabled={trimmed === ''}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-6 py-2 text-lg font-semibold text-white enabled:hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:bg-amber-500 dark:text-stone-950 dark:enabled:hover:bg-amber-400 dark:disabled:bg-stone-700 dark:disabled:text-stone-400`}
          >
            New campaign
          </button>
        </form>
      </section>

      {/* Nothing is open, so there is nothing an import could destroy. */}
      <ImportCampaign confirmOverwrite={false} />
    </div>
  );
}
