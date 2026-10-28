# `src/labels` — the names things go by

The words for the game's ids, and the lines a log entry reads as. `blunt-weapon`, `bunk-room` and
`departures` are identifiers; this directory is where each one gets the name a player
reads, and where a structured log entry or mission outcome becomes a sentence. It sits beside
`src/data` so that anything driving the engine without a screen — a headless harness, an export,
a test — can use the same names the app does instead of building them from ids (#203).

**The tables are full `Record`s over the data's own id types**, so a skill, step, facility or trait
added to `src/data` fails the typecheck until it is named here. `logLabels.ts` ends its `switch`
on `never` for the same reason: a new log event is a compile error, not a blank line.

| | |
|---|---|
| `skillLabels.ts`, `tierLabels.ts` | the four stats, the skills and common skills; the Tiers |
| `baseLabels.ts` | bases, facilities, upgrades, slot kinds, utilities and materials, and how a slot or a built thing reads |
| `projectLabels.ts`, `taskLabels.ts` | a project in the queue; a survivor's task and lane |
| `turnLabels.ts` | the four phases and every step |
| `missionLabels.ts` | mission titles and pages, overrun options, what Select Mission recorded, and an outcome's counts and consequences |
| `storyLabels.ts`, `magicLabels.ts`, `viralLabels.ts` | the counts and consequences of a story, magic or viral mission |
| `equipmentLabels.ts` | items, grades, kinds, and who holds an item |
| `traitLabels.ts`, `originLabels.ts`, `spellLabels.ts` | Story Traits, Advantages and injuries; the Origins of the Rot; the spells |
| `logLabels.ts` | a log entry as a line, and when it happened |
| `articles.ts` | "a" or "an", and the names that take neither |

**Names, never rule text.** A label is what a thing is called. What it *does* stays in the book,
and a page number is a number — `missionPages` reads it from `src/data` rather than keeping a copy.

## What it may import

`src/data` for the ids and pages, and `src/engine` to ask about a record — whether a mission is a
story, what an outcome counts. Nothing else: no React, nothing from `src/ui`, `src/state` or
`src/persistence`, and no browser globals.

## What may import it

`src/ui`, and anything outside the app that wants the names. **Not `src/engine` or `src/data`:**
labels read the engine, so the arrow points one way, and an entry the engine wrote as a sentence
would be a second format to keep in sync with this one.

**Rules enforced by `eslint.config.js`:** all of the above, and the raw-occupants rule these files
had while they were in `src/ui`. `src/test/lintGuard.test.ts` probes each one.

There is no package entry point: the app is not published, and `package.json` has no `exports`.
A caller imports the module it wants, by path.

## Tests

`articles.test.ts` is here. Log lines are checked through the screen that shows them
(`src/ui/CampaignLog.test.tsx`) against one sample of every event in `src/test/logSamples.ts`.
Stryker does not mutate this directory, as it did not when these files were in `src/ui`.
