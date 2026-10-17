# Phase 7 — Traits and origins: deliverable stories

Breakdown of Phase 7 from the campaign tracker plan, scoped 2026-10-17 against the batch-18, -19
and -20 rulings extracts. Phase 7 gives survivors **who they are** beyond Tier, stats and skills:
the Story Traits and the story missions that give them (pp. 87–102), the three origins' counters and
facilities (pp. 103–133), and the Apocalypse Toolkit's optional survivor traits (pp. 137–140).

Phase 6, the mission companion, is deferred: the tracker records a mission's outcome and leaves the
round-by-round play to the table.

It comes in three parts, each a set of stories that leaves the repo working:

- **Part 1 — Story Traits and stories** (Z7-1 to Z7-4): the six Story Traits and what they change
  between missions, promotion attaching a story or making a Veteran, story missions offered from
  the stories attached, and what they give.
- **Part 2 — The origins** (Z7-5 to Z7-9): Viral's Infection check, Containment and Rot Resistant;
  Cosmic Horror's Madness, the Lounge, the Lost and the Found; Magic's Humanity, spells and the
  Mystic Library; and what each origin's missions give.
- **Part 3 — The Toolkit's survivor traits** (Z7-10 to Z7-12): Advantages and their experience
  debt, Permanent Injuries, and the origin traits, all behind a campaign switch that starts off.

Part 1 is scoped in full here. Parts 2 and 3 are outlined so part 1's shapes are chosen knowing what
will read them, and each is scoped in full before it is built.

## Why this document exists

Every phase so far has left a hole the shape of a trait or an origin:

- **Promotion gives nothing but a Tier.** A Tier 1 or 2 survivor promoted gets a story attached, and
  a Tier 3 promoted to Hero becomes a Veteran (pg. 87). The Advancement Phase does neither.
- **Story missions are a free menu.** The catalogue lists them, Select Mission offers them to anyone,
  and `mission-played` records only that one was played. In the book a story can be played only by
  the team its survivor is on, and its rewards are traits, XP, items and survivors (pp. 87–102).
- **Labor, healing and assignment take no modifiers.** Z3-5 and Z3-6 shaped them so a modifier could
  be applied (phase-3-stories.md); nothing applies one.
- **The origins stop at a flag.** Infection is stored and incapacitates at 10 (R18), and the Lounge,
  Containment and the Mystic Library are in the catalogue but never offered (phase-2-stories.md).
  The Infection check is recorded against pg. 22 in `src/data/dice.ts` and unbuilt.

The failure mode this phase is most exposed to is, again, **modelling the tactical game**. Most
traits and origin rules change what happens on the map: Berserk's extra Attack, Lone Wolf's dice,
Madness gained from a revealed zombie, a spell's effect. The tracker records what the **campaign**
reads: a trait's effect on Labor, healing, assignments, stats, beds or Food; a counter's value
between missions; and what a mission's outcome reports changed. Mission-only effects stay in the
book, cited by page.

## Architecture rules these stories must not break

1. **Rules as data.** The traits, their numbers and pages are a catalogue in `src/data`, with no
   prose. Display names are a labels file's.
2. **Pure engine.** A survivor's Labor, healing cap and allowed assignments are pure functions, and
   each trait's effect is applied where the number is worked out (`laborPool`, `withWoundsHealed`,
   the assignment checks), not patched in by a screen.
3. **Derived is never stored.** A Driven survivor's stats and a Bonded team's Labor are read back.
   What is stored is the trait, the counter and the story attached.
4. **The log only grows.** Every trait given, story attached and counter changed is an entry.
5. **A step is a form until it is recorded** ([`step-records.md`](step-records.md)), and assignment
   is the board's ([`assignment-board.md`](assignment-board.md)). A lane a survivor's traits forbid
   is a lane that refuses the card: it shows the grey zone with the reason, never a warning after
   the card lands.

## Scope boundary

Phase 7 is done when a survivor carries every trait the core rules and the Toolkit give, the turn
applies each one's effect between missions, story missions are played from the stories attached
and pay their rewards, and each origin's counters, facilities and missions work between missions.

Phase 7 explicitly does **not** include:

- **Anything that happens during a mission** beyond what its outcome records: Madness from a zombie
  revealed, Humanity lost to a spell cast, Veil Weakness, a trait's dice or actions.
- **The Toolkit's weapon parts and ammunition** (pp. 169–176), still a later module if ever. Its
  survivor traits are part 3 here.
- **The Road Trip chapter** (pp. 155–167), whose Story Mission result rerolls without a story
  attached (pg. 160).
- **Phase 6's mission companion.**

## What the book settles

From the three extracts; printed page numbers.

- **Story Traits are core** and come only from story missions, with Veteran the one automatic trait,
  at promotion to Hero (pp. 87–88, 137). A survivor holds one story trait at a time, plus Veteran
  (R85).
- **The Toolkit's traits are optional** (pg. 137): Permanent Injuries on a d10 (pg. 138), Advantages
  taken at creation for experience debt (pg. 139), and two origin traits for each origin (pg. 140).
- **Rot Resistant comes from Inoculation** as well as from the Toolkit (pp. 48, 140), so it is core.
  Pg. 48's reference to pg. 142 is a misprint for pg. 140.
- **There are three counters, one an origin**: Infection (Viral, 0 to 10), Madness (Cosmic, 0 to 13
  and over, capped at 6 once Found) and Humanity (Magic, 0 to 5, starting at 3) (pp. 123–127).
- **No mission unlocks a facility the catalogue lacks.** Viral Mission 1 unlocks Containment, and the
  Mystic Library's mission requirement names no mission (R123).

## Rulings the book leaves open

Confirmed or decided 2026-10-17 and recorded in [the registry](rulings.md) as R84–R132, the
extracts' R81–R129 three numbers up:

- **Traits** (batch 18): R84 (what the sheet records), R85 (replace, Veteran stays), R86 to R88 (when
  an injury comes, repeats, no healing), R89 (the order Labor is worked out in), R90 (Jaded's cap
  across every source), R91 (Veteran before the Rot check), R92 (trait bonuses stack with items),
  R93 (a forbidden assignment is never offered), R94 (experience debt), R95 (traits travel with the
  survivor), R96 and R97 (Rot Resistant and Inoculation).
- **Origins** (batch 19): R98 (one origin, fixed), R99 to R102 (the Infection check and healing,
  agreeing with R18), R103 to R105 (Containment), R106 and R107 (Madness at Departures), R108 to
  R111 (the Lost, the Found), R112 to R115 (spells, Humanity, a new survivor's counters).
- **Stories** (batch 20): R116 to R121 (attached stories, promotion, Left Behind's windows and 2b,
  new survivors, one play per attachment), R122 to R124 (Containment's and the Mystic Library's
  unlocks, The Necromancer), R125 to R132 (the rewards that act outside a mission, and which origin
  missions repeat).

Three are recorded **OPEN** inside their entries: a Lost survivor placed and not rescued (R109), a
Found survivor's failed Tier-8 check (R111), and a story whose survivor dies or leaves (R116). Each
says what the app does until it is settled.

## Part 1 — Story Traits and stories

**One schema step for the part, v19**: a survivor's story trait, Veteran, bond group and attached
stories, and the campaign's completed stories. Unreleased until the part's PR merges, as v17 and
v18 were.

### Z7-1 — Story Traits on the sheet

**Why:** A Story Trait changes Labor, healing, assignments and stats between missions (pg. 88), and
nothing records one.

**Scope**
- The six Story Traits as data, with pages and the numbers they change.
- A survivor's story trait, Veteran and bond group (R84), shown on their sheet and set by hand there
  for a campaign brought in part-way. A new story trait replaces the old one; Veteran stays (R85).
- Their effects where the numbers are worked out: Labor in R89's order (Bonded, Jaded, Lone Wolf);
  Jaded's 1 Health a turn from every source (R90); Berserk's +1 Health; Driven's +1 to every stat
  but the highest.
- Assignments a trait forbids are never offered (R93): the lanes refuse the card, with the trait
  as the reason. Berserk only rests, heals or joins a mission team; Jaded may join a mission team
  while wounded.

**Acceptance**
- Two Bonded survivors on a project team produce twice their Labor; a Jaded one half, rounded up.
- A Jaded survivor in a Clinic takes 1 point, and the next point goes to somebody else.
- A Berserk survivor's card shows a grey zone, naming Berserk, on every facility lane and the
  project team's, and nothing to press there.

**What this story turned out to include.**
- **Three more rulings, decided 2026-10-17**: Berserk's point is maximum Health while held, and
  Health above the new maximum drops when it goes (R133); Bonded doubles only with a bondmate of the
  same group (R134); Driven leaves every stat tied for the highest alone (R135).
- **Schema v19 adds `storyTrait`, `veteran` and `bondGroup` to every survivor**, set aside ones
  included. The save refuses a bond group on anybody but a Bonded survivor, and a Bonded survivor
  without one. Attached stories join v19 with Z7-2.
- **Each effect is applied where its number is worked out** (`traits.ts`): `survivorLabor` in
  `laborOf`, `need` in Heal Wounds, `maxHp`, and `statValue`. Every screen reading those reads the
  trait too, and the two Labor captions name what the traits add or take (`traitLaborChange`), as
  they already named the base's and a clean siege's share (#143).
- **Jaded's cap is in `need`**, which the Clinic's share and resting both measure against. A
  survivor rests or is healed, never both (one task each), so in Z7-1 a turn's Health reaches them
  from one place. The Veteran's points (Z7-2) are the next source R90 has to count.
- **The Planning Phase's first blocker.** A task a trait forbids is refused by
  `checkAssignment` and by `assignment/set` itself (`submitAssignment`), so no screen can put a
  Berserk survivor on a facility, the project team or scavenging. The board shows the grey zone, and
  the slot card's checkbox is disabled with the same reason. Jaded's wounded mission team member
  gets no warning.
- **A hand edit is not logged**, as no other correction on the sheet is (stats, Health, XP). A
  trait a story gives is the story's own entry, in Z7-3.

### Z7-2 — Promotion attaches a story, or makes a Veteran

**Why:** Promotion is where a survivor's story begins (pg. 87).

**Scope**
- Promoting a Tier 1 or 2 survivor offers the five stories, chosen or rolled (R117); promoting a
  Tier 3 to Hero gives Veteran.
- A survivor's attached stories, with the turn each was attached (R116).
- A Veteran spends their own XP in the Planning Phase to bring survivors at 0 Health up, 1 for 1,
  and a survivor brought above 0 has no Rot check that turn (R91).

**Acceptance**
- A Tier 2 promoted to Tier 3 gets a story attached; a Tier 3 promoted to Hero becomes a Veteran.
- A Veteran with 2 XP lifts two survivors from 0 to 1 Health, and neither makes a Rot check.

**What this story turned out to include.**
- **Two more rulings, decided 2026-10-17**: a story is attached to one survivor at a time, so a
  promotion offers only the five nobody holds, set-aside survivors included (R136); and a Veteran
  may bring themselves up (R137).
- **The story is chosen, never rolled by the app.** R117 lets the player roll, and the book names no
  die, so the sheet asks which of the five, as it asks which stat comes off 0, and Promote waits for
  both. A table that rolls does so on its own dice.
- **`stories` joins v19**, a list of `{ mission, attachedOnTurn }` on every survivor, and the save
  refuses one story on two survivors. The `survivor-promoted` entry says what a promotion gave: its
  story, or `veteran` for a Leader become a Hero.
- **A Veteran's point is its own entry, `veteran-healed`**, not a `health-restored`: Heal Wounds
  reads any `health-restored` this turn as already done, and the Veteran heals later in the turn.
  Jaded's 1 a turn counts both (`healthThisTurn`), so a Jaded survivor healed at Heal Wounds is
  passed over by a Veteran, and Heal Wounds, walked back to, passes over one a Veteran reached.
- **The Rot check needed nothing**: it reads Health, and a survivor brought up has 1.
- **Stories are set by hand on the sheet** beside the traits, for a campaign brought in part-way.
  A story attached by hand counts from the turn it is set.

### Z7-3 — Story missions from the stories attached

**Why:** A story mission belongs to its survivor (pp. 75, 87), and its rewards are the point of it.

**Scope**
- Select Mission offers a story only to a team its survivor is on (R116), and the next part of an
  arc once the last is done (Left Behind 2a or 2b, Prepper's Stash 2, Warehouse). Turn 1 is
  unchanged: it plays the First Mission without a choice (`turnMissions`).
- Each story's outcome as its own record, replacing `mission-played` for stories: the end it met and
  what it gave, in the shapes the rewards need (a trait, XP, an item, a survivor, a story attached
  to somebody).
- Traits given replace the old (R85); a survivor a reward adds joins at Create New Survivors (R120);
  Left Behind's windows count three turns as inside (R118); 2b follows Part 1 in the same Mission
  Phase (R119); a story is complete once its rewards are taken, Prepper's Stash 2 and Sentimental
  Value apart (R121).

**Acceptance**
- Left Behind Part 1 with the loved one rescued adds a bonded survivor at the next Create New
  Survivors, gives both 1 XP and attaches Part 2a.
- A story attached to Earl is not offered to a team Earl is not on.

### Z7-4 — Rewards that act outside the mission

**Why:** Some stories change a later step rather than the mission's own record (pp. 94, 96, 101–102).

**Scope**
- Crashed Convoy's two 10s at the next Add Materials to Storage (R126).
- Prepper's Stash: Part 1's Quality Items roll, and Part 2's six rolls or three choices and 6 Food
  (R127).
- The Warehouse's Unrest of 0 at the same turn's Management Phase (R125).
- Who becomes Jaded in Left Behind 2b, the player's choice (R128).

**Acceptance**
- After the Warehouse with 11 resources home, Calculate Unrest is 0 that turn, and Hunger and
  Exhaustion are still shown.

## Part 2 — The origins (outline)

- **Z7-5 — Viral: the Infection check and Rot Resistant.** The check at Management Step 1 for
  everybody with Infection, the community's Medicine added with a Clinic (R99, R100, R101); points
  split between Health and Infection as R18 and R102 have it; Inoculation built and given (R97),
  and Rot Resistant's 1 Infection at the start of every Advancement Phase (R96).
- **Z7-6 — Viral: Containment and its missions.** Viral Mission 1 unlocks Containment, with its
  Hardware change (R122); Mission 2 adds a held zombie (R104); held zombies' Siege Threat and
  Infection (R103, R105); Mission 3's Medical Supply tokens (R131); which repeat (R132).
- **Z7-7 — Cosmic: Madness and the Lounge.** A survivor's Madness, changed by mission outcomes and
  the Lounge's Madness Recovery, shared like Health (R110); 13 or more goes Lost at Departures,
  before the Unrest check, unless the survivor is down (R106, R107).
- **Z7-8 — Cosmic: the Lost and the Found.** The Lost list, the Lost roll before the first mission
  (R108), a rescued survivor returning as themselves, Found or exiled (R109), and the Found
  survivor's Tier-8 check (R111). The roll adds XP spent, which the tracker does not keep yet; how it
  is known is this story's first question.
- **Z7-9 — Magic: Humanity, spells and the Mystic Library.** Humanity's changes between missions and
  from outcomes (R114, R115); spells seen and known (R112); learning at the Library (R113), unlocked
  by The Graveyard (R123); The Necromancer's discounts (R124); The Graveyard's Humanity choice
  (R130).

## Part 3 — The Toolkit's survivor traits (outline)

- **Z7-10 — The switch, Advantages and experience debt.** A campaign setting, off by default (R84);
  Advantages taken at creation, with their debt paid before any XP is spent (R94), and their effects
  (Powerhouse's slot, Light Eater's Food, Forager's Food, Outdoor Enthusiast's bed, Quiet's and
  Natural Leader's Scores, R92).
- **Z7-11 — Permanent Injuries.** Taken at creation for XP, or instead of turning when a Rot check
  fails (R86); repeats as R87 has them; never healed (R88); their effects on Labor, slots, Scores
  and assignments (R89, R93).
- **Z7-12 — The origin traits.** Sickly, Calloused Psyche, Psychic Scars, Resistance and Touched, and
  how each replaces an Advantage it meets (pg. 140). Rot Resistant itself is Z7-5's.
