# UX principles

How the app is laid out, and the rules a new screen follows so it fits in. The turn walk has its
own design document ([`turn-walk-interaction.md`](turn-walk-interaction.md)), and so does the base
([`base-slot-interaction.md`](base-slot-interaction.md)). This is the frame both of them sit in.

Written with the single-pane layout, from the first play-through feedback on the deployed app. The
page was five sections stacked one under another, with a strip of jump links for scrolling between
them. A new campaign opened onto a turn walk with nobody in it, and the roster and the base were
further down the page. The whole of turn 1 could be walked without either, and nothing said so.

## Who it is for

**One person at a table, holding a tablet, with miniatures in front of them.** They glance at the
screen between moves, at arm's length, often with somebody else talking. Every rule below follows
from that.

- **Built for a tablet first.** The end-to-end suite runs at 820 × 1180, a portrait tablet. A
  landscape tablet or a laptop gets the two-column layout. A phone still works, and it scrolls.
- **Controls big enough for a thumb.** `TOUCH_TARGET` in `src/ui/styles.ts` on everything pressable,
  `FOCUS_RING` on everything focusable.
- **Readable in a lit room, in light and dark themes.** Every colour has its `dark:` pair.

## The layout: one screen

```
┌──────────────────────────────────────────────────────────────┐
│ Campaign name          Turn · Phase · Step              [☰]  │  header: where are we
├────────────────────────────────────────┬─────────────────────┤
│ Getting started (turn 1 only)          │ Survivors   [Manage]│
│                                        │ Base          [Open]│  summary: who and where
│ The turn walk                          │ Materials     [Edit]│
│   phases · steps · this step           │ Inventory     [Open]│
└────────────────────────────────────────┴─────────────────────┘
   opens over it ─▶  [ modal: roster / base / materials / inventory / log / file ]
```

1. **The header says where the table is**: the campaign, the turn, the phase and the step. It is
   what a player glances at most, so it never moves. The ☰ menu holds everything that is not
   playing a turn: the campaign log, the campaign file (export, import, start again), whether the
   campaign has been exported, and which build is running.
2. **The turn walk is the screen.** It takes the main column, because "what do we do now" is the
   question the app exists to answer.
3. **The community summary sits beside it.** It has four cards: survivors, base, materials and the
   base's Inventory, which holds its vehicles too. On a portrait tablet they become a row of four above the turn, and two by two
   on anything narrower. They hold the numbers a player
   looks up mid-turn without wanting to go anywhere.
4. **Anything that edits opens in a modal** over that screen, and closes back to it.

### The rules that follow from it

**The main screen summarises; a modal edits.** A card shows numbers and one button. Forms, lists of
controls and anything with a confirmation go in the modal that button opens. A new feature that
wants a section of its own on the main screen is a card plus a modal, or a step inside the turn
walk. It never becomes a third column or a section further down the page.

**One modal at a time, one layer deep.** A survivor's sheet replaces the roster inside the same
modal, with "Close sheet" going back to the list; it does not open a second modal on top. A
confirmation (`<dialog>`) inside a modal is fine. It is a question, not a place. `Modal` closes
only on its own `close` event, so a confirmation closing does not close it too.

**A modal belongs to the campaign it was opened for.** Starting or importing a campaign from
inside one closes it rather than leaving it open over a different campaign.

**Which modal is open is UI state.** It is held in `App` and never reaches the `Campaign` or the
save file, the same as which survivor's sheet is open.

**The turn walk stays where it is.** A step that needs the roster or the base names it with
`OpenPanel`, an inline button that opens that modal. It does not embed a second copy of the screen,
and it never says "below" or "above": there is no below. The walk owns the order of the turn, and
the modals own the community's facts.

**Never only in the menu.** Anything that can lose a campaign stays on the main screen: an
autosave failure is a banner above the turn. Whether the campaign has been exported is repeated in
the menu, so seeing it never takes more than one press.

## Guidance, not gates

**Say what to do next, and never refuse to go on.** The walk guides; it does not block
([Z3-3](phase-3-stories.md)). A table sometimes does things out of order, on paper, or by a house
rule, and the app must not be the reason a game stops.

- **Empty is a call to act.** A card with nothing in it, like an empty roster or an unclaimed base,
  is drawn with a dashed amber border and a primary button saying what to do. It is never shown
  as a zero.
- **Turn 1 says what it needs.** The Getting started checklist above the turn lists the three
  things a new campaign needs, in order: build the starting community, choose the First Mission
  team, claim the base. It shows the action for the first one not done, and it goes away once all
  three are done or turn 1 is over. Each tick reads a question the rest of the app already asks,
  so the checklist cannot disagree with the screens it points to.
- **The End-turn dialog names what is owed** (`src/engine/outstanding.ts`), and still ends the
  turn. A turn ending with no base claimed is one of those warnings (R33).
- **Blockers and warnings are different.** A blocker disables the action and says why. A warning
  shows, and unlocks an override that is never stored. See `src/ui/README.md`.

## Words

- **Buttons are named for what they do and where they go**: "Next: Feed your Survivors", not
  "Next", and "Back to Assign Mission Team", not "Back". A button that opens a modal is named for
  what the modal is for: Manage, Open, Edit, Claim a base.
- **No rule text, ever.** A screen says what a number is and where the rule is, through `PageRef`.
  It does not explain the rule. This holds for a new checklist line as much as for a skill
  description.
- **Display names live in `*Labels.ts`**, never inline and never in `src/data`.

## Colour and emphasis

The palette is Tailwind's stone with one accent, amber, and amber means **act here**:

| | |
|---|---|
| Amber fill | the primary action on a screen or a card: one per area |
| Amber border, dashed | something empty that needs doing |
| Amber text or panel | a warning: something owed, something over a cap |
| Stone | everything else: information, secondary buttons, done steps |

A second amber button beside the first is a sign the area has two primary actions and needs one of
them demoted.

## Before you add a screen

1. Is it part of playing a turn? Then it is a step, or part of one, inside the turn walk.
2. Is it a fact about the community a player looks up mid-turn? Then it is a line on a summary
   card, and the editing goes in that card's modal.
3. Is it about the campaign as a whole (the file, the history, settings)? Then it is a menu item
   that opens a modal.
4. Does it have an empty state? Draw it as a call to act.
5. Does it hold anything that could lose a campaign? Then it stays on the main screen.

The screen tests open modals the way a player does, from a card or the menu. The helpers for that
are in `src/test/screens.ts`.
