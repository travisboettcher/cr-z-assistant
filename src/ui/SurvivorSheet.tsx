/**
 * The character sheet — the screen this whole phase exists to build.
 *
 * A player looks at this instead of a piece of paper, so it shows every number
 * the paper version makes them work out by hand, and works out none of them in
 * here: Skill Scores, max HP and item slots all come from `src/engine/survivor`
 * and are recomputed on every render. Nothing derived is stored, because the
 * Phase 3 hunger penalty will change every Skill Score for a turn and a cached
 * one would be wrong the whole time.
 *
 * Tablet-first. This is read standing next to a table with miniatures on it.
 */

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { COMMON_SKILLS, SKILLS, SKILL_STATS, STATS, type Skill, type Stat } from '../data/skills';
import { TIER_RULES } from '../data/tiers';
import type { Survivor } from '../engine/campaign';
import { skillSlotsAreFull, survivorViolations, withStatValue } from '../engine/legality';
import { itemSlots, maxHp, skillScore } from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { COMMON_SKILL_LABELS, SKILL_LABELS, STAT_LABELS } from './skillLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';
import { TIER_LABELS } from './tierLabels';

export interface SurvivorSheetProps {
  readonly survivor: Survivor;
  readonly onClose: () => void;
}

export function SurvivorSheet({ survivor, onClose }: SurvivorSheetProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-semibold">
            {survivor.name}
          </h2>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            Tier {survivor.tier} · {TIER_LABELS[survivor.tier]} <PageRef pages="38–39" />
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          Close sheet
        </button>
      </div>

      <Violations survivor={survivor} />

      <Vitals survivor={survivor} />

      <Stats survivor={survivor} />

      {/*
       * Move and Defense are laid out apart from the twenty, not folded in
       * among them. They have no governing stat and no level — only a Score —
       * and a sheet that lists them in a column headed "Level / Score" would
       * quietly suggest otherwise. The separation is the type's shape made
       * visible.
       */}
      <CommonSkills survivor={survivor} />

      <Skills survivor={survivor} />
    </section>
  );
}

/**
 * What is wrong with this build, if anything.
 *
 * Reported rather than enforced. A survivor part-way through being built is the
 * normal state of one added a moment ago, and blocking on that would make the
 * app unusable; a survivor who is genuinely illegal may be a house rule or a
 * case this app models wrong. Either way the sheet says so, with the page, and
 * lets the player decide.
 */
function Violations({ survivor }: { readonly survivor: Survivor }) {
  const violations = survivorViolations(survivor);

  if (violations.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {violations.map((violation) => (
        <li
          key={violation.code}
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {violation.message} <PageRef pages={violation.pages} />
        </li>
      ))}
    </ul>
  );
}

/** HP, item slots and XP — the three numbers checked most often mid-turn. */
function Vitals({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();
  const hpId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = Number(draft);
    if (Number.isInteger(value) && value >= 0) {
      dispatch({ type: 'survivor/hpSet', id: survivor.id, currentHp: value });
    }
    setDraft(null);
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
      <div>
        <p className="text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
          Health <PageRef pages={49} />
        </p>
        {draft === null ? (
          <div className="mt-1 flex items-baseline gap-3">
            <p className="text-2xl font-semibold tabular-nums">
              {survivor.currentHp} / {maxHp(survivor)}
            </p>
            <button
              type="button"
              onClick={() => setDraft(String(survivor.currentHp))}
              className={`${FOCUS_RING} rounded text-sm font-medium underline decoration-dotted underline-offset-4`}
            >
              Set
            </button>
          </div>
        ) : (
          <form onSubmit={save} className="mt-1 flex items-end gap-2">
            <div>
              <label htmlFor={hpId} className="sr-only">
                Current health for {survivor.name}
              </label>
              <input
                id={hpId}
                type="number"
                min={0}
                max={maxHp(survivor)}
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className={`${FOCUS_RING} w-20 rounded-lg border border-stone-300 px-3 py-2 tabular-nums dark:border-stone-600 dark:bg-stone-800`}
              />
            </div>
            <button
              type="submit"
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            >
              Save health
            </button>
          </form>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
          Item slots <PageRef pages={49} />
        </p>
        {/* Tier plus the Carry Score, so this moves when Strength does. What
            goes in the slots is Phase 5. */}
        <p className="mt-1 text-2xl font-semibold tabular-nums">{itemSlots(survivor)}</p>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
          Experience <PageRef pages={30} />
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{survivor.xp}</p>
      </div>
    </div>
  );
}

function Stats({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();
  const groupId = useId();

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        Stats <PageRef pages={40} />
      </h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        A tier hands out a fixed set of values and lets you choose which stat gets which. Moving a
        value here swaps it with the stat that had it, so the four always stay that set.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat}
            className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-700"
          >
            <label
              htmlFor={`${groupId}-${stat}`}
              className="block text-sm text-stone-600 dark:text-stone-400"
            >
              {STAT_LABELS[stat]}
            </label>
            <select
              id={`${groupId}-${stat}`}
              value={survivor.stats[stat]}
              onChange={(event) => {
                dispatch({
                  type: 'survivor/statsSet',
                  id: survivor.id,
                  stats: withStatValue(survivor, stat, Number(event.target.value)),
                });
              }}
              className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 bg-transparent px-2 py-1 text-2xl font-semibold tabular-nums dark:border-stone-600`}
            >
              {statOptions(survivor, stat).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The values this stat can be set to, highest first.
 *
 * Duplicates are collapsed — a Citizen's array is 2/1/0/0 and two identical
 * options are noise. The stat's current value is folded in so that a survivor
 * from a hand-edited file still shows what they actually have rather than a
 * blank control; the sheet reports that as a violation instead.
 */
function statOptions(survivor: Survivor, stat: Stat): readonly number[] {
  const values = [...TIER_RULES[survivor.tier].statArray, survivor.stats[stat]];

  return [...new Set(values)].sort((a, b) => b - a);
}

function CommonSkills({ survivor }: { readonly survivor: Survivor }) {
  const scores: Record<string, number> = { move: survivor.move, defense: survivor.defense };

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        Common skills <PageRef pages={41} />
      </h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Scores, not levels — these have no governing stat.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COMMON_SKILLS.map((skill) => (
          <div
            key={skill}
            className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-700"
          >
            <dt className="text-sm text-stone-600 dark:text-stone-400">
              {COMMON_SKILL_LABELS[skill]}
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{scores[skill]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Skills({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmId = useId();
  const [pending, setPending] = useState<Skill | null>(null);

  const slots = TIER_RULES[survivor.tier].skillSlots;

  function take(skill: Skill) {
    /*
     * The one blocked action in the sheet. Being part-way through a build is
     * shown but never blocked; going *over* the tier's slots is refused, with
     * a way through for a house rule or a case this app has wrong. The override
     * gates this press only — nothing about it is stored, so the survivor keeps
     * reporting the violation for as long as they actually have it.
     */
    if (skillSlotsAreFull(survivor)) {
      setPending(skill);
      dialogRef.current?.showModal();
      return;
    }

    dispatch({ type: 'survivor/skillAdded', id: survivor.id, skill });
  }

  function takeAnyway() {
    if (pending !== null) {
      dispatch({ type: 'survivor/skillAdded', id: survivor.id, skill: pending });
    }
    setPending(null);
    dialogRef.current?.close();
  }

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        Skills <PageRef pages={41} />
      </h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Score is the skill&rsquo;s level plus its governing stat. A dash means this survivor does
        not have the skill and cannot use it. Skills start at level zero; raising one costs
        experience.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {STATS.map((stat) => (
          <SkillGroup
            key={stat}
            stat={stat}
            survivor={survivor}
            onTake={take}
            onDrop={(skill) => {
              dispatch({ type: 'survivor/skillRemoved', id: survivor.id, skill });
            }}
          />
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={confirmId}
        onClose={() => {
          setPending(null);
        }}
        className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id={confirmId} className="text-xl font-semibold">
          That is one skill too many
        </h2>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {pending === null
            ? null
            : `${survivor.name} already has ${slots} ${slots === 1 ? 'skill' : 'skills'}, which is
               all a tier ${survivor.tier} survivor gets. Taking ${SKILL_LABELS[pending]} as well
               will keep showing on this sheet as a broken rule.`}{' '}
          <PageRef pages="38–39" />
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Leave it
          </button>
          <button
            type="button"
            onClick={takeAnyway}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
          >
            Take it anyway
          </button>
        </div>
      </dialog>
    </div>
  );
}

interface SkillGroupProps {
  readonly stat: Stat;
  readonly survivor: Survivor;
  readonly onTake: (skill: Skill) => void;
  readonly onDrop: (skill: Skill) => void;
}

function SkillGroup({ stat, survivor, onTake, onDrop }: SkillGroupProps) {
  const governed = SKILLS.filter((skill) => SKILL_STATS[skill] === stat);

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-700">
      <h4 className="border-b border-stone-200 px-4 py-2 font-semibold dark:border-stone-700">
        {STAT_LABELS[stat]}
      </h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-stone-500 dark:text-stone-400">
            <th scope="col" className="px-4 py-1 text-left font-medium">
              Skill
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Level
            </th>
            <th scope="col" className="px-4 py-1 text-right font-medium">
              Score
            </th>
            <th scope="col" className="px-2 py-1">
              <span className="sr-only">Take or drop</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {governed.map((skill) => {
            const level = survivor.skills[skill];
            const score = skillScore(survivor, skill);

            return (
              <tr key={skill} className="border-t border-stone-100 dark:border-stone-800">
                <th scope="row" className="px-4 py-1.5 text-left font-normal">
                  {SKILL_LABELS[skill]}
                </th>
                {/*
                 * An em dash, not a zero and not the bare stat. A survivor with
                 * Strength 3 and no Blade Weapon skill is not a Blade Weapon 3
                 * — they cannot make the check at all — and a number here is a
                 * number somebody could roll against. `skillScore` returns null
                 * precisely so this branch has to exist.
                 */}
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {level === undefined ? <Absent /> : level}
                </td>
                <td className="px-4 py-1.5 text-right font-semibold tabular-nums">
                  {score === null ? <Absent /> : score}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => (level === undefined ? onTake(skill) : onDrop(skill))}
                    className={`${FOCUS_RING} rounded px-1 text-sm font-medium underline decoration-dotted underline-offset-4`}
                  >
                    {level === undefined ? 'Take' : 'Drop'}
                    <span className="sr-only"> {SKILL_LABELS[skill]}</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A dash a screen reader announces as words rather than as punctuation. */
function Absent() {
  return (
    <>
      <span aria-hidden="true" className="text-stone-400 dark:text-stone-600">
        —
      </span>
      <span className="sr-only">not learned</span>
    </>
  );
}
