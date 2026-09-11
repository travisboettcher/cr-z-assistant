/**
 * One of every kind of event, for tests that need to walk them all.
 *
 * Typed as `readonly CampaignEvent[]` and asserted complete below, so an event
 * added to `log.ts` without a sample here fails the typecheck rather than
 * quietly dropping out of every test that walks this list.
 *
 * Here rather than in `src/engine` beside `log.ts`, for the reason
 * `arbitraries.ts` is here: this is scaffolding two suites share, not engine
 * code. `stryker.config.json` mutates `src/engine`, and a mutant that flipped a
 * sample's Tier from 3 to 4 would survive every test that walks this list —
 * scoring the samples instead of the code they exercise.
 */

import type { CampaignEvent, CampaignEventKind } from '../engine/log';

const SURVIVOR = { survivor: 'a4f0c1e2-91b3-4d67-8a05-2c7e3f9b1d48', name: 'Earl Rhodes' } as const;

export const CAMPAIGN_EVENT_SAMPLES: readonly CampaignEvent[] = [
  { kind: 'campaign-started', name: 'Cedar Hollow' },
  { kind: 'phase-entered' },
  { kind: 'turn-began' },
  { kind: 'starting-community-settled', built: true },
  { kind: 'starting-community-settled', built: false },
  { kind: 'planning-began' },
  { kind: 'survivor-added', ...SURVIVOR, tier: 3 },
  { kind: 'survivor-recruited', ...SURVIVOR, tier: 2, roll: 6 },
  { kind: 'survivor-left', ...SURVIVOR, tier: 1 },
  { kind: 'survivor-promoted', ...SURVIVOR, tier: 4 },
  { kind: 'skill-level-bought', ...SURVIVOR, skill: 'archery', level: 2 },
  { kind: 'common-skill-bought', ...SURVIVOR, skill: 'move', score: 7 },
  { kind: 'base-claimed', base: 'hobby-farm' },
  { kind: 'facility-built', slot: 'front-yard', facility: 'watchtower' },
  { kind: 'upgrade-built', slot: 'kitchen', upgrade: 'gas-range' },
  { kind: 'slot-cleared', slot: 'ruined-chicken-coop' },
];

/**
 * Every kind the samples cover — used by `log.test.ts` to assert the list is
 * complete rather than merely long.
 */
export const SAMPLED_EVENT_KINDS: ReadonlySet<CampaignEventKind> = new Set(
  CAMPAIGN_EVENT_SAMPLES.map((event) => event.kind),
);
