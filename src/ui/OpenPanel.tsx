/**
 * A step's way to the roster or the base, which open in modals beside the turn
 * rather than sitting further down the page (`docs/ux-principles.md`).
 *
 * A step that needs one names it with this, inline, instead of embedding a
 * second copy of the screen or pointing at "the roster below". `App` provides
 * the opener; without one — a component rendered on its own — the words are
 * still there and only the press is missing.
 *
 * Inline words by default. `look` makes it a button instead, for a step whose
 * action *is* opening the modal: the project team's Labor is spent on the base
 * and in the Inventory, and two underlined words in a sentence were missed
 * (#235).
 */

const LOOKS = {
  link: 'rounded font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100',
  primary: `${TOUCH_TARGET} rounded-lg px-4 py-2 font-medium ${PRIMARY_FILL}`,
  secondary: `${TOUCH_TARGET} rounded-lg px-4 py-2 font-medium ${SECONDARY_FILL}`,
} as const;

import { useContext, type ReactNode } from 'react';
import type { CommunityPanel } from './CommunitySummary';
import { PanelOpener } from './panelOpener';
import { FOCUS_RING, PRIMARY_FILL, SECONDARY_FILL, TOUCH_TARGET } from './styles';

export function OpenPanel({
  panel,
  children,
  look = 'link',
}: {
  readonly panel: CommunityPanel;
  readonly children: ReactNode;
  readonly look?: keyof typeof LOOKS;
}) {
  const open = useContext(PanelOpener);
  if (open === null) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => {
        open(panel);
      }}
      className={`${FOCUS_RING} ${LOOKS[look]}`}
    >
      {children}
    </button>
  );
}
