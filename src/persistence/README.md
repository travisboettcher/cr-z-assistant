# `src/persistence` — save files

Everything that turns a `Campaign` into bytes and back: the schema version, the migration
chain, save-file parsing and validation, export and import.

The durable save is an exported `.json` file. `localStorage` autosave is a convenience layer
on top, **never the only copy** — a cleared browser must not cost a campaign.

`parseCampaignFile` in `saveFile.ts` is the only way a file becomes a `Campaign`. It never
throws: every failure comes back as a result carrying a sentence someone mid-campaign can act
on. Shape validation happens twice around the migration chain on purpose — before it, only
"is this a JSON object?", because an old save is *meant* to be missing fields; after it, the
full current shape, because that is the contract `migrations.ts` says it is trusting the
caller to hold up. Versioning in between belongs to `migrate` alone, and its errors are
forwarded rather than reworded.

The migration harness lands before anything can write a file (Z0-4 before Z0-8), so there is
never a save format on disk that nothing can read back. When the `Campaign` shape changes,
bump `CURRENT_SCHEMA_VERSION`, add a migration step, and check in a fixture of the old shape —
the version-bump guard test fails if you skip either.

Not everything in `localStorage` is a save. `pendingRolls.ts` keeps the dice a player has
entered but not yet committed, and it is deliberately outside all of the above: no schema
version, no migration, and nothing of it in an exported file — an export is a record of what
happened, and uncommitted input is not that yet. It is stamped with a campaign id and a turn
so a reload after ending the turn discards it rather than handing this turn's step yesterday's
dice, and every value read back is validated, because the entry is hand-editable and no
migration chain stands between it and the engine.

**Look up a catalogue entry with `isKeyOf`, never with `in`.** `in` walks the prototype chain, so
`'toString' in FACILITIES` is `true` and a file naming a facility `toString` passes validation and
hands the next screen a function. Ordinary words, not exotic input, and the module's contract is
that a damaged file comes back as a sentence rather than an exception thrown somewhere else.
