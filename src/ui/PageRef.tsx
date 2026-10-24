/**
 * A reference back to the rulebook.
 *
 * The app ships no rule text — it holds the numbers needed to compute state and
 * points at the page for everything else. That only works if the pointer is
 * consistent and unmissable, so every citation goes through here rather than
 * being typed inline as "(p8)" on one screen and "pg 8" on the next.
 *
 * Deferred from Z0-7 until a screen actually needed to cite something.
 */

export interface PageRefProps {
  /**
   * A page (`41`) or a range (`'38–39'`). Absent for something the book does
   * not print, such as an Other mission (#259), which cites nothing.
   */
  readonly pages: number | string | undefined;
}

export function PageRef({ pages }: PageRefProps) {
  if (pages === undefined) return null;

  return (
    <span className="text-xs whitespace-nowrap text-stone-600 tabular-nums dark:text-stone-400">
      {/*
       * "pg." is an abbreviation a screen reader would spell out or mangle, and
       * a citation read aloud as "pee gee forty-one" is worse than useless. The
       * visible text stays compact for a tablet; the announced text is a
       * sentence.
       */}
      <span className="sr-only">Rulebook page {pages}</span>
      <span aria-hidden="true">pg.&nbsp;{pages}</span>
    </span>
  );
}
