# Phase 0 — Skeleton: deliverable stories

Breakdown of Phase 0 from the campaign tracker plan. Phase 0 ships **a file you can
save and load** — no game rules, no rulebook required to build any of it.

Each story below is independently buildable, independently verifiable, and leaves
the repo in a working state. They are listed in dependency order.

## Why this document exists

A July 2025 attempt at this app produced one ~3000-line HTML file and stalled, for
three reasons worth restating because every story here is shaped against them:

1. **No shippable intermediate state** — nothing was usable until everything worked.
2. **Rules embedded in UI callbacks** — changing a cost meant hunting through render code.
3. **The whole ruleset in scope from turn one**, including the least load-bearing parts.

Phase 0 answers (1) by ending in a working save/load round-trip, and pre-empts (2) by
establishing directory boundaries and a pure store before any rule exists to misplace.
(3) is handled by the phase plan itself: no rules ship here at all.

## Architecture rules these stories must not break

Carried forward from the plan; every story is checked against them.

1. **Rules as data** — `src/data/*.ts`, separate from engine, separate from UI.
2. **Pure engine** — derived values and transitions are pure functions over `Campaign`.
   The UI only renders and dispatches.
3. **Derived is never stored** — only primitive facts persist. Anything computable from
   other fields must not appear on the `Campaign` type.

## Scope boundary

Phase 0 is done when a campaign can be created, exported to a `.json` file, and imported
back — on a tablet, from a static build. Phase 0 explicitly does **not** include survivors,
stats, skills, bases, facilities, materials arithmetic, or any phase transition logic.

---

## Z0-1 — Project scaffold and toolchain

**Why:** Everything else needs somewhere to live, and the directory layout is the cheapest
enforcement mechanism for the architecture rules — a rule violation should require an
import that looks obviously wrong.

**Scope**
- Vite + React + TypeScript, `strict: true`.
- Vitest, ESLint, Prettier.
- Scripts: `dev`, `build`, `test`, `typecheck`, `lint`.
- Directory layout: `src/data/` (rules as data), `src/engine/` (pure, never imports React),
  `src/persistence/`, `src/ui/`.

**Acceptance**
- `npm run dev` serves a page.
- `npm run build`, `npm test`, `npm run typecheck`, `npm run lint` all pass clean.
- A lint rule (or a documented convention plus a test) prevents `src/engine/` from
  importing React.

**Out of scope:** any application behaviour.

---

## Z0-2 — CI pipeline

**Why:** Every later story leans on this, and it is cheapest to add while there is nothing
to fix. It also makes "leaves the repo working" a checkable claim rather than a promise.

**Scope**
- GitHub Actions on push and pull request.
- Jobs: typecheck, lint, test, build.
- Node version pinned to match local development.

**Acceptance**
- A pull request shows four green checks.
- A deliberately broken type fails the run.

---

## Z0-3 — `Campaign` type and `createNewCampaign()`

**Why:** The one type every other story references. Kept deliberately thin — later phases
grow it through migrations, which is precisely what Z0-4 exists to exercise. Designing
survivor and facility shapes now would mean designing rules-shaped types before the rules
are implemented, which is failure mode (3).

**Scope**
- `schemaVersion`, `id`, `name`, `createdAt`, `turn`, `phase` (a union of the four campaign
  phases: Mission, Advancement, Planning, Management), `materials` (Food / Fuel / Hardware /
  Rare counts), and placeholder-typed `survivors`, `base`, `log`.
- `createNewCampaign(name)` returning a valid empty campaign.

**Acceptance**
- `createNewCampaign('name')` typechecks and round-trips through
  `JSON.parse(JSON.stringify(c))` unchanged.
- A doc comment on the type states the no-stored-derived-values rule.
- No field on the type is derivable from other fields.

**Out of scope:** modelling survivors, facilities, or equipment. The placeholders stay
placeholders until Phase 1.

---

## Z0-4 — Schema version and migration harness

**Why:** The most load-bearing piece of Phase 0. The `Campaign` shape *will* change between
phases, and losing an in-progress campaign kills the project. This ships before anything is
capable of writing a file, so there is never a save format on disk that nothing can read back.

**Scope**
- `CURRENT_SCHEMA_VERSION`.
- An ordered registry of migration steps.
- `migrate(raw): Campaign`, chaining any older version forward to current.
- Explicit handling for a file saved by a *newer* version — refuse with a clear message
  rather than silently mangling it.
- A v1 fixture checked in under `src/persistence/__fixtures__/`.

**Acceptance**
- Migrating the v1 fixture yields a current-version campaign.
- A test fails if `CURRENT_SCHEMA_VERSION` is bumped without a matching migration step and
  fixture. This guard is the point of the story — without it the harness rots silently.

---

## Z0-5 — Save-file parsing and validation

**Why:** Import must never throw a raw exception at someone holding a tablet mid-campaign.
Every failure mode gets a sentence a human can act on.

**Scope**
- `parseCampaignFile(text)` returning a discriminated result:
  JSON parse → shape validation → version detection → `migrate()`.
- Human-readable errors: "this file isn't a County Road Z campaign", "saved by a newer
  version of the app", and so on.

**Implementation decision:** Zod vs. hand-rolled validation. Recommend **hand-rolled** for
Phase 0 — the type is a dozen fields, and a schema library that must be kept in sync with
both the type *and* every migration is more surface than it saves this early. Revisit at
Phase 2, when the base model lands and the shape gets genuinely wide.

**Acceptance**
- Unit tests covering: valid, truncated JSON, wrong shape, missing version, future version.

---

## Z0-6 — Campaign store

**Why:** Establishes architecture rule 2 — the UI only renders and dispatches — before there
is any UI to establish a bad habit in. This is the structural answer to failure mode (2).

**Scope**
- A reducer over `Campaign` plus a provider and hook.
- Every state change goes through an action.

**Acceptance**
- The reducer is a pure function, tested directly with no DOM.
- No component mutates campaign state directly.

---

## Z0-7 — App shell UI

**Why:** Somewhere to put the export and import buttons, and the first chance to get the
tablet-first layout right. This app gets used standing next to a table with miniatures on
it, not sitting at a desk.

**Scope**
- Tablet-first layout.
- Header: campaign name, turn, current phase.
- Empty state offering **New campaign** and **Import**.
- Navigation placeholders for the phases still to come.
- A single footer line noting the app requires the rulebook.

**Out of scope:** the page-citation component and the full copyright-posture treatment —
deferred to Phase 1, when there is a first screen that actually needs to cite a page.

---

## Z0-8 — Export to file

**Why:** The durable save. `localStorage` is a convenience layer (Z0-10); this is the copy
that survives a cleared browser.

**Scope**
- Serialize the campaign and download it.
- Stable key order and pretty-printing, so successive saves diff cleanly.
- Filename derived from campaign name, turn, and date.

**Acceptance**
- Clicking Export downloads a `.json` a human can read.

---

## Z0-9 — Import from file

**Why:** The other half of the round-trip, and the headline deliverable of Phase 0.

**Scope**
- File picker and drag-and-drop, wired to `parseCampaignFile`.
- Validation errors surfaced in the UI.
- Confirmation prompt when a campaign is already open.

**Acceptance**
- **The round-trip:** export a campaign, reload the page, import the file, get the same
  campaign back. When this passes, Phase 0 has delivered what it promised.

---

## Z0-10 — localStorage autosave and recovery

**Why:** Nobody should lose a turn to a closed tab. But this is convenience, not the save.

**Scope**
- Debounced write on state change, restore on boot.
- An indicator for "changed since last export".
- An explicit, warned "start new campaign".

**Acceptance**
- State survives a page refresh.
- The UI never implies `localStorage` is the durable save — the export is.

---

## Z0-11 — Deploy

**Why:** A build that only runs on a laptop has not reached the table. The tablet is the
actual target.

**Scope**
- Static build with a configurable base path.
- Homelab path: container plus Traefik, consistent with the existing compose setup.

**Acceptance**
- The built app loads on a tablet on the LAN and completes an export/import round-trip there.

---

## Phase 0 is done when

Z0-9's round-trip passes on the deployed build from Z0-11, with CI green — and the repo
contains no game rules whatsoever.
