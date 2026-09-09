# `src/engine` — the pure engine

Derived values and phase transitions as **pure functions over a `Campaign`** —
`computeUnrest(campaign)`, `advancePhase(campaign, input)`. Unit-testable with zero DOM.

**Rules enforced by `eslint.config.js`:** nothing here may import React, React DOM, or
anything from `src/ui`. Breaking that fails `npm run lint`.

**Derived is never stored.** Only primitive facts persist — stats, skill levels, assignments,
inventory, turn number. Hunger, Unrest, Siege Threat and Skill Scores are always recomputed,
because the hunger stat penalty retroactively changes every Skill Score for the turn and makes
any cached value wrong.

Rule *numbers and structure* are fine here. Rule *prose* is not — see the copyright posture in
the project note. Cite page numbers, never restate the text.

**`log.ts` is the one thing here that is not a rule.** The campaign log is a record of what
happened, so it holds no arithmetic and cites no page; it is in the engine because `Campaign`
has a `log` field and the shape of a field belongs beside the shape it is part of. Entries are
structured, never sentences — turning one into a line someone reads is `src/ui/logLabels.ts`,
which is what keeps a later markdown export a second reader rather than a second format.
