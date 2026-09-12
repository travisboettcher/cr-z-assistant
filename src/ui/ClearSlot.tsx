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
import { clearingProject } from '../engine/base';
import { checkClearing } from '../engine/clearing';
import { useCampaign } from '../state/useCampaign';
import { SlotAction } from './SlotAction';

export interface ClearSlotProps {
  readonly campaign: Campaign;
  readonly slot: string;
  readonly onCleared: () => void;
}

export function ClearSlot({ campaign, slot, onCleared }: ClearSlotProps) {
  const { dispatch } = useCampaign();

  const project = clearingProject(campaign, slot);
  const check = checkClearing(campaign, { slot });

  return (
    <SlotAction
      campaign={campaign}
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
      label="Order the clearing"
      overrideLabel="Order it anyway"
      onCommit={() => {
        dispatch({
          type: 'project/ordered',
          project: { kind: 'clearing', slot },
          at: new Date().toISOString(),
        });
        onCleared();
      }}
    />
  );
}
