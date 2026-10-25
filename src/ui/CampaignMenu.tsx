/**
 * The header's menu: everything about the campaign that is not playing a turn.
 *
 * The log, the campaign file (export, import, start again) and which build is
 * running. None of it is needed mid-turn, so none of it takes room on the main
 * screen — but whether the campaign has been exported is a fact a player can
 * lose a campaign by not knowing, so it is repeated here in a line rather than
 * hidden behind a second press.
 *
 * A disclosure rather than a `<dialog>`: it is a short list of places to go,
 * and each item closes it and opens the modal that does the work.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useCampaign } from '../state/useCampaign';
import { AppVersion } from './AppVersion';
import { exportState } from './exportLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

/** What a menu item opens. */
export type MenuPanel = 'log' | 'settings' | 'file';

export interface CampaignMenuProps {
  readonly onOpen: (panel: MenuPanel) => void;
}

const ITEM = `${TOUCH_TARGET} ${FOCUS_RING} w-full rounded-lg px-3 text-left hover:bg-stone-100 dark:hover:bg-stone-800`;

export function CampaignMenu({ onOpen }: CampaignMenuProps) {
  const { everExported, unsavedChanges } = useCampaign();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  /*
   * A press anywhere outside closes it, as a menu does. Listened for only
   * while it is open, so a closed menu costs the page nothing.
   */
  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
    };
  }, [expanded]);

  function go(panel: MenuPanel) {
    setExpanded(false);
    onOpen(panel);
  }

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setExpanded(false);
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setExpanded((open) => !open);
        }}
        className={`${TOUCH_TARGET} ${FOCUS_RING} flex items-center justify-center rounded-lg border border-stone-300 bg-white hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:hover:bg-stone-800`}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span className="sr-only">Menu</span>
      </button>

      {expanded && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-stone-300 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          <ul className="flex flex-col">
            <li>
              <button type="button" className={ITEM} onClick={() => go('log')}>
                Campaign log
              </button>
            </li>
            <li>
              <button type="button" className={ITEM} onClick={() => go('settings')}>
                Campaign settings
              </button>
            </li>
            <li>
              <button type="button" className={ITEM} onClick={() => go('file')}>
                Export, import or start new
              </button>
            </li>
          </ul>
          <div className="mt-2 flex flex-col gap-1 border-t border-stone-200 px-3 pt-3 pb-1 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
            <p>{exportState(everExported, unsavedChanges)}</p>
            <AppVersion version={import.meta.env.VITE_APP_VERSION} />
          </div>
        </div>
      )}
    </div>
  );
}
