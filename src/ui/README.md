# `src/ui` — screens

React components that **render a campaign and dispatch actions**. Nothing else. A screen reads
state through `useCampaign`, asks `src/engine` for every derived value it shows, and changes
anything only by dispatching to the reducer in `src/state`.

**No rules live here.** If an event handler is about to compute something — whether a step is
allowed, how much Food is left, who should leave — that is an engine function the screen calls,
not code the screen holds. This is the failure that stalled the July 2025 attempt, and the reason
`src/engine` can be tested without a DOM. A screen that re-derives something the engine already
answers will, sooner or later, answer it differently.

**Ask the engine the same question the reducer asks.** A button is enabled from the same check the
reducer runs when it is pressed. A screen that offers something the reducer will refuse, or hides
something it would accept, is a bug in the screen.

**Impure inputs are captured here.** The time (`new Date().toISOString()`) and a fresh id
(`crypto.randomUUID()`) are taken at the moment of dispatch and carried on the action, so the
reducer stays deterministic.

## Blockers, warnings and overrides

A check returns blockers and warnings (`src/engine/checks.ts`), and the screen treats them
differently: a blocker disables the action and says why; a warning shows, and unlocks an override
for a table that is breaking the rule on purpose. The override gates that one action and is never
stored. See [`docs/base-slot-interaction.md`](../../docs/base-slot-interaction.md).

## Words and citations

- **Every rulebook citation goes through `PageRef`.** No inline "(p8)".
- **Display names live in the `*Labels.ts` files** — `turnLabels.ts`, `logLabels.ts`,
  `baseLabels.ts` and the rest — not in `src/data`. Naming things for a screen is this layer's job.
  `logLabels.ts` is what turns a structured log entry into a line someone reads.
- **No rule text.** A screen may say what a number is and where the rule is; it does not explain
  the rule. Messages from the engine are already written for a person at the table.
- **`styles.ts`** holds the class fragments that must be identical everywhere — the focus ring and
  the touch-target size.

## Built for a tablet at the table

The end-to-end suite runs at an 820 × 1180 touch viewport, and that is the target: controls big
enough for a thumb, readable in a lit room, in light and dark themes.

## Tests

Screen tests render the real `App` inside a `CampaignProvider` with an `initialState`, and drive it
with `userEvent` and accessible queries. They check what a person sees and can press; the rule
behind it is tested in the engine. See [`src/test/README.md`](../test/README.md).
