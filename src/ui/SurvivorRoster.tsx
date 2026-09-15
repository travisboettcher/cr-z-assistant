/**
 * The community roster — who is here, and the three things you can do about it.
 *
 * The first screen in the app that holds game state a player created. It shows
 * the stored facts and the derived ones side by side without storing any of the
 * derived ones: HP and Inventory Slots are computed on every render by `src/engine`,
 * because the Phase 3 hunger penalty will make any cached value wrong for a
 * whole turn.
 *
 * The full character sheet — stats, all twenty skills, Skill Scores, XP — is
 * its own story. This is the list you build first and glance at afterwards.
 */

import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { D10_RESULTS, type D10Result } from '../data/dice';
import {
  FIELD_RECRUITABLE_TIERS,
  rollsForSkill,
  type FieldRecruitTier,
} from '../data/recruitTable';
import { TIERS, type Tier } from '../data/tiers';
import type { Campaign, Survivor } from '../engine/campaign';
import { communityViolations } from '../engine/legality';
import { communityTierLevels, inventorySlots, maxHp } from '../engine/survivor';
import { hungerPenalty } from '../engine/feeding';
import { useCampaign } from '../state/useCampaign';
import { PageRef } from './PageRef';
import { FOCUS_RING, TOUCH_TARGET } from './styles';
import { TIER_LABELS } from './tierLabels';

export interface SurvivorRosterProps {
  readonly campaign: Campaign;

  /** Opens a survivor's character sheet. Which one is open is not campaign state. */
  readonly onOpenSheet: (id: string) => void;
}

export function SurvivorRoster({ campaign, onOpenSheet }: SurvivorRosterProps) {
  const { dispatch } = useCampaign();
  const headingId = useId();
  const nameId = useId();
  const tierId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [tier, setTier] = useState<Tier>(1);
  const [pendingRemoval, setPendingRemoval] = useState<Survivor | null>(null);

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === '') return;

    // The UUID is generated here rather than in the reducer: it is the impure
    // part, and the store stays a pure function by taking it as an argument.
    dispatch({
      type: 'survivor/added',
      name: trimmed,
      tier,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    });
    setName('');
  }

  function confirmRemoval() {
    if (pendingRemoval !== null) {
      dispatch({
        type: 'survivor/removed',
        id: pendingRemoval.id,
        at: new Date().toISOString(),
      });
    }
    setPendingRemoval(null);
    dialogRef.current?.close();
  }

  return (
    <section
      id="roster"
      aria-labelledby={headingId}
      className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-xl font-semibold">
          Community
        </h2>
        {/*
         * The tier-level total, not a headcount: ten Tier levels is what a
         * starting community is built from, so it is the number a player is
         * actually spending. <PageRef> so they can check the rule rather than
         * take this screen's word for it.
         */}
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {campaign.survivors.length} survivor{campaign.survivors.length === 1 ? '' : 's'} ·{' '}
          {communityTierLevels(campaign.survivors)} tier levels <PageRef pages={48} />
        </p>
      </div>

      <CommunityBudget campaign={campaign} />

      <form onSubmit={handleAdd} className="mt-5 flex flex-wrap items-end gap-3">
        <div className="grow basis-48">
          <label htmlFor={nameId} className="block text-sm font-medium">
            Survivor name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          />
        </div>

        <div>
          <label htmlFor={tierId} className="block text-sm font-medium">
            Tier
          </label>
          <select
            id={tierId}
            value={tier}
            onChange={(event) => setTier(Number(event.target.value) as Tier)}
            className={`${FOCUS_RING} mt-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          >
            {TIERS.map((value) => (
              <option key={value} value={value}>
                {value} — {TIER_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-amber-600 px-5 font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400`}
        >
          Add survivor
        </button>
      </form>

      <RecruitForm />

      {hungerPenalty(campaign) > 0 && (
        // The roster is what a player reads at the table, a phase and several
        // steps from the Feed screen that explained the penalty. Every Score
        // below is already lower; without this the roster shows a consequence
        // with no cause.
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The community is going hungry, so every stat is{' '}
          <span className="tabular-nums">{hungerPenalty(campaign)}</span> lower until the next
          Management Phase <PageRef pages={22} />
        </p>
      )}

      {campaign.survivors.length === 0 ? (
        <p className="mt-6 text-stone-600 dark:text-stone-400">
          No survivors yet. A starting community is built from ten tier levels{' '}
          <PageRef pages={48} />.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {campaign.survivors.map((survivor) => (
            <RosterRow
              key={survivor.id}
              survivor={survivor}
              penalty={hungerPenalty(campaign)}
              onRename={(newName) => {
                dispatch({ type: 'survivor/renamed', id: survivor.id, name: newName });
              }}
              onRemove={() => {
                setPendingRemoval(survivor);
                dialogRef.current?.showModal();
              }}
              onOpenSheet={() => onOpenSheet(survivor.id)}
            />
          ))}
        </ul>
      )}

      {/*
       * A real <dialog>, matching the import confirmation: focus trapping and
       * Escape for free, and it looks like part of the app rather than a
       * browser warning. Removing someone is not undoable yet, so it is
       * confirmed.
       */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${headingId}-remove`}
        onClose={() => {
          setPendingRemoval(null);
        }}
        className="m-auto max-w-md rounded-xl bg-white p-6 text-stone-900 backdrop:bg-stone-950/50 dark:bg-stone-900 dark:text-stone-100"
      >
        <h2 id={`${headingId}-remove`} className="text-xl font-semibold">
          Remove this survivor?
        </h2>
        <p className="mt-2 text-stone-600 dark:text-stone-400">
          {pendingRemoval === null
            ? null
            : `“${pendingRemoval.name}” will be taken off the roster. This cannot be undone.`}
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Keep them
          </button>
          <button
            type="button"
            onClick={confirmRemoval}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg bg-red-700 px-5 font-semibold text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500`}
          >
            {/* "Remove them", not "Remove": it mirrors "Keep them", and a
                confirmation button that reads the same as the button that
                opened it is one misread away from the wrong click. */}
            Remove them
          </button>
        </div>
      </dialog>
    </section>
  );
}

/**
 * Bringing somebody back from a mission.
 *
 * A separate form from "add survivor" rather than a mode on it, because it is a
 * different act with different rules: no Heroes (pg. 7), and one of their
 * skills comes off a d10 table rather than being chosen (pg. 15).
 *
 * **The die is typeable, and the button is only a convenience.** Someone at the
 * table has usually already rolled a physical d10, and result 10 is the
 * player's choice anyway — so the field is the source of truth and the roll
 * travels on the action, keeping the reducer pure.
 */
function RecruitForm() {
  const { dispatch } = useCampaign();
  const nameId = useId();
  const tierId = useId();
  const rollId = useId();

  const [name, setName] = useState('');
  const [tier, setTier] = useState<FieldRecruitTier>(2);
  const [roll, setRoll] = useState<D10Result>(1);

  function handleRecruit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = name.trim();
    if (trimmed === '') return;

    dispatch({
      type: 'survivor/recruited',
      name: trimmed,
      tier,
      // Omitted rather than sent and ignored: a Rookie does not roll, and the
      // log entry this writes is permanent.
      ...(rollsForSkill(tier) ? { roll } : {}),
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    });
    setName('');
  }

  return (
    <details className="mt-4 rounded-lg border border-stone-200 p-4 dark:border-stone-700">
      <summary className={`${FOCUS_RING} cursor-pointer font-medium`}>
        Recruit from the field
      </summary>

      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        {rollsForSkill(tier)
          ? 'A survivor found on a mission arrives with one skill already rolled.'
          : // The Rookie case, said rather than left to be inferred from a
            // control that has gone: the roll is not missing, it is not part of
            // the rule, and the survivor arrives with a skill slot to fill.
            'A Rookie’s single skill is never rolled — they arrive with a slot to fill on their sheet.'}{' '}
        Heroes are never recruited this way. <PageRef pages={rollsForSkill(tier) ? 15 : '7, 15'} />
      </p>

      <form onSubmit={handleRecruit} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="grow basis-40">
          <label htmlFor={nameId} className="block text-sm font-medium">
            Recruit name
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          />
        </div>

        <div>
          <label htmlFor={tierId} className="block text-sm font-medium">
            Recruit tier
          </label>
          <select
            id={tierId}
            value={tier}
            onChange={(event) => setTier(Number(event.target.value) as FieldRecruitTier)}
            className={`${FOCUS_RING} mt-1 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
          >
            {FIELD_RECRUITABLE_TIERS.map((value) => (
              <option key={value} value={value}>
                {value} — {TIER_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div hidden={!rollsForSkill(tier)}>
          <label htmlFor={rollId} className="block text-sm font-medium">
            Skill roll
          </label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id={rollId}
              value={roll}
              onChange={(event) => setRoll(Number(event.target.value) as D10Result)}
              className={`${FOCUS_RING} rounded-lg border border-stone-300 px-3 py-2 tabular-nums dark:border-stone-600 dark:bg-stone-800`}
            >
              {D10_RESULTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRoll(rollD10())}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            >
              Roll d10
            </button>
          </div>
        </div>

        <button
          type="submit"
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-5 font-semibold hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          Recruit
        </button>
      </form>
    </details>
  );
}

/**
 * One d10, for players who would rather tap than reach for a die.
 *
 * The only randomness in the app, and it stays here in the UI rather than in
 * the engine or the store — both of which are pure and take the result as an
 * argument instead.
 */
function rollD10(): D10Result {
  const index = Math.floor(Math.random() * D10_RESULTS.length);

  return D10_RESULTS[index] ?? 1;
}

/**
 * The ten-tier-level budget, and the switch that retires it.
 *
 * The budget is a rule about *building* a starting community (pg. 13), not
 * about having one. Once play begins, rescued strangers and field recruits push
 * a community past ten legitimately, and an app still complaining about it then
 * would be wrong for the rest of the campaign. Nothing in the campaign data
 * says when that moment arrives, so the player says so.
 */
function CommunityBudget({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const checkboxId = useId();
  const violations = communityViolations(campaign.survivors, campaign.startingCommunityBuilt);

  return (
    <div className="mt-4 flex flex-col gap-3">
      {violations.map((violation) => (
        <p
          key={violation.code}
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {violation.message} <PageRef pages={violation.pages} />
        </p>
      ))}

      <label htmlFor={checkboxId} className="flex items-center gap-3 text-sm">
        <input
          id={checkboxId}
          type="checkbox"
          checked={campaign.startingCommunityBuilt}
          onChange={(event) => {
            dispatch({
              type: 'campaign/startingCommunityBuiltSet',
              built: event.target.checked,
              at: new Date().toISOString(),
            });
          }}
          className={`${FOCUS_RING} size-5 rounded border-stone-300 dark:border-stone-600`}
        />
        <span className="text-stone-600 dark:text-stone-400">
          The starting community is built — stop checking it against the ten-tier-level budget.
        </span>
      </label>
    </div>
  );
}

interface RosterRowProps {
  /** The community's hunger penalty (pg. 22), which moves the Carry Score. */
  readonly penalty: number;
  readonly survivor: Survivor;
  readonly onRename: (name: string) => void;
  readonly onRemove: () => void;
  readonly onOpenSheet: () => void;
}

/**
 * Renaming is behind an explicit control rather than an always-live input: on a
 * tablet an always-editable field beside a table is one stray thumb away from
 * quietly renaming somebody.
 */
function RosterRow({ survivor, penalty, onRename, onRemove, onOpenSheet }: RosterRowProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = draft?.trim() ?? '';
    if (trimmed !== '') onRename(trimmed);
    setDraft(null);
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-stone-200 p-4 dark:border-stone-700">
      {draft === null ? (
        <div className="grow basis-48">
          <p className="text-lg font-semibold">{survivor.name}</p>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Tier {survivor.tier} · {TIER_LABELS[survivor.tier]}
          </p>
        </div>
      ) : (
        <form onSubmit={save} className="flex grow basis-48 flex-wrap items-end gap-3">
          <div className="grow">
            <label htmlFor={fieldId} className="block text-sm font-medium">
              Rename {survivor.name}
            </label>
            <input
              id={fieldId}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-600 dark:bg-stone-800`}
            />
          </div>
          <button
            type="submit"
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Save
          </button>
        </form>
      )}

      {/*
       * Both derived, both recomputed here rather than read off the survivor:
       * Inventory Slots move with Strength and with the Carry skill, and HP with the
       * Tier. Neither is stored.
       */}
      <dl className="flex shrink-0 gap-4 text-sm">
        <div>
          <dt className="text-stone-500 dark:text-stone-400">HP</dt>
          <dd className="font-semibold tabular-nums">
            {survivor.currentHp} / {maxHp(survivor)}
          </dd>
        </div>
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Slots</dt>
          <dd className="font-semibold tabular-nums">{inventorySlots(survivor, penalty)}</dd>
        </div>
      </dl>

      <div className="flex shrink-0 flex-wrap gap-2">
        {draft === null && (
          <button
            type="button"
            onClick={onOpenSheet}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Sheet
          </button>
        )}
        {draft === null && (
          <button
            type="button"
            onClick={() => setDraft(survivor.name)}
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
          >
            Rename
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg border border-stone-300 px-4 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
