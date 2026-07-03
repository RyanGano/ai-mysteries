# CLAUDE.md — Within Tolerance Book Site

## Commands

Web (`ai-mysteries-web/`):

```
npm run dev       # start dev server (localhost:5173, or next free port)
npm run build     # prettier check + eslint check + tsc + vite build → dist/
npm run lint      # eslint --fix + prettier --write (auto-fix in place)
npm run preview   # preview the dist/ build locally
npx tsc -b        # type-check only (no emit)
```

API (`ai-mysteries-api/`):

```
dotnet run        # start the API (localhost:5180) — reads Content/ on disk (ContentSource=File)
dotnet build      # compile
```

Content pipeline — local files ⇄ Cosmos (`ai-mysteries-tools/`, run from the **repo root** after `az login`):

```
dotnet run --project ai-mysteries-tools -- sync      --endpoint <cosmos-uri>   # reconcile both ways by version
dotnet run --project ai-mysteries-tools -- seed      --endpoint <cosmos-uri>   # push newer local books → Cosmos (deploy data)
dotnet run --project ai-mysteries-tools -- pull      --endpoint <cosmos-uri>   # pull newer Cosmos books → local (recovery; --force for all)
dotnet run --project ai-mysteries-tools -- diff      --endpoint <cosmos-uri>   # compare versions, exit 1 on drift (default check)
dotnet run --project ai-mysteries-tools -- full-diff --endpoint <cosmos-uri>   # deep content compare, exit 1 on drift
dotnet run --project ai-mysteries-tools -- stats     --endpoint <cosmos-uri>   # per-book random-reveal counts (usage report)
```

Reconciliation is **version-based**: every book carries a `version` (a UTC timestamp on its
`meta.json` locally / the Cosmos manifest doc). The tool stamps a fresh version whenever a book's
content fingerprint stops matching the one recorded in `meta.json` (that's the "modified → bump the
version" rule, done from local files — no DB call), then reads just the per-book versions from
Cosmos (one lightweight manifest-only query, **not** every book's content) to decide per book:
local newer → push, Cosmos newer → pull, equal → skip. This keeps the request cost flat as books
are added. `diff` is the cheap default check; `full-diff` is the old field-by-field compare —
slower, but catches a version that was never bumped or a doc edited out of band.

`--endpoint` can also come from `COSMOS_ENDPOINT`; `--database`/`--container`/`--content` have
defaults (`books` / `content` / `ai-mysteries-api/Content`). The Tools project is
local-only and never deployed.

Cross-reference data (run from the **repo root**; each book's clue map lives at
`docs/<bookId>/EndingClueMap.md`):

```
node scripts/gen-xrefs.cjs [bookId]     # regenerate clues.json + xref-markers.json from the clue map (default within-tolerance)
node scripts/check-xrefs.cjs [bookId]   # validate the generated JSON against the manuscript (all books if omitted)
```

The web dev server points at the API via `VITE_API_BASE_URL` (defaults to `http://localhost:5180`
— see `ai-mysteries-web/.env.example`). Run the API and the web dev server together.

## Project purpose

Marketing + payoff site for the novel **Within Tolerance**. The book ends unresolved — the
final printed line is `www.therealending.com`. This site delivers the real, varied endings.

## Adding a book

**A request for a book means a book *live on the production site*.** When a user asks for a
new book ("I want a mystery set in…"), the default deliverable is the finished book serving from
the prod API — catalog entry, cover, readable chapters, working endings — not a folder of local
files or a localhost preview. Run the pipeline all the way through shipping (generate + upload
the cover, seed Cosmos, verify it's live) every time, unless the user explicitly says to stop
short ("just draft it locally"). Treat "create a book" and "put it on the site" as one request.

Two committed, spoiler-free playbooks at the repo root:

- **`create_new_book.md`** — start-to-finish: turn a one-line premise into a book **live on the
  site** (design the mystery, write chapters + weighted endings, plant clues, wire
  cross-references, verify, generate + upload the cover, seed Cosmos, confirm it's live). Start
  here when asked to *create* a new book.
- **`put_book_in_site.md`** — the underlying file contract (`meta.json`, `book.json`,
  `endings.json`, …) and the Cosmos seeding + go-live procedure. Reference for the mechanics.

**Distinctness is non-negotiable.** A new setting is not a new book. Before designing, read
**Phase 0.5 — The Distinctness Contract** in `create_new_book.md` and the registry of shipped books
(now in the gitignored `docs/book-registry.md`): every book must differ from every existing one on at
least three of **six** axes (mystery *type*, **setting/world**, detective *method*, chapter *spine*,
**resolution-kind spread across the endings**, and opening *voice*), and may never reuse another
book's opening or detective-method sentences. Lean on the roomy axes (setting, type, voice); the
playbook flags the crowding, over-used *method* ("reads a written record") and *spine*
("spotlight-per-suspect"). Reuse the engine (sentinel + special ending), never the story shape. Same rule of thumb as Tags below:
reuse where the meaning is genuinely close, but never clone — fragmenting the catalog into
near-duplicates is the failure mode.

### Tags

Tags appear on catalog cards and drive filtering. **Reuse an existing tag whenever the meaning
is close enough** — duplicate intent with different wording fragments the filter. Only add a new
tag if nothing in the list fits. Current canonical tags (as of 2026-07-01):

| Tag | When to use |
|---|---|
| `AI` | AI system is a character or central to the plot |
| `Cozy` | low-stakes, warm-toned, no violence |
| `Death` | a death occurs but murder is ambiguous or contested |
| `Haunted` | a haunting/ghost premise is central (real or staged) |
| `Kid Friendly` | suitable for young readers (simple vocabulary, no violence) |
| `Medical` | hospital/clinical setting or medical negligence is central |
| `Murder` | at least one suspect is a deliberate killer |
| `No Crime` | no crime has been committed — the mystery is a misunderstanding or loss |
| `Technology` | tech system or industrial setting is load-bearing to the plot |
| `Theft` | a genuine theft of a valuable object is the crime (a real culprit, not a misunderstanding) |
| `Wedding` | wedding or ceremony setting |
| `Western` | frontier/Western US historical setting |

When tagging a new book: check this list first. If a tag covers the intent (e.g. "Sci-Fi" →
`Technology`; "Children's" → `Kid Friendly`; "Thriller" → `Murder`), use the existing tag.
Add a new row only if the concept is genuinely distinct from every entry above, then update
this table and the description accordingly.

Deliberately **not** a tag: `Mystery`. Every book on the site is a whodunit with an
investigator, so the tag carries no filtering signal — don't re-add it.

## Architecture

**Two load-bearing principles:**

1. **No book-specific data or wording lives in the code — front end or API.** Title, tags,
   published date, word count (the API converts it to an estimated reading time), marketing summary, cover image,
   secret blurb, end-of-book payoff, share text, and the special-ending reveal copy all come from
   the API (`BookMeta`). React holds only generic,
   book-agnostic UI chrome — button verbs ("Reveal another ending →", "Continue reading →",
   "Contents"), loading/error text (including the rotating cold-start captions in
   `components/Loading.tsx`, which describe the *site* and its ending mechanic, never a specific
   book), the catalog tagline + footer disclaimers + privacy policy,
   and the "AI Mysteries" site brand in `index.html`. The API is equally
   book-blind: selection rules (category weights, sentinel culprit, special-ending cadence) are
   authored data (`selection` in meta.json), not constants in code. If a string or number
   describes a book, it belongs in the data.
2. **A new book is a data-only change — zero code, zero redeploy.** Author the book's content
   files locally and `ai-mysteries-tools seed` them into Cosmos; the API auto-discovers books by
   querying `manifest` docs, the landing renders whatever `GET /api/books` returns, and routing
   is generic (`/:bookId/…`). The one asset that could force a redeploy is the cover image, so
   `coverImage` is a **URL** (absolute for new books, e.g. Blob Storage; root-relative for the
   bundled one) the web uses directly as `<img src>` — never a bundled asset keyed by book.

Two projects:

- **`ai-mysteries-web/`** — React + Vite front end. Rendering only; holds **no** book data or
  wording (see principle 1). It fetches everything from the API through `src/lib/api.ts` (typed
  client) using the shapes in `src/lib/types.ts`. The API runs on a free tier that can cold-start
  for several seconds, so every route's loading state renders the shared `components/Loading.tsx`:
  a layout-matching skeleton (so content swaps in without a jolt) plus a caption that fades through
  a few lines onboarding the reader to the ending mechanic. The ending reveal flow
  (`FindEnding`/`Ending`) uses its `variant="ending"` — a centered draw, not a page skeleton, so it
  doesn't preview the reveal. All loading copy is generic, spoiler-free site chrome and honors
  `prefers-reduced-motion`.
- **`ai-mysteries-api/`** — .NET 10 minimal API. Owns the selection logic and serves content. It
  loads content at startup from a pluggable **`IBookSource`** (`Services/IBookSource.cs`) into an
  immutable `Book` per book, cached by `Services/BookStore.cs`. In Cosmos mode the cache is **not**
  permanent: `Services/BookRefreshService.cs` polls `IBookSource.GetVersion()` every
  `Content:RefreshIntervalSeconds` (default 60) — one cheap point read of a single global version
  doc (`_system`/`version`, see `VersionDoc` in `CosmosDocuments.cs`). When the value differs from
  what the cache was built on, `BookStore.Refresh()` does a full reload and atomically swaps the
  whole book index ("dirty everything"); otherwise it's a no-op, so steady state makes no
  per-request DB calls. This global `_system`/`version` doc is the API's reload trigger and is
  **separate** from the per-book `version` timestamps the Tools sync compares (those live on each
  manifest doc; the runtime API ignores them). The seeder bumps the global version **once, only
  when a sync/seed actually pushes a book** (each book is pushed only when its local version is
  newer than Cosmos's), so a new/edited book goes live within one poll interval with no API
  redeploy and an in-sync run never reloads. File mode is static (version constant), so no poller runs.
  Two sources, chosen by the `ContentSource` config key:
  - **`FileBookSource`** (`ContentSource=File`, dev/authoring default) — reads `Content/<bookId>/`
    on disk: `meta.json` (book-level `BookMeta` — title, summary, cover URL, secret blurb, payoff,
    share strings, special-reveal copy — plus the server-only `selection` rules and the sync
    pipeline's `version`/`contentHash` bookkeeping; all fields optional, defaults fill in); `book.json`
    (`[{ slug, title }]`, reading order) + `book/<slug>.md`; `endings.json`
    (`[{ code, culprits, title, special?, slug }]`) + `endings/<slug>.md`; `clues.json` +
    `xref-markers.json` (generated cross-reference data).
  - **`CosmosBookSource`** (`ContentSource=Cosmos`, prod) — reads the Cosmos `content` container
    (one doc per chapter/ending/clue/xref + a `manifest` that carries the book's `BookMeta` and its
    sync `version`, partition key `/bookId`). It also reads/writes a per-book `stats` doc — the
    runtime `readCount` (see the read-counter note under *Weighted random selection*) — the only
    document the API mutates. See `Services/CosmosDocuments.cs` for the document contract.

  The book data files under `Content/` are **gitignored** (not in the repo) — they are the local
  authoring source of truth, seeded into Cosmos by `ai-mysteries-tools`. The structure is
  book-agnostic; routing keys off `{bookId}` and each book is its own Cosmos partition.
- **`ai-mysteries-tools/`** — local-only console (`sync`/`seed`/`pull`/`diff`/`full-diff`/`stats`) that
  reconciles content between the on-disk files and Cosmos by per-book version (see the Commands
  section). Reuses the API's `FileBookSource`/`CosmosBookSource` so there is one storage contract.
  Never deployed.

API endpoints (all `GET`, JSON camelCase):

Book-level (registered at the app root in `Endpoints/BookEndpoints.cs`):

| Route | Returns |
|---|---|
| `/api/books`            | `[BookMeta]` — the catalog; drives the landing page |
| `/api/books/{bookId}`   | one book's `BookMeta` (404 if unknown); used by the reader/ending pages for title, payoff, share + special-reveal copy |

Per-book content (the `/api/books/{bookId}` group; routes below are relative to it):

| Route (`/api/books/{bookId}/…`) | Returns |
|---|---|
| `chapters`              | `[{ slug, title }]` table of contents |
| `chapters/{slug}`       | chapter body + prev/next neighbours (404 if unknown) |
| `endings/random?excludeCode=` | `{ code }` — weighted-random; excludes the given code's combo |
| `endings/{code}`        | the single ending + its markers + only the clues it references (404 if unknown) |
| `endings/{code}/exists` | `{ exists }` — lightweight check for the landing code input |
| `clues/{id}`            | a single clue, for the reader's deep-link highlight (404 if unknown) |

CORS (`Program.cs`) allows any origin listed in `Cors:AllowedOrigins`, plus — **in the
Development environment only** — any `localhost`/`127.0.0.1` origin (so local dev works
regardless of which port Vite lands on). Prod trusts only the deployed front end. To run the
local UI against the prod API, don't fight CORS — set `VITE_PROXY_TARGET` (see
`ai-mysteries-web/.env.example`) so the Vite dev server proxies `/api` to prod same-origin.

Rate limits (`Program.cs`): per-IP, 300 req/min across the API and 30 req/min on the
`endings/*` routes (random/exists/by-code) to deter ending-code enumeration. Real client IPs
come from `X-Forwarded-For` (rightmost entry) via the forwarded-headers middleware, since the
API sits behind the App Service front end. Over-limit requests get `429`.

## How the ending mechanic works

- Routes are book-scoped: `/:bookId` (the book's **landing page** — cover, blurb, reading time, a
  "Start reading" link and a "Share this story" button; this is the **share target** so a recipient
  meets the story before reading, and is reached by the book-title link in the reader/ending or by
  sharing, **not** by the catalog card),
  `/:bookId/:slug` (a chapter; clicking a catalog card deep-links here straight to the first
  chapter's slug, bypassing the landing page — the slug comes from `BookMeta.firstChapterSlug`),
  `/:bookId/ending` (picks a weighted-random code, redirects replace), and
  `/:bookId/ending/:code` (permanent page — always the same ending for that code). The reader's
  Endings drawer carries the code-entry + reveal-ending controls. Both the chapter reader and the
  ending page show the book title (linking back to the landing page) and a Share control; the
  ending page offers **Share this ending** (the code URL) and **Share this story** (the landing
  URL) separately. `/` is the data-driven catalog listing every book (title, tags, reading time,
  published date); `/privacy` is the static privacy policy. A site-wide `Footer` (AI-authorship +
  fiction disclaimers, privacy link) renders on every route. See `ai-mysteries-web/src/App.tsx`.
- Codes are 4-char uppercase. `O/0` and `I/1/L` are interchangeable on input (normalized).
- Deep links work via SPA fallback in `ai-mysteries-web/staticwebapp.config.json`.

### Weighted random selection

Selection runs **server-side** and is fully generic — the algorithm lives in
`ai-mysteries-api/Services/EndingSelector.cs`, but every book-specific input comes from the
book's **selection rules**, authored as the `selection` key of its `meta.json` (carried on the
Cosmos manifest doc, held in the server-only `SelectionRules` record, and **never exposed by
any endpoint** — the rules themselves are spoilers):

```json
"selection": {
  "sentinelCulprit": "<culprit value whose solo endings form their own category>",
  "categoryWeights": { "1": 45, "2": 30, "sentinel": 25 },
  "specialEnding": 734
}
```

- An ending's **category** is its `culprits` set size as a string (`"1"`, `"2"`, …); a solo
  ending by the `sentinelCulprit` gets the dedicated `"sentinel"` category instead.
- Three stages: pick a category by `categoryWeights` (relative weights among the categories
  present), pick a culprit combination uniformly within it, pick uniformly among that
  combination's endings. Picking the combo before the ending keeps every combination equally
  likely regardless of how many endings it has.
- `specialEnding` (a per-book integer, 1–1000) is a **guaranteed 1-in-1000 offset**, not a
  probability: the API keeps a per-book **read counter** (`readCount`) that increments on every
  *random* reveal (`endings/random`, including "reveal another"), and short-circuits to the book's
  `special: true` ending whenever `readCount % 1000 == specialEnding`. So with `specialEnding: 246`,
  the special ending is the 246th, 1246th, 2246th… random reveal — exactly one in every 1000, at a
  fixed (randomly-chosen, per-book) position rather than a probability that might never land.
  (`1000` maps to the block boundary: reveals 1000, 2000, ….) A specific code fetched via
  `endings/{code}` (a shared link) is **not** a random reveal and never moves the counter.
  `0`/omitted means the special ending is reachable only by entering its code. The 1000-reveal
  period is the constant `SpecialEndingPeriod` in `BookStore`. (This replaced the old probabilistic
  `specialEndingOdds` roll; `readCount` also doubles as a per-book usage signal.)
- A book with no `selection` key gets uniform category odds and no special cadence.
- `BookStore.Build` validates at startup that authored weights give a positive weight to every
  category the book's endings actually use.

#### The read counter (`readCount`) and persistence

`readCount` is the **one piece of book state mutated at runtime**, so it lives apart from the
authored, synced content:

- The API holds a live per-book count in memory (`BookStore`), increments it on each random reveal,
  and **writes the new count through to the store on that same request** (awaited in
  `PickRandomCodeAsync`), so every increment is durable immediately. On startup the counts are
  re-seeded from the store so counting resumes across restarts. (Write-through, not a background
  timer: the App Service **free tier throttles an idle app's CPU**, so a periodic flush didn't fire
  reliably between visits and lost the last reveals of a quiet period — which both undercounted and
  weakened the 1-in-1000 guarantee. A persistence failure is logged and swallowed; the in-memory
  count still advances and the next reveal re-writes it, so the store self-heals.)
- In Cosmos mode the count persists in a dedicated per-book **`stats` doc** (`type: "stats"`, one
  per `/bookId` partition), written by `CosmosBookSource` (which implements `IReadCountStore`). It
  is **deliberately not** part of the manifest, the content fingerprint, or the sync — the seeder
  never emits it and `Push` never deletes it, so re-seeding a book's content never resets the
  count. The API's stats writes never bump the global content version, so they don't trigger a
  reload. (This is why the API's managed identity now needs Cosmos **write** access — see Deployment.)
- File mode (dev) has no `IReadCountStore`, so counts live only in memory for the process.
- Run `ai-mysteries-tools stats` (from the repo root, after `az login`) for a per-book report of
  the cadence and how many random reveals each book has served.

### "Reveal another ending" exclusion rule

When a reader clicks **Reveal another ending**, the next pick excludes any ending that shares
the same culprit combination as the one currently displayed. For example, if you're reading an
ending where suspect A acted alone you won't see another A-solo ending; if you're reading an
A+B pair you won't see another A+B ending. Endings that merely _include_ A or B in a different
combination are still eligible.

This is enforced by `EndingSelector.PickCode(book, excludeCode, …)` in
`ai-mysteries-api/Services/EndingSelector.cs` — the client passes the currently displayed
**code** to `endings/random?excludeCode=`, and the server derives its combo key (sorted
culprit names joined by ` & `) and excludes that whole combo. It applies automatically to
every ending, including newly added ones. No extra steps needed when authoring an ending.

## How to add an ending

1. Write `ai-mysteries-api/Content/within-tolerance/endings/<slug>.md` in the book's voice
   (see style guide below).
2. Every ending must open on the book's **same reveal beat** — the scene where the accusation is
   about to land (the cast gathered, the object on the table, the sleuth about to speak). This is
   a **recognizable opening beat, not a verbatim block**: every ending's opening must be a *variant*
   — reword the sentences so no two endings in a book share a byte-identical opening (near-variants
   are fine; exact clones are not, because a reader who sees the same opening twice thinks they got
   the same ending). The opening must still never hint at the culprit. See any existing ending in
   `Content/within-tolerance/endings/` (or `docs/within-tolerance/EndingStyleGuide.md`) for the beat
   — both local-only. Never reproduce that text in a committed file.
3. Add an entry to `ai-mysteries-api/Content/within-tolerance/endings.json` (`slug` links the
   entry to the `.md` file you just wrote):
   ```json
   { "code": "XXXX", "culprits": ["Name"], "title": "<copy from an existing entry>", "slug": "my-ending" }
   ```
   `culprits` lists everyone responsible — one name for a single, several for a combination,
   every suspect for the all-of-them category, or the book's sentinel culprit (see the
   `selection` rules in the book's `meta.json`). The `title` is identical for every ending —
   copy it from any existing entry in `endings.json`; it must never vary or hint at the
   culprit(s).
4. Use a unique canonical 4-char code. Canonical = uppercase, `O` not `0`, `I` not `1`/`L`.
   **Do not let the code hint at the culprit** — pick unrelated letters/digits. Never quote a
   real, registered code in a committed file (docs, comments, examples).
5. Restart the API (`dotnet run`) — `BookStore` throws on a duplicate normalized code at startup.
6. (Optional) Wire up the ending's **cross-references** (the in-ending "spot the clue"
   binoculars). See *Cross-references* below — this is driven entirely from
   `docs/within-tolerance/EndingClueMap.md`, never by editing the ending `.md`.

## Cross-references (in-ending "spot the clue")

Endings render a small binoculars glyph at each reveal; hovering/clicking shows the
foreshadowing manuscript passage and deep-links to it (`/<bookId>/<slug>?clue=<ID>`). The data
is **generated** per book from `docs/<bookId>/EndingClueMap.md` (gitignored) into two artifacts
under `ai-mysteries-api/Content/<bookId>/` (gitignored with the rest of the book data; they
reach prod via the Tools seeder):

- `clues.json` — from the **Clue Library** section (clue id → chapter + the verbatim
  passage(s) to show).
- `xref-markers.json` — from the **Marker placement (annotated reveal excerpts)** section
  (ending code → resolved glyph offsets).

The API ships, with each ending, only that ending's markers and the clues those markers
reference (built in `Models/Book.cs`). To add/update cross-references for an ending: edit
those two sections of the book's `EndingClueMap.md` (add a clue to the Clue Library if new; add
the ending's annotated excerpt with `[CLUE-ID]` markers to the Marker-placement section), then
run `node scripts/gen-xrefs.cjs <bookId>` (from the repo root).
`node scripts/check-xrefs.cjs` fails if a marker drifted off its anchor or a clue passage no
longer matches the manuscript. Web runtime lives in `src/lib/remark-xref.ts`,
`src/components/XrefMarker.tsx` (reads clue data from `CluesContext`, supplied by `Prose`), and
`src/styles/xref.css`; the deep-link highlight is in `src/routes/Read.tsx`. See
`docs/cross_reference.md` for the full design.

## Voice and style guide

Each book has its own style guide at `docs/<bookId>/EndingStyleGuide.md` — local-only, not
committed (see `docs/` in `.gitignore`). It carries the register, the recurring motifs, the
hard "never do" rules, and the mandatory shared opening. **Read it (plus a few existing
endings) before writing a new ending** — and don't reproduce its specifics in this file or
anything else committed.

**Kid-friendly or no-murder books read easy, not just clean.** When a book targets younger
readers or simply has no death, the *reading level* drops too: short phonetic names that a
child decodes at a glance and stay distinct from one another (Lena Park, Bo Hale — not
Sorokin or Lindqvist, and never a near-homophone pair like Vale/Vane), plain words over
jargon (list not *manifest*, inspector not *proctor*, cooling pipe not *coolant manifold*,
"within limits" not *within parameters*), and the longest sentences broken up. Keep any
real idea a clue depends on (condensation, freeze-thaw) but gloss it in plain words the
first time. A load-bearing theme word may stay (e.g. *non-essential mass*) if the prose
around it explains it plainly. See `create_new_book.md` Phase 0 for the fuller checklist.

### Voice: the author's house voice by default

**Lean toward the author's (Ryan's) house voice unless the story genuinely calls for a different
one** — the same default-with-exception shape as en-US spelling below. The house voice is warm,
plain-spoken, and conversational: short common words (anything technical glossed in kitchen-table
language the first time), contractions, varied rhythm with deliberate short-sentence punches,
everyday analogies *walked through*, gentle and usually self-aware humor, and a humane narrator
who is clear without ever showing off or lecturing. It is captured — with fiction vs. nonfiction
modes and approved exemplars — in
[`.claude/skills/write-in-my-voice/voice-profile.md`](.claude/skills/write-in-my-voice/voice-profile.md).
Use the **write-in-my-voice** skill to draft/rewrite and **check-my-voice** to score a draft
(aim ~80%+).

**This is *texture*, not *sameness* — and it does not override the Distinctness Contract.** The
house voice is the connective *feel* under every book (clarity, warmth, rhythm); it is **not** the
per-book *opening voice*, register, or motifs, which must still **vary** book to book per Phase 0.5
of `create_new_book.md` (and may never reuse another book's opening or detective-method sentences).
Think of it like a familiar author writing across genres: a reader senses the same hand at work,
but a cozy, a kid-friendly aquarium romp, and a tense locked-room each still open in their own
register. Default to the house voice as the baseline; vary the surface deliberately for distinctness.

**The exception (deliberate, like in-world UK spelling):** when a story's genre or register truly
needs a different voice — a hard-boiled noir narrator, a formal period ledger, a clinical/technical
voice doing characterization — deviate on purpose and keep it consistent. Absent that real call,
default to the house voice. (Note: the house voice's plain-spoken warmth is an especially natural
fit for the cozy / kid-friendly / all-ages books — it pairs cleanly with the easy-reading rule
above.)

### Spelling: American English (en-US) by default

**Every book uses American (en-US) spelling** — manuscript, endings, and all `meta.json` copy.
Write *color*, *gray*, *theater*, *realize*, *recognize*, *traveled*, *defense*, *toward*, *aluminum*
— never *colour*, *grey*, *theatre*, *realise*, *travelled*, *defence*, *aluminium*. This covers the
usual UK→US classes: `-our`→`-or`, `-re`→`-er`, `-ise/-yse`→`-ize/-yze`, doubled `-ll-`→single
(*travelled*→*traveled*), `-ence`→`-ense` (*defence*→*defense*), and one-offs (*grey/mould/smoulder/
draught/kerb/storey/cheque/pyjamas/sceptic/sulphur/artefact* → *gray/mold/smolder/draft/curb/story/
check/pajamas/skeptic/sulfur/artifact*).

**The only exception is deliberate, in-world diction**: a book explicitly set in a place where British
spelling is the natural register (a story set in London, a 1920s Scottish lighthouse keeper's own
written ledger, etc.) may use UK spelling *where it's doing characterization work* — and even then,
keep it intentional and consistent, not accidental. Absent that, default to en-US everywhere.

**No sexual or sex-related content in any book — manuscript or endings.** This applies to
every book on the site regardless of audience. Romance is fine at the level of *kissing,
dating, hugging, holding hands* — keep it there. Anything beyond that (explicit or implied
sexual activity, sexual description, innuendo as a plot element) is out of scope: **do not
write it without asking the user first.** If a premise seems to call for it, stop and
confirm before authoring rather than including it.

## Character reference

The character bible — a `.docx` in `source_materials/`, local-only, never committed. Contains
full character details for all suspects. Use it when writing new endings.

## Spoiler rules

The repo is **public**. Treat every committed file as reader-visible.

- **Never** build a public index of endings or codes.
- No committed file (including this one, code comments, and docs) may contain real ending
  codes, ending slugs paired with culprits, character/suspect names, category names, verbatim
  book text, or revealing source-material filenames. Use placeholders (`XXXX`, "suspect A") in
  examples; the real details live only in gitignored files (`Content/`, `docs/`,
  `source_materials/`).
- The client no longer holds the full registry. The API returns one ending at a time
  (`endings/{code}`) and runs selection server-side, so the browser never receives the list of
  all codes/culprits. Keep it that way — don't add an endpoint or payload that returns many
  endings at once.
- The site is `noindex` via `ai-mysteries-web/staticwebapp.config.json` global headers and `ai-mysteries-web/public/robots.txt`.
- Do not log or display which code a user landed on in any analytics or public-facing context.
- Cross-references are per-ending and point only *backward* into the manuscript. Never add a
  UI (or API) that lists clues across endings. The API ships only the displayed ending's own
  markers + referenced clues; the analytical `EndingClueMap.md` (culprit attributions, gap
  notes) stays gitignored.

## Deployment (Azure Static Web Apps)

- Hosting: Azure Static Web Apps (Free tier).
- The `staticwebapp.config.json` handles SPA fallback and `noindex` headers.
- Build output is `ai-mysteries-web/dist/`. App location is `ai-mysteries-web`.
- Azure GitHub Actions workflow auto-deploys on push to `main`.
- Domain to configure: `therealending.com` (printed in the book — register this first).

### API deployment (App Service + Cosmos)

The API deploys to **Azure App Service (Free F1, Linux)**, separate from the SWA front end, and
reads content from **Azure Cosmos DB (NoSQL)** — a `books` database + `content` container
(partition key `/bookId`) living in a shared free-tier account. One-time infra (the database +
container, the F1 web app, its managed identity, and Cosmos RBAC scoped to `/dbs/books`) is
scripted in [`infra/azure-setup.ps1`](infra/azure-setup.ps1).

- **Auth is passwordless** — the web app's system-assigned **managed identity** holds a tight
  **custom Cosmos role** (`Books Counter Writer`: read + query + **upsert**, *no delete*), scoped
  to just the `content` container. It needs write because the API persists each book's runtime
  `readCount` to a per-book `stats` doc (see the read-counter note under *Weighted random
  selection*), but it must never be able to delete or corrupt book content. The API connects with
  `DefaultAzureCredential` + the account endpoint URL (config `Cosmos:Endpoint`, not a secret). No
  keys, **no Key Vault**. You separately hold *Data Contributor* on `/dbs/books` so the local Tools
  seeder can write **and delete** stale docs. Both role assignments are scripted in
  `infra/azure-setup.ps1`.
- **Deploy**: `.github/workflows/api.yml` publishes self-contained (`-r linux-x64
  --self-contained`, so F1 needs no preinstalled .NET 10 runtime) and pushes via publish
  profile. Repo secrets: `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_PUBLISH_PROFILE`. The artifact
  carries no book data (`Content/` is gitignored; `-p:PublishBookContent=false` also drops it).
- **App settings (prod)**: `ContentSource=Cosmos`, `Cosmos__Endpoint/Database/Container`,
  `Cors__AllowedOrigins__0=<SWA origin>` (locks CORS to the front end; localhost stays
  dev-only). Then set the SWA's `VITE_API_BASE_URL` to the web app URL and redeploy the front end.
- **Data flow**: edit content locally → `ai-mysteries-tools seed` (or `sync`) stamps the changed
  book's version and pushes it to Cosmos → `diff` proves per-book parity before deploy (`full-diff`
  for a deep check). Order the first time: run `infra/azure-setup.ps1` → `seed` → deploy API → set
  `VITE_API_BASE_URL`.

## source_materials/ policy

`source_materials/` is in `.gitignore` and **must never be committed**. It contains the
manuscript, cover art, character bible, and final-scene art — local reference only.
