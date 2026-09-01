# Mutation testing and property-based fuzzing

This codebase is generated, and the tests were written by the same process, from the same
reading of the rulebook, as the code they test. A test and an implementation that share an
author share their blind spots: a green suite tells us the code agrees with the tests, not
that the tests would notice if the code were wrong.

Two techniques attack that from different directions, and both are set up here.

- **Mutation testing** breaks the code on purpose and checks whether any test fails. It
  measures test quality rather than code quality, which is the thing actually in question.
- **Property-based testing** generates inputs nobody thought to write down. The hand-written
  hostile-input cases in `saveFile.test.ts` are a list of ways a file can be wrong that
  *someone thought of*, which is the same limitation.

Neither replaces the rulebook-derived tests. Those check the app against the *rules*; these
check the tests against the *code*. A mutation score of 100% on a function that implements
the wrong rule is still the wrong rule, which is why the worked examples from pg. 48–50 stay
the primary defence.

## Running it

```sh
npm test              # unit tests, property tests included — seconds
npm run mutate        # mutation testing — about six minutes
```

Mutation testing is **not** part of the pull-request gate. The `ci` workflow runs in under a
minute and that is worth protecting; test quality does not change meaningfully between one
commit and the next. It runs weekly instead, and on demand — `.github/workflows/mutation.yml`,
via *Run workflow* on the Actions tab. The HTML report lands in `reports/mutation/` locally
and as a build artifact in CI.

## What is mutated

The three layers where a wrong answer is silent — where nothing crashes, no screen looks
broken, and the number is simply not the number:

| file | why |
|---|---|
| `src/engine/survivor.ts` | the derived values |
| `src/state/campaignStore.ts` | the reducer |
| `src/persistence/saveFile.ts`, `migrations.ts`, `exportFile.ts` | the save file |

The UI is deliberately out of scope. Mutating everything would be slower and mostly
uninformative: a broken render is visible, and Playwright already drives the real thing.

## The threshold

`stryker.config.json` fails the run below `break`. The number comes from a measurement, not
from aspiration:

| run | score |
|---|---|
| first measurement, before any test was added | 82.94% |
| after the tests the first run's survivors asked for | **95.54%** |

`break` is set to **94**, a little under the measured score. The gap is deliberate: a legitimate
new equivalent mutant — a redundant type guard in a new field check, say — should not fail a
run on its own, while a genuine drop of a percent or two should. Not 100%, which buys noise:
about 4% of the mutants here are provably unkillable, and chasing them means writing tests
that assert implementation details.

Raise `break` when the score rises. Do not lower it to make a run pass; a drop means either a
test got weaker or a new mutant survived, and both are worth reading.

## What the first run found

Every one of these was a real hole in the suite. None of them was a bug in the app — which is
the expected result, and is not the same as finding nothing:

- **No survivor field was ever damaged in a test.** `id`, `move`, `defense`, `xp`, the skill
  levels and the stats record could each have had their validation deleted entirely without a
  test noticing. The roster is the part of a save a player is most likely to hand-edit.
- **`isCountFromZero` was only ever given a word.** Passing `'hurt'` fails every check in it at
  once, so the integer check and the non-negative check were untested. A numeric string, a
  fraction and a negative each isolate one.
- **A material count of `Infinity` was accepted** by every test — `1e999` in a file parses to it,
  and it is a `number` that passes everything except the finite check.
- **Error message *wording* was almost entirely unasserted.** Most messages could have been
  emptied without a failing test. They are a stated feature of this app — a sentence for
  someone standing at a table holding a tablet — so they are now checked as one: every failure
  ends in a full stop, and a damaged file names what is wrong with it.
- **The blob handed to the browser was never opened.** `downloadCampaign` could have written an
  empty file under the right filename, which is the worst possible failure: it looks like a
  successful export until the save is opened again.
- **The unreadable-file branch had no test at all**, and neither did the object-URL revocation.

## Surviving mutants, and why they stay

The remaining survivors are all **equivalent or unreachable** — the mutated code behaves
identically, or cannot be reached through any public entry point. Killing them would mean
asserting on implementation details rather than behaviour.

| where | mutant | why it survives |
|---|---|---|
| `saveFile.ts:47`, `saveFile.ts:51`, `migrations.ts:99` | `typeof value === 'number'` → `true` | Redundant with the `Number.isInteger` call beside it, which is false for every non-number. The guard is there so TypeScript narrows, not to catch anything at runtime. |
| `saveFile.ts:111` | `!isRecord(value)` → `false`, and its message | Unreachable: `parseCampaignFile` rejects a non-object before this function is ever called. Kept as defence in depth for a second caller. |
| `saveFile.ts:113` | `!isCountFromOne(value.schemaVersion)` → `false`, and its message | Unreachable for the same reason in reverse: `migrate` stamps the version itself, so what arrives here is always current and valid. |
| `saveFile.ts:120` | `typeof value.phase !== 'string'` → `false` | Redundant with the strict-equality search that follows: no non-string is ever equal to a phase name. |
| `saveFile.ts:130` | `typeof count !== 'number'` → `false` | Redundant with `!Number.isFinite(count)`, which is true for every non-number. |
| `exportFile.ts:43` | `level !== undefined` → `true` | `JSON.stringify` drops properties whose value is `undefined`, so writing them changes no byte of the file. |
| `exportFile.ts:120` | `/^-+\|-+$/g` → `/^-\|-+$/g` and its mirror | The replace before it collapses every run of punctuation into a *single* dash, so a name can never produce two leading or trailing dashes for the `+` to match. |
| `migrations.ts:141–142` | the chain's loop guard, four ways | The only step in the chain today is an identity function, so skipping it and running it are indistinguishable. These become killable the moment a step actually transforms data — and the version-bump guard in `migrations.test.ts` makes that step and its fixture mandatory. |

If a mutant is added to this table, it needs a reason of this kind — behaviourally identical,
or unreachable. "Hard to test" is not one of them.

## The properties

`fast-check` runs alongside Vitest in the normal `npm test`; the generators live in
`src/test/arbitraries.ts` and the properties in `*.property.test.ts`.

The generator is **the persisted shape written down a second time**, on purpose. `fc.record<Campaign>`
stops typechecking the moment a field is added to the type and not to the generator, so the
generator cannot quietly fall behind the schema, and a disagreement between the two is a bug
in one of them.

What is asserted today:

1. **The round trip, for any campaign.** `parseCampaignFile(serializeCampaign(c))` returns a
   campaign deep-equal to `c` — and a v1 file comes forward to the current version.
2. **Serialization is stable.** The same bytes twice, independent of the order the object's
   keys were built in, with every field of the campaign and of every survivor present in file
   order.
3. **Nothing throws.** `parseCampaignFile` on arbitrary text and `migrate` on arbitrary values
   always return a result, and every failure message is a finished sentence.
4. **A damaged file is refused rather than half-read** — any single campaign or survivor field
   missing or nulled — and the refusal names what is wrong.
5. **Derived values stay in range.** `itemSlots` is never negative and never below the Tier's
   own allowance, `skillScore` is null exactly when the skill is absent.

The seed is fixed (`PROPERTY_RUN` in `src/test/arbitraries.ts`), so a failure reproduces for
everyone instead of appearing on one CI run and evaporating on the re-run. The trade is that a
fixed seed explores the same cases every time; a counterexample it does find gets checked in
as an ordinary test case alongside the fix, which is where the coverage actually accumulates.
Two known limits of the generator, both facts about JSON rather than about this app: `-0`
serialises as `0`, and a material count large enough to overflow comes back as `Infinity` —
which is a case, and is tested as one.
