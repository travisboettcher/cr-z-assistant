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
| Material roll | d10 per material: 1–3 Fuel, 4–6 Food, 7–9 Hardware, 10 Rare | 18 |
| Result substitution | Rationing / Mechanics / Utilities **change a roll's result**, count = summed score | 12 |
| Teaching | Σ Teaching scores on the mission, **max 2 XP per survivor** | 12 |
| Planning Phase | one task per survivor: facility staff → project team → rest and healing → mission team | 20–21 |
| Utilities lifecycle | generated and assigned at the **end of Planning Step 1**, last until the next Planning Phase | 20, 67 |
| Labor pool | Σ Tier levels of the project team; unspent Labor is lost | 20 |
| Rest | 1 HP, usable **only by the resting survivor** | 19–20 |
| Management Phase | seven steps: Check for Rot, Feed, Assign Beds, Calculate Unrest, Check Storage, Check the Horde, Departures | 22–23 |
| Check for Rot | per 0-HP survivor, a Tier check against 12 − combined Medicine of the Medical Clinic's staff | 22 |
| Feed | T1–2 eat 1, T3–4 eat 2; Hunger = required − available; **not cumulative** | 22 |
| Hunger penalty | a shortfall drops stats — and therefore every Skill Score — until the next Management Phase | 22 |
| Assign Beds | Exhaustion = population − beds, if positive; not cumulative | 23 |
| Exhaustion penalty | if Exhaustion exceeds the mission team's size, one survivor comes off the team | 23 |
| Unrest | Hunger + Exhaustion | 23 |
| Check Storage | material counts above the cap are lost down to it | 23 |
| Siege Threat | staffed facilities + project team size + base modifiers + turns since the last siege | 23 |
| Siege trigger | d10 + Siege Threat ≥ 16 → next mission must be Siege Defense | 23 |
| Departures | Unrest + Siege Threat ≥ 10 → the lowest-Tier survivor leaves | 23 |

**Three things that look like one rule and are not:**

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

**Assignments are stored, and cleared each Planning Phase.** Who staffs the Clinic this turn is a
decision, and decisions persist. It is also *this turn's* decision, so Planning Step 1 clears
last turn's — along with the utility assignments Phase 2 deliberately left standing with a note
pointing here.

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
- Every threshold in the phase is a named export here, and a test greps the engine for bare
  numeric literals in the places these belong.
- A test asserts the phase ids match `CAMPAIGN_PHASES` exactly, so the two cannot drift.
- Every step's page confirmed against the printed text as it is transcribed.
- A header comment naming the edition and the transcription date, matching `bases.ts`.

**Out of scope:** mission metadata (Phase 4) and the equipment tables (Phase 5), both of which
have steps that mention them.

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

---

## Z3-4 — Assignments, and schema v7

**Why:** The primitive fact the whole Planning Phase is about, and the one Phase 2 refused to
store early. Everything computed in Z3-5 reads it.

**Scope**
- An `Assignment` discriminated union: facility staff (with the slot), project team, rest, or
  mission team (with a team id — see the decision above).
- Stored as a partial map from survivor id to one assignment. Absent means unassigned, which is a
  real state and the commonest one at the start of a Planning Phase.
- `CURRENT_SCHEMA_VERSION` → 7, with a migration step, a `campaign-v7.json` fixture, and a `Base`-
  style arbitrary in `src/test/arbitraries.ts` typed as producing an `Assignment`.
- Save-file validation: an assignment naming a survivor who is gone, or a slot with no facility
  in it, is a damaged save and reports a readable error rather than crashing a screen.

**Acceptance**
- Assigning a survivor who already has a task replaces the assignment; a test asserts there is no
  shape in which one survivor holds two.
- The v6 fixture migrates forward and the v7 fixture round-trips.
- Removing a survivor removes their assignment, and a test covers it — a dangling assignment is
  exactly the kind of orphan that survives a save and breaks a screen three turns later.

**Out of scope:** what an assignment *does*. That is Z3-5.

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

**Acceptance**
- Entering the Planning Phase twice in a row clears assignments both times, and a test asserts
  the utility assignments clear with them.
- Assigning a survivor to a second task moves them rather than duplicating them, visibly.
- A survivor assigned to a slot that later loses its facility does not take the screen down.

---

## Z3-7 — The Advancement Phase

**Why:** Five steps, three of which are already built and in the wrong place: Phase 1's XP
spending and Phase 2's facility building both happen here in the book, and this is where they
acquire a step to happen in.

**Scope**
- The steps in order (pg. 18–19): advancement, strangers, materials, heal wounds (Z3-8), then
  facilities, upgrades and arriving trades.
- Materials: the d10 per material entered as rolled (1–3 Fuel, 4–6 Food, 7–9 Hardware, 10 Rare),
  plus the Rationing / Mechanics / Utilities substitution that **changes a roll's result** rather
  than adding to it (pg. 12), plus facility production from Z3-5 added as a proposed amount the
  player accepts.
- XP: Phase 1's advancement inside its step, with the Teaching cap of 2 XP per survivor applied
  where teaching is the source.
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
  outcome is applied on confirmation.
- **Feed** (pg. 22): Food required from Tiers (T1–2 eat 1, T3–4 eat 2) against Food available;
  Hunger is the shortfall, recomputed from scratch and never accumulated.
- **The hunger penalty**: a shortfall drops stats, and therefore every Skill Score, until the
  next Management Phase. `skillScore` grows a campaign-state parameter; nothing is written to any
  survivor. This is the change the whole architecture was built to absorb, and it should cost one
  function and its call sites.
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
  is the player's choice. Named and confirmed, never silent.
- The exhaustion penalty: Exhaustion above the mission team's size takes one survivor off it.
- The base sheet stops saying "from the base itself" and shows the total.

**Acceptance**
- A single Food removed from a community on the edge changes Hunger, then Unrest, then whether
  anyone leaves — and one test walks that entire chain from that one number, because the cascade
  is the thing most worth a regression test in the whole repo.
- The siege flag survives a save and gates the next turn's Mission Phase.
- Storage loss takes each material to its own cap and no further, and logs what was lost.

---

## Phase 3 is done when

A campaign can be played turn after turn without paper: the four phases walked in order behind a
turn counter, every survivor assigned to exactly one task, materials rolled in and Health
distributed by the rules, all seven Management steps computed through the cascade, and the whole
thing recorded in a log — with the mission played on the table and its outcome typed in. Round-
tripped through a save file, with CI green including the end-to-end walk, the mutation score
holding, and no rule prose in the repo.
