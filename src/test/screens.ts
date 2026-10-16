/**
 * Opening the modals the main screen leads to, for screen tests.
 *
 * The roster, the base, the materials, the log and the campaign file each open
 * in a modal over the turn (see `docs/ux-principles.md`), so a test that wants
 * one opens it the way a player does: from its card beside the turn, or from
 * the header menu. Synchronous, through `fireEvent`, so a helper that renders
 * a campaign can open what it is about without making every caller async.
 */

import { fireEvent, screen, within } from '@testing-library/react';

const CARDS = {
  survivors: /^survivors$/i,
  base: /^base$/i,
  materials: /^materials$/i,
  inventory: /^inventory$/i,
} as const;

/**
 * Opens a community card's modal. Each card has one button — Manage or Add
 * survivors, Open or Claim a base, Edit — and this presses it.
 */
export function openPanel(panel: keyof typeof CARDS): void {
  const summary = screen.getByRole('complementary', { name: /community summary/i });
  const card = within(summary).getByRole('region', { name: CARDS[panel] });
  const [button] = within(card).getAllByRole('button');
  if (button === undefined) throw new Error(`The ${panel} card has no button.`);
  fireEvent.click(button);
}

const ITEMS = {
  log: /^campaign log$/i,
  file: /^export, import or start new$/i,
} as const;

/** Opens one of the header menu's modals. */
export function openMenu(item: keyof typeof ITEMS): void {
  fireEvent.click(screen.getByRole('button', { name: /^menu$/i }));
  fireEvent.click(screen.getByRole('button', { name: ITEMS[item] }));
}

/** Closes whichever modal is open, with its Done button. */
export function closePanel(): void {
  fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
}

/**
 * How much of a material is in storage, read off the Materials card beside
 * the turn — the number a player glances at, whichever modal is open.
 */
export function stored(material: RegExp): number {
  const summary = screen.getByRole('complementary', { name: /community summary/i });
  const card = within(summary).getByRole('region', { name: CARDS.materials });
  const term = within(card).getByText(material, { selector: 'dt' });
  return Number(term.nextElementSibling?.textContent);
}

/**
 * The campaign log, opened from the header menu. Whatever modal was open is
 * replaced by it; a test that goes on with something else opens that again.
 */
export function campaignLog(): HTMLElement {
  openMenu('log');
  return screen.getByRole('region', { name: /^history$/i });
}

/** The roster, opened from the Survivors card. */
export function communityRoster(): HTMLElement {
  openPanel('survivors');
  return screen.getByRole('region', { name: /^community$/i });
}

/**
 * Answers the turn walk's "Go on to …?" or "Skip to …?" by going on: the
 * question Next and Skip ask when the move would leave a step owed (#234).
 * Throws when nothing was asked, so a test that passes an owed step says so.
 */
export function goOn(): void {
  const dialog = screen.getByRole('dialog', { name: /^(go on to|skip to) .*\?$/i });
  fireEvent.click(within(dialog).getByRole('button', { name: /^(go on to|skip to) /i }));
}

/**
 * `goOn` when the walk asked, and nothing when it did not: for a test pressing
 * Next or Skip through several steps, only some of which owe something.
 */
export function goOnIfAsked(): void {
  if (screen.queryByRole('dialog', { name: /^(go on to|skip to) .*\?$/i }) !== null) goOn();
}

/** A lane of the assignment board, by its name (`AssignmentBoard`; #237). */
export function lane(name: string | RegExp): HTMLElement {
  return screen.getByRole('region', { name });
}

/**
 * Presses a survivor's card on the assignment board, picking it up (or
 * putting it down). Anchor the pattern at the start of the name, `/^earl/i`,
 * because each lane's "Move Earl Rhodes here" button names the survivor too.
 */
export function pickUp(survivor: RegExp): void {
  fireEvent.click(screen.getByRole('button', { name: survivor }));
}

/** Moves a survivor to a lane, the way a player does: their card, then the lane. */
export function moveTo(survivor: RegExp, to: string | RegExp): void {
  pickUp(survivor);
  fireEvent.click(within(lane(to)).getByRole('button', { name: /^move .* here$/i }));
}
