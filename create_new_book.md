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
that a stranger can open `therealending.com`, see the new book in the catalog, read it, and
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
- If `Content/within-tolerance/` exists locally, skim it as the reference
  implementation (structure, tone of `meta.json` copy, ending shape). Never copy its text.
- **No sexual or sex-related content** in the manuscript or any ending (every book, every
  audience). Romance stays at kissing / dating / hugging / holding hands; anything beyond
  that you do **not** write without asking the user first. See *Content boundaries* in
  `CLAUDE.md`.
- **Write American (en-US) spelling** throughout — manuscript, endings, and `meta.json` copy
  (*color/gray/theater/realize/traveled/defense*, never *colour/grey/theatre/realise/travelled/
  defence*). The **only** exception is a book deliberately set somewhere British spelling is the
  natural in-world register (a London setting, a Scottish keeper's own ledger) — and even then,
  keep it intentional and consistent. Absent that, default to en-US. See *Spelling* in `CLAUDE.md`.

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

Convert reading time to a word budget: ~230 words/min for adults, ~160 words/min for
middle-grade readers. The budget covers the **manuscript only** (chapters); each ending
adds ~600–1,000 words on top but readers only see one at a time.

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
five axes** — and may never reuse another book's opening sentences or its detective-method sentence
verbatim. Check your design against the registry below *before* writing prose.

1. **Mystery type** — what actually happened. Don't default to "an object is lost." Menu: a thing
   is **lost** / **damaged or changed** / **swapped** / an **impossible event** / **a person is
   behaving strangely** / **sabotage that wasn't** / **a kindness misread** / **a thing that was
   never gone**. Pick one not already over-used.
2. **Detective archetype + method** — *how* they solve it. The "goes still and remembers" voice is
   **used up — do not reuse it.** Vary the method: maps or **draws** the scene; **talks** people
   into contradicting themselves; **re-enacts** the event physically; reasons from a **written
   list**; deduces from the **senses** (taste, smell, sound, temperature); is a **skeptic** out to
   debunk.
3. **Chapter architecture** — the spine. Not always *empty-X → one spotlight per suspect → second
   pass → ticking-clock finale.* Alternatives: reverse chronology; two interleaved timelines; the
   detective is also a suspect; a leisurely unspool with no clock; a frame story.
4. **Resolution-type spread across the endings** — *the most important one.* A book's endings must
   **not all resolve the same way.** Across the matrix, include a **mix of resolution kinds**: at
   least one **accident / real consequence**, one **deliberate act with a motive**, one **genuine
   misunderstanding / it was never gone**, and one **reversal that re-colours an earlier scene**.
   An all-"benign person harmlessly had it, nothing harmed, nobody unkind" matrix is the failure
   mode — kill it. (Kid-friendly books may stay **ultimately reassuring**, but the *cause* and the
   *path* must still vary: a real near-loss that's recovered, a deliberate hide, a swap, a thing
   tucked away as a surprise, a thing that was never lost.)
5. **Voice register + opening beat** — invent this book's own first beat. **Banned because it's
   been lifted before:** "made a small sound," "the way you pat a pocket the second time — faster,
   both hands," "her chin began to crumple," "the room was getting loud, so she went very quiet and
   started to think," and a bare "N minutes/hours until …" countdown. Write a fresh opening.

### Registry of shipped books (differ from these)

Spoiler-free structural fingerprints — **no codes, culprits, or special-ending identities.** Add a
row each time you ship; consult it each time you design. Two books may share at most two axes.

| Book | Mystery type | Detective method | Structure spine |
|---|---|---|---|
| within-tolerance | death — how/why | methodical procedural, timeline reconstruction | scene → system explainer → suspect-per-chapter → "the gap" |
| non-essential-mass | a keepsake **damaged**, no one admits it | inspector works the **systems/records** | systems tour → night-shift reconstruction |
| standard-of-care | a death from **diffuse causation** (each did an ordinary thing) | takes the "machine" apart, fault-tree | one spotlight per link in the chain |
| first-in-right | a death amid a **resource war** (drought/water rights) | outside company investigator, follows the money/right | spotlight per claimant → the night |
| something-borrowed | a small thing **lost** at a ceremony | calm teacher, recovers small things by routine | one spotlight per helper → the hour-before finale |
| mate-for-life | **is the staged crime real?** (game-within-a-game) | guests interrogate **each other**, no lone sleuth | ensemble cross-examination → high water |
| wheres-sunny | a live animal **gone** from its pen | trainer-kid who knows the animal's habits | habit-led search of the grounds |
| siege-perilous | an **impossible/locked-room** death (cursed seat) | court official, physical locked-room logic | examine seat → cup → vigil reconstruction |
| holloway-house | **is the haunting real?** (staged vs. genuine) | hired **skeptic** out to debunk | sit the house overnight → the small hours |
| field-trip | a small thing **lost** on a journey | kid who **draws/maps** the journey to reconstruct it | map the trip → red-herring duplicate → the gate |
| lighthouse-ledger | a person **vanished**, ledger as evidence | relief keeper reads the **record** left behind | the relief → reckonings → last entry |
| sourdough-starter | a living thing **seemingly ruined/changed** (not lost) | neighbour deduces from the **senses** (smell/taste/temp) + a list | what-happened post-mortem, sense by sense |
| cabin-pressure | a death **mid-flight, sealed cabin** (locked-room) | cabin crew lead works **witness stories that lean** | who-sat-where → contradicting accounts → descent |

If your design's row would duplicate three+ axes of any row above, change the design — not the
paint. (When two books legitimately share the engine's *mechanic* — a non-human **sentinel**
culprit and a rare **special** ending — that's fine; the engine is shared on purpose. It's the
*story shape* above that must differ.)

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
- **`EndingStyleGuide.md`** — the book's voice rules and its **mandatory shared opening**
  (see Phase 4).
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
5. **Special ending — at most one, optional.** `special: true` + `specialEnding`
   (a per-book integer 1–1000, e.g. `246`) makes it a rare jackpot with the `specialReveal`
   overlay. `specialEnding` is a **guaranteed 1-in-1000 offset**, not a probability: the API tracks
   a per-book `readCount` over random reveals and surfaces the special ending when
   `readCount % 1000 == specialEnding` — so it lands on the Nth, (1000+N)th, (2000+N)th… reveal,
   exactly once per 1000. Pick a fresh **random** value 1–1000 for each new book.
   Good candidates break the game's own frame — a culprit no reader would consider in scope.
   `specialEnding` `0`/omitted = reachable only by typing its code.

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

Pick `specialEnding` as a **fresh random integer 1–1000** for each new book (it sets *which* draw
in each block of 1000 lands on the special ending — `readCount % 1000 == specialEnding`, so always
exactly one per 1000 reveals). Don't copy another book's value.

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
node scripts/gen-cover.cjs <bookId> --model sdxl # fallback if FLUX is quota-limited
```

It calls **Cloudflare Workers AI** (free daily quota, no per-image cost; creds in a gitignored
`.env` — `CF_ACCOUNT_ID`/`CF_API_TOKEN`), crops/encodes to the house-style **2:3 / 1024×1536 /
webp**, and writes `ai-mysteries-web/public/covers/<bookId>.webp`. Re-run with `--seed N` to
get a different composition; show the user the result and regenerate until it lands. The cover
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

- **Voice rules** matched to the audience and genre.
- A **mandatory shared opening** — every ending of the book starts with the *same* one or
  two paragraphs (the scene where the reveal is about to happen). This prevents an
  ending's opening from hinting at its culprit and gives readers a recognizable beat.
- The **single shared `title`** used by every ending entry — it must never vary or hint.

Then for each row of your ending matrix:

1. Write `Content/<bookId>/endings/<slug>.md`: shared opening verbatim → the accusation →
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

## Phase 6 — Verify locally

Run both halves (`CLAUDE.md` Commands): `dotnet run` in `ai-mysteries-api/` (startup is
the schema validator — it throws on missing files, duplicate codes, unweighted
categories) and `npm run dev` in `ai-mysteries-web/`.

Checklist — all of `put_book_in_site.md` §3, plus the authoring-quality checks:

- [ ] Landing page lists the new book; cover URL actually loads.
- [ ] Full read-through at the target pace — does the length match the brief?
- [ ] Last chapter shows the payoff copy; its CTA reveals an ending.
- [ ] **Special ending is rare.** Confirm in the `selection` rules that `specialEnding`
      is set to a random integer 1–1000 (or `0` for code-only), then hit
      `GET /api/books/<bookId>/endings/random` a handful of times — the special ending should not
      turn up (you'd have to draw `specialEnding` times to see it). No exhaustive tally; a
      spot-check is enough.
- [ ] **Random draws vary.** Reveal an ending, then "Reveal another ending" a few times —
      each draw should be a different ending and never repeat the current culprit combination.
- [ ] **Code round-trips.** Take one ending you got at random, enter its code on the landing
      input, and confirm you land on that same ending; a made-up code is rejected.
- [ ] Xref glyphs appear in endings, hover shows the chapter passage, and the deep link
      highlights it in the reader.
- [ ] Fair-play audit: for each ending, confirm its ≥2 clues exist in the chapters and
      that no committed file mentions any code, slug+culprit pairing, or character name.

## Phase 7 — Ship (turn-key, and not optional)

**This phase is mandatory unless the user told you to stop short.** A book that only exists
under `Content/` is unfinished — "done" means *live on the production site*. Shipping is
automated end-to-end. After generating the cover (Phase 2 — `gen-cover.cjs`), the agent runs
the rest from the repo root (after `az login`); see `put_book_in_site.md` §4 for the exact
commands:

1. **Upload the cover** (`ai-mysteries-web/public/covers/<bookId>.webp`) to the assets
   blob account's `covers` container as `<bookId>.webp`, and confirm `coverImage` in
   `meta.json` points at that public URL.
2. **Seed** Cosmos (`ai-mysteries-tools -- seed --endpoint <cosmos-uri>`) — it stamps the book's
   `version` and pushes it (a new book is always newer than the empty Cosmos copy).
3. **Verify** parity (`-- diff` — cheap per-book version check, must report in sync; `-- full-diff`
   for a deep field-by-field check).
4. **Push site updates** — normally **none**: a new book is data-only, and `Content/` +
   `public/covers/` are gitignored. Only push if the brief required a genuine UI/API
   change (a new generic field, new chrome) — that's the rare exception, not the rule.
5. **Confirm it's live.** The prod API picks the book up within one refresh poll (~60s) — no
   App Service restart, no front-end or API redeploy. Poll the prod API's `/api/books` until
   the new title appears, resolve one ending code against prod, and check the public cover URL
   returns `200 image/webp`. Only then is the task done. (The prod API host and the assets blob
   account are subscription-specific — kept out of this public file; the agent has them.)

The prod API picks the book up within one refresh poll (~60s) — no App Service restart,
no front-end or API redeploy.

---

## Worked parameter sheets (the example prompts)

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
  gitignored).

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
