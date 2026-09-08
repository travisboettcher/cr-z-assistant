/**
 * The clearing form — the third verb, and the one with nothing to choose.
 *
 * `SlotAction` renders four parts and this supplies three of them: **there is
 * no picker**, because a clearing project is the only thing that can be done to
 * a blocked slot. The design allowed for that from the start — see
 * `docs/base-slot-interaction.md` — so the absence costs nothing here.
 *
 * What the project yields is on the card above rather than repeated in here.
 * Saying it twice was the first thing a test tripped over, and the summary is
 * where it belongs: a player choosing what to spend Labor on wants it before
 * they open anything.
 */

import type { Campaign } from '../engine/campaign';
import { checkClearing, clearingProject } from '../engine/clearing';
import { useCampaign } from '../state/useCampaign';
import { SlotAction } from './SlotAction';

export interface ClearSlotProps {
  readonly campaign: Campaign;
  readonly slot: string;
  readonly labor: number;
  readonly onCleared: () => void;
}

export function ClearSlot({ campaign, slot, labor, onCleared }: ClearSlotProps) {
  const { dispatch } = useCampaign();

  const project = clearingProject(campaign, slot);
  const check = checkClearing(campaign, { slot, labor });

  return (
    <SlotAction
      // A clearing project costs Labor and no Hardware. Written as a zero
      // rather than hidden, so the cost line reads the same on every verb.
      cost={{ hardware: 0, labor: project?.labor ?? 0 }}
      check={check}
      // Nothing about clearing is a rule a table might play differently, so
      // there are never warnings and the override never appears. Passed as
      // constants rather than made optional: a verb that cannot be overridden
      // says so by never having one, not by the prop being absent.
      overridden={false}
      onOverride={() => {
        /* no warnings to override */
      }}
      label="Clear it"
      overrideLabel="Clear it anyway"
      onCommit={() => {
        dispatch({ type: 'slot/cleared', slot, labor });
        onCleared();
      }}
    />
  );
}
