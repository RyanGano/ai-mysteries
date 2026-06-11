# Put a book in the site

> Writing a brand-new book from a premise (story, endings, clues and all)? Start with
> `create_new_book.md` — the start-to-finish playbook. This doc is the **file contract +
> seeding reference** it builds on.

Agent playbook for adding a **new book** to the site. By design this is a
**data-only change** — no code edits, no web/API redeploy (see the architecture
principles in `CLAUDE.md`). The API auto-discovers books from Cosmos, the landing
page renders whatever `GET /api/books` returns, and routing is generic
(`/:bookId/…`).

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
```

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
  "selection": {
    "sentinelCulprit": "<culprit value whose solo endings form their own category>",
    "categoryWeights": { "1": 45, "2": 30, "sentinel": 25 },
    "specialEndingOdds": 0.001
  }
}
```

- `selection` holds the book's **server-only** random-pick rules (see *Weighted random
  selection* in `CLAUDE.md`): relative `categoryWeights` keyed by culprit-set size (plus
  `"sentinel"` for the `sentinelCulprit`'s solo endings), and the odds of the `special: true`
  ending. Omit it for uniform odds and no special roll. It is never returned by any API
  endpoint — keep it that way.

- `tags` is a list of short free-form filtering/topic labels (e.g. `["Murder", "AI", "Kid
  Friendly"]`) — these replace the old single `genre` field; keep them to one or two words each.
  `published` is the ISO date (`YYYY-MM-DD`) the book went on the site. `wordCount` is the book's
  word count as a number; the API converts it to an estimated reading time (and also returns the
  raw count for future sorting/filtering). The catalog renders the tags as chips plus
  `<reading time> · <published date>`; any of these fields may be omitted.

- `coverImage` is a **URL** the web uses directly as `<img src>`. For a new book it
  must be **absolute** (host it yourself, e.g. Azure Blob Storage with public read) —
  never add a bundled asset to the web app, that would force a redeploy. Verify the
  URL is reachable from the public internet, not just locally.

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
- "Reveal another ending" never repeats the current culprit combination
- entering a known code on the landing page resolves; an unknown code is rejected

## 4. Seed Cosmos

From the repo root, after `az login` (you hold *Data Contributor* on the `books`
database):

```
dotnet run --project ai-mysteries-tools -- seed --endpoint <cosmos-uri>
dotnet run --project ai-mysteries-tools -- diff --endpoint <cosmos-uri>   # must report in sync
```

That's it. The prod API picks the book up from Cosmos (restart the App Service app
if you need it immediately — content is cached at startup), the landing page lists
it, and no front-end or API deploy is needed.

## Spoiler rules (apply to every book)

- Never commit anything under `Content/` or `source_materials/` (both gitignored).
- Never build or commit a public index of endings or codes — no file in the repo may
  map codes/slugs to culprits.
- Don't add endpoints or payloads that return many endings at once.
