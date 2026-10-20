/**
 * How a Magic mission ended, inside its outcome form (pp. 112–114; R123, R124,
 * R153; Z7-9): whether it was completed, and for The Necromancer whether he was
 * killed. Each member's Humanity is asked with their Health.
 */

import type { MagicMissionId } from '../data/missions';
import type { MagicRecord } from '../engine/log';
import { magicAsks } from '../engine/magicMissions';
import { FOCUS_RING } from './styles';

const LABELS = {
  completed: 'The mission was completed',
  killed: 'The Necromancer was killed',
} as const;

export function MagicEnding({
  mission,
  record,
  onChange,
}: {
  readonly mission: MagicMissionId;
  readonly record: MagicRecord;
  readonly onChange: (record: MagicRecord) => void;
}) {
  return (
    <>
      {magicAsks(mission).map((field) => (
        <label key={field} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={FOCUS_RING}
            checked={record[field] === true}
            onChange={(changed) => {
              onChange({ ...record, [field]: changed.target.checked });
            }}
          />
          {LABELS[field]}
        </label>
      ))}
    </>
  );
}
