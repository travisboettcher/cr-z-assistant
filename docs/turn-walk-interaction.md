# Walking the turn — the shared screen for Phase 3

The design four screens hang off, drawn before they are built. Phase 2 did the same thing with
[`base-slot-interaction.md`](base-slot-interaction.md) and one card design survived four stories;
this is the same bet on the same reasoning. The Planning, Advancement and two Management stories
all live *inside* this frame, and a frame designed after its contents is a frame shaped by
whichever content came first.

Written with [Z3-3](phase-3-stories.md#z3-3--the-turn-counter-and-the-phase-walk), which ships
the frame and nothing inside it.

## The one sentence

**A campaign is at exactly one step of the turn, and from there it can go back one, forward one,
or forward to the next phase.**

That is the whole model. The turn is a line of nineteen steps in four phases (pg. 17–23); the
campaign is somewhere on it; three moves lead off that spot. Everything below is a consequence.

There is no fourth move. You cannot jump to a phase by name, and the reducer is where that is
enforced rather than the screen — `turn/advanced` carries no destination, only whether it is
moving by a step or by a phase, so a screen can offer the wrong button but cannot invent a turn
that runs Management before Planning.

## Why the campaign stores a step and not a phase

`Campaign.phase` was a stored field from Phase 0 and is gone. Storing both a step and a phase
would be a redundant pair that can disagree — a step belongs to exactly one phase, so the phase
is a lookup, and derived is never stored.

Storing the finer of the two is not fidelity for its own sake. **Three Management steps are
destructive**: Check for Rot removes survivors, Feed subtracts Food, Check Storage destroys the
surplus (pg. 22–23). A campaign that came back from a closed tab at "somewhere in the Management
Phase" would have no way to know which of those had already happened, and doing one of them twice
costs a player their community.

## The three moves, and which one asks

| Move | Control | Asks first |
|---|---|---|
| Back one step | A quiet secondary control | No |
| Forward one step | The primary button | Only when it ends the turn |
| Forward to the next phase | A secondary control named for the phase it opens | Only when it ends the turn |

**Back exists because tables correct themselves.** Somebody presses Next twice mid-conversation
and needs to be where they were. It stops at the first step of the turn and deliberately does not
reach into the turn before: that turn took materials, Health and sometimes survivors with it, and
"back" cannot put those back. Undo is Phase 8's, and it will be something the log records rather
than something the walk does quietly.

**Ending the turn is the one move that asks**, because it is the one that is awkward to walk back
— see above. Every other move is one press away from being undone by the press next to it, and a
confirmation on those would be a dialog that trains people to dismiss dialogs.

**Skipping to the next phase is forward, not sideways.** A table that settles its whole Planning
Phase in one conversation should not press Next four times to say so. It cannot reach a phase out
of order, so it is the same guarantee at a coarser grain.

## What the screen shows

Three bands, in decreasing permanence:

1. **The four phases**, as a strip. Which one you are in, and nothing clickable — the strip is
   orientation, not navigation. Made of the same `PHASE_LABELS` the header uses.
2. **This phase's steps**, in the book's order, with the current one marked. Steps behind you read
   as done and steps ahead as waiting; both are legible at arm's length, because the question this
   band answers is "how much of this phase is left".
3. **This step**: its name, its page citation, and the three moves.

The header keeps turn, phase and step pinned above all of it. That is deliberate duplication: the
header is what stays put while the rest of the screen scrolls, and "where are we?" is the question
a tablet on a table gets asked most.

## What goes *inside* a step, and what does not

Z3-3 ships the frame empty. Every later story fills in one or more steps:

| Step | Story |
|---|---|
| Assign Facility Staff → Assign Mission Team | [Z3-6](phase-3-stories.md#z3-6--the-planning-phase) |
| Character Advancement → Add Facilities and Upgrades | [Z3-7](phase-3-stories.md#z3-7--the-advancement-phase), with Heal Wounds from [Z3-8](phase-3-stories.md#z3-8--heal-wounds-and-the-equal-distribution-rule) |
| Check for Rot → Assign Beds | [Z3-9](phase-3-stories.md#z3-9--management-phase-steps-13-check-for-rot-feed-assign-beds) |
| Calculate Unrest → Departures | [Z3-10](phase-3-stories.md#z3-10--management-phase-steps-47-unrest-storage-the-horde-departures) |
| The three Mission Phase steps | Phase 4 — here they are a doorway and the outcome is typed in |

**The screens that already exist stay where they are.** The roster and the base sheet are not
steps and do not move into the walk: a player looks up a survivor's Skill Score whenever they
want, not only during Character Advancement. What the walk adds for those is a *note* on the step
that owns them — "this is where facilities go up" on Add Facilities and Upgrades — rather than
hiding the screen everywhere else. Phase 2 shipped building as always-available on purpose, and
[Z3-7](phase-3-stories.md#z3-7--the-advancement-phase) turns building out of step into a warning
rather than a refusal for exactly this reason.

## What the walk records

Moving into a new phase logs `phase-entered`. Ending a turn logs `turn-began` **and nothing else**,
though it enters a phase too — "turn 4 began" already says the Mission Phase is open, and two
entries for one press is the log narrating rather than recording.

Moving inside a phase logs nothing. Nineteen entries a turn for pressing Next is a history nobody
reads, and the log's rule is already the right one: it records what happened to the community, not
every click that got there.

**Back logs nothing either**, by that same rule. Stepping back is a correction to the record. What
it leaves behind is a `phase-entered` for a phase you then left and re-entered — two entries for
two real crossings, which is the truth rather than a tidied version of it.

## What this design is not doing yet

- **No step is refused.** The walk guides; it does not gate. A table sometimes does things out of
  order and then corrects itself, and the app must not be the reason a game stops. When a step
  gains something checkable — every survivor assigned, the Food counted — that becomes a *warning*
  in the [`Check`](../src/engine/checks.ts) shape Phase 2 established, behind the same never-stored
  override. Z3-3 ships no warnings because it has nothing true to warn about, and a check that
  always returns nothing is a guess about the future dressed as a feature.
- **No automatic anything.** Advancing does not apply a step's effects. Every consequence in Phase
  3 is applied by a named, confirmed action inside its step, because three of them remove survivors
  or destroy materials — see [the decision on consequences](phase-3-stories.md#decisions-recorded-rather-than-left-to-the-implementation).
- **No turn history navigation.** You cannot walk back into turn 2 to look at it. The campaign log
  is where a finished turn lives, and it is a record rather than a place you go.
