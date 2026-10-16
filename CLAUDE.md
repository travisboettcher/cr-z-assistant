# CLAUDE.md

Before changing anything, read [`CONTRIBUTING.md`](CONTRIBUTING.md),
[`docs/architecture.md`](docs/architecture.md), and the `README.md` of every directory under `src/`
you will touch. They are the rules this repository is reviewed against.

The ones most often missed:

- **No rule text from the rulebook**, anywhere — numbers, structure and printed page numbers only.
  You do not have the book; do not fill a gap in it with something plausible. Ask instead.
- **Fix the question, not the caller.** When a predicate is wrong, change what it means and check
  every reader of it — engine, screens, `outstanding`, docs — not only the one an issue names.
- **A question the book leaves open is a ruling** in `docs/rulings.md`, never a quiet choice in
  code.
- **The main screen summarises; a modal edits.** A UI change follows
  [`docs/ux-principles.md`](docs/ux-principles.md): no new sections down the page.
- **Run the whole gate** before pushing: `format:check`, `lint`, `typecheck`, `test`.

## Plugins

[`.claude/settings.json`](.claude/settings.json) enables two third-party plugins. The rules above
come first; where a plugin's advice disagrees with them, it loses.

- **`ui-ux-pro-max`**, for UI work in `src/ui`. Use `--stack react`. Layout is decided by
  [`docs/ux-principles.md`](docs/ux-principles.md), and `TOUCH_TARGET`, `FOCUS_RING` and the `dark:`
  pairs in `src/ui/styles.ts` stay. Do not run `--persist`: this app's design decisions live in
  `docs/`, not a generated `design-system/` folder.
- **`humanizer`**, for text a player reads in the app, following
  [`docs/writing.md`](docs/writing.md). Change wording only: every number, rule name and printed
  page reference stays, and no rule text from the book replaces a page reference.
