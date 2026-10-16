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

/**
 * Amber, which means act here (`docs/ux-principles.md`): the fill of the one
 * primary action in an area, and of the turn-1 step that is current.
 *
 * amber-700 because the text on it is white and has to clear 4.5:1 in a lit
 * room; amber-600 gave 3.2:1 (#230). The dark theme keeps dark text on
 * amber-500. The hover is `enabled:` so a disabled button doesn't react.
 */
export const PRIMARY_FILL =
  'bg-amber-700 text-white enabled:hover:bg-amber-800 dark:bg-amber-500 dark:text-stone-950 dark:enabled:hover:bg-amber-400';

/**
 * Stone with a border: an action that is available but not the one to take
 * now. A control that is primary only while something is owed swaps between
 * this and `PRIMARY_FILL`, so the two have to occupy the same box (#231).
 */
export const SECONDARY_FILL =
  'border border-stone-300 enabled:hover:bg-stone-100 dark:border-stone-600 dark:enabled:hover:bg-stone-800';
