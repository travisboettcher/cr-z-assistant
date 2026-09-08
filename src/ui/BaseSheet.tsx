/**
 * The base sheet's summary — every number the paper worksheet makes you total.
 *
 * Above the slot map rather than beside it, because these are facts about the
 * whole base: beds are counted across every bunk room, storage is one cap per
 * material, and the Hero cap is a fact about the roster the base allows. The
 * map below answers "what is in this slot"; this answers "what does that add
 * up to".
 *
 * Nothing here is stored. Every figure is recomputed from the base and the
 * rules on each render, which is the point — the hunger penalty in Phase 3 will
 * change Skill Scores mid-turn, and a cached production number would be wrong
 * for the rest of it.
 */

import { STORED_MATERIALS } from '../data/materials';
import { UTILITIES } from '../data/facilities';
import {
  beds,
  flatUtilitiesGenerated,
  maxHeroes,
  siegeThreatFromBase,
  storageCaps,
} from '../engine/base';
import type { Campaign } from '../engine/campaign';
import { assignedCount, staffedSpent } from '../engine/utilities';
import { UTILITY_LABELS } from './baseLabels';
import { PageRef } from './PageRef';

export interface BaseSheetProps {
  readonly campaign: Campaign;
  /** The staffed Utilities Score, entered above the map. */
  readonly staffed: number;
}

function Figure({
  label,
  value,
  note,
  pages,
}: {
  readonly label: string;
  readonly value: string;
  /**
   * Written `| undefined` rather than optional, because every caller answers
   * this question and most answer "nothing to add" — under
   * `exactOptionalPropertyTypes` an absent key and an explicit `undefined` are
   * different, and a conditional note is naturally the second.
   */
  readonly note: string | undefined;
  readonly pages: number | string;
}) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-stone-500 uppercase dark:text-stone-400">
        {label} <PageRef pages={pages} />
      </dt>
      {/*
       * `dt` and `dd` are a pair to a sighted reader and nothing to an
       * assistive one: the association is visual, so a value read on its own
       * announces as a bare number.
       *
       * Labelled rather than pointed at its term with `aria-labelledby`,
       * because the term carries a page citation and the value should announce
       * as "Beds, 3" rather than "Beds Rulebook page 23, 3". It also keeps the
       * name available where a browser does not map `dd` to a definition role,
       * which Chromium does not.
       */}
      <dd aria-label={label} className="text-lg tabular-nums">
        {value}
      </dd>
      {note !== undefined && <p className="text-sm text-stone-600 dark:text-stone-400">{note}</p>}
    </div>
  );
}

export function BaseSheet({ campaign, staffed }: BaseSheetProps) {
  const base = campaign.base;
  if (base === null) return null;

  const caps = storageCaps(base);
  const flat = flatUtilitiesGenerated(base);
  const heroes = campaign.survivors.filter((survivor) => survivor.tier === 4).length;
  const cap = maxHeroes(base);
  const siege = siegeThreatFromBase(base);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
      <Figure label="Beds" value={String(beds(base))} note={undefined} pages={23} />

      {STORED_MATERIALS.map((material) => (
        <Figure
          key={material}
          label={`${material} stored`}
          value={`${String(campaign.materials[material])} / ${String(caps[material])}`}
          // Over the cap is a Management Phase consequence (pg. 23) this app
          // does not model, so it is reported rather than prevented.
          note={campaign.materials[material] > caps[material] ? 'Over the cap' : undefined}
          pages={54}
        />
      ))}

      {UTILITIES.map((utility) => (
        <Figure
          key={utility}
          label={`${UTILITY_LABELS[utility]} assigned`}
          value={`${String(assignedCount(base, utility))} / ${String(flat[utility])} flat`}
          note={undefined}
          pages={67}
        />
      ))}

      <Figure
        label="Siege Threat"
        value={siege === 0 ? '0' : `${siege > 0 ? '+' : ''}${String(siege)}`}
        // Staffed facilities and the project team add to this in Phase 3, so
        // saying "the base's own" keeps it from reading as a total.
        note="From the base itself"
        pages={23}
      />

      <Figure
        label="Heroes"
        value={`${String(heroes)} / ${String(cap)}`}
        note={heroes > cap ? 'Over what this base allows' : undefined}
        pages={54}
      />

      {/*
       * Named for what it measures rather than for the field it came from: the
       * input above is the Score, and this is how much of it the assignments
       * are already spending.
       */}
      <Figure
        label="Score spent"
        value={`${String(staffedSpent(base))} / ${String(staffed)}`}
        note="On assignments beyond flat generation"
        pages={20}
      />
    </dl>
  );
}
