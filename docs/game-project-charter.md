# The game project — charter

The companion to [`computer-adaptation.md`](computer-adaptation.md). That document asks whether
a computer adaptation of *County Road Z* is feasible and what it would cost. This one assumes
the answer is yes and says how the work is organised: what the product is, what it is not, and
how the repositories are arranged so that the tracker survives the game being built beside it.

**This file is written to be moved.** It lives here for now because here is the only repository
that exists; its destination is the new game repository's first commit, at `docs/charter.md`.
Nothing in this document describes work that `cr-z-assistant` will do.

**The project has no name yet.** Under a license the title is Modiphius's call, and inventing one
now means renaming packages later. Placeholders throughout are `crz-game`, `crz-rules-core` and
the npm scope `@crz`. Every one of them is a find-and-replace away from the real answer.

## Status

Pre-Phase-A. Nothing is committed to, because the rights question in
[`computer-adaptation.md`](computer-adaptation.md) is unanswered, and this charter is a plan for
what happens if it lands well. It is written now for two reasons: the repository layout is
easier to get right before there is code in it than after, and the licensing conversation goes
better when the technical shape of the ask is already clear.

---

## 1. The product

A single-player, turn-based, 2D adaptation of *County Road Z*, playing **both layers**: the
Community Layer between missions and the Mission Layer on a tactical board, as close to the
printed rules as a program can be made to run them.

### Goals

- **Rules fidelity as the design constraint.** Where the book and a better game disagree, the
  book wins by default and the author breaks the tie. Divergence is negotiated with Jordan,
  recorded, and never quiet.
- **One long campaign as the unit of play.** A community that accretes history, loses people,
  and either holds the base or does not.
- **Legible mechanics.** The player can see why every number is what it is. This ruleset is
  detailed enough to be opaque, and a game has no rulebook open beside it.
- **Undo on day one.** A misclick that costs a survivor is not tension, it is a bug report.

### Non-goals, explicitly

Each of these is reasonable, and each is a different project:

- Multiplayer, in any form. Hot-seat included.
- 3D, or any perspective that is not a flat board.
- Procedural campaign generation beyond what the rules already randomise.
- Mod support as a shipped feature. (The data-driven architecture makes it nearly free later,
  which is an argument for not designing for it now.)
- Mobile. The Community Layer is dense enough that a phone screen is a second design job.
- Rewriting the tracker. It stays what it is.

---

## 2. Repository topology — the recommendation

Both ideas in the brief are right, in sequence. **Three repositories eventually; two to start;
and the extraction happens after the vertical slice, not before it.**

### Where it ends up

```
                 crz-rules-core  ·  public, MIT OR Apache-2.0, prose-free
                 ├── data/         tiers, skills, facilities, bases, the turn, dice
                 ├── engine/       pure functions over Campaign
                 ├── persistence/  the Campaign schema and its migration chain
                 └── store/        the campaign reducer (no React)
                            ▲                              ▲
                            │                              │
          cr-z-assistant  · public                crz-game  · private, licensed
          └── the React tracker UI                ├── mission/   board, round, enemy AI
                                                  ├── content/   prose, narrative, tables
                                                  ├── render/    the 2D board and screens
                                                  └── shell/     desktop packaging
```

The arrows point one way and never the other. The core knows nothing about either consumer —
the same rule `eslint.config.js` already enforces between `src/engine` and `src/ui`, one level
up.

### Why three and not a monorepo

A private monorepo with `packages/rules-core`, `apps/tracker` and `apps/game` would give the
best possible developer experience: atomic cross-package changes, one install, no version
negotiation with yourself. For a solo developer that is a real and underrated advantage.

**It is ruled out by one thing: the tracker is public and should stay public.** It is dual
MIT/Apache, it is a community good, and its whole defensible posture is that it is an
independent unlicensed tracker. Folding it into a private repository that also contains licensed
game content takes it private, makes it look like a component of a commercial product, and
throws away the clearest thing about its legal position. A public monorepo with the content in
a private submodule inverts the awkwardness without removing it.

So: separate repositories, and the version friction is a cost paid on purpose.

### Why the core is extracted *later*

Extracting a shared library before its second consumer exists is how boundaries get drawn in the
wrong place. Specifically:

- **The core is still growing.** Equipment and mission metadata — the tracker's Phase 4 and
  Phase 5 — are unbuilt, and equipment changes the Skill Score formula that everything else
  reads. A published package with a changing central formula means a version bump per commit
  and two repositories to update for every one of them.
- **Nobody yet knows what the game needs from it.** The vertical slice needs `Survivor`, the
  Tier table, the skill list, `skillScore` and the d10 — a thin fraction of what is there. It
  needs nothing from feeding, Unrest, Siege Threat or facilities. Drawing the boundary from
  guesses produces a core that exports the wrong surface.
- **The slice may be thrown away.** It exists to answer questions, and the honest posture is
  that its code is disposable. Extracting a library to support disposable code is motion, not
  progress.

The extraction is also cheap to defer, because the cut lines are already drawn and enforced.
`src/engine`, `src/data` and `src/persistence` import no React today, verified rather than
assumed — the one wrinkle is `src/state`, where `campaignStore.ts` is 1,250 lines of pure
reducer and `campaignContext.ts`, `CampaignProvider.tsx` and `useCampaign.ts` are the React
binding. The reducer goes in the core; those three stay in the tracker. That is the whole
subtlety of the split, and it is already visible in the file layout.

### The three stages

**Stage 1 — two repositories.** `crz-game`, private from the first commit, depending on
`cr-z-assistant` as a git dependency pinned to a commit, importing only from `src/engine` and
`src/data`. Zero extraction work, one source of truth, no divergence, and no version churn
because the pin only moves when the game asks it to. Grubby in exactly one way — the game pulls
a repository whose UI it does not want — and that is tolerable for the length of a prototype.

**Stage 2 — extract the core.** After the slice passes, and when the game's real demands on the
core are known. Mechanically: `git subtree split` on the four directories into a new repository
so blame and history come with them, then both consumers depend on the published package.
History matters here more than usual — the reasoning in this codebase lives in commit messages
and long file comments, and a fresh-init core would lose the trail behind every deliberate
decision.

**Stage 3 — steady state.** Core released on a version number, consumers upgrading deliberately.
The tracker's release cadence stops being the game's problem and vice versa.

### One rule that makes the whole thing work

**The core stays prose-free, forever.**

It carries what `src/data` carries today: ids, numbers, structure, costs, requirements, table
results and page references. It does not carry facility descriptions, skill descriptions or
mission narrative, and the reason is not habit — it is that this is what lets the core stay
public and lets the tracker keep the posture in [`NOTICE`](../NOTICE) unchanged while a licensed
game reads the same arithmetic.

The game supplies prose as a **content layer keyed by the core's ids**. `crz-game/content/` maps
`facility:water-collection` to a name, a description, flavour text and an art reference; the
core knows only that the id exists, what it costs and what it does. This is not a new idea in
this codebase — it is exactly the separation `src/ui/skillLabels.ts` already maintains against
`src/data/skills.ts`, promoted to a repository boundary.

If prose ever moves into the core, the core becomes licensed content, the tracker inherits a
licensing problem it does not currently have, and the whole arrangement collapses into one
private repository. Worth a test that fails on it.

---

## 3. The licensing boundary, as a table

| | repo | license | contains |
|---|---|---|---|
| Rules core | `crz-rules-core` | MIT OR Apache-2.0 | ids, numbers, formulas, page refs |
| Tracker | `cr-z-assistant` | MIT OR Apache-2.0 | tracker UI, unchanged posture |
| Game code | `crz-game` | per the license agreement | mission engine, renderer, shell |
| Game content | `crz-game/content` | licensed, all rights reserved | prose, narrative, tables, art |

### The contract ask that protects what already exists

This needs saying in the licensing conversation rather than discovered afterwards: **a license
agreement can leave the tracker worse off than no agreement at all.**

The tracker's position today rests on holding only facts and numbers and shipping no prose. A
development or licensing contract that assigns "all implementations of the rules" to the
licensor, or restricts what the signatory may publish about the game, could contractually
prohibit the very thing that is currently fine — and it would be the same person on both sides
of that, which is exactly how it happens by accident.

So the ask, stated up front and in writing:

- The existing public tracker continues, unaffected, under its current licenses.
- The prose-free rules core may be published under MIT/Apache-2.0, as a library of the game's
  arithmetic, containing no rule text, no narrative and no art.
- Everything that makes the game a game — text, narrative, art, audio, the mission catalogue as
  written content — is the licensor's, and lives only in the private repository.

That is a clean line, it is the line this codebase already draws internally, and it is far
easier to agree to before a contract exists than to renegotiate after one does.

---

## 4. Stack and repository layout

The recommendation from [`computer-adaptation.md`](computer-adaptation.md) stands: **stay on the
web stack.** TypeScript, Vite, a canvas renderer (PixiJS) for the tactical board, React for the
Community Layer screens where forms are genuinely the right interface, and Tauri for desktop
packaging. A turn-based 2D game has no performance requirement a canvas cannot meet, and the
alternative starts by discarding 11,000 lines of mutation-tested rules engine.

```
crz-game/
  src/
    mission/      the tactical engine — board, tactical round, enemy behaviour, resolution
                  pure, no renderer, no DOM. The core's discipline, one layer up.
    content/      prose, narrative, mission text, item and enemy descriptions
                  licensed; keyed by rules-core ids; no arithmetic
    render/       the 2D board, the campaign screens, input
    shell/        Tauri, platform, storefront integration
    sim/          headless driver — plays missions without a renderer, for balance
  maps/           Tiled sources and exported map data
  assets/         art and audio, Git LFS
  docs/
    charter.md    this file
    rulings.md    the rulings log
    adr/          one file per architectural decision
```

Four notes on that layout:

- **`mission/` is pure, like the engine below it.** Same reasoning, same lint rule: it takes a
  mission state and an input and returns a new state. The renderer draws the result. This is
  what makes `sim/` possible, and `sim/` is what makes the enemy AI tunable.
- **`content/` holds no arithmetic and `mission/` holds no prose.** Enforced, not remembered.
- **Git LFS from the first asset.** Art in ordinary git history is a repository nobody can clone
  in a year.
- **Maps are authored in Tiled**, exported as data. Hand-authoring tactical maps in JSON works
  for exactly two maps.

---

## 5. Stage 1's deliverable: the vertical slice

One playable mission. Placeholder art, deliberately ugly. It exists to answer the questions no
document can answer, and **the project's continuation is conditional on it.**

Acceptance is a checklist, not a feeling:

- [ ] Four survivors, generated from the real Tier table via the rules core.
- [ ] One hand-made map, authored in Tiled and loaded as data.
- [ ] One enemy type, behaving from a written behaviour specification.
- [ ] Movement, line of sight and cover, with the game's answer visible **before** the player
      commits to a move.
- [ ] One melee and one ranged attack path, resolving Skill Score against Defense, with wounds.
- [ ] One objective, and both a win and a loss state.
- [ ] Tactical rounds with full undo.
- [ ] Save and resume mid-mission, mid-round.
- [ ] A seeded run that replays identically from its seed.
- [ ] A debug overlay showing why each enemy did what it did.
- [ ] `sim/` plays the mission headlessly 1,000 times and reports the outcome spread.

The last three are not polish. They are the instruments the rest of the project is measured
with, and retrofitting any of them costs more than building it here.

What the slice answers: whether the spatial model holds up, whether the enemy AI reads like a
table, whether a tactical round is fun on a screen, and how long a mission takes to play. Those
four answers are what makes the remaining phases estimable — which is why nothing in this
document attaches a date to anything after it.

---

## 6. Standards carried over

The habits that made the tracker work, and what they become here:

| | where it applies |
|---|---|
| Pure engine, enforced by lint | rules core, and `mission/` |
| Rules as data, never as code | rules core, and the mission catalogue |
| Derived is never stored | both, and it matters more mid-mission |
| Schema version + migration + fixture per bump | `Campaign` in the core; `Mission` in the game |
| Mutation testing with a measured threshold | rules core and `mission/` — where it pays |
| Property-based tests | save round-trips, and mission invariants |
| Playwright | the renderer, and a full mission end to end |

Two additions the game needs and the tracker did not:

- **Seeded determinism as a tested property.** Same seed, same inputs, same outcome — asserted,
  because replay, bug reports and balance work all rest on it. The tracker's habit of threading
  a `D10Result` in as a parameter is what makes this nearly free.
- **A headless balance harness.** `sim/` is a first-class deliverable, not a script. Tuning an
  enemy AI by playing it by hand is the slowest possible loop.

### Two documents that start on day one

- **`docs/rulings.md`** — every place the rules leave room, the options, the ruling, and whether
  Jordan confirmed it. Seeded from what this codebase has already found: the pg. 17 versus
  pg. 21 Planning order, the promotion rule that changed between editions, the Rare Goods *and*
  versus *or*. The author being reachable is this project's largest single advantage over any
  other adaptation, and an advantage nobody writes down is one nobody keeps.
- **`docs/adr/`** — one file per architectural decision, starting with the spatial model, which
  is the first irreversible call the project makes.

---

## 7. Open questions

Carried here so they are answered rather than rediscovered:

1. **Grid or free movement.** The first irreversible decision. Prototype both in Stage 1 before
   committing; a grid is far easier to make legible, to pathfind on and to write an AI against,
   and free movement is more faithful to a measuring tape.
2. **Does the game read a tracker save?** Sharing the core's `Campaign` schema makes importing a
   tabletop campaign into the game nearly free, which is a genuinely attractive feature for the
   existing audience. It also couples the two release cadences. Leaning yes, deferred until the
   core is extracted — the decision costs nothing to postpone and something to get wrong.
3. **How much narrative exists beyond the book.** Worth asking Jordan early, because it shapes
   what the mission data has to carry. A campaign arc and an ending are things a game needs and
   188 pages may not have had room for.
4. **Art direction, and therefore the art budget.** The largest cost in the project and the one
   least constrained by anything above.

---

## 8. Next actions

In order, and the first two are not engineering:

1. **Establish the rights position** — who licenses what, and whether Modiphius must be at that
   conversation. Blocks everything.
2. **Make the carve-out ask in §3** part of that same conversation, while it is cheap.
3. **Create `crz-game`, private, with this charter as its first commit** and empty `rulings.md`
   and `adr/`. Private from commit one: it will accrue licensed content, and a repository that
   was briefly public is not made private again by making it private.
4. **Seed `rulings.md`** from the ambiguities already recorded in
   [`rulebook-edition.md`](rulebook-edition.md).
5. **Write ADR 001 — the spatial model**, as a question with an experiment attached rather than
   an answer.
6. **Build the slice.**

And one that belongs to the other repository and pays off regardless of all of the above:
**finish the tracker's Phase 4 and Phase 5.** Mission metadata and equipment complete the
tracker's own roadmap, close the item-modifier term the Skill Score formula is honestly missing,
and are the first two data files the core would ship. There is no outcome in which that work is
wasted.

---

*Nothing in this document is a commitment, and nothing in it describes work `cr-z-assistant`
will do. That repository remains what [`NOTICE`](../NOTICE) says it is: an unofficial,
unaffiliated campaign tracker that ships no rule text and is useless without the book.*
