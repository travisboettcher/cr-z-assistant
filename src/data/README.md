# `src/data` — rules as data

Bases, facilities, upgrades, equipment, skills and mission metadata live here as typed data,
separate from engine code and completely separate from UI. **Adding a facility is a data edit,
never a code edit.**

What is here so far, all of it Phase 1 (survivors):

| | |
|---|---|
| `skills.ts` | the four stats, the twenty governed skills and what governs each, and Move/Defense |
| `tiers.ts` | the Tier table — stat arrays, skill slots, max skill level, HP, labor |
| `advancement.ts` | what a skill level, a common-skill Score and a Tier cost in XP |
| `recruitTable.ts` | the field-recruit d10 table and which Tiers roll on it |

Bases and facilities arrive in Phase 2, equipment in Phase 5, mission metadata in Phase 4.

**Rules enforced by `eslint.config.js`:** no React, no React DOM, no imports from `src/ui`.

Costs, caps and formulas are fine here. Facility descriptions, skill descriptions and mission
narrative are not — the app must be useless without owning the rulebook. Display labels are not
here either: naming things for a screen is the UI's job, the same way `src/ui/phaseLabels.ts`
names the campaign phases.
