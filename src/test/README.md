# `src/test` — shared test scaffolding, and how the tests are arranged

This directory holds what several suites share. The tests themselves live beside the code they
test, as `*.test.ts` or `*.test.tsx`. This README is also the guide to the suite as a whole: what
kinds of test there are, which one a change needs, and the conventions they follow. The case for
property and mutation testing is in the top-level README, under "Checking the tests".

## What kind of test, and where

| Kind | Where | Runs in | For |
|---|---|---|---|
| Engine | `src/engine/*.test.ts` | `npm test`, mutation | every rule: derived values, questions, checks, changes |
| Data | `src/data/rules.test.ts` | `npm test` | the transcription — re-deriving a printed table and asserting it matches the book |
| Reducer | `src/state/campaignStore.test.ts` | `npm test`, mutation | each action: accepted, refused, what it logs |
| Persistence | `src/persistence/*.test.ts`, `__fixtures__/` | `npm test`, mutation | parsing, validation, migrations, every old save still opening |
| Property | `*.property.test.ts` | `npm test` | invariants over generated input — round trips, never overdrawing, never throwing |
| Screen | `src/ui/*.test.tsx` | `npm test` (jsdom) | what a person sees and can press, rendered through the real `App` |
| Lint guard | `lintGuard.test.ts`, here | `npm test` | that each boundary in `eslint.config.js` actually catches what it claims to |
| End to end | `e2e/*.spec.ts` | `npm run e2e` | the built bundle in a real browser at tablet size: export, reload, import, the turn walk, `<dialog>` |

**Test a rule in the layer it lives in.** A change to `src/engine` needs an engine test, even when
a screen test would also catch it. The mutation run (`vitest.mutation.config.ts`) scores
`src/engine`, `src/state` and `src/persistence` against those directories' own tests only, so a rule
covered only through the UI counts as uncovered. That is deliberate.

**A bug fix starts with a test that fails.** Write it against the bug as reported, watch it fail,
then fix. If the bug was a disagreement between two functions — a step owed that no action can
satisfy — test both sides of it.

## The rulebook is the oracle

The suite was mostly written by the same process that wrote the code, so a test that only restates
the implementation proves nothing. Where the book gives a worked answer, use it: the two characters
built on pg. 13–15 are reproduced in `src/engine/survivor.test.ts`, and `rules.test.ts` re-derives
the base roster's storage column rather than copying it. Cite the page in a comment beside the
expected value, so a reviewer can check the number against the book rather than against the code.

## Helpers in this directory

Reach for these before building a campaign by hand.

| | |
|---|---|
| `campaigns.ts` | campaign state for a test that cares about one number — a project team worth exactly this much Labor, a facility staffed, Power or Water generated, Planning already begun |
| `queued.ts` | a project in the queue at a price nothing in the test looks at |
| `arbitraries.ts` | `fast-check` generators typed as `Campaign` and `Survivor`, so a schema change breaks them at compile time |
| `logSamples.ts` | one of every log event, asserted complete — a new event without a sample fails the typecheck |
| `setup.ts` | Testing Library cleanup, a cleared `localStorage` between tests, and a `<dialog>` stub for jsdom |

**Shared scaffolding goes here, not in `src/engine`.** Stryker mutates `src/engine`, and a helper
there would be scored as though it were code under test.

## Conventions

- **Explicit imports.** `import { describe, expect, it } from 'vitest'` — the suite does not use
  globals.
- **One `describe` per function**, named for it. **`it` finishes a sentence** about that function's
  behaviour: `describe('someoneIsLeaving')` → `it('is false at ten when everybody is down')`.
- **Build from `createNewCampaign` and `createSurvivor`** with the overrides the test is about, and
  nothing else. Give ids names (`const EARL = 'earl'`) when an assertion refers to them.
- **Numbers in a test are the subject.** If a value is incidental, hide it behind a helper the way
  `queued` hides a price, so the one number left is obviously the one being tested.
- **Screen tests render `App` inside `CampaignProvider`** with an `initialState`, and drive it with
  `userEvent` and accessible queries (`getByRole`, `getByLabelText`) — the same way a person finds
  the control.
- **A property test** is worth writing when the input space is too big to enumerate and there is an
  invariant to state: a round trip, a quantity that never goes negative, a function that never
  throws. Keep generators in `arbitraries.ts`.
- **A schema change** adds a fixture of the old shape to `src/persistence/__fixtures__/`; the
  version-bump guard test fails without it.
- **A new lint boundary** gets a probe in `lintGuard.test.ts` for each directory and each name it
  covers, so a rule that has quietly stopped matching fails here.

## Mutation testing

`npm run mutate` is incremental and usually takes under a minute after the first run. CI runs it on
every pull request, and the score has a floor in `stryker.config.json`. When it reports surviving
mutants in code you touched, each one gets a test or a reason it cannot be killed — an equivalent
mutant, such as a type guard in front of a check that already rejects the value. The HTML report
under `reports/mutation/` shows exactly which line survived and how.

A green suite and a high score say the tests agree with the code. Neither says the code agrees
with the book. That is what the page citations are for.
