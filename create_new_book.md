# Create a new book — start to finish

Agent playbook for turning a one-line premise into a fully playable book on the site.
Prompts this doc is built to handle:

> "I want a new mystery with various endings, set on a space station in 2218."
> "I want a kid-friendly mystery set in a zoo."
> "I want a western mystery that takes less than 15 minutes to complete."

This doc covers the **whole pipeline** — interpreting the brief, designing the mystery,
writing the manuscript and endings, planting clues, wiring cross-references, verifying,
and shipping. The companion doc [`put_book_in_site.md`](put_book_in_site.md) is the exact
**file contract** (every field of every JSON file) and the **seeding** procedure; this doc
references it rather than repeating it.

**The deliverable is a book live on the production site — not a folder of local files.**
When a user asks for a book ("I want a mystery set in…"), the default, expected end state is
that a stranger can open `ai-mysteries.ryangano.com` (the live production site — `therealending.com`
is the not-yet-registered domain printed inside the book itself, a separate thing), see the new
book in the catalog, read it, and
hit its endings. That means you run the pipeline **all the way through Phase 7**: generate and
upload the cover, seed Cosmos, verify parity, and confirm the book is serving from the prod
API. Do **not** stop at "authored locally and verified on localhost" and ask whether to ship —
shipping is part of the task, not a follow-up. The only times you stop short of live are when
the user explicitly says so (e.g. "just draft it locally", "don't ship yet") or when a ship
step needs a credential/permission you don't have — in which case do everything you can, then
report the one blocking step. Treat "create a book" and "put the book on the site" as the same
request.

**Ground rules before anything else** (see *Spoiler rules* in `CLAUDE.md`):

- Everything you author lives in **gitignored** locations: book data in
  `ai-mysteries-api/Content/<bookId>/`, design/spoiler docs in `docs/<bookId>/`.
  **Never commit book content, codes, culprits, clue maps, or character details.**
- Adding a book is **data-only** — zero code edits, zero redeploy. If you find yourself
  editing React or C# to make a book work, stop: the thing you're hardcoding belongs in
  `meta.json` or the content files.
- **Don't re-read other books' `Content/` to "learn the pattern" — it's pure token cost.** The
  shared engine + the structural scan in `docs/book-registry.md` are enough. The one thing you may
  pull from an existing book is the **shared opening-beat shape** of an ending (Phase 4) — and
  even then copy the *structure*, never the text. If a `meta.json` field's shape is unclear, the
  contract is `put_book_in_site.md` §2, not another book.
- **No sexual or sex-related content** in the manuscript or any ending (every book, every
  audience). Romance stays at kissing / dating / hugging / holding hands; anything beyond
  that you do **not** write without asking the user first. See *Content boundaries* in
  `CLAUDE.md`.
- **Write American (en-US) spelling** throughout — manuscript, endings, and `meta.json` copy
  (*color/gray/theater/realize/traveled/defense*, never *colour/grey/theatre/realise/travelled/
  defence*). The **only** exception is a book deliberately set somewhere British spelling is the
  natural in-world register (a London setting, a Scottish keeper's own ledger) — and even then,
  keep it intentional and consistent. Absent that, default to en-US. See *Spelling* in `CLAUDE.md`.
- **Default to the author's house voice** — warm, plain-spoken, conversational clarity, varied
  rhythm with short-sentence punches, everyday analogies walked through, gentle humor, a humane
  narrator who never lectures. This is the connective *texture* under every book, **not** sameness
  and **not** the per-book opening voice (which still varies — see Phase 0.5). Deviate only when
  the genre truly calls for a different voice (noir, a formal period ledger, a clinical register),
  and then do it on purpose. Profile + skills: `.claude/skills/write-in-my-voice/` (draft with
  **write-in-my-voice**, grade with **check-my-voice**). See *Voice* in `CLAUDE.md`.

---

## Build fast path (the whole job at a glance)

Follow these in order. Each step links the phase with the detail; **read a phase's detail only when
you're on that step** — don't pre-read the whole doc. The *Reference* sections at the bottom (worked
parameter sheets, definition-of-done) are consult-when-needed, not part of the linear read.

1. **Interpret the brief** → word budget, suspect count, ending count (Phase 0).
2. **Pass the Distinctness Contract** → `node scripts/pick-axes.cjs --audience <…>` to roll three
   candidate axis combinations, pick the one that fits the premise, confirm ≥3-of-6-axis novelty
   (Phase 0.5). Do this *before* writing prose.
3. **Design the dossier** in `docs/<bookId>/` → outline, character bible, ending matrix (with a
   resolution-kind spread), style guide, cover prompt (Phase 1).
4. **Author `meta.json`** → copy + selection weights; field contract is `put_book_in_site.md` §2
   (Phase 2).
5. **Generate the cover** → `node scripts/gen-cover.cjs <bookId>` (Phase 2, house style there).
6. **Write the manuscript**, logging clue quotes as you go (Phase 3).
7. **Write the endings** (shared opening beat, varied per ending + the matrix) (Phase 4).
8. **Wire cross-references** → `gen-xrefs.cjs` + `check-xrefs.cjs` (Phase 5).
9. **Verify locally** → `dotnet run` (it's the schema validator) + `npm run dev` (Phase 6).
10. **Ship** → cover upload, seed, diff, confirm live; exact commands in `put_book_in_site.md` §4
    (Phase 7).
11. **Final report** → the one-row summary table.

> **Running under the `add-todays-book` skill?** Steps 8–10 (Phases 5–7) are delegated to a Sonnet
> subagent rather than run inline — by then your context holds the whole book, and those turns are
> the most expensive and least judgment-heavy in the build. The skill owns that handoff; follow its
> step 4 for the brief. Everything about *what* each phase must accomplish is unchanged, including
> Phase 7 being mandatory.

---

## Phase 0 — Interpret the brief

Extract or default these parameters before writing anything:

| Parameter | From the brief | Default if unstated |
|---|---|---|
| Setting / genre / era | explicit ("space station, 2218", "western", "zoo") | ask, or infer from genre |
| Audience | "kid friendly" → middle-grade voice, nonviolent crime, **easy-to-read names + concepts** (see below) | adult |
| Total reading time | "less than 15 minutes" | 30–45 minutes |
| Suspects | rarely stated | 5 (use 4 for very short books) |
| Endings | "multiple endings" is the baseline | see ending matrix below |
| Weighting | "simple endings roll more often" is the **site default** | see Phase 2 |

Convert reading time to a word budget at **250 words/min, for every audience** — that is the flat
rate the API uses to derive the reading time the catalog displays (`Services/ReadingTime.cs`), so
it's the only rate that makes a brief's "~20 min" and the site's "~20 min read" mean the same thing.
A middle-grade reader genuinely reads slower than that, and the label is still honest — it's a
general-reader estimate, not a promise about one reader. **Do not budget kid-friendly books at 160
wpm:** that yields a "10 min" book the catalog labels ~6 min, and chasing the gap afterward is what
turns length into an editing loop.

The budget covers the **manuscript only** (chapters); each ending adds ~600–1,000 words on top but
readers only see one at a time.

**Write to length once, then stop.** Put a per-chapter word budget in `Outline.md` (total ÷ chapters,
adjusted for the beat) and write to it. When the manuscript is done, measure **once**:

```
node scripts/book-stats.cjs <bookId> --target <brief minutes>
```

Anything within **±15%** of the brief is *done* — record the actual length and move on. If it's
outside, take **one** adjustment pass; if that doesn't land it, keep the prose and record the actual
length in the archive row. Never enter a write → count → trim → count loop: it's the single most
expensive habit in the build, and the finished length is a fact to report, not a target to hit.
`book-stats.cjs` also verifies `meta.json`'s `wordCount` against the files — that field is what the
catalog reads, so a stale value mislabels the book on the live site.

| Target | Manuscript words | Chapters | Suspects | Endings (typical) |
|---|---|---|---|---|
| < 15 min | 2,800–3,400 | 5–7 short | 4 | 7–9 |
| 30–45 min (default) | 7,000–10,000 | 8–12 | 5 | 10–14 |
| 60+ min | 14,000+ | 12–18 | 5–6 | 14–20 |

The crime itself scales with audience: a death for adult mysteries; a theft, sabotage,
disappearance, or hoax for kid-friendly ones. The mechanic is identical either way —
several suspects, each of whom plausibly did it.

**Kid-friendly or no-murder books also get easy names and easy concepts.** If the book is
for younger readers (or simply has no death — a softer book invites a younger reader either
way), make the prose easy to *read*, not just easy to stomach:

- **Names a child can decode at a glance.** Short, phonetic first names and one-syllable
  surnames (Lena Park, Bo Hale, Dr. Sam Reed) — not Sorokin, Lindqvist, or Halvik Mensah.
  Keep all of them visibly distinct from each other (different first letters and sounds) so a
  young reader never confuses two suspects. Avoid two names that look or sound alike (no
  "Vale" *and* "Vane" in the same cast).
- **Concepts a child can follow.** Prefer the plain word over the technical one
  (list not *manifest*, inspector not *proctor*, cooling pipe not *coolant manifold*, cleanup
  not *prune*, "within limits" not *within parameters*). When a real idea matters to a clue
  (condensation, freeze-thaw), keep the idea but **gloss it in plain words the first time** —
  don't make the reader already know the term. Break the longest sentences up.
- A theme word can stay if it carries the book (e.g. *non-essential mass*) — but the prose
  around it must explain it plainly, so the term teaches itself.

## Phase 0.5 — The Distinctness Contract (read before designing)

**The site's whole value is "one book, many endings" — across *many* books. If two books feel
like the same book reskinned, repeat readers stop coming back.** A new setting is **not** enough:
the cozy/No-Crime books drifted into being one template find-replaced (a precious thing goes
missing → a "quiet one who solves by going still and remembering" → an "empty-X / two-duplicates /
second-pass / deadline" chapter spine → endings that *all* resolve the same gentle way). Never do
that again.

**Hard gate: a new book must differ from every already-shipped book on at least *three* of these
six axes** — and may never reuse another book's opening sentences or its detective-method sentence
verbatim. Check your design against the registry below *before* writing prose. The axes are not
equally roomy: **setting, mystery type, and voice are high-cardinality** (lots of room — lean on
them), while **method, structure, and resolution-kind are low-cardinality** (few real options and
already crowding — see the over-used flags below). Earn your three differences on the roomy axes
first.

### Roll the crowded axes — don't choose them

**Start here, before designing anything.** From the repo root:

```
node scripts/pick-axes.cjs --audience <adult|all|kid> [--type <mystery type>]
```

It reads the registry, counts how crowded every option on the crowded axes already is, scores the
whole combination space, and proposes **three** candidates with a confidence score, the rarity of
each axis value, and which shipped books sit closest.

**Why a dice-roll instead of your judgement:** you will reach for the same few shapes. That is not a
hypothetical — it is how four cozies ended up as one template find-replaced and had to be de-cloned,
and it's why *"reads a written record"* and *"one spotlight per suspect"* got over-used in the first
place. Sampling has no favourite. It also turns the ≥3-axis gate from an honour check into
arithmetic.

How to use the output:

- **Pick the candidate that best fits the premise** — a high score is not permission to force a bad
  fit. A confident-but-wrong combination makes a worse book than a workable-but-right one.
- **Re-rolling is free.** The search is local and instant, so re-run rather than settle. If you
  re-roll more than two or three times, the problem is probably the premise, not the dice.
- **If every candidate is weak**, the script names the dominant reason. A structural one (asking for
  a death in a kid-friendly book) won't re-roll away — change the constraint or re-cut the premise.
- It covers **type, method, spine, and the ending spread only**. The setting is the premise's, and
  the voice/opening beat is yours to invent fresh (axis 6) — the register hint is a nudge, not an
  instruction.
- `node scripts/pick-axes.cjs --list` shows the menus with current crowding, if you want to see
  what's genuinely unused before deciding.

1. **Mystery type** — what actually happened. Don't default to "an object is lost." Menu: a thing
   is **lost** / **damaged or changed** / **swapped** / an **impossible event** / **a person is
   behaving strangely** / **sabotage that wasn't** / **a kindness misread** / **a thing that was
   never gone** / **two crimes tangled** / **the victim/subject isn't who we think**. Pick one not
   already over-used.
2. **Setting / world** — *where and when.* The one lever that **never runs out**, so use it: a
   genuinely new world (era, place, milieu) earns one of your three differences outright. **Don't
   reskin a shipped world** — another present-day cozy small-community, another sealed vehicle,
   another period theater/court. Jump era, place, *or* milieu. See the registry's setting column for
   what's taken.
3. **Detective archetype + method** — *how* they solve it. **Two methods are over-used — avoid
   unless the premise truly demands one:** *reasons from a written record / list / document* (~8
   books already) and the retired *"goes still and remembers"* voice (**banned outright**). Reach
   for a fresher method: maps or **draws** the scene; **talks** people into contradicting
   themselves; **re-enacts / re-times** the event physically; deduces from the **senses** (taste,
   smell, sound, temperature); is a **skeptic** out to debunk; works **backward from the one
   impossible detail**; **follows the money / incentives**; **catches a lie in real time**;
   reconstructs from what's **absent** (the dog that didn't bark); is the **domain expert** who sees
   what others miss; **sets a trap** to flush the culprit; reads **numbers / accounts** (not prose);
   is **fooled first, then realizes**.
4. **Chapter architecture** — the spine. *"One spotlight per suspect → finale"* is **over-used
   (~10+ books) — don't default to it.** Actively reach for a shape barely used yet: reverse
   chronology (open at the reveal, walk it back); two **interleaved timelines** (then / now);
   **real-time** single scene (one room, one hour); a **frame story** (someone recounting it);
   **POV that rotates** among the suspects (each chapter one suspect's account); an **inventory**
   structure (a chapter per item / room / clue); the detective is also a suspect; a leisurely
   unspool with no clock.
5. **Resolution-type spread across the endings** — *the most important one.* A book's endings must
   **not all resolve the same way.** Across the matrix, **span at least three** of these kinds: an
   **accident / real consequence**; a **deliberate act with a motive**; a **genuine
   misunderstanding / it was never gone**; a **reversal that re-colors an earlier scene**;
   **self-inflicted (the victim/subject did it to themselves)**; **the system/institution is to
   blame (no single villain)**; **collective guilt (everyone a little responsible)**; a
   **sympathetic or justified culprit**. An all-"benign person harmlessly had it, nothing harmed,
   nobody unkind" matrix is the failure mode — kill it. (Kid-friendly books may stay **ultimately
   reassuring**, but the *cause* and the *path* must still vary: a real near-loss that's recovered, a
   deliberate hide, a swap, a thing tucked away as a surprise, a thing that was never lost.)
6. **Voice register + opening beat** — invent this book's own first beat. **Banned because it's
   been lifted before:** "made a small sound," "the way you pat a pocket the second time — faster,
   both hands," "her chin began to crumple," "the room was getting loud, so she went very quiet and
   started to think," and a bare "N minutes/hours until …" countdown. Write a fresh opening.
   *(This axis varies the **surface** — the opening register and first beat — on purpose. It does
   **not** mean abandoning the house voice: the underlying texture stays warm and plain-spoken
   across books per the* Voice *default in `CLAUDE.md`. Vary the register; keep the hand. The
   failure mode this axis kills is sameness of opening, not the shared baseline feel.)*

### Detective gender balance (soft — tracked, not gated)

**Track it, nudge it, never force it.** An audit on 2026-08-02 found the site's detectives skewed
heavily female (roughly 32 female leads vs. 6 male among identifiable protagonists across the
books shipped by then) — not a deliberate choice, just nothing was tracking it.
`docs/detective-gender-tally.md` logs one row per shipped book so this self-corrects over time.

- **Before designing the detective**, check that file's running count. If one gender is running
  well ahead, **lean the new detective toward the other one** when the premise doesn't already
  imply a gender.
- **This is a soft nudge, not alternation.** Don't mechanically alternate book to book — that reads
  as its own pattern and readers can spot it. Aim for the running ratio to drift back toward
  roughly even *over many books*, not for any single book to "owe" a gender.
- **Never force it against the story.** A period-specific gendered role (a 1962 submarine
  sonarman, a Pullman porter, a Victorian cricket umpire) should stay true to the period unless
  you're deliberately subverting it — historical accuracy and premise fit outrank the tally. Lean
  on this rule hardest in contemporary/kid-friendly/all-ages books, where the detective's gender
  is usually a free choice and is exactly where the skew crept in.
- **Log the result** in `docs/detective-gender-tally.md` when you ship (the `add-todays-book`
  skill does this alongside the registry row).

### Sentence-level anti-echo (applies on top of the six axes)

The axes catch *design* sameness; this rule catches *prose* sameness. Books have shipped whose
designs passed the contract but whose sentences were near-clones of an earlier book's — the same
victim-description sentence with nouns swapped, the same two-clause reveal-scene scaffold ("here
is the easy explanation everyone would prefer … but the detective knows better and need only say
so before the deadline"), the same one-line reveal in the no-culprit ending. A reader who has read
two books notices instantly, and it reads as find-replace.

**Hard rule: never reuse another book's sentence-level scaffolding.** That covers, at minimum:
character/victim introduction sentences; the shared paragraph structure of the endings' reveal
beat (each *book* needs its own scaffold in its detective's idiom — within one book the endings
may stay near-variants of that book's own beat); the "gathered to hear the name" summons sentence;
and the signature one-line reveal of the sentinel/no-culprit ending.

**Mechanical check before shipping:** take the new book's most distinctive recurring sentences —
the reveal-beat scaffold clause, the victim/detective intro, the sentinel reveal line — and `grep`
their distinctive 4–8-word substrings across `ai-mysteries-api/Content/`. Any hit in another book
means rewrite yours (the new book yields; shipped books stay). A phrase-ownership list of scaffolds
already claimed by shipped books is kept in `docs/book-registry.md` — add your book's new scaffold
phrases to it when you ship. (These rows are long and quote-heavy, so appending them often wants a
throwaway helper script — write it to the OS temp dir, and delete it once it has run. Nothing
temporary stays in the working tree.)

### Registry of shipped books (differ from these)

**The registry lives in [`docs/book-registry.md`](docs/book-registry.md)** (gitignored) — one
compact, spoiler-light row per shipped book (setting · mystery type · detective method · structure
spine · length · tags). It is the **single source of truth** for this check; read it now and confirm
your design differs from every row on ≥3 of the six axes. Two books may share at most three axes.

Keeping the registry in its own file (instead of inline here) is deliberate: the `add-todays-book`
skill appends a row on every ship, so it never goes stale, and this playbook stops growing as the
catalog does. **Don't re-derive distinctness from the per-book memories or old `Content/`** — the
one file is enough.

If your design's row would duplicate three+ axes of any registry row, change the design — not the
paint. (When two books legitimately share the engine's *mechanic* — a non-human **sentinel**
culprit and a rare **special** ending — that's fine; the engine is shared on purpose. It's the
*story shape* in the registry that must differ.)

## Phase 1 — Design the mystery (the dossier)

Create `docs/<bookId>/` (gitignored) and write the design **before** any prose. Pick the
`bookId` now — kebab-case, it becomes the folder name, the URL prefix, and the Cosmos
partition key (see `put_book_in_site.md` §1).

`docs/<bookId>/` should end up containing:

- **`Outline.md`** — the premise: setting bible, the victim/loss, the detective figure,
  the timeline of the crime, and the chapter-by-chapter beat sheet.
- **`CharacterBible.md`** — one section per suspect: their **domain** (the slice of the
  world only they control), their **lever** (the one small act they could have committed),
  their **motive**, their **secret** (something they hide that isn't necessarily guilt).
  This is what makes every ending land: each suspect must be *individually* viable.
- **`EndingMatrix.md`** — the table of endings you'll write: culprit set, mechanism
  (how that combination actually did it), code, slug. Plus the selection weights you'll
  put in `meta.json`.
- **`EndingStyleGuide.md`** — the book's voice rules and its **shared opening beat** (the scene
  every ending opens on, worded as a variant per ending — see Phase 4).
- **`CoverPrompt.md`** — the image-generation prompt for the book's cover, in the house
  style (see Phase 2). The user generates the art from this prompt (e.g. in Copilot).
- **`EndingClueMap.md`** — grows during Phases 3–5; the machine-parsed clue map
  (see Phase 5).

### Designing the ending matrix

Categories are culprit-set **sizes** (`"1"`, `"2"`, …) — that's what the weighting keys on.

1. **Solo endings — one per suspect, mandatory.** Every suspect must be individually
   guilty in at least one ending; otherwise their clues are red herrings with no payoff.
2. **Pair endings — pick the believable pairs**, not all C(n,2). A pair needs a reason to
   conspire (shared motive, one covering for the other). 3–6 pairs is plenty.
3. **"All of them" ending — optional but satisfying.** Its category is the full set size
   as a string (e.g. `"5"`).
4. **Sentinel culprit — optional.** A culprit that isn't one of the human suspects (the
   institution, the machine, the wilderness itself). Its *solo* endings form their own
   `"sentinel"` category via `selection.sentinelCulprit` so it can be weighted
   independently.
5. **Special ending — at most one, optional.** `special: true` + a per-book `specialEnding`
   integer 1–1000 makes it a rare 1-in-1000 jackpot with the `specialReveal` overlay (the exact
   `readCount % 1000` mechanic is in `CLAUDE.md` → *Weighted random selection*; don't restate it
   here). Authoring guidance: good candidates **break the game's own frame** — a culprit no reader
   would consider in scope. Pick a **fresh random value 1–1000** per book; `0`/omitted = reachable
   only by typing its code.

**Resolution-type spread (required — Distinctness Contract axis 4).** In `EndingMatrix.md`,
annotate every ending with its **resolution *kind***, not just its culprit set —
*accident/consequence*, *deliberate act + motive*, *misunderstanding / never-gone*, *reversal that
re-colours an earlier scene*, *the sentinel/world did it*. The matrix as a whole must span **at
least three kinds.** If every row reads "this person harmlessly had it / did a benign thing and
nothing came of it," the book is the failure mode — go back and give some endings real teeth (a
genuine accident, a deliberate motive, a red herring that *bites*, a twist). This is the single
biggest thing that stops a book feeling like the last one.

Multiple endings per culprit combination are allowed — selection picks the combination
first, then an ending within it uniformly, so combos stay equally likely regardless of
how many endings each has.

**The fair-play rule (this is the heart of the product):** every ending's mechanism must
be **plantable** — each ending needs at least two passages in the manuscript that
foreshadow it (one strong plant, one supporting crumb). If an ending hinges on a specific
object/document/number, that thing must appear in a chapter. Write the planned clue list
into `EndingMatrix.md` *now*, per ending; Phase 3 is where you actually seed them.

## Phase 2 — `meta.json` and selection weights

Author `Content/<bookId>/meta.json` per the full field reference in
`put_book_in_site.md` §2. The copy (summary, secretBlurb, payoff, share text) is
book-specific marketing voice — write it fresh for the premise; never leave
within-tolerance phrasing in it.

**Weighting requirement (site default): simple beats complex.** Solo endings must roll
noticeably more often than pairs, pairs more often than bigger groups. A good starting
point for 5 suspects with solos, pairs, and an everyone-ending:

```json
"selection": {
  "categoryWeights": { "1": 55, "2": 30, "5": 15 },
  "specialEnding": 734
}
```

With a sentinel culprit, carve its share out explicitly, keeping `"1"` dominant:

```json
"selection": {
  "sentinelCulprit": "<the non-human culprit's exact name as used in culprits>",
  "categoryWeights": { "1": 45, "2": 25, "sentinel": 20, "5": 10 },
  "specialEnding": 734
}
```

Pick `specialEnding` as a **fresh random integer 1–1000** for each new book — don't copy another
book's value. (What the number does is in `CLAUDE.md` → *Weighted random selection*.)

Every category your endings actually use **must** have a positive weight — the API
validates this at startup and refuses to load the book otherwise. The `selection` block
is server-only and never returned by any endpoint; keep it that way.

`coverImage` is a URL used directly as `<img src>`. While authoring locally, a public
placeholder URL is fine; before shipping, host real cover art at a public absolute URL
(e.g. Azure Blob Storage) — never bundle it into the web app (`put_book_in_site.md` §2).

**Always author a cover-art prompt** and save it to `docs/<bookId>/CoverPrompt.md` — every
new book ships with one. The prompt is also the **input to cover generation**: `scripts/gen-cover.cjs`
reads the `## Prompt` blockquote of that file. Match the site's **house style**, set by the
existing covers:

- **A cinematic photograph, not an illustration.** Realistic, shallow depth of field, 50mm feel.
- **One emotionally-loaded object** — the book's central token (the ruined keepsake, the
  high-alert vial) — resting on a **cold, hard surface** (brushed steel, etc.).
- **An empty, soft-focus institutional background** that places the world (station cabin, night
  ward) with no people in frame.
- **Desaturated, near-monochrome palette** keyed to the book (ice-blue, clinical steel/bone),
  optionally one muted spot of color on the object. Quiet dread, long soft shadows.
- **No text, no lettering, no logos, no people** — the UI renders the title beside the thumbnail.
- **2:3 portrait, 1024×1536 px, exported as `.webp`** (the bundled cover is exactly this).

**Generating the image (free, automated).** After writing the prompt, generate the cover from
the repo root:

```
node scripts/gen-cover.cjs <bookId>              # FLUX (default, best photographic quality)
node scripts/gen-cover.cjs <bookId> --model sdxl # fallback if FLUX is quota-limited or errors
```

It calls **Cloudflare Workers AI** (free daily quota, no per-image cost; creds in a gitignored
`.env` — `CF_ACCOUNT_ID`/`CF_API_TOKEN`), crops/encodes to the house-style **2:3 / 1024×1536 /
webp**, and writes `ai-mysteries-web/public/covers/<bookId>.webp`. Re-run with `--seed N` to
get a different composition; show the user the result and regenerate until it lands.

**If Cloudflare 400s on the model's schema**, don't hand-tune the request from the build —
switch to `--model sdxl` (it produces a good house-style cover) so the book still ships, and
report the failure so the script gets fixed once. Known instance, already fixed: FLUX schnell
rejects `width`/`height` ("Additional or unevaluated properties '/width, /height' at '/' not
allowed"), so the script now omits them for FLUX and crops the square result to 2:3 instead. The cover
then ships via Phase 7 (upload to blob, set `coverImage` to the public URL). For local preview
only you can point `coverImage` at the root-relative `/covers/<bookId>.webp` instead.

## Phase 3 — Write the manuscript (chapters)

Files: `Content/<bookId>/book.json` (reading order, `[{ "slug", "title" }]`) +
`Content/<bookId>/book/<slug>.md` (markdown body only — the title lives in `book.json`).
Paragraphs separated by blank lines; `_italics_` and `**bold**` render.

**Before writing a word, re-read the Distinctness Contract (Phase 0.5).** Do **not** open with — or
paraphrase — another book's first beat, and do **not** reuse its detective-method sentence. Each
book invents its own opening image and its own way of describing how the sleuth thinks. The
template below is a *spine*, not a script; vary it per axis 3.

Structure that works at any length:

1. **Hook + crime** (1–2 chapters) — establish the world, the victim/loss, the stakes.
2. **One spotlight per suspect** (a chapter or a distinct scene each) — this is where
   that suspect's domain, lever, and motive get planted. Every suspect must come out of
   their spotlight looking *possibly* guilty.
3. **Escalation / second pass** (1–3 chapters) — contradictions surface; plant the
   crumbs for pair endings (two suspects seen aligning) and the bigger-group endings.
4. **Final chapter — ends unresolved.** The detective gathers everyone (or stands at the
   threshold of the answer) and the chapter **stops before the accusation**. Do not print
   any URL or call-to-action in the prose — the site renders the book's `payoff` copy and
   the reveal button after the last chapter automatically.

**Plant clues as you write, and log them immediately** in
`docs/<bookId>/EndingClueMap.md` (Phase 5 format) with the **verbatim** passage. The
cross-reference pipeline matches exact substrings of the chapter text, so every later
prose edit risks breaking a clue — log exact quotes, and re-run the checker after any
edit. Aim for: every ending has ≥2 clues; every chapter after the hook carries at least
one clue; no clue gives the ending away on its own.

## Phase 4 — Write the endings

First finish `docs/<bookId>/EndingStyleGuide.md`:

- **Voice rules** matched to the audience and genre — but **start from the author's house voice**
  (the *Voice* default in `CLAUDE.md`) and tune it for *this* book's register, rather than
  inventing a voice from scratch. Most books just inherit the baseline (warm, plain-spoken, short
  punches, everyday analogies, humane narrator); write rules here only for where this book
  *deviates* (e.g. a noir clip, a period ledger's formality, a kid-book's extra-simple sentences).
- A **shared opening beat** — every ending of the book opens on the *same scene* (the moment
  the reveal is about to happen: the cast gathered, the object on the table, the sleuth about to
  speak). This keeps an ending's opening from hinting at its culprit and gives readers a
  recognizable beat. **But the wording must vary ending-to-ending** — write each ending's opening
  as a *variant* of that beat, not a copy-pasted block. No two endings in the book may share a
  byte-identical opening (near-variants are fine; exact clones are not, because a reader who meets
  the identical opening on their second reveal assumes they drew the same ending). Vary the small
  moves — time-of-day image, how the sleuth calls them in, which detail sits on the table, the
  first line spoken — while keeping the beat and the register constant.
- The **single shared `title`** used by every ending entry — it must never vary or hint.

Then for each row of your ending matrix:

1. Write `Content/<bookId>/endings/<slug>.md`: a *variant* of the shared opening beat (not a
   copy-paste — see above) → the accusation →
   the mechanism walked back through the planted clues → an emotional close. 600–1,000
   words (shorter for kid books). The reveal must *use* the planted clues — readers who
   spotted them should feel vindicated. **Honour the resolution-kind you assigned this ending in
   the matrix** (Phase 1) — an "accident" ending must actually cost something, a "reversal" must
   re-colour an earlier scene, a "misunderstanding" must land as *never-gone*. Do not let every
   ending collapse back into the same gentle "they harmlessly had it the whole time" beat, and do
   not reuse another book's reveal scaffolding (e.g. "stopped looking and started remembering — the
   truth, all of it except the very last bit").
2. Add the entry to `Content/<bookId>/endings.json`. Full field rules in
   `put_book_in_site.md` §2 — the load-bearing ones:
   - `code`: unique 4-char canonical (uppercase; `O` not `0`, `I` not `1`/`L`), and it
     must **never hint at the culprit** — unrelated letters/digits only.
   - `culprits`: exact names, consistent across endings (selection groups by this set;
     a spelling drift silently splits a combination into two).
   - `title`: the shared title, identical on every entry.
   - `special: true` only on the one special ending, if any.

The API throws at startup on duplicate normalized codes and on a category with no
weight — `dotnet run` is your validator.

## Phase 5 — Cross-references ("spot the clue")

Optional but expected for new books — this is the payoff for attentive readers. The data
is **generated**, never hand-written, from the two machine-parsed sections of
`docs/<bookId>/EndingClueMap.md`:

````markdown
## Clue Library

### Chapter 2 — <chapter title> — `/<bookId>/chapter-2`

- **C2-EXAMPLE** — “exact verbatim passage from the chapter…”
- **C2-OTHER** *(added crumb)* — “another verbatim passage”

## Marker placement (annotated reveal excerpts)

- **XXXX** `ending-slug` — "ending excerpt up to the reveal sentence [C2-EXAMPLE] … later excerpt [C2-OTHER]"
````

Format contract (what `scripts/gen-xrefs.cjs` parses):

- Clue IDs: uppercase letters/digits/hyphens; convention `C<chapter#>-<MNEMONIC>`.
- Clue Library quotes use **curly quotes** `“…”` and must be verbatim chapter text;
  non-contiguous fragments join with ` … ` (ellipsis with spaces).
- The chapter heading's backticked route ends in the chapter slug.
- Marker excerpts use **straight quotes** (escape inner ones as `\"`); each `[CLUE-ID]`
  glyph lands at the end of the verbatim run immediately before it.

Generate and validate (repo root):

```
node scripts/gen-xrefs.cjs <bookId>     # writes Content/<bookId>/clues.json + xref-markers.json
node scripts/check-xrefs.cjs <bookId>   # exact-match guard; run again after ANY prose edit
```

(`check-xrefs.cjs` with no argument validates every book that has xref data.)
Skipping this phase is fine — endings simply render without the binoculars glyphs.

### Glossary + shop shelf (optional, both data-only)

- **`glossary.json`** — sweep the manuscript + endings for period/trade/regional words a
  general reader won't know and define them in 1–2 plain, spoiler-free sentences (see
  `put_book_in_site.md` for the shape). The web underlines each term's first occurrence per
  chapter/ending with a hover-definition popover. Verify each term (and alias) actually appears
  in the prose, and avoid glossing a common word whose *other* meaning also appears — the
  first-occurrence underline would land on the wrong sense. Kid-friendly books usually need
  no file at all (the easy-reading rule already glosses in prose).
- **`shopItems`** in meta.json — 2–4 generic props from the story for the landing page's
  "From the story" Amazon shelf (label + in-world note + search phrase). Skip where forced.

## Phase 6 — Verify locally

Run both halves (`CLAUDE.md` Commands): `dotnet run` in `ai-mysteries-api/` (startup is
the schema validator — it throws on missing files, duplicate codes, unweighted
categories) and `npm run dev` in `ai-mysteries-web/`.

**Most of this is one command.** With the API up, run:

```
node scripts/verify-book.cjs <bookId>                        # add --api <baseUrl> for a non-default port
node scripts/book-stats.cjs  <bookId> --target <brief minutes>
```

`verify-book.cjs` asserts the whole mechanical checklist against the running API — book in the
catalog with a reading time, tags and a cover that loads; every chapter body resolving and the last
one ending the book; N random draws all distinct with no repeated culprit combination; a real code
round-tripping and a bogus one rejected; markers resolving to clues; the glossary endpoint. Don't
re-do these by hand or with ad-hoc `curl`/`node -e` — if a check is missing, add it to the script so
the next book gets it too.

Then the three things a script can't judge:

- [ ] **Eyes on it once in the browser** (`npm run dev`): the catalog card and landing page look
      right, the reader is pleasant to read, and a revealed ending renders with its binoculars glyphs
      and deep-links back into the manuscript.
- [ ] **Fair-play audit:** every ending's ≥2 clues really are in the chapters and really do
      foreshadow *that* mechanism. `check-xrefs.cjs` proves the quotes still match the prose; it
      cannot tell you a clue is a fair plant, so this one stays human.
- [ ] **Spoiler sweep:** no committed file mentions any code, slug+culprit pairing, or character
      name — and `git status` shows nothing book-specific staged.

`selection.specialEnding` rarity needs no test: it's a fixed 1-in-1000 offset, so a handful of draws
proving it *doesn't* appear tells you nothing. Just confirm the value is a fresh random 1–1000 (or
`0` for code-only). `verify-book.cjs` flags it as a note if a draw ever does hit the special.

## Phase 7 — Ship (turn-key, and not optional)

**This phase is mandatory unless the user told you to stop short.** A book that only exists
under `Content/` is unfinished — "done" means *live on the production site*. **The exact commands
(cover upload, seed, diff, the prod endpoints) live in `put_book_in_site.md` §4 — run them from
there; this is just the checklist.** From the repo root, after `az login`:

1. **Cover** — uploaded to the assets blob `covers` container as `<bookId>.webp`; `coverImage` in
   `meta.json` points at that public URL and it loads anonymously (`200 image/webp`).
2. **Seed + verify** — `seed` pushes the book and bumps the global version; `diff` must report in
   sync (`full-diff` for a deep check).
3. **No site push** — a new book is data-only (`Content/` + `public/covers/` are gitignored). Push
   only if the brief required a genuine generic UI/API change — the rare exception.
4. **Confirm live** — within one refresh poll (~60s) prod serves it with no restart/redeploy. One
   command does the whole confirmation, polling until the book appears rather than guessing a sleep:

   ```
   node scripts/verify-book.cjs <bookId> --api <prod base URL> --wait 90
   ```

   (The prod host is in the local runbook, not this repo.) This runs the same assertions as Phase 6
   against production, so "confirmed live" means catalog entry, chapters, random draws, a code
   round-trip and the public cover URL — not just that the title showed up.

---

## Reference (consult when needed — not part of the linear read)

### Worked parameter sheets (the example prompts)

**"Space station, 2218, advanced tech"** — adult; default length (8,000–9,000 words,
10 chapters); 5 suspects, each owning one station system; strong sentinel candidate:
the station AI / the corporation (its solo endings = `"sentinel"` category); special
ending candidate: someone outside the crew manifest entirely; weights like
`{"1": 45, "2": 25, "sentinel": 20, "5": 10}`.

**"Kid-friendly zoo mystery"** — middle-grade voice; nonviolent crime (a famous animal
vanishes); ~6,000 words at 160 wpm ≈ 35 min; 4 suspects (keeper, vet, vendor, rival
zoo's scout); no sentinel, no death; special ending candidate: the animal engineered its
own escape; weights `{"1": 60, "2": 30, "4": 10}`.

**"Western, under 15 minutes"** — ~3,000 words, 6 short chapters; 4 suspects; solos +
2–3 pairs only (no everyone-ending — too little room to seed it); weights
`{"1": 65, "2": 35}`; endings ~500 words each.

## Definition of done

The book is done when it is **live on the production site** and a stranger — using the real
public URL, not localhost — can land on `/`, pick the book, read it in roughly the promised
time, hit an ending, reveal three more without ever seeing the same culprit combination twice
in a row, spot at least one binoculars glyph per ending, and deep-link a clue back into the
manuscript. Concretely, all of these hold:

- the cover is generated, **uploaded to the assets blob**, and its public URL returns `200`;
- the book is **seeded to Cosmos** and `diff` reports in sync;
- the **prod** `/api/books` lists the book and one of its ending codes resolves against prod;
- the cover-art prompt is saved to `docs/<bookId>/CoverPrompt.md`;
- `git status` shows **nothing** book-specific staged or committed (book data + covers are
  gitignored) **and no leftover temp files** — any throwaway helper the build wrote (a registry
  splice script, a scratch row file) belongs in the OS temp dir, and is deleted as soon as it has
  run. A stray `scripts/.tmp-*.cjs` or `docs/.*.tmp` means the build isn't finished.

If the user explicitly asked to stop before shipping, "done" is the local equivalent (verified
on localhost) plus a clear note of the remaining ship steps. Otherwise, not-live is not-done.

## Final report (always end with a summary table)

When the book is done, close your reply with a one-row summary table so the key facts are at a
glance:

| Title | Read Time | Tags | SpecialEnding |
|---|---|---|---|
| <book title> | <the displayed reading time, e.g. ~10 min read> | <comma-separated tags> | <the `specialEnding` integer, or `0`/none for code-only> |

`Read Time` is the value the API derives from `wordCount` (what the catalog shows). `Tags` is the
final `tags` list. `SpecialEnding` is the book's `selection.specialEnding` offset (the 1-in-1000
position — see *Weighted random selection* in `CLAUDE.md`). This table is part of the report to
the user, not a committed file, so it's fine to state `specialEnding` here even though the
`selection` rules never ship in any API response.
