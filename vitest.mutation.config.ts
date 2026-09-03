/**
 * The test run Stryker mutates against — the pure layers only.
 *
 * **This is a claim, not just a speed optimisation.** Mutation testing asks
 * whether the tests notice a broken implementation, and *which* tests notice
 * matters. A mutant in `campaignStore.ts` killed only by a React component test
 * is still a gap in the reducer's own tests: the reducer is meant to be
 * testable as a function, and a rule that only breaks when rendered is a rule
 * nobody can check without a DOM. Restricting the run to `src/engine`,
 * `src/state` and `src/persistence` makes the reported score mean *the pure
 * layers test themselves*.
 *
 * It is also much faster — the UI suite is jsdom plus `user-event` and would
 * dominate several hundred mutant runs — but that is the side benefit, not the
 * reason.
 *
 * jsdom and the usual setup file are kept rather than switching to `node`.
 * `autosave.ts` is localStorage and `downloadCampaign` builds an anchor and
 * clicks it, so two files here do need a browser, and excluding their tests to
 * win a faster environment would drop real coverage of `serializeCampaign`
 * along with it. The whole run is two seconds either way.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/{engine,state,persistence}/**/*.test.ts'],
  },
});
