# cr-z-assistant

A campaign tracker for the *County Road Z* tabletop miniatures game by Jordan Heckman.

The tactical layer happens on the table with miniatures. The strategic layer between missions
is bookkeeping and arithmetic — survivors, base, materials, unrest, siege threat — which is
what this is for.

## You need the rulebook

**This app ships no rule text and is useless without owning the book.** It holds no facility
descriptions, no skill descriptions, no mission narrative — only the numbers and structure
needed to compute state, with page references back to the rulebook. It is a tracker, not a
substitute for the rules, and it does not try to teach you the game.

*County Road Z* is copyright Jordan Heckman. This project is unaffiliated.

## What works today

Phase 0 — the skeleton. You can create a campaign, and save and load it as a `.json` file.

- **Export** writes a readable, stably-ordered `.json`. This is the durable save.
- **Import** reads one back, with a real message for every way a file can be wrong.
- **Autosave** keeps a copy in the browser so a closed tab does not cost a turn. It is a
  convenience layer — a cleared browser takes it with it, and only an exported file survives.
- A **schema version and migration chain**, so a campaign started now still opens after the
  data model grows.

Survivors, base building, the turn engine, missions and equipment are later phases. See
[`docs/phase-0-stories.md`](docs/phase-0-stories.md) for how Phase 0 was broken down.

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
