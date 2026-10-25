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

**What this story turned out to include.**
- **Two more rulings, decided 2026-10-18**: Part 2a's family member joins unbonded once the attached
  survivor has lost Bonded, and Part 1's loved one joins a group the survivor already holds (R138);
  and a story done, or held, is not attached again, by a promotion or by another story's ending
  (R139), which is pg. 90's own rule for the Computer made general.
- **A story's ending rides on `mission-played`**, as `story`, rather than a new outcome kind: the
  result by id, and everything it gave written out (XP, trait, a new bond group, kept, the part
  attached and to whom, who joins). `STORY_RESULTS` in `src/data/stories.ts` is the structure; the
  form rebuilds the record from the result and the recipient, so the entry says what the rules
  gave. `missionOutcomeProblem` asks `storyProblem` for every outcome, and a story with no ending
  is refused.
- **Done is read off the log** (`storiesDone`): an ending that neither keeps the story nor attaches
  it again. A promotion no longer offers a story done.
- **The survivor a story brings is a stranger of its team** at Create New Survivors, built at the
  Tier the record sets, Bonded into its group and with its XP; the `stranger-joined` entry says
  both. A Tier 4 joins with slots waiting, since no field recruit is a Hero.
- **Part 2b is chosen for the team at once** (R119): recording Part 1 with the loved one lost
  writes the team's `mission-selected` for 2b, which reopens its outcome, unless the survivor
  died on Part 1 and took the story with them (R116).
- **Left Behind's windows (R118) are a line on the form**, the turns since the story was attached
  and whether that is inside: which ending applies is the table's to say.
- **Left to Z7-4**, as rewards that are things rather than records: Part 1's quality weapon, the
  Computer used twice, Part 2a's XP sent to the bondmates and its Guard House safe, 2b's boat and
  who becomes Jaded (R128), Neighbor's Rifle's rifle and its Tier 3's Long Guns build.

### Z7-4 — Rewards that act outside the mission

**Why:** Some stories change a later step rather than the mission's own record (pp. 94, 96, 101–102).

**Scope**
- Crashed Convoy's two 10s at the next Add Materials to Storage (R126).
- Prepper's Stash: Part 1's Quality Items roll, and Part 2's six rolls or three choices and 6 Food
  (R127).
- The Warehouse's Unrest of 0 at the same turn's Management Phase (R125).
- Who becomes Jaded in Left Behind 2b, the player's choice (R128).
- What Z7-3 left: Left Behind Part 1's quality weapon and the Computer used twice (Prepper's Stash
  Part 1 on whoever used it, R139); Part 2a's XP sent to the attached survivor and their bondmates,
  and the Guard House safe's Crashed Convoy; Part 2b's boat; Neighbor's Rifle's quality rifle, and
  its Tier 3's Long Guns and Dexterity.

**Acceptance**
- After the Warehouse with 11 resources home, Calculate Unrest is 0 that turn, and Hunger and
  Exhaustion are still shown.

**What this story turned out to include.**
- **Three more rulings, decided 2026-10-18**: Part 2a's XP to the bondmates stands with a Teacher on
  the mission (R140); the Guard House safe's Crashed Convoy goes to whoever opened it, and the
  safe's other results are the table's (R141); and Neighbor's Rifle's Tier 3 is given Long Guns,
  Dexterity 3 and a quality rifle, the rest of the build the player's (R142).
- **An ending says what else it asks for** (`asks` in `src/data/stories.ts`): a weapon, a roll, a
  survivor, a count. The outcome form shows one field for each, and the record keeps what was
  given, every item a die found read off the table rather than the screen (`storyRewards.ts`). The
  same record carries Food, the boat, who became Jaded, the Warehouse's count, and the other stories
  attached, which follow R139 like the next part does.
- **Rolls and picks go into the base's Inventory**, as a material 10's find does (Z5-7); the loved
  one's weapon and the rifle go to the survivor who has them. Prepper's Stash 2's three picks are
  from any subtable (R127).
- **The boat is a Tier 2 water vehicle**, the fishing boat the Story Elements give (pp. 93, 117–121),
  named on the form.
- **Later steps read the turn's story endings off the log**, as a won claim is read: the Warehouse
  holds Unrest at 0 beside a won claim, Crashed Convoy's two 10s are ticked on the material rolls
  at the same turn's Add Materials to Storage, and Part 2a's point is the discretionary pool, sized
  to the survivor and their bondmates.
- **`rareItemFor` moved into `src/data/equipment.ts`**, a lookup over the table, so the rewards can
  read it without the materials module; `finding.ts` still exports it.
- **Not tracked**: the safe's other results, the Hatch's Rare Equipment token and Food, the other
  Story Elements' tokens and vehicles (pp. 116–121), and the quality weapons the Heirloom and
  Mabel's machete are (pp. 96–99). They go in by hand
  on the Inventory and vehicles.

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

### Z7-5 — What this story turned out to include

- **One more ruling, decided 2026-10-18**: a survivor at full Health can be assigned to the Clinic
  to be inoculated, with no warning (R143).
- **The Infection check sits beside the Rot check** at Check for Rot, for everybody carrying
  Infection in a Viral campaign (`infectionMustCheck` in `src/engine/rot.ts`). The roll, the Tier
  and the community's Medicine with a supplied Clinic, under the Hunger penalty, against the
  survivor's Infection, with no natural results (R99). A failure turns the survivor through the
  same bite and turning the Rot check uses (R100), logged once by `withTurningLogged`.
- **Rot Resistant is a survivor field** (`rotResistant`, schema v20), false for everybody already
  playing. The sheet shows it with the traits and edits it in a Viral campaign, or for a survivor
  who already has it.
- **An Inoculation is chosen in the Planning Phase and given at Heal Wounds** (R97): the healing
  assignment carries the item, read back off last turn's Planning once this turn's has cleared it. Giving it uses the item up and takes the survivor out of the Clinic's
  healing share that turn.
- **Rot Resistant's first Infection off comes the turn after**, being pressed at Character
  Advancement, which comes before Heal Wounds (R96). One press takes 1 off everybody owed it, an
  entry each, once a turn.
- **Building one is unchanged**: an Inoculation is equipment already built at a Clinic with Water
  (pg. 42). The Medical Supply tokens that pay its Labor are Z7-6's (R131).

### Z7-6 — What this story turned out to include

- **Five more rulings, decided 2026-10-18**: one point of interest and a passed Broken Cage check add
  up to Containment's usual Hardware (R144); Bring It On Home and Medical Salvage are offered on
  every Viral turn (R145); Bring It On Home's extras are the player's, and only a standing
  Containment holds its zombie (R146); Medical Supply tokens go where the Inventory goes (R147);
  and a survivor given an Inoculation loses no Infection to Containment (R148).
- **A Viral mission records what the table counted** (`ViralRecord` on `mission-played`,
  `src/engine/viralMissions.ts`): the points of interest and the Broken Cage check, the ensnared
  zombies that left, or the Medical Supply tokens. The form rebuilds it before it is logged, so
  whether a zombie was held is the base's answer, not the screen's.
- **Containment's unlock is read off the log**, from the first Experimental Data that investigated
  a point of interest, as the campaign's own (R122). Experimental Data is not offered after it.
  Building Containment before then is a warning, not a refusal, and its Hardware is changed by
  −2, 0 or +2.
- **Schema v21 counts the held zombies and the Medical Supply tokens** (`heldZombies`,
  `medicalSupplies`), zero for every earlier save. The base and Inventory cards show them when
  there are any.
- **Each held zombie adds a Siege Threat term of its own** and takes 1 Infection off each survivor
  being healed at Heal Wounds, after the points are split, as an `infection-contained` entry. That
  entry counts as Heal Wounds done, as Health does.
- **A move leaves the held zombies behind** with Containment (R105). An overrun loses the tokens
  with the Inventory.
- **A token pays 1 Labor of a medical build**, entered on the build form: the `item-built` entry
  keeps the project team's Labor and the tokens apart.
- **Fixed on the way**: an upgrade of another origin, Containment or the Lounge, is no longer
  offered in a campaign that is not running it, as its facilities never were.
- **Not tracked**: Bring It On Home's XP for the other zombies and the special zombies' items, added
  by hand (R146).

### Z7-7 — What this story turned out to include

- **No new rulings**: R106, R107, R110 and R132 covered it.
- **Madness is a survivor field** (`madness`, schema v22), stored on everybody as Infection is, zero
  for everybody already playing. A Cosmic Horror campaign's mission outcome records each member's
  Madness at the end, beside their Health, and the sheet shows and edits it, saying when it reaches
  13.
- **The list of the Lost** (`lost` on the campaign) is new with v22, kept whole like the set-aside,
  so a Lost survivor's items and stories still count as held (`keptSurvivors`). Z7-8 brings them
  back.
- **A Cosmic Horror mission is offered to a team** with somebody at 4 or more Madness (R132), read
  per team as story missions are.
- **Madness Recovery is an assignment** at Rest and Healing, in place of resting or healing, in a
  Cosmic Horror campaign only. It's warned about without a working Lounge or any Madness to lose.
  At the next Heal Wounds the Lounges' points (2 each, 4 with Power) are shared equally among
  those assigned, one at a time, never past 0 (`src/engine/lounge.ts`), with a press of their
  own beside the Health.
- **At Departures, everybody at 13 or more goes Lost first** unless they're down, on one press,
  each with a `survivor-lost` entry and what they carry. The Unrest departure is refused until they
  have gone, so it reads the community they leave (R106).
- **The Survivors card counts the Lost.** Who they are, and the Lost roll, are Z7-8's.

### Z7-8 — What this story turned out to include

- **Two more rulings, decided 2026-10-18**: XP spent is counted from now on, by every purchase and a
  Veteran's healing, and corrected by hand for what came before (R149); and nobody makes the Lost
  roll on a turn with no mission (R150). The Found check is asked on the mission outcome, at the
  gain R111 names.
- **Schema v23 adds `xpSpent`, `found` and `foundCheckPassed`** to every survivor, 0 and false for
  everybody already playing. `withXpSpent` is the one place XP is spent, so the count can't miss a
  purchase. A Cosmic Horror sheet shows and corrects XP spent, and Found reads with the traits.
- **The Lost roll is made in the Mission Phase before any outcome is recorded**, a `lost-rolled`
  entry each, once a turn (`src/engine/lostRoll.ts`). The d10 and the XP spent against 18 is a
  check by the book's convention (pg. 8), so a natural 1 fails and a natural 10 succeeds. A pass
  names the mission team they join; a fail gives the Lost survivor 1 XP.
- **A placed survivor's rescue is recorded beside the outcome**: Found, back in the community as
  themselves at full Health with no Infection or Madness; exiled, back on the list with their items
  left to the base (R75); or not rescued, still Lost (R109's open part).
- **The Found check is a Tier check against 8**, asked on the outcome when a Found survivor's
  Madness goes up. A pass caps them at 6 for good, the entry included. A fail caps nothing and is
  asked again at the next gain (R111's open part). `tierCheckPasses` is now the one Tier check, and
  the Rot check reads it.
- **The roster lists the Lost**, with their XP spent.

### Z7-9 — What this story turned out to include

- **Five more rulings, decided 2026-10-19**: a survivor lost to the Veil takes what they carry
  (R151); recording The Dark marks it played, its rewards added by hand (R152); winning The
  Necromancer gives the spell discount and killing him gives the Labor change (R153); every spell
  an enemy casts is seen, on any mission (R154); and each spell is known once, with no limit
  (R155). The batch-21 extract gives The Dark's reward as 3 warding stones; where they are kept is
  still open, so they stay a hand entry in the Inventory under R152.
- **Schema v24 adds Humanity** to every survivor, 3 for everybody already playing (R115). A Magic
  campaign's mission outcome records it, 1 lower to start for anybody carrying one of R114's
  magical items, and at 0 the survivor is lost to the Veil (`survivor-veiled`). A turn on the
  project team gives 1 at Check for Rot, once a turn; healing from 0 Health gives 1 wherever it
  happens (`src/engine/humanity.ts`).
- **The Magic missions record how they ended** (`src/engine/magicMissions.ts`): The Graveyard
  completed unlocks the Mystic Library; The Necromancer won takes 3 XP off the next spell, and
  killed takes 1 Labor off a Mystic Library and every upgrade to it.
- **Schema v25 adds the spells a survivor knows.** The spells seen are read off `spells-cast`
  entries, which a Magic campaign's mission outcome writes from the spells ticked
  (`src/engine/spells.ts`). The Spells section at Character Advancement offers whoever staffed a
  working Mystic Library, one a staff place, one spell a turn from those seen, for 6 XP or 3 with a
  Necromancer discount left, paid as XP spent (R113, R149). The sheet lists and corrects them with
  the traits.
- **Not tracked yet**: the Resistance trait that can never learn a spell (pg. 140) is the Toolkit's,
  Z7-10's. Casting is a mission action, so it shows only as the Humanity the outcome records.

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

### Z7-10 — What this story turned out to include

- **Nine more rulings, decided 2026-10-25 from the batch-22 extract**:
  - R158: switching the traits on part-way gives survivors already playing nothing.
  - R159: an Advantage removed by an origin injury leaves its debt.
  - R160: no cap on Advantages at creation.
  - R161: unprinted repeats turn the survivor.
  - R162: after an origin injury removes its Advantage, the survivor has neither.
  - R163: no Advantage with its matching origin injury.
  - R164: Forager gives 1 Food a mission, not for a siege.
  - R165: Calloused Psyche caps what is kept, not the check.
  - R166: strangers take Advantages when they join.
- **The origin is chosen when a campaign starts.** Nothing set it before, so the origin work from
  Z7-5 to Z7-9 could only be reached by importing an edited file. The new-campaign form asks for
  the origin and the Toolkit switch, and a Campaign settings modal in the menu shows the origin
  (fixed, R98) and switches the traits. Switching them off takes every survivor's Advantages and
  debt, after a confirmation.
- **Schema v26 adds the switch, each survivor's Advantages and their experience debt**: off, none
  and 0 for everybody already playing. `src/data/traits.ts` lists the eight common Advantages with
  each one's debt and numbers. The origin ones on pg. 140 are Z7-12's.
- **Debt is paid in one place**, `withXpGained` in `src/engine/survivor.ts`, which every XP gain
  goes through: the Advancement pools, a Lost roll and a story's reward. While any debt is left,
  the purchases, a Veteran's healing and learning a spell are refused (R91, R94, R113). An
  `xp-awarded` entry says how much went to the debt.
- **The effects**:
  - Powerhouse's slot.
  - Light Eater's 1 Food.
  - Forager's Food with the haul.
  - Outdoor Enthusiast's bed.
  - Quiet's and Natural Leader's Scores, a term of their own (R92).
  - Natural Leader's Labor, at R89's adding step.
- **Advantages are taken on the sheet**, in the traits editor, each adding its debt. A survivor
  who joins gets theirs there.
