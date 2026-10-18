/**
 * What a Viral mission ended with, inside its outcome form (pp. 103–107;
 * R104, R122, R131, R144, R146; Z7-6): the points of interest and the Broken
 * Cage check, the ensnared zombies that left, or the Medical Supply tokens.
 * What they do is said under the form, as every outcome's consequences are.
 */

import type { ViralMissionId } from '../data/missions';
import { viralAsks } from '../engine/viralMissions';
import { FOCUS_RING } from './styles';
import type { ViralDraft } from './viralDraft';

const FIELD = `${FOCUS_RING} w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-800`;

const LABELS = {
  investigated: 'Points of interest investigated',
  zombiesLeft: 'Ensnared zombies that left the area',
  supplies: 'Medical Supply tokens',
} as const;

export function ViralEnding({
  mission,
  prefix,
  draft,
  onChange,
}: {
  readonly mission: ViralMissionId;
  /** Makes each control's id the team's own. */
  readonly prefix: string;
  readonly draft: ViralDraft;
  readonly onChange: (draft: ViralDraft) => void;
}) {
  return (
    <>
      {viralAsks(mission).map((field) => {
        if (field === 'brokenCage') {
          return (
            <label key={field} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={FOCUS_RING}
                checked={draft.brokenCage}
                onChange={(changed) => {
                  onChange({ ...draft, brokenCage: changed.target.checked });
                }}
              />
              The Broken Cage check passed
            </label>
          );
        }
        if (field === 'held') return null;

        const id = `${prefix}-${field}`;

        return (
          <div key={field} className="flex items-center gap-2">
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={draft[field]}
              className={FIELD}
              onChange={(changed) => {
                onChange({ ...draft, [field]: changed.target.value });
              }}
            />
            <label className="text-sm" htmlFor={id}>
              {LABELS[field]}
            </label>
          </div>
        );
      })}
    </>
  );
}
