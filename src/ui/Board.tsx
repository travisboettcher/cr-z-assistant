/**
 * The pieces every board draws with (`docs/assignment-board.md`): the Planning
 * Phase's assignments, turn 1's First Mission team and Equip the Mission
 * Team's items and vehicles.
 *
 * **Two columns on a tablet.** What can be picked up is on the left and where
 * it goes is on the right, which scrolls on its own so a long roster does not
 * push what is being moved off the screen. Below that width the two stack, the
 * left one first.
 *
 * **A card is one shape everywhere**, a name and a line or two about it.
 *
 * **A lane says what it would do with the picked card** in a drop zone across
 * its width: dashed amber and a press where the move can be made, with any
 * warning inside it; grey, with the reason, where it cannot.
 */

import { useId, type ReactNode } from 'react';
import { PageRef } from './PageRef';
import { boardCard } from './styles';

const HEADING =
  'text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400';

/** The two columns: what can be picked up, and where it goes. */
export function BoardColumns({
  sourceTitle,
  targetTitle,
  sources,
  targets,
}: {
  readonly sourceTitle: string;
  readonly targetTitle: string;
  readonly sources: ReactNode;
  readonly targets: ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
        <h3 className={HEADING}>{sourceTitle}</h3>
        {sources}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className={HEADING}>{targetTitle}</h3>
        <div className="flex flex-col gap-3 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto md:rounded-xl md:bg-stone-50 md:p-2 md:dark:bg-stone-950/40">
          {targets}
        </div>
      </div>
    </div>
  );
}

/** One lane: a named region holding its cards, then its drop zone. */
export function LaneFrame({
  name,
  pages,
  id,
  detail,
  children,
}: {
  readonly name: string;
  readonly pages?: number | string;
  /** An anchor for a link that jumps to this lane, such as Getting started's (#238). */
  readonly id?: string;
  /** What the lane says about itself beside its name: slots in use, Labor. */
  readonly detail?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      // Focusable from a link to it, so the jump moves the keyboard too.
      tabIndex={id === undefined ? undefined : -1}
      aria-label={name}
      className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold">
          {name} {pages !== undefined && <PageRef pages={pages} />}
        </h4>
        {detail}
      </div>
      {children}
    </section>
  );
}

/** A lane's cards, or what it says when it holds none. */
export function CardRow({
  empty,
  children,
}: {
  readonly empty: string;
  readonly children: readonly ReactNode[];
}) {
  return children.length === 0 ? (
    <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{empty}</p>
  ) : (
    <ul className="mt-2 flex flex-wrap gap-2">{children}</ul>
  );
}

/**
 * A card: something that can be picked up, its name and a line or two about
 * it. The name is what the button is called, and the lines describe it, so a
 * screen reader hears "Tom Ash, Tier 2, 2/2 Health" and a test finds the card
 * by name alone.
 */
export function BoardCard({
  title,
  lines = [],
  picked,
  onPress,
}: {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly picked: boolean;
  readonly onPress: () => void;
}) {
  const id = useId();
  const shown = lines.filter((line) => line !== '');

  return (
    <li className="flex">
      <button
        type="button"
        aria-pressed={picked}
        aria-label={title}
        {...(shown.length === 0 ? {} : { 'aria-describedby': id })}
        className={boardCard(picked)}
        onClick={onPress}
      >
        <span className="line-clamp-2 text-sm leading-tight font-semibold">{title}</span>
        {shown.length > 0 && (
          <span
            id={id}
            className="flex flex-col text-xs text-stone-600 tabular-nums dark:text-stone-400"
          >
            {shown.map((line, at) => (
              <span key={line}>
                {/* Heard as a list, not run together. */}
                {at > 0 && <span className="sr-only">, </span>}
                {line}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

/** A reason shown in a drop zone, with the page it comes from. */
export interface ZoneNote {
  readonly key: string;
  readonly message: string;
  readonly pages?: number | string;
}

/**
 * Where the picked card can go in this lane: dashed amber, holding the press
 * and any warning about it. `children` is the press, or the presses when a
 * move asks first.
 */
export function DropZone({
  warnings = [],
  children,
}: {
  readonly warnings?: readonly ZoneNote[];
  readonly children: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border-2 border-dashed border-amber-600 bg-amber-50/60 p-1 dark:border-amber-400 dark:bg-amber-950/30">
      <div className="flex flex-wrap gap-1">{children}</div>
      {warnings.map((warning) => (
        <p key={warning.key} className="px-3 pb-1 text-xs text-amber-800 dark:text-amber-300">
          {warning.message} {warning.pages !== undefined && <PageRef pages={warning.pages} />}
        </p>
      ))}
    </div>
  );
}

/** Where the picked card cannot go in this lane: grey, and why, with nothing to press. */
export function RefusedZone({ reasons }: { readonly reasons: readonly ZoneNote[] }) {
  return (
    <div className="mt-3 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-stone-500 dark:border-stone-600 dark:bg-stone-800/50 dark:text-stone-400">
      <p className="text-sm font-medium">Can’t go here</p>
      {reasons.map((reason) => (
        <p key={reason.key} className="text-xs">
          {reason.message} {reason.pages !== undefined && <PageRef pages={reason.pages} />}
        </p>
      ))}
    </div>
  );
}
