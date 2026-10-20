/**
 * The six spells' names, as the book prints them on pg. 127 (R112; Z7-9), and
 * a list of them the way a sentence reads one.
 */

import type { SpellId } from '../data/origins';

export const SPELL_LABELS: Record<SpellId, string> = {
  'dominate-enemy': 'Dominate Enemy',
  'rain-of-fire': 'Rain of Fire',
  teleport: 'Teleport',
  restoration: 'Restoration',
  duplicate: 'Duplicate',
  'mass-recall': 'Mass Recall',
};

/** "Teleport", "Teleport and Duplicate", "Teleport, Duplicate and Mass Recall". */
export function spellList(spells: readonly SpellId[]): string {
  const names = spells.map((spell) => SPELL_LABELS[spell]);
  const last = names.at(-1) ?? '';

  return names.length <= 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}
