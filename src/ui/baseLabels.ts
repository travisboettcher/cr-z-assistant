/**
 * Display names for bases, facilities, upgrades and slots.
 *
 * Presentation only, like `skillLabels.ts` and `tierLabels.ts`. What a facility
 * *does* is rule text and stays in the rulebook; what it is *called* is the
 * minimum needed to put it on a screen, and `bunk-room` is an identifier.
 *
 * The first three are full `Record`s, so adding a base, facility or upgrade to
 * `src/data` fails the typecheck here rather than rendering `undefined` at
 * someone standing over a table.
 */

import type { BaseId } from '../data/bases';
import type { FacilityId, SlotKind, UpgradeId, Utility } from '../data/facilities';

export const BASE_LABELS: Record<BaseId, string> = {
  'small-town-home': 'Small Town Home',
  'summer-camp': 'Summer Camp',
  'rural-church': 'Rural Church',
  'greasy-spoon': 'Greasy Spoon',
  'hobby-farm': 'Hobby Farm',
  distillery: 'Distillery',
  'outdoor-sports-shop': 'Outdoor Sports Shop',
  'renaissance-festival': 'Renaissance Festival',
  'hydroelectric-dam': 'Hydroelectric Dam',
  'regional-firehouse': 'Regional Firehouse',
};

export const FACILITY_LABELS: Record<FacilityId, string> = {
  'bunk-room': 'Bunk Room',
  garden: 'Garden',
  kitchen: 'Kitchen',
  'medical-clinic': 'Medical Clinic',
  'mystic-library': 'Mystic Library',
  'storage-area': 'Storage Area',
  'training-room': 'Training Room',
  'utility-station': 'Utility Station',
  watchtower: 'Watchtower',
  workshop: 'Workshop',
};

export const UPGRADE_LABELS: Record<UpgradeId, string> = {
  'extra-bed': 'Extra Bed',
  loft: 'Loft',
  lounge: 'Lounge',

  fence: 'Fence',
  'herb-plot': 'Herb Plot',
  greenhouse: 'Greenhouse',

  refrigerator: 'Refrigerator',
  'gas-range': 'Gas Range',
  'biofuel-lab': 'Biofuel Lab',

  restraints: 'Restraints',
  'med-lab': 'Med Lab',
  'recovery-room': 'Recovery Room',
  containment: 'Containment',

  'study-room': 'Study Room',

  refrigeration: 'Refrigeration',
  'fuel-tank': 'Fuel Tank',
  shelving: 'Shelving',

  'weight-room': 'Weight Room',
  'ropes-course': 'Ropes Course',
  classroom: 'Classroom',

  generator: 'Generator',
  'well-pump': 'Well Pump',
  'solar-panel': 'Solar Panel',
  'rain-collector': 'Rain Collector',

  'watch-post': 'Watch Post',
  spotlight: 'Spotlight',

  'metal-shop': 'Metal Shop',
  gunsmith: 'Gunsmith',
  'auto-shop': 'Auto Shop',
};

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
};

export const UTILITY_LABELS: Record<Utility, string> = {
  power: 'Power',
  water: 'Water',
};

/**
 * Slot names that title-casing the id gets wrong.
 *
 * One entry, and the rest are derived — see `slotLabel`.
 */
const SLOT_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  'kings-pavilion': "King's Pavilion",
};

/**
 * The name of a slot, from its id.
 *
 * **Derived rather than mapped, which is the opposite of every other label in
 * this file, and deliberately.** Slot ids are `string` rather than a union —
 * they are unique within a base, not across the roster — so a full `Record`
 * could not be typechecked for completeness, which is the only thing that makes
 * the maps above worth writing by hand. An untypechecked map of forty entries
 * is a list that silently goes stale the first time a slot is renamed.
 *
 * So the id carries the name and this restores it, with an override for the one
 * slot whose name has punctuation an identifier cannot hold. A test walks every
 * slot of every base and asserts each label comes out looking like a name.
 *
 * Repeated slots keep their number — "Parking Lot 2" is how a player tells the
 * base's three parking lots apart, and dropping it would make the slot map
 * ambiguous exactly where it is longest.
 */
export function slotLabel(id: string): string {
  const override = SLOT_LABEL_OVERRIDES[id];
  if (override !== undefined) return override;

  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
