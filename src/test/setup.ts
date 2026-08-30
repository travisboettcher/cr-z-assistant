import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Testing Library registers its own cleanup only when Vitest runs with
 * `globals: true`. This project uses explicit imports instead, so without this
 * every render would leave its tree in the document and the next query would
 * match twice.
 */
afterEach(cleanup);

/**
 * Autosave writes to `localStorage`, so without this a campaign created in one
 * test would be restored by the next one that boots the provider — a
 * cross-test dependency that shows up as a baffling failure in an unrelated
 * file.
 */
afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // A suite that stubbed storage may have removed clear(); nothing to do.
  }
});

/**
 * jsdom implements the `<dialog>` element and its `open` property but not
 * `showModal()` or `close()`, so a component that opens a dialog throws under
 * test while working perfectly in a browser.
 *
 * This is the smallest stand-in that lets the surrounding behaviour be tested:
 * toggling `open` and firing `close`. It is **not** a modality polyfill — it
 * does not trap focus, does not render a backdrop, and does not close on
 * Escape. Those are real behaviours this project relies on, and they are
 * covered where they actually exist: the Playwright suite in `e2e/`, running
 * against real Chromium.
 */
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function close(
    this: HTMLDialogElement,
    returnValue?: string,
  ) {
    if (!this.open) return;
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}
