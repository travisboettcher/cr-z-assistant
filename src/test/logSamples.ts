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
  // The base a claim is aiming at (pg. 78; Z4-7).
  {
    kind: 'mission-selected',
    team: 1,
    mission: 'claim-a-new-base',
    names: ['Earl Rhodes'],
    base: 'distillery',
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
  // A Rookie its setup placed on the area (pg. 79).
  { kind: 'gather-materials-resolved', team: 1, materialsCarriedOut: 5, strangers: [1] },
  { kind: 'retrieve-new-vehicles-resolved', team: 3, vehiclesDrivenOff: 0, strangers: [] },
  // What each vehicle driven off was, since Z5-11: a Tier 4 with its split, and a boat.
  {
    kind: 'retrieve-new-vehicles-resolved',
    team: 1,
    vehiclesDrivenOff: 2,
    retrieved: [
      { id: 'bus', tier: 4, label: 'School bus', water: false, inventorySlots: 12, roll: 10 },
      { id: 'skiff', tier: 1, label: 'Skiff', water: true, roll: 5 },
    ],
    strangers: [],
  },
  { kind: 'rescue-strangers-resolved', team: 1, strangers: [2] },
  { kind: 'rare-goods-trader-resolved', team: 2, survivorsExited: 1, strangers: [3] },
  // With a trade under way, and how many items the trader handed over (Z5-10).
  {
    kind: 'rare-goods-trader-resolved',
    team: 1,
    survivorsExited: 0,
    strangers: [],
    itemsTraded: 2,
  },
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
  {
    kind: 'gather-materials-resolved',
    team: 1,
    materialsCarriedOut: 0,
    strangers: [],
    wounds: [],
  },
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
  // Each cause (#201), and an entry from before the cause was recorded.
  { kind: 'survivor-left', ...SURVIVOR, tier: 1, cause: 'turned' },
  { kind: 'survivor-left', ...SURVIVOR, tier: 2, cause: 'bitten' },
  { kind: 'survivor-left', ...SURVIVOR, tier: 3, cause: 'removed' },
  { kind: 'survivor-left', ...SURVIVOR, tier: 1 },
  // A death on a mission (R71; Z5-13), with what stayed on the map and without.
  {
    kind: 'survivor-left',
    ...SURVIVOR,
    tier: 2,
    cause: 'killed',
    team: 2,
    lost: [{ id: 'rifle-1', item: 'rifle', grade: 'standard' }],
  },
  { kind: 'survivor-left', ...SURVIVOR, tier: 2, cause: 'killed', team: 1 },
  { kind: 'survivor-departed', ...SURVIVOR, tier: 1 },
  // What a departing survivor took (R73; Z5-13).
  {
    kind: 'survivor-departed',
    ...SURVIVOR,
    tier: 2,
    items: [{ id: 'rifle-1', item: 'rifle', grade: 'standard' }],
  },
  { kind: 'mission-team-reduced', ...SURVIVOR },
  { kind: 'survivor-promoted', ...SURVIVOR, tier: 4 },
  { kind: 'skill-level-bought', ...SURVIVOR, skill: 'archery', level: 2 },
  { kind: 'common-skill-bought', ...SURVIVOR, skill: 'move', score: 7 },
  { kind: 'base-claimed', base: 'hobby-farm' },
  // A move that fits every Hero, and one into a smaller base (pg. 54; R32).
  { kind: 'base-moved', from: 'hobby-farm', to: 'distillery', setAside: [] },
  {
    kind: 'base-moved',
    from: 'hydroelectric-dam',
    to: 'summer-camp',
    setAside: [{ survivor: 'earl', name: 'Earl Rhodes' }],
  },
  // A move after an overrun, which writes what the stores held (R29, R30).
  {
    kind: 'base-moved',
    from: 'hobby-farm',
    to: 'hobby-farm',
    setAside: [],
    stores: { food: 2, fuel: 1, hardware: 3, rare: 0 },
    // What the overrun destroyed, free to build again (pg. 86; Z4-10).
    rebuild: [
      { slot: 'garage', facility: 'workshop', upgrades: [] },
      { slot: 'kitchen', upgrades: ['gas-range'] },
    ],
  },
  // How the community went on from an overrun base (pg. 86; Z4-9).
  { kind: 'overrun-continued', option: 'claim' },
  { kind: 'overrun-continued', option: 'start-over' },
  { kind: 'overrun-continued', option: 'abandon' },
  // Leaving the survivors behind, and one of them brought back (R31; Z4-11).
  {
    kind: 'community-abandoned',
    setAside: [
      { survivor: 'earl', name: 'Earl Rhodes' },
      { survivor: 'ruby', name: 'Ruby Vance' },
    ],
  },
  { kind: 'rescue-strangers-resolved', team: 1, strangers: [2], returned: ['earl'] },
  { kind: 'survivor-returned', survivor: 'earl', name: 'Earl Rhodes' },
  // An item put in and taken out of the base's Inventory by hand (Z5-2).
  { kind: 'item-added', id: 'item-1', item: 'pistol', grade: 'standard' },
  { kind: 'item-removed', id: 'item-1', item: 'pistol', grade: 'standard' },
  // What a base handed over: the Firehouse's gear, and the Sports Shop's (Z5-8).
  {
    kind: 'equipment-handed-over',
    base: 'regional-firehouse',
    items: [{ id: 'item-8', item: 'reinforced-clothing', grade: 'standard' }],
  },
  {
    kind: 'equipment-handed-over',
    base: 'outdoor-sports-shop',
    slot: 'inventory',
    items: [{ id: 'item-9', item: 'bow', grade: 'standard' }],
  },
  // A rare upgrade installed from the Inventory (Z5-8).
  {
    kind: 'rare-upgrade-installed',
    id: 'item-7',
    item: 'gas-grill',
    grade: 'standard',
    slot: 'kitchen',
  },
  // An item a material roll of 10 found on the Rare Item Table (Z5-7).
  {
    kind: 'item-found',
    id: 'item-6',
    item: 'riot-shield',
    grade: 'standard',
    subtable: 3,
    entry: 1,
  },
  // An item the project team built (Z5-6).
  { kind: 'item-built', id: 'item-5', item: 'blunt', grade: 'standard', hardware: 1, labor: 1 },
  // Vehicles (Z5-11): added by hand, taken out, and an upgrade fitted.
  { kind: 'vehicle-added', vehicle: { id: 'car', tier: 2, label: 'Red pickup', water: false } },
  { kind: 'vehicle-removed', id: 'car', label: 'Red pickup', tier: 2 },
  {
    kind: 'vehicle-upgrade-fitted',
    vehicle: 'car',
    label: 'Red pickup',
    item: { id: 'rack', item: 'car-roof-rack', grade: 'standard' },
  },
  // What a move out of an overrun base lost (R53, R78, R79; Z5-13).
  {
    kind: 'overrun-lost',
    items: [{ id: 'rifle-1', item: 'rifle', grade: 'standard' }],
    vehicles: [{ id: 'car', tier: 2, label: 'Red pickup', water: false }],
    trades: [{ id: 'bat-1', item: 'blunt', grade: 'standard', food: 1, fuel: 0, orderedOnTurn: 3 }],
  },
  { kind: 'overrun-lost', items: [], vehicles: [], trades: [] },
  // Vehicles on a mission (Z5-12): taken, left home, and brought home or lost.
  { kind: 'vehicle-taken', team: 1, vehicle: 'car', label: 'Red pickup', tier: 2, fuel: 2 },
  { kind: 'vehicle-left-home', team: 1, vehicle: 'car', label: 'Red pickup', fuel: 2 },
  { kind: 'vehicles-brought-home', team: 1, lost: [] },
  {
    kind: 'vehicles-brought-home',
    team: 2,
    lost: [
      {
        id: 'van',
        tier: 4,
        label: 'Grey van',
        water: false,
        inventorySlots: 12,
        upgrade: { id: 'rack', item: 'car-roof-rack', grade: 'standard' },
      },
    ],
  },
  // The Rare Items trade (Z5-10): made, lost each way, and settled each way.
  {
    kind: 'rare-trade-made',
    items: [
      {
        id: 'item-9',
        item: 'riot-shield',
        grade: 'standard',
        subtable: 3,
        entry: 1,
        food: 4,
        fuel: 6,
      },
    ],
  },
  ...(['siege', 'other-mission', 'no-mission'] as const).map((reason) => ({
    kind: 'rare-trade-lost' as const,
    reason,
    items: [{ id: 'item-9', item: 'riot-shield' as const, grade: 'standard' as const }],
    food: 4,
    fuel: 6,
  })),
  {
    kind: 'rare-trade-closed',
    arrived: [{ id: 'item-9', item: 'riot-shield', grade: 'standard' }],
    lost: [],
    food: 0,
    fuel: 6,
  },
  {
    kind: 'rare-trade-closed',
    arrived: [],
    lost: [{ id: 'item-9', item: 'riot-shield', grade: 'standard' }],
    food: 2,
    fuel: 0,
  },
  { kind: 'rare-trade-closed', arrived: [], lost: [], food: 0, fuel: 0 },
  // Trading (Z5-9): paid in a mix, and in one material alone.
  { kind: 'trade-ordered', id: 'item-6', item: 'pistol', grade: 'standard', food: 1, fuel: 2 },
  { kind: 'trade-ordered', id: 'item-7', item: 'tool-belt', grade: 'quality', food: 0, fuel: 8 },
  { kind: 'trade-arrived', id: 'item-6', item: 'pistol', grade: 'standard' },
  { kind: 'item-sold', id: 'item-8', item: 'riot-shield', grade: 'standard', food: 8, fuel: 0 },
  // What a mission used up (Z5-5).
  {
    kind: 'items-spent',
    team: 1,
    items: [
      { id: 'item-4', item: 'grenade', grade: 'standard', survivor: 'earl', name: 'Earl Rhodes' },
    ],
  },
  // Items moved at Equip Mission Team, each end of each kind (Z5-4).
  {
    kind: 'item-moved',
    id: 'item-2',
    item: 'rifle',
    grade: 'quality',
    from: 'base',
    to: { survivor: 'earl', name: 'Earl Rhodes' },
  },
  {
    kind: 'item-moved',
    id: 'item-3',
    item: 'bow',
    grade: 'shoddy',
    from: { survivor: 'earl', name: 'Earl Rhodes' },
    to: 'free',
  },
  // The claim an overrun went on with, on the overrun base's own map (R29).
  {
    kind: 'claim-a-new-base-resolved',
    team: 1,
    endCondition: 1,
    strangers: [],
    vehiclesOnArea: 0,
    sameMap: true,
  },
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
