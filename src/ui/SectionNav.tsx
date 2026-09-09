/**
 * Jump links to the sections of an open campaign, and honest placeholders for
 * the ones later phases will bring.
 *
 * Phase 0 shipped this as five `<button disabled>` elements, on the reasoning
 * that an affordance which looks tappable and does nothing is worse than one
 * that plainly says "not yet". That was right, and it stopped being true one
 * screen at a time: by Phase 3 it was announcing "Turn — not yet" directly
 * above a working turn walk.
 *
 * So the split is now real. A section that exists is a link to it — everything
 * an open campaign holds is on one long page, which is what a tablet standing
 * next to a table wants — and a section that does not is still a disabled
 * button saying so. `disabled` also keeps those out of the tab order, so
 * keyboard focus only ever lands on something that does something.
 */

import { FOCUS_RING, TOUCH_TARGET } from './styles';

/**
 * The Phase 1+ screens, in the order they read left to right.
 *
 * `href` is the section's own anchor, or absent for a screen that does not
 * exist yet. When Phase 4 lands, Missions gains one — the change is a link,
 * not a rewrite.
 */
const SECTIONS = [
  { label: 'Turn', href: '#turn' },
  { label: 'Roster', href: '#roster' },
  { label: 'Base', href: '#base' },
  { label: 'Missions' },
  { label: 'Equipment' },
] as const satisfies readonly { readonly label: string; readonly href?: string }[];

const SHARED = `${TOUCH_TARGET} ${FOCUS_RING} flex flex-col items-start rounded-lg px-4 py-2 text-left whitespace-nowrap`;

export interface SectionNavProps {
  /**
   * Whether a campaign is open. With none, every section is somewhere to go
   * that is not there — the empty state is the whole page.
   */
  readonly campaignOpen: boolean;
}

export function SectionNav({ campaignOpen }: SectionNavProps) {
  return (
    <nav
      aria-label="Campaign sections"
      className="border-b border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900/50"
    >
      {/* Horizontal scroll rather than a wrap or a squeeze: on a tablet held in
          portrait these five never fit, and shrinking them below the touch
          target defeats the point of having one. */}
      <ul className="mx-auto flex w-full max-w-4xl gap-2 overflow-x-auto px-5 py-3">
        {SECTIONS.map((section) => (
          <li key={section.label}>
            {campaignOpen && 'href' in section ? (
              <a
                href={section.href}
                className={`${SHARED} border border-stone-300 text-stone-700 hover:bg-white dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800`}
              >
                <span className="text-base font-medium">{section.label}</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className={`${SHARED} cursor-not-allowed border border-dashed border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400`}
              >
                {/* The explicit space is load-bearing: without it the accessible
                    name concatenates to "MissionsNot yet". */}
                <span className="text-base font-medium">{section.label}</span>{' '}
                <span className="text-xs tracking-wide uppercase">Not yet</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
