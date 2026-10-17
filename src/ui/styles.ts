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

/**
 * A card on a board, picked up or not: the Planning Phase's survivors, and
 * Equip the Mission Team's items and vehicles (`docs/assignment-board.md`).
 * One width and at least one height, so a lane reads as a row of like things;
 * a row's cards stretch to its tallest.
 */
export function boardCard(picked: boolean): string {
  return `${FOCUS_RING} flex min-h-[88px] w-[152px] flex-col justify-between gap-1 rounded-xl border px-3 py-2 text-left shadow-sm transition ${
    picked
      ? '-translate-y-0.5 border-amber-600 bg-amber-50 shadow-md ring-2 ring-amber-600 dark:border-amber-400 dark:bg-amber-950/40 dark:ring-amber-400'
      : 'border-stone-300 bg-white hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:hover:bg-stone-800'
  }`;
}

/**
 * The press inside a lane's drop zone: the whole width of the lane, so it
 * reads as a place to put something rather than one more card.
 */
export const BOARD_DROP = `${TOUCH_TARGET} ${FOCUS_RING} w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40`;

/** A quieter press beside it, such as "Leave it" when a move asks first. */
export const BOARD_QUIET = `${TOUCH_TARGET} ${FOCUS_RING} rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800`;
