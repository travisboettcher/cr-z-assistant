/**
 * The character sheet — the screen this whole phase exists to build.
 *
 * A player looks at this instead of a piece of paper, so it shows every number
 * the paper version makes them work out by hand, and works out none of them in
 * here: Skill Scores, max HP and Inventory Slots all come from `src/engine/survivor`
 * and are recomputed on every render. Nothing derived is stored, because the
 * Phase 3 hunger penalty will change every Skill Score for a turn and a cached
 * one would be wrong the whole time.
 *
 * Tablet-first. This is read standing next to a table with miniatures on it.
 */

import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { COMMON_SKILLS, SKILLS, SKILL_STATS, STATS, type Skill, type Stat } from '../data/skills';
import { TIER_RULES } from '../data/tiers';
import {
  commonSkillPurchase,
  promotionStatChoices,
  skillLevelPurchase,
  tierPurchase,
  type Purchase,
  type PurchaseBlock,
} from '../engine/advancement';
import type { Survivor } from '../engine/campaign';
import { skillSlotsAreFull, survivorViolations, withStatValue } from '../engine/legality';
import { inventorySlots, maxHp, skillScore } from '../engine/survivor';
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
            Tier {survivor.tier} · {TIER_LABELS[survivor.tier]} <PageRef pages={7} />
          </p>
          <Promote survivor={survivor} />
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

/** HP, Inventory Slots and XP — the three numbers checked most often mid-turn. */
function Vitals({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();

  return (
    <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
      <EditableNumber
        heading={
          <>
            Health <PageRef pages={7} />
          </>
        }
        display={`${survivor.currentHp} / ${maxHp(survivor)}`}
        value={survivor.currentHp}
        max={maxHp(survivor)}
        what="health"
        fieldLabel={`Current health for ${survivor.name}`}
        onSave={(currentHp) => dispatch({ type: 'survivor/hpSet', id: survivor.id, currentHp })}
      />

      <div>
        <p className={VITAL_HEADING}>
          Inventory Slots <PageRef pages={14} />
        </p>
        {/* Tier plus the Carry Score, so this moves when Strength does. What
            goes in the slots is Phase 5. */}
        <p className="mt-1 text-2xl font-semibold tabular-nums">{inventorySlots(survivor)}</p>
      </div>

      {/*
       * Typed in rather than earned. XP comes from missions and the Training
       * Room, both of which are the Phase 3 Advancement Phase; until that lands
       * the player says what happened at the table, exactly as for health.
       */}
      <EditableNumber
        heading={
          <>
            Experience <PageRef pages={18} />
          </>
        }
        display={survivor.xp}
        value={survivor.xp}
        what="experience"
        fieldLabel={`Experience for ${survivor.name}`}
        onSave={(xp) => dispatch({ type: 'survivor/xpSet', id: survivor.id, xp })}
      />
    </div>
  );
}

const VITAL_HEADING =
  'text-xs font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400';

interface EditableNumberProps {
  readonly heading: ReactNode;

  /** What the number reads as at rest — health shows its maximum alongside. */
  readonly display: ReactNode;

  readonly value: number;

  readonly max?: number | undefined;

  /** Completes "Set …" and "Save …", so the two controls are distinguishable. */
  readonly what: string;

  readonly fieldLabel: string;

  readonly onSave: (value: number) => void;
}

/**
 * A stored number the player edits by hand.
 *
 * Shared by health and experience because they are the same interaction and,
 * more to the point, the same *kind* of fact: something that happened at the
 * table which the app has no way to know. Both go away as the phases that
 * generate them land.
 */
function EditableNumber({
  heading,
  display,
  value,
  max,
  what,
  fieldLabel,
  onSave,
}: EditableNumberProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = Number(draft);
    // Rejected silently rather than reported: the field is `type="number"` and
    // the only way here with a bad value is a browser that let one through.
    if (Number.isInteger(parsed) && parsed >= 0) {
      onSave(parsed);
    }
    setDraft(null);
  }

  return (
    <div>
      <p className={VITAL_HEADING}>{heading}</p>
      {draft === null ? (
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-2xl font-semibold tabular-nums">{display}</p>
          <button
            type="button"
            onClick={() => setDraft(String(value))}
            className={`${FOCUS_RING} rounded text-sm font-medium underline decoration-dotted underline-offset-4`}
          >
            {/*
             * Announced in full, shown short. Health and experience both have
             * one of these and a pair reading only "Set" is two identical
             * buttons to anyone not looking at where they sit on the page.
             */}
            <span aria-hidden="true">Set</span>
            <span className="sr-only">Set {what}</span>
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="mt-1 flex items-end gap-2">
          <div>
            <label htmlFor={fieldId} className="sr-only">
              {fieldLabel}
            </label>
            <input
              id={fieldId}
              type="number"
              min={0}
              max={max}
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
            Save {what}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Why a purchase is greyed out, in the words a player would use.
 *
 * A disabled control that does not say why is worse than no control at all:
 * the player is left wondering whether the app is broken or they are.
 */
const BLOCKED_REASONS: Record<PurchaseBlock, string> = {
  'not-enough-xp': 'not enough experience yet',
  'at-tier-maximum': 'already at the maximum level for their tier',
  'at-score-maximum': 'already at the maximum score of eight',
  'skill-not-taken': 'they do not have this skill',
  'already-a-hero': 'tier 4 is the top of the table',
  'stat-choice-required': 'choose which stat comes off zero first',
};

interface BuyButtonProps {
  readonly purchase: Purchase;

  /** The visible label — "+1" for a level, "Promote" for a tier. */
  readonly label: string;

  /** Completes "raise …" for a screen reader, e.g. "Archery to level 2". */
  readonly what: string;

  readonly onBuy: () => void;
}

/**
 * One purchase, with its price on it.
 *
 * The price shows whether or not the button is pressable, because on a control
 * the player cannot use yet the price is the useful part: it is what tells them
 * how much experience to go and earn.
 */
function BuyButton({ purchase, label, what, onBuy }: BuyButtonProps) {
  const { cost, blocked } = purchase;

  return (
    <button
      type="button"
      disabled={blocked !== null}
      onClick={onBuy}
      className={`${FOCUS_RING} rounded px-1 text-sm font-medium whitespace-nowrap underline decoration-dotted underline-offset-4 disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline dark:disabled:text-stone-600`}
    >
      {/*
       * The glance version and the spoken version, side by side. "+1 · 2 XP"
       * is right for a thumb over a tablet and wrong read aloud, and the
       * blocked reason has to be in the name because a disabled control cannot
       * be focused to hear a tooltip.
       */}
      <span aria-hidden="true">
        {label}
        {/* A survivor with nowhere left to go has no price to quote. */}
        {cost > 0 ? <> · {cost} XP</> : null}
      </span>
      <span className="sr-only">
        Raise {what}
        {cost > 0 ? `, ${cost} experience` : ''}
        {blocked === null ? '' : ` — ${BLOCKED_REASONS[blocked]}`}
      </span>
    </button>
  );
}

/**
 * Buying the next Tier — a stat array, a skill slot, and a price (pg. 18).
 *
 * **The zero-stat question is asked, never answered here.** A promotion raises
 * every stat by one, and pg. 18 gives the player the choice of which stat comes
 * off 0 when more than one is sitting there — true of every promotion but a
 * Leader's. So the picker appears exactly when the engine says there is a
 * choice, starts empty rather than on a guess, and Promote stays disabled with
 * a reason until it is answered.
 */
function Promote({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();
  const choiceId = useId();
  const [picked, setPicked] = useState<Stat | ''>('');
  const choices = promotionStatChoices(survivor);
  // Re-derived from the current choices rather than reset by an effect: a
  // promotion changes the stats under this control, and a stale pick left over
  // from the previous Tier must not count as an answer to the new question.
  const raise = choices.some((choice) => choice === picked) ? (picked as Stat) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <BuyButton
        purchase={tierPurchase(survivor, raise)}
        label="Promote"
        what="their tier"
        onBuy={() => {
          dispatch({
            type: 'survivor/tierBought',
            id: survivor.id,
            raise,
            at: new Date().toISOString(),
          });
          setPicked('');
        }}
      />
      {choices.length > 0 ? (
        <span className="flex items-center gap-2 text-sm">
          <label htmlFor={choiceId} className="text-stone-600 dark:text-stone-400">
            Raise from zero
          </label>
          <select
            id={choiceId}
            value={picked}
            onChange={(event) => setPicked(event.target.value as Stat | '')}
            className={`${FOCUS_RING} rounded-lg border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600`}
          >
            <option value="">Choose…</option>
            {choices.map((stat) => (
              <option key={stat} value={stat}>
                {STAT_LABELS[stat]}
              </option>
            ))}
          </select>
        </span>
      ) : null}
    </div>
  );
}

function Stats({ survivor }: { readonly survivor: Survivor }) {
  const { dispatch } = useCampaign();
  const groupId = useId();

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        Stats <PageRef pages={8} />
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
  const { dispatch } = useCampaign();

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
        Common skills <PageRef pages={9} />
      </h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Scores, not levels — these have no governing stat, so raising one costs its new{' '}
        <em>score</em> rather than a level.
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
            <dd className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular-nums">{survivor[skill]}</span>
              <BuyButton
                purchase={commonSkillPurchase(survivor, skill)}
                label="+1"
                what={`${COMMON_SKILL_LABELS[skill]} to ${survivor[skill] + 1}`}
                onBuy={() =>
                  dispatch({
                    type: 'survivor/commonSkillBought',
                    id: survivor.id,
                    skill,
                    at: new Date().toISOString(),
                  })
                }
              />
            </dd>
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
        Skills <PageRef pages={8} />
      </h3>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Score is the skill&rsquo;s level plus its governing stat. A dash means this survivor does
        not have the skill and cannot use it. Skills start at level zero, and each level costs its
        own number in experience &mdash; so they are only ever bought one at a time, in order.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {STATS.map((stat) => (
          <SkillGroup
            key={stat}
            stat={stat}
            survivor={survivor}
            onTake={take}
            onBuy={(skill) => {
              dispatch({
                type: 'survivor/skillLevelBought',
                id: survivor.id,
                skill,
                at: new Date().toISOString(),
              });
            }}
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
          <PageRef pages={7} />
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
  readonly onBuy: (skill: Skill) => void;
  readonly onDrop: (skill: Skill) => void;
}

function SkillGroup({ stat, survivor, onTake, onBuy, onDrop }: SkillGroupProps) {
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
              <span className="sr-only">Raise a level</span>
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
                 * Strength 3 and no Bladed Weapon skill is not a Bladed Weapon 3
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
                {/*
                 * Nothing at all for a skill the survivor has not taken. There
                 * is no level to raise, and a greyed-out price on every one of
                 * the twenty rows would bury the ones they can actually buy.
                 */}
                <td className="px-2 py-1.5 text-right">
                  {level === undefined ? null : (
                    <BuyButton
                      purchase={skillLevelPurchase(survivor, skill)}
                      label="+1"
                      what={`${SKILL_LABELS[skill]} to level ${level + 1}`}
                      onBuy={() => onBuy(skill)}
                    />
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => (level === undefined ? onTake(skill) : onDrop(skill))}
                    className={`${FOCUS_RING} rounded px-1 text-sm font-medium underline decoration-dotted underline-offset-4`}
                  >
                    <span aria-hidden="true">{level === undefined ? 'Take' : 'Drop'}</span>
                    <span className="sr-only">
                      {level === undefined ? 'Take' : 'Drop'} {SKILL_LABELS[skill]}
                    </span>
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
