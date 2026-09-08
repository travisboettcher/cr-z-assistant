/**
 * What this facility would make, and who would have to work it.
 *
 * **A preview, and nothing else.** Assigning a survivor to a facility is
 * Planning Step 1 and belongs to Phase 3, along with the rule that a survivor
 * takes exactly one task per turn. Picking someone here answers "what would
 * this make" and is never written to the campaign — the select's value is
 * component state, and the store has no action to record it.
 */

import { useId, useState } from 'react';
import type { Occupant } from '../engine/base';
import type { Campaign } from '../engine/campaign';
import { facilityProduction, wantsStaff, type ProducedOutput } from '../engine/production';
import { STAT_LABELS } from './skillLabels';
import { UTILITY_LABELS } from './baseLabels';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export interface ProductionPreviewProps {
  readonly campaign: Campaign;
  readonly occupant: Occupant;
}

const OUTPUT_LABELS: Record<ProducedOutput, string> = {
  food: 'Food',
  fuel: 'Fuel',
  hardware: 'Hardware',
  rare: 'Rare',
  health: 'Health',
  xp: 'XP',
  power: UTILITY_LABELS.power,
  water: UTILITY_LABELS.water,
  'siege-threat': 'Siege Threat',
};

export function ProductionPreview({ campaign, occupant }: ProductionPreviewProps) {
  const chooserId = useId();
  const [staffId, setStaffId] = useState<string | null>(null);

  const staff = campaign.survivors.filter((survivor) => survivor.id === staffId);
  const lines = facilityProduction(occupant, staff);
  const needsSomeone = wantsStaff(occupant);

  return (
    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-800">
      <p className="text-sm font-medium">Produces</p>

      {needsSomeone && (
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor={chooserId} className="text-sm text-stone-600 dark:text-stone-400">
            Preview with <PageRef pages="72–73" />
          </label>
          <select
            id={chooserId}
            value={staffId ?? ''}
            onChange={(event) => {
              setStaffId(event.target.value === '' ? null : event.target.value);
            }}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950`}
          >
            <option value="">Nobody assigned</option>
            {campaign.survivors.map((survivor) => (
              <option key={survivor.id} value={survivor.id}>
                {survivor.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Nothing this turn.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {lines.map((line, index) => (
            // Index-keyed because a facility can hold two lines that are equal
            // in every field — three Extra Beds produce nothing, but two Gas
            // Ranges each produce a Food, and neither has an identity of its
            // own to key on.
            <li key={index} className="text-sm text-stone-600 dark:text-stone-400">
              {line.amount >= 0 ? '+' : ''}
              {line.amount} {line.outputs.map((output) => OUTPUT_LABELS[output]).join(' or ')}
              {line.outputs.length > 1 && ', in any mix'}
              {line.restrictedToStat !== undefined &&
                `, ${STAT_LABELS[line.restrictedToStat]} skills only`}
              {line.halved && ', halved for want of a utility'}
              {line.staffed && line.missingSkill && ', but they do not have the skill'}
              {line.staffed && staff.length === 0 && ' — needs someone assigned'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
