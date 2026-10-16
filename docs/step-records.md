# A step is a form until it is recorded

What a turn-walk step shows before its action is taken and after. Written for
[#236](https://github.com/travisboettcher/cr-z-assistant/issues/236), from the UX review of
2026-10-16 ([#229](https://github.com/travisboettcher/cr-z-assistant/issues/229)), before any of
it is built: it changes how several screens behave, and CONTRIBUTING asks for that to be agreed
first. It sits inside [`turn-walk-interaction.md`](turn-walk-interaction.md), which is the frame,
and beside [`assignment-board.md`](assignment-board.md), which covers the steps whose forms are
assignments.

## What the play-through found

A player could not tell an unsaved draft from a recorded fact, because the screen drew them the
same way and often side by side:

- **Drafts lost without a word.** Choose for team 1, Add to storage, Record the First Mission,
  Record what team 1 used and Feed the community each wait for a separate press. Next used to leave
  without it (#234 now asks), and the draft went with the step.
- **A draft beside its own record.** Select Mission shows "Mission team 1 chose the First Mission"
  above a mission `<select>` that is a new draft. Change the select, don't press the button, and the
  sentence and the control disagree with nothing saying which counts.
- **Facts still editable after they happened.** The First Mission's checkboxes stay live after the
  mission is played, and unticking somebody rewrites who went. Survivor stats stay `<select>`s
  forever, and a stray press moves values that Inventory Slots and every Skill Score read.
- **A record that changes after the fact.** Select Mission's sentence names the team as it is
  *now*. Untick Harry and "chose the First Mission: Tom, Dick, Harry" becomes "Tom, Dick", though
  the entry it reads stored the names it was recorded with.
- **One outcome, two forms.** "Somebody died on mission team 1's mission" appears only after Record
  the First Mission, as a second form with its own button, though a death is part of how the
  mission ended.

## What the code already does well

Most steps already have the right shape, and the rule below is theirs, written down:

| Step | Before | After |
|---|---|---|
| Add Materials to Storage | the rolls and Add to storage | "This turn's materials are already in storage. Stepping back through the walk won't add them twice." |
| Heal Wounds | the shares and Heal wounds | "This turn's wounds are healed…" |
| Feed your Survivors | the meal and Feed the community | "This turn's Food is eaten…" |
| Check for Rot, Check Storage, Check the Horde, Departures | the roll or choice and its button | a sentence saying what happened, and that stepping back won't do it twice |
| Play the Mission (outcome) | every count, and Record | `describeOutcome`'s sentence |
| Play the Mission (vehicles) | which came home, and Record | the log's sentence |

Each of these records once, and the engine refuses a second record (`materialsAdded`,
`woundsHealed`, `survivorsFed` and the rest). The form disappears, and a sentence in the log's own
words takes its place.

## The rule

**A step that records something is in one of two states, and draws only that state.**

1. **Form**, while the step owes its record (`outstanding`). Every control is a draft until the one
   button that records it, and that button is the step's amber action (#231). Nothing is
   dispatched before the press.
2. **Record**, once it is recorded. A sentence in the words the campaign log uses, read from the
   entry that was written, never from the campaign as it is now. No control on it changes the
   record silently.

**A record that the engine can take back offers Change.** Change is a secondary button. It
reopens the form filled in with what was recorded, and recording again appends a new entry, the
log's existing "latest wins" (Select Mission's choices, the siege stand-ins), or uses the un-record
action the engine already has (a vehicle left home). The log stays append-only. This is not undo:
it is the same press as the first, made again on purpose.

**A record the engine refuses to repeat shows no Change**, and says why in the sentence it already
has: "Stepping back through the walk won't eat it twice". Taking those back is undo, which is
Phase 8's (`turn-walk-interaction.md`), and this design does not pull it forward.

**A fact read after it happened reads what was recorded.** Where a later edit can change what a
record says, the record reads its own entry (Select Mission's `names`, which `turnMissions`
currently drops). Where a later edit can change the fact itself, the control that edits it is
behind Change, with a warning naming what reads it.

**Everything about one outcome is one form.** The parts of how a mission ended are recorded by one
press, in the order the engine needs them.

## What it means for each step that breaks it

| Step | Today | Under this design |
|---|---|---|
| Select Mission | the record, and beside it a live `<select>` and "Choose again" | the record, read from the entry's stored names, and a Change button that reopens the form |
| Select Mission, turn 1 (`FirstMission`) | the team's checkboxes stay live on all three Mission steps, and lock only when Planning begins | the team is a form until the First Mission's outcome is recorded, then a record ("Tom, Dick and Harry went on the First Mission") with Change behind a warning: mission XP and the haul's substitutions read it |
| Play the Mission | outcome, then a separate deaths form after it, then what was used, then vehicles, then "The app doesn't cover this step yet" | one outcome form that includes who died; then what was used; then vehicles. Each a form until recorded and a record after. The stale line goes |
| What a team used (`MissionSpent`) | the form stays while the team carries anything, and can record again and again | a form until recorded once, then a record. "Nothing was used up" is an answer, recorded the same way |
| Siege stand-ins (`SiegeWork`) | a `<select>` that dispatches on change | unchanged in behaviour (latest wins, `by: null` takes it back), drawn as a record with Change once chosen |
| Add Materials to Storage | "Add a roll" is a `<select>` that appends a row and resets | the d10's faces as ten buttons, each press adding a roll. The rolls stay a persisted draft, as now (`pendingRolls.ts`) |
| Survivor sheet stats | live `<select>`s, dispatching on change | values, with "Edit stats" opening the `<select>`s and naming what reads them. Health, Infection and XP already use draft-then-save (`EditableNumber`) and keep it |

The Planning steps and Equip the Mission Team are forms made of assignments and moves, and the
board in [`assignment-board.md`](assignment-board.md) is their design.

## The parts a recorded step draws, in order

The same discipline as the slot card's four parts
([`base-slot-interaction.md`](base-slot-interaction.md)), for a step:

1. **What is being recorded**, the controls, all of them drafts.
2. **What is wrong with it**, if anything: blockers and warnings, each citing its page.
3. **The button**, amber while the step owes it.

And once recorded:

1. **The record**, a sentence read from its entry.
2. **Change**, when the engine can take it back. Absent otherwise.

## Work, in order

Each is one pull request, and each changes one step:

| | Step | Engine | Screen |
|---|---|---|---|
| **R1** | Select Mission | `turnMissions` keeps the entry's `names` | the record reads them; Change replaces the live `<select>` |
| **R2** | First Mission team | a question for "the First Mission's outcome is recorded" (it may already exist in `missions.ts`) | the team locks into a record there; Change warns what reads it |
| **R3** | Play the Mission | none, or a composite form if one press must record the outcome and a death together | deaths move into the outcome form; what was used records once; the stale line goes |
| **R4** | Add Materials | none | the roll pad |
| **R5** | Survivor sheet | none | stats behind Edit |

R1 and R4 stand alone. R3 is the largest and is the one to read most carefully in review.

## Open questions

- **A mis-pressed "+1 XP".** R7 says a point handed out stays handed out when the team changes
  later, which is a ruling about the team. A mis-tap is a different thing, and taking it back is
  undo. Pull a narrow undo for it forward from Phase 8 (a logged "taken back" entry, the newest
  award only, this step only), or leave it for Phase 8?
- **R3's one press.** If recording a death has to follow the outcome in the engine, the outcome
  form either submits twice in order (and shows the death form again if the second is refused) or
  needs one composite engine form. Which is decided when R3 is written, with the engine in front of
  it.

## What this design does not decide

- **Undo in general**, which stays Phase 8's.
- **The assignment and equipment forms**, which are [`assignment-board.md`](assignment-board.md).
- **Wording** beyond what a record says, which follows [`writing.md`](writing.md) as usual.
