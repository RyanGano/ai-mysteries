# Put a book in the site

> Writing a brand-new book from a premise (story, endings, clues and all)? Start with
> `create_new_book.md` — the start-to-finish playbook. This doc is the **file contract +
> seeding reference** it builds on.

Agent playbook for adding a **new book** to the site. By design this is a
**data-only change** — no code edits, no web/API redeploy (see the architecture
principles in `CLAUDE.md`). The API auto-discovers books from Cosmos, the landing
page renders whatever `GET /api/books` returns, and routing is generic
(`/:bookId/…`).

**"Add a book" means add it to the *live* site.** The job isn't finished when the files exist
under `Content/` or even when it works on localhost — it's finished when the book is seeded to
Cosmos and serving from the production API (§4). Run §4 every time unless the user explicitly
says not to ship.

Everything below happens locally under `ai-mysteries-api/Content/` (gitignored —
**never commit book data**) and is then seeded into Cosmos.

## 1. Pick a `bookId`

A kebab-case slug, e.g. `within-tolerance`. It becomes:

- the content folder name: `ai-mysteries-api/Content/<bookId>/`
- the URL prefix: `/<bookId>/…`
- the Cosmos partition key value (`/bookId`)

## 2. Author the content files

Layout (folder per book, read by `FileBookSource` —
`ai-mysteries-api/Services/FileBookSource.cs` is the contract):

```
Content/<bookId>/
  meta.json            # optional — book-level copy (defaults fill in)
  book.json            # required — [{ "slug", "title" }] in reading order
  book/<slug>.md       # required — one body per chapter listed in book.json
  endings.json         # required — [{ "code", "culprits", "title", "special"?, "slug" }]
  endings/<slug>.md    # required — one body per ending listed in endings.json
  clues.json           # optional — generated cross-reference data
  xref-markers.json    # optional — generated cross-reference data
  glossary.json        # optional — unfamiliar-word definitions (hover glossary)
```

### glossary.json (optional)

Definitions for period/trade/regional words a general reader may not know. The web
underlines the **first occurrence per chapter/ending** of each term (case-insensitive,
word boundaries) and shows the definition in a popover. Keyed by a kebab id:

```json
{
  "some-term": { "term": "some term", "definition": "1–2 plain sentences.", "aliases": ["plural form"] }
}
```

Definitions must be spoiler-free and in plain voice. Kid-friendly books usually need
none (they gloss in prose); omitting the file is valid and renders nothing.

### meta.json (`BookMeta`)

All fields optional; absent fields fall back to defaults (title falls back to the
bookId). This is the **only** place book-identifying wording lives — never put any
of it in the React components.

```json
{
  "title": "…",
  "tags": ["…", "…"],
  "published": "2026-06-08",
  "wordCount": 12345,
  "summary": ["paragraph 1", "paragraph 2"],
  "coverImage": "https://…/cover.webp",
  "coverAlt": "…",
  "secretBlurb": "…",
  "payoff": ["end-of-book payoff paragraph(s) shown after the last chapter"],
  "codePlaceholder": "hint text for the landing-page code input",
  "shareTitle": "…",
  "shareText": "…",
  "specialShareText": "…",
  "specialReveal": { "headline": "…", "sub": "…" },
  "shopItems": [
    { "label": "A prop from the story", "note": "an in-world aside", "search": "amazon search phrase" }
  ],
  "selection": {
    "sentinelCulprit": "<culprit value whose solo endings form their own category>",
    "categoryWeights": { "1": 45, "2": 30, "sentinel": 25 },
    "specialEnding": 734
  }
}
```

- `selection` holds the book's **server-only** random-pick rules (see *Weighted random
  selection* in `CLAUDE.md`): relative `categoryWeights` keyed by culprit-set size (plus
  `"sentinel"` for the `sentinelCulprit`'s solo endings), and `specialEnding` — a per-book random
  integer 1–1000 giving the **1-in-1000 offset** of the `special: true` ending (it fires when
  `readCount % 1000 == specialEnding`, i.e. the Nth, 1000+Nth, 2000+Nth… random reveal — exactly
  once per 1000; the API tracks a per-book `readCount` for this and persists it to a `stats` doc).
  Use `0`/omit for code-only. Omit the whole block for uniform odds and no special. It is never
  returned by any API endpoint — keep it that way.

- `shopItems` (optional) is the landing page's **"From the story" Amazon shelf** — 2–4 real,
  generic props from the book (`label` shown to the reader, `note` an in-world aside, `search`
  an Amazon search phrase, plus an optional `asin` for a curated product link). The web builds
  the affiliate URL itself with the site-wide associate tag. Keep labels generic, not
  brand-specific, and skip the field entirely where props would feel forced (an absent field
  renders nothing).

- `version` / `contentHash` are **managed by the seeder, not authored by hand** — leave them out.
  The `seed`/`sync` tool stamps `version` (a UTC timestamp) and `contentHash` (a content
  fingerprint) into `meta.json` whenever it detects the book's content changed, and uses them to
  decide what to push. Don't hand-edit them; if you want to force a re-push, just change real
  content (or delete the two fields) and re-run `seed`.

- `tags` is a list of short free-form filtering/topic labels (e.g. `["Murder", "AI", "Kid
  Friendly"]`) — these replace the old single `genre` field; keep them to one or two words each.
  `published` is the ISO date (`YYYY-MM-DD`) the book went on the site. `wordCount` is the book's
  word count as a number; the API converts it to an estimated reading time (and also returns the
  raw count for future sorting/filtering). The catalog renders the tags as chips plus
  `<reading time> · <published date>`; any of these fields may be omitted.

- `coverImage` is a **URL** the web uses directly as `<img src>`. For a new book it
  must be **absolute** (host it yourself, e.g. Azure Blob Storage with public read) —
  never add a bundled asset to the web app, that would force a redeploy. Verify the
  URL is reachable from the public internet, not just locally. Every new book also ships
  with a **cover-art prompt** in the house style at `docs/<bookId>/CoverPrompt.md` — the
  prompt the user feeds to an image generator; target **2:3 portrait, 1024×1536, `.webp`**.
  See `create_new_book.md` Phase 2 for the house style and wiring options.

### Chapters

`book.json` defines reading order; each entry's `slug` names `book/<slug>.md`.
Markdown bodies; the title lives in `book.json`, not in the `.md`.

### Endings

Each entry in `endings.json`:

- `code` — unique 4-char canonical code **within the book**: uppercase, use `O` not
  `0` and `I` not `1`/`L` (input is normalized). **Never let the code hint at the
  culprit(s)** — unrelated letters/digits only. The API throws at startup on a
  duplicate normalized code.
- `culprits` — everyone responsible. The selection category is derived from the
  set's size (plus the optional `sentinelCulprit` category — see `selection` in
  meta.json above). Make sure `categoryWeights` covers every culprit-set size your
  endings actually use — the API validates this at startup and refuses to load the
  book otherwise.
- `title` — identical for every ending; it must never vary or hint at the culprit(s).
- `special: true` — marks a rare ending that gets the reveal overlay
  (`specialReveal` copy in meta.json).

### Cross-references (optional, can be added later)

`clues.json` / `xref-markers.json` are **generated**, not hand-written. Author the
book's clue map at `docs/<bookId>/EndingClueMap.md` (gitignored — format and authoring
guidance in `create_new_book.md` Phase 5), then from the repo root:

```
node scripts/gen-xrefs.cjs <bookId>     # writes the two JSON files into Content/<bookId>/
node scripts/check-xrefs.cjs <bookId>   # validates them against the prose (all books if no arg)
```

Omitting both files is fine; endings simply render without the "spot the clue" glyphs.

## 3. Verify locally

Run both halves (see `CLAUDE.md` Commands):

```
cd ai-mysteries-api && dotnet run     # ContentSource=File reads Content/ on disk
cd ai-mysteries-web && npm run dev
```

Checklist:

- the landing page (`/`) lists the new book with its cover and summary
- `/<bookId>` redirects to the first chapter; TOC, prev/next work
- the last chapter shows the payoff and its CTA reveals an ending
- the special ending is rare: `specialEnding` is a random integer 1–1000 (or `0` for code-only)
  in the `selection` rules, and a handful of `endings/random` draws don't surface it (spot-check,
  not an exhaustive tally)
- random draws vary: "Reveal another ending" a few times gives different endings and never
  repeats the current culprit combination
- one ending round-trips: a code you got at random resolves to that same ending on the landing
  input; a made-up code is rejected

## 4. Ship (cover, seed, verify)

All of this runs from the repo root after `az login` (you hold *Data Contributor* on
the `books` database and management access to the cover assets storage account). The
literal Cosmos endpoint and assets-account name are subscription-specific and kept out of
this public file — the agent has them; otherwise pass `--endpoint` (or set
`COSMOS_ENDPOINT`).

**a. Generate + upload the cover image.** Generate it (free, via Cloudflare Workers AI)
from `docs/<bookId>/CoverPrompt.md`, then push the result to the assets account's `covers`
container as `<bookId>.webp`:

```
node scripts/gen-cover.cjs <bookId>     # writes ai-mysteries-web/public/covers/<bookId>.webp
az storage blob upload --account-name <assets-account> -c covers \
  -n <bookId>.webp -f ai-mysteries-web/public/covers/<bookId>.webp \
  --overwrite --content-type image/webp --auth-mode key
```

Use `--auth-mode key` (the logged-in identity may only hold *Blob Data Reader* on the assets
account; key auth works as long as you have management access to list the account's keys).
Confirm `coverImage` in `meta.json` is the public URL of that blob and that it loads in a
browser (anonymous, not just locally) — `curl -I` it and expect `200` + `image/webp`.

**b. Seed + verify Cosmos:**

```
dotnet run --project ai-mysteries-tools -- seed --endpoint <cosmos-uri>
dotnet run --project ai-mysteries-tools -- diff --endpoint <cosmos-uri>   # must report in sync
```

`seed` is version-based: it stamps the book's `version` (a UTC timestamp written to `meta.json`,
auto-bumped whenever the content changed) and pushes only books whose local version is newer than
Cosmos's. A new book is always newer (it's absent from Cosmos), so the first `seed` pushes it and
bumps the global content version once, which the prod API reloads off of. `diff` then compares
just the per-book versions (cheap); use `full-diff` if you want a deep field-by-field check.

**c. Confirm it's live on prod.** Within one refresh poll (~60s) the production API serves the
book with no App Service restart and no front-end/API deploy. Verify it actually went live:
poll the prod API's `/api/books` until the new title appears, resolve one of the book's ending
codes against prod, and re-check the public cover URL. The book is not shipped until prod
serves it.

That's it. The prod API picks the book up from Cosmos within one refresh poll (~60s) — no
App Service restart, no front-end or API deploy. The landing page then lists the book.

## Spoiler rules (apply to every book)

- Never commit anything under `Content/` or `source_materials/` (both gitignored).
- Never build or commit a public index of endings or codes — no file in the repo may
  map codes/slugs to culprits.
- Don't add endpoints or payloads that return many endings at once.
