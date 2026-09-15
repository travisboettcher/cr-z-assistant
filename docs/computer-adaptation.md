# A computer adaptation of *County Road Z* — what it would take

A scoping document, written after a conversation with Jordan Heckman about a computer game
built on his rules. It is not a plan to start tomorrow. It is an honest inventory of what this
repository already is, what a game needs that a tracker never did, and where the real cost sits
— which is not where a first guess puts it.

The target it is written against: **2D, turn-based, both layers.** The Community Layer between
missions and the Mission Layer on a tactical board, played by one person against the machine,
as close to the printed rules as a computer can be made to run them.

## The short version

The campaign half of this game is largely built. Phases 0–3 of the tracker are roughly 11,400
lines of rules engine, rules-as-data, persistence and state, under 14,000 lines of tests and a
96% mutation-score gate. That is the Community Layer — the four-phase turn, survivors,
advancement, the base, materials, Unrest, the horde — and a computer adaptation would need
almost exactly that, because it already has the one property adaptations usually lack: the
rules are pure functions over a data structure, with no screen anywhere near them.

What is *not* built is the half that makes it a game rather than a spreadsheet: the Mission
Layer, equipment, the mission catalogue, and everything that has to be *drawn*. Those are not
an extension of what is here. They are a second project of comparable size, plus an art budget,
plus a decision that only Jordan and Modiphius can make.

Ordered by what actually blocks what:

1. **Rights.** Not code. See below — it is the one item with no engineering workaround.
2. **A rulings process.** A table resolves ambiguity by agreeing. A program cannot. Every place
   the book leaves room needs a decision, and the author being reachable is the single largest
   advantage this project has over any other adaptation.
3. **The Mission Layer engine** — the board, the round, and the zombies playing themselves.
4. **Art, audio and content.** The part no amount of architecture makes cheaper.
5. **Everything else**, which is ordinary software work on a codebase built to take it.

---

## Part 0 — The gate that is not code

This repository is built around a constraint stated in [`NOTICE`](../NOTICE): it ships **no rule
text**. No facility descriptions, no skill descriptions, no mission narrative — only the numbers
and structure needed to compute state, and a page reference back to a book the player owns. That
posture is what makes an unlicensed tracker defensible, and it is enforced at the directory
level, not just remembered.

**A game inverts that constraint completely.** A computer adaptation *is* the rules. It has to
contain every description, every mission, every table result, the narrative and the names,
because nobody buying a game owns the book first. There is no version of this that stays inside
the current legal posture. It needs a license, and the license is the project.

Three things to establish before any code is written:

- **Who holds the digital rights.** *County Road Z* is published by Modiphius (ISBN
  978-1-80281-366-1). Tabletop publishing contracts vary enormously in whether video game rights
  sit with the author, the publisher, or need both to sign. Jordan's enthusiasm is necessary and
  may not be sufficient. This question is cheap to ask and expensive to discover late.
- **What shape the license takes.** A work-for-hire arrangement, a licensed development with a
  royalty, or Modiphius publishing it themselves are three quite different projects with three
  different answers about who owns the code at the end.
- **What happens to this repository.** The code here is dual MIT/Apache-2.0 and the game is not
  its author's to give away — deliberately. A licensed game means a split: the rules engine can
  stay open (it is, genuinely, just arithmetic well-organised), while content, art and narrative
  live in a separate licensed repository the engine reads. That split is worth designing on
  purpose rather than falling into, because getting it wrong once is very hard to undo.

Nothing below depends on the answer, but everything below is wasted without it.

---

## Part 1 — What already exists, honestly assessed

| layer | source | tests | what it is |
|---|---|---|---|
| `src/engine` | 6,198 | 8,183 | derived values and phase transitions, pure functions over `Campaign` |
| `src/data` | 2,046 | 630 | the rules as typed data — tiers, skills, facilities, bases, the turn |
| `src/persistence` | 1,713 | 2,133 | save format, schema version 11, a migration chain, validation |
| `src/state` | 1,485 | 3,165 | one reducer, every change an action |
| `src/ui` | 6,172 | 4,193 | React screens — the layer a game would mostly replace |

Three properties of it matter more than the line count.

**The engine has no idea a screen exists.** `computeUnrest(campaign)`, `advancePhase(campaign,
input)` — pure functions, no DOM, no React, enforced by a lint rule that fails the build on an
import from `src/ui`. A tactical renderer, a Godot front end or a headless balance simulator can
all sit on top of this without the engine noticing. Adaptations normally die of rules embedded
in UI callbacks; this codebase was explicitly built against that failure, having already
suffered it once.

**Dice are already inputs, not effects.** The Management Phase takes a `D10Result` as a
parameter rather than rolling one, because a tracker's user rolls physical dice. That accidental
discipline is exactly what a computer game needs for seeded runs, deterministic replays and
automated balance testing. Most projects retrofit it painfully; here it is the existing shape.

**Derived is never stored.** Hunger, Unrest, Siege Threat and every Skill Score are recomputed
on demand. That rule was adopted because the hunger penalty retroactively changes Skill Scores
for a turn — and it pays off again in a tactical layer, where an item modifier, a wound and a
Story Trait all move the same number mid-mission.

What would *not* carry over: most of `src/ui`. Tailwind forms that walk a turn step by step are
right for a tracker sitting next to a table and wrong for a game. The labels files
(`skillLabels.ts`, `logLabels.ts`, `turnLabels.ts`) survive — they exist precisely so display
names are separable — but the screens are a rewrite. Call it 6,000 lines discarded and consider
it cheap, because the layer below is the one that took the thinking.

---

## Part 2 — What a game needs that a tracker never did

### 2.1 The Mission Layer

The tracker treats the Mission Phase as a doorway: three steps, a note saying "work it on paper",
and a form for typing in what happened. That doorway is where an entire game goes.

What has to exist that does not:

- **A board.** The tabletop measures in inches over terrain the players built. A computer needs
  a canonical spatial model — square grid, hex grid, or free movement with measured ranges — and
  that choice propagates into every movement, range, line-of-sight and cover rule in the book.
  It is the first irreversible decision of the project and deserves a prototype before a
  commitment. Free movement is the most faithful to measuring tape; a grid is dramatically
  easier to make legible, to pathfind on, and to write a zombie AI against.
- **The Tactical Round.** Activation order, actions per activation, and the interaction between
  survivor turns and zombie turns, as a state machine that can be saved, stepped and undone.
- **Line of sight, cover, terrain.** All of it currently resolved by looking at a table. All of
  it now geometry, and all of it now something the player must be able to *see* the game's answer
  to, because an invisible LoS ruling is the fastest way to lose a player's trust.
- **Attacks.** Skill Score versus Defense, with the item modifier that Phase 5 was always going
  to add, wounds, death, and the bite-and-infection rules the campaign layer already half-knows
  about (`bite-restrained`, `survivor-bitten` are live log events today).
- **Objectives and mission types.** Search, escape, rescue, Siege Defense, the First Mission,
  Claim a New Base. Each is setup rules, victory conditions and a spawn model. This is content,
  not engine, and it belongs in `src/data` under the same "adding a mission is a data edit"
  discipline as facilities.
- **Mid-mission persistence.** The current save format holds a campaign between turns. A game
  must save in the middle of tactical round four. That is a new state shape roughly the size of
  `Campaign` itself, with its own migrations, and the cleanest design is a `Mission` that is
  created at the start of the phase, torn down at the end, and applies a typed result — XP,
  materials, wounds, deaths, rescued strangers, unlocked missions — to the campaign it came
  from. The seam for that result already exists, because the tracker's forms write exactly those
  fields today.

### 2.2 The zombies have to play themselves

This is the hardest problem in the project and it is easy to under-price.

On the table, the rules say what the horde does and the players carry it out, resolving the
gaps by reading intent and agreeing with each other. That is not a specification. "Move toward
the nearest survivor" is four decisions in a trench coat — nearest by what metric, through what,
breaking ties how, and what happens when the path is blocked by another zombie. A computer has
to answer all four, identically, every time, and the answer has to *look* like what a table
would have done or players will call it broken.

Concretely this needs:

- A written behaviour specification per enemy type, derived from the rules and ruled on where
  the rules stop.
- Pathfinding and target selection that are deterministic and explainable — ideally with a debug
  view showing why a zombie did what it did, which is as much a design tool as a test tool.
- Noise, attraction and spawn behaviour, which on the table are the tension and in code are the
  difference between a horror game and a chess problem.
- Tuning, which is playtesting, which is time — and which the seeded-RNG property above makes
  vastly cheaper, because a headless simulator can play ten thousand missions overnight and
  report where the difficulty curve actually sits.

### 2.3 Ambiguity stops being survivable

A tracker can say "the table decides" and be right. A game cannot. Every rule the book leaves
open becomes a decision someone makes once, and the game then makes forever.

This repository has already found several — the Planning Phase step order where pg. 17 and
pg. 21 contradict each other, the promotion rule that changed between editions, the Rare Goods
*and* versus *or*. Each is written down in [`docs/rulebook-edition.md`](rulebook-edition.md)
with the reasoning, specifically so a later reader does not "correct" it back. That habit should
become a formal **rulings log**: every ambiguity, the options, the ruling, and — the new part —
whether Jordan confirmed it.

Access to the author turns the worst part of adapting a tabletop game into its best part. Use it
deliberately: batch the questions, record the answers, cite the ruling in the code the way page
numbers are cited now.

### 2.4 The content that does not exist yet in any form

- **Equipment** (the tracker's Phase 5): the item catalogue, Inventory Slots, the item modifier
  term in Skill Score, crafting gated by the Metal Shop and Gunsmith, the Rare Item Table.
  Already stubbed for throughout the codebase — `skillScore` in `src/engine/survivor.ts`
  deliberately notes the missing term rather than quietly disagreeing with the book.
- **Story Traits** (Phase 7): infection, the Community Layer effects, the counters.
- **Mission narrative**: what the book has, plus whatever a game needs beyond it — a campaign
  arc, an ending, the reason to keep playing past turn twelve. Worth asking Jordan what he
  already has that never fit in 188 pages.

### 2.5 Presentation

2D and turn-based is the right call and it is not the cheap call. A tactical game has to render
a board, animate an attack, show a range and a line of sight before the player commits, make an
eleven-step campaign turn feel like decisions rather than a form, and communicate a rules engine
this detailed without a rulebook open beside it. Tooltips that quote the actual rule — legal, in
a licensed game, and impossible in this repository today — do an enormous amount of that work.

---

## Part 3 — Architecture, and one recommendation

### Keep the rules engine. Replace everything above it.

The recommendation is to treat `src/engine`, `src/data` and `src/persistence` as the crown
jewels and build outward. Three options for what sits on top:

| | reuse | tooling | risk |
|---|---|---|---|
| **Web stack, PixiJS board, Tauri for desktop** | total | adequate | low technical, unglamorous |
| **Godot 4, rules rewritten in C#/GDScript** | none | excellent | reimplementing 11k tested lines |
| **Godot front end, TS engine compiled to WASM** | total | excellent | a bridge nobody else maintains |

**Recommended: the web stack.** A turn-based 2D game has no performance requirement that a
canvas renderer cannot meet, Steam ships wrapped web games routinely, and the alternative starts
by throwing away the most valuable and most thoroughly tested part of what exists. Godot earns
its place on a game that needs physics, 3D or a large scene graph. This one needs a grid, sprites
and a state machine.

Revisit only if the art direction turns out to want something a canvas is bad at, or if a
publisher has a platform requirement — console certification is the realistic reason to change
this answer.

### Four decisions that follow

- **Dice move inside.** A seeded PRNG, threaded as an input the way `D10Result` already is, so
  a run is reproducible from its seed. Every mission and campaign becomes replayable, which is
  the foundation of both bug reports and automated balance testing.
- **Mission state is its own shape, with its own migrations.** Same discipline as `Campaign`:
  primitive facts only, derived values recomputed, a fixture per schema version. The existing
  migration harness is the pattern to copy, not to extend — a mission and a campaign have
  genuinely different lifetimes.
- **Maps are data and need an editor.** Tiled (TMX/JSON) is the default answer. Hand-authoring
  tactical maps in a text file works for exactly two maps.
- **Undo is not optional any more.** The tracker deferred it to Phase 8 and got away with it. A
  tactical game where a misclick costs a survivor needs undo on day one, which means the round
  state machine must be built to support it from the first commit rather than retrofitted.

---

## Part 4 — A phased plan

Each phase leaves something real, in the discipline the tracker's phases already follow.

**Phase A — Rights and rulings.** Establish who can license what. Start the rulings log. No
code. Cannot be parallelised past, and is cheap to start this week.

**Phase B — The vertical slice.** One map, one mission, four survivors, one enemy type, melee
and ranged, one objective, ugly placeholder art. Playable start to finish. This exists to answer
the questions no design document can: does the grid decision hold up, does the zombie AI feel
like the table, is a tactical round fun on a screen. **Everything after this is conditional on
it,** and it is the only honest way to price the rest.

**Phase C — Equipment (tracker Phase 5).** Worth doing whichever way the rights question lands:
it completes the item modifier the Skill Score formula is missing, and the game needs the same
catalogue. The one piece of work with no wasted motion in any outcome.

**Phase D — The Mission Layer in full.** All mission types, all enemies, Siege Defense, the
First Mission, Claim a New Base. The largest engineering phase.

**Phase E — The campaign wrapped around it.** The existing engine, with a game's interface
rather than a tracker's, and the mission result flowing in where forms currently sit.

**Phase F — Content and polish.** Art, audio, narrative, tutorial, balance. Longer than expected.
Always is.

**Phase G — Ship.** Steam page early rather than late, a demo, and playtesting — for which this
project already has a habit and a branch-per-playtest workflow.

Deliberately unnumbered, because attaching months to phases before Phase B exists is how
schedules become fiction.

---

## Part 5 — What code does not solve

**Art is the budget.** Survivors, zombies, terrain tiles, facilities, items, UI, and enough of
each that a twenty-hour campaign does not repeat itself. Style choice drives cost more than
anything else — pixel art and flat illustration are worlds apart from painted assets. This is
contract work or a partner, and it is the line item most likely to exceed the engineering one.

**Audio.** Ambience, impacts, a score. Smaller than art, not free, and disproportionately
responsible for whether a horror game is tense.

**Writing.** Mission narrative, event text, the campaign arc. Jordan is the obvious answer and
worth asking about early, since it shapes what the mission data has to carry.

**Production.** Playtest coordination, a Steam page, marketing, community. The tabletop game's
existing audience is the best asset here and the reason a licensed adaptation starts ahead of
an original title.

Realistic shape: one engineer full-time or one engineer plus one designer, a contract artist, a
contract composer, and Jordan on rules and narrative. Anything smaller stretches; anything much
larger needs the licensing answered first anyway.

---

## Part 6 — The four risks worth naming

- **Rights stall.** Mitigated only by asking now.
- **Faithful turns out not to be fun.** A ruleset tuned for four people around a table with
  physical dice and conversation can be tedious alone in front of a screen. Phase B exists to
  find this out for the price of a slice instead of a project. If it happens, the answer is
  negotiated divergence with the author, not a quiet rewrite.
- **The AI never feels right.** The most likely place for the schedule to double. Budget for
  iteration and build the debug view early.
- **Scope drift into a bigger game.** Multiplayer, campaign generation, 3D, mod support. Each
  is reasonable and each is another project. The mitigation is this document's scope statement
  and the same phase discipline that has kept the tracker shippable at every step.

---

## Part 7 — What to do next, regardless of the answer

Three things that pay off whether the game happens or not:

1. **Ask Jordan who holds the digital rights**, and whether Modiphius needs to be at that
   conversation. One email, and it determines everything else.
2. **Start the rulings log** as a document in this repository, seeded from the ambiguities
   already found. It makes the tracker more correct today and becomes the game's rules
   specification later.
3. **Build tracker Phase 4 and Phase 5** — mission metadata and equipment. They finish the
   tracker's own roadmap, they close the Skill Score formula, and they are the first two data
   files the game would need on its first day. There is no version of the future in which that
   work is wasted.

---

*This document is about a hypothetical licensed product. This repository remains what
[`NOTICE`](../NOTICE) says it is: an unofficial, unaffiliated campaign tracker that ships no rule
text and is useless without the book.*
