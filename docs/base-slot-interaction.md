# The slot card: one interaction, four stories

Z2-5 through Z2-8 each add a verb to the same object. Building into a slot, clearing one,
upgrading a facility and assigning Power and Water are four different things a player does to a
Facility Slot, and if each story invents its own control the card ends up with four buttons and
no shape — on a tablet, in a grid of nine.

This is the sketch the four of them fill in. It is written before Z2-5 rather than after Z2-8 so
that the last three stories complete a design instead of each negotiating with the previous one.

## What makes this tractable

**A slot is in exactly one state, and each state has at most two verbs.**

| Slot state | What you can do | Story |
|---|---|---|
| Blocked by rubble | Clear it | Z2-7 |
| Empty | Build a facility | Z2-5 |
| Occupied | Add an upgrade · Assign Power and Water | Z2-6 · Z2-8 |

So the card never shows four actions. It shows one, or two. That is the whole reason this fits
on a card at all, and it falls out of the rules rather than out of a layout decision — which
means it stays true as the stories land.

## The card is a summary; the actions expand inside it

Tapping a card's action opens a region **inside that card**, and only one card is open at a time.
Not a dialog, and not a panel below the grid.

- **A dialog** would need focus management and an escape hatch for every one of the four verbs,
  and it hides the rest of the base at the moment a player is deciding what to do with it. The
  existing dialog in `SurvivorRoster` confirms a destructive action, which is what dialogs are
  good at; none of these four are destructive.
- **A panel below the grid**, the way `SurvivorSheet` opens under the roster, works for a survivor
  because a character sheet is a page of its own. A build form is four controls. Sending the
  player's eye to the bottom of a nine-card grid and back for four controls is worse than
  expanding in place.
- **One open at a time** keeps the grid from doubling in height, and matches how `App` already
  holds `openSheetId`: which card is open is UI state, never campaign state, and never reaches
  the save file.

## Every verb has the same four parts, in the same order

Whatever the verb, the expanded region reads:

1. **What you are choosing** — a facility, an upgrade, a utility. Absent for clearing, which has
   nothing to choose.
2. **What it costs** — Hardware and Labor, from the rules data, shown before the button rather
   than discovered after it.
3. **What is wrong with it**, if anything — the violations, each citing its page.
4. **The button**, and the override where an override applies.

A player learning one verb has learnt all four. More usefully: a reviewer reading the fourth
story can tell whether it followed the design without holding the other three in their head.

## Blockers and warnings are different things

The check for every verb returns two lists, and they behave differently:

- **Blockers** stop the action. The slot is occupied, the rubble has not been cleared, there is
  not enough Hardware, there is not enough Labor. The button is disabled and says why.
- **Warnings** are rules the player may break on purpose. The facility wants an Indoor slot and
  this one is Outdoor; the facility belongs to an origin this campaign is not running; it is
  unlocked by a mission this version does not track yet. The button stays live behind an explicit
  override, exactly as Z1-7's survivor override works, and **the override is not stored** — it
  gates the action once, and the base keeps reporting the violation for as long as it stands.

**Affordability is deliberately a blocker, not a warning.** Overriding "not enough Hardware" would
mean spending materials the community does not have, and the honest fix for a wrong count is to
correct the count — which the player can already do — rather than to let the app carry a negative
one. House rules are about how the game is played; arithmetic over a number the player controls
is not a house rule. Nothing in the book says what a base with −2 Hardware means, and this app
should not be the first to say it.

## Labor is entered once, above the map

Not per card. The Labor pool comes from the project team (pg. 20) and is spent across every
project a turn — clearing one slot and building in another draw on the same pool. A field per
card would say the opposite, and would have to be kept in sync four ways.

It is **UI state, not campaign state**: the pool is Phase 3's, and until the Planning Phase exists
there is nothing to store it on. This is the same posture Phase 1 took with XP, which was typed
in by hand until Phase 3 could award it. What the app enforces today is that a build costs Labor
and can be refused for want of it — the rule — while where the Labor came from waits for the
phase that knows.

## What each story adds

| | Adds to the card | Adds to the engine |
|---|---|---|
| **Z2-5** | The action region itself, on empty slots: a facility picker, the cost line, violations, the override | `checkBuild`, `withFacilityBuilt` |
| **Z2-6** | An "add an upgrade" action on occupied slots, using the same four parts | The cap, the exemption, the same-turn rule |
| **Z2-7** | A "clear" action on blocked slots — no picker, a Labor cost, and the yield | The clearing project |
| **Z2-8** | Two toggles on occupied slots, and a pool readout above the map next to Labor | Pool sizes, assignment, over-assignment |

Z2-9 adds no verb. It puts the derived numbers — beds, storage caps, production, the Siege Threat
contribution — above the map, where the Labor field and the utility pools already are, so the
whole base reads as a sheet with the slot map inside it rather than as a grid with statistics
bolted on.

## What this sketch does not decide

How the base sheet's summary is laid out, which is Z2-9's to design when it can see all the
numbers at once. And anything about Phase 3: staffing a facility is an assignment, it belongs to
the Planning Phase, and it is not a verb on this card.
