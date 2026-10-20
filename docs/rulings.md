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

R84–R132 are the batch-18 to batch-20 extracts' R81–R129, three numbers up: R81 was already taken,
and Z5-12 took R82 and R83 before the extracts arrived.

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

> **Settled by pp. 19, 21, 22 and 123, in part; [#219](https://github.com/travisboettcher/cr-z-assistant/issues/219).**
> Only survivors below maximum Health may be assigned to rest or healing (pg. 21), and only those
> assigned are given Health points (pg. 19). The Viral option to spend a point on Infection instead
> (pp. 19, 123) is about those points, so a survivor at full Health takes no share and no resting
> point whatever their Infection. The Rot row is settled too: the ordinary Rot check is unchanged,
> and Infection has the Viral origin's own check (pp. 22, 123). The rest of the table, how many
> points a wounded survivor with Infection takes, and Health first are still rulings.

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
| Check for Rot (pg. 22) | `outOfHealth` | Settled by pp. 22 and 123: the ordinary check is unchanged, and Infection is the Viral origin's own check, not this one. |
| Departures (pg. 23) | `isDown` | The exclusion is about being in no state to walk anywhere, which pg. 123's incapacitation is exactly. Where that is everybody, nobody is leaving and the turn owes no Departures step ([#192](https://github.com/travisboettcher/cr-z-assistant/issues/192)). |
| Siege casualties and stand-ins (FAQ, [R17](#r17--what-a-siege-defense-does-to-the-turns-work)) | `outOfHealth` | The FAQ names "reduced to 0 Health" for who stops working and "not at 0 Health" for who may substitute. Asked of the Health the siege's outcome recorded where it has one (R17's October 2026 amendment), and of the roster's otherwise. |
| Mission team | both, separately | 0 Health is a wound, and R12 already keeps every wounded survivor off a team; 10 Infection adds its own warning, because full Health does not make an incapacitated survivor fit. |

**Infection below 10 is not a wound.** R12's "wounded" is Health below its maximum, so a survivor
at full Health and 9 Infection may join a mission team, and one at 3/4 Health and no Infection
still may not. Nothing about R12 changes.

**Heal Wounds gives points only to a survivor below maximum Health** (pp. 19, 21, settled above).
`need` in `healing.ts`, which the equal share is measured against, is nothing at full Health, and
the Planning Phase warns "already at full Health" about resting or healing such a survivor
whatever their Infection. A survivor down on Infection with Health below maximum — the case
[#176](https://github.com/travisboettcher/cr-z-assistant/issues/176) was opened for — can still be
helped by the Clinic; only one at full Health cannot.

**A wounded survivor with Infection counts a point as one they "would receive" if they have a use
for it** — the wound, or Infection it could remove instead (pg. 19, 123). So below maximum,
`need` is their room for Health plus their Infection, and they may take more points than the wound
alone would hold, the ones past it going on Infection. The stricter reading gives them no more
than their wound holds. The same holds for a resting survivor's own point, which is a Health
point received like any other.

**Health comes first unless the player says otherwise.** Each award opens with its points on
Health and only what Health cannot hold on Infection; the step then offers the rest of the split
point by point. The book's "may instead" makes the trade an option, so the default is not taking
it — and it is what every campaign that is not Viral has always done.

**What it costs.** A survivor at full Health and 10 Infection cannot bring it down by healing or
rest, and Containment (pg. 69) works only on survivors assigned to healing, so it cannot either.
A survivor at 10 Infection with Health left faces no Rot check (pp. 22, 123); whether they turn
at the base is the Viral origin's own Infection check, which `src/data/dice.ts` records against
pg. 22 and which is unbuilt.

**Left open:** the turning survivor's bite at Check for Rot adds no Infection. It is a zombie's
damage, which is what pg. 123 says adds it, but it lands at the base rather than on a mission,
and the tracker has no mission to compare it with. Recorded so that it is not mistaken for a
decision.

*Heal Wounds at full Health decided 2026-10-11 for #176; corrected by pp. 19 and 21 on 2026-10-15
(#219).*

---

## R19 — Missions in one turn are independent

**pp. 17–19, 21; [#178](https://github.com/travisboettcher/cr-z-assistant/issues/178).** The
mission survivors may be split into any number of teams, each completing its own mission in the
same turn (pg. 21). The book does not say in what order a turn's missions are
played, or whether the result of one reaches another — a vehicle driven off, a base claimed
mid-turn — and the Advancement Phase is written as though there were one mission.

**The ruling is that each outcome applies on its own, and none is read by another in the same
turn.** What the Advancement Phase gathers from them is gathered across all of them: mission XP is
a point for every survivor on every team, the discretionary point is still one per turn with a
mission (pg. 18, literal; [R156](#r156--no-discretionary-point-on-a-turn-without-a-mission)), and the
material roll is once per material recovered, from every mission together
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

**pp. 37, 41–43; [#177](https://github.com/travisboettcher/cr-z-assistant/issues/177),
[#217](https://github.com/travisboettcher/cr-z-assistant/issues/217).** Pg. 37 says quality weapons
come only through the Rare Goods Trader, but the cost tables on pp. 41–42 print a quality build cost
for every weapon and for most equipment and protective gear. The weapon tables print no quality
trade cost, and the Rare Item Table's Quality Item subtable sells quality weapons (pg. 43), which both
support pg. 37.

**The ruling is that a quality weapon is never built or bought in the Planning Phase**: it comes from
the Rare Item Table or the Rare Goods Trader (pp. 21, 43, 83–84). Quality equipment, protective gear
and disposables are built at the quality cost the tables print, at the same Labor as standard. It is
the one reading that contradicts neither pg. 37 nor the equipment tables.

**What it costs.** The weapon tables' quality build column goes unused. A table that builds from
every printed column would have quality weapons sooner.

*Confirmed 2026-10-13 from the batch-16 extract as building every quality column; narrowed to
exclude weapons on 2026-10-14, after the October 2026 check (#217).*

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
It covers the enchanted melee weapon (a bladed, blunt or heavy weapon itself), but not ammunition,
which is used with no weapon skill. A quality weapon is never built (R34), so only standard builds
are halved.

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
base it holds then.** The app moves the community at the end of the Advancement Phase (R25), after
Step 5, so an order arrives in the old base and moves with the Inventory (R77). There is no
cancelling and no refund. A community that starts over (R30, R31) loses its pending orders with the
old base.

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


### Note, October 2026 — a survivor without Scout

Built with Z5-10. A survivor who has not taken Scout has no Scout Score, so they add their
Cooperation alone; nothing in the count is invented for a skill they lack. Scores and Cooperation are
read as they stand that turn, the hunger penalty included, as every other Score is.
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

---

## R82 — The electric conversion's two fewer slots are Inventory Slots

**pg. 49; #177, part 3.** The electric car conversion takes two slots from the vehicle it is fitted
to, and the car roof rack adds four Inventory Slots (pg. 49). The book does not say which of the
vehicle's two kinds of slot the conversion's two come from.

**The ruling is that they are Inventory Slots**, as the roof rack's are, and a vehicle never goes
below none: a Tier 1 with a conversion has no Inventory Slots and keeps its Passenger Slots.

**What it costs.** A table reading them as Passenger Slots carries two more items and two fewer
people or items in the seats.

*Decided 2026-10-15.*

---

## R83 — Which Auto Shop lets an electric conversion go out

**pp. 49, 71; #177, part 3.** **OPEN.** The electric conversion goes out only with a powered Auto
Shop (pg. 49), and each Auto Shop protects one vehicle from breaking down (pg. 71; R66). The book
does not say whether one powered Auto Shop lets any number of converted vehicles go out, nor
whether a converted vehicle uses up that Auto Shop's protection.

**Until it is settled the app takes the simplest reading**: a converted vehicle may be
taken while any working Auto Shop stands on a slot with Power, however many go, and the Auto Shops
protect vehicles as R66 counts them, converted or not.

*Recorded 2026-10-15 with Z5-12.*

---

## R84 — What a survivor's sheet records for traits

**pp. 87–88, 137–140; Phase 7.** Story Traits are core (pg. 88); Permanent Injuries, Advantages and
the origin traits are a chapter the Apocalypse Toolkit makes optional (pg. 137). Veteran sits beside
a story trait rather than in its place (pg. 88), injuries can repeat (pg. 137), Advantages carry an
experience debt (pg. 139), and Bonded survivors form groups (pp. 88, 90–91).

**The ruling is that a survivor records one story trait or none, Veteran on its own, a count of
each Permanent Injury, a set of Advantages, their experience debt, and the bond group they belong
to**, and a campaign records whether the Toolkit's traits are in use. With them off, a survivor has
no injuries, no Advantages and no debt.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R85 — A new story trait replaces the old one, and Veteran stays

**pg. 88; Phase 7.** The book gives a survivor one story trait at a time, a new one replacing it, and
says Veteran is kept when another is given.

**The ruling is that the app follows it**: assigning a story trait removes the one held, and never
Veteran.

*Confirmed 2026-10-17 from the batch-18 extract.*

---

## R86 — A Permanent Injury comes only at creation or from a failed Rot check

**pp. 22, 137–138, 149; Phase 7; the Toolkit.** An injury can be chosen at creation for bonus XP,
or taken instead of turning after a failed Rot check (pp. 22, 137). Pg. 137 also mentions injuries
from being incapacitated on a mission and from crippling terrain, but gives no roll or table for
either, and pg. 149's crippling terrain lasts only for its mission.

**The ruling is that an injury is gained at creation, or by the player's choice when a Rot check
fails**, at Management Step 1. Being incapacitated and crippling terrain cause none between
missions.

**What it costs.** A table reading pg. 137's other two sentences as rules has no table to roll on,
and would have to invent one.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R87 — A repeated injury

**pp. 137–138; Phase 7; the Toolkit.** The book gives four injuries their own result when taken a
second time, One-handed a third, and says any other repeat means the survivor turns as normal.

**The ruling is that the app follows the printed results** (One-eyed twice is Blind; One-handed
twice gives no Labor and no attack skills, three times kills; Bad knee and Bad shoulder twice as
printed), **and any other repeat, an origin injury included, turns the survivor.** The origin
injuries are the derived part: the book does not name them, and they have no second result.

*Confirmed 2026-10-17 from the batch-18 extract.*

---

## R88 — Permanent Injuries never heal

**pp. 69, 137–140; Phase 7; the Toolkit.** No rule removes an injury, and the Medical Clinic restores
Health, not injuries (pg. 69). Pg. 140's origin injuries replace an Advantage when they meet one;
that is a substitution, not a cure.

**The ruling is that an injury lasts for the campaign**, apart from those printed substitutions.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R89 — The order a survivor's Labor is worked out in

**pp. 20, 88, 138–139; Phase 7.** Traits and injuries change a project-team survivor's Labor by
setting it, adding to it and multiplying it, and the book gives no order or rounding.

**The ruling is five steps**: start from the Tier; apply anything that sets it (Blind to 1, One-handed
twice to 0, Lone Wolf with company to 0); add (One-handed −1, Natural Leader +1 to each other member);
multiply (Bonded ×2 with two or more bonded on the team, Lone Wolf alone ×2, Jaded ×½ rounded up);
and never go below 0.

**What it costs.** Another order gives different totals in the rare case a survivor carries three of
these at once.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R90 — Jaded takes one Health a turn from every source together

**pp. 19, 69, 88; Phase 7.** Jaded caps a survivor's healing at 1 Health a campaign turn (pg. 88),
and Health reaches a survivor from several places: the Clinic's shared points, resting, the Recovery
Room, the Herb Plot and a Veteran.

**The ruling is that once a Jaded survivor has had 1 that turn, from any source, they take no more**,
and the Clinic's pool goes on to the next survivor. A point nobody can take is left unspent.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R91 — A Veteran's healing comes before the Rot check

**pp. 22, 88; Phase 7.** A Veteran spends XP to bring survivors at 0 Health up in the Planning Phase
(pg. 88), and the Rot check, at Management Step 1, is for survivors at 0 Health (pg. 22). The book
does not say whose XP pays, or what a Veteran in experience debt may do.

**The ruling is that a survivor the Veteran lifted above 0 has no Rot check that turn, the Veteran
pays from their own XP, and a Veteran in debt cannot pay.**

*Decided 2026-10-17 from the batch-18 extract.*

---

## R92 — A trait's bonus stacks with an item's

**pp. 8, 44, 139; Phase 7.** Quiet and Natural Leader raise a Score and say they do not count against
skill-level maximums (pg. 139); items raise Scores through their own term (pg. 8); the tool belt caps
Stealth (pg. 44).

**The ruling is that a trait's bonus is a term of its own and adds to an item's**, and a cap like
the tool belt's applies to the final Score.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R93 — A restricted survivor is never offered the assignment

**pp. 20–21, 88, 138; Phase 7.** Berserk keeps a survivor to resting, healing or a mission team
(pg. 88); Blind keeps them off mission teams, and Twice Shy off a Watchtower and off any mission team
with fewer than three others (pg. 138). Jaded may join a mission team while wounded (pg. 88), the one
exception to [R12](#r12--wounded-and-injured-are-one-state).

**The ruling is that the Planning Phase does not offer a survivor an assignment their traits forbid**,
and Twice Shy's team size is checked when the team is chosen.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R94 — Experience debt is paid before XP can be spent

**pp. 18, 70, 137, 139; Phase 7; the Toolkit.** An Advantage taken at creation carries a debt in XP,
and XP earned pays the debt before it can be spent (pg. 137). The book does not order the XP a turn
brings.

**The ruling is that the debt takes XP one for one in the order it arrives** (a mission's point, the
extra point, the Training Room, a story's reward), **and nothing can be spent while any debt is
left.** The Training Room's cap of 2 counts the XP it hands out, not what is left after the debt.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R95 — Traits travel with the survivor

**pp. 86, 124; Phase 7.** Survivors set aside come back with their Inventory and experience
(pg. 86), and a Lost survivor returns with full abilities (pg. 124). Nothing mentions traits.

**The ruling is that a survivor's traits, debt, bond group and attached stories go wherever the
survivor goes**: set aside ([R31](#r31--abandoned-survivors-and-a-hero-sent-away-are-set-aside),
[R76](#r76--a-survivor-set-aside-keeps-what-they-carry)), Lost and back. A Bonded survivor keeps the
trait while their bondmates are away, and the bonus waits until two are on one team.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R96 — Rot Resistant works first in the Advancement Phase

**pg. 140; Phase 7.** Rot Resistant takes 1 Infection off at the start of every Advancement Phase
(pg. 140), and does nothing at the Rot check. The book does not place it against Advancement's
steps. Pg. 48's pg. 142 is a misprint for pg. 140.

**The ruling is that it applies before Character Advancement**, so Heal Wounds sees the lower
Infection.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R97 — Inoculation is built, then given at the Clinic

**pp. 42, 48, 107, 140; Phase 7.** Inoculation is equipment built at a Medical Clinic with Water,
with no trade price (pg. 42), and a survivor assigned to receive it at a Clinic gains Rot Resistant
(pg. 48). Viral Mission 3's Medical Supply tokens pay its Labor (pg. 107). The book does not say
which step gives it, whether it is used up, or whether it takes a Clinic place.

**The ruling is that it is built in Planning Step 2, given to a survivor assigned to the Clinic that
turn in Step 3 in place of their healing, used up, and the trait appears in the Advancement Phase.**
A survivor who is already Rot Resistant cannot be given one. Rot Resistant is core whether or not the
Toolkit's traits are in use: it is how the equipment works.

*Decided 2026-10-17 from the batch-18 extract.*

---

## R98 — A campaign has one origin, fixed

**pp. 13, 122; Phase 7.** A campaign has an origin, chosen at the start (pp. 13, 122).

**The ruling is that a campaign has none or one of the three, fixed for its life**, and only that
origin's counters exist. This is what `Campaign.origin` already does.

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R99 — The Infection check adds the whole community's Medicine

**pp. 22, 123; Phase 7.** At Management Step 1 every survivor with Infection makes a Tier check
against their Infection, as well as any 0-Health check, and 1 and 10 have no special meaning
(pp. 22, 123). With a Medical Clinic the check adds the Medicine score of the community, which the
0-Health check words as the Clinic staff's.

**The ruling is that the bonus is the sum of every survivor's Medicine Score**, added to the roll,
whenever the community has a Clinic.

**What it costs.** Read as the Clinic staff's only, the check fails far more often.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R100 — A failed Infection check turns the survivor

**pp. 22, 123; Phase 7.** A failed Infection check turns the survivor in the night, with the
0-Health check's consequences (pg. 22).

**The ruling is that the app treats it exactly as a failed Rot check**: the survivor turns, may bite,
and with the Toolkit may take an injury instead ([R86](#r86--a-permanent-injury-comes-only-at-creation-or-from-a-failed-rot-check)).
A survivor who fails both checks turns once.

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R101 — A survivor at 10 Infection at the base

**pg. 123; Phase 7.** This agrees with [R18](#r18--what-infection-incapacitates): incapacitated by
Infection keeps a survivor off a mission team and lets them staff or join the project team as a
wounded one may, and they make the Infection check each turn at target 10.

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R102 — Each healing point is kept as Health or spent on Infection

**pp. 19, 123; Phase 7.** This agrees with [R18](#r18--what-infection-incapacitates), which already
splits each award point by point. What it adds: **a point spent on Infection counts as Jaded's one
point for the turn** ([R90](#r90--jaded-takes-one-health-a-turn-from-every-source-together)), and
Infection never goes below 0.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R103 — Containment holds a count

**pg. 69; Phase 7.** Each zombie held in Containment adds 1 Siege Threat a turn, and takes 1 more
Infection from each survivor assigned to healing (pg. 69). No limit is printed.

**The ruling is that Containment records how many zombies it holds**, with no limit. Each turn adds
that many to Siege Threat, and at Heal Wounds each survivor assigned to healing loses that many more
Infection, after their points are split.

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R104 — Bringing It On Home adds one zombie

**pp. 105–106; Phase 7.** Viral Mission 2 puts one zombie in Containment when at least one ensnared
zombie leaves the area, and pays XP for the rest (pg. 106).

**The ruling is that a won Bring It On Home adds 1 held zombie however many leave**, and the extras
pay their XP and the special zombies their items.

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R105 — A held zombie is never released

**pp. 69, 106–107; Phase 7.** No rule releases or uses up a held zombie; Viral Mission 3 needs one
and takes none (pg. 106).

**The ruling is that held zombies stay until the Containment that holds them is lost** with its
Clinic, by a move or an overrun.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R106 — Madness empties the community before Departures

**pp. 23, 124; Phase 7.** At Departures every survivor with 13 or more Madness becomes Lost and
leaves with what they carry (pp. 23, 124), beside the Unrest rule's one departure (pg. 23).

**The ruling is that the Madness departures come first, then the Unrest check as usual**, with the
Labor and staff the Lost leave behind removed as for any departure. What they take follows
[R73](#r73--a-survivor-who-departs-takes-their-items).

*Decided 2026-10-17 from the batch-19 extract.*

---

## R107 — A survivor who is down does not go Lost at Departures

**pg. 23; Phase 7.** Survivors at 0 Health cannot be chosen at Departures (pg. 23); whether that
covers the Madness rule is not said.

**The ruling is that it does**: a survivor who is down, as [R18](#r18--what-infection-incapacitates)
reads Departures, is not taken by Madness that turn.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R108 — The Lost roll is once a turn, before the first mission

**pp. 25, 124; Phase 7.** At the start of the Mission Phase each Lost survivor rolls a d10 and adds
their XP spent: 18 or more places them on the mission area as a stranger, anything else gives them
1 XP (pp. 25, 124). The book does not say which mission when there are several, nor their Tier.

**The ruling is one roll per Lost survivor per turn, before the first mission**, the player choosing
which mission a success joins, at the survivor's own Tier. A Lost survivor is the one stranger who
can be a Hero ([R24](#r24--a-rescued-stranger-is-never-a-hero) is about creating one).

*Decided 2026-10-17 from the batch-19 extract.*

---

## R109 — A rescued Lost survivor comes back as themselves

**pp. 25, 124; Phase 7.** A rescued Lost survivor returns with full abilities, no Madness and the
items they had when Lost, and is then marked Found or exiled back to the Lost (p. 124).

**The ruling is that they return with their Tier, skills, XP, traits and items, full Health, no
Infection and no Madness**, and the player marks them Found or exiles them. An exiled survivor's
items stay at the base ([R75](#r75--a-survivor-taken-off-the-roster-leaves-their-items-to-the-base)).

**OPEN: a Lost survivor placed as a stranger and not rescued.** The book does not say whether they
stay on the list. Until it is settled the app keeps them on it.

*Decided 2026-10-17 from the batch-19 extract; the open part recorded the same day.*

---

## R110 — The Lounge's points are shared like Health

**pp. 21, 68; Phase 7.** Each Lounge takes 2 Madness from survivors assigned to Madness Recovery, 4
with Power (pg. 68), as a total (pg. 21). The book does not say how it divides.

**The ruling is that the points are shared equally among the survivors assigned**, at Advancement
Step 4 beside Heal Wounds, the way healing points are, with points nobody can take left unspent.
Madness never goes below 0. Madness Recovery is a survivor's one assignment that turn, in place of
resting or healing. How many Lounges a Bunk Room takes is its upgrade limit, as for any upgrade.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R111 — Found caps Madness at 6 on a passed check

**pp. 124, 130; Phase 7.** A Found survivor's next Madness gain calls for a Tier check against 8;
passing caps their Madness at 6 for good (pg. 130). Above the cap nothing is recorded, but the
horror check is still made.

**The ruling is that the app follows it.**

**OPEN: a failed Tier-8 check.** The book says what passing does and not what failing does. Until it
is settled no cap applies, and the check is asked again at the next gain.

*Confirmed 2026-10-17 from the batch-19 extract; the open part recorded the same day.*

---

## R112 — Spells are per survivor, and the ones seen are per campaign

**pp. 70, 126–127; Phase 7.** A spell may be learned only once an enemy has used it on the table
(pg. 70).

**The ruling is that each survivor records the spells they know, and the campaign the spells an
enemy has cast.**

*Confirmed 2026-10-17 from the batch-19 extract.*

---

## R113 — Learning a spell at the Mystic Library

**pp. 18, 70, 114, 140; Phase 7.** A survivor staffing a Mystic Library learns a spell in Advancement
Step 1 for 6 XP, with Humanity 3 or less, one per staff place (pg. 70); after The Necromancer the next
spell costs 3 fewer (pg. 114); Resistance can never learn one (pg. 140).

**The ruling is one spell a turn per survivor staffing it, from the spells seen, at 6 XP or 3 once
after The Necromancer, paid from earned XP** (never while in debt,
[R94](#r94--experience-debt-is-paid-before-xp-can-be-spent)), **and counted as XP spent**.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R114 — When Humanity changes

**pp. 127, 140; Phase 7.** A survivor's Humanity, 0 to 5, starting at 3, rises for a turn on the
project team, for healing from 0 to 1 Health and for destroying a Magic enemy, and falls for
starting a mission with a magical item, for each spell cast and for Damage from a Magic enemy; at 0
they are lost to the Veil (pg. 127). Touched caps it at 4 (pg. 140). The book gives no timing, and
never lists which items are magical.

**The ruling is that a project-team turn adds 1 at Management Step 1 of that turn, healing from 0 adds
1 wherever it happens, and the mission's own changes come with its outcome.** Silver ammunition,
enchanted melee weapons, Resistance charms and Warding stones are magical, and starting a mission
with any of them costs 1 once, however many are carried. At 0 the survivor leaves the community.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R115 — A new survivor's counters

**pg. 127; Phase 7.** Every survivor begins with Humanity 3 (pg. 127); nothing gives a new survivor
Infection or Madness, except the stories that say so.

**The ruling is that a new survivor starts with Humanity 3, no Infection and no Madness**, unless a
story's reward sets otherwise.

*Decided 2026-10-17 from the batch-19 extract.*

---

## R116 — A survivor records the stories attached to them

**pp. 87, 90, 96; Phase 7.** A story mission is attached to a survivor, which is the only way it can
be played (pp. 75, 87). How many a survivor may hold at once is not said.

**The ruling is that a survivor records each story attached to them and the turn it was attached,
any number at once**, the campaign records the stories completed, and Select Mission offers an
attached story to a team its survivor is on.

**OPEN: a story whose survivor dies or leaves.** The book does not say. Until it is settled the story
goes with them ([R95](#r95--traits-travel-with-the-survivor)) and nobody else can play it.

*Decided 2026-10-17 from the batch-20 extract; the open part recorded the same day.*

---

## R117 — Promotion attaches a story, or makes a Veteran

**pg. 87; Phase 7.** A survivor promoted from Tier 1 or 2 gets one of five stories attached, and one
promoted from Tier 3 to Hero becomes a Veteran instead (pg. 87). The book names no die.

**The ruling is that the app follows it, the player choosing the story or rolling for it.**

*Confirmed 2026-10-17 from the batch-20 extract; the choice decided the same day.*

---

## R118 — Left Behind's time windows count three turns as inside

**pp. 118, 121; Phase 7.** Two windows decide whether Left Behind's stranger is the one the story is
about: under four turns since the story was attached (pg. 118), and under three since Part 1 ended
(pg. 121), and the second says nothing of exactly three.

**The ruling is that both windows are 0 to 3 turns**, counted from the attaching turn for Part 1 and
from the turn Part 1 ended for Part 2a.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R119 — Left Behind 2b is played straight after Part 1

**pp. 92–93; Phase 7.** When Part 1's loved one is not rescued, Part 2b follows in the same Mission
Phase, with what the team carried and a second wind for survivors at 0 Health (pg. 92).

**The ruling is that 2b is a second mission for the same team in the same Mission Phase**, its
wounds and Inventory carried over from Part 1.

*Confirmed 2026-10-17 from the batch-20 extract.*

---

## R120 — A story's new survivor joins at Create New Survivors

**pp. 19, 90–91, 99, 117; Phase 7.** Several rewards give the community a survivor (Left Behind's
family member, the Den's stranger, Friend or Foe's, Neighbor's Rifle's Tier 3), at a Tier the reward
sets.

**The ruling is that each is built at Advancement Step 2 like any rescued stranger**, at the Tier the
reward sets, with what the reward gives them (a bond, Madness, a weapon).

*Decided 2026-10-17 from the batch-20 extract.*

---

## R121 — A story is played once for each time it is attached

**pp. 87–102; Phase 7.** A story mission's rewards end it, and only Prepper's Stash Part 2 and
Sentimental Value say they can be tried again.

**The ruling is that a story is complete once its rewards are taken**, apart from those two, which
stay attached until they succeed.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R122 — Containment is unlocked for the campaign

**pp. 69, 72, 104, 116; Phase 7.** Viral Mission 1 unlocks Containment for the Medical Clinic, at 2
more Hardware if only one point of interest was investigated, and 2 less if the Broken Cage check
passed (pp. 104, 116).

**The ruling is that the unlock belongs to the campaign, with its Hardware change of −2, 0 or +2**,
so it survives losing the Clinic; the zombies held do not
([R105](#r105--a-held-zombie-is-never-released)).

*Decided 2026-10-17 from the batch-20 extract.*

---

## R123 — Magic Mission 1 unlocks the Mystic Library

**pp. 72, 112–113; Phase 7.** The Mystic Library needs a mission (pg. 72), and no Magic mission says
it unlocks it.

**The ruling is that completing The Graveyard unlocks it for the campaign.**

**What it costs.** A table that reads the library as open from the first Magic enemy builds it a
mission sooner.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R124 — The Necromancer's rewards are stored

**pp. 114, 119; Phase 7.** The Necromancer gives the next spell 3 XP off (pg. 114), and killing him
takes 1 Labor off a Mystic Library and every upgrade to it (pg. 119).

**The ruling is that the campaign records both**: the spell discount until a spell uses it, and the
Labor change for good.

*Confirmed 2026-10-17 from the batch-20 extract.*

---

## R125 — The Warehouse's quiet turn

**pg. 102; Phase 7.** Bringing more than 10 resources home from the Warehouse makes Unrest 0 in the
next Management Phase (pg. 102). What counts as a resource is not said.

**The ruling is that more than 10 resource and material tokens, not Rare Item tokens, set Unrest to 0
at Management Step 4 of the same turn**, Hunger and Exhaustion still worked out and Siege Threat
unchanged.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R126 — Crashed Convoy's two 10s are used once

**pp. 19, 101; Phase 7.** Crashed Convoy lets two material rolls of the player's choice become 10s,
each a Rare Item Table roll (pg. 101), and does not say how often.

**The ruling is once, at the next Add Materials to Storage after the mission.**

*Decided 2026-10-17 from the batch-20 extract.*

---

## R127 — Prepper's Stash Part 2 is six rolls or three choices

**pg. 96; Phase 7.** The Trap Door gives six Rare Item Table rolls or three items chosen from it,
and 6 Food (pg. 96).

**The ruling is that the player picks between the two, a choice of three from any subtable**, and the
Food goes to storage, checked at Check Storage like any other.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R128 — Who becomes Jaded in Left Behind 2b

**pg. 93; Phase 7.** When the berserk survivor falls at 0 Health, another survivor on the mission
becomes Jaded (pg. 93), and the book does not say who.

**The ruling is that the player chooses.**

*Decided 2026-10-17 from the batch-20 extract.*

---

## R129 — Friend or Foe's Rare Weapon tokens

**pg. 111; Phase 7.** Each Rare Weapon token becomes one of four rewards (pg. 111).

**The ruling is that the app follows it, the player choosing for each token as the mission ends.**

*Confirmed 2026-10-17 from the batch-20 extract.*

---

## R130 — The Graveyard's Humanity

**pg. 113; Phase 7.** The Graveyard lets every survivor gain or lose 1 Humanity (pg. 113).

**The ruling is that each survivor on the mission takes +1, −1 or neither, the player's choice**,
within 0 to 5.

*Confirmed 2026-10-17 from the batch-20 extract.*

---

## R131 — Medical Supply tokens are kept

**pg. 107; Phase 7.** Each Medical Supply token from Viral Mission 3 is 1 Labor toward bandages,
disinfectant, medicated wraps or inoculations (pg. 107). Where they are kept is not said.

**The ruling is that the base keeps a count of them, outside the storage caps**, each paying 1 Labor
of one of those builds, and unused ones are kept.

*Decided 2026-10-17 from the batch-20 extract.*

---

## R132 — Which origin missions can be played again

**pp. 103–115; Phase 7.** The Magic missions say they repeat (pg. 103); Viral Mission 1 is played
again until it succeeds (pg. 104); the rest are silent.

**The ruling is that Viral Mission 1 repeats until a point of interest is investigated and never
after, Viral Mission 2 repeats with one held zombie each time
([R104](#r104--bringing-it-on-home-adds-one-zombie)), the Cosmic missions may be chosen whenever a
team member has 4 or more Madness, and the Magic missions repeat as printed.**

*Decided 2026-10-17 from the batch-20 extract.*

---

## R133 — Berserk's Health is one more maximum while it is held

**pg. 88; Phase 7, Z7-1.** Berserk gives a survivor one more Health point between missions (pg. 88).
The book does not say whether that is a lasting point of maximum Health or a single point healed.

**The ruling is that a Berserk survivor's maximum Health is their Tier plus 1 for as long as they hold
the trait.** When it is replaced, Health above the new maximum drops to it.

**What it costs.** Read as one point healed, a Berserk survivor is no harder to bring down than
anybody else of their Tier.

*Decided 2026-10-17 with Z7-1.*

---

## R134 — Bonded doubles Labor with a bondmate on the team

**pp. 88, 90–91; Phase 7, Z7-1.** Bonded doubles Labor when two or more bonded survivors are on the
project team (pg. 88), and bonds are groups of bondmates (pp. 90–91;
[R84](#r84--what-a-survivors-sheet-records-for-traits)). The book does not say whether two Bonded
survivors of different groups count.

**The ruling is that a Bonded survivor's Labor doubles when somebody of their own bond group is on
the team with them.** Two Bonded survivors of different groups double nothing. This is the
"two or more bonded" of [R89](#r89--the-order-a-survivors-labor-is-worked-out-in)'s fourth step.

*Decided 2026-10-17 with Z7-1.*

---

## R135 — Driven leaves every stat tied for the highest alone

**pg. 88; Phase 7, Z7-1.** Driven raises every stat but the highest by 1 (pg. 88). Every Tier's stat
array has a single highest value (pg. 7), so a tie at the top arises only on a survivor whose stats
were edited past the rules, and the book does not cover it.

**The ruling is that every stat tied for the highest stays as it is**, and the rest rise by 1.
Nothing is chosen or stored: Driven is worked out from the stats each time they are read.

*Decided 2026-10-17 with Z7-1.*

---

## R136 — A story is attached to one survivor at a time

**pp. 87, 90; Phase 7, Z7-2.** A promotion offers five stories (pg. 87), and Left Behind attaches
Prepper's Stash only if nobody holds it already (pg. 90). The book does not say whether a promotion
may offer a story somebody else holds.

**The ruling is that a story is attached to one survivor at a time**, set-aside survivors included:
a promotion offers only the five nobody holds, and attaches none when all five are held. The save
refuses two survivors holding one story.

*Decided 2026-10-17 with Z7-2.*

---

## R137 — A Veteran may bring themselves up

**pg. 88; Phase 7, Z7-2.** A Veteran spends XP to bring any survivor at 0 Health up to 1 in the
Planning Phase (pg. 88). The book does not say whether the Veteran is one of them.

**The ruling is that they are**: a Veteran at 0 Health may spend 1 XP of their own on themselves,
and makes no Rot check that turn
([R91](#r91--a-veterans-healing-comes-before-the-rot-check)).

*Decided 2026-10-17 with Z7-2.*

---

## R138 — Part 2a's family member joins unbonded once Bonded is lost

**pp. 90–91; Phase 7, Z7-3.** Left Behind Part 1 bonds the rescued loved one to the attached
survivor (pg. 90), and Part 2a bonds the rescued family member to the attached survivor and all
their bondmates (pg. 91). Between the two the attached survivor can take another Story Trait,
which replaces Bonded ([R85](#r85--a-new-story-trait-replaces-the-old-one-and-veteran-stays)), and the book does not say
what the family member is bonded to then.

**The ruling is that the family member joins unbonded** when the attached survivor no longer holds
Bonded, and into their bond group when they do. Part 1's loved one joins the attached survivor's
group when they are Bonded already, and starts a new group with them otherwise.

*Decided 2026-10-18 with Z7-3.*

---

## R139 — A story done, or held, is not attached again

**pp. 87, 90, 99, 101; Phase 7, Z7-3.** Left Behind Part 1 attaches Prepper's Stash only if it is
not done or attached to someone else (pg. 90), and a story is complete once its rewards are taken
([R121](#r121--a-story-is-played-once-for-each-time-it-is-attached)). The book does not say whether
the other attachments, a promotion's or the next part of an arc (the Warehouse comes from both
Neighbor's Rifle and Crashed Convoy, pp. 99, 101), follow the same rule.

**The ruling is that every attachment does**: a story already attached to somebody, or done, is not
attached again, by a promotion or by another story's ending. A story is done once played to an
ending that neither keeps it attached nor attaches it again, so Sentimental Value not found and
Prepper's Stash Part 2 with its trap door shut are not done. A story attached by hand on the sheet
is a correction and is not held to it.

*Decided 2026-10-18 with Z7-3.*

---

## R140 — Part 2a's XP to the bondmates stands with a Teacher on the mission

**pp. 12, 18, 91; Phase 7, Z7-4.** Left Behind Part 2a sends Advancement Step 1's one additional XP
to the attached survivor and every bondmate instead, 1 each (pg. 91). A Teacher on the mission
replaces that point (pg. 12), and the book does not say which wins.

**The ruling is that the story's XP stands**: on a turn Part 2a is played, the attached survivor and
each bondmate in the community may be given 1 XP from that pool, whoever went on the mission, and a
Teacher's own pool is unchanged. A survivor or bondmate who has left the community is given nothing.

*Decided 2026-10-18 with Z7-4.*

---

## R141 — The Guard House safe's Crashed Convoy goes to whoever opened it

**pg. 120; Phase 7, Z7-4.** A roll of 1 on Left Behind Part 2a's Guard House safe attaches Crashed
Convoy (pg. 120), and the book does not say to whom.

**The ruling is that it is attached to the team member who opened the safe**, the player's choice,
if nobody holds Crashed Convoy and it is not done
([R139](#r139--a-story-done-or-held-is-not-attached-again)). The safe's other results are the
table's, added by hand.

*Decided 2026-10-18 with Z7-4.*

---

## R142 — Neighbor's Rifle's Tier 3 arrives with Long Guns, Dexterity 3 and a quality rifle

**pg. 99; Phase 7, Z7-4.** A Tier 3 survivor with Long Guns, Dexterity 3 and a quality rifle joins
when Neighbor's Rifle is attached to a Tier 3 survivor (pg. 99), built in full at the next Create
New Survivors ([R120](#r120--a-storys-new-survivor-joins-at-create-new-survivors)).

**The ruling is that the app gives those three and leaves the rest of the build to the player**: the
survivor is built as any Tier 3 stranger is, with Long Guns added at its first level, Dexterity
swapped to 3 within the Tier's stat array, and the quality rifle in their hands.

*Decided 2026-10-18 with Z7-4.*

---

## R143 — A survivor at full Health can be assigned to the Clinic to be inoculated

**pp. 21, 48; Phase 7, Z7-5.** An Inoculation is given to a survivor assigned to a Medical Clinic in
place of their healing ([R97](#r97--inoculation-is-built-then-given-at-the-clinic)), and the app
warns when somebody at full Health is assigned to healing (pg. 21). The book does not say whether a
survivor who has no Health to gain may take a Clinic place to be inoculated.

**The ruling is that they may, with no warning**: an Inoculation chosen for a survivor assigned to
healing is reason enough for them to be there, and the full-Health warning is not raised for them.

*Decided 2026-10-18 with Z7-5.*

---

## R144 — Experimental Data's two Hardware changes add up

**pp. 104, 116; Phase 7, Z7-6.** Containment, once Viral Mission 1 unlocks it, costs 2 more Hardware
if only one point of interest was investigated, and 2 less if the Broken Cage check passed
([R122](#r122--containment-is-unlocked-for-the-campaign)). The book does not say what happens when
both are true.

**The ruling is that they add up**: one point of interest and a passed Broken Cage check leave
Containment at its catalogue Hardware.

*Decided 2026-10-18 with Z7-6.*

---

## R145 — Viral Missions 2 and 3 are offered any time in a Viral campaign

**pp. 105–107; Phase 7, Z7-6.** Bring It On Home puts a zombie in Containment, and Medical Salvage
needs a held zombie ([R105](#r105--a-held-zombie-is-never-released)).
[R132](#r132--which-origin-missions-can-be-played-again) does not say whether Viral Mission 3
repeats, or whether either is offered before what it needs is there.

**The ruling is that both are offered on every turn of a Viral campaign, and played as often as the
player chooses.** The app does not hold either back for a missing Containment or held zombie: the
table knows what it is setting up. Viral Mission 1 still stops being offered once it unlocks
Containment.

*Decided 2026-10-18 with Z7-6.*

---

## R146 — Bring It On Home's extras are the player's, and only a Containment holds its zombie

**pp. 105–106; Phase 7, Z7-6.** A won Bring It On Home adds one held zombie, and the zombies beyond it
pay XP and the special zombies items
([R104](#r104--bringing-it-on-home-adds-one-zombie)). It can be played with no Containment built
([R145](#r145--viral-missions-2-and-3-are-offered-any-time-in-a-viral-campaign)).

**The ruling is that the app records how many ensnared zombies left the area, and adds the one held
zombie only when a Containment stands on the base.** Without one, nothing is held. The extras' XP
and the special zombies' items are added by the player.

*Decided 2026-10-18 with Z7-6.*

---

## R147 — Medical Supply tokens go where the Inventory goes

**pp. 54, 107; Phase 7, Z7-6.** The base keeps its Medical Supply tokens
([R131](#r131--medical-supply-tokens-are-kept)), and the book does not say what a move does to them.

**The ruling is that they follow the Inventory**: taken on a move that takes the Inventory, left on
one that leaves it, and lost in an overrun with it
([R78](#r78--an-overrun-loses-the-bases-inventory)).

*Decided 2026-10-18 with Z7-6.*

---

## R148 — Containment's Infection reaches only the survivors being healed

**pp. 48, 69; Phase 7, Z7-6.** Each held zombie takes 1 more Infection from each survivor assigned to
healing ([R103](#r103--containment-holds-a-count)), and an Inoculation is given in place of a
survivor's healing ([R97](#r97--inoculation-is-built-then-given-at-the-clinic)).

**The ruling is that a survivor given an Inoculation that turn loses no Infection to Containment**:
the Inoculation replaces their healing, Containment's included.

*Decided 2026-10-18 with Z7-6.*

---

## R149 — XP spent is counted from Z7-8 on

**pp. 18, 124; Phase 7, Z7-8.** The Lost roll adds the survivor's XP spent
([R108](#r108--the-lost-roll-is-once-a-turn-before-the-first-mission)), and a survivor's sheet does
not say what they bought: one created at Tier 3 paid nothing for it.

**The ruling is that every survivor keeps a count of the XP they have spent, from 0**, raised by
every purchase the Advancement Phase makes and by a Veteran's healing, which is XP spent too
(pg. 88). It starts at 0 for everybody already playing, and the sheet corrects it by hand.

*Decided 2026-10-18 with Z7-8.*

---

## R150 — No Lost roll on a turn without a mission

**pp. 25, 124; Phase 7, Z7-8.** The Lost roll is made once a turn, before the first mission, and a
success is placed on a mission
([R108](#r108--the-lost-roll-is-once-a-turn-before-the-first-mission)). The book does not say what
happens on a turn the community skips its mission.

**The ruling is that nobody rolls that turn**: with no mission to be placed on there is no roll, and
nobody gains its 1 XP.

*Decided 2026-10-18 with Z7-8.*

---

## R151 — A survivor lost to the Veil takes what they carry

**pg. 127; Phase 7, Z7-9.** At 0 Humanity a survivor is lost to the Veil and leaves the community
([R114](#r114--when-humanity-changes)). The book does not say what becomes of their items.

**The ruling is that they take them**, as any departure does
([R73](#r73--a-survivor-who-departs-takes-their-items)).

*Decided 2026-10-19 with Z7-9.*

---

## R152 — The Dark is recorded as played

**pg. 115; Phase 7, Z7-9.** No ruling yet covers what Magic Mission 3 gives.

**The ruling is that recording The Dark marks it played**, as before, and its rewards are added by
hand until they are settled.

*Decided 2026-10-19 with Z7-9.*

---

## R153 — The Necromancer's two rewards have two triggers

**pp. 114, 119; Phase 7, Z7-9.** The Necromancer gives the next spell 3 XP off, and killing him
takes 1 Labor off a Mystic Library and every upgrade to it
([R124](#r124--the-necromancers-rewards-are-stored)).

**The ruling is that winning the mission gives the spell discount, and killing the Necromancer gives
the Labor change**, each recorded on the outcome.

*Decided 2026-10-19 with Z7-9.*

---

## R154 — Any spell an enemy casts is seen, on any mission

**pp. 70, 126, 133; Phase 7, Z7-9.** A spell can be learned once an enemy has used it on the
table, and the spells seen are the campaign's
([R112](#r112--spells-are-per-survivor-and-the-ones-seen-are-per-campaign)). Vampire spawn and the
Necromancer cast from one table (pg. 133), and no mission, story or reward reveals a spell any
other way. The book does not say whether a cast with no target or no effect counts, or whether
the learner must have been on that mission.

**The ruling is that every cast counts, whatever it did, on any mission the campaign plays.** A
Magic campaign's mission outcome records which spells an enemy cast, and from then on any Mystic
Library can teach them.

*Decided 2026-10-19 with Z7-9, from the batch-21 extract.*

---

## R155 — A survivor knows each spell once, with no limit

**pp. 70, 126; Phase 7, Z7-9.** A learned spell is kept for good, with no uses or charges
(pg. 126). The book sets no limit on how many one survivor knows, and does not say whether one can
be learned twice.

**The ruling is no limit, and each spell once**: a survivor learns only spells they do not know,
and the sheet keeps each spell at most once.

*Decided 2026-10-19 with Z7-9, from the batch-21 extract.*

---

## R156 — No discretionary point on a turn without a mission

**pg. 18; [#256](https://github.com/travisboettcher/cr-z-assistant/issues/256).** The
discretionary XP is handed out after a mission (pg. 18). The app offered it on every turn, a turn
the community skipped its mission included, and a playtest read the book the other way.

**The ruling is that a turn nobody went out on a mission has no discretionary point.** A siege
that deployed the community counts as going out, as it does for mission XP (#167). Left Behind
Part 2a's redirect of the point (R140) always comes with a mission, so it is unchanged.

*Decided 2026-10-20 from pg. 18.*

---

## R157 — A mission from outside the book counts strangers, and rolls its materials

**[#259](https://github.com/travisboettcher/cr-z-assistant/issues/259).** A table may play a
mission the book doesn't print, a Patreon release or a homebrew, and the book can't say what one
records.

**The ruling is that an Other mission is named at Select Mission and offered whenever the standard
missions are**, never on turn 1 or a siege turn, where the book fixes the mission. **Its outcome
records the team's wounds and the strangers rescued**, who join at Create New Survivors as any
mission's do, **and its materials are rolled at Add Materials to Storage** like every mission's but
Gather Materials'. Anything particular to the mission is the table's to add by hand.

*Decided 2026-10-20.*
