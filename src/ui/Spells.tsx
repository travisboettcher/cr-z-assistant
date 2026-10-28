/**
 * The Magic origin's spells on screen (pp. 70, 126–127, 133; R112, R113; Z7-9):
 * which spells an enemy cast, inside a mission's outcome form, and learning
 * one at the Mystic Library, at Character Advancement. What may be learned,
 * and for how much, is `spells.ts`'s answer.
 */

import { useState } from 'react';
import { SPELLS, type SpellId } from '../data/origins';
import type { Campaign } from '../engine/campaign';
import {
  learnableSpells,
  spellCost,
  spellLearners,
  spellLearningProblem,
  spellsSeen,
  type SpellLearner,
} from '../engine/spells';
import { useCampaign } from '../state/useCampaign';
import { describeEvent } from '../labels/logLabels';
import { PageRef } from './PageRef';
import { SPELL_LABELS, spellList } from '../labels/spellLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const BUTTON = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:hover:bg-stone-800`;

/** Which spells an enemy cast on the mission, ticked in the outcome form. */
export function SpellsCast({
  cast,
  onChange,
}: {
  readonly cast: readonly SpellId[];
  readonly onChange: (cast: readonly SpellId[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">
        Spells an enemy cast <PageRef pages="127, 133" />
      </legend>
      <p className={HINT}>
        Tick every spell an enemy cast on the table. A Mystic Library can teach it from now on.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {SPELLS.map((spell) => (
          <label key={spell} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={FOCUS_RING}
              checked={cast.includes(spell)}
              onChange={(changed) => {
                onChange(
                  SPELLS.filter((one) =>
                    one === spell ? changed.target.checked : cast.includes(one),
                  ),
                );
              }}
            />
            {SPELL_LABELS[spell]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Learning a spell at the Mystic Library (pg. 70; R113): everybody who staffed
 * one, what the next spell costs, and a spell to pick for each. Shown only
 * where somebody staffed one.
 */
export function SpellLearning({ campaign }: { readonly campaign: Campaign }) {
  const learners = spellLearners(campaign);

  if (learners.length === 0) return null;

  const seen = spellsSeen(campaign);

  return (
    <section aria-label="Spells" className="mt-4 flex flex-col gap-2">
      <h4 className="text-sm font-semibold">
        Learning a spell <PageRef pages={70} />
      </h4>
      <p className={HINT}>
        Whoever staffed the Mystic Library can learn one spell an enemy has cast, with Humanity{' '}
        {learners[0]?.maxHumanity} or less.{' '}
        {seen.length === 0 ? 'No enemy has cast one yet.' : `Cast so far: ${spellList(seen)}.`}
      </p>
      <ul className="flex flex-col gap-2">
        {learners.map((learner) => (
          <Learner key={learner.survivor.id} campaign={campaign} learner={learner} />
        ))}
      </ul>
    </section>
  );
}

function Learner({
  campaign,
  learner,
}: {
  readonly campaign: Campaign;
  readonly learner: SpellLearner;
}) {
  const { dispatch } = useCampaign();
  const { survivor } = learner;
  const offered = learnableSpells(campaign, survivor);
  const [picked, setPicked] = useState<SpellId | ''>('');
  const spell = picked !== '' && offered.includes(picked) ? picked : offered[0];

  // Once a turn: what they learned, in place of the picker.
  const learned = campaign.log.find(
    ({ turn, event }) =>
      turn === campaign.turn && event.kind === 'spell-learned' && event.survivor === survivor.id,
  );
  if (learned !== undefined) return <li className={HINT}>{describeEvent(learned.event).text}</li>;

  const cost = spellCost(campaign, learner);
  const problem =
    spell === undefined
      ? 'An enemy has to cast a spell they don’t know before they can learn one.'
      : spellLearningProblem(campaign, survivor.id, spell);
  const selectId = `spell-${survivor.id}`;

  return (
    <li className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="font-medium">{survivor.name}</span>{' '}
        <span className="text-stone-600 tabular-nums dark:text-stone-400">
          — Humanity {survivor.humanity}, {survivor.xp} XP; a spell costs {cost.xp} XP
          {cost.discounted ? ', 3 off for The Necromancer' : ''}
        </span>
      </p>
      {spell !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="sr-only">
            Spell for {survivor.name} to learn
          </label>
          <select
            id={selectId}
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 bg-transparent px-3 text-sm dark:border-stone-600`}
            value={spell}
            onChange={(changed) => {
              setPicked(changed.target.value as SpellId);
            }}
          >
            {offered.map((one) => (
              <option key={one} value={one}>
                {SPELL_LABELS[one]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={BUTTON}
            disabled={problem !== null}
            onClick={() => {
              dispatch({
                type: 'advancement/spellLearned',
                survivor: survivor.id,
                spell,
                at: new Date().toISOString(),
              });
            }}
          >
            Learn it
          </button>
        </div>
      )}
      {problem !== null && <p className={HINT}>{problem}</p>}
    </li>
  );
}
