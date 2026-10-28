# Assigning survivors, and equipping them, on one board

How the Planning Phase's assignments, turn 1's First Mission team and Equip the Mission Team are
drawn and changed. Written for
[#237](https://github.com/travisboettcher/cr-z-assistant/issues/237), from the UX review of
2026-10-16 ([#229](https://github.com/travisboettcher/cr-z-assistant/issues/229)), before any of
it is built. It is the assignment half of [`step-records.md`](step-records.md), and it keeps every
decision [Z3-4](phase-3-stories.md#z3-4--assignments-and-schema-v8),
[Z3-6](phase-3-stories.md#z3-6--the-planning-phase) and
[Z5-4](phase-5-stories.md#z5-4--equip-mission-team) recorded: this changes how assignment looks and
is pressed, not what an assignment is.

## What the play-through found

- **Six lists over one roster.** Facility staff, the project team, resting, healing, each mission
  team and scavenging are each a list of checkboxes, one per survivor, spread over four steps. With
  three survivors, Rest and Healing alone was two lists and nine warnings.
- **Unticking loses a task.** Ticking Tom onto the project team takes him off the Kitchen, and the
  "currently working the Kitchen" hint says so first. Unticking him leaves him with nothing, not
  back in the Kitchen. `AssignTask` reasons that a warned row needs no override because "a tick
  that can be unticked" is reversible, and it is only half reversible.
- **"N with nothing to do" on every step.** At Assign Facility Staff, the first of four, it reads
  as a warning about survivors the next three steps exist to use.
- **Turn 1's team took guessing.** The First Mission's checkboxes and the separate "Mission team 1"
  box beneath them didn't say how they were connected.
- **Equipping is a column of controls.** Each carried item is a `<select>` and a Move button, and
  each survivor a "Take for…" `<select>` and a Take button. Three survivors and four items is
  fourteen controls stacked down the step.

## What makes a board the right shape

**The model already is one.** `assignments` maps each survivor to at most one task (pg. 20), and
that is structural rather than validated (Z3-4). A board with a lane per task and a card per
survivor draws exactly that: a card is in one lane, and moving it is the only change there is.
Nothing about the data changes.

| Lane | Assignment | Shown on the lane |
|---|---|---|
| Each staffable facility, by slot | `{ task: 'staff', slot }` | how many it takes (`staffCapacity`), and who is over it |
| The project team | `{ task: 'project' }` | the Labor it generates, and how much is left to spend (#235) |
| Resting | `{ task: 'rest' }` | |
| Being healed | `{ task: 'healing' }` | the Health the base makes, when it has a Medical Clinic |
| Each mission team, and one more | `{ task: 'mission', team }` | the team's number, and its mission once chosen |
| Scavenging | `{ task: 'scavenging' }` | |
| Nothing to do | no entry | |

## Lanes, not columns

Seven or more columns do not fit a portrait tablet, and do not fit a phone at all. **A lane is a
row**: its name and what it shows, then its cards, which wrap. Lanes stack down the step. That is
the same reading direction as everything else in the walk, and it scrolls the way a phone already
does.

**On a tablet the lanes sit in two columns** (`Board.tsx`; decided 2026-10-17). What can be picked
up is on the left: "Nothing to do" and "Elsewhere" in the Planning Phase, and the base's
Inventory, the free shoddy gear and the vehicles at the base at Equip the Mission Team. Where it
goes is on the right, and scrolls on its own, so a long roster does not push the card being moved
off the screen. Narrower than a tablet the two stack, the left one first; a phone gets its own way
of choosing where a card goes, a sheet of destinations, as the next piece of work.

**Every card is the same shape**: one width, a name that wraps rather than being cut off, and a line
or two about it (Tier and Health, slots, Fuel). The name is what the card is called to a screen
reader, and the lines describe it.

## Moving a card

**Press a card, then press the lane it goes to.** The card shows it is picked up, and every lane
offers a "Move Tom here" button, in a dashed amber zone across the lane's width so it cannot be
mistaken for one more card. A lane that would refuse the card shows a grey zone with the reason
and nothing to press. Pressing one assigns Tom there, and pressing the card again puts
him down where he was. "Nothing to do" is a lane like the others: moving a card there clears the
assignment.

**Dragging is added on top, never instead.** WCAG 2.2's "dragging movements" requires a
single-pointer way to do anything a drag does, and on a tablet propped on a table a press is surer
than a drag anyway. Dragging can come later, as a second way to make the same move.

**Every move is one `assignment/set` or `assignment/cleared`**, the actions the checkboxes dispatch
today. Moving a card back puts the assignment back, so the reasoning `AssignTask` gives for having
no override finally holds: a warned move is undone by the move next to it.

**Warnings stay warnings** (Z3-6: eight codes, no blockers). A card shows its own (already at full
Health, so resting does nothing), and a lane shows its own (takes 1, so Harry is here and not
working). Neither stops a move.

**A card says who and what**: the survivor's name, Tier and Health, as the roster card does. It is a
button, so a screen reader hears "Tom, Tier 2, 2 of 2 Health, working the Kitchen", and the lanes'
"Move Tom here" buttons are reached in reading order.

## The steps stay, and focus their lanes

The book's order (pp. 20–21) stays the walk's: Assign Facility Staff, Assign Project Team, Assign
Rest and Healing, Assign Mission Team. Each step draws **the same board**: its own lanes, which are
where a card can go; **Elsewhere**, holding everybody with a task from another step, each card
saying what it is ("working the Kitchen"); and **Nothing to do**. A card in Elsewhere can be picked
up and moved into this step's lanes, but nothing is moved into Elsewhere: a task from another step
is given at that step. "Nothing to do" is always there, because every step draws from it.

- **"N with nothing to do"** stops being a line on every step. It is the Nothing to do lane. Whether
  it is owed at the last step is an open question, below; until it is decided it is shown and not
  owed.
- **Utilities** (Power and Water, assigned at the end of Assign Facility Staff) stay where they are,
  on the base's slot cards. The facility lanes show whether each is supplied, as the step does now.
- **The base's slot cards keep their staffing control** (Z3-6 kept it on purpose, because a
  facility's staff and what it makes belong together). It reads and writes the same assignment, so
  the two cannot disagree. [`base-slot-interaction.md`](base-slot-interaction.md) still says
  staffing "is not a verb on this card". That predates Z3-6, and this pull request corrects it.

## Turn 1's First Mission

The First Mission's team is the same board with two lanes, the First Mission and Nothing to do.
There is no choice of mission beside it (#237): turn 1 offers the First Mission and nothing else,
so team 1 plays it without anybody choosing it (`turnMissions`). Its outcome is owed from the
moment somebody is on the team. A First Mission that met no end condition is played again with one
press, "Play the First Mission again", which is the one place the choice is still made (R21). Once
the outcome is recorded, the lane becomes a record ([`step-records.md`](step-records.md), R2).

## Equipping on the same board

Equip the Mission Team is the same interaction one level down: **items are cards, and survivors are
lanes**.

| Lane | What it holds | Shown on the lane |
|---|---|---|
| Each survivor going out, by team | the items they carry | slots in use of their total, in amber when over |
| The base's Inventory | its items | |
| Shoddy, free | one card per shoddy item this team's skills allow (R35) | taking one makes a new item; setting one down returns it here, never to the base |

Press an item, then the survivor or the Inventory it goes to. Each move is one `mission/itemMoved`
with the `EquipMove` it dispatches today, so `item-moved` entries, R38's who-moves-what and the
refusals are unchanged.

- **A blocker is drawn on the lane** that would refuse the item ("No slot free"), and that lane
  offers no Move button for it. A survivor with no slot free shows what to set down instead of a
  disabled Take: their lane holds their items as cards, each one a press from going elsewhere.
- **A warning keeps the never-stored override** Z5-4 gives it today (a rifle handed to somebody
  without the skill to use it): the lane's Move button asks once, "Move it anyway" or "Leave it".
- **Two of the same shoddy weapon** is an open question for the book (#241), not this design.

Vehicles (`VehicleBoard`) are a second, smaller board on the same step: the base's vehicles and
each team, a vehicle card in one of them.

## Work, in order

| | Adds | Engine |
|---|---|---|
| **B1** | The board, used by the four Planning steps; `AssignTask` removed from them. *Built (#237).* | none: the same two actions |
| **B2** | Turn 1's First Mission on the board. *Built with R2 (#237); its mission choice since removed, turn 1 having one mission.* | none |
| **B3** | Equip the Mission Team on the board, items as cards. *Built (#237).* | none: the same `EquipMove`s |
| **B4** | Vehicles on the board. *Built (#237).* | none |

B1 is the largest and goes first. B2 needs [`step-records.md`](step-records.md)'s R2 for its
record. The base's slot card keeps its list throughout.

## Open questions

- **Is somebody with nothing to do owed?** Z3-6 says leaving somebody idle by accident is "the
  commonest mistake this screen exists to prevent". Owing it at Assign Mission Team would make Next
  ask (#234) each turn somebody is idle, including on purpose. Owe it, show it only, or owe it only
  when everybody was idle last turn too? *Decided 2026-10-28: shown, not owed.* The
  Unassigned lane shows who is idle, and Next doesn't ask. Leaving somebody idle on purpose is
  common enough (holding back a wounded survivor, resting without a Clinic) that asking every turn
  would teach players to press past it.
- **One board or four?** *Decided 2026-10-16: four.* The four steps stay, each focusing its lanes,
  because the walk follows the book's step list. One Planning step showing the whole board was the
  alternative.

## What this design does not decide

- **Dragging**, which is an addition for later.
- **Anything about what an assignment does**, which is Z3-5's and the rulings'.
- **The layout of a card** beyond what it names, which follows the roster card.
