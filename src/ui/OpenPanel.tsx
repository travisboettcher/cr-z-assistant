/**
 * A step's way to the roster or the base, which open in modals beside the turn
 * rather than sitting further down the page (`docs/ux-principles.md`).
 *
 * A step that needs one names it with this, inline, instead of embedding a
 * second copy of the screen or pointing at "the roster below". `App` provides
 * the opener; without one — a component rendered on its own — the words are
 * still there and only the press is missing.
 */

import { useContext, type ReactNode } from 'react';
import type { CommunityPanel } from './CommunitySummary';
import { PanelOpener } from './panelOpener';
import { FOCUS_RING } from './styles';

export function OpenPanel({
  panel,
  children,
}: {
  readonly panel: CommunityPanel;
  readonly children: ReactNode;
}) {
  const open = useContext(PanelOpener);
  if (open === null) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => {
        open(panel);
      }}
      className={`${FOCUS_RING} rounded font-medium text-amber-800 underline underline-offset-2 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100`}
    >
      {children}
    </button>
  );
}
