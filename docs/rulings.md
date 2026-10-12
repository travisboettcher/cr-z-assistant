# Rulings — the registry

Where the printed text does not decide an answer and this app had to. A house rule that lives in
a function is indistinguishable from a rule, so each one is written down here, with the question,
why the book does not settle it, the ruling, and what the ruling costs.

**Cite them as `R7`**, in code comments and in the phase documents, and link to this file. A
ruling that is cited but not recorded is the thing this registry exists to prevent.

## About the numbering

The playtest reports have cited R-numbers since round one, but the registry itself was never
written down — the numbers lived in report prose and in one code comment. This file is that
registry, written down for the first time in September 2026.

**Four numbers are inherited** and are fixed by citations that already exist: R1 and R5
(`docs/playtest-2026-09.md`), R4 (`src/engine/production.ts`), and R12 (`docs/playtest-2026-09.md`
and [#173](https://github.com/travisboettcher/cr-z-assistant/issues/173)). Every other number was
free — no citation of it exists anywhere in the documents, the source or the three playtest
reports — and was assigned here. Where a ruling came from `phase-3-stories.md`'s numbered list it
kept its digit wherever the inherited four allowed, so most existing citations did not have to
move: only that list's rulings 4 and 5 were renumbered, to R9 and R12.

R16 arrived from the other direction: it was written as `phase-3-stories.md`'s ruling 9 on a branch
cut before this registry existed, and took the next free number when the two met.

Rulings that are still open are marked **OPEN**. They are recorded rather than settled quietly,
which is the point of the registry — a question nobody has answered looks exactly like a question
nobody noticed, unless it is written down.

---

## R1 — The hunger penalty is a starvation threshold, not a hunger tax

**pg. 22.** The book says to subtract Hunger from the community's population and, if the result is
negative, reduce every survivor's stats by that number. Two problems. `population − Hunger` is
almost never negative: Hunger is capped at the Food required, which is at most twice the
population, so the penalty fires only when a mostly Tier 3–4 community has nearly empty stores.
And "reduced by that number" where the number is negative is self-contradictory; the intent is
presumably its absolute value.

**The ruling is the literal one.** `penalty = max(0, Hunger − population)`, applied to every
survivor's stats and floored at zero. The printed arithmetic computes `population − Hunger` and
tests it for negativity, which is the shape of a threshold — a tax would just have said "reduce
stats by the Hunger" and never mentioned the population.

| Community | Food required | Food stored | Hunger | pop − Hunger | Stat penalty |
|---|---|---|---|---|---|
| 5 Heroes | 10 | 5 | 5 | 0 | none |
| 5 Heroes | 10 | 4 | 6 | −1 | −1 to every stat |
| 5 Heroes | 10 | 0 | 10 | −5 | −5, everything floored at 0 |
| 5 Rookies | 5 | 0 | 5 | 0 | **none, at any shortfall** |

That last row is an accepted consequence rather than a bug to route around: a community of
Tier 1–2 survivors can empty its stores completely and take no stat penalty, because the
threshold is arithmetically unreachable for them. They are not spared — Hunger feeds Unrest
directly (pg. 23), and Unrest + Siege Threat ≥ 10 sends somebody away.

Two smaller decisions taken with it, neither of which the book leaves genuinely open. **Stats
floor at zero**, because a −5 on a Tier 4's array of [4, 3, 2, 1] would otherwise produce negative
Skill Scores, which nothing in the book contemplates. And the penalty applies to **stats**, not to
Skill Scores directly — which means it also moves Inventory Slots, since those are Tier plus the
Carry *Score* (pg. 14).

### Amendment, September 2026 — expiry is the book's, not this ruling's

Round three asked whether the penalty should survive a turn whose Feed step never ran
([#164](https://github.com/travisboettcher/cr-z-assistant/issues/164)). It is not a question for a
ruling, because the book answers it twice.

**Feed is not optional.** pg. 22 opens the step with "Every campaign turn, survivors need to eat."
No opt-out clause appears anywhere in the Management Phase — unlike the Mission Phase, which
grants one explicitly.

**Expiry is already explicit.** The penalty runs "until the next turn's Management Phase." That is
a clock, not an overwrite.

So the engine keying expiry off the most recent Feed entry in the log (`feeding.ts`) is a defect
rather than an implementation of this ruling: with no new entry the last one is from an older turn
and the penalty never lifts. **Expiry is turn-based.** The penalty set by turn N's Feed step holds
through the rest of turn N and through turn N + 1's Mission, Advancement and Planning Phases, and
is gone when turn N + 1's Management Phase begins, whether or not a Feed step ran in it.

That dissolves the dilemma the issue posed. Feed does not have to be refused, and a turn ending
with Feed unresolved does not need to clear the penalty as a special case — the clock does it.
Z3-6's posture that the walk guides rather than refuses is untouched.

---

## R2 — The Rot check target has no floor

**pg. 22.** None is stated, so a Clinic with enough Medicine drives the target to 2 or below.

**Left unclamped**, on the grounds that the natural-1 rule (pg. 8) already stops it becoming a
certainty, and that clamping would be inventing a rule. Flagged rather than assumed.

---

## R3 — "At the base" at Departures means the whole community

**pg. 23.** The rule names the lowest-Tier survivor *at the base*, which reads as excluding a
mission team — except the Planning Phase assigns next turn's team, so at the Management Phase
nobody has left yet.

**The ruling is the whole community**, which is the only reading that does not depend on a journey
that has not happened.

---

## R4 — The Distillery's Utility Station produces its Water with nobody in it

**The flat output belongs to the slot rather than to the facility in it.** The Distillery's
built-in Utility Station makes 2 Water unstaffed, while a Utility Station's own production is
skill-named and therefore needs somebody in it.

Cited from `src/engine/production.ts`. `flatUtilitiesGenerated` had always counted it, so the base
sheet showed the 2 Water while the slot card said the facility produced nothing — one ruling read
in two places, which is what this registry is for.

---

## R5 — The Herb Plot has no per-Garden limit

**pg. 68.** Only the Fence and the Greenhouse are one-per-Garden; neither the table nor the prose
restricts this one, so the general cap of three upgrades is the only limit.

**Deliberately unlimited.** That opens a real build rather than an oversight: a watered Garden with
a Fence and two Herb Plots yields 2 Food and 2 Health a turn, and three Herb Plots trade the
Garden's Food away entirely for 3 Health. Anything that enforces the upgrade cap must not quietly
add a limit here.

---

## R6 — A set of Restraints works once per turn

**pp. 72–73, [#119](https://github.com/travisboettcher/cr-z-assistant/issues/119).** "Each set
prevents one turned survivor from biting" gives a count and no duration.

**The ruling is per turn:** a set holds one survivor each night rather than one ever. The
alternative — a set used up the first time it works — would make the upgrade worth buying once and
worth nothing afterwards, which no other upgrade in the book behaves like, and the book calls it
equipment bolted to a Clinic rather than a supply. Counted off the log, so two sets hold two
survivors in one turn and no more.

The spread rather than a page, because the two transcriptions of this upgrade disagree:
`facilities.ts` recorded it as pg. 73 and the September playtest read it off pg. 72. Narrow it next
time the book is open.

---

## R7 — A point of XP handed out stays handed out

**pg. 18, [#145](https://github.com/travisboettcher/cr-z-assistant/issues/145).** A table can
correct a mission team after handing its XP out — most easily on turn 1, where the team is recorded
rather than assigned a turn ahead. The book has nothing to say about it, because it does not
imagine the record being edited.

**The ruling is that a point handed out stays handed out.** An award is written in the log and on
the survivor's sheet; taking somebody off the team afterwards reaches back through neither. So a
two-person mission whose points are spent has no third point for a late arrival, and the survivor
who left keeps theirs.

The alternative — the pool describes the *current* team, so removing somebody frees their point —
reads well until the freed point is handed to a third survivor and the mission has paid out three
points for two people, because the first award is still on the sheet it was written to. Undoing an
award to match would be the app editing a survivor nobody asked it to touch.

What the ruling costs is a row that can be shown as eligible and pressed no further, so the screen
says which of the two it is: the reason sits beside the button rather than being left to the
greyed-out state.

---

## R8 — A Teacher with a Score of nothing still replaces the discretionary point

**pg. 12, [#143](https://github.com/travisboettcher/cr-z-assistant/issues/143).** A Teacher on the
mission team replaces the discretionary point, and their Teaching Score is how many survivors they
then hand a point to. The book does not say what happens when those two come apart — a survivor who
has the skill at Score 0, which a Cooperation of 0 and a level of 0 produces.

**The ruling is that having the skill is what replaces the point.** A Teacher whose Score is 0
replaces the discretionary point and hands out none, so that turn awards one XP each for going out
and nothing else. The trigger the book names is the Teacher being on the team, not a number; the
Score appears only in the sentence about who receives points.

The alternative — the Score replaces the point, so a Score-0 Teacher leaves it standing — is
defensible and was what the code did, while the message on the screen said the ruling above. Either
is playable; what is not is the pair disagreeing, which is how a discretionary point was awarded
under a line saying it had been replaced. One `canTeach` against one `teaching > 0` is the whole of
the difference, if a table wants it the other way.

---

## R9 — How broadly the Utilities substitution applies — **OPEN**

**pg. 12.** Rationing is locked to Food and Mechanics to Hardware, but Utilities is written as "a
given material" and appears to allow any — including, perhaps, forcing a 10 and a Rare Item Table
roll. The asymmetry may be deliberate or may be loose phrasing.

*Previously `phase-3-stories.md` ruling 4.*

---

## R10 — Tier promotion rebuilds the stat array

**pg. 18.** A promoted survivor's stats "are increased by one", and then a clause is added for
survivors with more than one stat at zero; the two obvious readings of that contradict each other.

**The ruling is the canonical array for the new Tier.** A promoted Citizen and a created Citizen
are therefore the same character. They keep their existing skills and gain one new slot.

---

## R11 — Which zero is raised is the player's choice, not the app's

**pg. 18.** Decided the other way against v1.25, which left the clause vague enough to break the tie
in code. The published edition is explicit: when a survivor has more than one stat at 0, *the player
chooses which one is raised*.

A T1 → T2 promotion has three zeros and a T2 → T3 has two, so `withTierBought` takes the stat to
raise in exactly those cases and the sheet asks before promoting. T3 → T4 raises every stat, so
there is nothing to ask and nothing to pass.

---

## R12 — "Wounded" and "injured" are one state

**pp. 20–21.** A *wounded* survivor may staff a facility or join a project team, forfeiting healing;
an *injured* one may not join a mission team. If they are one state the rules are consistent and
restrictive; if they are two the book never defines the second.

**The ruling is that they are one state**, which is how the app has always behaved: a survivor below
their maximum Health may staff a facility or join a project team and forfeits healing that turn, and
may not join a mission team.

*Recorded as an open question in `phase-3-stories.md` while the round-one report described it as
implemented. It is settled here.*

### Amendment, October 2026 — R12 reaches 0 Health

[#190](https://github.com/travisboettcher/cr-z-assistant/issues/190) asked whether a survivor
at 0 Health may work at all: `laborPool` counts their Tier and `facilityProduction` their Score,
and nothing in the Planning Phase warns. **They may, and this ruling is why.** 0 Health is below
maximum Health, so it is "wounded" in the sense above, and a wounded survivor may staff a facility
or join the project team, forfeiting healing (pp. 20–21). The book draws no second line further
down, and drawing one here would be this app making up a rule. Nothing changes in the code, and
no new warning is raised.

**The exception is the siege's, and it is narrower.** The FAQ's "Siege Defense and Labor" takes a
survivor *reduced to 0 Health during a siege* off their work for that turn —
[R17](#r17--what-a-siege-defense-does-to-the-turns-work), which is specific to the siege and does
not generalise back into this ruling. Outside a siege, a survivor at 0 Health works like any other
wounded one, and makes their Rot check as well (pg. 22).

**Scavenging is not a mission team**, so R12 says nothing against it either: `scavengingWarnings`
raises no Health warning, and `scavenged` pays a scavenger at 0 Health the full haul. That is
consistent with this ruling and stands. The mission team itself is unchanged — 0 Health is a
wound, and a wounded survivor still may not join one.

---

## R13 — Siege Threat may go below zero — **recorded without a ruling**

Observed at −1 on the Hydroelectric Dam — one staffed facility, nobody on the project team, no base
features, one turn since the last siege, and −3 from a Watchtower with a Long Guns 3 lookout. The
arithmetic is right and the book states no floor, which is the same position as the Rot check target
in R2, so nothing here is a bug.

It is written down because it became newly easy to reach when the Watchtower started subtracting,
and because the number feeds **two** different thresholds that were written for a positive quantity:
the horde roll (d10 + Threat ≥ 16) and the departure test (Unrest + Threat ≥ 10). A negative Threat
therefore makes a community *harder* to send somebody away from, which reads as intended — a
well-watched base is a calmer one — but no rule says so. If a table wants a floor of zero it goes in
`siegeThreat`, in one place, and this becomes a ruling rather than a note.

---

## R14 — Ordering is confined to the Planning Phase

**[#171](https://github.com/travisboettcher/cr-z-assistant/issues/171).** `project/cancelled` was
given a turn-and-phase guard: `cancellable` requires the current turn **and** the Planning Phase.
`project/ordered` got no matching guard, so an order can be placed in the Management Phase — or by
stepping back into the current turn's Advancement Phase — where it can never be withdrawn. The slot
card then reads "Cancelled in the Planning Phase that ordered it" with no Planning Phase left, and
next turn's Planning Phase refuses it on `orderedOnTurn`.

**The book is not neutral here.** There is no equipment ordering anywhere outside Planning Step 2.
Build and trade are project-team activities, and nothing in the seven Management steps touches them.

**The ruling is that ordering is confined to the Planning Phase.** `project/ordered` takes the same
turn-and-phase guard as `cancellable`, and the Management-phase note becomes a blocker. The guard
and its inverse are one decision, so this settles both halves: `cancellable` does not widen.

**What it costs** is a case of the build-anywhere affordance Z3-6 has kept since it was written —
"the walk guides; it does not refuse". That affordance has no textual basis, so the choice here is
fidelity against affordance rather than one reading against another. The alternative — widening
`cancellable` to allow cancelling in the phase that placed the order — would have preserved
something the book never granted.

---

## R15 — Promotion does not heal

**pg. 18, [#173](https://github.com/travisboettcher/cr-z-assistant/issues/173).** Promotion raises
maximum Health through the Tier, and leaves current Health behind: a survivor at 3/3 becomes 3/4.
They are then wounded, and R12 keeps them off a mission team — so a reward benches them. The book is
genuinely silent: promotion says only that stats increase by one and a new skill is learned, and
says nothing about Health.

**The ruling is that promotion does not heal.** Current Health is untouched.

Two structural arguments from inside the book, both pointing the same way. Tier also determines
Inventory Slots, and nobody would read promotion as granting free items to fill the new capacity —
maximum Health is the same kind of Tier-derived ceiling. And the book states starting Health
explicitly when it means to: a rescued stranger "becomes a survivor with Health points equal to
their Tier level." It had the vocabulary and did not use it here.

**What it costs** is the benched-by-a-reward outcome, which is real. But it follows from R12
excluding wounded survivors from mission teams rather than from the promotion rule, and it is
arguably the right flavour: you promoted somebody who was still hurt.

---

## R16 — What resets the turns since the last siege — **CONFIRMED**

**pp. 81, 86.** The tracker used to
read the reset into the siege itself: "turns since" counted from the turn a Siege Defense was
fought, so playing one put the term back to 0 whatever happened on the table. Checked against
the book, that is not where the reset lives. It is a **mission reward**, and it depends on how
the mission ended:

| Mission | Recorded outcome | Turns since the last siege |
|---|---|---|
| Siege Defense (pg. 86) | no zombie left on the mission area | back to 0 |
| Siege Defense | a zombie left and somebody out over the map edge | unchanged — the base is overrun |
| Siege Defense | a zombie left, nobody out | unchanged — no reset is stated |
| Thin the Herd (pg. 81) | no zombie left | back to 0 |
| Thin the Herd | at least one left but fewer than half the starting count, and somebody out over the map edge | halved |
| Thin the Herd | every survivor incapacitated | unchanged, and the next Siege Threat roll succeeds on its own |

**So the counter moves when an outcome is recorded, never because a siege was called or
fought.** The Mission Phase's Play the Mission step records the counts the rule reads — zombies
left, survivors out over the edge, and for Thin the Herd the starting count and whether everyone
went down — as a `siege-defense-resolved` or `thin-the-herd-resolved` log entry, and
`turnsSinceLastSiege` folds the recorded outcomes in order. Nothing is stored beside them, so a
reader is never one field away from disagreeing with the log. Schema v12.

**Halving rounds down**, which the book does not say. The counter is a whole number of turns
added to a d10 and to Unrest, neither of which has a half; rounding down is the plain reading of
halving a count, and the only one that never leaves the counter above half of what it was. "Fewer
than half" is strict: 3 left of 6 is half, and halves nothing.

**The September playtest bug stays fixed** ([#103](https://github.com/travisboettcher/cr-z-assistant/issues/103)).
It was Departures at step 7 testing a lower pressure than Check the Horde had rolled against at
step 6, because calling a siege collapsed the term. Outcomes are recorded in the Mission Phase,
and nothing in the Management Phase writes one, so nothing between step 6 and step 7 can move the
term. `siege.test.ts` still pins that.

**"The next mission is automatically a Siege"** after an all-incapacitated Thin the Herd is
built as the book words it: the next Check the Horde calls the siege whatever the roll, and the
existing `horde-checked` entry carries it into the next turn's Mission Phase. The roll is still
entered and logged, because it is still the table's.

**What is left to a later phase.** An overrun base's three ways on — rebuild through Claim a New
Base, restart through Start a New Community, abandon the survivors — are named on screen and not
run: two are missions and one ends the campaign, all Phase 4's. A clean siege's other reward, a
point of Labor for each project-team survivor next turn, is not applied yet. A Siege Defense the
horde did not call (the Regional Firehouse's `ring-the-bell`) cannot be recorded until mission
selection exists. And a campaign migrated from v11 counts from turn 1: its log records the
sieges it fought and never how they ended, and inventing a clean ending for them would be
writing history.

*Written as `phase-3-stories.md` ruling 9 by
[#175](https://github.com/travisboettcher/cr-z-assistant/pull/175), on a branch cut before this
registry existed, and moved here with its text unchanged.*

### Amendment, October 2026 — the clean siege's Labor is applied

[#183](https://github.com/travisboettcher/cr-z-assistant/issues/183) applies the reward the
paragraph above left for later: a point of Labor for each survivor on the project team, the
campaign turn after a Siege Defense that left no zombie standing. Which turn that is, is the
book's answer rather than a ruling, and is recorded with the Phase 3 decisions.
What a Siege Defense does to the work of its own turn is
[R17](#r17--what-a-siege-defense-does-to-the-turns-work).

---

## R17 — What a Siege Defense does to the turn's work

**pg. 23, pg. 85, the FAQ entry "Siege Defense and Labor";
[#183](https://github.com/travisboettcher/cr-z-assistant/issues/183).** Projects and staffed
facilities keep running through a siege, but a survivor *reduced to 0 Health during it* contributes
neither Labor nor skills *that turn*: their Labor leaves the project team and their facility goes
unstaffed. The book does not say which of the app's phases "that turn" reaches, the outcome it has
the table record does not say who went down, and pg. 85 deploys every survivor to the fight, which
reads at first as leaving nobody at the base to keep anything running.

**Everybody fights; the base keeps working; the two are different questions.** A Siege Defense is
fought at the base, so deploying everybody takes nobody off their post. Who *fought* is `deployed`
(the whole community, for the mission's XP — #167) and who *worked* is the standing assignments.
Neither reads the other.

**The work a siege interrupts is the previous Planning Phase's.** Assignments made in Planning N
stand until Planning N + 1 clears them (pg. 20), and turn N + 1's Advancement Phase settles that
work: what the facilities make, what a Clinic heals, what a Training Room teaches, and the projects
the team's Labor paid for. A siege in turn N + 1's Mission Phase falls before all of it. So a
casualty's skills come out of production, healing and Training Room XP that turn, and their Labor
comes off the pool that paid for last turn's orders — which can leave one of them unpaid for, and
the player picks which goes unfinished, exactly as for a departure (pg. 23). That is the one Labor
shortfall that reaches back a turn, and it can because the siege is fought before this turn's
Planning Phase reassigns the team. Turn N + 1's own Planning Phase assigns new work after the siege
and is not affected.

**"Reduced to 0 Health during the siege" reads as "at 0 Health once the siege's outcome is
recorded", for a survivor holding a work task.** Wounds reach the campaign through a Health
correction that is deliberately not logged, so there is no record of *when* anybody went down. Read
live, so correcting a survivor's Health on the roster puts them back to work.

**A substitute takes one casualty's place.** Because no ordinary mission went out, the mission
team's survivors who are not at 0 Health may substitute (pg. 23, the FAQ) — "the mission team"
being the one the previous Planning Phase assigned to the mission the siege displaced. The book
does not say whether a substitute fills a casualty's place or may be put to any work at all. The
ruling is the first: "substitute" is standing in for somebody, so a stand-in takes exactly one
casualty's task — their facility, or their seat on the project team — and brings their own Tier and
Scores to it. A facility nobody fell from, or one that was never staffed, is not theirs to work.
The choice is made in the Mission Phase once the outcome is recorded, before anything it changes
has been settled, and kept in the log (`stood-in`) rather than in the assignments, because this
turn's Planning Phase clears those and the Advancement Phase behind it still has to read who stood
in. The latest entry for a casualty is the choice, so it can be changed or taken back.

**The utilities a Station's staff generated stand.** They were generated and assigned at Planning
Step 1, before the siege, and last until the next Planning Phase (pg. 20, 67) — the same reason a
hunger penalty arriving later in a turn revokes no point (#169). Supply is worked out from the
staffing as assigned; only work done after the siege asks who could still do it.

**What it costs.** A survivor who was *already* at 0 Health before the siege — wounded, still
working because R12 allows it, holding on through Rot checks — counts as a casualty too, because the
campaign cannot tell the two apart. That is defensible (pg. 85 sent them into the fight as well) and
not provable. Health entered before the outcome is recorded counts the same as Health entered after
it. And a siege fought but not yet recorded takes nobody off work; the walk already names an
unrecorded siege as outstanding. The mission's own pools — the Teaching on the mission and the
substitutions a haul can be forced with — stay with everybody who fought, because the FAQ's sentence
is about the base's work. The one-for-one reading of a substitute is the narrower one: a table that
reads the FAQ as freeing the mission team to work anywhere gets less from it here, and the
widening would be `whoWorked` adding stand-ins to a post rather than swapping them into one.

---

## R18 — What Infection incapacitates

**pp. 22–23, 123, [#176](https://github.com/travisboettcher/cr-z-assistant/issues/176).** Under
the Viral origin a survivor at 10 Infection is incapacitated whatever their Health (pg. 123). The
community rules were written with one way down — 0 Health — and three of them ask about it: who
makes a Rot check (pg. 22), who can be chosen at Departures (pg. 23), and who is fit for a mission
team. The origin chapter does not go back through them, so whether "at 0 Health" in each one
means *Health* or means *down* is not settled by the text.

**The ruling is that it depends on what the rule is about.** `isDown` in `src/engine/survivor.ts`
answers "at 0 Health or at 10 Infection", `outOfHealth` answers "at 0 Health", and each reader
asks the one it means:

| Rule | Reads | Why |
|---|---|---|
| Check for Rot (pg. 22) | `outOfHealth` | It names Health, and is about somebody bleeding out. A survivor kept down by Infection with Health left has not been brought to 0, and Heal Wounds can still take the Infection away. |
| Departures (pg. 23) | `isDown` | The exclusion is about being in no state to walk anywhere, which pg. 123's incapacitation is exactly. Where that is everybody, nobody is leaving and the turn owes no Departures step ([#192](https://github.com/travisboettcher/cr-z-assistant/issues/192)). |
| Siege casualties and stand-ins (FAQ, [R17](#r17--what-a-siege-defense-does-to-the-turns-work)) | `outOfHealth` | The FAQ names "reduced to 0 Health" for who stops working and "not at 0 Health" for who may substitute. |
| Mission team | both, separately | 0 Health is a wound, and R12 already keeps every wounded survivor off a team; 10 Infection adds its own warning, because full Health does not make an incapacitated survivor fit. |

**Infection below 10 is not a wound.** R12's "wounded" is Health below its maximum, so a survivor
at full Health and 9 Infection may join a mission team, and one at 3/4 Health and no Infection
still may not. Nothing about R12 changes.

**Heal Wounds counts a point as one a survivor "would receive" if they have a use for it** — a
wound, or Infection it could remove instead (pg. 19, 123). The equal share is measured against
that (`need` in `healing.ts`), so a survivor at full Health with Infection takes a share like
anybody wounded, and their points can only go on Infection. Read strictly, a survivor at full
Health would receive no Health at all, and a survivor down on Infection with Health left — the
case [#176](https://github.com/travisboettcher/cr-z-assistant/issues/176) was opened for — could
never be helped by the Clinic. The same holds for a resting survivor's own point, which is a
Health point received like any other. Healing and resting no longer warn "already at full
Health" about a survivor with Infection to clear.

**Health comes first unless the player says otherwise.** Each award opens with its points on
Health and only what Health cannot hold on Infection; the step then offers the rest of the split
point by point. The book's "may instead" makes the trade an option, so the default is not taking
it — and it is what every campaign that is not Viral has always done.

**What it costs.** A survivor at 10 Infection with Health left faces no Rot check and cannot
turn at the base, which may be gentler than the book means. If it is, the place to say so is the
Viral origin's own Infection check, which `src/data/dice.ts` records against pg. 22 and which
nothing builds yet — not the Rot check, whose wording is about Health.

**Left open:** the turning survivor's bite at Check for Rot adds no Infection. It is a zombie's
damage, which is what pg. 123 says adds it, but it lands at the base rather than on a mission,
and the tracker has no mission to compare it with. Recorded so that it is not mistaken for a
decision.

---

## R19 — Missions in one turn are independent

**pp. 17–19, 21; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** Mission
teams "can be split between any number of mission teams, so more than one mission can be completed
during the next campaign turn" (pg. 21). The book does not say in what order a turn's missions are
played, or whether the result of one reaches another — a vehicle driven off, a base claimed
mid-turn — and the Advancement Phase is written for one mission ("the previous mission").

**The ruling is that each outcome applies on its own, and none is read by another in the same
turn.** What the Advancement Phase gathers from them is gathered across all of them: mission XP is
a point for every survivor on every team, the discretionary point is still one per turn (pg. 18,
literal), and the material roll is once per material recovered, from every mission together
(pg. 19, derived).

**What it costs.** A table that plays its missions in sequence and lets the first change the
second — a Claim a New Base whose new base the next team leaves from — gets no help from the
tracker in doing so. The record does not forbid it; it just does not model it.

---

## R20 — One Claim a New Base per turn

**pp. 75, 78–79, 21; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** Any
standard mission may be attempted at any time but the Siege Defense (pg. 75), and nothing forbids
two teams choosing the same one. Two successful Claims in one turn would claim two bases at once,
which the book never describes: a community has one base, and Claim a New Base replaces it
(pg. 79).

**The ruling is that a second Claim a New Base in the same turn is refused when it is selected.**
Every other mission may be chosen by more than one team.

**What it costs.** A table that wants two teams scouting two candidate bases in one turn cannot
record it. The narrower ruling was picked because the wider one needs an answer — which base
wins — that the book does not give.

---

## R21 — A failed First Mission is played again in turn 1

**pp. 76–77; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** The First
Mission fails when no survivors are left in the mission area, and the community "may retry with
new or the same survivors, or changed difficulty" (pg. 77). The book does not say whether the retry
is the same campaign turn — but a community without a base has no turn 2 to play it in: every
later phase reads the base.

**The ruling is that a First Mission outcome that met no end condition leaves Select Mission open
in turn 1, and the next selection is the First Mission again.** Each attempt is its own selection
and outcome on the record, so the history shows the failure rather than hiding it.

**What it costs.** Nothing the book says, as far as the extract goes; recorded because it is a
decision about turn structure the text leaves implicit.

---

## R22 — What a failed Rare Goods Trader loses

**pg. 84; recorded ahead of Phase 5.** Rare Goods Trader's rewards read two ways. One bullet says
that if nobody exits, "the items on the trade list are marked off; return the untraded
materials"; the next says "all traded items and materials are lost".

**The ruling is that traded items and the materials paid for them are lost, and materials set
aside for items not yet traded go back to storage.** It is the reading that lets both bullets be
true at once: the second is about what was traded, the first about what was not.

**What it costs.** A stricter table loses everything set aside. Nothing builds this until the trade
itself arrives with equipment in Phase 5; it is recorded now because #178's outcome entry for the
mission carries the one field it reads.

---

## R23 — Which mission team Exhaustion counts — OPEN

**pp. 21, 23; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** Exhaustion
above "the mission team" takes one survivor off it (pg. 23). Since Z4-2 the Planning Phase splits
the mission survivors between several teams (pg. 21), so there may be more than one team for the
rule to mean.

**Open.** Until it is ruled, `overworked` counts **every survivor on any mission team together**,
which is what it has always counted, and the survivor taken off may come from any team. The
alternatives are to compare Exhaustion with each team separately, or with the largest. Recorded so
that the current reading is not mistaken for a decision.
