/**
 * Materials in storage, typed in by hand.
 *
 * Opened from the Materials card beside the turn. The Advancement and
 * Management Phases move materials themselves; this is for a table correcting
 * the count, or one entering a campaign part-way through.
 */

import { useId } from 'react';
import { MATERIALS } from '../data/materials';
import type { Campaign } from '../engine/campaign';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

export function MaterialsEditor({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const materialsId = useId();

  return (
    <fieldset>
      <legend className="font-medium" id={materialsId}>
        Materials in storage
      </legend>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        For corrections — each turn’s haul goes in at Add Materials to Storage{' '}
        <PageRef pages={19} />
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        {MATERIALS.map((material) => (
          <div key={material} className="flex flex-col gap-1">
            <label htmlFor={`${materialsId}-${material}`} className="text-sm capitalize">
              {material}
            </label>
            <input
              id={`${materialsId}-${material}`}
              type="number"
              min={0}
              value={campaign.materials[material]}
              onChange={(event) => {
                dispatch({
                  type: 'campaign/materialSet',
                  material,
                  count: Math.max(0, Number(event.target.value)),
                });
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} w-24 rounded-lg border border-stone-300 bg-white px-3 tabular-nums dark:border-stone-700 dark:bg-stone-950`}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
