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

**`turn.ts` is where the turn's *order* is applied**, over the turn's *shape* in
`src/data/turn.ts`. A campaign stores which step it is on and the phase is derived from it — a
step belongs to exactly one phase, so storing both would be a redundant pair that can disagree.
Storing the finer of the two is not fidelity for its own sake: three Management steps are
destructive, and a campaign resuming at "somewhere in the Management Phase" could not know which
had already run.

**`log.ts` is the one thing here that is not a rule.** The campaign log is a record of what
happened, so it holds no arithmetic and cites no page; it is in the engine because `Campaign`
has a `log` field and the shape of a field belongs beside the shape it is part of. Entries are
structured, never sentences — turning one into a line someone reads is `src/ui/logLabels.ts`,
which is what keeps a later markdown export a second reader rather than a second format.

**The `*Forms.ts` modules are the turn's forms** (#179) — the guard, the change and the log
entry of one press, composed once. `forms.ts` holds the shape every one of them returns, the
next campaign or the refusal, and why; `missionForms.ts`, `advancementForms.ts` and
`managementForms.ts` hold a phase's forms each, and `campaignForms.ts` the ones that belong to
no single phase. They sit above the rule modules and nothing in the engine imports them: a
screen asks the rule modules what it may offer, and the store submits a form when it is
pressed.
