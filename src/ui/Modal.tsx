/**
 * A large modal for editing something the main screen only summarises — the
 * roster, the base, the materials, the log, the campaign file.
 *
 * **The main screen summarises; a modal edits.** That is the layout's one
 * rule (see `docs/ux-principles.md`): the turn walk and the summaries of the
 * community stay on one screen, and anything with a form in it opens over
 * them rather than pushing them down the page. A modal closes back to exactly
 * where the player was, which a scroll to a section never did.
 *
 * Built on the native `<dialog>`, as the confirmations already were, so focus,
 * Escape and the backdrop are the browser's. Its contents are rendered only
 * while it is open: a closed roster is not a second copy of the survivors in
 * the page for anything — a test, a screen reader — to find.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  /** Called however it closes: Done, Escape, or the browser closing it. */
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={(event) => {
        /*
         * Its own close only. React passes `close` up through the component
         * tree as though it bubbled, so a confirmation `<dialog>` inside this
         * one — removing a survivor, taking a skill anyway — closing would
         * otherwise close the whole modal behind it.
         */
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-2xl bg-white p-0 text-stone-900 backdrop:bg-stone-950/55 dark:bg-stone-900 dark:text-stone-100"
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex items-center gap-4 border-b border-stone-200 px-6 py-4 dark:border-stone-800">
            <h2 id={headingId} className="grow text-xl font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-stone-900 px-5 font-semibold text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-300`}
            >
              Done
            </button>
          </div>
          <div className="overflow-y-auto p-4 sm:p-6">{children}</div>
        </div>
      )}
    </dialog>
  );
}
