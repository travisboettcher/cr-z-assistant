# Which rulebook these page numbers are

Every `pg.` in this repository — in comments, in `PageRef`, in the story documents — refers to
the **Modiphius Entertainment edition of *County Road Z*** (Jordan Heckman; ISBN
978-1-80281-366-1; 188pp; Dec 2023 / Jan 2024).

**The printed page numbers run four behind the PDF's page index.** The citations here use the
printed number — the one in the page footer, and the one the book's own cross-references use, so
that following a citation from the app to the book works whichever copy the reader has open.

Phases 0 and 1 were written against the earlier self-published **v1.25** (152pp) and cited its
pages. Nothing in `src/data` moved when the citations were re-based: both worked characters, the
d10 recruit table, the four stat arrays and every derived-value rule are identical in the two
editions. What changed was names, page numbers, and one behaviour — the promotion rule in
[the retrofit note below](#one-rule-that-actually-changed).

## Where the Phase 0 and Phase 1 rules live now

| topic | page |
|---|---|
| Survivor Tiers — stat arrays, skill count, max skill level, Labor, Inventory Slots = Tier, Health = Tier, no field Heroes, Hero caps | 7 |
| Survivor Stats — the four stats and the five skills each governs | 8 |
| Skills and Scores — Score = level + stat + item; skills start at level 0; levels 0–4, capped at Tier | 8 |
| The Common Skills — Move and Defense start at 6, no governing stat | 9 |
| Starting community — 10 Tier levels, 1 Hero + 2 Leaders recommended | 13 |
| Earl Rhodes, Jr., worked — stat array, Move/Defense, first skills | 13 |
| Earl, worked — skills recorded, Health = Tier, Inventory Slots 7 = 4 + 3 | 14 |
| New Recruits — the d10 first-skill table — and Carla Proust, worked | 15 |
| Character advancement — XP costs, Move/Defense cap of 8, out-of-order rule, promotion | 18 |
| Labor pool = Σ Tier levels of the project team; unspent Labor is lost | 20 |

## Terminology

The published edition renames several things the earlier one called something else. The app uses
the published names.

| old | published |
|---|---|
| Blade Weapon | Bladed Weapon |
| item slots | Inventory Slots |
| Strategic Layer | Community Layer |
| Tactical Layer | Mission Layer |
| Tactical Turns | Tactical Rounds |
| Story Keywords | Story Traits |

The skill *id* stays `blade-weapon`. A survivor's `skills` record is keyed by id and those keys
are persisted, so renaming one costs a migration step to rewrite a string; the id is an
identifier (`blunt-weapon` reads as one too) and `SKILL_LABELS` is where the name belongs.

## One rule that actually changed

**Promotion picks a zero for the player.** pg. 18 is explicit where v1.25 was not: a promoted
survivor's stats step up by one, **and if a survivor has more than one stat at 0, the player
chooses which one is raised.** T1 → T2 leaves three zeros and T2 → T3 leaves two, so the choice
is real in both; T3 → T4 raises every stat and there is nothing to choose. `withTierBought` takes
the stat to raise in the ambiguous cases, and the character sheet asks. See "Two readings,
decided" in [`phase-1-stories.md`](phase-1-stories.md).

## Recorded now, enforced later

Rules the published edition states that this app does not implement yet, written down while the
edition is fresh rather than rediscovered in the phase that needs them. **None of these are
Phase 1 code.**

- **Teaching caps at 2 XP per survivor** (pg. 12). A new constraint. XP *awards* are Phase 3.
- **Skill Score is stat + level + item modifier** (pg. 8) — the book's worked column headers are
  `Skill / Lvl / Stat / Item / Total`. The item term arrives with equipment, in Phase 5;
  `skillScore` in `src/engine/survivor.ts` notes the deferral rather than letting the formula
  quietly disagree with the book.
- **Heal Wounds is Advancement step 4, and distributes equally** (pg. 19). An allocation
  algorithm, not a sum: nobody gets a second point until everyone assigned has one. The point
  from Rest is usable only by the resting survivor, and only one survivor may rest per turn.
- **Planning Phase — the book contradicts itself, and pg. 21 wins.** The turn summary on pg. 17
  lists *step 3 mission team, step 4 rest and healing*. The Planning Phase section on pg. 20–21
  has *step 1 Facility Staff, step 2 Project Team, step 3 Rest and Healing, step 4 Mission Team*.
  Follow the detailed section. Written down so Phase 3 does not "correct" it back against the
  summary.
- **Utilities** are generated and assigned at the end of Planning step 1, immediately after
  facility staffing, and last until the next turn's Planning Phase (pg. 20).
- **The siege trigger reads d10 + Siege Threat ≥ 16** (pg. 23). Numerically identical to v1.25's
  "higher than 15"; use the published phrasing.
- **Rare Goods trade dice are the combined Scout score *plus* Coop stat** across the community,
  rolled as d10s onto the Rare Item Table (pg. 21). v1.25 said *or*. A real change.
- **The Rot check is against the Medicine score of Medical Clinic staff** (pg. 22).
- **Multiple mission teams per turn are explicit** (pg. 21): a mission team "can be split between
  any number of mission teams". Phase 4 models N teams from the start.
