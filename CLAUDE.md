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
- **Run the whole gate** before pushing: `format:check`, `lint`, `typecheck`, `test`.
