# Writing for the app

How the words on screen are written: every label, button, message, checklist line and log entry a
player reads. [`ux-principles.md`](ux-principles.md) says where things go; this says how they read.
It covers app text only. The prose in `docs/` and in code comments is written for contributors and
keeps its own voice.

Each rule here is a choice the app's copy has mostly already made, written down so that new text
matches it. Where the existing copy disagrees with a rule, the rule wins and the copy is fixed when
that screen is next touched.

## Who reads it

One person at a table, glancing at a tablet at arm's length between moves, often while somebody else
is talking. They may be opening the app for the first time. They have the rulebook, or somebody at
the table does.

So the text has to be readable in a glance and make sense without knowing how the app is built. It
does not have to teach the game. The book does that, and the app may not (see
[What the app may not say](#what-the-app-may-not-say)).

## Addressing the player

The app talks to the player directly, the way a good form or a board game's reference card does.

**Tell the player to do something in the imperative, with no "you".** Buttons, headings, checklist
titles and any sentence whose job is an instruction:

| Write | Not |
|---|---|
| Claim a base | You can claim a base |
| Mark it built in the roster | You should mark it built in the roster |
| Play it on paper, then move on | You will need to play it on paper |

**Use "you" when the player is the subject of a fact**: what they can do, what they choose, what
they will lose. A sentence that would otherwise need "the player" or a passive:

| Write | Not |
|---|---|
| You can step back within a turn | It is possible to step back within a turn |
| If you end the turn now, these stay undone | Ending the turn leaves all of it undone |
| A project goes unfinished, and you choose which | …and which one is yours to say |

**Use "your" for what belongs to the player at the table**: their campaign, their export, their
community, their base. "Changed since your last export", "Claim your base". Do not add it where it
carries nothing: "Survivors", not "Your survivors", on a card heading.

**The people in the game are third person.** Survivors, the community, the mission team and the
project team are always named, never "you": "The community hasn’t eaten", not "You haven’t fed
your community". The player runs the community; they are not in it.

**Never "we", "I", "us" or "our".** The app does not speak as a person.

**"The app" only for its own limits.** When a step is not built or a trade is not modelled, say so
plainly and say what to do instead: "The app doesn’t cover this step yet. Play it on paper, then
move on." Do not use "this version".

**"The table" means play off the screen**: dice, miniatures, counting at the end of a mission.
"Record what the table counted when the mission ended." It is not another word for the player.

**A detail line under an instruction says where or when, not the instruction again.** Under
"Choose who plays the First Mission", write "In this turn's Mission Phase", not "You pick them in
this turn's Mission Phase".

## Sentences

- **One idea per sentence.** If a sentence needs a dash or a semicolon to hold together, it is two
  sentences.
- **No em dashes or semicolons joining clauses.** Use a full stop, a comma, "so", or "and". A colon
  is for a label and its value ("Feed your Survivors: The community hasn’t eaten") or a list.
- **Say the fact, then what follows from it.** "The horde came at Siege Threat 8, so this turn's
  mission is a Siege Defense."
- **Lead with what the player needs.** A warning starts with what is wrong, not with the background
  to it. A blocker says what is stopping the action and, where the app knows, what would clear it.
- **No filler or emphasis words**: simply, just, easily, please, actually, note that, important.
  No exclamation marks.
- **Active voice when there is an actor.** "Nobody is assigned to healing", not "Healing hasn’t
  been assigned".

## Words

- **The book's names for things, capitalised as the book does**: phases and steps (Mission Phase,
  Add Materials to Storage), materials (Food, Fuel, Hardware), stats and derived values (Health,
  Labor, Unrest, Siege Threat), Tier, skills and facilities. Tier is capitalised everywhere, as a
  number ("Tier 2"), as a noun ("a Tier hands out") and in a compound ("Tier levels"). Step names come from `turnLabels.ts` and are
  never reworded.
- **One word for one thing.** Once the app calls something a mission team, it is never "the
  squad" or "the party" elsewhere. Use the name already in the `*Labels.ts` files.
- **Somebody, nobody, anybody, everybody**, not someone or no one. It is what the copy already uses.
- **Contractions, the everyday ones**: can’t, don’t, doesn’t, isn’t, hasn’t, won’t, it’s, you’re,
  there’s. They read as a person talking. Avoid the stacked and the formal ones (would’ve,
  it’ll, ’tis).
- **Press, choose, pick**, never click or tap. The app runs on tablets and laptops.
- **Digits for any number the player reads off or enters**: "3 of 10 Tier levels", "Tier 2",
  "0 Health". Words are fine where the number is not a quantity to check: "one each", "a second
  point".
- **US spelling**, as the book uses: Labor, armor.
- **Curly apostrophes and quotes** (’ “ ”) in text a player reads. Write the character itself
  rather than `&rsquo;`.

## By kind of text

**Buttons** name what they do and where they go ([ux-principles](ux-principles.md#words)): verb
first, sentence case except for book names. "Next: Feed your Survivors", "Start campaign",
"Replace it". Never "OK", "Yes" or a bare "Submit".

**Headings** are sentence case and name what is in the section: a noun phrase or a step name.
"Getting started", "Campaign file".

**Empty states** say what is missing, and the button says what to do about it: "No base claimed
yet." with "Claim a base".

**Blockers** (an action is disabled) say why in one sentence, in the present tense: "This
community already has a base."

**Warnings** (an action is allowed but owed something) say what is wrong, then the consequence:
"8 Health with nobody assigned to healing. It is lost at the end of the turn."

**Confirmations** ask a question in the heading. The body says what will be lost, and only when
something will be. The two buttons name both outcomes: "Replace it" and "Keep the open campaign",
not "OK" and "Cancel".

**Page references** go at the end of the sentence they support, through `PageRef`. Do not write
"see p. 23" around them.

**No ruling numbers** in app text. "(R35)" means nothing to a player, and the rulings in
[`rulings.md`](rulings.md) are for contributors. Code comments and tests still cite them.

**Log entries** (`logLabels.ts`) are past tense and say what happened, with the numbers that
happened: "The horde came: a 9 against a Siege Threat of 8."

## What the app may not say

The app ships numbers, names and page references, and no rule text ([`NOTICE`](../NOTICE)). For
wording, that draws the line here:

- **It may say what a number is**: "3 of 10 Tier levels".
- **It may say where the rule is**, with a `PageRef`.
- **It may say how to use the app**: where to record something, which button does what, what is
  saved and what is lost.
- **It may not say how or why a rule works**, even in different words, and even to help a new
  player. A sentence that would let somebody play without opening the book is rule text.
- **An end condition is named by its own words, shortened**, as a step or a weapon is named by the
  book's. The book gives its end conditions no names, so the page's wording is the name the
  outcome form offers (`END_CONDITION_LABELS`; #241, decided 2026-10-28). That covers the
  condition only, never what meeting it gives.

When a sentence is unclear because it leans on a rule, the fix is a clearer pointer to the page,
not an explanation of the rule.

## Before and after

From the first pass over the first-run screens:

| Before | After |
|---|---|
| Name it now — you can rename it later. | Choose a name. It can’t be changed later. |
| What the first turn needs. This goes away once they are done. | Four things to do on your first turn, in order. This list goes away when they are done. |
| In the Mission Phase of the turn below | In this turn's Mission Phase |
| This step is not built yet — work it on paper and move on when the table has. | The app doesn’t cover this step yet. Play it on paper, then move on. |
| This turn has not finished with: | Still to do this turn: |
| Start it | Start campaign |

The first one was also wrong: there is no way to rename a campaign. Rewriting copy is a chance to
check that it is still true.
