# How the app fits together

A map, for someone about to change something. The reasoning behind each decision lives where the
decision was made — the phase documents, the directory READMEs, the comments above the code — and
this links to it rather than repeating it. What this adds is the route between them: where a rule
starts, who reads it, and what else has to change when it does.

## The shape

```
            ┌──────────────────────────────────────────────┐
            │ src/ui         renders, and dispatches       │
            └───────┬───────────────────────────▲──────────┘
       action       │                           │  reads derived values
 (with `at`, ids)   │                           │  straight from the engine
            ┌───────▼──────────────┐            │
            │ src/state            │            │
            │ one reducer          │── Campaign ┤
            └───────┬──────────────┘            │
     asks, changes, │                           │
     logs           │                           │
            ┌───────▼───────────────────────────┴──────────┐
            │ src/engine     pure functions over Campaign   │
            └───────┬──────────────────────────────────────┘
                    │ reads
            ┌───────▼──────────────────────────────────────┐
            │ src/data       the rules, as typed data       │
            └──────────────────────────────────────────────┘

  src/persistence   Campaign ⇄ bytes: schema version, migrations, parse, export, autosave
```

Imports only point down. `src/data` imports nothing above it, `src/engine` and `src/data` import no
React and nothing from `src/ui`, and `npm run lint` fails if any of that is broken. Each directory's
README says what belongs in it.

## A campaign is facts, a step and a log

`Campaign` (`src/engine/campaign.ts`) holds only what happened: survivors, their stats and Health,
the base and its slots, materials, assignments, the project queue, the turn number and the
**step** the turn is on. Everything else — Hunger, Unrest, Siege Threat, Skill Scores, Labor,
storage caps, which phase it is — is a function of those and is computed every time it is asked.

The **log** (`src/engine/log.ts`) is the other half. Several steps of a turn are destructive, and
after one has run the campaign cannot tell by looking at itself that it did — a departure lowers
the very pressure that called for it. So the steps that matter write a structured entry, and "has
this turn's Rot check happened?" is a question about the log. Entries are data, never sentences;
`src/ui/logLabels.ts` turns them into something to read.

## The engine's vocabulary

Most engine functions are one of a few kinds, and the names say which:

| Kind | Looks like | Returns |
|---|---|---|
| A derived value | `siegeThreat`, `foodRequired`, `departurePressure` | a number or list, from the campaign |
| A question | `departureCalled`, `someoneIsLeaving`, `siegeDue` | a boolean |
| A check | `checkBuild`, `checkOrder`, `checkConversion` | `{ blockers, warnings }` — see below |
| A problem | `missionOutcomeProblem`, `standInProblem` | a sentence, or `null` if it is fine |
| A change | `withDeparture`, `withSurvivorsFed`, `withProjectOrdered` | a new `Campaign` |
| A record | `logged(campaign, at, event)` | the campaign with an entry appended |

**Blockers and warnings are different things** (`src/engine/checks.ts`). A blocker stops the
action: the slot is taken, the Hardware is not there. A warning is a rule a table may break on
purpose, and the screen offers an override for it. The override is never stored — it gates the
action once, and the campaign keeps reporting the violation for as long as it stands.

Every message a check or problem returns is a sentence for a person at the table, never the rule
restated. A check's violations also carry the page, for `PageRef`.

## The reducer composes; it does not decide

`src/state/campaignStore.ts` has one case per action. A case that matters does three things,
all of them engine calls: **asks** whether the action is allowed, against the campaign it is
holding rather than anything the screen claimed; **changes** the campaign through a `with*`
function; **records** it with `logged`. A refused action returns the campaign unchanged.

Anything impure — the time, a fresh id — is captured by the screen when it dispatches and arrives
on the action, so the reducer stays a function. See `src/state/README.md`.

> [#196](https://github.com/travisboettcher/cr-z-assistant/pull/196) moves each of those
> compositions into an engine function in `src/engine/*Forms.ts`, leaving the reducer one call per
> case. Whichever of the two lands second updates this paragraph.

## The turn

The turn's **shape** — four phases, nineteen numbered steps, every threshold — is data, in
`src/data/turn.ts`. Its **order** is `src/engine/turn.ts`: given a step, what comes next and
whether that ends the turn. A campaign stores the step, never the phase, and cannot be asked to
jump to one by name. [`turn-walk-interaction.md`](turn-walk-interaction.md) explains the screen.

**`src/engine/outstanding.ts`** is what End turn asks before it lets go: which steps had something
to resolve and have nothing recording that they were. Any rule that adds a step, or changes when a
step has anything to do, changes what this owes — and is the place a disagreement between "the
step is due" and "the step can be taken" shows up as a turn that never ends.

## A rule, end to end

Departures (pg. 23) touches every layer, which makes it the example to follow:

| Layer | File | What it holds |
|---|---|---|
| data | `src/data/turn.ts` | `DEPARTURE_THRESHOLD`, and the step's place in the Management Phase |
| engine | `src/engine/departures.ts` | `departurePressure`; `departureCalled` (the threshold alone); `someoneIsLeaving` (the threshold *and* somebody able to go); `departureCandidates`; `withDeparture`; `someoneDeparted` (read from the log) |
| engine | `src/engine/outstanding.ts` | owes the step while `someoneIsLeaving` and not `someoneDeparted` |
| engine | `src/engine/log.ts` | the `survivor-departed` entry |
| state | `src/state/campaignStore.ts` | `management/departed`: re-asks `departureCandidates`, applies `withDeparture`, logs |
| ui | `src/ui/ManagementPhase.tsx` | the Departures step: shows the pressure, offers the candidates, says "would have left" from `departureCalled` |
| ui | `src/ui/logLabels.ts` | the log line |
| docs | `docs/phase-3-stories.md` (Z3-10), `docs/rulings.md` (R3, R18) | why each of those answers is the one it is |

[#192](https://github.com/travisboettcher/cr-z-assistant/issues/192) is what happens when two of
those rows disagree: `outstanding` owed the step on the threshold alone while the reducer only
accepted a standing survivor, so a community whose survivors were all down owed a step nobody could
take. The fix was to make `someoneIsLeaving` mean what its name says, keep the threshold under its
own name for the screen, and update every row above. That is the general pattern — when a
question is answered wrong, change the question, then go down this table.

To find the rows for any other rule, search for every import of the function you are changing,
across all of `src/`.

## Where the reasons are

| | |
|---|---|
| `docs/phase-*-stories.md` | each phase's stories, the decisions taken in them, and why |
| [`docs/rulings.md`](rulings.md) | every question the book leaves open, and the answer the app gives |
| [`docs/rulebook-edition.md`](rulebook-edition.md) | which printing the page numbers are, and where each rule lives |
| [`docs/base-slot-interaction.md`](base-slot-interaction.md), [`docs/turn-walk-interaction.md`](turn-walk-interaction.md) | the two shared screens |
| `src/*/README.md` | what each directory may and may not hold |
| `eslint.config.js` | the boundaries that are enforced rather than remembered, and the issue behind each |
| [`src/test/README.md`](../src/test/README.md) | how the tests are arranged |
