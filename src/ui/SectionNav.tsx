/**
 * Placeholders for the screens later phases will bring.
 *
 * These are real `<button disabled>` elements, not links or styled divs: none
 * of these screens exists yet, and an affordance that looks tappable and does
 * nothing is worse than one that plainly says "not yet". `disabled` also keeps
 * them out of the tab order, so keyboard focus only ever lands on things that
 * do something.
 */

import { FOCUS_RING, TOUCH_TARGET } from './styles';

/** The Phase 1+ screens, in the order they will read left to right. */
const SECTIONS = ['Roster', 'Base', 'Turn', 'Missions', 'Equipment'] as const;

export function SectionNav() {
  return (
    <nav
      aria-label="Campaign sections"
      className="border-b border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900/50"
    >
      {/* Horizontal scroll rather than a wrap or a squeeze: on a tablet held in
          portrait these five never fit, and shrinking them below the touch
          target defeats the point of having one. */}
      <ul className="mx-auto flex w-full max-w-4xl gap-2 overflow-x-auto px-5 py-3">
        {SECTIONS.map((label) => (
          <li key={label}>
            <button
              type="button"
              disabled
              className={`${TOUCH_TARGET} ${FOCUS_RING} flex cursor-not-allowed flex-col items-start rounded-lg border border-dashed border-stone-300 px-4 py-2 text-left whitespace-nowrap text-stone-500 dark:border-stone-700 dark:text-stone-400`}
            >
              {/* The explicit space is load-bearing: without it the accessible
                  name concatenates to "RosterNot yet". */}
              <span className="text-base font-medium">{label}</span>{' '}
              <span className="text-xs tracking-wide uppercase">Not yet</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
