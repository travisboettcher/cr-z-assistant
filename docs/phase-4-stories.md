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

**The eight standard missions** (pg. 75; "any time, except for Siege Defense"):

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
- A Siege Defense is forced when d10 + Siege Threat ≥ 16 at Management Step 6, and "must be picked
  during the next Choose Mission step" (pg. 23). It deploys every survivor (pg. 85), so a siege
  turn has exactly one mission.
- Claim a New Base has no timing restriction: it is not tied to an overrun base (pp. 75, 86).
- The community may opt out of the mission; one survivor with no other assignment may scavenge
  (pg. 17).
- **Several missions in one turn are literal**: mission-team survivors "can be split between any
  number of mission teams, so more than one mission can be completed during the next campaign
  turn" (pg. 21; "the tabletop mission or missions", pg. 17). A survivor holds one assignment per
  turn (pg. 20), so is on one team at most.

## Decisions recorded, rather than left to the implementation

**A team is formed at Select Mission, from the survivors Planning assigned to missions.** Planning
Step 4 assigns survivors to *missions* for next turn (pg. 21) — the pool — and the split into
teams is only meaningful once each team has a mission, which is the Mission Phase's first step. So
the `mission-selected` entry names its team's survivors, drawn from the pool, and nothing changes
in `assignments`: no schema bump, and the Planning Phase stays as it is. On turn 1 the pool is the
First Mission's, which `FirstMission` already writes as ordinary mission assignments; on a siege
turn it is the whole community.

**Exhaustion counts the pool, which is what it already counts.** Pg. 23 compares Exhaustion with
"the mission team", singular. In this app's order the question does not arise: Exhaustion is
settled in the Management Phase against the pool the Planning Phase just assigned, before the next
Mission Phase splits it. `overworked` is unchanged.

**A team is a number within its turn.** Team 1, 2, … in the order they were chosen, carried on
both the selection and the outcome, so an outcome names the team it ends and a turn's history
reads in the order the table played it. #175's two outcome kinds gain the field as optional: an
entry without one is the turn's only team, which every entry written so far is.

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

**Old turns are not backfilled.** A turn played before Z4-2 has no `mission-selected` entry. Its
mission is read from its outcome entry where it has one (a Siege Defense or a Thin the Herd) and
is "not recorded" otherwise. The walk owes a selection only from the turn this lands on.

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
- A `mission-selected` entry: the team number, the mission, the survivors on the team, and the
  material type for Gather Materials. A `mission-skipped` entry for a community that opts out
  (pg. 17).
- `submitMissionSelection` in `missionForms.ts`, refusing: outside the Select Mission step; a
  survivor who is not in the pool or is already on a team this turn; anything but the First
  Mission on turn 1 (again, after a failed attempt — R21), or anything but a Siege Defense with
  every survivor on a siege turn; a mission
  whose catalogue entry says it cannot be chosen now; a second Claim a New Base (R20).
  A wounded survivor draws R12's warning, as at Planning.
- The step is owed until every survivor in the pool is on a team, or the turn is skipped.
- The Select Mission screen: choose a mission, tick its team from the pool, repeat while anybody
  in the pool is left.
- `deployed` reads the turn's teams where they are recorded, so mission XP and the Teaching pool
  go to the survivors who actually went.
- Log labels, and `EVENT_FIELDS` validation for both kinds.

**Acceptance**
- A turn with two teams records two selections, and the same survivor cannot be on both.
- A siege turn accepts only a Siege Defense with the whole community, and turn 1 only the First
  Mission.
- A save from before this story loads, and its turns read their mission from their outcome entry
  where they have one.
- `missionOutcomeProblem` stops guessing: an outcome is checked against the team's selection.

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
