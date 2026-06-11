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
dotnet run --project ai-mysteries-tools -- seed --endpoint <cosmos-uri>   # local files → Cosmos (deploy data)
dotnet run --project ai-mysteries-tools -- diff --endpoint <cosmos-uri>   # report drift (exit 1 if out of sync)
dotnet run --project ai-mysteries-tools -- pull --endpoint <cosmos-uri>   # Cosmos → local files (recovery)
```

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

Two committed, spoiler-free playbooks at the repo root:

- **`create_new_book.md`** — start-to-finish: turn a one-line premise into a finished book
  (design the mystery, write chapters + weighted endings, plant clues, wire
  cross-references, verify, seed). Start here when asked to *create* a new book.
- **`put_book_in_site.md`** — the underlying file contract (`meta.json`, `book.json`,
  `endings.json`, …) and the Cosmos seeding procedure. Reference for the mechanics.

## Architecture

**Two load-bearing principles:**

1. **No book-specific data or wording lives in the code — front end or API.** Title, tags,
   published date, word count (the API converts it to an estimated reading time), marketing summary, cover image,
   secret blurb, end-of-book payoff, share text, and the special-ending reveal copy all come from
   the API (`BookMeta`). React holds only generic,
   book-agnostic UI chrome — button verbs ("Reveal another ending →", "Continue reading →",
   "Contents"), loading/error text, the catalog tagline + footer disclaimers + privacy policy,
   and the "AI Mysteries" site brand in `index.html`. The API is equally
   book-blind: selection rules (category weights, sentinel culprit, special-ending odds) are
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
  client) using the shapes in `src/lib/types.ts`.
- **`ai-mysteries-api/`** — .NET 10 minimal API. Owns the selection logic and serves content. It
  loads content at startup from a pluggable **`IBookSource`** (`Services/IBookSource.cs`) into an
  immutable `Book` per book, cached by `Services/BookStore.cs`. In Cosmos mode the cache is **not**
  permanent: `Services/BookRefreshService.cs` polls `IBookSource.GetVersion()` every
  `Content:RefreshIntervalSeconds` (default 60) — one cheap point read of a single global version
  doc (`_system`/`version`, see `VersionDoc` in `CosmosDocuments.cs`). When the value differs from
  what the cache was built on, `BookStore.Refresh()` does a full reload and atomically swaps the
  whole book index ("dirty everything"); otherwise it's a no-op, so steady state makes no
  per-request DB calls. The seeder bumps that version **only when a seed actually changes content**
  (it diffs files vs Cosmos first and skips a no-op seed), so a new/edited book goes live within
  one poll interval with no API redeploy. File mode is static (version constant), so no poller runs.
  Two sources, chosen by the `ContentSource` config key:
  - **`FileBookSource`** (`ContentSource=File`, dev/authoring default) — reads `Content/<bookId>/`
    on disk: `meta.json` (book-level `BookMeta` — title, summary, cover URL, secret blurb, payoff,
    share strings, special-reveal copy — plus the server-only `selection` rules; all fields
    optional, defaults fill in); `book.json`
    (`[{ slug, title }]`, reading order) + `book/<slug>.md`; `endings.json`
    (`[{ code, culprits, title, special?, slug }]`) + `endings/<slug>.md`; `clues.json` +
    `xref-markers.json` (generated cross-reference data).
  - **`CosmosBookSource`** (`ContentSource=Cosmos`, prod) — reads the Cosmos `content` container
    (one doc per chapter/ending/clue/xref + a `manifest` that carries the book's `BookMeta`,
    partition key `/bookId`). See `Services/CosmosDocuments.cs` for the document contract.

  The book data files under `Content/` are **gitignored** (not in the repo) — they are the local
  authoring source of truth, seeded into Cosmos by `ai-mysteries-tools`. The structure is
  book-agnostic; routing keys off `{bookId}` and each book is its own Cosmos partition.
- **`ai-mysteries-tools/`** — local-only console (`seed`/`pull`/`diff`) that moves content between
  the on-disk files and Cosmos. Reuses the API's `FileBookSource`/`CosmosBookSource` so there is
  one storage contract. Never deployed.

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

CORS (`Program.cs`) allows any `localhost`/`127.0.0.1` origin in addition to any origin listed
in `Cors:AllowedOrigins` — so it works regardless of which port Vite lands on.

## How the ending mechanic works

- Routes are book-scoped: `/:bookId` (redirects straight into the book's first chapter — there is
  no per-book marketing page; the catalog card carries the cover/summary, and the reader's Endings
  drawer carries the code-entry + reveal-ending controls),
  `/:bookId/:slug` (a chapter; clicking a catalog card lands here on the first chapter's slug),
  `/:bookId/ending` (picks a weighted-random code, redirects replace), and
  `/:bookId/ending/:code` (permanent page — always the same ending for that code). `/` is the
  data-driven catalog listing every book (title, tags, reading time, published date); `/privacy` is the static
  privacy policy. A site-wide `Footer` (AI-authorship + fiction disclaimers, privacy link)
  renders on every route. See `ai-mysteries-web/src/App.tsx`.
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
  "specialEndingOdds": 0.001
}
```

- An ending's **category** is its `culprits` set size as a string (`"1"`, `"2"`, …); a solo
  ending by the `sentinelCulprit` gets the dedicated `"sentinel"` category instead.
- Three stages: pick a category by `categoryWeights` (relative weights among the categories
  present), pick a culprit combination uniformly within it, pick uniformly among that
  combination's endings. Picking the combo before the ending keeps every combination equally
  likely regardless of how many endings it has.
- `specialEndingOdds` (0..1) is the chance a pick short-circuits to the book's `special: true`
  ending; `0`/omitted means that ending is reachable only by entering its code.
- A book with no `selection` key gets uniform category odds and no special roll.
- `BookStore.Build` validates at startup that authored weights give a positive weight to every
  category the book's endings actually use.

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
2. Every ending must open with the book's mandatory two-paragraph header. Copy it **verbatim**
   from any existing ending in `Content/within-tolerance/endings/` (or from
   `docs/within-tolerance/EndingStyleGuide.md`) — both local-only. Never reproduce it in a
   committed file.
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

- **Auth is passwordless** — the web app's system-assigned **managed identity** holds the Cosmos
  *Data Reader* role; the API connects with `DefaultAzureCredential` + the account endpoint URL
  (config `Cosmos:Endpoint`, not a secret). No keys, **no Key Vault**. You hold *Data
  Contributor* so the local Tools seeder can write.
- **Deploy**: `.github/workflows/api.yml` publishes self-contained (`-r linux-x64
  --self-contained`, so F1 needs no preinstalled .NET 10 runtime) and pushes via publish
  profile. Repo secrets: `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_PUBLISH_PROFILE`. The artifact
  carries no book data (`Content/` is gitignored; `-p:PublishBookContent=false` also drops it).
- **App settings (prod)**: `ContentSource=Cosmos`, `Cosmos__Endpoint/Database/Container`,
  `Cors__AllowedOrigins__0=<SWA origin>` (locks CORS to the front end; localhost stays
  dev-only). Then set the SWA's `VITE_API_BASE_URL` to the web app URL and redeploy the front end.
- **Data flow**: edit content locally → `ai-mysteries-tools seed` pushes to Cosmos → `diff`
  proves parity before deploy. Order the first time: run `infra/azure-setup.ps1` → `seed` →
  deploy API → set `VITE_API_BASE_URL`.

## source_materials/ policy

`source_materials/` is in `.gitignore` and **must never be committed**. It contains the
manuscript, cover art, character bible, and final-scene art — local reference only.
