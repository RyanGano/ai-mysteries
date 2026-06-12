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

**Ground rules before anything else** (see *Spoiler rules* in `CLAUDE.md`):

- Everything you author lives in **gitignored** locations: book data in
  `ai-mysteries-api/Content/<bookId>/`, design/spoiler docs in `docs/<bookId>/`.
  **Never commit book content, codes, culprits, clue maps, or character details.**
- Adding a book is **data-only** — zero code edits, zero redeploy. If you find yourself
  editing React or C# to make a book work, stop: the thing you're hardcoding belongs in
  `meta.json` or the content files.
- If `Content/within-tolerance/` exists locally, skim it as the reference
  implementation (structure, tone of `meta.json` copy, ending shape). Never copy its text.

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
5. **Special ending — at most one, optional.** `special: true` + `specialEndingOdds`
   (e.g. `0.001`) makes it a rare jackpot with the `specialReveal` overlay. Good
   candidates break the game's own frame — a culprit no reader would consider in scope.
   Odds `0`/omitted = reachable only by typing its code.

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
  "specialEndingOdds": 0.001
}
```

With a sentinel culprit, carve its share out explicitly, keeping `"1"` dominant:

```json
"selection": {
  "sentinelCulprit": "<the non-human culprit's exact name as used in culprits>",
  "categoryWeights": { "1": 45, "2": 25, "sentinel": 20, "5": 10 },
  "specialEndingOdds": 0.001
}
```

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
   spotted them should feel vindicated.
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
- [ ] "Reveal another ending" never repeats the current culprit combination.
- [ ] Every ending's code resolves via the landing input; a made-up code is rejected.
- [ ] Xref glyphs appear in endings, hover shows the chapter passage, and the deep link
      highlights it in the reader.
- [ ] Weighting sanity: hit `GET /api/books/<bookId>/endings/random` ~200 times and tally
      codes — solo endings should clearly dominate. **Keep the tally local; it's a
      spoiler artifact.**
- [ ] Special ending appears only by code entry (or at its configured odds).
- [ ] Fair-play audit: for each ending, confirm its ≥2 clues exist in the chapters and
      that no committed file mentions any code, slug+culprit pairing, or character name.

## Phase 7 — Ship (turn-key)

Shipping is automated end-to-end. After generating the cover (Phase 2 — `gen-cover.cjs`),
the agent runs the rest from the repo root (after `az login`); see `put_book_in_site.md`
§4 for the exact commands:

1. **Upload the cover** (`ai-mysteries-web/public/covers/<bookId>.webp`) to the assets
   blob account's `covers` container as `<bookId>.webp`, and confirm `coverImage` in
   `meta.json` points at that public URL.
2. **Seed** Cosmos (`ai-mysteries-tools -- seed --endpoint <cosmos-uri>`).
3. **Verify** parity (`-- diff` — must report in sync).
4. **Push site updates** — normally **none**: a new book is data-only, and `Content/` +
   `public/covers/` are gitignored. Only push if the brief required a genuine UI/API
   change (a new generic field, new chrome) — that's the rare exception, not the rule.

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

The book is done when: a stranger can land on `/`, pick the book, read it in roughly the
promised time, hit an ending, reveal three more without ever seeing the same culprit
combination twice in a row, spot at least one binoculars glyph per ending, deep-link a
clue back into the manuscript — the **cover-art prompt is written** to
`docs/<bookId>/CoverPrompt.md` and handed to the user (with size + wiring instructions) —
and `git status` shows **nothing** book-specific staged or committed.
