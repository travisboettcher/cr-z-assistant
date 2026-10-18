/**
 * How a story ended, inside its mission's outcome form (pp. 89–102; Z7-3): one
 * of the story's endings, and who takes the next part where the player
 * chooses. What the ending gives is said under the form, as every outcome's
 * consequences are.
 */

import { STORY_RESULTS, STORY_WINDOWS, storyResult, type StoryResult } from '../data/stories';
import type { StoryMissionId } from '../data/missions';
import type { Campaign, Survivor } from '../engine/campaign';
import { nextPart, storyHolder, storyRecipients, type StoryChoice } from '../engine/storyMissions';
import { missionTitle } from './missionLabels';
import { PageRef } from './PageRef';
import { storyResultLabel } from './storyLabels';
import { FOCUS_RING, TOUCH_TARGET } from './styles';

const HINT = 'text-sm text-stone-600 dark:text-stone-400';

const SELECT = `${FOCUS_RING} ${TOUCH_TARGET} rounded-lg border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-800`;

export function StoryEnding({
  campaign,
  members,
  story,
  prefix,
  choice,
  onChange,
}: {
  readonly campaign: Campaign;
  /** The team that played it. */
  readonly members: readonly Survivor[];
  readonly story: StoryMissionId;
  /** Makes each control's id the team's own. */
  readonly prefix: string;
  readonly choice: StoryChoice;
  readonly onChange: (choice: StoryChoice) => void;
}) {
  const holder = storyHolder(members, story);
  const results: readonly StoryResult[] = STORY_RESULTS[story];
  const chosen = storyResult(story, choice.result);
  const next = chosen === undefined ? undefined : nextPart(campaign, story, chosen);
  const recipients =
    next === undefined || next.to === 'attached' ? [] : storyRecipients(campaign, members, next);

  if (holder === undefined) {
    return <p className={HINT}>Nobody on this team has {missionTitle(story)} attached.</p>;
  }

  const attached = holder.stories.find((held) => held.mission === story);
  const timeWindow: { readonly within: number; readonly pages: number } | undefined =
    story in STORY_WINDOWS ? STORY_WINDOWS[story as keyof typeof STORY_WINDOWS] : undefined;
  const since = attached === undefined ? 0 : campaign.turn - attached.attachedOnTurn;

  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm">How {holder.name}’s story ended</legend>
      {timeWindow !== undefined && (
        <p className={HINT}>
          Attached {since === 1 ? '1 turn' : `${String(since)} turns`} ago, which is{' '}
          {since <= timeWindow.within ? 'inside' : 'outside'} its window of {timeWindow.within}{' '}
          turns <PageRef pages={timeWindow.pages} />
        </p>
      )}
      {results.map((result) => (
        <label key={result.id} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${prefix}-story`}
            className={FOCUS_RING}
            checked={choice.result === result.id}
            onChange={() => {
              onChange({ result: result.id });
            }}
          />
          {storyResultLabel(story, result.id)} <PageRef pages={result.pages} />
        </label>
      ))}
      {choice.result === '' && <span className={HINT}>Choose one to record the story.</span>}

      {next !== undefined && next.to !== 'attached' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor={`${prefix}-story-to`}>
            Attach {missionTitle(next.story)} to
          </label>
          <select
            id={`${prefix}-story-to`}
            className={SELECT}
            value={choice.to ?? ''}
            onChange={(changed) => {
              onChange({ ...choice, to: changed.target.value });
            }}
          >
            <option value="" disabled>
              Choose…
            </option>
            {recipients.map((survivor) => (
              <option key={survivor.id} value={survivor.id}>
                {survivor.name} (Tier {survivor.tier})
              </option>
            ))}
          </select>
        </div>
      )}
    </fieldset>
  );
}
