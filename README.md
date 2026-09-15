# cr-z-assistant

A campaign tracker for the *County Road Z* tabletop miniatures game by Jordan Heckman.

The Mission Layer happens on the table with miniatures. The Community Layer between missions
is bookkeeping and arithmetic — survivors, base, materials, unrest, siege threat — which is
what this is for.

## You need the rulebook

**This app ships no rule text and is useless without owning the book.** It holds no facility
descriptions, no skill descriptions, no mission narrative — only the numbers and structure
needed to compute state, with page references back to the rulebook. It is a tracker, not a
substitute for the rules, and it does not try to teach you the game.

*County Road Z* is copyright Jordan Heckman, published by Modiphius Entertainment
(ISBN 978-1-80281-366-1). This project is unaffiliated.

**Every page reference in this repository is to that edition** — the 188-page Modiphius
printing, Dec 2023 / Jan 2024. Its printed page numbers run four behind the PDF's page index,
and the citations here use the printed number. See
[`docs/rulebook-edition.md`](docs/rulebook-edition.md) for where each rule lives, what the
edition renamed, and the rules recorded for later phases.

## What works today

Phases 0 to 3 — a campaign you can actually play the Community Layer of, turn by turn.

- **Saving** (Phase 0). Export writes a readable, stably-ordered `.json`; that is the durable
  save. Import reads one back with a real message for every way a file can be wrong. Autosave
  keeps a copy in the browser so a closed tab does not cost a turn — a convenience layer that a
  cleared browser takes with it. A schema version and migration chain mean a campaign started
  now still opens after the data model grows.
- **Survivors** (Phase 1). A roster with Tiers, stats, skills and Health; a character sheet that
  computes Scores rather than storing them; experience spent on levels and promotions.
- **A base** (Phase 2). Claim one, build facilities and upgrades into its slots, clear what is in
  the way, assign Power and Water. Rules that a table may play differently warn rather than
  refuse, and every refusal can be overridden on purpose.
- **The turn** (Phase 3). All nineteen steps of the four phases, walked forwards and backwards:
  assignments, projects and Labor, XP, materials and substitutions, healing, feeding, Unrest, the
  horde and departures.

Missions and equipment are later phases. Each phase's breakdown is in `docs/` —
[Phase 0](docs/phase-0-stories.md), [Phase 1](docs/phase-1-stories.md),
[Phase 2](docs/phase-2-stories.md), [Phase 3](docs/phase-3-stories.md).

A separate question — what it would take to build a computer *game* on these rules rather than a
tracker beside them — is scoped in
[`docs/computer-adaptation.md`](docs/computer-adaptation.md). It is a scoping document about a
hypothetical licensed product, not a plan this repository is executing; nothing about what is
above changes.

## Running it

```sh
npm install
npm run dev            # http://localhost:5173
```

| Script | |
|---|---|
| `npm run build` | production bundle into `dist/` |
| `npm run preview` | serve the built bundle |
| `npm test` | unit tests |
| `npm run e2e` | end-to-end round-trip against the built bundle, tablet viewport |
| `npm run typecheck` · `lint` · `format:check` | the rest of the gate |
| `npm run mutate` | mutation score for the engine, persistence and the reducer — incremental, so a second run is fast |
| `npm run mutate:full` | the same, ignoring cached results — the audit, and how to rebuild a stale baseline |

## Deploying

There is **no backend, no accounts and nothing stored server-side** — it is static files, and
a campaign lives in the browser and in whatever `.json` its owner exported. That makes it
cheap to host anywhere and unremarkable to expose.

```sh
docker compose up --build          # http://localhost:8080
```

To put it behind [Traefik](https://traefik.io):

```sh
CRZ_HOST=crz.your-domain.example docker compose --profile traefik up --build
```

Everything site-specific is an environment variable with a placeholder default, so nothing
needs editing to try it:

| Variable | Default | |
|---|---|---|
| `CRZ_HOST` | `crz.example.com` | Hostname for the Traefik router |
| `CRZ_ROUTER` | `cr-z-assistant` | Traefik router/service name |
| `CRZ_ENTRYPOINT` | `websecure` | Traefik entrypoint |
| `CRZ_PORT` | `8080` | Host port for the non-Traefik service |
| `CRZ_BASE_PATH` | `/` | Set to e.g. `/crz/` to serve under a path |

The compose file is deliberately generic — no auth middleware, no TLS resolver, no network
name that only exists on one machine. Add those as extra labels, or merge the service into
your own stack; they are properties of your infrastructure, not of this app.

To check a deployment end to end, point the Playwright suite at it:

```sh
E2E_BASE_URL=http://localhost:8080 npm run e2e
```

## How it is built

Vite · React · TypeScript · Tailwind · Vitest · Playwright.

Three rules the code holds itself to, each aimed at a specific way the previous attempt at
this app failed:

1. **Rules as data.** Bases, facilities, equipment and skills live in typed data files,
   separate from engine code and completely separate from UI. Adding a facility is a data
   edit, not a code edit.
2. **Pure engine.** Derived values and phase transitions are pure functions over a `Campaign`,
   testable with no DOM. The UI only renders and dispatches. A lint rule enforces the
   boundary — `src/engine` and `src/data` cannot import React or anything from `src/ui`.
3. **Derived is never stored.** Only primitive facts persist. Hunger, Unrest, Siege Threat and
   Skill Scores are always recomputed, because the hunger penalty retroactively changes every
   Skill Score for the turn and makes a cached one wrong.

Each directory under `src/` carries a README saying what belongs in it and what must not.

## Checking the tests

Most of this app's code and most of its tests were written by the same process, from the same
reading of the rulebook — so a green suite says the code agrees with the tests, not that the
tests would notice if the code were wrong. Two things attack that directly.

**Property-based tests** (`fast-check`, in the ordinary `npm test`) generate inputs nobody wrote
down: any campaign survives export and re-import, serialization is byte-stable however the
object was assembled, the parser never throws on arbitrary bytes, and advancement never
overdraws. The generators live in `src/test/arbitraries.ts` and are typed as producing
`Campaign` and `Survivor`, so a schema change breaks them at compile time.

**Mutation testing** (`npm run mutate`) breaks the code on purpose and asks whether any test
fails. It covers `src/engine`, `src/persistence` and the reducer, against those layers' own tests
only — that part is the point: a mutant in the reducer killed only by a React test is still a gap
in the reducer's tests.

It runs **on every pull request**, which is where it is worth the most, and is affordable there
because of Stryker's incremental mode: a pull request pays for the mutants its own diff touches
and reuses the rest. Measured, local and CI:

| | local | `ubuntu-latest` |
|---|---|---|
| full run | 5m03s | 9m07s |
| nothing changed (536 of 675 reused) | 21s | **17s** — 40s of job, with checkout and `npm ci` |
| one file changed + one new test | 52s | — |

A run restores the previous results for the same pull request first and `main`'s baseline second, so
the cache misses only on a genuinely new branch. `push` to main and the weekly schedule run in full
(`npm run mutate:full`) to audit the incremental results, because a reused "killed" verdict can go
stale. See `.github/workflows/mutation.yml`.

Three things about reading the score:

- **The threshold comes from a measurement, not an aspiration.** Chasing 100% buys noise — but a
  threshold that is *loose* buys nothing either. Ours is 96 against a measured 96.69 — 96.91
  when the threshold was set — tightened from 94 when a probe showed that a whole untested
  function fitted inside the old headroom and the run still passed. A gate you can walk past is
  a wall chart. The headroom is deliberately thin, and it does its job: the base engine landed
  at 95.15 on its first run and had to be fixed rather than waved through.
- **The deliverable is the surviving mutants, not the number.** Each one gets a test or a
  written reason it does not matter. The score only says whether to go looking; the run uploads
  the report as an artifact so a red pull request can be read rather than guessed at.
- **Some mutants cannot be killed.** Most that survive here are redundant type guards standing
  in front of a check that already rejects the value; `Number.isInteger` makes a preceding
  `typeof x === 'number'` unreachable. Those are equivalent mutants, not gaps.

Neither replaces the tests built from the rulebook's own worked characters (pg. 13–15). Those
check the app against the *rules*; these check the tests against the *code*. A perfect mutation
score on a function implementing the wrong rule is still the wrong rule.

## License

The code is dual-licensed under either

- [MIT](LICENSE-MIT), or
- [Apache License 2.0](LICENSE-APACHE)

at your option. Pick whichever fits what you are doing; you do not have to satisfy both. This is
the same arrangement the Rust project uses, and it is here for the same reason: MIT is the one
almost everybody already understands, and Apache-2.0 carries an explicit patent grant for anyone
whose employer asks about that before they are allowed to contribute.

**That covers this project's own work, and not the game.** *County Road Z* is copyright Jordan
Heckman, published by Modiphius Entertainment — its rules, names, statistics and page references
appear here as factual reference so the app can compute state against a book you own, and no
license to them is granted or implied, because none is mine to grant. [`NOTICE`](NOTICE) states
where the line falls and why the app ships no rule text. A fork inherits that position unchanged.
