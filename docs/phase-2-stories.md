# Phase 2 — Base: deliverable stories

Breakdown of Phase 2 from the campaign tracker plan. Phase 2 ships **the base sheet** — a
claimed base with its slot layout, facilities and upgrades built into those slots against real
Hardware and Labor costs, Power and Water assigned, and the numbers a base produces every turn
computed rather than counted by hand.

Each story below is independently buildable, independently verifiable, and leaves the repo in a
working state. They are listed in dependency order.

## Why this document exists

[Phase 0](phase-0-stories.md) explains the three failure modes of the July 2025 attempt that
every story is shaped against. [Phase 1](phase-1-stories.md) put two of them under load. Phase 2
puts the same two under considerably more:

- **Rules embedded in UI callbacks.** The July attempt kept facility costs and storage caps
  inside DOM-update functions, and that is the single largest block of rules in the book. Phase 2
  is where `src/data` either holds or fails to hold the rules it was built for. A facility cost
  appearing inside a component is not a lint failure to fix later; it is the previous attempt
  happening again.
- **No shippable intermediate state.** Phase 2 has to be useful before Phase 3 exists, and it is:
  it replaces the base worksheet. A base you can lay out, build into, and read the derived
  numbers off is worth having with no turn engine anywhere in sight.

The third failure — the whole ruleset in scope from turn one — is what the scope boundary below
is for. Facilities *produce* into a turn structure that does not exist yet, and this phase must
not build that turn structure on the way past.

## Architecture rules these stories must not break

1. **Rules as data** — `src/data/*.ts`, separate from engine, separate from UI.
2. **Pure engine** — derived values are pure functions over campaign state. The UI only renders
   and dispatches. Enforced by `no-restricted-imports` in `eslint.config.js`.
3. **Derived is never stored** — storage caps, bed count, utility pool sizes, production output
   and the used-upgrade count are computed on every read. None of them may appear on the `Base`
   type.

## Scope boundary

Phase 2 is done when a base can be claimed, laid out, built into and upgraded legally, with
Power and Water assigned, and every derived base number correct — round-tripped through the save
file.

Phase 2 explicitly does **not** include: the campaign turn, phase transitions, or any Management
Phase math (Phase 3); survivor *assignment* to facilities (Phase 3 — see the note on staffing
below); missions, including Claim a New Base (Phase 4); what goes into the base Inventory
(Phase 5); the effects of the origin-gated facilities (Phase 7). Beds are *counted* here; who
sleeps in them is Phase 3. Storage caps are *computed* here; the Check Storage step that enforces
them is Phase 3.

**Staffing is the boundary that will be tempting to cross.** A staffed facility produces its
staff's Skill Score, so production looks like it needs to know who is assigned. It does not:
Phase 2's production functions take the staffing as an *argument*, and Phase 3's Planning Phase
supplies it. Storing an assignment on the base here would be building Planning Step 1 a phase
early, with none of the one-assignment-per-survivor rules that make it correct.

## The rules this phase encodes

Numbers and structure only — no rule text, per the copyright posture. Page references are to the
Modiphius edition — see [`rulebook-edition.md`](rulebook-edition.md); the app cites, it does not
restate.

| | | Page |
|---|---|---|
| Base Tiers | 1–3, each with a fixed list of Facility Slots | 54 |
| Facility Slots | each Indoor or Outdoor; each built-in, empty, or a clearing project | 54 |
| Built-in facilities | permanent, sometimes pre-upgraded, and then not upgradable further | 54 |
| Facility cost | Hardware + Labor, paid on build | 72–73 |
| Facility requirements | Indoor / Outdoor / Power / Water; an unmet requirement means **no effect at all**, not a reduced one | 67, 72–73 |
| Upgrades | maximum **three** per facility; repeats allowed; never built the same turn as their facility | 54 |
| Rare base upgrades | do **not** count against the three | 49 |
| Power and Water | separate pools, generated and assigned at the end of Planning Step 1, do not accumulate, and cover a facility's upgrades along with the facility | 20, 67 |
| Production | passive (a number) or staffed (a skill — output is the staff's Skill Score), often halved without a utility | 67, 72–73 |
| Storage cap | base Tier + 3 per material, plus upgrades | 54 |
| Hero cap | how many Heroes a community may hold is set by base Tier | 7, 54 |
| Labor pool | Σ Tier levels of the project team; unspent Labor is lost | 20 |
| New in this edition | Greenhouse, Med Lab, Recovery Room, Watch Post, Spotlight, Metal Shop, Gunsmith, Study Room | 72–73 |
| Origin-gated | Containment, Lounge, Mystic Library — in the data, hidden until an origin selects them | 122–133 |

**Three things that look like one rule and are not:**

1. **A slot's Indoor/Outdoor is not a facility's Indoor/Outdoor.** The slot has a kind; the
   facility has a requirement. They are compared, and modelling either as the other collapses a
   check into an assumption.
2. **"Halved without a utility" and "requires a utility" are different rules.** Some facilities
   produce nothing at all without Power or Water; some produce half. The data has to say which,
   per facility, because the difference is invisible from the shape of the entry.
3. **The three-upgrade cap counts non-rare upgrades only** (pg. 49). So the count is derived from
   the instance's upgrade list filtered by the catalogue's `rare` flag, never stored as a number.

## The data this phase cannot invent

**Z2-1 requires the rulebook open at pg. 54 and pg. 72–73.** Everything else in Phase 2 is
structure, and structure can be designed from the summary in the project note. The base slot
layouts and the facility cost table are neither — they are dozens of specific numbers, and there
is no way to derive, infer or reconstruct them. They get transcribed from the printed tables,
against the book, and checked twice.

Two consequences worth stating rather than discovering:

- **Z2-1 is the long pole and cannot be parallelised.** Every story after it reads its shape.
- **The citations in the table above come from the project note's re-basing, not from the tables
  themselves.** When the tables are transcribed, confirm each page as it is used. A citation that
  is four off is exactly the failure the edition retrofit (#48) existed to remove, and this phase
  will roughly double the citation count in the repo.

## Decisions recorded, rather than left to the implementation

**Labor is entered by hand.** The Labor pool comes from the project team, which is Planning Step
2 and does not exist until Phase 3. Phase 2 checks a build against a Labor number the player
types, exactly as Phase 1 lets XP be entered by hand rather than pre-building the Advancement
Phase to award it. This keeps the cost *rule* real — a build that cannot be paid for is refused —
while leaving where the money came from to the phase that knows.

**`builtOnTurn` is stored on each facility instance.** Upgrades may not be built the same turn as
their facility (pg. 54), and nothing else in a campaign records when a facility went up. It is a
primitive fact — *when this happened* — not a derived one, and it is the only way that rule can
be enforced after a reload.

**Utility assignment is stored; the pool size is derived.** How much Power the base generates is
arithmetic over the facility list and gets recomputed. *Which* facilities the player put it on is
a decision, and decisions persist. The per-turn reset belongs to Planning Step 1, which is Phase
3; until then the assignment simply stands.

**The base is nullable, and null is a real answer.** A campaign before its first base has no
base, which is the state the Start a New Community and Claim a New Base missions resolve. Modelling
that as a base with no slots would make "no base yet" and "a base with nothing in it" the same
value, and they are not — the same reasoning that keeps `origin` optional rather than adding a
fourth member meaning "none".

**Mid-campaign base moves are deferred to Phase 4, but not designed out.** Claim a New Base is a
mission, and missions are Phase 4. What Phase 2 owes that phase is a shape that can survive it:
the base's identity is a field that can be replaced, facilities belong to the base rather than to
the campaign, and nothing anywhere caches a value derived from the base Tier. The open question
of what carries forward — Inventory, Hero cap on a downgrade — is Phase 4's to answer, and Phase
2 should not answer it early.

**The Hero cap becomes enforceable here.** [Z1-7](phase-1-stories.md) deferred it with a reason:
the cap depends on base Tier and there was no base. There is now, so it joins the other legality
violations, with the same visible override and the same rule that the override is never stored.
A community that was legal before it claimed a smaller base keeps reporting the violation for
exactly as long as it holds.

**Origin-gated facilities ship in the data and stay out of the picker.** `origin` landed on
`Campaign` in schema v4 for this. The catalogue carries the flag from day one, the picker filters
on it, and what Containment or the Lounge actually *do* is Phase 7. A facility in a data file that
no screen offers costs nothing; a data file that has to be revisited to add a column costs a
phase.

---

## Z2-1 — Base and facility rules as data

**Why:** The largest block of rules in the book, and the story the "rules as data" architecture
was built for. Every story after this reads from it. **Needs the rulebook open at pg. 54 and
72–73** — see [the note above](#the-data-this-phase-cannot-invent).

**Scope**
- `src/data/bases.ts`: base Tiers 1–3; each base's slot list, with each slot's Indoor/Outdoor
  kind and its initial state (built-in with a named facility and any pre-installed upgrades,
  empty, or requiring a clearing project with its cost); the storage cap rule; the Hero cap per
  base Tier.
- `src/data/facilities.ts`: the facility catalogue. Per entry: id, Hardware and Labor cost,
  slot requirement, Power/Water requirement and whether the requirement halves output or removes
  it, production (a passive number or a governing skill), beds, storage modifiers, Siege Threat
  modifiers, an `origin` flag where the facility is origin-gated, and its upgrades — each with
  its own cost, requirements, effect fields and a `rare` flag.
- Upgrades belong to their facility rather than living in a flat list, so "an upgrade with no
  parent" is unrepresentable rather than merely invalid.
- Effects are **structured fields, not free text**. `beds: 2` is data; "adds two beds to the
  community" is rule prose and does not ship.

**Acceptance**
- Every facility has a cost, a slot requirement and at least one effect field.
- Every upgrade names a facility that exists; a test walks the catalogue and asserts it.
- Every origin-gated entry carries an origin that is a member of `CAMPAIGN_ORIGINS`.
- The eight facilities new to this edition are present.
- No rule prose anywhere in either file — page citations in comments only.
- A `sourceEdition`-style comment header naming the edition and the transcription date, so a
  later errata can be told from a typo.

**Out of scope:** equipment (Phase 5), mission metadata (Phase 4). The Metal Shop and Gunsmith
appear here as facilities; what they *gate* is Phase 5's problem and Phase 5's data.

---

## Z2-2 — `Base` type and schema v5

**Why:** The second real migration, and the one that finally replaces a placeholder that has been
`null` since Phase 0. A campaign built in Phase 1 must still open after this ships.

**Scope**
- A `Base` type holding **only primitive facts**: which base was claimed, and per slot, the
  facility instance in it — facility id, the upgrades built, the turn it was built on, and its
  Power and Water assignment.
- `Campaign.base` widens from `null` to `Base | null`.
- `CURRENT_SCHEMA_VERSION` → 5, with a matching migration step and a `campaign-v5.json` fixture.
  The migration is a no-op on data: an existing campaign has no base, which is what null means.
- Export key order extended to the base, so saves keep diffing cleanly.
- Save-file shape validation extended to the base, so a damaged base reports a readable error
  instead of crashing a screen — including a facility id that is not in the catalogue, which is
  what a save from a future version looks like.
- A base-level key canary, matching the survivor one, so adding a computed field to the type
  fails a test.

**Acceptance**
- The v4 fixture migrates forward; the v5 fixture round-trips unchanged.
- The version-bump guard test still fails when the version is bumped without a step and fixture.
- The property-based round-trip suite covers bases: `src/test/arbitraries.ts` grows a `Base`
  arbitrary, typed as producing `Base`, so a later shape change breaks it at compile time.

**Out of scope:** staffing assignments and the base Inventory. Their rules are Phases 3 and 5.

---

## Z2-3 — Derived base values

**Why:** The arithmetic the base worksheet makes you do by hand, and the second demonstration of
"derived is never stored" — this time over a shape that is much more tempting to cache than a
survivor was.

**Scope**
- Pure functions over a `Base` plus the catalogue: storage cap per material, bed count, Power and
  Water pool sizes, the Siege Threat contribution from base modifiers, the used- and
  remaining-upgrade counts for a facility, and the Hero cap.
- The upgrade count filters the `rare` flag, per pg. 49.
- Storage cap composes: base Tier + 3 per material, then every upgrade that modifies it.

**Acceptance**
- A base with a storage upgrade has a higher cap for exactly the material the upgrade names.
- A facility with three ordinary upgrades and one rare upgrade reports three used, zero
  remaining, and accepts another rare one.
- A test asserts the Hero cap against each base Tier.

**Note, deliberately not built here:** total Siege Threat, which also counts staffed facilities
and the project team (pg. 23). Phase 2 computes the base's own contribution; Phase 3 sums it
with the parts that need the turn.

---

## Z2-4 — Claim a base, and the slot map

**Why:** The first story where the app holds base state, and the smallest thing that is already
useful — a picture of the slots, which is most of what the paper worksheet is.

**Scope**
- Choose a base; its slot layout materialises, with built-in facilities already in place and
  clearing-project slots marked as such.
- The slot map as a screen: each slot's kind, what is in it, and what it would take to use it.
- A `base/claimed` action following the existing action shape, with exhaustiveness preserved.
- Replacing a claimed base is out — that is Claim a New Base, and it is Phase 4. The action
  should not quietly permit it.

**Acceptance**
- A claimed base survives an export, a reload, and an import.
- Built-in facilities that ship pre-upgraded arrive with those upgrades already recorded, and
  report zero remaining upgrades where the book says they cannot be upgraded further.

---

## Z2-5 — Build a facility into a slot

**Why:** Where the base rules acquire teeth, and the story that decides whether a cost is a rule
or a decoration.

**Scope**
- Build a facility from the catalogue into an empty slot: the slot kind must match the facility's
  requirement, the slot must be empty, the Hardware cost must be payable from
  `campaign.materials`, and the Labor cost must be payable from the hand-entered Labor.
- Hardware is deducted; Labor is not stored, because there is nothing yet to store it on.
- Violations reported as a pure function in the shape `legality.ts` already uses — a `code`, a
  message for a person at a table, and the page.
- The same visible override as Phase 1, gating the action once and never stored.
- The picker filters origin-gated facilities against `campaign.origin`.

**Acceptance**
- An Indoor facility cannot be built into an Outdoor slot, and the message says which.
- A build that costs more Hardware than the community holds is refused, and the override lets it
  through.
- Building deducts exactly the Hardware cost and nothing else.

---

## Z2-6 — Upgrades and the three-upgrade cap

**Why:** Three rules that interact — a cap, an exemption, and a timing constraint — and the only
place in Phase 2 where the turn number is load-bearing.

**Scope**
- Build an upgrade onto a facility: it must be one of that facility's own upgrades, the facility
  must not have been built this turn, and non-rare upgrades must be within the cap of three.
- Repeats are allowed where the book allows them.
- Rare base upgrades bypass the cap (pg. 49).
- Built-in facilities that arrive pre-upgraded and un-upgradable refuse all of it.

**Acceptance**
- An upgrade is refused on the turn its facility was built, and accepted on the next.
- A fourth ordinary upgrade is refused; a rare upgrade on the same facility is accepted.
- The refusals carry page citations, because every one of them is a rule a player may want to
  check.

---

## Z2-7 — Clearing projects

**Why:** The third slot state, and the one that is a small project rather than a facility — it
costs Labor, produces nothing, and turns one slot into another slot.

**Scope**
- A clearing-project slot shows its cost and can be cleared by paying it.
- Once cleared, the slot is an ordinary empty slot of its kind and builds into it normally.
- Clearing is recorded on the base, because "this slot has been cleared" is a primitive fact that
  no amount of arithmetic over the rest of the campaign can recover.

**Acceptance**
- An uncleared slot refuses a build, with a message naming the clearing project.
- A cleared slot survives an export and an import as cleared.

---

## Z2-8 — Power and Water

**Why:** Two pools with identical mechanics and completely separate accounting, and the rule that
an unmet requirement means *no effect at all* — which is the difference between a base sheet that
is right and one that is optimistic.

**Scope**
- Pool sizes derived from the facilities that generate them; each point covers one facility **and
  all of its upgrades** (pg. 20, 67).
- Assign and unassign a point to a facility, refusing an over-assignment of a pool.
- A facility whose Power or Water requirement is unmet contributes nothing — no beds, no storage,
  no production — where the book says the requirement is absolute, and half production where the
  book says halved.
- The assignment persists; the pool size does not.

**Acceptance**
- Assigning Power to a facility with two upgrades costs one point, not three.
- Removing the last point of Water from a facility whose output halves without it halves that
  output, and does not zero it.
- A pool cannot be over-assigned, and the message says by how much.

**Note:** the per-turn reset — utilities are generated and assigned at the end of Planning Step 1
and last until the next turn's Planning Phase — is **Phase 3**. Phase 2 builds the pools and the
assignment; Phase 3 decides when they clear.

---

## Z2-9 — Production, and the base sheet

**Why:** **This is the story that replaces the base worksheet**, and the reason Phase 2 is worth
shipping before Phase 3.

**Scope**
- Production as a pure function per facility: passive facilities return their number; staffed
  facilities take the assigned survivor (or survivors, for the facilities whose upgrades sum
  their staff's scores) and return the Skill Score, halved where a missing utility halves it.
- The staffing arrives as an argument — see the scope boundary above. Phase 2's screen lets the
  player pick a staff member to *preview* the output; nothing is stored.
- The base sheet: slots and their contents, beds, storage caps per material against the current
  materials, Power and Water assigned against generated, the base's Siege Threat contribution,
  the Hero cap against the current roster, and per-facility production.
- Tablet-first, consistent with the Phase 0 shell and the Phase 1 sheet.

**Acceptance**
- Every number a player would otherwise compute on the base worksheet is on the sheet and
  correct.
- A staffed facility's previewed output changes when the previewed staff member changes, and when
  a utility is removed.
- The sheet renders a base with every slot empty and a base with every slot full, without special
  cases.

---

## Phase 2 is done when

A base can be claimed, laid out, cleared, built into and upgraded — legally, against real
Hardware and Labor, with Power and Water assigned — and every derived number on the base sheet is
correct, round-tripped through a save file, with CI green including the end-to-end round-trip,
the mutation score holding, and no rule prose in the repo.
