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
