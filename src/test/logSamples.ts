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
  { kind: 'materials-added', food: 3, fuel: 0, hardware: 1, rare: 0 },
  // Negative, because a facility that eats Food can outweigh the haul (pg. 55)
  // and the validator has to accept an amount no other event's field would.
  { kind: 'materials-added', food: -2, fuel: 0, hardware: 0, rare: 0 },
  { kind: 'siege-fought', names: ['Earl Rhodes', 'Carla Proust'] },
  // Nobody, which is a real state rather than a missing field: a community can
  // be down to nothing by the turn the horde arrives.
  { kind: 'siege-fought', names: [] },
  {
    kind: 'materials-scavenged',
    survivor: 'b7e41f28-3c60-4d95-8a12-6f0e9d4c7b53',
    name: 'Earl Rhodes',
    food: 1,
    fuel: 1,
    hardware: 1,
    rare: 1,
  },
  // One material of one type, which is what a scavenger without the skill
  // brings back (pg. 17) — and zero of the other three, which is a count the
  // validator has to accept rather than read as a missing field.
  {
    kind: 'materials-scavenged',
    survivor: 'carla',
    name: 'Carla Proust',
    food: 0,
    fuel: 0,
    hardware: 0,
    rare: 1,
  },
  {
    kind: 'materials-converted',
    slot: 'kitchen',
    source: 'gas-range',
    spent: { fuel: 2 },
    gained: { food: 1 },
  },
  { kind: 'xp-awarded', ...SURVIVOR, amount: 1, source: 'mission' },
  { kind: 'xp-awarded', ...SURVIVOR, amount: 2, source: 'mission-teaching' },
  { kind: 'health-restored', ...SURVIVOR, health: 2, source: 'facility' },
  { kind: 'health-restored', ...SURVIVOR, health: 1, source: 'rest' },
  // Under the Viral origin a point may remove Infection instead (#176).
  { kind: 'health-restored', ...SURVIVOR, health: 3, source: 'facility', infection: 2 },
  { kind: 'survivors-fed', required: 10, hunger: 0 },
  { kind: 'survivors-fed', required: 10, hunger: 6 },
  { kind: 'rot-checked', ...SURVIVOR, roll: 7, target: 12, passed: false },
  // A Clinic can drive the target below zero, which the book leaves unclamped
  // (R2) — so the validator has to accept a target no count would.
  { kind: 'rot-checked', ...SURVIVOR, roll: 10, target: -1, passed: true },
  { kind: 'bite-restrained', ...SURVIVOR },
  { kind: 'survivor-bitten', ...SURVIVOR, damage: 1 },
  { kind: 'storage-checked', food: 2, fuel: 0, hardware: 0 },
  { kind: 'facility-ordered', slot: 'garage', facility: 'workshop' },
  { kind: 'upgrade-ordered', slot: 'kitchen', upgrade: 'gas-range' },
  { kind: 'clearing-ordered', slot: 'front-yard' },
  { kind: 'project-cancelled', slot: 'garage' },
  { kind: 'project-unfinished', slot: 'garage' },
  // And one that says what came back, which entries written since #173 do.
  { kind: 'project-unfinished', slot: 'garage', hardware: 2, built: 'workshop' },
  { kind: 'horde-checked', roll: 9, threat: 4, siege: false },
  // A base built for defence can drive the threat below zero (pg. 73), so the
  // validator has to accept a negative where no count would.
  { kind: 'horde-checked', roll: 10, threat: -3, siege: false },
  // Called on a roll that fell short: a Thin the Herd that put everybody down
  // makes the next roll succeed on its own (pg. 81).
  { kind: 'horde-checked', roll: 2, threat: 4, siege: true },
  { kind: 'mission-selected', team: 1, mission: 'thin-the-herd', names: ['Earl Rhodes'] },
  // The one mission that asks for anything, and a second team: pg. 21 splits
  // the mission survivors between any number of them.
  {
    kind: 'mission-selected',
    team: 2,
    mission: 'gather-materials',
    names: ['Carla Proust', 'Ruby Vance'],
    material: 'fuel',
  },
  { kind: 'mission-skipped' },
  { kind: 'siege-defense-resolved', zombiesLeft: 0, survivorsExited: 2 },
  // A team, which every outcome written since Z4-3 carries.
  { kind: 'siege-defense-resolved', zombiesLeft: 1, survivorsExited: 0, team: 1 },
  { kind: 'first-mission-resolved', team: 1, endCondition: 2, strangers: [1, 2] },
  // No end condition met, which is the failure R21 reads.
  { kind: 'first-mission-resolved', team: 1, endCondition: null, strangers: [] },
  {
    kind: 'claim-a-new-base-resolved',
    team: 2,
    endCondition: 1,
    strangers: [3],
    vehiclesOnArea: 1,
  },
  { kind: 'gather-materials-resolved', team: 1, materialsCarriedOut: 5 },
  { kind: 'retrieve-new-vehicles-resolved', team: 3, vehiclesDrivenOff: 0 },
  { kind: 'rescue-strangers-resolved', team: 1, strangers: [2] },
  { kind: 'rare-goods-trader-resolved', team: 2, survivorsExited: 1 },
  { kind: 'mission-played', team: 1, mission: 'left-behind-1' },
  { kind: 'siege-defense-resolved', zombiesLeft: 3, survivorsExited: 1 },
  // The team's wounds, which every outcome written since Z4-4 carries: Health
  // at the end, 0 included, and Infection only in a Viral campaign.
  {
    kind: 'siege-defense-resolved',
    zombiesLeft: 0,
    survivorsExited: 1,
    team: 1,
    wounds: [
      { ...SURVIVOR, health: 0 },
      { survivor: 'ruby', name: 'Ruby Vance', health: 3 },
    ],
  },
  {
    kind: 'mission-played',
    team: 2,
    mission: 'medical-salvage',
    wounds: [{ survivor: 'carla', name: 'Carla Proust', health: 2, infection: 4 }],
  },
  // A team with nobody left on it records nobody's Health.
  { kind: 'gather-materials-resolved', team: 1, materialsCarriedOut: 0, wounds: [] },
  { kind: 'stood-in', ...SURVIVOR, by: 'ruby', byName: 'Ruby Vance' },
  // Nobody: the place left empty again, which is a choice the log keeps.
  { kind: 'stood-in', ...SURVIVOR },
  {
    kind: 'thin-the-herd-resolved',
    startingZombies: 8,
    zombiesLeft: 3,
    survivorsExited: 1,
    allIncapacitated: false,
  },
  {
    kind: 'thin-the-herd-resolved',
    startingZombies: 8,
    zombiesLeft: 6,
    survivorsExited: 0,
    allIncapacitated: true,
  },
  { kind: 'survivor-added', ...SURVIVOR, tier: 3 },
  { kind: 'survivor-recruited', ...SURVIVOR, tier: 2, roll: 6 },
  { kind: 'stranger-joined', ...SURVIVOR, tier: 2, team: 2, stranger: 0, roll: 6 },
  // A Rookie, who does not roll (pg. 7), and the second stranger on a team.
  { kind: 'stranger-joined', ...SURVIVOR, tier: 1, team: 1, stranger: 1 },
  { kind: 'survivor-left', ...SURVIVOR, tier: 1 },
  { kind: 'survivor-departed', ...SURVIVOR, tier: 1 },
  { kind: 'mission-team-reduced', ...SURVIVOR },
  { kind: 'survivor-promoted', ...SURVIVOR, tier: 4 },
  { kind: 'skill-level-bought', ...SURVIVOR, skill: 'archery', level: 2 },
  { kind: 'common-skill-bought', ...SURVIVOR, skill: 'move', score: 7 },
  { kind: 'base-claimed', base: 'hobby-farm' },
  { kind: 'base-stocked', food: 4, fuel: 4, hardware: 4 },
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
