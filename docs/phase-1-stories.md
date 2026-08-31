# Phase 1 — Roster: deliverable stories

Breakdown of Phase 1 from the campaign tracker plan. Phase 1 ships **the character sheet** —
survivors with tiers, stats, skills and computed scores, created legally, advanced with XP, and
carried through the save file that Phase 0 built.

Each story below is independently buildable, independently verifiable, and leaves the repo in a
working state. They are listed in dependency order.

## Why this document exists

[Phase 0](phase-0-stories.md) explains the three failure modes of the July 2025 attempt that
every story is shaped against. Phase 1 is where two of them get their first real test:

- **Rules embedded in UI callbacks.** Phase 1 is the first phase that holds any rule at all.
  Every number below lands in `src/data/`, and any of them appearing inside a component is the
  failure repeating itself.
- **No shippable intermediate state.** Phase 1 has to be useful before Phase 2 exists. It is:
  it replaces the paper character sheets, and a community you can build, advance and save is
  worth having with no base and no turn engine anywhere in sight.

## Architecture rules these stories must not break

1. **Rules as data** — `src/data/*.ts`, separate from engine, separate from UI.
2. **Pure engine** — derived values are pure functions over campaign state. The UI only renders
   and dispatches. Enforced by `no-restricted-imports` in `eslint.config.js`.
3. **Derived is never stored** — Skill Score, max HP, item slots and labor are computed on every
   read. None of them may appear on the `Survivor` type.

## Scope boundary

Phase 1 is done when a legal starting community and its field recruits can be built, advanced
with XP, and round-tripped through a save file, with every computed value correct.

Phase 1 explicitly does **not** include: the base or facilities (Phase 2), any campaign phase
transition or the Management Phase math (Phase 3), missions and the XP they award (Phase 4),
equipment and inventory contents (Phase 5), or survivor keywords (Phase 7). Item slots are
*counted* here; what goes in them is Phase 5.

## The rules this phase encodes

Numbers and structure only — no rule text, per the copyright posture. Page references are to the
rulebook; the app cites, it does not restate.

| | | Page |
|---|---|---|
| Stat arrays | T1 `1 0 0 0` · T2 `2 1 0 0` · T3 `3 2 1 0` · T4 `4 3 2 1`, assigned to stats of your choice | 38–39 |
| Skill slots | = Tier | 38–39 |
| Skill levels | 0–4, maximum equal to Tier, start at 0, cannot be gained out of order | 41, 30 |
| Skill Score | skill level + governing stat | 41 |
| Common skills | Move and Defense — no governing stat, Score only, both start at 6, maximum 8 | 41, 30 |
| Max HP | = Tier | 49 |
| Item slots | = Tier + Carry **Score** | 49 |
| Labor generated | = Tier | 32 |
| Starting community | 10 total Tier levels (1 Hero + 2 Leaders is a recommendation, not a rule) | 48 |
| Skill advancement | XP cost = the **new level** | 30 |
| Move/Defense advancement | XP cost = the **new Score** | 30 |
| Tier advancement | XP cost = new Tier × 2; grants a new skill slot and a stat increase | 30 |
| Field recruits | T2 → 2 skills, one rolled · T3 → 3 skills, one rolled · T1 → 1 skill, never rolled · T4 never recruited in the field | 38–39, 50 |
| Recruit skill roll | d10 table; result 10 is the player's choice | 50 |

**Two things that look like one rule and are not:**

1. **Move/Defense do not cost what skills cost.** A skill costs its new *level* — 1 through 4.
   Move and Defense have no level, only a Score, and cost their new *Score* — 7, then 8. Both
   come from the same sentence on pg. 30, and conflating them makes Move cost 1 XP.
2. **Item slots use Carry's Score, not its level.** So carrying capacity moves when Strength
   moves, not only when Carry is trained.

## Two readings, decided

Both are recorded here and named in code, so a later reader can tell an interpretation from a
quotation and change it in one place.

**Tier promotion rebuilds the stat array.** pg. 30 says a promoted survivor's stats "are
increased by one" and then adds a tie-break for survivors with more than one stat at zero; the
two obvious readings of that contradict each other. Decision: a promoted survivor ends up with
the canonical array for their new Tier, with the zero-stat clause deciding which zero fills in.
A promoted Citizen and a created Citizen are therefore the same character. They keep their
existing skills and gain one new slot.

**Legality is enforced, with a visible override.** Illegal survivors are blocked by default, with
an "allow anyway" escape for house rules and for cases this app models wrong.

**The override is not stored.** A flag on the survivor would be a derived fact on the persisted
schema — it would need a migration, and it would drift out of sync with a survivor who has since
become legal. Instead, validation is a pure function returning violations, the override gates the
action once, and an illegal survivor keeps showing a warning for exactly as long as they are
actually illegal.

---

## Z1-1 — Survivor rules as data

**Why:** The first rules to enter the repo, and the story that decides whether rule numbers have
one home or several. Everything after this reads from it.

**Scope**
- The four stats, and the twenty skills with their governing stats, as an `as const` list so the
  runtime list and the type union cannot drift apart.
- The common skills, Move and Defense, modelled as Score-only — they have no governing stat and
  no level, and a shape that pretends otherwise will produce the cost bug above.
- The tier table: stat array, skill slots, maximum skill level, max HP, labor.
- The d10 recruit skill table, including the player's-choice result.
- Advancement costs as functions of the target level or tier, not as lookup literals.

**Acceptance**
- Tests assert twenty skills, five per stat, four tiers, and the stat array for each tier.
- A test asserts the two cost shapes differ: a skill at level 2 costs 2; Move at Score 7 costs 7.
- No rule prose anywhere in the file — page citations in comments only.

**Out of scope:** facilities, equipment, missions. Those are Phases 2, 5 and 4.

---

## Z1-2 — Page citation component

**Why:** Deferred from Z0-7 until a screen actually needed to cite a page. Phase 1 is that
screen. Citing consistently is what makes "the app is useless without the book" true in practice
rather than only in the README.

**Scope**
- A small component rendering a page reference in one consistent form.
- The copyright posture stated on screen, not only in the README.

**Acceptance**
- Every rule-derived number on a Phase 1 screen can be traced to a page without restating a rule.

---

## Z1-3 — `Survivor` type and schema v2

**Why:** The first real migration, and the reason Z0-4 exists. Until now the chain has had
nothing to carry. A campaign created in Phase 0 must still open after this ships.

**Scope**
- A `Survivor` type holding **only primitive facts**: id, name, tier, the four stat values, skill
  levels, Move and Defense scores, current HP, XP.
- `Campaign.survivors` widens from `readonly never[]` to `readonly Survivor[]`.
- `CURRENT_SCHEMA_VERSION` → 2, with a matching migration step and a `campaign-v2.json` fixture.
- Export key order extended to survivors, so saves keep diffing cleanly.
- Save-file shape validation extended to survivors, so a damaged roster reports a readable error
  instead of crashing a screen.

**Acceptance**
- The v1 fixture migrates forward; the v2 fixture round-trips unchanged.
- The version-bump guard test still fails when the version is bumped without a step and fixture.
- A survivor-level key canary, so adding a computed field to the type fails a test.

**Out of scope:** equipment, keywords, assignments. Adding fields for them now would be designing
Phase 5 and Phase 7 shapes before their rules exist.

---

## Z1-4 — Derived survivor values

**Why:** The arithmetic the paper sheet makes you do by hand, and the clearest demonstration of
"derived is never stored".

**Scope**
- Skill Score, max HP, item slots, labor, and the community's total Tier levels, as pure
  functions with no DOM.

**Acceptance**
- A Tier 4 survivor with Strength 3 and Carry level 2 has 4 HP and 9 item slots.
- A Tier 2 survivor cannot hold a level-3 skill.

**Note, deliberately not built here:** the Phase 3 hunger penalty drops every stat and so
retroactively changes every Skill Score for the turn — which is precisely why these are computed.
Phase 1 should not pre-build a penalty parameter for a caller that does not exist yet.

---

## Z1-5 — Roster: add, rename, remove

**Why:** The first story where the app holds game state, and the smallest thing that is already
useful — a list of who is in the community.

**Scope**
- Add a survivor by name and tier, stats defaulted from the tier array.
- Rename; remove with confirmation.
- New store actions following the existing action shape, with exhaustiveness preserved.

**Acceptance**
- Survivors survive an export, a reload, and an import.

---

## Z1-6 — The character sheet

**Why:** **This is the story that replaces the paper sheet**, and the reason Phase 1 is worth
shipping before Phase 2.

**Scope**
- Stats; all twenty skills grouped by governing stat with computed Scores; Move and Defense;
  current and max HP; item slots; XP.
- Current HP editable — a wounded survivor is a fact from the table, and nothing else in Phase 1
  produces it.
- Tablet-first, consistent with the Phase 0 shell. This gets read standing next to a table.

**Acceptance**
- Every number a player would otherwise compute by hand is on the sheet and correct.

---

## Z1-7 — Legal creation and skill assignment

**Why:** Where the rules acquire teeth. A tracker that lets you build an illegal survivor is
worse than paper, because it looks authoritative.

**Scope**
- Assign the tier's stat array to stats of your choice; choose skills up to the tier's slots;
  respect the maximum skill level; refuse levels bought out of order.
- The 10-Tier-level starting budget as a running total.
- Validation as a pure function returning violations; the UI blocks by default and offers the
  one-time override.

**Acceptance**
- A 10-Tier-level community validates clean; an eleventh Tier level is blocked, and the override
  lets it through with the warning still showing afterwards.

**Deferred with a reason:** the Hero cap depends on base Tier (pg. 38, 72), and there is no base
until Phase 2. Surface it as guidance, not as an enforced rule.

---

## Z1-8 — Field recruits and the d10 roll

**Why:** The second way survivors enter a community, and the rules differ enough from creation
to be their own story.

**Scope**
- Recruit at Tier 1–3 with the tier's skill count, one of them rolled for Tier 2 and above.
- The roll's randomness is **injected**, exactly as `createNewCampaign` injects `id` and
  `createdAt` — it keeps the engine pure and the tests deterministic.
- The roll is also settable by hand, because someone at the table may have rolled a physical d10,
  and the player's-choice result has no automatic answer.

**Acceptance**
- A Tier 3 recruit gets three skills, one of them from the table.
- Tier 4 cannot be recruited in the field.

---

## Z1-9 — XP and advancement

**Why:** The last thing the paper sheet tracks, and the story where the two cost shapes have to
coexist without one contaminating the other.

**Scope**
- Buy a skill level at cost = new level; buy Move or Defense at cost = new Score; buy a Tier at
  cost = new Tier × 2, granting the new skill slot and applying the stat-array rebuild above.
- Enforce the caps and the no-out-of-order rule; refuse a purchase that exceeds available XP;
  show the cost before committing.

**Acceptance**
- Buying Move 7 costs 7 XP and buying a level-2 skill costs 2, from the same screen.
- A Tier 2 survivor cannot buy a level-3 skill until they are Tier 3.

**Out of scope:** XP *awards* from missions and Training Rooms, which belong to the Advancement
Phase in Phase 3. Phase 1 lets XP be entered by hand, which is what the paper sheet does.

---

## Phase 1 is done when

A legal starting community and its field recruits can be built, advanced with XP, and
round-tripped through a save file — with every computed value on the sheet correct, CI green
including the end-to-end round-trip, and no rule prose in the repo.
