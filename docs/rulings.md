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

R51–R81 are the batch-17 extract's R50–R80, one number up: the October 2026 check against the
book took R50 for the ultralight backpack while the extract was being recorded.

Rulings that are still open are marked **OPEN**. They are recorded rather than settled quietly,
which is the point of the registry — a question nobody has answered looks exactly like a question
nobody noticed, unless it is written down.

Rulings marked **PROPOSED** are written ahead of the work that needs them and await confirmation;
nothing in the code cites one until it is confirmed.

Two more markers open an entry's body rather than its heading, so the heading's link stays put.
Rulings marked **Settled by** a source turned out, on a check against the printed book and the
Errata & FAQ sheet (October 2026), to be answered there. They keep their numbers, because code and
documents cite them, but they are no longer rulings: each says what the source establishes and
where. FAQ entries are cited by their title in quotes, since the sheet has no page numbers; errata
as "Errata, pg. N", N being the rulebook page corrected.

Rulings marked **Under review** were found by the same check to conflict with the book or the FAQ.
The entry still describes what the app does today, and links the issue that will change it.

R50 was assigned by that check, for a question it found that no ruling covered.

---

## R1 — The hunger penalty is a starvation threshold, not a hunger tax

> **Under review, [#215](https://github.com/travisboettcher/cr-z-assistant/issues/215).** FAQ "Hunger and Population" confirms the threshold, and FAQ
> "Hunger Penalty" confirms that stats alone take it and floor at zero. But that entry's worked
> example implies a penalty larger than `Hunger − population` can ever reach, so the *size* below
> is expected to change. The issue holds the proposed reading; nothing changes until it is decided.

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

**Left unclamped**, on the grounds that the natural-1 rule (pg. 5) already stops it becoming a
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

**Settled by pp. 61, 67, 71.** The Distillery's built-in station makes the Water of a Utility Station with two
Rain Collectors (pg. 61). A Rain Collector is an upgrade that makes 1 Water (pg. 71), and upgrades
produce without staff (pg. 67), so the station makes 2 Water unstaffed. A Utility Station's own
production is skill-named and still needs somebody in it.

Cited from `src/engine/production.ts`. `flatUtilitiesGenerated` had always counted it, so the base
sheet showed the 2 Water while the slot card said the facility produced nothing — one ruling read
in two places, which is what this registry is for.

---

## R5 — The Herb Plot has no per-Garden limit

**Settled by pp. 67, 68.** Any upgrade may be built more than once, each copy counting toward the cap of three
(pg. 67); only the Fence and the Greenhouse are limited to one per Garden (pg. 68).

**Unlimited, by the book.** That opens a real build rather than an oversight: a watered Garden with
a Fence and two Herb Plots yields 2 Food and 2 Health a turn, and three Herb Plots trade the
Garden's Food away entirely for 3 Health. Anything that enforces the upgrade cap must not quietly
add a limit here.

---

## R6 — A set of Restraints works once per turn

**pg. 69 (the text), pg. 72 (the table); [#119](https://github.com/travisboettcher/cr-z-assistant/issues/119).** "Each set
prevents one turned survivor from biting" gives a count and no duration.

**The ruling is per turn:** a set holds one survivor each night rather than one ever. The
alternative — a set used up the first time it works — would make the upgrade worth buying once and
worth nothing afterwards, which no other upgrade in the book behaves like, and the book calls it
equipment bolted to a Clinic rather than a supply. Counted off the log, so two sets hold two
survivors in one turn and no more.

The pages were narrowed in October 2026: the upgrade's text is on pg. 69 and its row on pg. 72.
Earlier transcriptions cited pg. 73 and the spread pp. 72–73.

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

> **Settled by pg. 12.** A Teacher on the team replaces the discretionary point; the Teaching Score
> only sets how many survivors then get a point, so a Score of 0 replaces the point and hands out
> none. That is the ruling below, so `canTeach` stays the trigger. The reasoning is kept as written.

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

## R9 — How broadly the Utilities substitution applies

> **Settled by Errata, pg. 12, and pg. 19; [#218](https://github.com/travisboettcher/cr-z-assistant/issues/218).**
> The Errata corrects the skill: a Utilities use forces Fuel, as Rationing forces Food and
> Mechanics Hardware. A material roll of 10 is a Rare Item Table roll (pg. 19), so a forced roll is
> always a material and never a 10.

**pg. 12.** Before the Errata, Rationing was locked to Food and Mechanics to Hardware, but Utilities
read as forcing any material — including, perhaps, a 10 and a Rare Item Table roll.

**The answer is that Utilities forces Fuel and nothing else**, and no skill forces a 10.

**What it costs.** Nothing now: the app follows the Errata. Utilities uses spent on Food or Hardware
before the change were the app's error, and the log never recorded which skill forced a roll.

*Decided 2026-10-14, for #177 part 2, as Food, Fuel or Hardware; superseded the same day by the
Errata (#218).*

*Previously `phase-3-stories.md` ruling 4.*

---

## R10 — Tier promotion rebuilds the stat array

**pg. 18.** A promoted survivor's stats "are increased by one", and then a clause is added for
survivors with more than one stat at zero; the two obvious readings of that contradict each other.

**The ruling is the canonical array for the new Tier.** A promoted Citizen and a created Citizen
are therefore the same character. They keep their existing skills and gain one new slot.

---

## R11 — Which zero is raised is the player's choice, not the app's

**Settled by pg. 18.** Decided the other way against v1.25, which left the clause vague enough to
break the tie in code. The published edition settles it: when a promoted survivor has more than one
stat at 0, the player picks which zero is raised.

A T1 → T2 promotion has three zeros and a T2 → T3 has two, so `withTierBought` takes the stat to
raise in exactly those cases and the sheet asks before promoting. T3 → T4 raises every stat, so
there is nothing to ask and nothing to pass.

---

## R12 — "Wounded" and "injured" are one state

> **Settled by FAQ "Wounded Survivors and Assignments".** The FAQ uses the one word, wounded, for
> both rules: a wounded survivor may not join a mission but may staff a facility or join the project
> team, and regains no Health unless assigned to healing. So the book's two words are one state, as
> below.

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

**The exception is the siege's, and it is narrower.** pg. 23, under Check the Horde, and FAQ
"Siege Defense and Labor" take a
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
and the Watchtower is not the only way below zero: the Curtain Wall takes 3 off every turn (pg. 63),
and each Spotlight 1 (pg. 71). The book sets no floor (pg. 23). It is also written down because the
number feeds **two** different thresholds that were written for a positive quantity:
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
FAQ "Used Hardware and Storage Limits" agrees: Hardware is spent in the Planning Phase.

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

### Amendment, October 2026 — the outcome records who went down

[#178](https://github.com/travisboettcher/cr-z-assistant/issues/178)'s Z4-4 has every mission
outcome carry its team's Health at the end, and Infection in a Viral campaign
([`phase-4-stories.md`](phase-4-stories.md#z4-4--wounds-on-the-outcome)). A siege's team is the
whole community (pg. 85), so a Siege Defense recorded since then says who it left at 0 Health, and
the reading above changes with it: **"reduced to 0 Health during the siege" is at 0 Health in this
turn's recorded Siege Defense outcome, for a survivor holding a work task.** A survivor it recorded
at 0 stays a casualty when their Health is corrected back up on the roster afterwards — the
correction repairs the roster, and the entry is what happened — and one it recorded with Health
left is not a casualty whatever the roster says now. Recording the outcome sets the roster to the
same values, so the two agree unless somebody corrects one of them.

**The stand-ins read the same record.** "Not at 0 Health" for who may substitute is read off the
same entry, because the FAQ's two halves are one question about one moment: who the siege left at
0 Health stops working, and who on the displaced mission team it did not may stand in. Reading one
half off the record and the other off the roster would let a survivor be a casualty and fit to
substitute at once.

**Entries written before this carry no Health, and keep the old reading**: at 0 Health on the
roster now, once the outcome is recorded, so a roster correction still puts them back to work.
The fallback is per survivor, so the one way a newer entry can leave somebody out — a hand-edited
save — reads them the old way rather than not at all. The Siege Work panel says which of the two
it is following.

**What it still costs.** The entry records Health at the end, not Health lost, so a survivor who
was *already* at 0 Health before the siege ends it at 0 and is still counted as a casualty; that
part of the cost above is unchanged. What goes is the other one: on an entry with Health, a
correction made after the outcome no longer changes who fell. Which question is asked of the
value is unchanged too — `outOfHealth`, per
[R18](#r18--what-infection-incapacitates), so a survivor recorded at 10 Infection with Health
left is not a siege casualty.

---

## R18 — What Infection incapacitates

> **Under review, [#219](https://github.com/travisboettcher/cr-z-assistant/issues/219).** pg. 21 lets only survivors below maximum Health be assigned to
> rest or healing, and pg. 19 gives Health points only to those assigned. So the Heal Wounds
> paragraph below is wrong about a survivor at full Health with Infection: they take no share and no
> resting point. A survivor down on Infection with Health below maximum can still be helped by the
> Clinic. The Rot row stands, now on pp. 22 and 123: the ordinary Rot check is unchanged, and
> Infection has its own Viral check, which is unbuilt.

**pp. 19, 21, 22–23, 123, [#176](https://github.com/travisboettcher/cr-z-assistant/issues/176).** Under
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
| Siege casualties and stand-ins (FAQ, [R17](#r17--what-a-siege-defense-does-to-the-turns-work)) | `outOfHealth` | The FAQ names "reduced to 0 Health" for who stops working and "not at 0 Health" for who may substitute. Asked of the Health the siege's outcome recorded where it has one (R17's October 2026 amendment), and of the roster's otherwise. |
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

**pp. 17–19, 21; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** The
mission survivors may be split into any number of teams, each completing its own mission in the
same turn (pg. 21). The book does not say in what order a turn's missions are
played, or whether the result of one reaches another — a vehicle driven off, a base claimed
mid-turn — and the Advancement Phase is written as though there were one mission.

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
Mission fails when no survivors are left in the mission area, and the community may then try it
again (pg. 77). The book does not say whether the retry
is the same campaign turn — but a community without a base has no turn 2 to play it in: every
later phase reads the base.

**The ruling is that a First Mission outcome that met no end condition leaves Select Mission open
in turn 1, and the next selection is the First Mission again.** Each attempt is its own selection
and outcome on the record, so the history shows the failure rather than hiding it.

**What it costs.** Nothing the book says, as far as the extract goes; recorded because it is a
decision about turn structure the text leaves implicit.

---

## R22 — What a failed Rare Goods Trader loses

**pg. 84; recorded ahead of Phase 5.** Rare Goods Trader's rewards read two ways. When nobody exits,
one bullet returns the materials of items not yet traded, and the next loses every traded item and
its materials.

**The ruling is that traded items and the materials paid for them are lost, and materials set
aside for items not yet traded go back to storage.** It is the reading that lets both bullets be
true at once: the second is about what was traded, the first about what was not.

**What it costs.** A stricter table loses everything set aside. Nothing builds this until the trade
itself arrives with equipment in Phase 5; it is recorded now because #178's outcome entry for the
mission carries the one field it reads.

*Confirmed 2026-10-14 from the batch-17 extract (R61): one survivor exiting is enough, partial exits
make no difference, and traded items arrive when the mission ends.*

---

## R23 — Which mission team Exhaustion counts

**pp. 21, 23; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** Exhaustion
above "the mission team" takes one survivor off it (pg. 23). Since Z4-2 the Planning Phase splits
the mission survivors between several teams (pg. 21), so there may be more than one team for the
rule to mean. The FAQ and errata say nothing, and Exhaustion appears nowhere else in the book.

**The ruling is that "the mission team" is every team together, and the survivor taken off may
come from any of them, at the player's choice.** Pg. 21 defines "the mission team" as everybody
going out to the next mission before it says they may be split into teams, and pg. 23 uses the
singular throughout, so the whole group is the better-supported reading — derived, not stated.
It is what `overworked` has always counted, so nothing in the code moved.

**What it costs.** A table that reads pg. 23 per team gets a lighter penalty than it would here
for a community that splits, since one large count is crossed sooner than several small ones are
compared. Recorded with the literal oddity the extract flagged and the code already follows: the
penalty applies only when Exhaustion is **higher than** the number on the team, not equal to it.

*Settled 2026-10-12 from the batch-14 extract; open until then.*

---

## R24 — A rescued stranger is never a Hero

**pp. 7, 15, 31, 54, 76–84, 124; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178),
Z4-5.** A stranger's Tier is set by the mission's own setup (pg. 15), and no standard mission's
setup places a Tier 4 stranger — the highest is a Leader. Pg. 7 says a Hero is never recruited in
the field, and a rescued stranger is the book's field recruit (pg. 15). Two rules bring an
*existing* Hero back as a stranger — one who left over the Hero cap (pg. 54), and a Lost survivor
under the Cosmic Horror origin (pp. 25, 124) — and read literally they sit uneasily with pg. 7.

**The ruling is that a mission outcome records strangers of Tier 1 to 3 only, and a rescued
stranger is always built as a field recruit.** Pg. 7 forbids *creating* a Hero by rescue; the two
exceptions return a character who already exists, which is not something a mission outcome's Tier
can describe. They arrive with the base-move work of #182 and the origins of Phase 7, as the same
character rather than a new one. The outcome guard refuses a Tier 4 stranger, and the Tactical
Mission form offers Tiers 1 to 3.

**What it costs.** A table that wants to bring back a departed Hero through a mission cannot record
it until those stories are built.

*Settled 2026-10-12 from the batch-14 extract. Until then a Tier 4 stranger was accepted and joined
as the roster adds a Hero, which this replaces.*

### Amendment, October 2026 — a Hero set aside comes back as themselves

With [R31](#r31--abandoned-survivors-and-a-hero-sent-away-are-set-aside) and Z4-11, a Rescue
Strangers outcome may name survivors set aside — a Hero sent away over the cap among them — whom it
brought back. They are not strangers of a Tier: they are the same characters, and rejoin with the
sheet they left with. So the outcome's strangers stay Tier 1 to 3, as this ruling says, and a
returning Hero is the one Tier 4 a mission records, by name. A rescuer below their Tier is warned
about, as for any stranger (pg. 31).

---

## R25 — When the community moves in

**pp. 17, 19–20, 26, 79; [#182](https://github.com/travisboettcher/cr-z-assistant/issues/182),
Z4-8.** A won claim makes that turn's Advancement Phase the community's first turn in the new base
(pg. 19; derived from the turn order, pg. 17). The book never says which base the work settled in
that phase belongs to — the Training Room's XP, staff production, the Clinic's healing, and the
projects ordered in the last Planning Phase — and its one hint, carrying the old Inventory after
production at Step 3, says what the old base produced is kept rather than lost.

**The ruling is that the community moves in at the end of the Advancement Phase.** Everything the
last Planning Phase assigned was assigned in the old base and settles there, including the
projects, which are built into the old building and left behind with it. The Hardware they cost is
not refunded: it was spent when they were ordered (pg. 21; FAQ "Used Hardware and Storage Limits").
The first Planning Phase is the new base's. The old base's stores come along with the community
(FAQ "New Bases and Materials").

**What it costs.** The extract's own suggestion landed a due project in the new base when an empty
slot fits it. That needs the player to re-aim each order at a slot of a different layout, and
reads less consistently with facilities staying behind; a table that wants it loses a turn's
building on the move.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R26 — A claim is always a new building

**pp. 78, 86; #182, Z4-8.** Claim a New Base may claim any base type, including the one already
held (pg. 78); the book speaks of "the same base type" only for the overrun (pg. 86).

**The ruling is that a normal claim of the type already held is a new building**: its own
built-ins, empty slots, and the old base's facilities and upgrades left behind, exactly as for any
other type. Only the overrun's same-type reclaim (R29) recovers anything of the old one.

**What it costs.** Nothing the book says; a table that reads the same type as "the same building"
would have nothing to claim.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R27 — The overrun continuation is played in the same Mission Phase

**pp. 23, 26, 86; #182, Z4-9.** The book gives three ways to go on from an overrun base but no time
to take them, and says nothing about a community with no base through an Advancement, Planning or
Management Phase: no production, beds, caps or Siege Threat. Missions that chain say so (pp. 90,
113), and this one does not, which weakly suggests it is not chained. Pg. 26 returns to the
Advancement Phase after a mission unless the community has a further mission planned for the
turn.

**The ruling is that the choice is made when the Siege Defense outcome is recorded, and the
mission it leads to is that further mission, played in the same Mission Phase** — Claim a New
Base, or the First Mission for starting over and for a new community. The turn then goes on from
the Advancement Phase in the base the continuation won.

**What it costs.** It reads against the weak hint, and a table that plays the continuation next
turn will record it a turn early. The extract's alternative — next turn's forced mission, with the
overrun base kept as a shell meanwhile — needs the app to invent what a shell produces, sleeps,
stores and draws from the horde, which this ruling never has to answer.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R28 — A failed continuation leaves the choice open

**pp. 77, 79, 86; #182, Z4-9.** A failed claim leaves the community in the base it has (pg. 79),
which after an overrun is the overrun base. The book does not say what then; the First Mission's
failure lets the community try again (pg. 77).

**The ruling is that a continuation that meets no end condition leaves the overrun choice open
again in the same turn**: the player may try the same option again or take another, as R21 does
for the First Mission.

**What it costs.** Nothing caps the retries, as nothing caps R21's.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R29 — What a claim after an overrun recovers

**pp. 19, 54, 86; FAQ "New Bases and Materials"; #182, Z4-9, Z4-10.** Half the stored materials, and a free rebuild of what
was destroyed, are given for the same base type on the same map (pg. 86). For any other claim the
book is silent, and its normal transfer (pg. 19, FAQ) would give everything, which makes the half
rule mean nothing unless an overrun replaces the transfer.

**The ruling is that after an overrun a different base type, or a different map, recovers no
stored materials and no free rebuild; the same type on the same map recovers half, rounded down,
and its free rebuild covers every facility and upgrade the player had added, waives the Hardware
only, and lasts until it is used.** Built-ins were never destroyed (pg. 54).

**"Upgrades" is read as everything the player added.** pg. 86 says the overrun destroys the base's
*upgrades*, and the free rebuild restores them. This ruling reads that word as the facilities the
player built as well as their upgrades, so both are destroyed and both are rebuilt free. That is a
reading, not the text: the narrower one leaves player-built facilities standing on a reclaimed
same-type base, with only their upgrades lost.

**What it costs.** Rounding down is the app's, chosen to match how the siege counter is halved
(R16); the book does not say. FAQ "New Bases and Materials" says every base after the first receives
the previous base's materials, vehicles, weapons and equipment, with no exception for an overrun. A
table that takes that as governing keeps everything on a different type. The ruling stands because
if everything transferred anyway, pg. 86's half for the same type and map would mean nothing.

*Confirmed 2026-10-13 from the batch-15 extract.*

### Note, October 2026 — Rare is in the stores

Built with Z4-9. The app keeps Rare as a count in the same stores as Food, Fuel and Hardware, so
the half recovered, and the nothing recovered, apply to it as to the other three — and so does R30's
loss of the old stores. The book's Rare Items are items rather than materials, and items arrive with
the Inventory in Phase 5; until then, this is what the stores hold.

*Superseded by R49 (schema v17): Rare is no longer a material, and the stores hold Food, Fuel and
Hardware only.*

### Note, October 2026 — the reclaimed building keeps its cleared rubble

Built with Z4-10. A claim on the overrun base's own map is the same building, and the book destroys
its upgrades — what the player added — not the work that cleared a blocked slot. So a slot cleared
before the overrun stays cleared, and everything else starts as the layout has it. The other
reading, a slot full of rubble again, would also hand back the materials clearing yields a second
time. Every other move is a new building, with every slot as its layout has it (R26).

---

## R30 — Start a New Community after an overrun

> **Under review, [#216](https://github.com/travisboettcher/cr-z-assistant/issues/216).** FAQ "New Bases and Materials", pg. 19 and pg. 54 agree that only
> a campaign's *first* base starts full, and starting over continues the campaign (pg. 86). So "stocked
> to its caps as a first base does" below contradicts the text. What the new base gets instead (the
> old stores in full, or nothing) is the decision the issue holds. The counters carrying on stands.

**pp. 19, 76–77, 86, FAQ; #182, Z4-9.** Starting over uses the remaining survivors and their gear
(pg. 86) and says nothing of storage. A campaign's first base arrives full (pg. 19, FAQ), but this
is a way to continue the campaign rather than a new one.

**The ruling is that the old storage is lost, the new base arrives stocked to its caps as a first
base does, and the turn and siege counters carry on as they stand.** The First Mission is every
community's first (pg. 76), and the survivors are starting one from nothing. The counter's reset
and halving are written for victories only (pp. 81, 86), so an overrun leaves it alone.

**What it costs.** A table that reads "continue this campaign" strictly starts the new base empty,
which is a much harder opening.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R31 — Abandoned survivors, and a Hero sent away, are set aside

> **Partly under review.** "The new base is stocked as R30's" follows R30, which is under review
> ([#216](https://github.com/travisboettcher/cr-z-assistant/issues/216)). The rest of this ruling stands.

**pp. 7, 31, 54, 82–83, 86; #182, Z4-8, Z4-11.** Two rules take a survivor out of the community
without killing them: the Hero sent away when a move lowers the cap (pg. 54), and the survivors
abandoned after an overrun (pg. 86). Both may come back as a stranger — the abandoned ones in the
next Rescue Strangers mission, with their experience and Inventory — and the book keeps no record
of either.

**The ruling is that both are *set aside*: off the roster and out of every count, kept on the
record as they were, and able to be named on a later Rescue Strangers outcome, where they rejoin
as themselves and the rescuer's Tier must be at least theirs (pg. 31).** Abandoning builds a new
starting community in the same campaign, which plays the First Mission as R27's continuation; the
origin, the log and the turn and siege counters carry on, and the new base is stocked as R30's.
A set-aside Hero is the one Tier 4 stranger a mission records, which amends R24.

**What it costs.** Pg. 54 also lets a Hero who left start the player's next campaign; that is a
new campaign's business, and nothing here stops it.

*Confirmed 2026-10-13 from the batch-15 extract.*

---

## R32 — One Hero leaves for each Hero over the cap

**pg. 54; [#182](https://github.com/travisboettcher/cr-z-assistant/issues/182), Z4-8.** A
community that moves into a lower-Tier base with more Heroes than it can support loses a Hero of
the player's choice (pg. 54). The book speaks of one Hero, and never of a community more than one
over — three Heroes moving into a Tier 1 base.

**The ruling is that one Hero of the player's choice leaves for every Hero over the new base's
Tier**, all at the move, so the community is never over the cap afterwards. Each is set aside
(R31).

**What it costs.** A table that reads the singular literally sends one Hero away and keeps the rest
over the cap, which the app would then report as a violation every turn.

*Confirmed 2026-10-13.*

## R33 — A turn that ends with no base warns rather than refuses

**pp. 54, 76–77.** A community's first base is what turn 1's First Mission, Start a New
Community, claims. The book has no case of a turn ending without one, so it says nothing of what
should happen if a table moves on without recording the claim — and the app lets a base be claimed
at any point, so it is easy to walk the whole of turn 1 without one.

**The ruling is that ending a turn with no base claimed is a warning in the End-turn dialog, and
never a refusal.** It is owed at the Play the Mission step, where the First Mission is played. The
walk guides rather than gates (Z3-3), and a table entering a campaign part-way through may have
reasons the app cannot see.

**What it costs.** A table can still press through the warning and play turn 2 with nowhere to
build, staff or sleep, and every base-dependent number reads as zero until a base is claimed.

*Decided 2026-10-13.*

---

## R34 — Quality gear is built from the tables

> **Under review, [#217](https://github.com/travisboettcher/cr-z-assistant/issues/217).** pg. 37 limits quality weapons to the Rare Goods Trader, and the
> missing quality trade cost on pg. 41 and the Quality Item subtable (pg. 43) both support it. The
> proposed narrower ruling: quality weapons are found or traded only, and quality equipment,
> protective gear and disposables are built as below. Nothing changes until it is decided.

**pp. 37, 41–43; [#177](https://github.com/travisboettcher/cr-z-assistant/issues/177).** Pg. 37
says quality weapons come only through the Rare Goods Trader, but the cost tables on pp. 41–42 print
a quality build cost for every weapon and for most equipment and protective gear, and the Rare Item
Table's Quality Item subtable sells quality weapons too (pg. 43).

**The ruling is that quality gear can be built at the costs the tables print**, at the same Labor
as standard, as well as found or traded. A printed cost is a number the table gives; a reading that
made every quality column unusable would be throwing data away.

**What it costs.** A table that follows pg. 37 literally never builds a quality weapon; under this
ruling a community with the Hardware has them sooner.

*Confirmed 2026-10-13 from the batch-16 extract.*

---

## R35 — A carried shoddy item takes its slot

**pp. 9–11, 14, 37–38; #177, Z5-2, Z5-4.** Shoddy gear is free and always available to a survivor
with the skill that uses it, and every weapon takes one Inventory Slot (pg. 38). The book does not
say whether the shoddy one does too; Earl's worked sheet lists his shoddy axe among his items
(pg. 14).

**The ruling is that a shoddy item a survivor carries takes its slot like any other.** It is
chosen at Equip Mission Team, costs nothing, and never enters or leaves the base Inventory: there
is always another.

FAQ "Dual Wield" points the same way: two weapons take two slots.

**What it costs.** A survivor with several weapon skills chooses which shoddy weapons to carry,
rather than carrying them all for free.

*Confirmed 2026-10-13 from the batch-16 extract.*

---

## R36 — A backpack takes a slot

> **Settled by pg. 44; [#220](https://github.com/travisboettcher/cr-z-assistant/issues/220).** pg. 44
> names the tool belt as the only equipment that takes no slot, so a standard or quality backpack
> takes one, and its +1 to Carry gives it back. The ultralight backpack is
> [R50](#r50--what-slot-the-ultralight-backpack-takes).

**pp. 10, 44, 51; #177, Z5-2.** The backpack adds one to its wearer's Carry Score, and Carry adds to
Inventory Slots (pg. 10); most equipment takes a slot (pg. 44).

**The answer is that a backpack takes one slot**, so for a survivor with Carry it nets to nothing
until something else needs the room its bonus makes.

**What it costs.** A backpack is worth less than the app counted it before the October 2026 check,
when it took no slot.

*Confirmed 2026-10-13 from the batch-16 extract as taking no slot; corrected by pg. 44 on
2026-10-14 (#220).*

---

## R37 — Nothing on an item lasts past its mission

**pp. 38, 45, 50–51; #177, Z5-5.** A jammed pistol is cleared by an action (pg. 38); the book never
says whether a jam outlasts the mission, though the repeating crossbow's jam lasts exactly until the
mission ends (pg. 50), the suppressor and scent masker refresh every mission (pp. 50–51), and
improvised armor's Health is restored at the end of one (pg. 45).

**The ruling is that every per-mission state of an item ends with the mission**, so the tracker
keeps no item state at all — only whether the item still exists. What a mission uses up or destroys
(disposables, one-mission items, armor worn through) is recorded with its outcome.

**What it costs.** A table that carries a jam from one mission into the next keeps it on paper.

*Confirmed 2026-10-13 from the batch-16 extract.*

---

## R38 — Who moves what at Equip Mission Team

**pp. 18, 23, 31–34, 124; #177, Z5-4.** Equip Mission Team gives a mission team items from the base
Inventory (pg. 18). Survivors keep what they carry between missions (pp. 23, 124). The book has no
rule for handing items between survivors outside a mission, or for returning them to the base.

**The ruling is that at Equip Mission Team, items move between the base Inventory and the mission
team's survivors in either direction, and between those survivors, within their slots.** Anybody
not on a team keeps what they hold, and takes nothing new.

**What it costs.** A survivor at home all game keeps whatever they last carried until they next go
out; the table moves it then.

*Confirmed 2026-10-13 from the batch-16 extract.*

---

## R39 — One +1 from a quality-only item

**pp. 37, 41, 44, 51; #177, Z5-3.** The backpack, breaching tool, burglar tools, binoculars and
walkie talkie exist only as quality (pg. 41), and each also adds one to a Score by its own text
(pg. 44). Read as two bonuses, they would add two.

**The ruling is that each adds one in all**: the quality grade and the item's own bonus are the
same +1, since nothing standard or shoddy exists to compare it with.

**What it costs.** A table reading both bonuses gets a stronger item.

*Confirmed 2026-10-13 from the batch-16 extract.*

---

## R40 — Bonuses stack; protective gear one of each

**pp. 44–45, 50–51; #177, Z5-3.** Two items can add to the same Score (binoculars and night vision
goggles, both Scout), and a survivor could wear armor, a shield, reinforced clothing and knee pads at
once. The book addresses neither.

**The ruling is that bonuses to one Score from different items stack, and a survivor wears at most
one of each kind of protective gear**: a second set of reinforced clothing adds nothing.

**What it costs.** Nothing the book forbids is refused; only a duplicate is.

*Confirmed 2026-10-13 from the batch-16 extract.*

*Confirmed again 2026-10-14 from the batch-17 extract (R81): two of one item, two pairs of binoculars
among them, give one bonus; an item is equipped, and the FAQ's Dual Wield is the one written
exception.*

---

## R41 — A Watchtower reads its lookout's whole Score

> **Settled by pp. 8, 71.** A Skill Score is level, stat and item modifiers (pg. 8), and the Score is
> what a skill uses whenever it is applied. The Watchtower subtracts its staff's Score (pg. 71). So the
> whole Score, item term included, is the book's answer, and the work can be built on it. No longer
> proposed.

**pp. 8, 14, 71; #177, Z5-3.** A staffed Watchtower takes its staff's best Long Guns, Handguns,
Archery or Traps Score off Siege Threat (pg. 71; its row is on pg. 73). A Skill Score has an item term (pg. 8), and a
survivor with a weapon skill and nothing better holds a shoddy weapon at −1 (pg. 14). Survivors keep
what they carry between missions (R38), so a lookout at home has a weapon to hand. The book does not
say whether the Watchtower means the Score with that term or the stat and level alone.

**The answer is the whole Score**, item term included: a lookout with only
the free shoddy weapon takes one less off than before Z5-3, and one with a quality rifle one more.
Traps has no free item, so a trapper's Score is unchanged.

**What it costs.** A tower staffed by an unarmed lookout is a point weaker than it was before
equipment arrived. Read the other way, the weapon a lookout carries would make no difference to the
one facility that watches with a weapon skill.

*The batch-17 extract agrees (R80).*

---

## R42 — Nobody scavenges on a siege turn

> **Settled by pp. 17, 23; FAQ "Mission Phase Scavenging"; FAQ "Siege Defense and Labor".** A
> scavenger is sent only when the community opts out of a mission at Select Mission (pg. 17). A
> triggered siege forces the mission, and the FAQ says it removes the choice of mission, so nobody
> scavenges on a siege turn.
>
> **The Planning-Phase assignment is the app's.** The book's Planning Phase has no scavenging step
> (pp. 20–21): the scavenger is chosen at Select Mission, when the mission is skipped, and must hold
> no other assignment that turn. The app takes the assignment a phase early, in Planning, so the
> table can see who is free. That is an app convenience, not a rule, and the paragraphs below are
> written in its terms.

**pp. 17, 21, 23, 85; the FAQ; [#199](https://github.com/travisboettcher/cr-z-assistant/issues/199).**
Scavenging pays when the community skips its mission (pg. 17). The Planning Phase assigns a
scavenger before Check the Horde can call a siege (pg. 21), so one can stand assigned on the turn a
siege is fought — and a siege skips nothing: it is the turn's mission, and the whole community
deploys to it (pp. 23, 85). The FAQ entry "Siege Defense and Labor", read as keeping the rest of
the community's work going during a siege, could be taken to keep the scavenger's find too.

**The ruling is that a scavenger finds nothing on a siege turn.** They deploy with everybody else,
and the haul says so.

**What it costs.** A table reading the FAQ the other way loses the scavenger's find that turn.

*Decided 2026-10-13.*

---

## R43 — Blacksmithing Tools round up

**pp. 63, 82; #177, Z5-6.** The Renaissance Festival's Blacksmithing Tools halve the Labor of
bladed, blunt, heavy and archery weapons (pg. 63). The book does not say how an odd Labor halves,
nor whether quality builds, the enchanted melee weapon or ammunition are covered.

**The ruling is that the halved Labor rounds up**, as the book rounds halves of resources
up elsewhere (pg. 82): a blunt weapon stays 1, bladed, heavy and the bow go to 1, the crossbow to 2.
It covers quality builds as well as standard, and the enchanted melee weapon (a bladed, blunt or
heavy weapon itself), but not ammunition, which is used with no weapon skill.

**What it costs.** A table rounding down builds a blunt weapon for nothing.

*Confirmed 2026-10-14.*

---

## R44 — A Utility in an equipment row is supplied to a facility the row names

**pp. 41–42, 67; #177, Z5-6.** Some equipment rows require Power or Water beside a facility. Utilities
are supplied per turn, to facilities (pg. 67), and the book does not say which facility must have
one for the item to be built.

**The ruling is that at least one facility the row names must be supplied the Utility this
turn.** A row naming only a Workshop upgrade reads its Workshop.

**What it costs.** A table that only needs the Utility somewhere at the base would build more often.

*Confirmed 2026-10-14.*

---

## R45 — The Outdoor Sports Shop's four weapons are the player's to choose

**pg. 62; #177, Z5-8.** Clearing the Outdoor Sports Shop's Inventory slot adds four standard weapons
to the Inventory. The book does not say which.

**The ruling is that the player chooses any four standard core weapons**, repeats allowed,
none of another origin, when the clearing project finishes in the Advancement Phase like any
other.

**What it costs.** A table rolling for them would get a random spread.

*Confirmed 2026-10-14.*

---

## R46 — Turnout Gear arrives with each move into a Regional Firehouse

**pg. 66; the FAQ; #177, Z5-8.** The Regional Firehouse's Turnout Gear is six standard reinforced
clothing in the Inventory. The book does not say when, or whether reclaiming a Firehouse gives it
again.

**The ruling is that it arrives each time the community moves into a Regional Firehouse**:
the first base claim, a move, or a way on from an overrun that claims one.

**What it costs.** A community that loses and reclaims a Firehouse is six clothing richer for it.

*Confirmed 2026-10-14.*

---

## R47 — Installing a rare upgrade

**pg. 49; #177, Z5-8.** A rare upgrade is installed in a facility and does not count toward its
maximum upgrades. The book gives it no Labor, no Hardware and no step.

**The ruling is that installing costs nothing and happens at Add Facilities and Upgrades**
(Advancement Step 5), where upgrades land, into a facility of its kind that is standing. It counts
as the upgrade it names, stays with that facility, and goes if the facility is destroyed.

**What it costs.** A table treating it as a project would spend Labor on it and wait a turn.

*Confirmed 2026-10-14.*

---

## R48 — A built item stays built when Labor falls short

**pp. 20, 23; #177, Z5-6.** Equipment is finished the moment it is paid for (pg. 20), and a turn's
Labor can fall short after it is spent, when a project-team member leaves at Departures (pg. 23).
The shortfall has so far been settled by choosing a queued project to go unfinished.

**The ruling is that an item already built stays built**: the shortfall falls on this turn's
facility queue alone, and a shortfall only equipment accounts for is forgiven.

**What it costs.** A team can build equipment with Labor that later walks out of the door.

*Confirmed 2026-10-14.*

---

## R49 — The Rare in storage becomes Rare Item Table rolls

**pp. 19, 43; #177, Z5-7.** Until Phase 5 the app recorded each material roll of 10 as a Rare
material, because the Rare Item Table did not exist. The book has no Rare material: a 10 is a roll
on the table (pg. 19).

**The ruling is that each Rare in storage becomes one Rare Item Table roll owed at the next Add
Materials to Storage step, and Rare stops being a material.** Old entries that counted Rare keep
reading as they did.

**What it costs.** A schema step, and a table that had planned around a Rare count rolls for items
instead.

*Decided 2026-10-14.*

---

## R50 — What slot the ultralight backpack takes

**pp. 44, 51; [#220](https://github.com/travisboettcher/cr-z-assistant/issues/220).** pg. 44's
general rule gives most equipment a slot and names the tool belt as the only exception. The other
rare equipment on pg. 51 each states its own slot use, and the ultralight's entry is silent. It gives
+2 slots and may be worn by a survivor without Carry.

**The ruling is that it takes one slot, for a net +1**, under pg. 44's rule, as the ordinary backpack
does (R36).

**What it costs.** A table reading its silence as taking none gets one more slot from it.

*Found by the October 2026 check against the book; decided 2026-10-14.*

---

## R51 — What the Planning trade can buy

**pp. 21, 37, 41–43; #177, part 3.** Equipment can be traded for in the Planning Phase at its trade
cost (pg. 21), and Rare Items are bought from the Rare Goods Trader (pp. 37, 43). Neither page says
a rare item cannot be bought another way, nor that every priced grade can be bought.

**The ruling is that the Planning trade buys ordinary equipment in every grade with a printed trade
price, and nothing else.** Shoddy is free and never bought. A grade printed "–" or N/A has no price
and cannot be bought; weapon rows price standard only, so a quality weapon is never bought in
Planning. Rare items, quality weapons among them, come only through a Rare Items trade (R57).

**What it costs.** A table reading pg. 37 loosely could buy rare items without the Trader.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R52 — A Planning trade needs nobody

**pp. 20–21, 37; #177, part 3.** A trade is the Build/Trade Equipment project at Planning Step 2,
takes no Labor, any number at once, paid in any mix of Food and Fuel (pp. 20–21). The book does not
say whether anybody must be assigned for it, and pg. 37 points at the tables "when building or
trading" without saying whether the Requires column applies to a trade.

**The ruling is that a trade needs no survivor, no Labor, no facility and has no limit per turn**:
the Requires column is what building needs, and buying is the way round it.

**What it costs.** A table applying the Requires column to trades could not buy what it cannot
build, which leaves the higher trade price buying nothing.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R53 — A traded item arrives wherever the community is

**pp. 19, 21; #177, part 3.** A traded item arrives at the next Advancement Phase's Step 5, and its
materials leave at once (pp. 19, 21). The book says nothing of cancelling, or of a move or an overrun
before it arrives.

**The ruling is that an order belongs to the community and arrives at Advancement Step 5 in whatever
base it holds then** (a move lands at Step 3, before it). There is no cancelling and no refund. A
community that starts over (R30, R31) loses its pending orders with the old base.

**What it costs.** A misclicked order cannot be taken back; the log is the record of it.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R54 — Only rare items are sold

**pp. 21, 37; #177, part 3.** A Rare Item can be traded away for its value less two, without the
Trader, and leaves the Inventory at once (pp. 21, 37). The book gives no sale price for anything
else, and does not say what the seller is paid in or when.

**The ruling is that only rare items are sold, at their price less two, paid at once in the Planning
Phase in Food and Fuel, the player's mix.** The cheapest rare item is 4, so a sale is never below 2.

**What it costs.** Ordinary equipment cannot be turned back into materials.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R55 — The channel decides the price

**pp. 41–43; #177, part 3.** The quality tool belt is priced 8 on the equipment table (pg. 41) and 6
on the Quality Item subtable (pg. 43); no other item is printed in both places.

**The ruling is that a Planning trade pays the equipment table's price and a Rare Items trade the
subtable's**, so the same tool belt is 8 in Planning and 6 from the Trader. Three quality prices
look like misprints and are kept as printed: the heavy weapon 8 (pg. 43), the improvised shield 8
and the knee pads 7 (pg. 42).

**What it costs.** Two prices for one item, each correct in its own place.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R56 — A sale can overfill storage

**pp. 21, 23; the FAQ; #177, part 3.** Check Storage, Management Step 5, destroys what is over the
cap (pg. 23). The book says nothing special about what a sale brings in.

**The ruling is that a sale's Food and Fuel go into storage like any income, over the cap if it
comes to that, and the excess is lost at that turn's Check Storage.** The app warns and does not
refuse.

**What it costs.** A sale made carelessly late in a full turn spoils.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R57 — One Rare Items trade, in two halves

**pp. 21, 83–84; #177, part 3.** Pg. 21 assigns a mission team to trade, makes the list, sets
materials aside and forces the next mission; pp. 83–84 are that mission, played against a priority
list of the Rare Items planned.

**The ruling is that they are one trade**: made in the Planning Phase, resolved by the Rare Goods
Trader mission it forces.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R58 — The trader's list is full Rare Item Table rolls

**pp. 19, 21, 43; #177, part 3.** When the trade is decided, the community rolls a number of d10s
equal to every survivor's Scout Score plus Cooperation, all added together, and applies them to the
Rare Item Table (pg. 21). The table takes two dice, subtable then entry (pg. 43). The book does not
say how one counted die becomes a two-dice roll, nor what a duplicate means.

**The ruling is that the list is made when the trade is assigned in Planning, and each counted die
is one full Rare Item Table roll**, subtable and entry, so the list has that many entries.
Duplicates are separate entries. The player chooses from the list, and the priority list is written
from those choices.

**What it costs.** A long list for a big community: the app records the items chosen and their
dice, not every roll on the list.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R59 — The trade's materials are set aside until the mission ends

**pp. 21, 23, 84; #177, part 3.** The Food and Fuel the chosen items cost are set aside, leave the
Inventory and are not counted against storage (pp. 21, 23). A successful trade returns what was not
spent (pg. 84).

**The ruling is that they are set aside in the same Planning step as the list, before Check
Storage, and held outside storage until the forced mission ends.** What was not spent returns then
and meets the next Check Storage. They are lost if another mission is chosen or a siege is called
(pp. 21, 23).

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R60 — The trade forces the next turn's first mission

**pp. 21, 23, 83; #177, part 3.** The next mission chosen must be the Rare Goods Trader; another
choice, or a forced Siege Defense, loses the materials (pp. 21, 23). The book does not say which
mission is bound when several teams go out, nor what a siege does to the obligation.

**The ruling is that it binds the first mission chosen in the next Mission Phase, and other teams
are free.** It can be declined only by losing the materials. A siege called at that turn's Check the
Horde loses them there and cancels the trade; nothing carries over.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R61 — The Rare Goods Trader's outcome

**pg. 84; #177, part 3.** This confirms R22, below its own heading. Any survivor exiting is a
success, and partial exits make no difference. Items traded arrive when the mission ends rather than
at Advancement Step 5, which the book leaves open and which is the same turn either way.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R62 — What a vehicle is

**pp. 49, 52–53; #177, part 3.** A vehicle is a Tier 1–4 with fixed Inventory and Passenger Slots
(Tier 4 splits a total of 20 as its owner chooses), a kind, and Noise of its Tier + 5; one spawned
in deep water is a boat and deploys only in water (pg. 52). A rare vehicle upgrade attaches to one
vehicle for good, one per vehicle (pg. 49). The core rules give a vehicle no Health.

**The ruling is that a vehicle is recorded as its Tier, a label the player gives it, land or water,
Tier 4's slot split, and its upgrade if it has one.** It has no Health, and whether it is working is
a fact of one mission, never stored.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R63 — Retrieve New Vehicles' Tiers are rolled, then may be lowered

**pp. 81–82; #177, part 3.** The mission's setup rolls five d10s for the vehicles' Tiers (1–3 Tier 1,
4–7 Tier 2, 8–9 Tier 3, 10 Tier 4), any of which may be replaced with a lower Tier, and only those
repaired and driven off join the Inventory (pg. 82).

**The ruling is that each Tier is rolled and the player may then lower it, and a vehicle joins when
it is driven off the map**, with nothing else required.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R64 — A won claim keeps the vehicles on the mission area

**pp. 78–79; #177, part 3.** A won Claim a New Base adds the working vehicles on the mission area
(pg. 79), and an ordinary claim has none to repair (pg. 78), so they are the ones the team brought.

**The ruling is that they keep their Tier and are added on a won claim whether or not they were
driven.** On a lost claim R70 applies: one not driven off is lost.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R65 — A vehicle's Fuel is paid at Equip Mission Team

**pp. 18, 52; #177, part 3.** A deployed vehicle burns 1 Fuel per Tier per mission (pg. 52), and
Equip Mission Team is where a team takes one (pg. 18). The book does not say when the Fuel is paid
or what a shortage does.

**The ruling is that it is paid at Equip Mission Team from storage, Tier × 1 for each vehicle**, and
a vehicle the community cannot fuel is not taken. Fuel is not refunded when a vehicle is lost.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R66 — Auto Shops protect vehicles the owner picks

**pp. 11, 32, 52, 67, 71–72; #177, part 3.** Vehicles taken beyond the base's number of Auto Shops
break down on arrival, with no roll, and can be repaired on the map with a Tinker check at 4 × their
Tier (pp. 11, 32, 52). Each Auto Shop protects one vehicle (pg. 71), and a Workshop holds up to
three upgrades (pp. 67, 72). The book does not say which vehicles are protected.

**The ruling is that the base's Auto Shop upgrades are counted, the owner picks that many of the
vehicles deployed to be protected, and the rest start the mission broken.** A breakdown is never
stored: it is the mission's, and R70 settles what it costs.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R67 — A vehicle upgrade is fitted at Planning for nothing

**pp. 43, 49; #177, part 3.** The car roof rack and the electric car conversion come only from the
Rare Upgrade subtable, attach to one vehicle for the campaign, one per vehicle, and the conversion
deploys only with a powered Auto Shop (pp. 43, 49). The book gives fitting no step and no cost.

**The ruling is that it is fitted in the Planning Phase at no cost, whenever it is in the Inventory
and the vehicle has no upgrade**, and never removed. It goes with its vehicle.

**What it costs.** Unlike a rare base upgrade (R47), which lands at Add Facilities and Upgrades: a
vehicle is not a facility, and the Planning Phase is where a team gets ready.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R68 — Vehicles have no cap

**pp. 23, 54; #177, part 3.** Check Storage counts materials only (pg. 23), the caps are per material
(pg. 54), and nothing in the core rules caps vehicles.

**The ruling is that a base holds any number of vehicles, and Check Storage ignores them.**

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R69 — A vehicle is empty between missions

**pp. 32, 52–53, 159; #177, part 3.** Driving off takes a vehicle and what it holds home (pg. 32);
Load and Unload move items in and out on the map (pg. 52); a Passenger Slot holds an item or a
person (pg. 53), and Passenger Slots cap who deploys with the vehicle (pg. 52). The book does not
say what a vehicle holds between missions.

**The ruling is that a vehicle holds nothing between missions**: what it brings home joins the
base's Inventory. Its Passenger Slots are recorded as a number and their occupants are not tracked.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R70 — A vehicle not driven off is lost

**pp. 32, 52, 79, 82; #177, part 3.** A vehicle gets home by being driven off (pg. 32), and the two
missions that add vehicles add the ones driven off or standing on a won claim (pp. 79, 82). The core
rules have no rule that destroys a vehicle, so one left on the map could be read as lost or as coming
home anyway.

**The ruling is that a deployed vehicle not driven off, and not kept by a won claim (R64), is lost
with everything in it**, and the log says so.

**What it costs.** A broken vehicle nobody repairs is gone, which is what deploying more vehicles
than Auto Shops risks. A table reading vehicles as base property would never lose one.

*Decided 2026-10-14 from the batch-17 extract.*

---

## R71 — A survivor who dies on a mission leaves their items on the map

**pp. 31, 34; #177, part 3.** A carried survivor drops their items at a marker (pg. 31), and another
survivor can take an item from one incapacitated (pg. 34). A body not carried off is lost.

**The ruling is that what a survivor who dies on a mission carried is kept only if somebody took it
before the map was left; the rest is lost.**

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R72 — A survivor bitten to death at home leaves their items to the base

**pg. 22; #177, part 3.** The book removes a survivor whom a turning one bites to death and says
nothing of their items.

**The ruling is that their items go to the base's Inventory**: they died at home, where nothing is
left in the field. This is what Z5-5 already does.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R73 — A survivor who departs takes their items

**pp. 23, 124; #177, part 3.** The lowest-Tier survivor leaves at Departures (pg. 23). The core rules
are silent on their items; the Cosmic origin's departing survivor takes everything they carry
(pg. 124).

**The ruling is that a departing survivor takes what they carry**, as the Cosmic wording has it.

**What it costs.** Z5-5 left a departing survivor's items at the base until this was ruled; that
changes.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R74 — A survivor who turns leaves their items to the base

**pg. 22; #177, part 3.** A survivor who turns at a Rot check is removed, and the book says nothing
of their items.

**The ruling is that their items go to the base's Inventory**, as R72's do. This is what Z5-5 already
does.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R75 — A survivor taken off the roster leaves their items to the base

**pg. 124; #177, part 3.** The core rules have no removal by the player; exile exists for the
Cosmic origin's Found survivors (pg. 124).

**The ruling is that a survivor the player removes leaves their items in the base's Inventory**, and
an exiled Found survivor goes back to the Lost holding nothing. This is what Z5-5 already does.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R76 — A survivor set aside keeps what they carry

**pg. 86; #177, part 3.** Abandoned survivors come back with their Inventory and experience (pg.
86), and a survivor's Inventory is their Inventory Slots (pg. 14).

**The ruling is that a survivor set aside (R31) keeps the items they carried**, and nothing from the
base's Inventory goes with them.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R77 — A move takes everything; a Hero sent away takes their own

**pp. 19, 54; the FAQ; #177, part 3.** A move takes every vehicle, weapon and piece of equipment with
the materials (the FAQ), and the old Inventory joins the new at Advancement Step 3 (pg. 19). A Hero
over the new base's cap leaves (pg. 54); the book does not say with what.

**The ruling is that everything moves, vehicles included, and survivors take what they carry. A Hero
sent away takes the items they carry**, and the base's Inventory stays.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R78 — An overrun loses the base's Inventory

**pp. 85–86; #177, part 3.** After an overrun, a claim of the same base type on the same map
recovers half the stored materials, and the community's vehicles are on its map as repairable ones
(pg. 86); starting over uses the survivors and their gear (pg. 86). No option mentions the items in
the base's Inventory, nor whether vehicle upgrades survive.

**The ruling is that survivors keep what they carry in every option, and the base's Inventory items
are lost in every option.** On a same-type, same-map claim every vehicle comes back as a repairable
vehicle at its Tier, with its upgrade, and joins as R63 and R64 have it; on any other claim the
vehicles are lost too.

**What it costs.** A community overrun with a well-stocked Inventory loses all of it. A table reading
the silence generously would carry it over like a move's.

*Decided 2026-10-14 from the batch-17 extract.*

---

## R79 — Starting a new community keeps only what survivors carry

**pp. 19, 76–77, 86; the FAQ; #177, part 3.** Starting over uses the remaining survivors and their
gear (pg. 86); the First Mission brings no vehicle (pg. 76).

**The ruling is that survivors keep what they carry, and the old base's Inventory and every vehicle
are lost**, as R30 loses its stores.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R80 — The Watchtower reads the whole Score

**pp. 8, 71; #177, part 3.** The extract's answer to R41, below its own heading, which the text
settles the same way.

*Confirmed 2026-10-14 from the batch-17 extract.*

---

## R81 — Identical items give one bonus

**pp. 8, 44; the FAQ; #177, part 3.** This confirms R40's reading of two identical items, below its
own heading.

*Confirmed 2026-10-14 from the batch-17 extract.*
