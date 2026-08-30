# `src/persistence` — save files

Everything that turns a `Campaign` into bytes and back: the schema version, the migration
chain, save-file parsing and validation, export and import.

The durable save is an exported `.json` file. `localStorage` autosave is a convenience layer
on top, **never the only copy** — a cleared browser must not cost a campaign.

The migration harness lands before anything can write a file (Z0-4 before Z0-8), so there is
never a save format on disk that nothing can read back. When the `Campaign` shape changes,
bump `CURRENT_SCHEMA_VERSION`, add a migration step, and check in a fixture of the old shape —
the version-bump guard test fails if you skip either.
