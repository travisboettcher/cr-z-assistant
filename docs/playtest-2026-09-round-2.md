# Playtest — September 2026, round two

Round one's 35 findings were fixed and its issues closed. This round asked two questions: **did the
fixes hold**, and **what did the fixing introduce**. Four passes, ~25 turns of play across eight
campaigns and five bases.

**The suite was green either side: 1440 tests (up from 1137), typecheck and lint clean.** As in
round one, nothing here is reachable from the tests the code was written against.

| | |
|---|---|
| Round one Highs | **7 of 7 fixed** |
| Round one Mediums | 13 fixed, **5 partial** |
| Round one Lows | 11 fixed, 2 still open, 1 was never a bug |
| New this round | **3 High, 9 Medium, 9 Low** |

## The finding behind the findings

**Every High this round is an integration failure, not a rules failure.** Nobody in either round has
found a wrong number in `src/data`. What round two found is the same shape three times over: a new
abstraction, correct and well tested, wired into only some of the places that needed it.

| introduced | correct in | missed |
|---|---|---|
| `suppliedOccupants` — resolves the Dam's blanket supply and "a point nothing generates does not count" | 3 call sites | **6 call sites** |
| the project queue | Labor checks | **4 validator checks** |
| `pendingRolls` — material rolls that survive a reload | reload | **import, which replaces state without remounting** |

This class is invisible to everything this repo already runs. Unit tests on the new function pass,
because the function is right. The mutation score holds, because the untouched call sites are still
covered by their own tests — which assert the old behaviour and pass. And round one's grep for
unread data fields does not reach it: a grep for "exported symbol with no caller" returned
`suppliesEveryFacility` as a **false positive**, because it *is* called, once, by the one caller that
was updated.

**The check that finds this is architectural, not textual** — "every campaign-level caller uses the
resolved form", "every validator consults pending state" — a lint rule or import-boundary test in
the same spirit as the existing rule keeping React out of `src/engine`.

---

# High

## R2-H1 — `suppliedOccupants` is read by 3 call sites and ignored by 6

Found independently by three of the four passes, from three directions.

`base.ts:43` states the contract: "`suppliedOccupants` is what every campaign-level caller should
pass; `occupants(base)` alone answers the narrower question of what is standing where." Two
campaign-level rules live only in the resolved form — the Hydroelectric Dam's supplies-everything
special (pg. 61), and the round-one fix that a utility point with no generator behind it does not
count (#111). `occupants(base)` sets `power`/`water` from the stored slot flag alone (`base.ts:179`).

| call site | decides | list |
|---|---|---|
| `feeding.ts:179` | beds | **resolved** ✅ |
| `materials.ts:202` | storage caps | **resolved** ✅ |
| `base.ts` (siege) | base threat features | **resolved** ✅ |
| `materials.ts:117` | **base production** — every halving, Refrigerator, Biofuel Lab, Metal Shop | raw ❌ |
| `healing.ts:97` | Medical Clinic Health, halved without Water | raw ❌ |
| `experience.ts:156` | Training Room XP, halved without Power | raw ❌ |
| `rot.ts:76` | Clinic staff Medicine for the Rot target | raw ❌ |
| `conversions.ts:85` | Generator / Well Pump conversions | raw ❌ |
| `BaseSlotMap.tsx:267` | "Supplied with Power" on the slot card | raw ❌ |

**Proven in both directions.** On the Dam at a combined Utilities Score of 10 (threshold 6), a
Workshop staffed by Mechanics 4 produced **2 Hardware** — halved for want of Power the special should
have supplied. On the Distillery, a Biofuel Lab requiring Power produced **+1 Fuel with nobody on the
Station**, the slot card reading "Score spent 1 / 0".

This subsumes round one's #107 (the Dam) and #111 (the unbacked point), both closed. Commit
`09576b8`'s message claims production was covered; it is not.

**Fix:** pass `suppliedOccupants(campaign)` at each ❌ site, as three callers already do.

## R2-H2 — The project queue's validators were never taught about the queue

All three project validators import exactly one thing from `projects.ts`:

```sh
grep -rn "from './projects'" src/engine/build.ts src/engine/upgrade.ts src/engine/clearing.ts
# all three: import { laborRefusal } from './projects';
```

**Labor is the only queue-aware check any of them makes.** Every other question is answered from
installed state, so anything can be ordered twice in one Planning Phase:

| check | source | blind to | observed |
|---|---|---|---|
| slot occupied | `build.ts:94` | a facility on order there | two facilities ordered into one slot; only one lands, **3 Hardware destroyed silently**, no log entry, no refund |
| 3 upgrades per facility | `upgrade.ts:139` | upgrades on order | four Herb Plots → "**4 of 3**"; five Spotlights → "5 of 3" |
| `maxPerFacility` | `upgrade.ts:158` | copies on order | two Greenhouses on one Garden despite `maxPerFacility: 1` |
| already cleared | `clearing.ts:74` | a clearing on order | two clearings on one slot both complete — **the rubble pays out twice**, Hardware 19 → 23, log prints "Cleared the Pews 2." twice |

One validator change closes all four. A related fifth: the replacement discount is applied to *every*
queued Greenhouse, so two 4-Hardware upgrades cost 6 (`projects.ts:64` → `base.ts:477`).

## R2-H3 — Importing a campaign mid-step commits the previous campaign's dice

`AdvancementPhase.tsx:214` seeds its roll list from `pendingRolls` once, with a comment saying so:
"Seeded from the store, never synced with it… a reload is a remount." **An import replaces the
campaign without remounting.**

Import a campaign while *Add Materials to Storage* is open, and the incoming campaign is credited
with dice rolled for the outgoing one — observed as campaign Beta permanently gaining 2 Hardware
rolled for campaign Alpha. The step is one-shot with no undo, and a later reload shows an empty list,
so the numbers change under the player.

A new failure mode created by the #96 fix: persisting the rolls was right; the persistence and the
component's lifetime assumption disagree.

---

# Medium

## R2-M1 — The Watchtower slot card sums lookouts where the engine takes the best

`production.ts:203` routes `reducedByBestOf` through `combinedScore`, which **sums across staff**
(`production.ts:75`). `siegeThreatReduction` (`base.ts:348`), which feeds the actual total, takes the
**best single Score** — which is the rule (pg. 73, one lookout watching with whatever they are best
at). The comment directly above the summing call says "the staff's *best* of the four, not their
total".

Observed −11 on the card against −6 in the total, and −8 against −5. Latent until this round: it took
the #100 `extraStaff` fix to let two lookouts share a tower.

## R2-M2 — Turn 1's First Mission panel stays live through Planning and steals assignments

`FirstMission.tsx` has no `planningHasBegun` guard. After Planning begins the panel shows nobody on
the First Mission — while the Advancement Phase still correctly knows who went — and ticking a name
writes `{task:'mission'}` into the **current** assignments. The survivor leaves the project team
(Labor 6 → 3, *after* projects were ordered against 6), joins next turn's mission team, and the
mission-XP record does not change.

## R2-M3 — The hunger penalty is fixed in the engine and still live on the Feed screen

`ManagementPhase.tsx:267` calls `penaltyFor(short, campaign.survivors.length)` — the recorded Hunger
against a **live** head count, which is exactly the round-one bug (#102) in the one place it was not
fixed. Add a survivor after Feed and the Feed step reads "this community is large enough to absorb
it, no stat is reduced" while every survivor sheet in the same page load reads "every stat is 1
lower". The engine is right; the screen contradicts it.

## R2-M4 — The Teacher message and the Teacher arithmetic now disagree

`experience.ts:203` still reads `discretionary: teaching > 0 ? 0 : DISCRETIONARY_MISSION_XP`, so a
Teacher whose Score is 0 leaves the discretionary point standing. The **message** was fixed and now
says a Score-0 Teacher "replaces the discretionary point and hands out none" — printed directly below
"The discretionary point — 1 of 1 left" and five live award buttons. The point was awarded.

Round one's #109 flagged the arithmetic as arguably a table ruling and the *message* as definitely
wrong. The message was corrected to describe behaviour the code does not have.

## R2-M5 — A resolved Rot check is offered again

`mustCheck` filters only on HP ≤ 0, so a survivor who *holds* at 0 Health gets a full form on the
next render: the roll select reset to 1, a preview reading "Zed turns and is removed. Benny is
bitten.", and an enabled button that does nothing — the reducer guard at `campaignStore.ts:922`
silently swallows it. The engine fix for #104 is correct; the screen does not reflect it.

## R2-M6 — An upgrade's Indoor/Outdoor requirement is enforced nowhere

`checkUpgrade` never reads `requires` at all — zero matches in `upgrade.ts`. `build.ts:123` checks it
for facilities and prints "Needs an outdoor slot, and this one is indoor", so the asymmetry is visible
on the same screen. A Recovery Room orders onto an **outdoor** Medical Clinic and makes its 2 Health;
Solar Panels and Rain Collectors work indoors; Shelving outdoors still raises the Hardware cap.

## R2-M7 — A turn can end with Labor overspent, and everything still completes

"Labor available: −1" is unexplained by its caption, the shortfall panel lives only in the Departures
step, End turn is offered from everywhere, and the shortfall evaporates at the turn boundary with
every over-ordered project completing.

## R2-M8 — `project/cancelled` has no turn or phase guard

Last turn's order was cancelled during the next turn's **Mission Phase** for a full 3 Hardware refund,
contradicting the app's own "within a phase" ruling. Its sibling `management/projectUnfinished`
(`campaignStore.ts:1065`) guards exactly this; `project/cancelled` (`:1046`) does not. A
storage-cap-dodge consequence is **unconfirmed**.

## R2-M9 — Generator and Well Pump are inert, and nothing says so

Neither the Planning utility step nor Advancement Conversions offers the 1 Fuel → 1 Power/Water
exchange. The only trace on the page is the slot-card line "Generator, Well Pump — 2 of 3". The
deferral is reasoned out in code comments and nowhere a player can see. Side effect:
`Exchange.maxPerTurn` now has no UI-reachable exercise.

---

# Low

- **A skipped step still shows ✓.** `TurnWalk.tsx:95` ticks on cursor position, not on the step having
  happened, so a skipped Add Materials or Heal Wounds reads done; the End-turn dialog warns about
  nothing; seven entered rolls worth 8 Food vanished with materials unchanged. The orphaned
  `crz.advancement.rolls.v1` entry is never cleaned up.
- **The Labor caption ignores Catwalks.** Both captions say "the summed Tier levels of the project
  team" while the Dam's special adds 2 — 5 shown where the sum is 3.
- **Nothing says a Watchtower lookout lacks all four skills.** "+0 watched from a staffed Watchtower",
  no hint, and no production line on the slot card — though `production.ts:148` computes
  `missingSkill` for exactly this.
- **`Power assigned 1 / 0 flat`** still reads as an over-assignment (round one, untouched).
- **"…so it produces nothing this turn" still overstates** when only an upgrade is affected (round
  one, string untouched since Z3-6).
- **The Rot roll select resets to 1 on reload**, so the standing preview reads as a death.
- **"Watch Post, Watch Post — 2 of 3, no room for more"** gives the cap as the reason and then denies
  the room it just described; the real reason is the built-in rule.
- **Siege Threat can now go negative** (−1 observed, correctly). No floor is stated and none is
  recorded as a ruling. **Not a bug** — flagged because it is newly easy to reach and feeds two
  thresholds.
- **Cancel and unfinished log entries name only the slot** ("The Back Yard project went unfinished"
  with two queued there), where order and built entries name the project. The First Mission panel
  cites pg. 75 for rules on pp. 18 and 12, which its own docstring gets right four lines above.
  Conversion log lines drop the slot the event carries.

---

# Verified correct

Recorded because a regression in any of it would be expensive to find twice, and because this is the
half that says the fixing worked.

**All seven round-one Highs**, re-driven: Planning entry no longer destroys Advancement's inputs;
material rolls survive a reload and an empty commit asks first; Labor spends down and is turn-scoped;
the Watchtower subtracts (−3 with a qualified lookout, +0 without); Departures fires once; staff
capacity is enforced; unstaffable facilities are gone from the staffing list.

**The project queue itself is good code.** Order-in-N / land-in-N+1 including clearing yields arriving
at completion; turn-scoped Labor with unspent Labor lost; both Labor refusal messages; the
Departures knock-on taking the leaver's Tier off unused Labor, including the no-shortfall case and a
refusal to touch last turn's orders; `advancement/projectsCompleted` idempotent under three
synchronous clicks; a byte-identical export → import → re-export round trip **with a live queue**;
upgrades unorderable for a queued facility; a rubble slot unbuildable while its clearing is queued.

**Rules surfaces driven exhaustively and matching the book:** the whole equal-distribution healing
algorithm across six awkward splits, including rest kept out of the shared pool; all 30 recruit-table
combinations with per-Tier stat arrays and no Hero offered; the full advancement-cost surface
(sequential skill costs, max level = Tier, Move/Defense new-score cost capped at 8, Tier × 2 promotion
with array reshape, Tier 4 unable to promote, overdraw disabled); storage caps at 14/12/14 on a
heavily upgraded Dam, per type, exact / one over / far over, Rare uncapped; substitution allowances
sized to the mission team's summed Scores, and a substitution **changing** a roll rather than adding
one; conversions offered only after the haul, repeatable, blocked when short; White Noise (+1 bed per
indoor Bunk Room); Catwalks (+2 Labor); the first base stocked to its caps and logged; pending rolls
surviving reload, step and phase changes, cleared on commit, not leaking into the next turn.

**Answered questions:** `worksUnstaffed` is confirmed **dead data** — a Medical Clinic + Recovery Room
left unstaffed makes exactly 2 Health through the flat production line, on both the slot card and Heal
Wounds. #88's open question is **settled**: cancellation refunds Hardware and frees Labor, the ruling
is written down, and the behaviour is internally coherent — though the screen never tells the player
the Hardware came back.

---

# Method note

Two near-misses worth recording, both caught by verification rather than by care:

- The XP award buttons looked unfixed in a text dump and are fixed — via `aria-labelledby` composing
  button + survivor + pool, which `textContent` cannot see. **Check the computed accessible name, not
  the text.**
- The first root cause written for R2-H1 was "the function is called only by its own tests". That was
  wrong: the grep excluded the file containing the real caller. The finding survived; the explanation
  had to be rebuilt twice before it was right.

A third is a positive result: the a11y fix **broke the playtest harness**, because the selectors keyed
on the old accessible name. Friction in automation was the fix working.
