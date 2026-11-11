# Continuing a campaign already under way

How a table that is several turns into a campaign starts tracking it here. Written for
[#210](https://github.com/travisboettcher/cr-z-assistant/issues/210) before any of it is built: it
adds a path to starting a campaign, a new kind of log entry and a save-format change, and
CONTRIBUTING asks for that to be agreed first.

## What happens now

A new campaign always starts on turn 1, at Select Mission, with no survivors, no base, no
materials and an empty log. A table that is several turns in has to type everything in by hand. Even
then, the app believes it is turn 1, so it brings back the First Mission and turn 1's rules
(`FIRST_TURN` in `missions.ts`, `firstTurn.ts`, `SelectMission`, `TurnWalk`).

## Why it isn't just a form

The app keeps what happened in the log and works most answers out from it. A campaign set up
partway has no history behind it, so every reader of the log answers as if nothing had ever
happened. There are 61 reads of the log in 32 engine files. They fall into three kinds:

1. **This turn's**: has the Rot check run, has the community eaten, did a team record its
   outcome. They filter on `entry.turn === campaign.turn`. If tracking starts at the beginning of
   a step, these are right with an empty log: nothing from this step on has happened yet.
2. **Last turn's**, read across the turn boundary:
   - the hunger penalty set at last turn's Feed, in force until this turn's Management Phase
     (`penaltyInForce`, `planningPenalty`; R1);
   - a clean Siege Defense last turn, which adds Labor this turn (`siegeReward`).
3. **The whole campaign's**:
   - the turns since the last siege (`turnsSinceLastSiege`, `siegeTurns`);
   - a forced siege roll (`hordeForced`);
   - the stories finished (`storiesDone`);
   - Magic's history:
     - the Mystic Library unlocked by The Graveyard (`mysticLibraryUnlocked`);
     - The Necromancer's wins, its kill, and the discounts already used (`necromancerWins`,
       `necromancerKilled`, `spellDiscountsLeft`);
     - the spells seen (`spellsSeen`);
   - Viral's Containment, unlocked by Experimental Data, and its Hardware (`containmentUnlock`).

Facts that happened earlier in the same turn matter too, if tracking starts partway through it:
- a claim won this turn locks Unrest at 0 (`unrestLocked`);
- a failed Thin the Herd forces this turn's horde roll.

Everything else a table knows (survivors, the base, materials, items, vehicles, trades on their
way) is the campaign's own state, not history, and is entered as it stands.

## The proposal

### Where tracking starts: the beginning of a Planning Phase

The table names the turn, which is 2 or later. Tracking begins at that turn's first Planning step,
Assign Facility Staff. The turn's Mission and Advancement Phases have been played at the table
already.

That is the point in a turn with the least to carry over. Last turn's projects were finished at
this turn's Advancement (they're ordered at Planning and done at the next Advancement), so
nothing is half-built. Last turn's assignments have done their work, and this turn's are made here,
on the board. The alternative, starting at a Mission Phase, would need last turn's Planning typed
in as well: who staffed what, the project team, the mission teams and the orders placed.

### What it asks, once

A "Continue a campaign in progress" path beside "New campaign" asks for the facts the log would
otherwise hold:

- **The turn** being picked up, 2 or later.
- **The origin** and **the Toolkit's traits**, as a new campaign asks (R98, R84).
- **Turns since the last siege**, as the counter stands now, and whether this turn's horde roll is
  forced (a failed Thin the Herd).
- **This turn's Mission**: whether a claim was won (so Unrest is locked at 0), and whether a Siege
  Defense left no zombies (its Labor comes next turn).
- **Last turn's Feed**: the Hunger and the head count, if the community went short. That gives the
  penalty still in force through this Planning Phase.
- **Stories finished**, from the five.
- **Magic, when it's the origin**: the spells seen, whether The Graveyard is done, The
  Necromancer's wins and whether one killed it, and how many of its discounts are spent.
- **Viral, when it's the origin**: whether Containment is unlocked, and the Hardware it costs.

Each question that doesn't apply to the origin or the turn isn't asked.

### What it records: one `campaign-continued` entry

The answers go in one log entry, `campaign-continued`, dated the turn being picked up. It is the
first entry in the log. Each reader in kinds 2 and 3 above reads it as well as the entries it reads
now, so the answer to "how many turns since the last siege" or "which spells have been seen" comes
from the same function whether the history was played here or entered.

The alternative is synthetic entries: a made-up `siege-defense-resolved`, `spells-cast` or
`mission-played` for each fact, so the readers need no change. It would put events in the history
that nobody recorded, with teams, wounds and turns that are guesses, and the campaign log would show
them as played. One entry that says what it is keeps the history honest. It costs a change in each
reader, about a dozen of them, each with a test.

This adds a kind of log entry, so it is **schema v28**: a migration (nothing to change in an older
save), a fixture, saveFile validation, the export's key order, arbitraries and a log label ("Picked
up at turn 6, with…").

### Setting up the community, base and stores

Once the entry is written, the campaign opens on its Planning Phase with the roster, base and stores
empty, the same as a new campaign. What's entered next is state, and the screens that set it already
exist, with two gaps:

- **Skill levels.** A survivor partway through a campaign has levels the app would charge XP for.
  The roster builder takes skills at Tier with no charge already; this extends it to set a level
  directly while setting up.
- **The base.** Claiming a base stocks it as a first base (pg. 19), and building costs materials and
  Labor. Setting up needs the claimed base and what is built in each slot, its upgrades, Power and
  Water, all placed without cost.

Both are done in a **setting-up stage**, like the starting community's "the starting community is
built" tick (`startingCommunityBuilt`). The 10 Tier levels limit doesn't apply. Until the table
ticks that setting up is done, the roster and the base take these free placements. After it,
they're corrections as they are today, and nothing is placed free. The walk stays at Assign Facility
Staff, and nothing is owed until setting up is done.

## Open questions

- **Where tracking starts.** The beginning of a Planning Phase, as proposed, or the beginning of a
  Mission Phase, with last turn's Planning typed in.
- **One entry or synthetic entries**, as above.
- **Free placement only while setting up, or always.** As proposed, a free skill level or facility
  is only offered before the setting-up tick. The alternative is a permanent correction on the sheet
  and the slot card, which is simpler, but a mis-tap would then give a free facility at any time.

## What this design does not decide

- **Mid-step starts**, or picking up at a Mission or Management Phase.
- **Importing from paper or another tracker**: everything is typed in.
- **Wording** beyond the questions' own, which follows [`writing.md`](writing.md).

## Work, once agreed

| | Adds |
|---|---|
| **C1** | The `campaign-continued` entry, schema v28, and the readers of kinds 2 and 3 reading it |
| **C2** | The path from the new-campaign form, with its questions, opening on the turn's Planning Phase |
| **C3** | The setting-up stage: skill levels and the base placed free, and the tick that ends it |

C1 goes first, and C2 and C3 each need it.
