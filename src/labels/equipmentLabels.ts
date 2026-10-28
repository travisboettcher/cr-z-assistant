/**
 * How items read on a screen (pp. 37–53; Z5-2).
 *
 * Display names live here, never in `src/data` (see `src/data/README.md`):
 * `historical-katana` is an identifier, and naming it for a table is
 * `src/labels`' job.
 */

import type { Grade, ItemId, ItemKind } from '../data/equipment';
import type { Item } from '../engine/campaign';
import type { ItemHolder } from '../engine/log';

export const ITEM_LABELS: Record<ItemId, string> = {
  pistol: 'Pistol',
  revolver: 'Revolver',
  rifle: 'Rifle',
  shotgun: 'Shotgun',
  bow: 'Bow',
  crossbow: 'Crossbow',
  blunt: 'Blunt weapon',
  bladed: 'Bladed weapon',
  heavy: 'Heavy weapon',
  flamethrower: 'Flamethrower',
  'harpoon-gun': 'Harpoon gun',
  'incendiary-shells': 'Incendiary shells',
  'flaming-arrows': 'Flaming arrows',
  'silver-ammunition': 'Silver ammunition',
  'enchanted-melee-weapon': 'Enchanted melee weapon',
  'tool-belt': 'Tool belt',
  backpack: 'Backpack',
  'breaching-tool': 'Breaching tool',
  'burglar-tools': 'Burglar tools',
  'walkie-talkie': 'Walkie talkie',
  binoculars: 'Binoculars',
  'resistance-charm': 'Resistance charm',
  'improvised-armor': 'Improvised armor',
  'improvised-shield': 'Improvised shield',
  'reinforced-clothing': 'Reinforced clothing',
  'knee-pads': 'Knee pads',
  'adrenaline-shot': 'Adrenaline shot',
  bandages: 'Bandages',
  'fireworks-bundle': 'Fireworks bundle',
  grenade: 'Grenade',
  'molotov-cocktail': 'Molotov cocktail',
  'rope-ladder': 'Rope ladder',
  'throwing-axe': 'Throwing axe',
  trap: 'Trap',
  'persistent-trap': 'Persistent trap',
  'lure-trap': 'Lure trap',
  'persistent-lure-trap': 'Persistent lure trap',
  'antiviral-grenade': 'Antiviral grenade',
  disinfectant: 'Disinfectant',
  'medicated-wrap': 'Medicated wrap',
  inoculation: 'Inoculation',
  'warding-stones': 'Warding stones',
  'gas-grill': 'Gas grill',
  fertilizer: 'Fertilizer',
  'battery-spotlight': 'Battery spotlight',
  'flat-pack-shelves': 'Flat pack shelves',
  'video-game-console': 'Video game console',
  'sleeping-bags': 'Sleeping bags',
  'resistance-bands': 'Resistance bands',
  'portable-generator': 'Portable generator',
  'electric-car-conversion': 'Electric car conversion',
  'car-roof-rack': 'Car roof rack',
  'riot-shield': 'Riot shield',
  'ultralight-backpack': 'Ultralight backpack',
  'tactical-holster': 'Tactical holster',
  'night-vision-goggles': 'Night vision goggles',
  'paramedic-kit': 'Paramedic kit',
  'scent-masker': 'Scent masker',
  'tactical-armor': 'Tactical armor',
  'smoke-grenade': 'Smoke grenade',
  'door-spikes': 'Door spikes',
  'grappling-hook': 'Grappling hook',
  'fully-automatic-rifle': 'Fully automatic rifle',
  'pistol-suppressor': 'Pistol suppressor',
  'sawed-off-shotgun': 'Sawed-off shotgun',
  'giant-revolver': 'Giant revolver',
  'halligan-tool': 'Halligan tool',
  'historical-katana': 'Historical katana',
  bayonet: 'Bayonet',
  'quick-quiver': 'Quick quiver',
  'ultralight-spear': 'Ultralight spear',
  'repeating-crossbow': 'Repeating crossbow',
};

export const GRADE_LABELS: Record<Grade, string> = {
  shoddy: 'Shoddy',
  standard: 'Standard',
  quality: 'Quality',
};

/** The chapter's groups, as the Inventory lists them. */
export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  weapon: 'Weapons',
  ammunition: 'Ammunition',
  equipment: 'Equipment',
  protective: 'Protective gear',
  disposable: 'Disposables',
  'rare-equipment': 'Rare equipment',
  'rare-weapon': 'Rare weapons',
  'rare-upgrade': 'Rare base upgrades',
  'vehicle-upgrade': 'Vehicle upgrades',
};

/**
 * An item and its grade as a phrase: "quality pistol", "standard bandages".
 * No article, because a third of the catalogue is plural (bandages, binoculars).
 */
export function describeItem(item: Pick<Item, 'item' | 'grade'>): string {
  return `${item.grade} ${ITEM_LABELS[item.item].toLowerCase()}`;
}

/** One end of an item's move at Equip Mission Team, as a log line names it (Z5-4). */
export function holderLabel(holder: ItemHolder): string {
  if (holder === 'base') return 'the base’s Inventory';
  if (holder === 'free') return 'the free shoddy supply';

  return holder.name;
}
