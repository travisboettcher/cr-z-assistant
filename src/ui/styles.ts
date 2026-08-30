/**
 * Class fragments shared across the shell.
 *
 * Only the ones that must stay identical everywhere live here. A focus ring
 * that differs between two buttons is a bug nobody notices at a desk and
 * everybody notices on a tablet in a lit room, so it is defined once rather
 * than retyped per component.
 */

/** Visible in both themes, and offset so it never sits on the control's edge. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400';

/**
 * `--spacing-touch` (2.75rem) is the comfortable thumb target from `index.css`.
 * Applied as a minimum on both axes so a short label ("Base") still gets a
 * target the same size as a long one.
 */
export const TOUCH_TARGET = 'min-h-touch min-w-touch';
