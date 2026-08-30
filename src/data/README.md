# `src/data` — rules as data

Bases, facilities, upgrades, equipment, skills and mission metadata live here as typed data,
separate from engine code and completely separate from UI. **Adding a facility is a data edit,
never a code edit.**

This directory is empty through Phase 0 by design — Phase 0 ships no game rules at all. It
starts filling up in Phase 1 (survivor skills) and Phase 2 (bases and facilities).

**Rules enforced by `eslint.config.js`:** no React, no React DOM, no imports from `src/ui`.

Costs, caps and formulas are fine here. Facility descriptions, skill descriptions and mission
narrative are not — the app must be useless without owning the rulebook.
