# Playtest — September 2026, round three

Round two's 21 findings were fixed and its issues closed. This round asked the same two questions —
**did the fixes hold**, and **what did the fixing introduce** — and added two angles neither previous
round had touched: **a 20-turn campaign**, and **the schema migration chain on real old saves**.

**The suite was green either side: 1540 tests (up from 1440), typecheck and lint clean.** Nothing
here is reachable from the tests the code was written against.

| | |
|---|---|
| Round two findings | **all 27 fixed** — no partial, no regressed |
| New this round | **3 High, 6 Medium, 8 Low** |
| Clean negative results | the migration chain; every direct validator attack |

## What changed about the findings

Rounds one and two were dominated by **integration failures** — a new abstraction wired into only
some of its call sites. That class is now largely closed, and the fixes were thorough: all six
`suppliedOccupants` call sites, all four queue validators, and several fixes that went past the issue
and **wrote the ambiguity down as a ruling** rather than picking silently.

Round three's findings are a different and older class: **features that are fully built except for
the part that does the work.** Scavenging is assignable, validated, persisted, labelled — and pays
out nothing, because the two constants defining its yield have no reader. The Hero cap is computed,
displayed, and reported as exceeded — and never enforced. The Training Room's slot card promises XP
the Advancement step does not hand out. In each case every visible part of the feature exists, which
is exactly why two rounds of sweeping missed them.

---

# High

## R3-H1 — Scavenging pays out nothing, ever

Opting out of the mission lets one unassigned survivor scavenge: with the Scavenge skill, one of
*each* material type; without it, one of a single type (pg. 17).

The assignment is a first-class citizen — `{ task: 'scavenging' }` in `PlanningPhase.tsx:92`, its own
validation in `planning.ts:341` with two dedicated violation codes (`someone-else-scavenging`,
`scavenging-needs-the-mission-skipped`), a label in `taskLabels.ts:31`, and a persisted field in
`saveFile.ts:492`.

The two constants that say what it *yields* are read by nothing:

```sh
grep -rn "SCAVENGE_PER_MATERIAL_WITH_SKILL\|SCAVENGE_TOTAL_WITHOUT_SKILL" src --include=*.ts --include=*.tsx | grep -v '\.test\.'
# src/data/turn.ts:279  export const SCAVENGE_PER_MATERIAL_WITH_SKILL = 1;
# src/data/turn.ts:281  export const SCAVENGE_TOTAL_WITHOUT_SKILL = 1;
```

`materials.ts` has no scavenging path. Driven twice in the 20-turn campaign with a survivor who has
Scavenge: no material ever arrives, and **no screen says so**. The player skips a mission — the whole
cost of the decision — and receives nothing for it.

## R3-H2 — The Hunger stat penalty never expires if a turn's Feed step is skipped

`hungerPenalty` (`feeding.ts:143`) reads the most recent Feed entry **from anywhere in the log**, and
that is deliberate — its comment explains that the penalty must survive the Mission, Advancement and
Planning Phases of the following turn, which is what pg. 22's "until the next turn's Management
Phase" means. The expiry is implicit in the *next* Feed overwriting it.

**Skipping Feed is permitted**, so that assumption can fail. With no new entry, the last one is from
an older turn and the penalty never lifts: observed still in force two and three Management Phases
later, silently costing 2 Food a turn.

This is not a missing turn filter — adding one would break the deliberate carry. The penalty needs an
explicit expiry, or Feed needs to be unskippable. Round two's fix for the sibling symptom (#149) made
skipped steps *visible* ("!" and "not resolved") but still permitted.

## R3-H3 — Cancellation refunds at a recomputed price, so Hardware can be minted

`projects.ts:139` **charges** via `projectCost` → `costOf(…, before = +∞)`: everything queued counts
as ahead of the new order. `projects.ts:152` **refunds** via `queuedCost(campaign, at)` →
`costOf(…, before = at)`, pricing at the project's **live queue index**. Those agree only while the
queue does not change — and cancelling an earlier order shifts every later index.

Order a Fence then a Greenhouse onto one Garden (the Greenhouse quoted **3**, discounted because the
queued Fence is ahead of it), then cancel the Fence first and the Greenhouse second:

```
8 → 7 → 4 → 5 → 9 Hardware
```

Empty queue, unchanged base, **one Hardware created**. Looped, it carried a community above the Hobby
Farm's cap of 9. The opposite sign is reachable too: two Greenhouses onto a built-in Garden charge
3+4 and refund 3+3, destroying one. Also reachable through `management/projectUnfinished`.

`queuedCost`'s comment argues the refund is safe — *"the Fence is still there, because nothing can
take it off until this project finishes"* — which is a correct argument about the **base** changing
under the queue, and does not hold for the **queue changing under itself**, which is what
cancellation does.

`orders.test.ts` guards the "is one already queued" half of the validator contract and the Labor
pricing. Nothing asserts **charge == refund across a queue mutation**, which is exactly where this
lives.

---

# Medium

## R3-M1 — A Siege Defense turn awards no mission XP, and says something false about why

Every survivor in the community deploys to a Siege Defense by rule (pg. 85). On the two siege turns
of the 20-turn campaign the Advancement Phase read **"Nobody is on a mission team, so there is no
mission XP this turn."** The Teacher pool is dead for the same reason, and the Training Room pool
wrongly offers XP to survivors who were on the siege team. `experience.ts:188`.

**Siege turns also leave no trace in the log at all**, so a campaign's history cannot tell you whether
either siege was fought.

## R3-M2 — The Training Room card promises XP the Advancement step never hands out

The slot card totalled +4 base, +2 Intelligence, +2 Strength, +2 Dexterity = **10**; the XP pool
offered **4**. Stat-restricted XP is deliberately unmodelled in the engine (`experience.ts:145`) and
undisclosed on the card. The gap grows with every upgrade — 33% at one, 60% at three.

## R3-M3 — The Hero cap is displayed, reported as broken, and never enforced

`tierPurchase` (`advancement.ts:128`) never checks `maxHeroes`. A Tier-2 base was promoted to three
and then four Heroes with no warning and no "do it anyway" override — after which the base sheet
reads **"HEROES 4 / 2 — Over what this base allows"**. The app knows the rule well enough to report
the violation and not well enough to mention it at the moment of the purchase.

## R3-M4 — A Hunger penalty retroactively un-generates utilities already assigned

Utilities are generated and assigned at Planning Step 1 and last until the next Planning Phase
(pg. 20, 67). The penalty applied at Management Step 2 lowers Cooperation, which lowers the Utilities
Score that backs those points. A legal 4 Power / 3 Water became **"4 / 2 — Over what the base
generates"** after Feed, with points silently dropped in layout order and the next Advancement Phase
reading those facilities as unsupplied. `utilities.ts:162`.

## R3-M5 — The `suppliedOccupants` rollout reached one half of staffing and not the other

Not #153, and not to be folded into it. #153 asks *whether* the Med Lab's extra seat should exist
unsupplied; this is that the two halves of the app now **disagree** about whether it does.

- `PlanningPhase.tsx:199` takes `suppliedOccupants(campaign)`; `:139` computes `room` from that
  **resolved** occupant.
- `staffOf` (`assignments.ts:110`) takes `occupantAt` — the **raw** occupant — and slices by
  `staffCapacity` of that.

On a Dam at combined Utilities 10 with a Med Lab and two medics, the staffing control says "Takes 2"
with no over-capacity line while Heal Wounds pools **one** medic's Medicine.

Before the rollout both halves read raw and agreed — both wrong, but consistent. **A partial rollout
of a correctness fix can be worse for the player than none of it**, because a consistent wrong answer
is checkable and an inconsistent one is not.

## R3-M6 — An order placed outside the Planning Phase can never be cancelled

In the Management Phase the Order control is live (with only a note), spends the Hardware, and the
slot card then reads "Cancelled in the Planning Phase that ordered it" — there is no Planning Phase
left that turn, and next turn's refuses on `orderedOnTurn`. `project/ordered`
(`campaignStore.ts:1042`) has no phase guard while `cancellable` (`projects.ts:389`) demands one.

This contradicts Z3-11's own ruling that "a decision a player cannot take back is a trap rather than
a rule". The same window opens by stepping back into the current turn's Advancement Phase.

---

# Low

- **The #138 lint guard has two independent holes** — see the section below. Latent, but it is the
  check this whole class of bug was supposed to be closed by.
- **"9 slots, 6 empty" is the base's factory spec, not the base** — never moves; at turn 17 zero slots
  were empty (`BaseSlotMap.tsx:320`).
- **A promotion silently wounds the survivor** (3/3 → 3/4 Health) and so benches them from the next
  mission team. Needs a ruling.
- **A project left unfinished at Departures refunds its Hardware undisclosed**, next to a cancel
  button that *does* say the Hardware comes back (`logLabels.ts:186`). Contradicts the app's own copy
  either way.
- **"a Extra Bed", "a Restraints", "a 8"** — sixteen in the permanent log by turn 17.
- **Turn 1 logs "last turn's tasks and utilities cleared"** when there was no last turn.
- **A clearing's cancel button promises "its Hardware comes back"** — clearings cost 0 Hardware; the
  label is hard-coded for all three verbs (`BaseSlotMap.tsx:151`).
- **"Room for 1 upgrades"** — a count interpolated into a fixed plural (`BaseSlotMap.tsx:95`). And a
  stale comment at `BaseSlotMap.tsx:108` still says ordering two facilities into one slot is legal,
  which `build.ts:109` now blocks.

---

# The #138 guard covers about half the surface it claims

Two agents found two different holes, independently, and both are verified:

**The name.** `RAW_OCCUPANTS` restricts `importNames: ['occupants']`. `occupantAt` (`base.ts:250`) is
a thin wrapper returning the same raw `Occupant`, and is not listed. `projects.ts:43` and
`upgrade.ts:38` both import it and are not on the allowlist.

**The scope.** The rule is attached to two globs only — `src/engine/**/*.ts` and
`src/ui/**/*.{ts,tsx}`. `src/state/` and `src/persistence/` are uncovered, and
`src/state/campaignStore.ts` is campaign-level: it already calls `suppliedOccupants` itself at `:792`.
A probe importing `occupants` there lints clean.

Neither is a live violation today. Every other evasion *was* caught — alias, namespace and re-export
forms all error, verified with throwaway modules. But the rule was meant to make the class
unrepresentable, and **adding one more upgrade that both adds a seat and requires a utility reopens
R2-H1 with CI green**.

This one traces back to the round-two report: the rule was specified there in prose, naming four
modules to allowlist, without saying which directories it should cover or that wrappers needed
listing. It was implemented faithfully to that specification. **A guard is a claim about a surface,
and the claim needs testing the same way a fix does** — nobody, including its author, checked the
guard's coverage after it landed.

---

# Verified correct

**Every round-two finding, re-driven across ~20 imported campaigns on four bases**, in both
directions on each claim: all six `suppliedOccupants` call sites individually (Dam Workshop now
**+5 Hardware unhalved**, Clinic Health 5, Training Room 5 of 5, Rot target 7, conversions correctly
silent on unbacked Power, slot cards reading "Supplied with Power and Water"); all four queue
validators plus the Greenhouse discount; the import-mid-step fix; the Watchtower card/engine
agreement; and every Low. **No partial, no regressed.**

Several fixes went past the issue and **recorded the ambiguity as a ruling** — the Score-0 Teacher is
now ruling 8, the stale-XP-pool question ruling 7, and the negative Siege Threat is written up rather
than changed.

**The migration chain, on real pre-queue campaigns.** Nine genuine v9 saves from round one, turns 3–7
across four bases, into today's v11 app: all nine open at the correct turn and step, and the only
shape change is `projects: []`. A Medical Clinic built in turn 1 with a Restraints upgrade survives
intact — Z3-11's own acceptance criterion, on data that predates it. A migrated campaign plays on,
including ordering into the queue the migration created. An old **autosave** migrates too and is
rewritten at v11, which is the app-update path. The malformed-file messages are specific and
actionable, and a save from a *newer* version is **refused rather than opened**, with the reason given.

**Twenty turns of drift.** Siege Threat, Hunger, Exhaustion, Unrest and Labor rebuilt from scratch on
every one of 20 turns; turns-since-last-siege reset cleanly on both sieges and climbed exactly 1 per
turn between them; the roster stayed coherent through 23 arrivals and departures with no orphaned
assignments; departures enforced one-per-turn, tie-choice, 0-HP exclusion, retroactive unstaffing and
the Labor knock-on. **Export → import into a fresh profile → re-export was byte-identical at turn 17
with a 261-entry log, and the rendered page diffed to zero lines.** No console or page errors in
roughly 150 invocations.

**Every direct validator attack was refused**: two facilities into one slot, double clearing, the cap
counting on-order upgrades, `maxPerFacility` twice, upgrading a queued-but-unbuilt facility, building
into a slot whose clearing is only queued, ordering in the next turn's Mission Phase, cancelling last
turn's order. `orders.test.ts` is typed so a fourth project verb will not compile without coverage.

---

# Method note

Round three's near-misses, continuing a pattern now worth stating as a rule.

My migration harness reported that two future-version saves produced **no error message** — which
would have been a real finding. It was my regex: the message opens "This campaign was saved by a
newer version of the app", and I had grepped for *could not / cannot / unable / invalid / failed /
damaged*.

That is the fourth near-false-positive across three rounds, after the XP buttons (fixed via
`aria-labelledby`, invisible to `textContent`), a storage clamp that was correct once feeding was
accounted for, and a "no caller" grep that excluded the file containing the caller.

**All four were my detection method failing, not the app — and in every case the tool reported an
absence.** An absence of a string, of a caller, of a message. Positive evidence has been reliable for
three rounds; negative evidence from a grep has been wrong four times out of four.

**Never file a finding whose evidence is that something was not found, without reproducing the
absence a second way.**
