# Playtest — September 2026

A mock campaign played through the built app, looking for what a player at a table would hit and
the test suite would not. **The suite was green before and after — 1137 tests, typecheck and lint
clean** — so nothing recorded here is caught by an existing test. That is the point of the
exercise: the code and its tests were written from the same reading of the rulebook, and this is
a third reading, driving the app rather than the functions.

## How it was run

Four passes, each driving the **built bundle** (`vite preview`) in Chromium through a persistent
browser profile, so the app's own autosave carried each campaign from one interaction to the next
exactly as it does for a player who closes the tab and comes back.

| Pass | Scope |
|---|---|
| End-to-end campaign | Small Town Home, three turns, all four phases in order, character creation through Departures |
| Advancement Phase | The four XP pools and their caps, spending, recruits, materials, healing |
| Planning Phase and base layer | Assignments, utilities, the whole facility/base data table, ten bases |
| Management Phase | All seven steps at edge numbers, and the Hunger → Unrest → Departures cascade |

The oracle was the rulebook, plus [`phase-3-stories.md`](phase-3-stories.md) "Rulings the book
leaves open". **A documented table ruling was treated as correct**, and every one of them is
implemented as written — R1's starvation threshold, the unclamped Rot target, whole-community
departures, R5's unlimited Herb Plot, R12's wounded-equals-injured, and the deliberate broad
reading of the Utilities substitution. Where the app contradicts its *own* recorded ruling, that
is a finding.

## Two shapes behind most of this

**Data that nothing reads.** The rules-as-data layer is in better shape than the code consuming
it. Every row of the facility and upgrade table — ten facilities, twenty-nine upgrades, cost,
Labor, requirements and effect — and all ten base slot layouts were compared against the book, and
**no transcription error was found**. But four fields are correct in `src/data` and have no reader
anywhere in `src/engine` or `src/ui`: `facility.staffed`, `extraStaff`, `siegeThreat.reducedByBestOf`,
and `Effects.exchange` — plus five of the seven base specials. The transcription is right and the
sum ignores it, which means most of these are small fixes in one place rather than rules work.

**Steps that re-derive instead of recording.** Five steps record that they ran and refuse a second
press — Feed, Check Storage, Check the Horde, Add Materials, Heal Wounds all open with
`if (alreadyDone(campaign)) return campaign`. **Departures and Check for Rot do not.** They
re-evaluate from live state on every render, which produces both halves of a contradiction: a step
that fires again as long as the pressure holds, and a step that denies the thing it just did. The
same shape explains the hunger penalty drifting mid-phase, and a negative XP allowance.

---

# High

## H1 — Entering the Planning Phase destroys the Advancement Phase's inputs, on an unconfirmed click

The Advancement Phase reads the **previous** Planning Phase's assignments: who went on the mission,
who staffed the Training Room, Clinic and Kitchen, who is healing, who is resting. Entering the
Planning Phase clears `assignments` wholesale (`campaignStore.ts:474`, `withPlanningReset` at
`planning.ts:75`, which also drops every utility point).

The app puts a **"Skip to Planning"** button on *every* Advancement step, and it calls `move('phase')`
with no confirmation (`TurnWalk.tsx:146`) — while "End turn N", a less destructive action, gets a
modal. `phase-3-stories.md` (Z3-3) sells backwards navigation as a feature, so stepping back
afterwards is a journey the app invites.

Observed, on a turn whose Planning had assigned Gil→Kitchen, Zed→mission team, Hank and Ivy→rest:

| | before | after Skip to Planning, then Back |
|---|---|---|
| Heal Wounds | `Hank +1 Health (from resting, to 1)` / `Ivy +1 Health` | `Nobody has a wound this step can close.` |
| Add Materials | `+2 Food (0 recovered, 2 produced)` | `+1 Food` — the staffed Kitchen line gone |
| Character Advancement | `For going on the mission — 1 of 1 left` | `Nobody is on a mission team` |

The two Health points the rules owed Hank and Ivy (pg. 19, 21) were **permanently lost**, and both
faced Rot checks at 0 Health on the same turn that they should not have faced. There is no undo.

The comment at `campaignStore.ts:465` shows the boundary was considered, but it guards only the
other direction — a second clear destroying planning just done. Nothing guards the Advancement work
destroyed by the first clear.

## H2 — Material rolls are lost on reload, and the step then locks empty

The d10 rolls entered at Add Materials to Storage live in UI-local state only. The campaign
autosaves; the rolls do not.

Enter 7, 8, 9 — the preview reads `+3 Hardware (3 recovered)`. Reload the tab. The preview reads
`+0`. The step is still armed, and **Add to storage** then commits nothing, permanently: the log
records "Added nothing to storage this turn." and stepping back reads "This turn's materials are
already in storage. Stepping back through the walk will not add them twice." A whole mission's haul,
gone, with no undo.

This contradicts the README's promise that autosave means "a closed tab does not cost a turn". A
tablet discarding a background tab is the ordinary case, not an edge one.

## H3 — Labor is never spent

`validateBuild` compares each project's Labor cost against `laborPool(campaign)`
(`build.ts:120`) — just `Σ tier` of the current project team. Nothing subtracts Labor already
spent; there is no `laborSpent` anywhere. The pool is checked **per project, independently**.

With a team of Carla (T3) + Ruby (T1) = 4 Labor, in one Planning Phase:

| built | Hardware | Labor |
|---|---:|---:|
| Workshop in the Garage | 3 | 2 |
| Garden in the Front Yard | 1 | 2 |
| Gas Range on the Kitchen | 2 | 1 |

**5 Labor against a pool of 4.** Hardware was deducted correctly every time (6 → 3 → 2 → 0) and was
the only thing that ever stopped me. Meanwhile the base panel's **"Labor available: 4" never moved**
through all three builds, so a player cannot track it by hand either — directly under a caption
promising "Whatever is left at the end of the turn is lost."

This also makes the Departures knock-on unimplementable: pg. 23 takes a departing project-team
member's Tier off **the turn's unused Labor**, and if it exceeds what is left, one project goes
unfinished. With no spent figure there is no unused Labor to subtract from.

It leaks across the turn boundary too. Assignments persist until the next Planning Phase clears
them, so a project team assigned in turn 2 is still a live Labor pool during turn 3's Mission and
Advancement Phases — where building is also allowed. A 2-Labor team bought 3 Labor of upgrades a
turn after it was assigned.

Z3-11's acceptance already names this, but that story is scoped as being about project *timing*,
and the screen meanwhile presents "Labor available" as though it were live.

## H4 — A staffed Watchtower never reduces Siege Threat

The Watchtower's whole purpose (pg. 73: "Subtract staff's highest of Long Guns / Handguns / Archery /
Traps from Siege Threat this turn") does not reach the total. `production.ts:176` builds the
`−best score` line for the slot card; `siegeThreatFromBase` (`base.ts:261`) reads **only**
`effects.siegeThreat?.perTurn`, and nothing anywhere consumes `reducedByBestOf`.

Observed with a lookout at Long Guns Score 7: the slot card reads **"Produces −7 Siege Threat"**
while Check the Horde reads `+2 staffed facilities / +1 project team / +0 from the base itself /
+4 turns since the last siege` → **Siege Threat 7**. It should have been 0.

Net effect: staffing a Watchtower **raises** Siege Threat by 1, via the staffed-facility count, and
subtracts nothing. In that campaign it turned a pressure of 5 into 12, which sent a survivor away
and made a 9 enough to force a Siege Defense.

`base.ts:255` says in its own comment that "a staffed Watchtower subtracts its staff's best Score …
Phase 3 sums this with those". Phase 3 shipped and never did.

## H5 — Departures repeats until the pressure falls, and can empty the community

`management/departed` (`campaignStore.ts:724`) has no once-per-turn guard, unlike Feed, Storage and
the Horde. It re-checks candidates against a pressure the previous departure already changed — the
comment says so deliberately — so as long as Unrest + Siege Threat stays at 10 or over, the step
offers another name.

Two survivors left in a single Departures step; in another campaign the step offered to send away
three of a four-person community. Pg. 23 sends **one**.

The same missing guard the other way round produces the opposite absurdity: when the pressure *does*
drop below 10, the step immediately re-derives and reads "Nobody is leaving. The community holds
together." — one step after it made somebody leave, with the log directly above reading "Ruby Vance,
a Rookie, left the community." The horde roll that turn was logged against the pre-departure figure,
so the two numbers on screen disagree as well.

## H6 — Facility staff capacity is unenforced

`extraStaff` is defined in `facilities.ts:135` and set by three upgrades — Med Lab, Study Room,
Watch Post — and **read by nothing**. There is no staff-capacity concept at all, so a facility that
should hold one worker accepts the whole community and sums every score.

- Three survivors on a bare Medical Clinic → **+5 Health** (should be the one staff's Medicine).
- Two on a bare Watchtower → **−6 Siege Threat** (should be one lookout's best of four).
- Two Medicine-8 staff on one Clinic → a Rot check target of **−4** and **"+16 Health"**.

## H7 — Unstaffable facilities are offered for staffing, and each one costs Siege Threat

`facilities.ts` correctly marks the Bunk Room `staffed: false` — its effect is "2 beds", a flat
effect with no skill in parentheses. `FacilityStaff` (`PlanningPhase.tsx:155`) renders a staffing
control for **every** occupant with no filter on `facility.staffed`, so Bunk Rooms, Gardens and
Storage Areas all get one.

`staffedFacilityCount` (`assignments.ts:142`) then counts any slot with somebody in it, so the
assignment is not merely wasted — it **raises Siege Threat**. Assigning Ruby to a Bunk Room produced
"+1 staffed facilities"; one Kitchen and two Bunk Rooms produced +3.

The base screen's own slot card gates the same control behind `wantsStaff()`. The two screens
disagree with each other, and the data agrees with the base screen.

---

# Medium

## M1 — Rolling a siege at step 6 lowers the Siege Threat that step 7 reads

`withSiegeCalled` (`siege.ts:130`) sets `lastSiegeTurn = campaign.turn + 1`, so
`turnsSinceLastSiege` — `max(0, turn − lastSiegeTurn)` — collapses to **0** the instant a siege is
called, for the rest of the same phase. The siege has not been fought; it happens next turn.

Departures reads Siege Threat live, so the pressure it tests is lower than the one the horde was
rolled against: 12 → 8 in one observed turn, which saved a survivor from leaving. The Check the
Horde screen then contradicts the number it just rolled against.

## M2 — A departure silently deepens the hunger penalty for everyone left

`hungerPenalty` (`feeding.ts:94`) pairs a **recorded** Hunger — read back out of the log, correctly —
with a **live** population. Pg. 22 takes both at the Feed step and holds the result until the next
Management Phase, so anything that changes the head count later in the turn re-prices a penalty
already in force.

| | population | recorded Hunger | penalty | Benny's Mechanics (Coop 3) | Earl's Slots (T4 + Carry, Str 4) |
|---|---:|---:|---:|---:|---:|
| after Feed | 4 | 6 | 2 | 1 | 6 |
| after Ruby left at Departures | 3 | 6 | **3** | **0** | **5** |

The Feed step had said, in as many words, "every survivor's stats drop by 2 until the next
Management Phase". Two steps later it is 3 and nothing says so.

The direction is backwards as well as wrong: **losing a survivor makes the food shortage hurt the
survivors more**, when the same food now feeds fewer mouths. It is not cosmetic — the penalty runs
through the next turn's Mission and Advancement Phases, so it moves facility production, Medicine
totals for the Rot check, healing and Inventory Slots. In the playtest it took the Workshop's output
to 0 Hardware. The `survivors-fed` event already carries `hunger`; it needs the population too.

## M3 — The Hydroelectric Dam's two Phase 3 specials are unimplemented

Of seven base specials, only `curtain-wall` and `white-noise` have readers — `bases.ts:129` says so,
and Phase 3 did not add the rest. Two of the missing ones are Phase 3's own rules:

- **Utilities** — combined Utilities 6+ supplies Power and Water to *all* facilities. At a combined
  Utilities of 7, the Workshop still read "halved for want of a utility". The Dam has no Utility
  Station slot and no flat generation, so it can never supply anything at all.
- **Catwalks** — +2 Labor when at least one survivor is on the project team. The pool read 3
  instead of 5.

The other three (`blacksmithing-tools`, `ring-the-bell`, `turnout-gear`) belong to Phases 4 and 5
and are annotated as such — those are deferrals, not findings.

## M4 — Facility and upgrade conversions are transcribed but never applied

Pg. 19 puts conversions in Add Materials to Storage. The data has them — Gas Range
`{spend:{fuel:2}, gain:{food:1}}`, Biofuel Lab, Generator, Well Pump — on an `Effects.exchange`
field with **no reader in `src/engine` or `src/ui`**, and no control anywhere in Step 3.

A community holding Fuel and short of Food cannot use a Gas Range it paid 2 Hardware and 1 Labor
for. Unlike `gatesEquipment` (Phase 5) and `preventsBiting` (Phase 7) beside it, `exchange` carries
no "Phase N owns this" marker and no `docs/` entry — so this reads as an omission rather than a
deferral.

## M5 — Two XP pools report the wrong reason for being empty

Both are the same class: the screen has one sentence per source, so it cannot distinguish "nobody
assigned" from "the wrong person assigned" (`AdvancementPhase.tsx:438`).

- **"Nobody on the mission team has Teaching"** is shown when a Teacher *is* on the team but their
  Score is 0. `experience.ts:161` branches on the summed Score rather than on whether a Teacher
  went, so a Rookie Teacher also leaves the discretionary point standing. The module's own header
  states the opposite intent: the discretionary pool is one XP "only while nobody who went out can
  teach".
- **"No staffed Training Room, so nothing to teach with"** is shown when the Training Room *is*
  staffed, by somebody without Teaching. `production.ts:126` already computes `missingSkill` for
  exactly this, with a comment saying a player "can only fix the one they can see" — and the XP
  screen throws the distinction away.

Z3-7's stated design is that an empty pool says *why* it is empty. In both cases it says the wrong
why, contradicted by the roster on the same screen.

## M6 — Projects complete instantly, and the guidance points at the wrong step

Z3-11 is unbuilt, so building is immediate. The app is honest that it does not model the queue, but
the note it shows when you build during Planning inverts the rule:

> Projects belong to Add Facilities and Upgrades, and the turn is at Assign Project Team.

Assign Project Team is exactly where pg. 20 spends the Labor and Hardware; Add Facilities is where
the project *completes*. A player following this is sent away from the right step — and the step is
never told that building is immediate rather than queued.

## M7 — "Only one Hero may be on any single mission" is neither enforced nor warned

Pg. 7. The word "Hero" does not appear in `planning.ts` or `legality.ts`, and no violation code
exists for it; the only Hero rule modelled is the base's community-wide cap. Two Tier 4s were
assigned to one mission team in silence. It matters beyond legality because team Tier points scale
the zombie count.

## M8 — The Rot bite is optional, and a Rot check can be resolved twice

Two separate gaps in the same step, both from the missing once-per-turn guard described above.

- The "Bites" control defaults to **nobody**, so resolving a failed check can skip the 1 Damage
  pg. 22 makes mandatory.
- `management/rotChecked` has no per-survivor guard, so the same survivor can be checked twice in
  one phase — observed passing at 10 and then dying at 1.

## M9 — The Exhaustion penalty is offered repeatedly, and sits on the wrong step

Pg. 23 removes **one** survivor from the mission team when Exhaustion exceeds the team size. The
control can be pressed until the team is empty. It is also placed on step 4 while Assign Beds —
step 3, where the rule lives — reads "Nothing to apply".

## M10 — Hunger is carried across the turn boundary when Feed is skipped

`hunger()` reads the last `survivors-fed` entry with no turn filter, so a turn where Feed has not
run shows the *previous* turn's Hunger under a caption reading "counted again from scratch this
turn" — 9 Hunger on turn 7, from turn 6. Nothing warns when a destructive step is skipped, and the
walk ticks it complete anyway.

## M11 — A utility point outlives the staff that generated it

Removing the survivor who generated a utility leaves the point assigned and still paying out: the
Greasy Spoon's Food cap stayed at 8 with `SCORE SPENT 1 / 0` on screen and no warning.

## M12 — Staffing done on the base screen outside Planning is silently thrown away

The build controls on the same slot card warn which step they belong to; the staffing control does
not, and the planning reset wipes it.

## M13 — The survivor sheet applies the hunger penalty but never mentions it

`SurvivorSheet` threads `penalty` into Vitals and Skills correctly, but `Stats`
(`SurvivorSheet.tsx:402`) does not take it and renders the raw stored value. Benny's sheet showed
**Cooperation 3** and **Mechanics score 1**, directly under the sheet's own sentence: "Score is the
skill's level plus its governing stat." The Feed step explains the penalty; the roster and sheet are
what a player reads at the table, and they show the consequence with no cause.

## M14 — Stepping back into Advancement after Planning shows a negative allowance

`AdvancementPhase.tsx:103` renders `pool.total - pool.awarded` with no floor. After Planning clears
the mission team, the pool total drops below what was already awarded:

> For going on the mission — **-2 of 0 left**
> Nobody is on a mission team, so there is no mission XP this turn.

Two statements that contradict each other, one of them impossible. Further awards are correctly
refused, so this is display — but it is display of an unreachable state, and it points at H1's root
cause: who went on a mission is never recorded as a fact of the turn.

## M15 — "Nothing here uses it, so the point would do no work" is shown for facilities that need it

`checkUtility` looks only at `requires.utilities`, never at `halvedWithout` or `withUtility`. So the
Kitchen's Water toggle carries that message three lines above "halved for want of a utility", and
the Garden's does too — where Water takes it from 1 Food to 3.

## M16 — A never-exported campaign reports "Matches your last exported file"

`CampaignProvider` seeds `exportedText` from the autosave it restored (`CampaignProvider.tsx:68`),
so a campaign restored from autosave is treated as matching a file on disk. It has never been
written to one.

Start a campaign, change anything, reload: the footer reads "Matches your last exported file." and
the Start-a-new-campaign dialog reads "It matches your last exported file, so nothing is lost." —
and starting a new one then destroys the only copy. This contradicts the distinction the
persistence layer is built around, stated two lines above the message in the same component.

## M17 — Turn 1 cannot record who went on the First Mission

The mission team is assigned in Planning Step 4, at the *end* of a turn, so on turn 1 no team
exists and Character Advancement reads "Nobody is on a mission team, so there is no mission XP this
turn." The First Mission (pg. 75) is played on turn 1 by definition and everyone on it earns 1 XP.
The same gap silently zeroes turn 1's material substitutions, whose uses are the summed skill
scores of the survivors on that mission.

## M18 — Claiming the first base does not stock it

`base/claimed` (`campaignStore.ts:658`) sets the base and nothing else. Pg. 19 and the Base Building
chapter start the **first** base at the maximum of every material type — 4/4/4 for a Small Town
Home. The app leaves 0/0/0 and never mentions the rule. It already knows the caps: it displays
"0 / 4".

---

# Low

- **A Tier 1 recruit rolls a skill the rules never give it.** `recruitSurvivor` correctly ignores
  the roll for Tier 1 (`survivor.ts:164`, citing pg. 7), but the Skill roll control stays enabled,
  the blurb reads "arrives with one skill already rolled", and the permanent log records "recruited
  as a Rookie, **rolling a 3**" — while the survivor arrives with no skills. The history asserts
  something the rules do not do and the app itself discarded.
- **Two survivors can rest and both collect a Health point.** The Planning warning-not-blocking is a
  documented ruling; what is not licensed is Heal Wounds then paying both points in silence.
- **The Medical Clinic's Restraints upgrade has no effect on the bite.**
- **The Feed screen mixes a logged Hunger with a live Food requirement**, and can print an
  impossible pair ("eats 6 Food… 8 Hunger").
- **The Distillery's built-in Utility Station card says it produces nothing** while the base sheet
  shows its flat 2 Water.
- **`Power assigned 1 / 0 flat` reads as an over-assignment** when it is not.
- **The Greenhouse's Fence-replacement discount is unreachable.**
- **"Needs a utility it does not have, so it produces nothing this turn" overstates the case** when
  only an upgrade is affected — the Kitchen still produced 2 Food the next Advancement.
- **A field recruit trips the starting-community budget warning.** Recruiting through the app's own
  "Recruit from the field" form raised the roster to 11 tier levels and produced "A starting
  community is built from 10 tier levels, and this one spends 11." Growth is the point of the
  recruit mission; it should not look like an error by default.
- **The three discretionary-XP buttons are indistinguishable to a screen reader** — each has the
  accessible name "+1 XP", with the survivor's name only in adjacent text. Every other button in the
  app carries a hidden descriptive label, so this is inconsistent with the app's own convention.
- **The README describes Phase 0.** "What works today" still says "you can create a campaign, and
  save and load it as a `.json` file… Survivors, base building, the turn engine, missions and
  equipment are later phases." Phases 1–3 have shipped. A comment at `campaign/materialSet` is
  stale the same way: "over-storage has consequences this app does not model yet", after Z3-10.
- **A 404 on every page load** — no favicon, and no manifest or apple-touch-icon, for an app whose
  stated device is a tablet standing next to the table.
- **Utilities → Rare is offered** in the substitution dropdown. Ruling 4 leaves this open and
  `turn.ts` records the broad reading deliberately, so **this is not a bug** — flagged only because
  the player is given no sign that the most generous of the three substitutions is a house reading.

---

# Verified correct

Recorded because several of these are the rules most likely to be got wrong, and because a
regression in any of them would be expensive.

**Rules as data.** Every row of the facility and upgrade table — 10 facilities, 29 upgrades,
Hardware, Labor, Requires and Effect — compared against the book: **no transcription errors**. All
ten base slot layouts match: slot count, Indoor/Outdoor, built-in facility, shipped upgrades,
`upgradable: false` on built-ins carrying one, and the three clearing projects.

**The Advancement Phase's two subtlest rules.** The two 2-XP caps are genuinely separate and stack —
Carla took 2 from the Training Room *and* 1 from the Teacher pool in the same turn. The Teacher
replacement is a replacement, not an addition: "A Teacher on the mission takes this point and hands
it out instead." Training Room XP correctly excludes the mission team.

**Advancement costs.** Sequential skill costs with no skipping, Move/Defense costing the new score
with a maximum of 8, skill level capped at Tier, Tier × 2 promotion with the zero-stat choice, and
the per-Tier skill-count caps. The recruit d10 table.

**Materials.** One roll per material, the 1–3/4–6/7–9/10 table, substitutions that *change* a roll
rather than adding one, per-mission substitution pools, staffed and passive production both added,
and storage maximums reported but **not** enforced in this step — "5 hardware is over this base's 4.
Check Storage is a Management step, so it keeps until then."

**The Management cascade.** Ruling R1 implemented literally, including the accepted consequence that
a Tier 1–2 community takes no stat penalty at any shortfall — and the penalty reaches Skill Scores
*and* Inventory Slots. Tier consumption 1/1/2/2. Exhaustion = max(0, population − beds). Unrest =
Hunger + Exhaustion. **Check Storage clamps per material type, not pooled** — a starving community
still loses surplus Fuel, exactly as the worked round predicts; Rare is never trimmed. Siege Threat
terms are raw counts of weight 1, never cached, with the trigger at d10 + Threat ≥ 16 and naturals
correctly *not* applying to that roll. Rot: target 12 − combined Medicine Score, unclamped per
ruling 2; naturals applying; bite candidates drawn from *this* turn's healing assignments; 1 Damage
with removal only at 0. Departure candidates: lowest Tier only, ties all offered, and a survivor at
0 Health never offered. **Retroactive unstaffing works** — sending away a staffer dropped the
staffed-facility count and the pressure within the same step.

**Planning and the base layer.** One assignment per survivor holds across facility staff, project
team, rest, healing, mission team and scavenger, across *both* screens — it could not be broken.
Utilities cleared on the first arrival at Planning Step 1 and not re-cleared when stepping back and
forward; a point is a per-slot boolean so it cannot accumulate; a utility passes to all of a
facility's upgrades. Halving rounds up. Upgrades that produce materials work unstaffed. All six
upgrade legality rules, including R5's deliberately unlimited Herb Plot. Storage caps derive as
Tier + 3 + modifiers. Rest and healing eligibility, and injured-on-a-mission, all warn correctly.

**Persistence.** Export → import → re-export mid-campaign, in a fresh browser profile, is
**byte-identical**.

---

# Appendix — reproducing this

The app was driven through a persistent Chromium profile against `vite preview`, so the campaign
survived between interactions the way it does for a player. Each pass kept its own profile
directory. The findings above were each reproduced at least twice before being written down, and
every claim about the source was checked against the file.

Findings that are *display* rather than state are marked as such — they matter anyway, because a
player acts on what the screen says.
