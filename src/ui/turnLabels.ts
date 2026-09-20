/**
 * Display names for the phases and steps of the campaign turn.
 *
 * Presentation only — the order and the set of both are rules and live in
 * `src/data/turn.ts`, and these maps exist solely so no screen renders a raw
 * lowercase id at someone standing over a table. Both are full `Record`s, so a
 * phase or step added to the rules fails the typecheck here instead of quietly
 * rendering `undefined`.
 *
 * **Short, and in the book's own words where it has them.** These are read off
 * a tablet at arm's length while somebody else is moving miniatures, so
 * "Check the Horde" rather than "Check the horde for a siege". What the step
 * *does* is rule text and stays in the rulebook; the screen cites the page.
 */

import type { CampaignPhase, TurnStepId } from '../data/turn';

export const PHASE_LABELS: Record<CampaignPhase, string> = {
  mission: 'Mission',
  advancement: 'Advancement',
  planning: 'Planning',
  management: 'Management',
};

export const STEP_LABELS: Record<TurnStepId, string> = {
  'select-mission': 'Select Mission',
  'equip-mission-team': 'Equip the Mission Team',
  'tactical-mission': 'Play the Mission',

  'character-advancement': 'Character Advancement',
  'create-new-survivors': 'Create New Survivors',
  'add-materials-to-storage': 'Add Materials to Storage',
  'heal-wounds': 'Heal Wounds',
  'add-facilities-and-upgrades': 'Add Facilities and Upgrades',

  'assign-facility-staff': 'Assign Facility Staff',
  'assign-project-team': 'Assign Project Team',
  'assign-rest-and-healing': 'Assign Rest and Healing',
  'assign-mission-team': 'Assign Mission Team',

  'check-for-rot': 'Check for Rot',
  'feed-your-survivors': 'Feed your Survivors',
  'assign-beds': 'Assign Beds',
  'calculate-unrest': 'Calculate Unrest',
  'check-storage': 'Check Storage',
  'check-the-horde': 'Check the Horde',
  departures: 'Departures',
};
