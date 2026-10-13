# Phase 4, part 1 — Mission metadata: deliverable stories

Breakdown of the first half of Phase 4 from the campaign tracker plan, scoped from
[#178](https://github.com/travisboettcher/cr-z-assistant/issues/178). Part 1 ships **the record of
what a turn's missions were and how each one ended**: which mission every team chose, the facts
the table counted at the end, the wounds the team brought home, and the rewards the book reads off
those facts. The mission is still played on the table. Part 2 — working out a mission's setup
numbers from campaign state — is scoped separately once this record exists, because it is the
record it reads from.

Each story below is independently buildable, independently verifiable, and leaves the repo in a
working state. They are listed in dependency order.

## Why this document exists

Three phases have kept the Mission Phase a doorway. [Phase 3](phase-3-stories.md) recorded what
came *back* from a mission — materials, XP, casualties — as typed-in values, and every rule
downstream of a mission has been real since. What the campaign has never known is the mission
itself:

- **Select Mission stores nothing** (pg. 17), so a campaign's history never says what a turn
  played.
- **Two missions of eight have an outcome.** #175 recorded how a Siege Defense and a Thin the Herd
  ended, because those two move the siege counter (pp. 81, 86). Which of them a turn played is
  guessed: a turn with a siege due is a Siege Defense, and any other may record a Thin the Herd.
  Every other mission reaches the campaign only through its effects.
- **Wounds arrive through a correction.** Health set on the roster is deliberately not logged,
  which is why [R17](rulings.md#r17--what-a-siege-defense-does-to-the-turns-work) has to read
  "reduced to 0 Health during the siege" off Health as it stands, and admits it cannot tell a
  siege casualty from somebody already down.

The failure mode this phase is most exposed to is **the whole ruleset in scope from turn one**.
The book has 8 standard missions, 9 story missions, 9 origin missions and 3 Road Trip missions,
and every one of them has rewards that reach into equipment, traits, vehicles or a new base. The
scope boundary below is what keeps part 1 a record of missions rather than an implementation of
all of them.

## Architecture rules these stories must not break

1. **Rules as data** — the mission catalogue is `src/data/missions.ts`, with pages, and no prose.
2. **Pure engine** — choosing a mission, recording its outcome and reading its rewards are pure
   functions in `src/engine`, composed as forms the way [#179](https://github.com/travisboettcher/cr-z-assistant/issues/179)
   left every other turn step (`missionForms.ts`). The screen dispatches and renders.
3. **Derived is never stored** — an outcome entry holds **what the table counted, never a
   verdict**. Success, failure, the siege counter's change and every reward are read back from the
   facts, exactly as #175 shaped the two outcomes that exist. This is also what makes the book's
   missing "failure" labels harmless: the entry never has to say which it was.
4. **The log only grows** — a selection or an outcome made in error is corrected by a later entry
   that supersedes it, as `stood-in` already does, never by editing one.

## Scope boundary

Part 1 is done when every turn's missions are on the record — which mission each team chose, who
was on it, how it ended and what it cost in Health — and the rewards that are read off a mission
rather than typed in are read off it.

Part 1 explicitly does **not** include:

- **Mission setup numbers** (zombie counts, deployment, Complications on pp. 141–149) — part 2.
- **Losing or changing the base**: Claim a New Base's new base, its Inventory transfer and its
  Unrest lock (pg. 79), and the overrun base's three continuations (pg. 86) — that is
  [#182](https://github.com/travisboettcher/cr-z-assistant/issues/182), which builds on Z4-1 and
  Z4-3 here. Claim a New Base is *recorded* in part 1; what it does to the campaign is #182's,
  scoped below as part 1b.
- **Equipment and the base Inventory** — vehicles driven off (pg. 82), Rare Goods Trader's items
  and the materials set aside for a trade (pp. 21, 84) are Phase 5 and
  [#177](https://github.com/travisboettcher/cr-z-assistant/issues/177). Part 1 records the counts;
  nothing lands in an Inventory that does not exist yet. The rule that set-aside trade materials
  force the next mission to be Rare Goods Trader (pg. 21) waits with them.
- **Story and origin missions' rewards** (pp. 87–115) — traits, attached stories and unlocked
  upgrades are Phase 7. Part 1 lets a table record that one was played, by whom and with what
  wounds, through a generic outcome.
- **The Road Trip chapter** (pp. 158–167), which is optional and has its own travel rules.

## The rules this phase encodes

Transcribed from the rulebook extract of 2026-10-12 ("batch 12"), printed page numbers, and
corrected from "batch 14" the same day: a stranger's Tier is set by each mission's own setup
(pg. 15), every standard mission but the Thin the Herd and the Siege Defense can place one, and
none places a Hero (pg. 7; R24).

**The eight standard missions** (pg. 75), any of which may be chosen on any turn but the Siege Defense:

| Mission | Pages | Counted at the end | Read back as |
|---|---|---|---|
| First Mission: Start a New Community | 76–77 | Which end condition was met, if any; strangers rescued, with their Tiers | The first base (already recorded by `base-claimed`); strangers join at Advancement Step 2 (pg. 19) |
| Claim a New Base | 78–79 | Which end condition was met, if any; strangers rescued; working vehicles on the area | #182's: a new base, its Inventory, Unrest locked at 0 for the turn |
| Gather Materials | 79–80 | Materials carried off the map; the material type chosen at selection; a stranger its setup may place | One each of Food, Fuel and Hardware, remainder in the chosen type, **instead of** rolling the Material Type table (pg. 19); fewer than three are rolled |
| Thin the Herd | 80–81 | Starting zombies, zombies left, survivors exited, whether all were incapacitated | As #175: the siege counter reset or halved, or the next siege automatic |
| Retrieve New Vehicles | 81–82 | Vehicles repaired and driven off; a stranger its setup may place | Phase 5's: each into the base Inventory |
| Rescue Strangers | 82–83 | Strangers rescued, with their Tiers | They join at Advancement Step 2 (pg. 19); a rescuer's Tier is at least the stranger's (pg. 31) |
| Rare Goods Trader | 83–84 | Whether anybody exited; a stranger its setup may place | Phase 5's: traded items arrive, or are lost |
| Siege Defense | 85–86 | Zombies left, survivors exited | As #175: the counter reset and a point of Labor per project-team survivor next turn; or the base overrun |

The story (pp. 87–102), origin (pp. 103–115) and Road Trip (pp. 164–167) missions go into the
catalogue by id, name and pages only.

**When a mission may be chosen:**

- Turn 1 is always the First Mission (pg. 76). It is played again only as the overrun base's
  second continuation (pg. 86), which is #182's.
- A Siege Defense is forced when d10 + Siege Threat ≥ 16 at Management Step 6, and is the next
  Select Mission's only choice (pg. 23). It deploys every survivor (pg. 85), so a siege
  turn has exactly one mission.
- Claim a New Base has no timing restriction: it is not tied to an overrun base (pp. 75, 86).
- The community may opt out of the mission; one survivor with no other assignment may scavenge
  (pg. 17).
- **Several missions in one turn are literal**: the mission survivors may be split into any number
  of teams, each completing its own mission in the same turn (pg. 21; pg. 17 also allows for more
  than one). A survivor holds one assignment per turn (pg. 20), so is on one team at most.

## Decisions recorded, rather than left to the implementation

**The teams are the Planning Phase's; Select Mission chooses their missions.** Pg. 21 splits
the survivors assigned to missions between any number of teams at Planning Step 4, and
every `mission` assignment has carried a team number since Phase 3 for exactly this. So Planning
offers team 2, 3, … beside team 1, and the `mission-selected` entry names a team and its mission,
with the team's names copied in only for the history to read. No schema bump: the field was
already there. On turn 1 the team is the one `FirstMission` assigns at the start of the turn; on a
siege turn it is the whole community, as team 1. *This replaces the first draft of this decision,
which formed teams at Select Mission from an unsplit pool — written before noticing that pg. 21
puts the split in the Planning Phase and that the assignments already carry it.*

**Exhaustion counts every team together** — [R23](rulings.md#r23--which-mission-team-exhaustion-counts).
Pg. 23 compares Exhaustion with "the mission team", singular, and with teams split in Planning
there can be several; pg. 21 defines the singular as everybody going out. `overworked` counts
every survivor on any team, as it always has.

**A team's number is the Planning Phase's**, carried on the selection and, from Z4-3, the
outcome, so an outcome names the team it ends. #175's two outcome kinds gain the field as optional:
an entry without one is the turn's only team, which every entry written so far is.

**Each mission has its own outcome kind**, as #175 began: `first-mission-resolved`,
`gather-materials-resolved` and so on, all members of one `MissionOutcome` union, with the fields
the table above lists. A single kind with a mission id and a loose payload would push the shape
of every mission into validation code instead of the type checker. The two kinds that exist keep
their names and fields, so no save is rewritten.

**Every outcome carries its team's wounds**: for each survivor on the team, their Health at the
end and, in a Viral campaign, their Infection. Health *at the end* rather than Health lost,
because the end value is what the survivor's card says when the table counts. Recording the
outcome applies it; the roster's correction stays for fixing mistakes and is still unlogged. With
this, "who went down in the siege" is a fact in the record, and R17's reading off live Health
becomes the fallback for entries written before it.

**Story, origin and Road Trip missions get one generic outcome**, `mission-played`: the mission's
catalogue id, the team, and its wounds. Their rewards are Phase 7's, but a table that plays one
still has a turn to walk, XP to award and Health to record.

**Old turns are not backfilled.** A turn played before Z4-2 has no `mission-selected` entry, and
reads as every team going out, which is what every turn read as before; its outcome entry, where it
has one, still says what it played. The walk owes a selection only from the turn this lands on.

## The data this phase cannot invent

The mission list, pages and end conditions above come from the batch-12 extract. Z4-1 confirms
each page against the printed book as it is transcribed, as Z2-1 and Z3-1 did, and the rules test
pins them. Story, origin and Road Trip rewards were not extracted line by line and are not needed
until Phase 7.

## Rulings the book leaves open

Four, confirmed 2026-10-12 and recorded in [the registry](rulings.md):

- [R19](rulings.md#r19--missions-in-one-turn-are-independent) — missions in one turn are
  independent: each outcome applies on its own, mission XP is a point for every survivor on every
  team, the discretionary point is one per turn, and materials are rolled across all of them.
- [R20](rulings.md#r20--one-claim-a-new-base-per-turn) — a second Claim a New Base in one turn is
  refused at selection.
- [R21](rulings.md#r21--a-failed-first-mission-is-played-again-in-turn-1) — a First Mission that
  met no end condition leaves Select Mission open in turn 1 for another attempt.
- [R22](rulings.md#r22--what-a-failed-rare-goods-trader-loses) — a failed Rare Goods Trader loses
  what was traded and returns what was set aside for items not yet traded. Phase 5's to build.

Two more, found while building, and settled from the batch-14 extract:

- [R23](rulings.md#r23--which-mission-team-exhaustion-counts) — Exhaustion counts every mission
  team together, and the survivor taken off may come from any of them.
- [R24](rulings.md#r24--a-rescued-stranger-is-never-a-hero) — a mission outcome records strangers
  of Tier 1 to 3 only (pg. 7), and every rescued stranger joins as a field recruit.

---

## Z4-1 — The mission catalogue as rules data

**Why:** Every later story reads it. **Needs the rulebook open at pp. 75–86**, and at pp. 87,
103 and 164 for the ids and pages of the rest.

**Scope**
- `src/data/missions.ts`: each mission an id, a short label, its pages, and its family (standard,
  story, origin, Road Trip). For the standard eight: when it may be chosen (turn 1 only, forced by
  a siege, any time), what Select Mission asks for it (Gather Materials' material type), and which
  counts its outcome records.
- `MISSION_PAGES` in `src/ui/missionLabels.ts` reads its pages from here rather than keeping its
  own.

**Acceptance**
- Every mission is cited, and every citation lands in its family's chapter.
- Ids are unique, and the eight standard missions are asserted by name, so a later edit cannot
  drop one quietly.
- A header comment naming the edition and the transcription date, matching `bases.ts`.

**Out of scope:** what any mission does. This story is a list.

---

## Z4-2 — Select Mission records each team's choice

**Why:** The fact everything after it hangs off: what the turn played, and who played it.

**Scope**
- A `mission-selected` entry: the team number, the mission, the team's names for the history, and
  the material type for Gather Materials. A `mission-skipped` entry for a community that opts out
  (pg. 17). The latest entry for a team is its choice; an opt-out clears the choices before it.
- `src/engine/missions.ts`: the turn's teams (`missionTeams`), what was chosen (`turnMissions`),
  what is on offer (`missionsOnOffer`), and why a choice or an opt-out is refused.
- `submitMissionSelection` refusing: outside the Mission Phase; a team nobody is on; anything but
  the First Mission on turn 1, or anything but the Siege Defense on a siege turn; the First Mission
  or a Siege Defense on any other turn; another Origin's mission; a second Claim a New Base (R20);
  and a material type unless the mission asks for one. `submitMissionSkip` refusing turn 1, a
  siege turn, and a second opt-out.
- Planning Step 4 offers team 2, 3, … beside team 1 (pg. 21), and `sameTask` tells mission teams
  apart so the screen can.
- The step is owed until every team has a mission, or the turn is skipped.
- The Select Mission screen: a mission per team, grouped by family, and a material type for
  Gather Materials.
- `deployed` moves here from `siege.ts` and reads the teams that chose, so mission XP, the
  Teaching pool and the haul's substitutions go to the survivors who actually went. The outcome
  guard moves with it and stops guessing.
- Log labels, and `EVENT_FIELDS` validation for both kinds.

**Acceptance**
- A turn with two teams records two choices, and each team reads its own.
- A siege turn accepts only the Siege Defense, for the whole community, and turn 1 only the First
  Mission. Neither may be skipped.
- A save from before this story loads, and its turns read as every team going out.
- `missionOutcomeProblem` stops guessing: an outcome is refused for a mission no team chose.

---

## Z4-3 — An outcome for every standard mission

**Why:** #178's second ask — how every mission ended, on the record, in #175's shape.

**Scope**
- An outcome kind per standard mission with the fields in [the table above](#the-rules-this-phase-encodes),
  each carrying its team. `siege-defense-resolved` and `thin-the-herd-resolved` gain an optional
  team and are otherwise unchanged.
- `mission-played`, the generic outcome for a story, origin or Road Trip mission.
- `submitMissionOutcome` checks the outcome against its team's selection: the right kind, once
  per team, counts that are whole numbers, and a stranger's Tier that some rescuer on the team
  could carry (pg. 31 — a warning, since the table may have counted it differently).
- The walk owes an outcome for every team selected this turn, not only a siege's.
- The Tactical Mission screen offers each team's form in turn.

**Acceptance**
- Every standard mission records an outcome, and the readers #175 wrote — the siege counter,
  `baseOverrun`, `hordeForced` — read the same values from the same entries as before.
- An outcome for a team that was not selected, or a second one for the same team, is refused.

**Four things this story turned out to include.** `MissionOutcome` is now every mission's
outcome, in `missions.ts`, and the two that move the siege counter are `CounterOutcome` in
`siege.ts` — the readers #175 wrote take only those two, so nothing about the counter changed.
`missionResolved`, which asked whether the turn had *an* outcome, is gone: the guard and the walk
ask per team (`teamOutcomes`, `unresolvedTeams`), because "once a turn" stopped being true the
day a turn could have two missions. R21 is built here rather than in Z4-2, because a failed First
Mission is only knowable from an outcome: one that met no end condition reopens Select Mission on
turn 1 (`retryOwed`), choosing it again clears the outcome, and the walk owes the retry. And a
team's choice is locked once its outcome is recorded, and an opt-out once anything is played —
otherwise a correction to the choice would leave an outcome that belongs to nothing. Each
standard mission's number of end conditions is in the catalogue (`endConditions`), so the guard
checks the condition against data rather than a 3 in code.

---

## Z4-4 — Wounds on the outcome

**Why:** #178's third ask, and what lets R17 stop reading live Health.

**Scope**
- Every outcome kind, including `mission-played`, carries each team member's Health at the end
  and, in a Viral campaign, their Infection.
- Recording the outcome applies them to the roster.
- `fellInTheSiege` reads the siege outcome's wounds when the entry has them, and live Health for
  entries written before. R17 gets an amendment saying so.

**Acceptance**
- A survivor recorded at 0 Health in a Siege Defense is a casualty even after their Health is
  corrected back up on the roster.
- Health above the survivor's maximum, or Infection in a campaign that is not Viral, is refused.

**What this story turned out to include.** The wounds are a list on the entry, one
`{ survivor, name, health, infection? }` per team member (`MissionWound` in `log.ts`), with the
name kept for the history as every entry about a person keeps one; `infection` is on every wound a
Viral campaign records and on none anywhere else. **Every member is listed, once, and nobody
else**: a member left out would leave the roster's Health standing as though it were the end value
with nothing to say whether it was, and the form starts everybody at their current Health
(`woundsAsTheyStand`) so listing them all costs nothing. So an outcome submitted with no wounds is
refused; only entries written before Z4-4 lack them, and those are read, never submitted. Health is
a whole number from 0 to `maxHp`; Infection a whole number from 0 with no ceiling, the range the
survivor sheet and the save file already give it, because at 10 a survivor is down rather than
gone (#176). The form writes the wounds in team order under the roster's names, whatever the screen
sent. **The stand-ins read the same record as the casualties** — R17's amendment says why — so
`standInCandidates` changed beside `fellInTheSiege`, and the Siege Work panel says whether it is
following the outcome's Health or the roster's (`siegeHealthRecorded`). A Thin the Herd's "every
survivor incapacitated" stays a count the table makes, not something read off the wounds: the book
gives no rule that the two must agree, and the guard compares no other two counts either. No
schema bump: the field is optional on every outcome kind, as the team was in Z4-3.

---

## Z4-5 — Strangers rescued join the community

**Why:** Phase 3 left the Advancement Phase's new-survivor step as a doorway: "the step exists,
and creating them is Phase 4."

**Scope**
- Advancement Step 2 (pg. 19) offers a new survivor for each stranger the turn's First Mission,
  Claim a New Base or Rescue Strangers outcomes recorded, at that stranger's Tier, built the way
  the roster already builds one.
- The walk owes the step while a rescued stranger has not been added.

**Acceptance**
- Two strangers rescued by two teams are two survivors, each offered once.
- A stranger already added is not offered again after the walk goes back over the step.

**What this story turned out to include.** A stranger is named by the team whose outcome counted
them and their place in that outcome's list, from 0, and joining writes its own entry,
`stranger-joined`, carrying that pair — so "who is still waiting" is read off the log
(`strangersWaiting` in `src/engine/strangers.ts`) rather than stored, and a walk back over the step
finds the entry and offers nobody twice. Its own kind rather than a field on `survivor-recruited`,
because the Tier is the outcome's rather than the form's. A Rookie, Citizen or Leader joins as the roster's field recruit does — the Tier's stat
array, and from Tier 2 one skill off the d10 (pp. 7, 15) — and settles the starting community the
way a recruit does. No stranger is a Hero
([R24](rulings.md#r24--a-rescued-stranger-is-never-a-hero)). The step accepts a stranger
only in the Advancement Phase, and only one this turn's outcomes counted (`teamOutcomes`), so a
team that played its First Mission again (R21) offers its latest list, and a join from the failed
attempt answers nothing in it. A stranger nobody adds is not refused anything and not offered
again: the walk owes the step, the End-turn dialog names it like any other step left undone, and
the turn that rescued them takes them with it. There is no entry for turning a stranger away,
because the book has none: a rescued stranger is added to the community (pg. 19), and a community
without the beds for them pays in Exhaustion (pg. 23). Exiling a Lost survivor (pg. 124) is the
Cosmic Horror origin's, and Phase 7's. The roster's own Add
and Recruit forms are unchanged, for everybody who arrives some other way.

---

## Z4-6 — Gather Materials replaces the roll

**Why:** The one standard mission whose reward changes a number the tracker already computes.

**Scope**
- For materials a Gather Materials team carried out, Add Materials offers one of each type and the
  remainder in the type chosen at selection (pg. 80), in place of the Material Type roll (pg. 19)
  for those materials. Materials from the turn's other missions are still rolled.

**Acceptance**
- Materials carried out arrive as one of each type and the rest in the chosen type, with the
  types and the split confirmed against pg. 80 when the story is built.
- A turn with no Gather Materials team rolls exactly as before.

**Confirmed against pg. 80 when it was built (2026-10-12).** "Each type" is the three stored
materials — Food, Fuel and Hardware — so Rare is neither given nor offered as the chosen type
(`GATHERED_MATERIALS` in `src/data/missions.ts`), and Select Mission refuses it. A team that carries
off fewer than three gets no split: its materials are rolled on the Material Type table like any
others, and the step says how many. Several Gather Materials teams in one turn are each split on
their own (R19). What was gathered counts against the storage caps the haul is warned about, as
rolled materials do.

---

## Phase 4, part 1 is done when

Every turn's missions are on the record — each team's choice, who was on it, how it ended in the
facts the table counted, and the Health it came home with — and strangers and gathered materials
are read off that record instead of typed in. Round-tripped through a save file, with CI green
including the end-to-end walk, the mutation score holding, and no rule prose in the repo.

---

# Phase 4, part 1b — Changing base, and the overrun base

Scoped from [#182](https://github.com/travisboettcher/cr-z-assistant/issues/182) against the
batch-15 rulings extract (2026-10-12). Part 1 *records* a Claim a New Base and an overrun Siege
Defense; part 1b makes them do something. Today `submitBaseClaim` claims a first base only, and an
overrun base leaves the campaign with no legal next step: the screen says so and stops.

## What the book settles

Printed page numbers; *derived* means it follows from the text without being said.

- **The base type is chosen before the mission is played** (pp. 78, 86; derived). Its setup is
  built from the base being claimed, so the type has to be known at Select Mission.
- **A claim is won on end conditions 1 to 3** (pg. 79). On no end condition the community stays
  where it is.
- **Stored materials come along in full** (pp. 19, 54, FAQ), with vehicles, weapons and equipment.
  Nothing is capped at the claim: spoilage is Check Storage's, at Management Step 5 (pg. 23;
  derived).
- **Facilities and upgrades stay with the old building** (derived: the book moves materials and
  equipment only, and facilities belong to a base's slots, pg. 54). A new base has its own
  built-ins and empty slots.
- **Staff, utilities and projects last one turn** (pp. 19–20). Nothing is queued past the next
  Advancement Phase, so there is nothing else to carry or cancel.
- **Unrest is locked at 0 for the rest of the turn of a claim** (pg. 79). It does not stop
  Departures, which then depends on Siege Threat alone (pg. 23; derived).
- **A move into a lower-Tier base with too many Heroes sends one away**, of the player's choice
  (pg. 54). It is not a Departure (pg. 23), which picks the lowest Tier.
- **An overrun base offers three ways on** (pg. 86): claim a base again; start over through the
  First Mission's setup; or leave the survivors behind and begin a new community. All three
  continue the campaign.
- **Claim a New Base after an overrun** places no strangers, vehicles or resource tokens (pg. 86).
  Claiming the same base type on the same map recovers half the stored materials and lets the
  player-added facilities and upgrades be rebuilt without spending resources; Labor and time are
  still needed, and nothing sets a deadline (pg. 86; derived for "Labor and time").
- **Abandoned survivors can come back** in a later Rescue Strangers mission as themselves, with
  their experience and Inventory (pg. 86), and a rescuer's Tier must be at least theirs (pg. 31).
  A Hero sent away over the cap may come back the same way (pg. 54).

## Rulings the book leaves open

Eight, confirmed 2026-10-13 and recorded in [the registry](rulings.md) — the last of them while
building Z4-8:

- [R25](rulings.md#r25--when-the-community-moves-in) — the community moves in at the end
  of the Advancement Phase of the turn it claimed. Everything the last Planning Phase assigned —
  staff production, the Training Room, the Clinic, and the projects — settles against the old
  base, and the projects are left behind in it, with no refund.
- [R26](rulings.md#r26--a-claim-is-always-a-new-building) — a normal claim of the base
  type already held is a new building: empty slots, the old base's facilities left behind.
- [R27](rulings.md#r27--the-overrun-continuation-is-played-in-the-same-mission-phase) —
  the overrun choice is made when the Siege Defense outcome is recorded, and the mission each
  option leads to is played as a further mission in the same Mission Phase. A community never spends a turn without a
  base.
- [R28](rulings.md#r28--a-failed-continuation-leaves-the-choice-open) — a continuation
  that meets no end condition leaves the choice open again in the same turn, as R21 does for the
  First Mission.
- [R29](rulings.md#r29--what-a-claim-after-an-overrun-recovers) — after an overrun, a
  different base type recovers no stored materials and no free rebuild; the same type on the same
  map recovers half, and its free rebuild lasts until used.
- [R30](rulings.md#r30--start-a-new-community-after-an-overrun) — Start a New Community
  after an overrun loses the old storage, arrives stocked like a first base, and keeps the turn and
  siege counters.
- [R31](rulings.md#r31--abandoned-survivors-and-a-hero-sent-away-are-set-aside) —
  abandoned survivors, and a Hero sent away over the cap, are *set aside*: off the roster, kept on
  the record, and able to return as a stranger. Abandoning builds a new starting community in the
  same campaign, which plays the First Mission as the continuation, as option 2 does.
- [R32](rulings.md#r32--one-hero-leaves-for-each-hero-over-the-cap) — one Hero of the
  player's choice leaves for each Hero over the new base's Tier.

## Decisions recorded, rather than left to the implementation

**The move is an entry, not a side effect of the outcome.** A successful claim's outcome is a fact
about the mission; the base changing is a second thing that happens later in the turn (R25). A
`base-moved {from, to, setAside}` entry records it, written by a form at Advancement Step 5 that
`outstanding` owes. Until it is written every reader — production, beds, caps, Siege Threat —
reads the old base, as it should.

**"Same map" is a fact the table states**, not a layout the app stores. A Claim a New Base outcome
played after an overrun, for the same base type, asks whether it was played on the same map. The
book assumes the table remembers its Claim map (pg. 85); the app asks rather than modelling one.

**The overrun choice is its own entry**, `overrun-continued {option}`, written beside the Siege
Defense outcome rather than as a field on it: an outcome is what the table counted, and the choice
is what the player decided afterwards. The latest one wins, so R28's second try is a second entry.

**The whole community is the continuation's team.** A Siege Defense deploys everybody (pg. 85), and
the continuation is played by "the remaining survivors"; it is a second selection for team 1 in
the same turn, which is the shape R21's retry already has.

**A free rebuild is a property of the slot**, not a credit. Same base type means the same slot ids,
so the overrun records what stood in each slot, and ordering that facility or upgrade into that
slot of the reclaimed base costs no Hardware until it has been built once.

## Z4-7 — Claim a New Base names its base

**Why:** Everything after it reads which base was claimed.

**Scope**
- `asks: ['base']` on `claim-a-new-base`; `mission-selected` carries `base?`. Select Mission offers
  the roster, warns (not refuses) when the base's Tier is lower than the Heroes it would hold, and
  R20 still refuses a second Claim.
- The `claim-a-new-base-resolved` outcome reads its base from the selection; `describeOutcome`
  names it.
- `EVENT_FIELDS` validation for the field; a save without it is a selection from before this story.

**Acceptance**
- A Claim selection without a base is refused, and a base is refused on every other mission.
- An older save's Claim selection loads, and asks for nothing it cannot have.

**What this story turned out to include.** The outcome entry does not copy the base: the selection
is where it is recorded, and the history's selection line names it ("claiming a Distillery"), as
the Tactical Mission form does above the counts. A copy on the outcome would be a second record of
one fact that could disagree with the first. `claimWarning` counts Heroes against the base's Tier
and says how many of the player's choice leave (R32, settled with Z4-8). Any base on the roster is on offer, the one already held included (R26). The
reducer's `mission/selected` action gained the field beside the material's.

---

## Z4-8 — Moving into the new base

**Why:** The normal claim, which is most of #182's value and all of option 1's machinery.

**Scope**
- `claimedBase(campaign)`: the base this turn's claim won, if one did (end condition 1–3).
- `submitBaseMove`: written at Advancement Step 5 after the projects finish (R25). The base becomes
  the new one with empty slots (R26); the projects completed into the old base go with it.
  Materials are untouched, and no `base-stocked` is written: a later base starts with what was
  carried (pg. 54).
- **The Hero cap:** when the new base holds fewer Heroes than the community has, the form asks
  which Heroes leave, one for each over (pg. 54; R32), and refuses until exactly that many are
  named. They are set aside (R31).
- **The Unrest lock:** Calculate Unrest reads 0 for the rest of a turn whose claim succeeded
  (pg. 79). Departures reads it as it reads any Unrest.
- `outstanding` owes the move; `ClaimBase.tsx` stops sending a player with a base away.
- `submitBaseClaim` keeps its first-base meaning; the two share the stocking rule by name.

**Acceptance**
- After a won claim, Steps 1–5 read the old base, and the next Planning Phase reads the new one.
- A claim with no end condition met moves nothing and owes nothing.
- Materials over the new caps survive the move and spoil at Check Storage.
- Moving a three-Hero community into a Tier 2 base asks for one Hero, and into a Tier 1 base for
  two (R32).
- Unrest reads 0 at Management Step 4 of the move turn and is counted again the turn after.

**What this story turned out to include.**

- **Schema v15.** A Hero sent away is set aside whole (R31), so the campaign gained a `setAside`
  list of survivors, checked by the save reader as the roster is, and refused when one id is in
  both. The v14 → v15 step adds it empty, which is the truth: a v14 build could not move.
- **Two modules, not one.** What the turn's claim won (`claimWon`, `claimedBase`, `moveOwed`,
  `heroesOverCap`, and Z4-7's `claimWarning`, moved here) is `claim.ts`, read straight off the
  log; the move's guard and change are `move.ts`. The split is for the Unrest lock: `feeding.ts`
  asks `claimWon`, and anything that imported the mission or project readers would close a loop
  back through `siege.ts`.
- **The lock is in `unrest` itself**, so Calculate Unrest, Departures and anything else that reads
  Unrest agree. Hunger and Exhaustion are untouched, and so are the rules that read them directly.
- **A community with no base cannot move**, because the entry names the base left. Every
  campaign past turn 1 has one; the refusal is for a damaged or hand-built save.
- **What was not built here:** sharing the first base's stocking rule with the move. A move stocks
  nothing, so there was nothing to share; Z4-9's Start a New Community is the first to need it.
- **The export writes `setAside`'s entries in a fixed key order**, as it does a project's charge,
  because the property suite found a reordered file re-exporting differently. Mission wounds have
  the same gap, which nothing generates yet; it is queued separately.

---

## Z4-9 — The overrun base, and its continuation

**Why:** The step #182 is named for: an overrun campaign has no legal way on.

**Scope**
- `overrun-continued {option: 'claim' | 'start-over' | 'abandon'}`, refused unless this turn's
  Siege Defense left the base overrun. `outstanding` owes it.
- Each option makes this turn's Select Mission owe a second mission for team 1 — Claim a New
  Base, or the First Mission for options 2 and 3 — after the siege outcome (R27). It may be selected only then, and
  `missionsOnOffer` offers nothing else.
- A continuation that meets no end condition re-owes the choice (R28).
- Option 1's claim places no strangers (pg. 86): the outcome form does not offer them.
- Option 1 on a different base type, or not on the same map, empties storage on the move (R29);
  the same type on the same map halves it. Option 2's First Mission stocks the new base to its caps
  and drops the old storage (R30). Both move through Z4-8's `submitBaseMove`.
- `baseOverrun`'s screen line becomes the choice.

**Acceptance**
- An overrun turn cannot end without a choice, and a continuation is never offered on a turn that
  was not overrun.
- A failed continuation can be retried, or swapped for another option, in the same turn.
- The turn and siege counters read the same after option 2 as before it.

**What this story turned out to include.**

- **One form writes the way on and the next mission**, from the Tactical Mission step where the
  siege was just recorded: `overrun-continued`, then team 1's `mission-selected`, each checked
  against the campaign the other leaves. So nobody walks back to Select Mission, and the
  continuation's own outcome form appears below. Select Mission still agrees: once a way on is
  chosen it offers only that mission, and refuses the Siege Defense again.
- **Starting over asks for its base at selection**, as Claim a New Base does (`asksForBase` now takes
  the campaign). A campaign's turn-1 First Mission still claims its base on the base sheet; a later
  one can only be a community starting over. `claimedBase` reads a won First Mission's base the
  same way as a claim's, so both move through Z4-8's form, Hero cap included.
- **"Same map" is on the claim's outcome**, asked only of the overrun's claim of the overrun base's
  own type. The claim's outcome form leaves strangers out, and the guard refuses them.
- **The move writes what the stores held** (`stores` on `base-moved`) when it follows an overrun,
  because the stores change without any other entry saying so. The four materials alike, Rare
  included — see the note under R29.
- **The Unrest lock is the claim's**, so option 1 locks Unrest and option 2 does not (pg. 79).
- **A failed First Mission's line says which rule follows**: R21's replay on turn 1, R28's new
  choice on any later turn, where it can only be a community starting over.
- **What was not built here:** leaving the survivors behind (option 3), which needs the set-aside
  survivors returning, and is Z4-11's. The choice offers the other two and says so.

---

## Z4-10 — Rebuilding the overrun base

**Why:** The one reward option 1 has, and the only one that outlives the turn.

**Scope**
- The overrun records the player-added facilities and upgrades on each slot. Built-ins are not
  recorded: nothing destroys them (pg. 54).
- After a same-type, same-map reclaim, ordering one of those into its old slot costs no Hardware
  (pg. 86). Labor and the turn it takes are unchanged, and the offer lasts until it is used (R29).
- The order form says when an order is a free rebuild, and the cost line shows the Hardware waived.

**Acceptance**
- A Workshop that stood in the garage is free to rebuild in the garage, once; a second Workshop is
  not.
- A different-type reclaim offers no free rebuild.

---

## Z4-11 — Abandoning the survivors, and who comes back

**Why:** The third option, and the set-aside survivors two rules return as strangers.

**Scope**
- A *set-aside* survivor: off the roster and out of every count, kept on the record with their Tier,
  XP and Inventory. Written by Z4-8's Hero cap and by option 3 (R31).
- Option 3 sets every survivor aside, then reopens the starting community builder; the new
  community plays the First Mission as the continuation (R27), and its base arrives stocked as
  option 2's does (R30). Same campaign: the origin, the log and the turn and siege counters carry
  on.
- A Rescue Strangers outcome may name set-aside survivors instead of a new stranger's Tier; they
  rejoin as themselves, and the rescuer's Tier must be at least theirs (pg. 31). A set-aside Hero
  is the one way a Tier 4 stranger is recorded (amends R24).
- The history says who was set aside and who came back.

**Acceptance**
- A Hero sent away over the cap can be rescued back in a later Rescue Strangers mission, at their
  own Tier and XP, by a Hero rescuer only.
- After abandoning, the roster holds only the new community, the turn cannot move on until its
  First Mission is won, and the abandoned survivors are on offer to its Rescue Strangers.

---

## Phase 4, part 1b is done when

A community can move house, lose its base and go on, in every way the book gives — and what
moves, what is left behind and who leaves is on the record. Round-tripped through a save file,
with CI green, the mutation score holding, and no rule prose in the repo.
