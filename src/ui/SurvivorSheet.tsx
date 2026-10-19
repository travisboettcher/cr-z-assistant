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
import { MADNESS_GOES_LOST } from '../data/origins';
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
import {
  incapacitatedByInfection,
  inventorySlots,
  maxHp,
  skillScore,
  statValue,
} from '../engine/survivor';
import { useCampaign } from '../state/useCampaign';
import { GRADE_LABELS, ITEM_LABELS, describeItem } from './equipmentLabels';
import { PageRef } from './PageRef';
import { promotionViolations } from '../engine/legality';
import { maxHeroes } from '../engine/base';
import {
  bestItemFor,
  commonSkillScore,
  holdsShoddyFree,
  itemCap,
  itemTerm,
  itemsAddingTo,
  slotsInUse,
} from '../engine/equipment';
import { COMMON_SKILL_LABELS, SKILL_LABELS, STAT_LABELS } from './skillLabels';
import { FOCUS_RING, PRIMARY_FILL, TOUCH_TARGET } from './styles';
import { TIER_LABELS } from './tierLabels';
import { describeTraits, STORY_TRAIT_LABELS } from './traitLabels';
import { STORY_TRAITS, type StoryTrait } from '../data/traits';
import { storiesHeld, storiesOnOffer, traitStatBonus, type SurvivorTraits } from '../engine/traits';
import { STORY_MISSION_IDS, type StoryMissionId } from '../data/missions';
import { MISSION_LABELS } from './missionLabels';

export interface SurvivorSheetProps {
  readonly survivor: Survivor;
  /**
   * The community's hunger penalty (pg. 22).
   *
   * A prop rather than something read from context, because it is the reason
   * the numbers on this sheet can differ from the numbers stored against the
   * survivor — and a sheet that fetched it quietly would hide exactly the
   * thing worth being obvious.
   */
  readonly penalty: number;
  readonly onClose: () => void;
}

export function SurvivorSheet({ survivor, penalty, onClose }: SurvivorSheetProps) {
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

      <Starving penalty={penalty} />

      <Vitals survivor={survivor} penalty={penalty} />

      <Traits survivor={survivor} />

      <Stats survivor={survivor} penalty={penalty} />

      {/*
       * Move and Defense are laid out apart from the twenty, not folded in
       * among them. They have no governing stat and no level — only a Score —
       * and a sheet that lists them in a column headed "Level / Score" would
       * quietly suggest otherwise. The separation is the type's shape made
       * visible.
       */}
      <CommonSkills survivor={survivor} />

      <Skills survivor={survivor} penalty={penalty} />
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
function Vitals({ survivor, penalty }: { readonly survivor: Survivor; readonly penalty: number }) {
  const { state, dispatch } = useCampaign();

  // Infection is the Viral origin's (pg. 123). The field is on every survivor
  // and stays 0 elsewhere, so the control is shown only where it can mean
  // something — a Cosmic Horror table has no use for a number nothing raises.
  const viral = state.status === 'open' && state.campaign.origin === 'viral';
  // Madness likewise, the Cosmic Horror origin's (pg. 124; Z7-7).
  const cosmic = state.status === 'open' && state.campaign.origin === 'cosmic-horror';
  // And Humanity, the Magic origin's (pg. 127; Z7-9).
  const magic = state.status === 'open' && state.campaign.origin === 'magic';

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

      {/*
       * Typed in, like Health and for the same reason: a zombie's damage adds
       * it on a mission, which the tracker does not run, and it carries from
       * one mission to the next (pg. 123). Heal Wounds is what takes it away.
       * No maximum on the field — at 10 the survivor is down, and the sheet
       * says so rather than refusing the number (#176).
       */}
      {viral && (
        <EditableNumber
          heading={
            <>
              Infection <PageRef pages={123} />
            </>
          }
          display={
            incapacitatedByInfection(survivor) ? (
              <>
                {survivor.infection}{' '}
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  incapacitated
                </span>
              </>
            ) : (
              survivor.infection
            )
          }
          value={survivor.infection}
          what="infection"
          fieldLabel={`Infection for ${survivor.name}`}
          onSave={(infection) =>
            dispatch({ type: 'survivor/infectionSet', id: survivor.id, infection })
          }
        />
      )}

      {/*
       * Typed in as Infection is: a horror check adds it on a mission, and the
       * Lounge takes it away (R110). No maximum: at 13 the survivor goes Lost
       * at Departures (R106), and the sheet says so rather than refusing it.
       */}
      {cosmic && (
        <EditableNumber
          heading={
            <>
              Madness <PageRef pages={124} />
            </>
          }
          display={
            survivor.madness >= MADNESS_GOES_LOST ? (
              <>
                {survivor.madness}{' '}
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  goes Lost at Departures
                </span>
              </>
            ) : (
              survivor.madness
            )
          }
          value={survivor.madness}
          what="madness"
          fieldLabel={`Madness for ${survivor.name}`}
          onSave={(madness) => dispatch({ type: 'survivor/madnessSet', id: survivor.id, madness })}
        />
      )}

      {/* 0 to 5 (R114); a mission's outcome sets it, and this corrects it. */}
      {magic && (
        <EditableNumber
          heading={
            <>
              Humanity <PageRef pages={127} />
            </>
          }
          display={`${String(survivor.humanity)} / 5`}
          value={survivor.humanity}
          max={5}
          what="Humanity"
          fieldLabel={`Humanity for ${survivor.name}`}
          onSave={(humanity) =>
            dispatch({ type: 'survivor/humanitySet', id: survivor.id, humanity })
          }
        />
      )}

      <div>
        <p className={VITAL_HEADING}>
          Inventory Slots <PageRef pages={14} />
        </p>
        {/* Tier plus the Carry Score, so this moves when Strength does, and
            what the carried items fill and add (Z5-2). */}
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {slotsInUse(survivor)} / {inventorySlots(survivor, penalty)}
        </p>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          {survivor.items.length === 0
            ? 'Carrying nothing'
            : `Carrying ${survivor.items
                .map(
                  (item) => `${ITEM_LABELS[item.item]} (${GRADE_LABELS[item.grade].toLowerCase()})`,
                )
                .join(', ')}`}
        </p>
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

      {/*
       * Counted from Z7-8 on (R149): every purchase adds to it, and the Lost
       * roll reads it (R108). Shown where it has a reader, and corrected here
       * for what was spent before the app counted.
       */}
      {cosmic && (
        <EditableNumber
          heading={
            <>
              XP spent <PageRef pages={124} />
            </>
          }
          display={survivor.xpSpent}
          value={survivor.xpSpent}
          what="XP spent"
          fieldLabel={`XP spent by ${survivor.name}`}
          onSave={(xpSpent) => dispatch({ type: 'survivor/xpSpentSet', id: survivor.id, xpSpent })}
        />
      )}
    </div>
  );
}

/**
 * The survivor's Story Trait, Veteran and bond group (pg. 88; R84; Z7-1).
 *
 * Set here by hand for a campaign brought in part-way, or a correction, behind
 * Edit as the stats are: a stray press would move Labor, healing and Scores.
 * A story's reward sets them itself (Z7-3).
 */
function Traits({ survivor }: { readonly survivor: Survivor }) {
  const { state, dispatch } = useCampaign();
  const groupId = useId();
  const [draft, setDraft] = useState<SurvivorTraits | null>(null);
  const roster = state.status === 'open' ? state.campaign.survivors : [];
  const groups = [
    ...new Set(roster.flatMap((one) => (one.bondGroup === null ? [] : [one.bondGroup]))),
  ].sort((one, other) => one - other);
  const offered = [...groups, (groups.at(-1) ?? 0) + 1];
  const campaign = state.status === 'open' ? state.campaign : null;
  const turn = campaign?.turn ?? 1;
  // Stories nobody else holds and this draft doesn't have yet (R136).
  const elsewhere =
    campaign === null
      ? new Set<StoryMissionId>()
      : storiesHeld({
          ...campaign,
          survivors: campaign.survivors.filter((one) => one.id !== survivor.id),
        });
  const attachable = STORY_MISSION_IDS.filter(
    (mission) =>
      !elsewhere.has(mission) && !(draft?.stories ?? []).some((one) => one.mission === mission),
  );
  const current: SurvivorTraits = {
    storyTrait: survivor.storyTrait,
    veteran: survivor.veteran,
    bondGroup: survivor.bondGroup,
    stories: survivor.stories,
    rotResistant: survivor.rotResistant,
    found: survivor.found,
    foundCheckPassed: survivor.foundCheckPassed,
  };

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
          Story Trait <PageRef pages={88} />
        </h3>
        {draft === null && (
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            onClick={() => {
              setDraft(current);
            }}
          >
            Edit traits
          </button>
        )}
      </div>

      {draft === null ? (
        <>
          <p className="mt-2 text-lg font-semibold">{describeTraits(current)}</p>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            {survivor.stories.length === 0
              ? 'No story attached'
              : `Stories: ${survivor.stories
                  .map(
                    (story) =>
                      `${MISSION_LABELS[story.mission]}, since turn ${String(story.attachedOnTurn)}`,
                  )
                  .join('; ')}`}{' '}
            <PageRef pages={87} />
          </p>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${groupId}-trait`} className="text-sm">
                Story Trait
              </label>
              <select
                id={`${groupId}-trait`}
                className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 bg-transparent px-3 dark:border-stone-600`}
                value={draft.storyTrait ?? ''}
                onChange={(event) => {
                  const storyTrait =
                    event.target.value === '' ? null : (event.target.value as StoryTrait);
                  setDraft({
                    ...draft,
                    storyTrait,
                    bondGroup:
                      storyTrait === 'bonded' ? (draft.bondGroup ?? offered[0] ?? 1) : null,
                  });
                }}
              >
                <option value="">None</option>
                {STORY_TRAITS.map((trait) => (
                  <option key={trait} value={trait}>
                    {STORY_TRAIT_LABELS[trait]}
                  </option>
                ))}
              </select>
            </div>

            {draft.storyTrait === 'bonded' && (
              <div className="flex flex-col gap-1">
                <label htmlFor={`${groupId}-bond`} className="text-sm">
                  Bond group
                </label>
                <select
                  id={`${groupId}-bond`}
                  className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 bg-transparent px-3 dark:border-stone-600`}
                  value={draft.bondGroup ?? ''}
                  onChange={(event) => {
                    setDraft({ ...draft, bondGroup: Number(event.target.value) });
                  }}
                >
                  {offered.map((group) => (
                    <option key={group} value={group}>
                      {groups.includes(group)
                        ? `Group ${String(group)}`
                        : `New group ${String(group)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={FOCUS_RING}
                checked={draft.veteran}
                onChange={(event) => {
                  setDraft({ ...draft, veteran: event.target.checked });
                }}
              />
              Veteran <PageRef pages="87–88" />
            </label>

            {/* An Inoculation gives it (R97); set here for a correction, in a Viral campaign. */}
            {(campaign?.origin === 'viral' || survivor.rotResistant) && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={FOCUS_RING}
                  checked={draft.rotResistant === true}
                  onChange={(event) => {
                    setDraft({ ...draft, rotResistant: event.target.checked });
                  }}
                />
                Rot Resistant <PageRef pages="48, 140" />
              </label>
            )}

            {/* A rescue sets them (R109, R111); here for a correction, in a Cosmic Horror campaign. */}
            {(campaign?.origin === 'cosmic-horror' || survivor.found) && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={FOCUS_RING}
                    checked={draft.found === true}
                    onChange={(event) => {
                      setDraft({
                        ...draft,
                        found: event.target.checked,
                        ...(event.target.checked ? {} : { foundCheckPassed: false }),
                      });
                    }}
                  />
                  Found <PageRef pages={124} />
                </label>
                {draft.found === true && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className={FOCUS_RING}
                      checked={draft.foundCheckPassed === true}
                      onChange={(event) => {
                        setDraft({ ...draft, foundCheckPassed: event.target.checked });
                      }}
                    />
                    Passed the Tier check against 8, so Madness stays at 6 or less{' '}
                    <PageRef pages={130} />
                  </label>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-sm">
              Stories attached <PageRef pages={87} />
            </p>
            {draft.stories.length === 0 ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">None</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {draft.stories.map((story) => (
                  <li key={story.mission} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>
                      {MISSION_LABELS[story.mission]}, since turn {story.attachedOnTurn}
                    </span>
                    <button
                      type="button"
                      className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          stories: draft.stories.filter((one) => one.mission !== story.mission),
                        });
                      }}
                    >
                      Remove <span className="sr-only">{MISSION_LABELS[story.mission]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {attachable.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${groupId}-story`} className="text-sm">
                  Attach a story
                </label>
                <select
                  id={`${groupId}-story`}
                  className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 bg-transparent px-3 dark:border-stone-600`}
                  value=""
                  onChange={(event) => {
                    const mission = event.target.value as StoryMissionId;
                    setDraft({
                      ...draft,
                      stories: [...draft.stories, { mission, attachedOnTurn: turn }],
                    });
                  }}
                >
                  <option value="">Choose…</option>
                  {attachable.map((mission) => (
                    <option key={mission} value={mission}>
                      {MISSION_LABELS[mission]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="text-sm text-stone-600 dark:text-stone-400">
            A survivor holds one Story Trait at a time, and Veteran beside it. Bondmates share a
            group. A story is attached to one survivor at a time.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium`}
              onClick={() => {
                dispatch({ type: 'survivor/traitsSet', id: survivor.id, traits: draft });
                setDraft(null);
              }}
            >
              Save traits
            </button>
            <button
              type="button"
              className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-4 py-2 font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
              onClick={() => {
                setDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
 * Shared by health, Infection and experience because they are the same
 * interaction and, more to the point, the same *kind* of fact: something that
 * happened at the table which the app has no way to know. All three go away
 * as the phases that generate them land.
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
  'at-tier-maximum': 'already at the maximum level for their Tier',
  'at-score-maximum': 'already at the maximum score of eight',
  'skill-not-taken': 'they don’t have this skill',
  'already-a-hero': 'Tier 4 is the top of the table',
  'stat-choice-required': 'choose which stat comes off zero first',
};

interface BuyButtonProps {
  readonly purchase: Purchase;

  /** The visible label — "+1" for a level, "Promote" for a tier. */
  readonly label: string;

  /** Completes "raise …" for a screen reader, e.g. "Archery to level 2". */
  readonly what: string;

  /**
   * A rule holding the purchase back that the *purchase* does not know about.
   *
   * `Purchase` is a survivor's own arithmetic — XP, Tier, a stat still to pick
   * — and the Hero cap is a fact about the community and its base (pg. 54).
   * Passed as a reason rather than a boolean so the screen reader hears the
   * same sentence the eye does.
   */
  readonly held?: string | undefined;

  readonly onBuy: () => void;
}

/**
 * One purchase, with its price on it.
 *
 * The price shows whether or not the button is pressable, because on a control
 * the player cannot use yet the price is the useful part: it is what tells them
 * how much experience to go and earn.
 */
function BuyButton({ purchase, label, what, held, onBuy }: BuyButtonProps) {
  const { cost, blocked } = purchase;

  return (
    <button
      type="button"
      disabled={blocked !== null || held !== undefined}
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
        {held === undefined ? '' : ` — ${held}`}
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
  const { state, dispatch } = useCampaign();
  const choiceId = useId();
  const overrideId = useId();
  const storyId = useId();
  const [picked, setPicked] = useState<Stat | ''>('');
  const [pickedStory, setPickedStory] = useState<StoryMissionId | ''>('');
  const [allowed, setAllowed] = useState(false);
  const choices = promotionStatChoices(survivor);

  /*
   * The Hero cap, from context rather than from a prop — unlike `penalty`
   * above, which is passed in because it is the reason this sheet's own
   * numbers differ from the survivor's. This is a fact about the community and
   * its base (pg. 54), not about the survivor being read, and the only control
   * that needs it is this one.
   */
  const campaign = state.status === 'open' ? state.campaign : null;
  const base = campaign?.base ?? null;
  const over =
    campaign === null || base === null
      ? []
      : promotionViolations(
          survivor,
          campaign.survivors.filter((one) => one.tier === 4).length,
          maxHeroes(base),
        );

  // Z1-7's override, and never stored: it gates this purchase once, and the
  // base sheet goes on reporting the community as over the cap for as long as
  // it is — which is the agreement the issue asks for between the two screens.
  // The story a Tier 1 or 2 takes on (R117), from those nobody holds (R136).
  // Chosen, never defaulted: a promotion's story is the player's, as the stat is.
  const stories = campaign === null ? [] : storiesOnOffer(campaign, survivor);
  const story = stories.some((one) => one === pickedStory) ? (pickedStory as StoryMissionId) : null;
  const held =
    over.length > 0 && !allowed
      ? over[0]?.message
      : stories.length > 0 && story === null
        ? 'choose the story it attaches'
        : undefined;
  // Re-derived from the current choices rather than reset by an effect: a
  // promotion changes the stats under this control, and a stale pick left over
  // from the previous Tier must not count as an answer to the new question.
  const raise = choices.some((choice) => choice === picked) ? (picked as Stat) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <BuyButton
        purchase={tierPurchase(survivor, raise)}
        label="Promote"
        what="their Tier"
        held={held}
        onBuy={() => {
          dispatch({
            type: 'survivor/tierBought',
            id: survivor.id,
            raise,
            ...(story === null ? {} : { story }),
            at: new Date().toISOString(),
          });
          setPicked('');
          setPickedStory('');
          setAllowed(false);
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

      {stories.length > 0 && (
        <span className="flex items-center gap-2 text-sm">
          <label htmlFor={storyId} className="text-stone-600 dark:text-stone-400">
            Story it attaches <PageRef pages={87} />
          </label>
          <select
            id={storyId}
            value={pickedStory}
            onChange={(event) => setPickedStory(event.target.value as StoryMissionId | '')}
            className={`${FOCUS_RING} rounded-lg border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-600`}
          >
            <option value="">Choose…</option>
            {stories.map((one) => (
              <option key={one} value={one}>
                {MISSION_LABELS[one]}
              </option>
            ))}
          </select>
        </span>
      )}
      {survivor.tier === 3 && (
        <span className="text-sm text-stone-600 dark:text-stone-400">
          Becomes a Veteran <PageRef pages={87} />
        </span>
      )}

      {/*
       * R15, said where it happens. Promotion raises maximum Health through the
       * Tier and leaves current Health behind — 3/3 becomes 3/4 — so the
       * survivor is wounded afterwards and R12 keeps a wounded survivor off a
       * mission team. The book says only that stats increase and a skill is
       * learnt, and it states starting Health explicitly when it means to, so
       * the promotion does not heal (#173). What it must not do is spring it:
       * a reward that benches somebody should say so before it is bought.
       */}
      {survivor.currentHp < maxHp(survivor) + 1 && survivor.tier < 4 && (
        <span className="text-sm text-stone-600 dark:text-stone-400">
          Raises maximum Health; current Health doesn’t follow <PageRef pages={18} />
        </span>
      )}

      {over.map((violation) => (
        <span key={violation.code} className="flex items-center gap-2 text-sm">
          <span className="text-amber-800 dark:text-amber-300">
            {violation.message} <PageRef pages={violation.pages} />
          </span>
          <label htmlFor={overrideId} className="flex items-center gap-1.5">
            <input
              id={overrideId}
              type="checkbox"
              checked={allowed}
              onChange={(event) => setAllowed(event.target.checked)}
              className={FOCUS_RING}
            />
            Promote anyway
          </label>
        </span>
      ))}
    </div>
  );
}

/**
 * That the community is going hungry, on the screen the penalty is visible on.
 *
 * The Feed step explains this well, and the Feed step is a phase and several
 * steps away from the sheet a player reads at the table mid-mission. Without
 * this, the sheet showed Cooperation 3 and a Mechanics Score of 1 directly
 * under its own sentence saying a Score is the skill's level plus its governing
 * stat — which reads as the app being broken rather than as the rule working.
 */
function Starving({ penalty }: { readonly penalty: number }) {
  if (penalty === 0) return null;

  return (
    <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      The community is going hungry, so every stat is{' '}
      <span className="tabular-nums">{penalty}</span> lower until the next Management Phase — and
      every Score and Inventory Slot count with it <PageRef pages={22} />
    </p>
  );
}

/**
 * The four stats: values to read, and `<select>`s only while they are being
 * set (`docs/step-records.md`, R5; #236).
 *
 * A survivor still being built has them open, because choosing them is part
 * of building one. Once nothing on the sheet is left to settle
 * (`survivorViolations`), they are values behind "Edit stats": every Skill
 * Score reads a stat, so a stray press on a live `<select>` moved numbers all
 * over the sheet. Editing is a draft, saved once or let go, and says which of
 * this survivor's Scores read the stats before anything moves.
 */
function Stats({ survivor, penalty }: { readonly survivor: Survivor; readonly penalty: number }) {
  const { dispatch } = useCampaign();
  const groupId = useId();
  const [draft, setDraft] = useState<Survivor['stats'] | null>(null);

  const building = survivorViolations(survivor).length > 0;
  const editing = building || draft !== null;
  const shown = draft ?? survivor.stats;

  function choose(stat: Stat, value: number) {
    const stats = withStatValue({ ...survivor, stats: shown }, stat, value);

    if (building) {
      dispatch({ type: 'survivor/statsSet', id: survivor.id, stats });
    } else {
      setDraft(stats);
    }
  }

  return (
    <div className="mt-6 border-t border-stone-200 pt-6 dark:border-stone-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-[0.15em] text-stone-500 uppercase dark:text-stone-400">
          Stats <PageRef pages={8} />
        </h3>
        {!editing && (
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`}
            onClick={() => {
              setDraft(survivor.stats);
            }}
          >
            Edit stats
          </button>
        )}
      </div>
      {editing && (
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          A Tier hands out a fixed set of values and lets you choose which stat gets which. Moving a
          value here swaps it with the stat that had it, so the four always stay that set.
        </p>
      )}
      {draft !== null && <p className="mt-1 text-sm font-medium">{readers(survivor)}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div
            key={stat}
            className="rounded-lg border border-stone-200 px-4 py-3 dark:border-stone-700"
          >
            {editing ? (
              <label
                htmlFor={`${groupId}-${stat}`}
                className="block text-sm text-stone-600 dark:text-stone-400"
              >
                {STAT_LABELS[stat]}
              </label>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">{STAT_LABELS[stat]}</p>
            )}
            {penalty === 0 && traitStatBonus(survivor, stat) > 0 && (
              // Driven's +1, worked out each time rather than stored (R135).
              <p className="text-xs text-stone-600 dark:text-stone-400">
                <span className="tabular-nums">{statValue(survivor, stat, 0)}</span> with Driven
              </p>
            )}
            {penalty > 0 && (
              // The value holds the stored stat, because that is what it
              // edits. What the rest of the sheet computes with is this.
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <span className="tabular-nums">{statValue(survivor, stat, penalty)}</span> while the
                community is hungry
              </p>
            )}
            {editing ? (
              <select
                id={`${groupId}-${stat}`}
                value={shown[stat]}
                onChange={(event) => {
                  choose(stat, Number(event.target.value));
                }}
                className={`${FOCUS_RING} mt-1 w-full rounded-lg border border-stone-300 bg-transparent px-2 py-1 text-2xl font-semibold tabular-nums dark:border-stone-600`}
              >
                {statOptions(survivor, stat).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-2xl font-semibold tabular-nums">{survivor.stats[stat]}</p>
            )}
          </div>
        ))}
      </div>
      {draft !== null && (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium`}
            onClick={() => {
              dispatch({ type: 'survivor/statsSet', id: survivor.id, stats: draft });
              setDraft(null);
            }}
          >
            Save stats
          </button>
          <button
            type="button"
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded-lg px-4 py-2 font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800`}
            onClick={() => {
              setDraft(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Which of this survivor's numbers read their stats, named before one moves:
 * each Score of a skill they have, and Inventory Slots through Carry's.
 */
function readers(survivor: Survivor): string {
  const learned = SKILLS.filter((skill) => survivor.skills[skill] !== undefined);

  if (learned.length === 0) return 'No skill of theirs reads these yet.';

  const named = learned.map((skill) => SKILL_LABELS[skill]);
  const list =
    named.length === 1
      ? (named[0] as string)
      : `${named.slice(0, -1).join(', ')} and ${named.at(-1) as string}`;
  const scores = named.length === 1 ? `the ${list} Score` : `the ${list} Scores`;
  const slots = learned.includes('carry')
    ? `, and Inventory Slots with ${named.length === 1 ? 'it' : 'them'}`
    : '';

  return `Saving moves ${scores}${slots}.`;
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
              <span className="text-2xl font-semibold tabular-nums">
                {commonSkillScore(survivor, skill)}
                {/*
                 * What is worn moves the Score but not what the next point
                 * costs, which is priced on the Score bought (pg. 9), so the
                 * bought number stays in sight whenever the two differ.
                 */}
                {commonSkillScore(survivor, skill) === survivor[skill] ? null : (
                  <span className="ml-2 text-sm font-normal text-stone-600 dark:text-stone-400">
                    {survivor[skill]} bought
                  </span>
                )}
              </span>
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

function Skills({ survivor, penalty }: { readonly survivor: Survivor; readonly penalty: number }) {
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
        Score is the skill&rsquo;s level plus its governing stat. A dash means this survivor doesn’t
        have the skill and can’t use it. Skills start at level zero, and each level costs its own
        number in experience &mdash; so they are only ever bought one at a time, in order.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {STATS.map((stat) => (
          <SkillGroup
            key={stat}
            stat={stat}
            penalty={penalty}
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
               all a Tier ${survivor.tier} survivor gets. Taking ${SKILL_LABELS[pending]} as well
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
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded-lg ${PRIMARY_FILL} px-5 font-semibold`}
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
  readonly penalty: number;
  readonly onTake: (skill: Skill) => void;
  readonly onBuy: (skill: Skill) => void;
  readonly onDrop: (skill: Skill) => void;
}

function SkillGroup({ stat, survivor, penalty, onTake, onBuy, onDrop }: SkillGroupProps) {
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
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Item
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
            const score = skillScore(survivor, skill, penalty);

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
                {/*
                 * The book's Item term (pg. 8), named, because "−1" alone does
                 * not say whether that is a shoddy weapon picked up or the one
                 * every survivor holds free.
                 */}
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {level === undefined ? (
                    <Absent />
                  ) : (
                    <ItemTerm survivor={survivor} skill={skill} />
                  )}
                </td>
                <td className="px-4 py-1.5 text-right font-semibold tabular-nums">
                  {score === null ? <Absent /> : score}
                  {score === null || itemCap(survivor, skill) === undefined ? null : (
                    <span className="ml-1 text-xs font-normal text-stone-600 dark:text-stone-400">
                      max {itemCap(survivor, skill)}
                    </span>
                  )}
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

/**
 * The Item column: the term, and what it comes from where anything does — a
 * carried item, or the shoddy one held free (pp. 8, 14). A bare 0 for a skill
 * nothing is used with, rather than "no item" read out on twenty rows.
 */
function ItemTerm({ survivor, skill }: { readonly survivor: Survivor; readonly skill: Skill }) {
  const best = bestItemFor(survivor, skill);
  const sources = [
    ...(best !== undefined
      ? [describeItem(best)]
      : holdsShoddyFree(skill)
        ? ['shoddy, held free']
        : []),
    ...itemsAddingTo(survivor, skill).map(describeItem),
  ];
  const term = signed(itemTerm(survivor, skill));

  if (sources.length === 0) return <>{term}</>;

  const note = sources.join(', ');

  return (
    <span title={note}>
      {term}
      <span className="sr-only"> ({note})</span>
    </span>
  );
}

/** A modifier as the book prints one: +1, −1, 0. */
function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return value < 0 ? `−${-value}` : '0';
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
