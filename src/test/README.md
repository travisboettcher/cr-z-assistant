# `src/test` — test infrastructure

Setup and generators. **No tests live here** — a test belongs next to the thing it tests, and
Vitest only collects `src/**/*.{test,spec}.{ts,tsx}` anyway.

- `setup.ts` runs before every suite: Testing Library cleanup, `localStorage` reset between
  tests, and the smallest `<dialog>` stand-in jsdom needs. Anything added here runs for the
  whole suite, so it has to be cheap and it has to be something *every* test wants.
- `arbitraries.ts` holds the `fast-check` generators the `*.property.test.ts` files draw from.
  It is the persisted shape written down a second time, deliberately: `fc.record<Campaign>`
  stops typechecking when a field is added to the type and not to the generator. See
  [`docs/mutation-testing.md`](../../docs/mutation-testing.md).

Fixtures of *saved files* do not belong here either — those are versioned alongside the
migration chain in `src/persistence/__fixtures__`, because what makes them worth keeping is
which schema version they are a sample of.
