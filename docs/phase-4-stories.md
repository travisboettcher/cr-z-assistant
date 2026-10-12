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
  Z4-3 here. Claim a New Base is *recorded* in part 1; what it does to the campaign is #182's.
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

Transcribed from the rulebook extract of 2026-10-12 ("batch 12"), printed page numbers.

**The eight standard missions** (pg. 75), any of which may be chosen on any turn but the Siege Defense:

| Mission | Pages | Counted at the end | Read back as |
|---|---|---|---|
| First Mission: Start a New Community | 76–77 | Which end condition was met, if any; strangers rescued, with their Tiers | The first base (already recorded by `base-claimed`); strangers join at Advancement Step 2 (pg. 19) |
| Claim a New Base | 78–79 | Which end condition was met, if any; strangers rescued; working vehicles on the area | #182's: a new base, its Inventory, Unrest locked at 0 for the turn |
| Gather Materials | 79–80 | Materials carried off the map; the material type chosen at selection | One of each type, remainder in the chosen type, **instead of** rolling the Material Type table (pg. 19) |
| Thin the Herd | 80–81 | Starting zombies, zombies left, survivors exited, whether all were incapacitated | As #175: the siege counter reset or halved, or the next siege automatic |
| Retrieve New Vehicles | 81–82 | Vehicles repaired and driven off | Phase 5's: each into the base Inventory |
| Rescue Strangers | 82–83 | Strangers rescued, with their Tiers | They join at Advancement Step 2 (pg. 19); a rescuer's Tier is at least the stranger's (pg. 31) |
| Rare Goods Trader | 83–84 | Whether anybody exited | Phase 5's: traded items arrive, or are lost |
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

**Which "mission team" Exhaustion counts is open** — [R23](rulings.md#r23--which-mission-team-exhaustion-counts--open).
Pg. 23 compares Exhaustion with "the mission team", singular, and with teams split in Planning
there can be several. `overworked` still counts every survivor on any team, as it always has.

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

One more found while building Z4-5, and left open:

- [R24](rulings.md#r24--what-a-rescued-hero-joins-as--open) — a Tier 4 stranger, whom the
  outcome accepts but the field-recruit rule does not cover (pg. 7), joins as the roster adds a
  Hero until it is ruled.

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
because the Tier is the outcome's and an outcome may count a Hero, whom the recruit form never
takes. A Rookie, Citizen or Leader joins as the roster's field recruit does — the Tier's stat
array, and from Tier 2 one skill off the d10 (pp. 7, 15) — and settles the starting community the
way a recruit does; a Hero joins as the roster adds one, which is
[R24](rulings.md#r24--what-a-rescued-hero-joins-as--open) and open. The step accepts a stranger
only in the Advancement Phase, and only one this turn's outcomes counted (`teamOutcomes`), so a
team that played its First Mission again (R21) offers its latest list, and a join from the failed
attempt answers nothing in it. A stranger nobody adds is not refused anything and not offered
again: the walk owes the step, the End-turn dialog names it like any other step left undone, and
the turn that rescued them takes them with it. There is no entry for turning a stranger away —
whether the book allows one was not checked, and the app does not invent one. The roster's own Add
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

---

## Phase 4, part 1 is done when

Every turn's missions are on the record — each team's choice, who was on it, how it ended in the
facts the table counted, and the Health it came home with — and strangers and gathered materials
are read off that record instead of typed in. Round-tripped through a save file, with CI green
including the end-to-end walk, the mutation score holding, and no rule prose in the repo.
