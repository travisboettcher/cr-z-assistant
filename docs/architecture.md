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
     submits the    │                           │
     action's form  │                           │
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
| A form | `submitDeparture`, `submitFeeding`, `submitAdvance` | a `FormResult` — see below |

**Blockers and warnings are different things** (`src/engine/checks.ts`). A blocker stops the
action: the slot is taken, the Hardware is not there. A warning is a rule a table may break on
purpose, and the screen offers an override for it. The override is never stored — it gates the
action once, and the campaign keeps reporting the violation for as long as it stands.

Every message a check or problem returns is a sentence for a person at the table, never the rule
restated. A check's violations also carry the page, for `PageRef`.

## A form is the press; the reducer only forwards it

Pressing a button in the turn walk is a **form**: one engine function that **asks** whether the
action is allowed, against the campaign it is given rather than anything the screen claimed;
**changes** the campaign through a `with*` function; and **records** it with `logged`. It returns a
`FormResult` (`src/engine/forms.ts`): `{ ok: true, campaign }` with the change and its log entries
together, or `{ ok: false, problem }` with a sentence for the table.

The forms are grouped by phase — `missionForms.ts`, `advancementForms.ts`, `managementForms.ts` —
with `campaignForms.ts` for the turn walk, the first base and the roster. They sit apart from the
rule modules on purpose: a rule module answers the questions a screen asks before anything is
pressed, and a form is the press. Nothing else in the engine imports a form.

`src/state/campaignStore.ts` has one case per action, and a case with a form is a single call to it
through `submitted`, which keeps the campaign unchanged on a refusal. What is still written out in
the reducer is the project queue's five cases and the plain corrections — rename, set HP, toggle a
utility, step back — which have no guard and no entry to compose.

Anything impure — the time, a fresh id — is captured by the screen when it dispatches and arrives
on the action as the form's last arguments, so the engine has no clock and the reducer stays a
function. See `src/state/README.md`.

## The turn

The turn's **shape** — four phases, nineteen numbered steps, every threshold — is data, in
`src/data/turn.ts`. Its **order** is `src/engine/turn.ts`: given a step, what comes next and
whether that ends the turn. A campaign stores the step, never the phase, and cannot be asked to
jump to one by name. [`turn-walk-interaction.md`](turn-walk-interaction.md) explains the screen.

**`src/engine/outstanding.ts`** is what End turn asks before it lets go, and what Next and a skip
ask before they pass a step (`owedOnLeaving`): which steps had something to resolve and have
nothing recording that they were. Any rule that adds a step, or changes when a
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
| engine | `src/engine/managementForms.ts` | `submitDeparture`: refuses a second departure or a name `departureCandidates` does not offer, applies `withDeparture`, logs |
| state | `src/state/campaignStore.ts` | `management/departed`: one call to `submitDeparture` |
| ui | `src/ui/ManagementPhase.tsx` | the Departures step: shows the pressure, offers the candidates, says "would have left" from `departureCalled` |
| ui | `src/ui/logLabels.ts` | the log line |
| docs | `docs/phase-3-stories.md` (Z3-10), `docs/rulings.md` (R3, R18) | why each of those answers is the one it is |

[#192](https://github.com/travisboettcher/cr-z-assistant/issues/192) is what happens when two of
those rows disagree: `outstanding` owed the step on the threshold alone while the form only
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
| [`docs/ux-principles.md`](ux-principles.md) | the one-screen layout, and the rules a new screen follows to fit it |
| [`docs/base-slot-interaction.md`](base-slot-interaction.md), [`docs/turn-walk-interaction.md`](turn-walk-interaction.md) | the two shared screens |
| [`docs/step-records.md`](step-records.md), [`docs/assignment-board.md`](assignment-board.md) | what a step shows before and after it records, and how assignments and equipment are moved (proposed) |
| `src/*/README.md` | what each directory may and may not hold |
| `eslint.config.js` | the boundaries that are enforced rather than remembered, and the issue behind each |
| [`src/test/README.md`](../src/test/README.md) | how the tests are arranged |
