# Phase 3 — The turn engine: deliverable stories

Breakdown of Phase 3 from the campaign tracker plan. Phase 3 ships **the campaign turn** — the
four phases walked in order with a turn counter behind them, every survivor assigned to exactly
one task, and the Management Phase's seven steps computed rather than worked out on paper.

This is the payoff phase. Everything before it is data entry against rules; this is the part that
does the arithmetic nobody enjoys doing by hand, and the plan says that if scope has to be cut
anywhere, it gets cut *after* here.

Each story below is independently buildable, independently verifiable, and leaves the repo in a
working state. They are listed in dependency order.

## Why this document exists

[Phase 0](phase-0-stories.md) explains the three failure modes of the July 2025 attempt that
every story is shaped against. [Phase 1](phase-1-stories.md) put two of them under load;
[Phase 2](phase-2-stories.md) put the same two under considerably more. Phase 3 is the first
phase to put **all three** under load at once, and the first where the third one is the dangerous
one:

- **No shippable intermediate state.** This is the phase where that discipline is hardest,
  because a turn engine looks indivisible: it is tempting to write one story called "the turn
  works" and disappear for a week. It is not indivisible. Each phase of the turn is useful the
  day it lands, because the app already replaces two paper sheets — a Management Phase that
  computes Unrest correctly is worth having while the Advancement Phase is still done by hand,
  and a turn counter is worth having before either.
- **Rules embedded in UI callbacks.** The Management Phase is the second-largest block of rules
  in the book and by far the most interconnected. It is also the block most naturally written as
  "when the player clicks Next, do all of this" — which is the July attempt's exact shape. Every
  step is a pure function in `src/engine`; the screen calls them and renders what comes back.
- **The whole ruleset in scope from turn one.** The turn *touches* everything: missions,
  equipment, traits, origins. Four of the remaining five phases are one small "while I'm here"
  away. The scope boundary below is what keeps the Mission Phase a doorway rather than a door.

## Architecture rules these stories must not break

1. **Rules as data** — `src/data/*.ts`, separate from engine, separate from UI. Thresholds get
   names, not inline numbers.
2. **Pure engine** — derived values and phase transitions are pure functions over campaign state.
   The UI only renders and dispatches. Enforced by `no-restricted-imports` in `eslint.config.js`.
3. **Derived is never stored** — Hunger, Exhaustion, Unrest, Siege Threat, the Labor pool, the
   Utilities Score and every Skill Score are computed on every read. **This is the phase that
   rule was written for.** Hunger and Exhaustion feed Unrest, Unrest combines with Siege Threat
   to decide who leaves, and the hunger penalty retroactively changes every Skill Score in the
   community for the rest of the turn. One cached number anywhere in that cascade is a wrong
   answer somewhere else, and it will be wrong quietly.

## Scope boundary

Phase 3 is done when a campaign can be played turn after turn without paper — the phases walked
in order, every survivor assigned, materials and Health distributed by the rules, and all seven
Management steps computed — with the mission itself played on the table and its outcome typed in.

Phase 3 explicitly does **not** include: playing or setting up a mission, mission rewards, or
rescued strangers (Phase 4 — see the note below); equipment, the base Inventory, or trades
arriving in the Advancement Phase (Phase 5); the Community Layer effects of Story Traits — Labor
multipliers, healing caps, assignment restrictions — or Permanent Injuries, Advantages and origin
counters (Phase 7); undo, and exporting the log as markdown (Phase 8).

**The Mission Phase is the boundary that will be tempting to cross.** It is the first phase of
every turn, so the walk hits it first, and it is the one phase this app deliberately does not
model. In Phase 3 it is a step you pass through and record the outcome of — who went, what came
back, who did not — exactly as Phase 1 typed in XP and Phase 2 typed in Labor. Computing a
mission's setup numbers from campaign state is Phase 4's whole reason for existing, and building
it here would mean designing it without the mission data that constrains it.

**Story Traits are the boundary that will be tempting to design for.** Several of them multiply
Labor, cap healing or restrict assignment, so the functions this phase writes are exactly the
ones they modify. The rule is the same one Phase 2 held for staffing: write the function so a
modifier *could* be applied to its result, and do not invent the modifier's shape a phase early.
A trait-shaped parameter with no trait to put in it is a guess about Phase 7.

## The rules this phase encodes

Numbers and structure only — no rule text, per the copyright posture. Page references are to the
Modiphius edition — see [`rulebook-edition.md`](rulebook-edition.md); the app cites, it does not
restate.

| | | Page |
|---|---|---|
| The turn | four phases in strict order, each with numbered steps | 17 |
| Mission Phase | select, equip, play; opting out lets one unassigned survivor scavenge | 17–18 |
| Advancement Phase | XP gain then spend; strangers; materials; heal wounds; add facilities, upgrades and trades | 18–19 |
| Advancement order | Heal Wounds is **step 4**, and the distribution is a constraint, not a sum | 19 |
| Material roll | one d10 **per material recovered on the mission**; 1–3 Fuel, 4–6 Food, 7–9 Hardware, 10 the Rare Item Table | 18–19 |
| Result substitution | Rationing / Mechanics / Utilities **change a roll's result**; uses = that skill's summed score across the mission | 12 |
| Teaching, on a mission | assigns 1 XP to as many survivors as the mission's summed Teaching score, **replacing** the discretionary point; max 2 per survivor | 12 |
| Teaching, in a Training Room | XP equal to the staff's Teaching score, to survivors **not** on the mission; max 2 per survivor | 70 |
| Scavenging instead | opting out of the mission sends **one** otherwise-unassigned survivor: one of every material with the Scavenge skill, one of a single material without | 17 |
| Planning Phase | one task per survivor: facility staff → project team → rest and healing → mission team | 20–21 |
| Utilities lifecycle | generated and assigned at the **end of Planning Step 1**, last until the next Planning Phase | 20, 67 |
| Labor pool | Σ Tier levels of the project team; unspent Labor is lost | 20 |
| Rest | 1 HP, usable **only by the resting survivor**; **only one survivor may rest per turn** | 19, 21 |
| Rest and healing eligibility | only survivors below maximum Health; healing at all requires a Medical Clinic | 21 |
| Wounded and injured | a **wounded** survivor may staff or join a project, forfeiting healing; an **injured** one may not join a mission team | 20–21 |
| Management Phase | seven steps: Check for Rot, Feed, Assign Beds, Calculate Unrest, Check Storage, Check the Horde, Departures | 22–23 |
| Checks | d10 + a modifier, meeting or beating a target; a natural 1 always fails and a natural 10 always succeeds | 8 |
| Check for Rot | per 0-HP survivor, a Tier check against 12 − combined Medicine of the Medical Clinic's staff | 22 |
| A failed Rot check | the survivor turns and is removed, **and bites** a survivor assigned to healing this turn for 1 Damage | 22 |
| Feed | T1–2 eat 1, T3–4 eat 2; Hunger = required − available; **not cumulative** | 22 |
| Hunger penalty | a shortfall drops stats — and therefore every Skill Score — until the next Management Phase | 22 |
| Assign Beds | Exhaustion = population − beds, if positive; not cumulative | 23 |
| Exhaustion penalty | if Exhaustion exceeds the mission team's size, one survivor comes off the team | 23 |
| Unrest | Hunger + Exhaustion | 23 |
| Check Storage | material counts above the cap are lost down to it | 23 |
| Siege Threat | staffed facilities + project team size + base modifiers + turns since the last siege, **all raw counts** | 23 |
| Siege trigger | d10 + Siege Threat ≥ 16 → next mission must be Siege Defense | 23 |
| Departures | Unrest + Siege Threat ≥ 10 → the lowest-Tier survivor leaves; a tie is the player's choice, and a survivor at 0 Health cannot be chosen | 23 |
| A departure's wake | their facility counts as **never having been staffed**; their Tier comes off the turn's unused Labor, and a project goes unfinished if that runs it negative | 23 |

**Four things that look like one rule and are not:**

1. **Hunger is not the hunger penalty.** Hunger is a number that feeds Unrest. The penalty is a
   separate consequence of a shortfall that reaches every stat in the community and every score
   derived from one. A single function returning "Hunger" and calling it done gets Unrest right
   and every Skill Score wrong.
2. **Rest and healing are one Planning step and two different rules.** Rest generates a Health
   point locked to the survivor who rested. Facility Health is a pool distributed equally among
   the survivors being healed. They arrive at the same survivors from opposite directions and
   only one of them is an allocation problem.
3. **"Not cumulative" is load-bearing on both Hunger and Exhaustion.** Each is recomputed from
   scratch every Management Phase and never added to a running total — which is another way of
   saying neither may be stored, and the phrase is in the book twice because it is easy to get
   wrong once.
4. **The two Teaching caps are two rules that both happen to be 2.** One caps what a staffed
   Training Room may give a single survivor (pg. 70) and applies to survivors who were *not* on
   the mission; the other caps what a Teacher on the mission may hand out (pg. 12) and *replaces*
   the discretionary post-mission point rather than adding to it. A community can hit both in one
   turn. Collapsing them into one constant would make a later change to either silently change
   the other — the same reasoning that keeps the Tier table's five coinciding columns apart.

## The data this phase cannot invent

**Z3-1 requires the rulebook open at pg. 17–23**, plus pg. 12 for the Teaching cap and the result
substitution, and pg. 19 for the healing distribution. The same situation as
[Z2-1](phase-2-stories.md#z2-1--base-and-facility-rules-as-data), smaller but no less blocking:
the step lists, the eat rates, the check targets and the two thresholds are specific numbers that
cannot be derived, inferred or reconstructed from anything already in the repo.

Some of them are already quoted in the project note from the edition re-basing, and **that is not
the same as having them.** A quoted threshold is a number someone wrote down once; the phrasing
of the hunger penalty in particular does not survive a careful reading and has to be checked
against the printed text before anything is built on it. Every number in Z3-1 gets confirmed
against the page as it is used, exactly as Phase 2's citations were.

**Z3-1 is the long pole and cannot be parallelised**, since the walk in Z3-3 reads its step list
and every Management step reads its constants.

**Transcribed 2026-09-08.** Every row of the table above is now confirmed against the printed
text, and the suspicion was worth having: the material roll is once *per material recovered*
rather than a flat roll, the Teaching cap turned out to be two separate caps, and the hunger
penalty is worse than garbled — see [the rulings below](#rulings-the-book-leaves-open). The
Planning step-order conflict is real and resolved in favour of pp. 20–21, which is what
`rulebook-edition.md` predicted and what `rules.test.ts` now asserts so a later reader checking
against the pg. 17 summary cannot quietly undo it.

## Decisions recorded, rather than left to the implementation

**Mission outcomes are entered by hand.** The Mission Phase is Phase 4. Phase 3 records what came
back from a mission — materials, casualties, XP, strangers — as typed-in values, which keeps
every rule *downstream* of a mission real while leaving the mission itself to the phase that
knows. Third phase running with a hand-entered stand-in, and the pattern is deliberate: the rule
is enforced from the day the phase ships, only the source of the number is late.

**The player rolls; the app takes the number.** Rot checks, the Horde check and the material roll
all call for a d10, and the engine is pure — a random number generator in it would be the same
impurity `createNewCampaign` refuses for UUIDs and clocks. Phase 1 set the precedent when the
field-recruit skill roll arrived as `D10Result` on the action. It is also what happens at a
table: people came to roll dice, and an app that rolls them instead is taking away the good part.

**The log is structured entries, in-app, and shaped so that exporting it is a read.** This closes
the open question in the project note. A log entry holds its turn, its phase, when it happened
and *what* happened as typed fields — never a rendered sentence. Rendering is a UI concern
alongside `baseLabels.ts`, which is what makes the markdown export in Phase 8 a second reader
rather than a second format to keep in sync. Append-only, with no action that removes an entry:
undo, when it comes, appends the undoing.

**Assignments are stored, and cleared at the top of each Planning Phase.** Who staffs the Clinic
this turn is a decision, and decisions persist. It is also *this turn's* decision, so Planning
Step 1 clears last turn's — along with the utility assignments Phase 2 deliberately left standing
with a note pointing here.

**One assignment field serves three readers, and the turn order is why.** The book has Heal
Wounds and Add Facilities reading assignments made in the *previous* Planning Phase, and Check
for Rot reading assignments made in *this* one — which reads like the app needs to keep a history.
It does not. The Advancement Phase of turn N+1 runs *before* the Planning Phase of turn N+1, and
the Management Phase runs *after* it, so clearing at the top of Planning means a single current
`assignments` field is already the right answer at all three moments. Worth writing down, because
"store last turn's assignments too" is a plausible-looking wrong turn that costs a schema field.

**One task per survivor is structural, not validated.** The rule (pg. 20) is that each survivor
is assigned to exactly one task. Modelled as a map from survivor id to one assignment, a second
assignment is unrepresentable rather than merely invalid — the same move that put upgrades inside
their facility rather than in a flat list, and it deletes a whole class of check.

**Mission assignments carry a team id from the day they land.** The published edition makes
multiple mission teams per turn explicit (pg. 25), and the project note already resolved to model
N teams from the start. Phase 3 ships one team; the field that makes a second one possible costs
nothing today and is a migration later.

**The hunger penalty is applied at the point of read and never written.** It changes every stat
in the community for the rest of the turn, which means every Skill Score, which means production,
Labor, the Rot check target and the mission-team preview. Writing it onto survivors would be
storing a derived value with an expiry date, and the expiry is the part that gets missed. It
comes out of campaign state at the point a score is computed, so it is impossible to forget to
remove.

**The walk guides; it does not refuse.** Phases run in a strict order and the app shows where you
are, but a table sometimes does things out of order and then corrects itself, and the app must
not be the reason a game stops. Stepping past an unfinished step is a warning in the
[`Check`](../src/engine/checks.ts) shape Phase 2 established, behind the same never-stored
override. Advancing out of the Management Phase — the transition that ends a turn — is the one
that asks first, because it is the only one that is awkward to walk back.

**Consequences that remove a survivor are named and confirmed, never silent.** Rot and Departures
both take someone out of the community. The app works out who, says why, cites the page, and
applies it on a click. Where the rule leaves a tie — two survivors of the lowest Tier — the
player picks, because the book gives them that choice and inventing a tiebreak would be this app
making up a rule.

**Two schema bumps, not one.** The log lands in v6 and assignments in v7. Batching them would
mean one migration step doing two unrelated things, and the migration chain is the mechanism that
keeps an in-progress campaign openable — it is worth more as a record of what changed and when
than as a short file.

## Rulings the book leaves open

Five places where the printed text does not decide the answer. Each needs a table ruling before
the story that depends on it, and each is recorded here rather than settled quietly in code — a
house rule that lives in a function is indistinguishable from a rule.

1. **The hunger penalty (pg. 22, Z3-9) — the one that matters.** The book says to subtract Hunger
   from the community's population and, if the result is negative, reduce every survivor's stats
   by that number. Two problems. `population − Hunger` is almost never negative: Hunger is capped
   at the Food required, which is at most twice the population, so the penalty fires only when a
   mostly Tier 3–4 community has nearly empty stores. A community six Food short of twelve takes
   no stat penalty at all under a literal reading. And "reduced by that number" where the number
   is negative is self-contradictory; the intent is presumably its absolute value. The literal
   reading is at least coherent — a starvation threshold rather than a hunger tax — and Hunger is
   never consequence-free either way, because Unrest counts it. **Needs a ruling.**
2. **Whether the Rot check target has a floor (pg. 22, Z3-9).** None is stated, so a Clinic with
   enough Medicine drives it to 2 or below. Left unclamped in the data on the grounds that the
   natural-1 rule (pg. 8) already stops it becoming a certainty, and that clamping would be
   inventing a rule. Flagged rather than assumed.
3. **Who counts as "at the base" at Departures (pg. 23, Z3-10).** The rule names the lowest-Tier
   survivor *at the base*, which reads as excluding a mission team — except the Planning Phase
   assigns next turn's team, so at the Management Phase nobody has left yet. Reading it as the
   whole community is the only one that does not depend on a journey that has not happened.
4. **How broadly the Utilities substitution applies (pg. 12, Z3-7).** Rationing is locked to Food
   and Mechanics to Hardware, but Utilities is written as "a given material" and appears to allow
   any — including, perhaps, forcing a 10 and a Rare Item Table roll. The asymmetry may be
   deliberate or may be loose phrasing.
5. **Whether "wounded" and "injured" are the same state (pg. 20–21, Z3-6).** A *wounded* survivor
   may staff a facility or join a project team, forfeiting healing; an *injured* one may not join
   a mission team. If they are one state the rules are consistent and restrictive; if they are
   two the book never defines the second.

---

## Z3-1 — The campaign turn as rules data

**Why:** The step lists and the thresholds every other story in the phase reads. **Needs the
rulebook open at pg. 17–23**, plus pg. 12 and 19 — see
[the note above](#the-data-this-phase-cannot-invent).

**Scope**
- `src/data/turn.ts`: the four phases with their numbered steps in order, each step carrying its
  page. The phase list already exists as `CAMPAIGN_PHASES` in `src/engine/campaign.ts`; the steps
  hang off it rather than duplicating it.
- The constants, each named: Food eaten per Tier, the Rot check target and what reduces it, the
  Siege Threat terms and their weights, the siege trigger threshold, the departure threshold, the
  Teaching XP cap, and the d10 ranges of the material roll.
- No prose. A step is an id, a label short enough for a tab, and a page.

**Acceptance**
- Every threshold in the phase is a named export here.
- Every step is cited, and every citation lands inside pg. 17–23.
- Step ids are unique across the whole turn.
- The Planning Phase's step order is asserted, so the pg. 17 summary cannot quietly win later.
- A header comment naming the edition and the transcription date, matching `bases.ts`.

**Out of scope:** mission metadata (Phase 4) and the equipment tables (Phase 5), both of which
have steps that mention them.

**Two things this story turned out to include.** The campaign phases moved down out of
`src/engine/campaign.ts`, because the steps hang off them and a rules file may not import from
the engine — the trip `materials.ts` and `origins.ts` made in Phase 2, and now enforced by
`eslint.config.js` rather than remembered. And the d10 moved out of `recruitTable.ts` into a
`dice.ts` of its own, because the material roll is its second caller and a d10 was never a
recruit-table concept.

---

## Z3-2 — The campaign log, and schema v6

**Why:** The placeholder that has been `readonly never[]` since Phase 0, and the first story of
the phase that ships something visible. It goes first because the log wants writers from day one,
and the app already does half a dozen things worth recording.

**Scope**
- `LogEntry`: turn, phase, an ISO timestamp taken from the action, and a discriminated `kind`
  with structured fields. **Never a rendered sentence** — see the decision above.
- `Campaign.log` widens from `readonly never[]` to `readonly LogEntry[]`; `CURRENT_SCHEMA_VERSION`
  → 6 with a migration step and a `campaign-v6.json` fixture. The migration is a no-op on data:
  an empty list is already an empty list.
- The store appends on the actions that exist today — base claimed, facility built, upgrade
  built, slot cleared, survivor added, recruited and removed, tier and skill levels bought.
- A log screen: newest first, grouped by turn, with an entry's page citation where it has one.
- Rendering lives in a `logLabels.ts` next to `baseLabels.ts`.

**Acceptance**
- The v5 fixture migrates forward; the v6 fixture round-trips unchanged; the version-bump guard
  still fires when the version moves without a step and a fixture.
- A test walks the `CampaignAction` union and requires every member to be either logged or listed
  as deliberately silent, so a new action cannot quietly skip the log.
- No action removes or edits an entry, and a test asserts the log only ever grows.
- The property-based round-trip covers a campaign with a populated log.

**Out of scope:** markdown export (Phase 8) and undo (Phase 8). Both read this shape; neither
changes it.

**Three things this story turned out to include.** An action carrying `at` is exactly an action
that gets logged — the log is the only thing in the store that needs a clock, the reducer cannot
read one and stay pure, so the two facts are the same fact and the action union says so. The
property suite rejected the first attempt at exporting an event: written through untouched, an
event read back from a file re-serialises in *that file's* key order, so the exporter sorts its
fields instead. And `in` turned out to be the wrong way to look up a catalogue entry anywhere in
`saveFile.ts` — it walks the prototype chain, so a save naming a facility `toString` passed
validation and handed the next screen a function.

---

## Z3-3 — The turn counter and the phase walk

**Why:** The smallest thing in the phase that is immediately useful, and the story that unblocks a
rule Phase 2 shipped without a way to satisfy: an upgrade may not be built the same turn as its
facility, and until now there was no next turn to build it on.

**Scope**
- Advance through the steps of a phase, from phase to phase in the strict order of Z3-1's data,
  and out of the Management Phase into the next turn.
- Where you are, in the header, on every screen.
- Backwards within a turn, because tables correct themselves. Ending a turn confirms first.
- Skipping ahead past an unfinished step is a warning, not a blocker, in the `Check` shape.
- Every transition logs.
- A `docs/turn-walk-interaction.md` sketch, written **with this story rather than after it**:
  four phase screens hang inside this walk, and Phase 2's shared slot-card design worked because
  it was drawn before the four screens that used it, not after.

**Acceptance**
- A facility built in turn 1 is refused an upgrade in turn 1 and accepts one in turn 2, driven
  end-to-end through the walk. This is the story's proof and belongs in the e2e suite.
- The turn counter survives an export and an import.
- Phases cannot be reached out of order by dispatching directly; the reducer holds the order, not
  the screen.

**What this story turned out to change.** `Campaign.phase` is gone, replaced by `Campaign.step` in
schema v7, with the phase derived from it. Storing both would be a redundant pair that can
disagree — but the reason for storing the *finer* of the two is not tidiness: three Management
steps are destructive (Rot removes survivors, Feed subtracts Food, Check Storage destroys the
surplus), and a campaign resuming at "somewhere in the Management Phase" after a closed tab could
not know which had already run. That makes v6 → v7 the first migration in the chain that can put a
campaign in the *wrong* place rather than an incomplete one, and it maps each phase to the step
that phase opens on: repeating work a player can see they have done beats silently skipping work
they have not.

Two actions went with it. `campaign/phaseSet` took any phase and `campaign/turnAdvanced` took
none; both are replaced by a `turn/advanced` that carries no destination at all, so a screen can
offer the wrong button but cannot invent a turn that runs Management before Planning.

---

## Z3-4 — Assignments, and schema v8

**Why:** The primitive fact the whole Planning Phase is about, and the one Phase 2 refused to
store early. Everything computed in Z3-5 reads it.

**Scope**
- An `Assignment` discriminated union: facility staff (with the slot), project team, rest,
  healing, mission team (with a team id — see the decision above), or **scavenging**. The last is
  the opt-out case (pg. 17): skipping the mission sends one survivor to scavenge, and the book
  requires that they have no other assignment — which makes it an assignment like the rest,
  rather than a flag somewhere else that the one-task rule would then have to be told about.
- Rest and healing are one Planning step and two members of the union, because they are two rules:
  rest generates a Health point locked to the survivor who rested, and healing draws on a shared
  pool. Only one survivor may rest per turn (pg. 21).
- Stored as a partial map from survivor id to one assignment. Absent means unassigned, which is a
  real state and the commonest one at the start of a Planning Phase.
- `CURRENT_SCHEMA_VERSION` → **8**, with a migration step, a `campaign-v8.json` fixture, and a
  `Base`-style arbitrary in `src/test/arbitraries.ts` typed as producing an `Assignment`. (The
  plan said 7; [Z3-3](#z3-3--the-turn-counter-and-the-phase-walk) took that number when it
  replaced `Campaign.phase` with `Campaign.step`.)
- Save-file validation: an assignment naming a survivor who is gone, or a slot with no facility
  in it, is a damaged save and reports a readable error rather than crashing a screen.

**Acceptance**
- Assigning a survivor who already has a task replaces the assignment; a test asserts there is no
  shape in which one survivor holds two.
- The v7 fixture migrates forward and the v8 fixture round-trips.
- Removing a survivor removes their assignment, and a test covers it — a dangling assignment is
  exactly the kind of orphan that survives a save and breaks a screen three turns later.

**Out of scope:** what an assignment *does*. That is Z3-5.

**Where the shape-versus-legality line fell.** `saveFile.ts` refuses an assignment that refers to
nothing — a task this version has never heard of, a Staff assignment that does not say where, a
task keyed to somebody the roster does not hold. It accepts an assignment that is merely
*illegal*: staffing a slot with no facility in it, resting at full Health, a mission team with an
injured survivor on it. Those are rules (pg. 20–21), Z3-6 reports them, and a player may be
part-way through fixing one when they save — the same reasoning that keeps an overridden survivor
build openable.

**Two ordering functions became one.** The exporter needed to write an assignment tag-first with
its remaining fields sorted, which is exactly what Z3-2 had already written for log events. They
are now one `taggedFirst` helper over both unions rather than two functions that happen to agree.

---

## Z3-5 — What assignments make computable

**Why:** The story that kills Phase 2's hand-entered stand-ins. Three fields typed in above the
slot map become three derived numbers, and the base sheet stops asking the player for things the
app now knows.

**Scope**
- The Labor pool: Σ Tier levels of the project team (pg. 20). Unspent Labor is lost, and the
  screen **shows what is about to be lost** while there is still time to spend it — the rule is a
  decision point at the table, and hiding it makes the tracker arithmetically right and
  strategically useless.
- The Utilities Score: the Utility Station's staff, split across Power and Water in any mix the
  player chooses. This is the other half of the pool Z2-8 called `flatUtilitiesGenerated`, and
  the function that has been waiting for it.
- Staffed production reads the real assignment instead of taking a previewed survivor as an
  argument. Z2-9's preview control comes out.
- The staffed-facility count, which Siege Threat needs in Z3-10.
- The hand-entered Labor and Utilities Score inputs are **removed**, not left as overrides.

**Acceptance**
- Assigning a survivor to the project team moves the Labor pool by their Tier, and the base
  sheet's build costs check against it without anyone typing a number.
- A Utility Station with nobody on it generates its flat output and nothing more; staffing it
  raises the pool by exactly the staff's Utilities Score.
- The facilities whose upgrades sum their staff's scores — the Med Lab, the Watch Post, the Study
  Room — sum the assigned survivors rather than the first one.
- No screen in the app has a Labor or Utilities Score input any more.

**What this story did not do, and why it says so here.** `laborPool` is what the project team
*generates*. It is not reduced by what has already been built this turn — and Phase 2's
hand-entered number was not either, so this story changed where the number comes from without
changing what is tracked.

Spending it down needs something the app does not have. Facilities record the turn they went up;
upgrades and cleared slots record nothing, so "what has this turn's Labor already paid for" is not
recoverable. The book has the real shape and it is not a running total: projects are **ordered**
during the Planning Phase and **complete in the next Advancement Phase** (pg. 20, 19), which is a
queue. That belongs to [Z3-11](#z3-11--the-project-queue) — written when Z3-7 reached the step
projects complete in and found the queue too large to fold into a phase screen. Adding a turn
stamp to every upgrade here only to replace it there would have been churn either way.

**Assignment had to become possible somewhere.** Removing the two inputs without a way to make the
derived numbers non-zero would have left a base screen whose Build button could never be pressed —
the exact "nothing is usable until everything works" failure the plan is shaped against. So the
slot card's staff *preview* became a real assignment, and the project team got a control where its
Labor number is read. [Z3-6](#z3-6--the-planning-phase) is not made redundant by that: it puts all
six tasks in the book's step order, counts the unassigned, and owns the per-turn reset.

---

## Z3-6 — The Planning Phase

**Why:** The first of the four phase screens, and the one that makes every other number in the
app move. It is also where the utilities lifecycle Phase 2 left half-built finally closes.

**Scope**
- The screen: every survivor, one task each, in the book's step order — Facility Staff → Project
  Team → Rest and Healing → Mission Team (pg. 20–21).
- The unassigned are visible and counted, because leaving somebody idle by accident is the
  commonest mistake this screen exists to prevent.
- Utilities are generated and assigned **at the end of Step 1** (pg. 20, 67), and entering the
  Planning Phase clears last turn's utility assignments along with last turn's tasks.
- The Labor pool appears as the project team fills, from Z3-5.
- Staffing a facility whose utility requirement is unmet is a warning, not a blocker — the
  facility produces nothing, which is a rule the player may be about to fix.
- Eligibility, from pp. 20–21: only survivors below maximum Health may rest or be healed; healing
  at all requires a Medical Clinic; **only one survivor may rest per turn**; a wounded survivor
  may staff a facility or join a project team but forfeits healing that turn; an injured survivor
  may not join a mission team. Whether "wounded" and "injured" are one state is
  [ruling 5](#rulings-the-book-leaves-open).

**Acceptance**
- Entering the Planning Phase twice in a row clears assignments both times, and a test asserts
  the utility assignments clear with them.
- Assigning a survivor to a second task moves them rather than duplicating them, visibly.
- A survivor assigned to a slot that later loses its facility does not take the screen down.

**The reset runs once a turn, not once an entry — a deliberate departure from the acceptance
above.** "Entering the Planning Phase twice in a row clears assignments both times" is the wrong
rule for a walk that goes backwards. Stepping back from Assign Facility Staff to the Advancement
Phase and forward again would have wiped a phase of planning the player had just done, and a
control whose undo is destructive is worse than no undo. So the clear happens on the **first**
arrival at Planning Step 1 in a given turn, and the turn after that clears again.

That is derived, not stored: the reset writes a `planning-began` event, and `planningHasBegun`
asks the log whether this turn already has one. A `resetRunThisTurn` flag on the campaign would
have been a second copy of something the log already knows — and would have had to migrate, and
would have gone stale the first time somebody edited a save by hand.

**Every violation on this screen is a warning.** There are eight codes and no blockers: an unmet
utility, resting at full Health, a second survivor resting, healing with no Medical Clinic, an
injured survivor on the mission team, a second scavenger, scavenging without skipping the
mission, and a task keyed to an empty slot. A row that breaks a rule says so and stays tickable.
The reason is Z1-7's: the app reports the rules, the table decides them, and half the "violations"
here are states a player is one tick away from fixing — the tick they are refused is the one that
fixes it.

**The base screen lost its project-team control and kept its staffing ones.** Z3-5 put a project
team control on the base screen because nothing else could make the Labor number move; this story
gave it the step the book puts it in, and two controls for one decision on one page is worse than
a walk to the right one. The slot cards keep theirs, because a slot card answers "what does this
facility make" and it makes nothing with nobody in it — the assignment and its consequence belong
together. The project team has no consequence to sit beside.

**What the mutation run found, and the simplification it was pointing at.** The new module came
back at 90.60 — the weakest in the repo, again, and for two different reasons. Nine mutants had no
coverage at all: `staffableSlots` and `staffedSlots` were written for this screen and then not
used by it, because the step reads `occupants` directly. Dead code, deleted.

The five survivors were more interesting. Two were unreachable `?? 'somebody'` fallbacks behind a
`length > 0` check — destructuring the first element instead removes the fallback rather than
testing it. One was the `break` under `case 'project'`, which no test could tell from its own
absence. That one was the real finding: the switch pushed into a shared array and broke, so the
task with no rules had nothing to say. It now returns instead, so the empty case reads `return []`
— a claim a test can hold the code to — and the five other cases became five small functions. The
typechecker enforces exhaustiveness for free: a switch of returns in a function that promises an
array is only well-typed if every task is answered, which was verified by deleting a case and
watching `tsc` refuse it.

The last two were weak fixtures rather than weak code: nothing tested healing with no base at all
(so the null guard in `hasMedicalClinic` was never the thing that mattered), and every "somebody
else is already resting" fixture had that somebody resting — so a check that asked "is anybody else
assigned to *anything*" agreed with the real one. Both now have a test.

**The end-to-end journeys had to learn the walk.** Every e2e test that builds anything now hires a
team by walking to Planning Step 2, which is what a player does. That is the clearest evidence the
control moved somewhere real rather than somewhere else on the same page.

---

## Z3-7 — The Advancement Phase

**Why:** Five steps, three of which are already built and in the wrong place: Phase 1's XP
spending and Phase 2's facility building both happen here in the book, and this is where they
acquire a step to happen in.

**Scope**
- The steps in order (pg. 18–19): advancement, strangers, materials, heal wounds (Z3-8), then
  facilities, upgrades and arriving trades.
- Materials: one d10 **per material recovered on the mission**, entered as rolled — no materials
  recovered means no roll at all — plus the Rationing / Mechanics / Utilities substitution that
  **changes a roll's result** rather than adding to it, with uses equal to that skill's summed
  score across the mission (pg. 12), plus facility production from Z3-5 added as a proposed
  amount the player accepts. How broadly Utilities may substitute is
  [ruling 4](#rulings-the-book-leaves-open).
- XP, in the book's order (pg. 18): 1 to every survivor who was on the mission, then one further
  discretionary point, then a Training Room's output, then spending. A Teacher on the mission
  **replaces** the discretionary point rather than adding to it, and the two 2-XP caps are two
  rules — see the note above the story list.
- Building a facility outside this step is a warning, not a refusal — Phase 2 lets you build any
  time, and the fix is to say which step it belongs to, not to take the ability away.
- Rescued strangers are a doorway: the step exists, and creating them is Phase 4.

**Acceptance**
- The substitution replaces a roll's result and does not add a material; a test covers the
  difference, because adding is the obvious wrong implementation.
- Production computed from the current assignments lands in materials on acceptance, and the
  amount matches what the base sheet showed.
- Storage caps are reported here and not enforced — Check Storage is a Management step, and
  enforcing it early would lose materials a turn before the rules say to.

**XP became four pools rather than one number.** The book awards it from four sources with four
different rules, and collapsing them loses every one: one XP to each survivor who went (pg. 18),
one discretionary point to anybody (pg. 18), a Teacher on the mission handing out 1 each to as
many survivors as the team's summed Teaching Score (pg. 12), and a staffed Training Room teaching
the survivors who *stayed behind* (pg. 70). Two of those cap at 2 per survivor and the caps are
two different rules. So `XP_SOURCES` is data, `xpPools` sizes each one for the campaign in front
of it, and a pool with nothing in it still appears — saying *why* it is empty, because "no Teacher
went out" and "everyone is on the mission team" are different turns.

The replacement is modelled as a replacement: the discretionary pool is one XP **only** while
nobody who went out can teach, and zero the moment somebody can. Two pools where one is always
empty is what stops "replaces" turning into "adds" the first time somebody edits this.

**Everything in this module is a blocker, and nothing in the Planning Phase was.** That is not an
inconsistency: a pool with nothing left in it is the app having nothing to give, and overriding it
would invent XP. Same reasoning that has always made affordability a blocker. A rule a table might
play differently is a warning; arithmetic is not.

**How much has been handed out is read off the log**, the third time this phase has reached for
that shape after `planningHasBegun` and now `materialsAdded`. The per-survivor caps are only
answerable by a record: "how much has Earl already taken from a Teacher this turn" is not
derivable from the survivor, who holds one XP number with no source on it.

**Restricted XP is left out rather than laundered.** A Training Room's upgrades produce XP
spendable only on skills governed by one stat (pg. 73), and `Survivor.xp` is a single number with
no stat attached. Counting those lines into the pool would silently make them unrestricted, which
is more generous than the book; they are excluded, and adding them needs a field, a migration and
a story.

**Building outside its step says so and builds anyway.** One sentence on the slot action, shared
by all three verbs, naming the step the turn should be at. A note rather than a fourth member of
three separate closed violation unions — it is the same sentence for building, upgrading and
clearing, and it is about the turn rather than about the slot.

**What the mutation run found.** `experience.ts` came back at 89.22, the weakest module in the
repo — the third story running where the new module was, and the third time the survivors were
pointing at the code rather than at the tests.

Three of the eleven were a `capPerSurvivor` typed as `number | null` for a source with no cap.
There is no such source; all four have one, and the `!== null` guard the nullability required was
a branch with nothing behind it. Seven more were ternaries on the source inside a message and a
page — `source === 'training-room' ? 70 : 12` is a four-entry lookup written as a two-way branch,
and nothing could distinguish it from its opposite until every source had been asserted
separately. Both are now records over `XpSource`: `XP_SOURCE_PAGES` in the data (which
`logLabels.ts` had been keeping a second copy of, now deleted) and `WHO_MAY_DRAW` in the engine.
A record has the property the branch did not — the typechecker keeps it exhaustive.

The last one stays alive and is equivalent: `team.length * MISSION_XP` cannot be told from
`team.length / MISSION_XP` while `MISSION_XP` is 1. That is an equivalence created by the
constant's value, not a gap, and an edition that made the award 2 would break the tie the same
day.

Elsewhere: the storage-cap comparison had no test landing *exactly* on the cap, and the three
refusals in the store — a second helping of materials, an award the rules block, an award to
somebody who is not in the community — were branches no happy-path test could reach. All four now
have one.

The last of those turned out not to want a test at all. `withXpAwarded` took the whole campaign
and an id, so the reducer had to look the survivor up and guard against not finding one — a guard
nothing could reach, because `checkXpAward` refuses anybody who is not in the community before it
is asked. It takes a survivor and returns one now, like the three purchases in `advancement.ts`,
which is the shape the store's own `editSurvivorLogged` already drives. The case that was fifteen
lines of its own is the same six the purchases are.

**The project queue is still owed, and is now its own story.** The Z3-5 note put it here on the
grounds that Z3-7 owns the step projects complete in. Writing this story made the size of it
clear: the queue changes what *building* means — ordering in Planning, completing in the next
Advancement Phase (pp. 20, 19) — which is a new field on the campaign, a migration, and a rewrite
of all three Phase 2 verbs and their dialogs. Folding that into the phase screen would have made
one unreviewable change out of two coherent ones. The step exists and says what it is for; the
queue is [Z3-11](#z3-11--the-project-queue).

---

## Z3-8 — Heal Wounds, and the equal-distribution rule

**Why:** The one genuine allocation algorithm in the Community Layer, new to this edition, and
the story most likely to be quietly wrong in a way that only shows up in a corner case.

**Scope**
- Facility Health points distributed **equally** among the survivors assigned to healing: nobody
  takes a second point until everyone has one (pg. 19).
- Max HP is the survivor's Tier, so a survivor who reaches full drops out of the distribution and
  the remainder goes to the others. That is what makes this an algorithm rather than a division.
- Rest generates 1 Health point usable only by the resting survivor (pg. 19–20), which is a
  different rule arriving at the same survivors.
- Property-based tests, following the advancement suite: total distributed never exceeds the
  pool; no survivor exceeds max HP; between any two healing survivors who are not capped, the
  allocations differ by at most one.

**Acceptance**
- The three properties above hold across generated communities and pool sizes.
- A pool larger than the community can absorb leaves the surplus unspent rather than overhealing.
- Spending a Health point on Infection instead is **not** here — it is Phase 7, and the function
  is shaped so it can be.

---

## Z3-9 — Management Phase, steps 1–3: Check for Rot, Feed, Assign Beds

**Why:** The first three consequences, and the phase's — arguably the app's — hardest single
requirement: a shortfall of Food changes every Skill Score in the community for the rest of the
turn.

**Scope**
- **Check for Rot** (pg. 22): per 0-HP survivor, a Tier check against 12 − the combined Medicine
  of the Medical Clinic's staff. The app names the target and the roller; the player rolls; the
  outcome is applied on confirmation, never silently. A failure is **two** removals in the worst
  case: the survivor turns and is removed, *and* bites a survivor assigned to healing this turn
  for 1 Damage, who is removed in turn if that takes them to 0. Whether the target has a floor is
  [ruling 2](#rulings-the-book-leaves-open).
- **Feed** (pg. 22): Food required from Tiers (T1–2 eat 1, T3–4 eat 2) against Food available;
  Hunger is the shortfall, recomputed from scratch and never accumulated.
- **The hunger penalty**: a shortfall drops stats, and therefore every Skill Score, until the
  next Management Phase. `skillScore` grows a campaign-state parameter; nothing is written to any
  survivor. This is the change the whole architecture was built to absorb, and it should cost one
  function and its call sites. **When the penalty fires, and by how much, is
  [ruling 1](#rulings-the-book-leaves-open)** — the printed sentence is self-contradictory, and
  this story cannot start without an answer.
- **Assign Beds** (pg. 23): Exhaustion = population − beds where positive, from Z2-3's bed count,
  also never accumulated.

**Acceptance**
- One Food short lowers the Skill Scores shown on the roster, the production on the base sheet,
  and the Rot check target, from a single change and with no survivor record touched.
- A test asserts no survivor's stored stats differ before and after a hungry Management Phase.
- Hunger and Exhaustion both return to zero the moment the shortfall is fixed, with no residue.

---

## Z3-10 — Management Phase, steps 4–7: Unrest, Storage, the Horde, Departures

**Why:** The end of the cascade, and the four steps that decide whether the community keeps its
materials, its next mission and its people. Nothing in the app has consequences like these.

**Scope**
- **Calculate Unrest** (pg. 23): Hunger + Exhaustion.
- **Check Storage** (pg. 23): material counts above the cap are lost down to it. Phase 2 computed
  the caps and deliberately refused nothing; this is the step that was waiting.
- **Check the Horde** (pg. 23): **total Siege Threat**, at last — the base's own flat
  contribution from Z2-3 plus staffed facilities, the project team's size, and turns since the
  last siege. `lastSiegeTurn` becomes a stored primitive fact; "turns since" is derived from it.
  The player rolls a d10; ≥ 16 with Siege Threat locks the next turn's mission to Siege Defense.
- **Departures** (pg. 23): Unrest + Siege Threat ≥ 10 and the lowest-Tier survivor leaves; a tie
  is the player's choice, and a survivor at 0 Health can neither leave nor be chosen. Named and
  confirmed, never silent. Who counts as being at the base is
  [ruling 3](#rulings-the-book-leaves-open).
- The exhaustion penalty: Exhaustion above the mission team's size takes one survivor off it.
- The base sheet stops saying "from the base itself" and shows the total.

**An ordering trap worth naming before it is discovered.** A departure makes the facility they
staffed count as **having never been staffed** — retroactively, not merely unstaffed from now on —
and takes their Tier off the turn's unused Labor, running a project unfinished if that goes
negative. So step 7 changes the answer step 6 already computed from the staffed-facility count.
Nothing here may cache a Siege Threat; the step order in the data is the order the *steps* run,
not permission for a value computed in one to survive the next.

**Acceptance**
- A single Food removed from a community on the edge changes Hunger, then Unrest, then whether
  anyone leaves — and one test walks that entire chain from that one number, because the cascade
  is the thing most worth a regression test in the whole repo.
- The siege flag survives a save and gates the next turn's Mission Phase.
- Storage loss takes each material to its own cap and no further, and logs what was lost.

---

## Z3-11 — The project queue

**Why:** The largest thing Phase 3 still owes the rules, and the one the plan never scoped.
Projects are **ordered during the Planning Phase and completed in the next Advancement Phase**
(pp. 20, 19). Phase 2 shipped building as something that happens the instant you press the button,
because no phase existed to order it in, and Z3-7 found that the fix is a story rather than a
paragraph: it changes what building *is*.

Written down when [Z3-7](#z3-7--the-advancement-phase) reached the step projects complete in and
found nothing to complete. Sequenced after Z3-10 rather than before it because nothing in the
Management Phase depends on it and everything in it depends on the Planning and Advancement
screens being finished.

**Scope**
- A queue on the campaign: an ordered list of projects — a facility, an upgrade, a cleared slot —
  each with the turn it was ordered on. A schema bump and a migration that turns every existing
  campaign's built facilities into an empty queue, because what is built is already built.
- Ordering a project spends its Labor and Hardware **in the Planning Phase**; completing it in the
  next Advancement Phase is what puts the facility on the base.
- The three Phase 2 verbs become one verb — order a project — and the slot card shows what is
  queued for that slot alongside what is in it.
- Unspent Labor is still lost at the end of the turn (pg. 20), which is the rule that makes the
  queue a decision rather than a formality.
- `builtOnTurn` keeps its meaning and stops being the only record of when anything happened.

**Acceptance**
- A project ordered in turn N appears on the base in turn N+1 and not before, and a test walks the
  two turns.
- A campaign saved before this story reopens with everything it had built still built.
- Ordering more than the Labor pool covers is refused, and what is left is visible while there is
  still time to spend it.

**Open question for the table:** whether a project ordered and then cancelled in the same Planning
Phase returns its Labor. The book does not say, and both readings are defensible.

---

## Phase 3 is done when

A campaign can be played turn after turn without paper: the four phases walked in order behind a
turn counter, every survivor assigned to exactly one task, materials rolled in and Health
distributed by the rules, all seven Management steps computed through the cascade, and the whole
thing recorded in a log — with the mission played on the table and its outcome typed in. Round-
tripped through a save file, with CI green including the end-to-end walk, the mutation score
holding, and no rule prose in the repo.
