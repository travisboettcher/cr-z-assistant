# Contributing

Thanks for looking. This is a small project with one maintainer and a fast cadence, and most of
what follows exists so that a pull request lands rather than gets redone. Read it before you start
on code — the first section especially.

## Before you write anything

**Say so on the issue first.** Most issues here are filed by the maintainer as notes for work
already planned, and many are picked up within hours. A comment saying you would like to take one
costs a minute; a finished pull request for something already fixed on another branch costs you an
afternoon. If the issue offers more than one way to fix it, say which you mean to take.

**For anything without an issue, open one.** Describe what happens, what should happen, and where
in the rulebook it is decided. A bug report from a real campaign — what you entered, what the screen
said — is as useful as a fix, and often more.

**Large or structural changes need agreement before code.** New phases, new screens, changes to the
`Campaign` shape, or anything that moves where a rule lives. The phase documents in `docs/` are the
plan; work that is not in them is a conversation first.

## You need the rulebook

A rules change cannot be reviewed against anything but the book, and the book is not in this
repository. If you are changing what the app computes, you need your own copy of the Modiphius
edition described in [`docs/rulebook-edition.md`](docs/rulebook-edition.md), and you need to cite
the page.

**No rule text, ever.** The app ships numbers and structure, and a page reference for everything
else. No facility descriptions, no skill descriptions, no mission narrative, no paraphrase that
stands in for them — in code, comments, tests, docs or commit messages. This is not a style
preference; it is the condition on which the project exists at all. See [`NOTICE`](NOTICE).

**Page numbers are the printed ones**, which run four behind the PDF's page index.

## How the code is arranged

[`docs/architecture.md`](docs/architecture.md) is the map: how the layers fit, what the engine's
functions are called and return, and one rule traced from data to screen. Each directory under
`src/` has a README saying what belongs there and what must not. Read the one for every directory
you touch. The short version:

| | |
|---|---|
| `src/data` | Rules as typed data. No React, no UI, and no imports from `src/engine`. |
| `src/engine` | Pure functions over a `Campaign`. No React, no UI. |
| `src/state` | One reducer. Sets fields; computes nothing and caches nothing derived. |
| `src/persistence` | The save format, its schema version and migration chain. |
| `src/ui` | Renders and dispatches. Holds no rules. |

Three rules hold across all of it, and `npm run lint` enforces the boundaries between them:

1. **Rules as data.** Adding a facility is a data edit, not a code edit. Thresholds get names, not
   inline numbers.
2. **Pure engine.** If you are writing a rule inside an event handler or a reducer case, it belongs
   in `src/engine` instead.
3. **Derived is never stored.** Hunger, Unrest, Siege Threat and Skill Scores are recomputed every
   time. Do not add a field that caches one.

## Fix the question, not the caller

The most common way a reasonable-looking fix here turns out to be wrong is that it patches the one
caller the issue names and leaves the same question answered differently somewhere else.

When a predicate gives the wrong answer — "is somebody leaving", "is this slot supplied", "is this
survivor down" — **change what the predicate means**, then find everything that reads it: other
engine functions, the screen that explains the step, the outstanding-work check, the docs that
describe it. A guard added at one call site leaves the screen saying one thing and the turn walk
another, and the next bug is the disagreement between them.

["A rule, end to end"](docs/architecture.md#a-rule-end-to-end) traces one rule through every file
that reads it. Before you open a pull request, search for every caller of what you changed, and say
in the description which ones you checked and why each is right.

## When the book does not decide

Some questions the printed text leaves open, and the app has to answer them anyway. **Do not answer
one quietly in code.** A house rule that lives in a function is indistinguishable from a rule.

[`docs/rulings.md`](docs/rulings.md) is the registry. A change that settles, reverses or depends on
an open question adds or updates an entry there — the question, why the book does not settle it, the
ruling and what it costs — and code that implements one cites it as `R7`. If you are not sure
whether something is a ruling, ask on the issue.

When a fix changes behaviour a phase document describes, update that document in the same pull
request. `docs/phase-*-stories.md` is where the reasoning behind each behaviour is kept, and a
behaviour that has changed while its explanation has not is worse than no explanation.

## Changing the save format

If the `Campaign` shape changes: bump `CURRENT_SCHEMA_VERSION`, add a migration step in
`src/persistence/migrations.ts`, and check in a fixture of the old shape under
`src/persistence/__fixtures__/`. A guard test fails if you skip either. Every save anybody has ever
exported must still open.

## Tests

[`src/test/README.md`](src/test/README.md) covers which kind of test a change needs, the shared
helpers and the conventions. In short:

- **A bug fix comes with a test that fails without it.** Say in the pull request that you saw it
  fail.
- **Test the layer you changed, in that layer.** An engine fix is tested in `src/engine`, not only
  through a React test. The mutation run scores each layer against its own tests, so a rule covered
  only from the UI counts as uncovered.
- **Property tests are welcome** where the input space is large. The generators are in
  `src/test/arbitraries.ts` and shared campaign builders in `src/test/campaigns.ts` — reuse them
  rather than building a campaign by hand.
- **A test that fails intermittently is a bug, not noise.** If you saw one, say which in the pull
  request, even if you could not reproduce it.

## The gate

CI runs all of this on every pull request, and a pull request is not ready until it is green.
Run it locally first:

```sh
npm ci
npm run format:check   # or `npm run format` to fix
npm run lint
npm run typecheck
npm test
npm run e2e            # needs a Chromium; see playwright.config.ts
npm run mutate         # incremental — fast after the first run
```

Node 22 or later. The mutation score has a floor in `stryker.config.json`; a change that adds logic
without tests that would notice it being wrong will fall under it.

CI on a first-time contributor's pull request waits for the maintainer to approve the run. That is
GitHub's default, not a judgment about the change.

## Commits and pull requests

**Commit subjects say what the app now does**, in a sentence, with the issue number:
`Owe no Departures step that nobody can take (#192)`, not `fix: departures bug`. The body says why,
and what was considered and not done.

**A pull request description** should cover: the issue it closes; what was wrong and why; which
callers, screens and docs you checked; and how you verified it. Keep a pull request to one concern.
Several small ones review faster than one large one.

## Using an AI assistant

Most of this repository was written with Claude, so assisted contributions are not a problem in
themselves. What matters is that someone has done the judgement the assistant cannot:

- **Give it this file and the README of every directory it touches** before it writes anything.
- **Read the whole diff yourself** and be able to explain each line. A pull request is a request for
  the maintainer's time, and that request is yours, not the assistant's.
- **Check the rulebook yourself** for any rules change. An assistant does not have the book and will
  fill the gap with something plausible.
- **Say that it was assisted** in the pull request. It changes nothing about whether it is accepted;
  it does help the review.

An issue turned into a pull request without any of that is likely to duplicate work in progress, or
to fix the caller the issue names and miss the rest. Both have happened.

## Licensing

The code is dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
Unless you say otherwise, anything you submit is offered under the same terms. The game itself is
not the project's to license — see [`NOTICE`](NOTICE).
