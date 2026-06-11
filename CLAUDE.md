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

Cross-reference data (run from the **repo root**, where `docs/EndingClueMap.md` lives):

```
node scripts/gen-xrefs.cjs     # regenerate clues.json + xref-markers.json from EndingClueMap.md
node scripts/check-xrefs.cjs   # validate the generated JSON against the manuscript (no drift)
```

The web dev server points at the API via `VITE_API_BASE_URL` (defaults to `http://localhost:5180`
— see `ai-mysteries-web/.env.example`). Run the API and the web dev server together.

## Project purpose

Marketing + payoff site for the novel **Within Tolerance**. The book ends unresolved — the
final printed line is `www.therealending.com`. This site delivers the real, varied endings.

## Architecture

**Two load-bearing principles:**

1. **No book-specific data or wording lives in the front end.** Title, marketing summary, cover
   image, secret blurb, end-of-book payoff, share text, and the special-ending reveal copy all
   come from the API (`BookMeta`). React holds only generic, book-agnostic UI chrome — button
   verbs ("Reveal another ending →", "Continue reading →", "Contents"), loading/error text, and
   the "AI Mysteries" site brand in `index.html`. If a string names a book or its plot, it
   belongs in the data, not the components.
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
  immutable `Book` per book, cached by `Services/BookStore.cs`. Two sources, chosen by the
  `ContentSource` config key:
  - **`FileBookSource`** (`ContentSource=File`, dev/authoring default) — reads `Content/<bookId>/`
    on disk: `meta.json` (book-level `BookMeta` — title, summary, cover URL, secret blurb, payoff,
    share strings, special-reveal copy; all fields optional, defaults fill in); `book.json`
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

- Routes are book-scoped: `/:bookId` (reader, redirects to first chapter), `/:bookId/:slug`
  (a chapter), `/:bookId/ending` (picks a weighted-random code, redirects replace), and
  `/:bookId/ending/:code` (permanent page — always the same ending for that code). `/` is the
  data-driven landing/catalog. See `ai-mysteries-web/src/App.tsx`.
- Codes are 4-char uppercase. `O/0` and `I/1/L` are interchangeable on input (normalized).
- Deep links work via SPA fallback in `ai-mysteries-web/staticwebapp.config.json`.

### Weighted random selection

Each ending names a set of culprits via `culprits` (in `endings.json`). The **category** is
derived from that set's size, plus one special sentinel category — see
`ai-mysteries-api/Services/EndingSelector.cs` for the categories and their weights. Selection
runs **server-side** and is three-stage:

1. **Pick a category by weight** — `CategoryWeights` in `EndingSelector.cs`, ordered most →
   least common (a single culprit is the most likely; the special category the least). The
   weights must stay monotonically decreasing and sum to 100.
2. **Pick a culprit combination uniformly** within the category.
3. **Pick uniformly** among that combination's registered endings.

Picking the combo before the ending keeps every combination equally likely regardless of how
many endings it has. To add a new suspect, the combinatorics change — revisit the weights, but
the size-derived categories keep working automatically.

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
   `docs/EndingStyleGuide.md`) — both local-only. Never reproduce it in a committed file.
3. Add an entry to `ai-mysteries-api/Content/within-tolerance/endings.json` (`slug` links the
   entry to the `.md` file you just wrote):
   ```json
   { "code": "XXXX", "culprits": ["Name"], "title": "<copy from an existing entry>", "slug": "my-ending" }
   ```
   `culprits` lists everyone responsible — one name for a single, several for a combination,
   every suspect for the all-of-them category, or the special sentinel (see
   `EndingSelector.cs`). The `title` is identical for every ending — copy it from any existing
   entry in `endings.json`; it must never vary or hint at the culprit(s).
4. Use a unique canonical 4-char code. Canonical = uppercase, `O` not `0`, `I` not `1`/`L`.
   **Do not let the code hint at the culprit** — pick unrelated letters/digits. Never quote a
   real, registered code in a committed file (docs, comments, examples).
5. Restart the API (`dotnet run`) — `BookStore` throws on a duplicate normalized code at startup.
6. (Optional) Wire up the ending's **cross-references** (the in-ending "spot the clue"
   binoculars). See *Cross-references* below — this is driven entirely from
   `docs/EndingClueMap.md`, never by editing the ending `.md`.

## Cross-references (in-ending "spot the clue")

Endings render a small binoculars glyph at each reveal; hovering/clicking shows the
foreshadowing manuscript passage and deep-links to it (`/<bookId>/<slug>?clue=<ID>`). The data is
**generated** from `docs/EndingClueMap.md` (gitignored) into two committed artifacts under
`ai-mysteries-api/Content/within-tolerance/`:

- `clues.json` — from the **Clue Library** section (clue id → chapter + the verbatim
  passage(s) to show).
- `xref-markers.json` — from the **Marker placement (annotated reveal excerpts)** section
  (ending code → resolved glyph offsets).

The API ships, with each ending, only that ending's markers and the clues those markers
reference (built in `Models/Book.cs`). To add/update cross-references for an ending: edit
those two sections of `EndingClueMap.md` (add a clue to the Clue Library if new; add the
ending's annotated excerpt with `[CLUE-ID]` markers to the Marker-placement section), then run
`node scripts/gen-xrefs.cjs` (from the repo root) and commit the regenerated JSON.
`node scripts/check-xrefs.cjs` fails if a marker drifted off its anchor or a clue passage no
longer matches the manuscript. Web runtime lives in `src/lib/remark-xref.ts`,
`src/components/XrefMarker.tsx` (reads clue data from `CluesContext`, supplied by `Prose`), and
`src/styles/xref.css`; the deep-link highlight is in `src/routes/Read.tsx`. See
`docs/cross_reference.md` for the full design.

## Voice and style guide

`docs/EndingStyleGuide.md` is the full reference — local-only, not committed (see `docs/` in
`.gitignore`). It carries the register, the recurring motifs, the hard "never do" rules, and
the mandatory two-paragraph opening. **Read it (plus a few existing endings) before writing a
new ending** — and don't reproduce its specifics in this file or anything else committed.

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
