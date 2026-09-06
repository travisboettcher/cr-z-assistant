# `src/data` — rules as data

Bases, facilities, upgrades, equipment, skills and mission metadata live here as typed data,
separate from engine code and completely separate from UI. **Adding a facility is a data edit,
never a code edit.**

What is here so far. Phase 1 (survivors):

| | |
|---|---|
| `skills.ts` | the four stats, the twenty governed skills and what governs each, and Move/Defense |
| `tiers.ts` | the Tier table — stat arrays, skill slots, max skill level, HP, labor |
| `advancement.ts` | what a skill level, a common-skill Score and a Tier cost in XP |
| `recruitTable.ts` | the field-recruit d10 table and which Tiers roll on it |

Phase 2 (the base):

| | |
|---|---|
| `facilities.ts` | the facility and upgrade table — costs, requirements and structured effects |
| `bases.ts` | the base roster, each base's Facility Slots, and the Tier 3 special abilities |
| `materials.ts` | the material types, which of them have a storage cap, and the cap above Tier |
| `origins.ts` | the three Origins of the Rot, which gate three entries in the facility table |

`materials.ts` and `origins.ts` moved down from `src/engine/campaign.ts` in Phase 2. Both are
rules — which materials exist, which origins exist — and the facility table names both, so
leaving them in the engine would have meant `src/data` importing from `src/engine`. The engine is
a set of functions over the rules; it is not where they live.

Equipment arrives in Phase 5 and mission metadata in Phase 4.

**Derived values are not here either.** The base roster's printed storage column is `Tier + 3`
plus the base's built-in facilities, so it is computed rather than transcribed — `rules.test.ts`
re-derives the whole column and asserts it reproduces the book's table, which is what makes that
roster a check on the transcription instead of a second copy of it.

**Rules enforced by `eslint.config.js`:** no React, no React DOM, no imports from `src/ui`.

Costs, caps and formulas are fine here. Facility descriptions, skill descriptions and mission
narrative are not — the app must be useless without owning the rulebook. Display labels are not
here either: naming things for a screen is the UI's job, the same way `src/ui/phaseLabels.ts`
names the campaign phases.
