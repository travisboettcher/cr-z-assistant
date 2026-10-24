/**
 * How each team's mission ended (pp. 77–86; Z4-3).
 *
 * The mission is still played on the table, and this is what the app needs
 * back from it: the counts each mission's rewards read. One form per team that
 * chose a mission at Select Mission, built from what that mission records in
 * the catalogue (`MISSIONS[…].counts`), so a Gather Materials team is asked
 * what it carried off and a Siege Defense what was left standing. A story,
 * origin or Road Trip mission records only that it was played.
 *
 * The form records counts and nothing it works out from them. What they do —
 * the counter reset or halved, the base overrun, the next horde roll made
 * certain, the First Mission played again — is shown under the fields before
 * the press, from the same engine functions that will read the entry back, so
 * the line on screen is the line the log keeps.
 *
 * **Every form also asks for the team's Health at the end** (Z4-4), and their
 * Infection in a Viral campaign — one field per member, starting at what the
 * roster says now (`woundsAsTheyStand`), so a member who came back unhurt
 * needs nothing typed and a correction already made on the sheet is kept.
 * Recording sets the roster to these; the sheet's own Health stays the place
 * to fix a mistake afterwards.
 *
 * **Who died is part of the same form** (`docs/step-records.md`, R3; #236),
 * because a death is part of how the mission ended: a box per member, and for
 * each one ticked, whether what they carried stayed on the map or somebody who
 * came home took it (pp. 31, 34; R71). One press records the outcome and the
 * deaths together, or neither (`submitMissionEnded`). Once recorded, the form
 * is a record: the outcome's sentence, then each death's.
 */

import { useState } from 'react';
import { BASE_IDS, BASES, type BaseId } from '../data/bases';
import {
  MISSIONS,
  OVERRUN_OPTIONS,
  type MissionId,
  type OutcomeCount,
  type OverrunOption,
} from '../data/missions';
import { FIELD_RECRUITABLE_TIERS, type FieldRecruitTier } from '../data/recruitTable';
import type { Campaign, Survivor } from '../engine/campaign';
import type { MagicRecord, MissionWound } from '../engine/log';
import { claimWarning } from '../engine/claim';
import { deathsProblem, wentOut, type MissionDeath } from '../engine/missionDeaths';
import {
  asksSameMap,
  rareTradeDue,
  membersOf,
  missionOutcomeProblem,
  outcomeOf,
  selectionProblem,
  strangerWarning,
  teamOutcomes,
  turnMissions,
  foundCheckOwed,
  woundsAsTheyStand,
  type MissionChoice,
} from '../engine/missions';
import {
  continuationOpen,
  OVERRUN_TEAM,
  overrunChoice,
  overrunChoiceOwed,
  overrunChoiceProblem,
  overrunClaim,
} from '../engine/overrun';
import { isStory, storyEnding, type StoryChoice } from '../engine/storyMissions';
import { isMagicMission, magicAsks } from '../engine/magicMissions';
import { isViralMission, viralRecord } from '../engine/viralMissions';
import { maxHp } from '../engine/survivor';
import { atTier, tierRolled } from '../engine/vehicles';
import { D10_RESULTS, type D10Result } from '../data/dice';
import { useCampaign } from '../state/useCampaign';
import { withArticle } from './articles';
import { BASE_LABELS } from './baseLabels';
import { describeItem } from './equipmentLabels';
import { describeEvent } from './logLabels';
import { VehicleFields, type VehicleDraft } from './VehicleFields';
import {
  COUNT_LABELS,
  describeOutcome,
  MISSION_LABELS,
  missionPages,
  OVERRUN_LABELS,
  outcomeConsequences,
  outcomePages,
} from './missionLabels';
import { PageRef } from './PageRef';
import { LostRescues } from './LostRoll';
import { StoryEnding } from './StoryEnding';
import { MagicEnding } from './MagicEnding';
import { SpellsCast } from './Spells';
import type { SpellId } from '../data/origins';
import { ViralEnding } from './ViralEnding';
import { EMPTY_VIRAL_DRAFT, viralDraftRecord, type ViralDraft } from './viralDraft';
import { FOCUS_RING, PRIMARY_FILL, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const WARNING = 'text-sm font-medium text-amber-800 dark:text-amber-300';

const FIELD = `${FOCUS_RING} w-20 rounded-lg border border-stone-300 px-2 py-1 text-sm tabular-nums dark:border-stone-600 dark:bg-stone-800`;

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

const PRIMARY = `${FOCUS_RING} ${TOUCH_TARGET} mt-3 rounded-lg ${PRIMARY_FILL} px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50`;

const SECONDARY = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800`;

/** A vehicle driven off, as its row in the outcome holds it until the dice are in. */
interface RetrievedDraft {
  readonly id: string;
  readonly roll?: D10Result;
  readonly draft: VehicleDraft;
}

/** An empty field is no count at all, rather than the 0 `Number('')` makes it. */
const count = (typed: string): number => (typed.trim() === '' ? Number.NaN : Number(typed));

/** The counts a mission's form asks for: the catalogue's, or none for a mission it lists only. */
function countsFor(mission: MissionId): readonly OutcomeCount[] {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return 'counts' in entry ? entry.counts : [];
}

/** How many numbered end conditions a mission has (pp. 77, 79). */
/** The printed number of a mission's failing end condition, if it numbers one. */
function failedOn(mission: MissionId): number | undefined {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return 'failedOn' in entry ? entry.failedOn : undefined;
}

function endConditionsOf(mission: MissionId): number {
  const entry: (typeof MISSIONS)[MissionId] = MISSIONS[mission];

  return 'endConditions' in entry ? entry.endConditions : 0;
}

/** What the form says above its fields, for the two missions that move the siege counter. */
const HINTS: Partial<Record<MissionId, string>> = {
  'siege-defense':
    'Count what was on the mission area when it ended, and who got out over the map edge. Whether the turns since the last siege go back to 0 depends on it.',
  'thin-the-herd':
    'Count what was on the mission area at the start and at the end, and who got out over the map edge. It can reset or halve the turns since the last siege.',
  // Chosen for the team when Part 1's ending sends it straight on (R119).
  'left-behind-2b':
    'The team plays Part 2b straight after Part 1, with the wounds and gear Part 1 left it. Anyone at 0 Health gets a second wind. Record how the story ended.',
  // A mission from outside the book (#259; R157).
  other:
    'Record the team’s Health and any strangers rescued. Its materials are rolled at Add Materials to Storage, and anything else it gives is added by hand.',
};

function CountField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        className={FIELD}
        onChange={(changed) => {
          onChange(changed.target.value);
        }}
      />
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

/** What has been typed over a member's Health or Infection, by survivor id. */
type Typed = Partial<
  Record<
    string,
    {
      readonly health?: string;
      readonly infection?: string;
      readonly madness?: string;
      readonly humanity?: string;
      readonly foundCheck?: string;
    }
  >
>;

/**
 * The team's wounds as the form stands: each member where the roster has them,
 * with whatever has been typed over that. An emptied field is no number at
 * all, which the engine refuses, rather than a 0 nobody meant.
 */
function woundsTyped(standing: readonly MissionWound[], typed: Typed): readonly MissionWound[] {
  return standing.map((wound) => {
    const over = typed[wound.survivor];

    return {
      ...wound,
      ...(over?.health === undefined ? {} : { health: count(over.health) }),
      ...(over?.infection === undefined ? {} : { infection: count(over.infection) }),
      ...(over?.madness === undefined ? {} : { madness: count(over.madness) }),
      ...(over?.humanity === undefined ? {} : { humanity: count(over.humanity) }),
      ...(over?.foundCheck === undefined || over.foundCheck === ''
        ? {}
        : { foundCheck: Number(over.foundCheck) as D10Result }),
    };
  });
}

/** One row per team member: their Health at the end, and their Infection if the campaign has it. */
function WoundFields({
  campaign,
  prefix,
  wounds,
  dead,
  typed,
  onType,
}: {
  readonly campaign: Campaign;
  readonly prefix: string;
  readonly wounds: readonly MissionWound[];
  /** Who died, whose Health is not asked: they did not come home. */
  readonly dead: ReadonlySet<string>;
  readonly typed: Typed;
  readonly onType: (
    survivor: string,
    field: 'health' | 'infection' | 'madness' | 'humanity' | 'foundCheck',
    value: string,
  ) => void;
}) {
  const home = wounds.filter((wound) => !dead.has(wound.survivor));

  if (home.length === 0) return null;

  // Whether Infection is asked is the engine's answer (`woundsAsTheyStand`
  // gives it to every member of a Viral campaign and nobody else), not a
  // second reading of the origin here.
  const viral = home.some((wound) => wound.infection !== undefined);
  const cosmic = home.some((wound) => wound.madness !== undefined);
  const magic = home.some((wound) => wound.humanity !== undefined);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        Health at the end <PageRef pages={7} />
        {viral && (
          <>
            {' '}
            and Infection <PageRef pages={123} />
          </>
        )}
        {cosmic && (
          <>
            {' '}
            and Madness <PageRef pages={124} />
          </>
        )}
        {magic && (
          <>
            {' '}
            and Humanity <PageRef pages={127} />
          </>
        )}
      </p>
      {magic && (
        <p className={HINT}>
          Humanity starts 1 lower for anybody who set out with a magical item. At 0 they are lost to
          the Veil, and leave with what they carry.
        </p>
      )}
      <p className={HINT}>
        Everybody starts where the roster has them now. Change anybody the mission left differently;
        recording sets the roster to these.
      </p>
      {home.map((wound) => {
        const survivor = campaign.survivors.find((one) => one.id === wound.survivor);
        const health = `${prefix}-health-${wound.survivor}`;
        const infection = `${prefix}-infection-${wound.survivor}`;
        const madness = `${prefix}-madness-${wound.survivor}`;
        const foundCheck = `${prefix}-found-${wound.survivor}`;
        const humanity = `${prefix}-humanity-${wound.survivor}`;
        // A Found survivor whose Madness goes up makes the check (R111).
        const checking =
          survivor !== undefined &&
          foundCheckOwed(
            survivor,
            typed[wound.survivor]?.madness === undefined
              ? wound.madness
              : count(typed[wound.survivor]?.madness ?? ''),
          );
        const most = survivor === undefined ? undefined : maxHp(survivor);

        return (
          <div key={wound.survivor} className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={health}>
              {wound.name}’s Health
            </label>
            <input
              id={health}
              type="number"
              inputMode="numeric"
              min={0}
              max={most}
              step={1}
              value={typed[wound.survivor]?.health ?? String(wound.health)}
              className={FIELD}
              onChange={(changed) => {
                onType(wound.survivor, 'health', changed.target.value);
              }}
            />
            {most !== undefined && (
              <span className={`${HINT} tabular-nums`}>of {String(most)}</span>
            )}
            {wound.infection !== undefined && (
              <>
                <label className="ml-2 text-sm" htmlFor={infection}>
                  {wound.name}’s Infection
                </label>
                <input
                  id={infection}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={typed[wound.survivor]?.infection ?? String(wound.infection)}
                  className={FIELD}
                  onChange={(changed) => {
                    onType(wound.survivor, 'infection', changed.target.value);
                  }}
                />
              </>
            )}
            {wound.madness !== undefined && (
              <>
                <label className="ml-2 text-sm" htmlFor={madness}>
                  {wound.name}’s Madness
                </label>
                <input
                  id={madness}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={typed[wound.survivor]?.madness ?? String(wound.madness)}
                  className={FIELD}
                  onChange={(changed) => {
                    onType(wound.survivor, 'madness', changed.target.value);
                  }}
                />
              </>
            )}
            {wound.humanity !== undefined && (
              <>
                <label className="ml-2 text-sm" htmlFor={humanity}>
                  {wound.name}’s Humanity
                </label>
                <input
                  id={humanity}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5}
                  step={1}
                  value={typed[wound.survivor]?.humanity ?? String(wound.humanity)}
                  className={FIELD}
                  onChange={(changed) => {
                    onType(wound.survivor, 'humanity', changed.target.value);
                  }}
                />
              </>
            )}
            {checking && (
              <>
                <label className="ml-2 text-sm" htmlFor={foundCheck}>
                  {wound.name} is Found: the d10 for their Tier check against 8
                </label>
                <select
                  id={foundCheck}
                  className={SELECT}
                  value={typed[wound.survivor]?.foundCheck ?? ''}
                  onChange={(changed) => {
                    onType(wound.survivor, 'foundCheck', changed.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {D10_RESULTS.map((result) => (
                    <option key={result} value={result}>
                      {result}
                    </option>
                  ))}
                </select>
                <PageRef pages={130} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The value a dead survivor's item picker holds while nobody took it. */
const LOST = '';

/**
 * Who died on the mission, and for each, who took what they carried (pp. 31,
 * 34; R71). Most missions lose nobody, so it is a box per member and nothing
 * more until one is ticked.
 */
function DeathFields({
  prefix,
  members,
  dead,
  taken,
  onDead,
  onTaken,
}: {
  readonly prefix: string;
  readonly members: readonly Survivor[];
  readonly dead: ReadonlySet<string>;
  readonly taken: Readonly<Record<string, string>>;
  readonly onDead: (survivor: string, died: boolean) => void;
  readonly onTaken: (item: string, taker: string) => void;
}) {
  if (members.length === 0) return null;

  const home = members.filter((survivor) => !dead.has(survivor.id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">
        Who died <PageRef pages="31, 34" />
      </legend>
      {members.map((survivor) => (
        <div key={survivor.id} className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className={FOCUS_RING}
              checked={dead.has(survivor.id)}
              onChange={(changed) => {
                onDead(survivor.id, changed.target.checked);
              }}
            />
            {survivor.name} died
          </label>

          {dead.has(survivor.id) && survivor.items.length > 0 && (
            <div className="ml-6 flex flex-col gap-1">
              <p className={HINT}>What nobody took stays on the map, and is lost.</p>
              {survivor.items.map((item) => {
                const pickerId = `${prefix}-taken-${item.id}`;
                const taker = taken[item.id] ?? LOST;

                return (
                  <div key={item.id} className="flex flex-wrap items-center gap-2">
                    <label className="text-sm" htmlFor={pickerId}>
                      {survivor.name}’s {describeItem(item)}
                    </label>
                    <select
                      id={pickerId}
                      className={SELECT}
                      value={dead.has(taker) ? LOST : taker}
                      onChange={(changed) => {
                        onTaken(item.id, changed.target.value);
                      }}
                    >
                      <option value={LOST}>Lost on the map</option>
                      {home.map((other) => (
                        <option key={other.id} value={other.id}>
                          Taken by {other.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </fieldset>
  );
}

/**
 * The deaths as the form stands: each member ticked, with what somebody who
 * came home took from them. A pick naming somebody since ticked as dead counts
 * as lost, as its picker shows it.
 */
function deathsTicked(
  team: number,
  members: readonly Survivor[],
  dead: ReadonlySet<string>,
  taken: Readonly<Record<string, string>>,
): readonly MissionDeath[] {
  return members
    .filter((survivor) => dead.has(survivor.id))
    .map((survivor) => ({
      team,
      survivor: survivor.id,
      taken: Object.fromEntries(
        survivor.items.flatMap((item) => {
          const taker = taken[item.id];

          return taker === undefined || taker === LOST || dead.has(taker) ? [] : [[item.id, taker]];
        }),
      ),
    }));
}

function TeamOutcome({
  campaign,
  choice,
  named,
}: {
  readonly campaign: Campaign;
  readonly choice: MissionChoice;
  /** Whether to name the team, which only matters when there is more than one. */
  readonly named: boolean;
}) {
  const { dispatch } = useCampaign();
  const [numbers, setNumbers] = useState<Partial<Record<OutcomeCount, string>>>({});
  const [endCondition, setEndCondition] = useState('');
  const [strangers, setStrangers] = useState<readonly FieldRecruitTier[]>([]);
  const [nextStranger, setNextStranger] = useState<FieldRecruitTier>(1);
  const [allDown, setAllDown] = useState(false);
  const [sameMap, setSameMap] = useState(false);
  const [returned, setReturned] = useState<readonly string[]>([]);
  const [traded, setTraded] = useState(0);
  const [drafts, setDrafts] = useState<readonly RetrievedDraft[]>([]);
  const [typed, setTyped] = useState<Typed>({});
  const [dead, setDead] = useState<ReadonlySet<string>>(() => new Set());
  const [taken, setTaken] = useState<Readonly<Record<string, string>>>({});
  const [ending, setEnding] = useState<StoryChoice>({ result: '' });
  const [viralDraft, setViralDraft] = useState<ViralDraft>(EMPTY_VIRAL_DRAFT);
  const [magicDraft, setMagicDraft] = useState<MagicRecord>({});
  const [spellsCast, setSpellsCast] = useState<readonly SpellId[]>([]);

  // The claim an overrun goes on with places no strangers (pg. 86), and asks
  // whether it was the overrun base's own map when it is that base's type (R29).
  const asked = countsFor(choice.mission).filter(
    (of) =>
      !(
        of === 'strangers-rescued' &&
        choice.mission === 'claim-a-new-base' &&
        overrunClaim(campaign)
      ),
  );
  const mapAsked = asksSameMap(campaign, choice);
  // The trade this mission settles, asked how many of its items were handed over (Z5-10).
  const trade =
    choice.mission === 'rare-goods-trader' && rareTradeDue(campaign) ? campaign.rareTrade : null;
  const number = (of: OutcomeCount) => count(numbers[of] ?? '');
  // One row for each vehicle driven off, each with an id made as a hand-over's
  // are, from the campaign and the log's length (Z5-11).
  const drivenOff = choice.mission === 'retrieve-new-vehicles' ? number('vehicles-driven-off') : 0;
  const rows = Array.from(
    { length: Number.isSafeInteger(drivenOff) && drivenOff > 0 ? Math.min(drivenOff, 10) : 0 },
    (_, at): RetrievedDraft =>
      drafts[at] ?? {
        id: `${campaign.id}-vehicle-${String(campaign.log.length)}-${String(at + 1)}`,
        draft: { tier: 1, label: `Vehicle ${String(at + 1)}`, water: false },
      },
  );
  const setRow = (at: number, row: RetrievedDraft) => {
    setDrafts(rows.map((one, other) => (other === at ? row : one)));
  };
  const wounds = woundsTyped(woundsAsTheyStand(campaign, choice.team), typed);
  const played = outcomeOf(choice, {
    endCondition: endCondition === 'none' ? null : count(endCondition),
    strangers,
    vehiclesOnArea: number('vehicles-on-area'),
    materialsCarriedOut: number('materials-carried-out'),
    startingZombies: number('starting-zombies'),
    zombiesLeft: number('zombies-left'),
    survivorsExited: number('survivors-exited'),
    allIncapacitated: allDown,
    vehiclesDrivenOff: number('vehicles-driven-off'),
    ...(mapAsked ? { sameMap } : {}),
    ...(trade === null ? {} : { itemsTraded: traded }),
    retrieved: rows.flatMap((row) =>
      row.roll === undefined ? [] : [{ id: row.id, ...row.draft, roll: row.roll }],
    ),
    returned,
    wounds,
  });
  // A story's ending, from the team that played it (Z7-3).
  const story = isStory(choice.mission) ? choice.mission : undefined;
  const team = membersOf(campaign, choice.team);
  const record = story === undefined ? undefined : storyEnding(campaign, team, story, ending);
  // A Viral mission's counts (Z7-6).
  const viral = isViralMission(choice.mission) ? choice.mission : undefined;
  // A Magic mission's ending (Z7-9); The Dark asks nothing.
  const magic =
    isMagicMission(choice.mission) && magicAsks(choice.mission).length > 0
      ? choice.mission
      : undefined;
  const outcome =
    played.kind !== 'mission-played'
      ? played
      : {
          ...played,
          ...(record === undefined ? {} : { story: record }),
          // Rebuilt as recording will, so what it says it gives is what it will.
          ...(viral === undefined
            ? {}
            : { viral: viralRecord(campaign, viral, viralDraftRecord(viral, viralDraft)) }),
          ...(magic === undefined
            ? {}
            : {
                magic: Object.fromEntries(
                  magicAsks(magic).map((field) => [field, magicDraft[field] === true]),
                ) as MagicRecord,
              }),
        };
  const members = wentOut(campaign, choice.team);
  const deaths = deathsTicked(choice.team, members, dead, taken);
  const problem =
    missionOutcomeProblem(campaign, outcome) ?? deathsProblem(campaign, choice.team, deaths);
  const warning = problem === null ? strangerWarning(campaign, outcome) : null;
  // An end condition not chosen yet says so beside its picker, not as a
  // refusal at the foot of the form (#240).
  const unchosen =
    (asked.includes('end-condition') && endCondition === '') ||
    (story !== undefined && ending.result === '');
  // An Other mission by the name the team chose it under (#259).
  const label = choice.name ?? MISSION_LABELS[choice.mission];
  const prefix = `mission-${String(choice.team)}`;
  const hint =
    HINTS[choice.mission] ??
    (story !== undefined
      ? 'Record how the story ended. What the map held, an item or a roll, isn’t tracked yet.'
      : viral !== undefined || magic !== undefined
        ? 'Record what the table counted when the mission ended.'
        : asked.length === 0
          ? 'Its rewards aren’t tracked yet. Recording it marks the mission played.'
          : 'Record what the table counted when the mission ended.');

  return (
    <fieldset className="mt-4 flex flex-col gap-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <legend className="px-1 text-sm font-semibold">
        {named ? `Mission team ${String(choice.team)}: how ${label} ended` : `How ${label} ended`}{' '}
        <PageRef pages={missionPages(choice.mission)} />
      </legend>

      <p className={HINT}>{hint}</p>

      {choice.base !== undefined && (
        <p className="text-sm">Claiming {withArticle(BASE_LABELS[choice.base])}.</p>
      )}

      {asked.map((of) => {
        switch (of) {
          case 'end-condition':
            return (
              <div key={of} className="flex flex-wrap items-center gap-2">
                <label className="text-sm" htmlFor={`${prefix}-end`}>
                  {COUNT_LABELS[of]}
                </label>
                <select
                  id={`${prefix}-end`}
                  className={SELECT}
                  value={endCondition}
                  onChange={(changed) => {
                    setEndCondition(changed.target.value);
                  }}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {Array.from({ length: endConditionsOf(choice.mission) }, (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      {index + 1}
                    </option>
                  ))}
                  {/*
                   * The failure as the page numbers it (#205), so a table
                   * copying the number finds it; recorded as none met.
                   */}
                  {failedOn(choice.mission) === undefined ? (
                    <option value="none">None</option>
                  ) : (
                    <option value={String(failedOn(choice.mission))}>
                      {failedOn(choice.mission)} (failed)
                    </option>
                  )}
                </select>
                {endCondition === '' && <span className={HINT}>Choose one to record {label}.</span>}
              </div>
            );

          case 'strangers-rescued':
            return (
              <div key={of} className="flex flex-col gap-2">
                <p className="text-sm">
                  {COUNT_LABELS[of]}:{' '}
                  {strangers.length === 0
                    ? 'none'
                    : strangers.map((tier) => `Tier ${String(tier)}`).join(', ')}{' '}
                  <PageRef pages={31} />
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm" htmlFor={`${prefix}-stranger`}>
                    Stranger’s Tier
                  </label>
                  <select
                    id={`${prefix}-stranger`}
                    className={SELECT}
                    value={nextStranger}
                    onChange={(changed) => {
                      setNextStranger(Number(changed.target.value) as FieldRecruitTier);
                    }}
                  >
                    {FIELD_RECRUITABLE_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={SECONDARY}
                    onClick={() => {
                      setStrangers([...strangers, nextStranger]);
                    }}
                  >
                    Add a stranger
                  </button>
                  {strangers.length > 0 && (
                    <button
                      type="button"
                      className={SECONDARY}
                      onClick={() => {
                        setStrangers(strangers.slice(0, -1));
                      }}
                    >
                      Remove the last
                    </button>
                  )}
                </div>
              </div>
            );

          case 'all-incapacitated':
            return (
              <label key={of} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={FOCUS_RING}
                  checked={allDown}
                  onChange={(changed) => {
                    setAllDown(changed.target.checked);
                  }}
                />
                {COUNT_LABELS[of]}
              </label>
            );

          default:
            return (
              <CountField
                key={of}
                id={`${prefix}-${of}`}
                label={COUNT_LABELS[of]}
                value={numbers[of] ?? ''}
                onChange={(value) => {
                  setNumbers({ ...numbers, [of]: value });
                }}
              />
            );
        }
      })}

      {magic !== undefined && (
        <MagicEnding mission={magic} record={magicDraft} onChange={setMagicDraft} />
      )}

      {campaign.origin === 'magic' && <SpellsCast cast={spellsCast} onChange={setSpellsCast} />}

      {viral !== undefined && (
        <ViralEnding mission={viral} prefix={prefix} draft={viralDraft} onChange={setViralDraft} />
      )}

      {story !== undefined && (
        <StoryEnding
          campaign={campaign}
          members={team}
          story={story}
          prefix={prefix}
          choice={ending}
          onChange={setEnding}
        />
      )}

      {rows.map((row, at) => (
        <div key={row.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={`${prefix}-vehicle-${String(at)}`}>
              Vehicle {at + 1}: its setup d10
            </label>
            <select
              id={`${prefix}-vehicle-${String(at)}`}
              className={SELECT}
              value={row.roll ?? ''}
              onChange={(changed) => {
                const roll = Number(changed.target.value) as D10Result;
                setRow(at, { ...row, roll, draft: atTier(row.draft, tierRolled(roll)) });
              }}
            >
              <option value="" disabled>
                Rolled…
              </option>
              {D10_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
            <PageRef pages={82} />
          </div>
          {row.roll !== undefined && (
            <VehicleFields
              name={`Vehicle ${String(at + 1)}`}
              draft={row.draft}
              highest={tierRolled(row.roll)}
              onChange={(draft) => {
                setRow(at, { ...row, draft });
              }}
            />
          )}
        </div>
      ))}

      {trade !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm" htmlFor={`${prefix}-traded`}>
              Items the trader handed over
            </label>
            <select
              id={`${prefix}-traded`}
              className={SELECT}
              value={traded}
              onChange={(changed) => {
                setTraded(Number(changed.target.value));
              }}
            >
              {Array.from({ length: trade.items.length + 1 }, (_, amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </select>
            <PageRef pages={84} />
          </div>
          <p className={HINT}>
            First in priority first: {trade.items.map((item) => describeItem(item)).join(', ')}.
          </p>
        </div>
      )}

      <DeathFields
        prefix={prefix}
        members={members}
        dead={dead}
        taken={taken}
        onDead={(survivor, died) => {
          const next = new Set(dead);
          if (died) next.add(survivor);
          else next.delete(survivor);
          setDead(next);
        }}
        onTaken={(item, taker) => {
          setTaken({ ...taken, [item]: taker });
        }}
      />

      <WoundFields
        campaign={campaign}
        prefix={prefix}
        wounds={wounds}
        dead={dead}
        typed={typed}
        onType={(survivor, field, value) => {
          // A new Madness asks the Found check afresh, if it asks at all (R111).
          const { foundCheck, ...rest } = typed[survivor] ?? {};
          const kept =
            field === 'madness'
              ? rest
              : { ...rest, ...(foundCheck === undefined ? {} : { foundCheck }) };
          setTyped({ ...typed, [survivor]: { ...kept, [field]: value } });
        }}
      />

      {choice.mission === 'rescue-strangers' && campaign.setAside.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm">
            Brought back from those set aside <PageRef pages="31, 86" />
          </legend>
          {campaign.setAside.map((gone) => (
            <label key={gone.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={FOCUS_RING}
                checked={returned.includes(gone.id)}
                onChange={(changed) => {
                  setReturned(
                    changed.target.checked
                      ? [...returned, gone.id]
                      : returned.filter((id) => id !== gone.id),
                  );
                }}
              />
              {gone.name} (Tier {gone.tier})
            </label>
          ))}
        </fieldset>
      )}

      {mapAsked && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={FOCUS_RING}
            checked={sameMap}
            onChange={(changed) => {
              setSameMap(changed.target.checked);
            }}
          />
          Played on the overrun base’s own map <PageRef pages={86} />
        </label>
      )}

      {warning !== null && <p className={WARNING}>{warning}</p>}
      <p className={HINT}>
        {unchosen ? null : (problem ?? outcomeConsequences(outcome, campaign.turn).join(' '))}
      </p>

      <button
        type="button"
        className={PRIMARY}
        disabled={problem !== null}
        onClick={() => {
          dispatch({
            type: 'mission/resolved',
            outcome,
            ...(deaths.length === 0 ? {} : { deaths }),
            ...(spellsCast.length === 0 ? {} : { spellsCast }),
            at: new Date().toISOString(),
          });
        }}
      >
        Record {label}
      </button>
    </fieldset>
  );
}

/**
 * What the log says of the team's mission beside its outcome, since the team
 * last chose one: the spells an enemy cast on it (Z7-9), and who died. A First
 * Mission played again (R21) has deaths of its own.
 */
function endedSince(campaign: Campaign, team: number): readonly string[] {
  let said: string[] = [];

  for (const entry of campaign.log) {
    if (entry.turn !== campaign.turn) continue;

    const { event } = entry;

    if (event.kind === 'mission-selected' && event.team === team) said = [];
    else if (
      (event.kind === 'survivor-left' && event.cause === 'killed' && event.team === team) ||
      (event.kind === 'spells-cast' && event.team === team)
    ) {
      said = [...said, describeEvent(event, entry.turn).text];
    }
  }

  return said;
}

/** How many times a team has chosen a mission this turn — a key, not a rule. */
function timesChosen(campaign: Campaign, team: number): number {
  return campaign.log.filter(
    (entry) =>
      entry.turn === campaign.turn &&
      entry.event.kind === 'mission-selected' &&
      entry.event.team === team,
  ).length;
}

/**
 * How the community goes on from a base its Siege Defense overran (pg. 86;
 * R27, R28; Z4-9).
 *
 * Offered once the siege's outcome is in, and again after a way on that met no
 * end condition. The way on and the base it claims are chosen together, and
 * recording them chooses team 1's next mission — the whole community's, as the
 * siege was — so the form for it appears below without walking back.
 */
function OverrunChoice({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [option, setOption] = useState<OverrunOption>('claim');
  const [base, setBase] = useState<BaseId>(campaign.base?.id ?? 'small-town-home');

  const problem = overrunChoiceProblem(campaign, option);
  const warning = claimWarning(campaign, base);
  const baseId = 'overrun-base';

  return (
    <fieldset className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-300 p-3 dark:border-amber-700">
      <legend className="px-1 text-sm font-semibold">
        The base is overrun: how does the community go on? <PageRef pages={86} />
      </legend>

      <p className={HINT}>
        The way on is played as a further mission this turn, by everybody who fought the siege . If
        it fails, choose again.
      </p>

      {OVERRUN_OPTIONS.map((way) => (
        <label key={way} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="overrun-option"
            className={FOCUS_RING}
            checked={option === way}
            onChange={() => {
              setOption(way);
            }}
          />
          {OVERRUN_LABELS[way].charAt(0).toUpperCase() + OVERRUN_LABELS[way].slice(1)}
        </label>
      ))}

      {option === 'abandon' ? (
        <p className={HINT}>
          Every survivor is set aside, and may come back through a later Rescue Strangers mission.
          Build the new community on the roster, then choose its base and play its First Mission .
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={baseId}>
            {option === 'claim' ? 'Base to claim' : 'Base the new community claims'}
          </label>
          <select
            id={baseId}
            className={SELECT}
            value={base}
            onChange={(changed) => {
              setBase(changed.target.value as BaseId);
            }}
          >
            {BASE_IDS.map((id) => (
              <option key={id} value={id}>
                {BASE_LABELS[id]} (Tier {BASES[id].tier})
              </option>
            ))}
          </select>
        </div>
      )}

      {problem !== null && <p className={HINT}>{problem}</p>}
      {warning !== null && option !== 'abandon' && <p className={WARNING}>{warning}</p>}

      <div>
        <button
          type="button"
          className={PRIMARY}
          disabled={problem !== null}
          onClick={() => {
            dispatch({
              type: 'mission/overrunContinued',
              option,
              ...(option === 'abandon' ? {} : { base }),
              at: new Date().toISOString(),
            });
          }}
        >
          Go on this way
        </button>
      </div>
    </fieldset>
  );
}

/**
 * The First Mission of a community begun again after the survivors were left
 * behind (pg. 86; R31; Z4-11), chosen once that community is on the roster.
 * Its base is chosen with it, as starting over's is.
 */
function NewCommunityMission({ campaign }: { readonly campaign: Campaign }) {
  const { dispatch } = useCampaign();
  const [base, setBase] = useState<BaseId>('small-town-home');

  const choice = { team: OVERRUN_TEAM, mission: 'first-mission', base } as const;
  const problem =
    campaign.survivors.length === 0
      ? 'Add the new community’s survivors on the roster first.'
      : selectionProblem(campaign, choice);
  const baseId = 'new-community-base';

  return (
    <fieldset className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-300 p-3 dark:border-amber-700">
      <legend className="px-1 text-sm font-semibold">
        The new community’s First Mission <PageRef pages="76, 86" />
      </legend>

      <p className={HINT}>
        Build the new community from ten Tier levels on the roster, then choose the base it will
        claim <PageRef pages={13} />
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor={baseId}>
          Base the new community claims
        </label>
        <select
          id={baseId}
          className={SELECT}
          value={base}
          onChange={(changed) => {
            setBase(changed.target.value as BaseId);
          }}
        >
          {BASE_IDS.map((id) => (
            <option key={id} value={id}>
              {BASE_LABELS[id]} (Tier {BASES[id].tier})
            </option>
          ))}
        </select>
      </div>

      {problem !== null && <p className={HINT}>{problem}</p>}

      <div>
        <button
          type="button"
          className={PRIMARY}
          disabled={problem !== null}
          onClick={() => {
            dispatch({ type: 'mission/selected', ...choice, at: new Date().toISOString() });
          }}
        >
          Play the First Mission
        </button>
      </div>
    </fieldset>
  );
}

export function MissionOutcome({ campaign }: { readonly campaign: Campaign }) {
  const { choices } = turnMissions(campaign);
  const outcomes = teamOutcomes(campaign);
  const named = choices.length > 1;

  return (
    <>
      {choices.map((choice) => {
        const recorded = outcomes.get(choice.team);

        return recorded === undefined ? (
          // Keyed by how many times the team has chosen, so a First Mission
          // chosen again after a failure (R21) starts its form empty, and
          // another team's entry landing does not clear this one's fields.
          <TeamOutcome
            key={`${String(campaign.turn)}-${String(choice.team)}-${String(timesChosen(campaign, choice.team))}`}
            campaign={campaign}
            choice={choice}
            named={named}
          />
        ) : (
          <div key={choice.team} className="mt-4 flex flex-col gap-1">
            <p className="text-sm font-medium">
              {describeOutcome(recorded, campaign.turn)} <PageRef pages={outcomePages(recorded)} />
            </p>
            {endedSince(campaign, choice.team).map((text) => (
              <p key={text} className="text-sm">
                {text}
              </p>
            ))}
          </div>
        );
      })}

      <LostRescues campaign={campaign} />

      {overrunChoiceOwed(campaign) && <OverrunChoice campaign={campaign} />}
      {continuationOpen(campaign) && overrunChoice(campaign) === 'abandon' && (
        <NewCommunityMission campaign={campaign} />
      )}
    </>
  );
}
