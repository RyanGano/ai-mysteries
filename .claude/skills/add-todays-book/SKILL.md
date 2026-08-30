---
name: add-todays-book
description: Build and ship "today's book" from the queue. Use when the user says "Add today's book", "today's book", "build the next book", or otherwise asks to pull the next idea off the backlog and ship it live. Picks the first queued idea from docs/book-ideas.md, builds it end-to-end per create_new_book.md, marks it built, and refills the queue when empty.
---

# Add today's book

The daily ritual: turn the next queued premise into a finished book **live on the production
site**, then keep the bookkeeping straight.

Two gitignored, local-only files:

- [`docs/book-ideas.md`](../../../docs/book-ideas.md) — the **active queue**: only `⬜ queued`
  (and momentary `🛠 in progress`) ideas. This is the only idea file you read when building a
  story; keep it small.
- [`docs/book-ideas-archive.md`](../../../docs/book-ideas-archive.md) — **built-story history**.
  Rows move here once a book ships. Read it **only** when generating new ideas (for dedup), never
  when writing a story.

## Procedure

1. **Read the queue.** Open `docs/book-ideas.md`. Find the **first** row whose status is
   `⬜ queued` (top to bottom). That's today's book. If the user named a specific title or
   number, use that row instead.

2. **Mark it in progress.** Edit that row's status to `🛠 in progress` before you start, so a
   resumed session knows where it was.

3. **Write it (Phases 0–4).** Treat the row's premise + length + audience + candidate tags as the
   brief, then follow [`create_new_book.md`](../../../create_new_book.md) through **Phase 4** —
   interpret the brief, pass the Distinctness Contract, design the dossier, author `meta.json`,
   generate the cover image, write the manuscript logging clue quotes as you go, and write the
   endings. Also run the Phase 0.5 **anti-echo grep** yourself; it needs your knowledge of the
   prose. Then hand off to the ship agent (step 4) — you do **not** run Phases 5–7 inline.
   Honor every standing rule:
   - **Distinctness:** run `node scripts/pick-axes.cjs --audience <adult|all|kid>` **first** and
     build from one of its three candidates (`create_new_book.md` Phase 0.5). Don't hand-pick the
     detective method or chapter spine — that's where sameness creeps in. Re-rolling is free, so
     re-roll rather than force a bad fit; if the script says all candidates are weak, read the
     dominant reason it prints. The script reads `docs/book-registry.md` for you, so don't re-read
     other books' memories or `Content/` to "learn the pattern."
   - **Ship to live by default** — don't stop at local files or localhost (per `CLAUDE.md`
     "Adding a book" and the user's standing preference). Only stop short if the user said
     "just draft it" or a ship step needs a credential you lack — then report the one blocker.
   - **Tags:** the live catalog (`GET /api/books` on the prod API), not `CLAUDE.md`, is the
     source of truth for which tags already exist. Fetch it with **`node scripts/catalog-tags.cjs
     --api <prod base URL>`** — one call, not a hand-rolled `curl`/`node -e` parse first (that's
     redundant spend for the same data the script already gives you). Reuse a match whenever one
     fits; only add a new tag if nothing matches (then optionally add a "when to use" line to the
     glossary table in `tag_glossary.md` — a documentation courtesy, not a requirement, since the
     tag itself ships live via Cosmos regardless). Read **`tag_glossary.md`** (repo root) for the
     four-step procedure and what each existing tag means; it is not in context by default. Tag
     setting, era, and subject too — not just crime type and audience. The row's "candidate tags"
     are a hint, not a mandate — finalize them from the actual story.
   - **Length / audience:** hit the row's target reading time and audience. Kid-friendly rows get
     the easy-reading treatment (simple names, plain words) per `CLAUDE.md` and `create_new_book.md`
     Phase 0.
   - **Voice:** default to the author's house voice (warm, plain-spoken, short-punch rhythm,
     everyday analogies, humane narrator) as the connective texture — see *Voice* in `CLAUDE.md`
     and `.claude/skills/write-in-my-voice/`. This is baseline *feel*, not sameness: still vary
     each book's opening register per the Distinctness Contract. Deviate only if the genre truly
     calls for a different voice. Optionally grade a chapter/ending with **check-my-voice** (~80%+).
   - **Content boundaries:** no sexual content, any book (per `CLAUDE.md`).
   - **Cover:** `node scripts/gen-cover.cjs <bookId>` (FLUX by default). If the image API errors
     on the model's request schema, fall back to `--model sdxl` — it gives a good house-style
     cover — rather than debugging the API mid-build. Then flag it per *tooling breakage* below.
   - **Spoiler rules:** all book data + design docs stay in gitignored locations; nothing
     committed names codes, culprits, or clue maps.
   - **Final report:** end your reply with a one-row summary table (see `create_new_book.md`
     → *Final report*):

     | Title | Read Time | Tags | SpecialEnding |
     |---|---|---|---|
     | <book title> | <displayed reading time> | <final tags> | <`selection.specialEnding`, or `0`/none> |

4. **Ship it via the ship agent (Phases 5–7).** Do **not** run these phases inline. Spawn **one**
   `general-purpose` subagent with `model: "sonnet"` and `run_in_background: false`, and let it do
   the mechanical tail: cross-references, local verification, cover upload, Cosmos seed, and the
   live-on-prod confirmation.

   **Why:** by Phase 5 your context holds the whole dossier, manuscript, and every ending — roughly
   200K+ tokens that get re-sent on every turn. The tail phases are the *least* judgment-heavy and
   the *most* expensive turns in the run (xref exact-match debugging and the seed/verify loop are
   both iterative). A fresh subagent resets that context to near-zero **and** runs at a cheaper
   rate. This is a cost decision only — it must not lower the bar on any check.

   The subagent starts cold, so the brief must be self-contained. Give it, explicitly:

   - the `bookId`, the book title, and the repo root;
   - that Phases 0–4 are complete: `meta.json`, `book.json` + chapters, `endings.json` + endings,
     the cover at `ai-mysteries-web/public/covers/<bookId>.webp`, and `docs/<bookId>/EndingClueMap.md`
     with the Clue Library + Marker-placement sections already filled in;
   - its job, which is now mostly four commands:
     - **Phase 5** — `node scripts/gen-xrefs.cjs <bookId>`, then `check-xrefs.cjs <bookId>` until it
       reports OK. On a failure **read its DIAGNOSIS and follow the remedy it names** — a drifted
       passage means the *clue quote* is stale, so fix the quote in `EndingClueMap.md`; never edit
       the manuscript prose to match a quote, and don't go reading `gen-xrefs.cjs`.
     - **Phase 6** — `node scripts/verify-book.cjs <bookId>` against the local API, plus
       `node scripts/book-stats.cjs <bookId> --target <brief minutes>`. These replace the old
       hand-run checklist; **don't hand-roll `curl` or inline `node -e` checks**, and don't re-measure
       word counts. If `book-stats` reports a `wordCount` mismatch, fix `meta.json` — the catalog
       reads that field.
     - **Phase 7** — cover upload, `seed`, `diff` in sync (commands in `put_book_in_site.md` §4),
       then `node scripts/verify-book.cjs <bookId> --api <prod base URL> --wait 90` to confirm live.
     - Length is **not** its call: if `book-stats` says the book is off-target, report the number.
       Do not trim or pad the prose to chase it.
   - the **bookkeeping text you have already composed** (see step 5) — the archive row, the registry
     fingerprint row, and the memory file body — so it only has to write files, not invent content
     it can't know;
   - the standing rules it could otherwise violate: **nothing book-specific gets committed**
     (`Content/`, `docs/`, `public/covers/` are gitignored — `git status` must come back clean of
     book data), no code/culprit/clue detail lands in any committed file, and **no temp file is
     left behind anywhere in the repo** (see *Temp files* under Notes) — `git status --short` at
     the end must show no stray `.tmp*` / scratch helper;
   - a request to report back: `check-xrefs` result, `verify-book` pass/fail counts for **both** the
     local and prod runs, the `book-stats` length verdict, the seeded content version, `diff` status,
     and any check that failed or was skipped.

   **You still own the outcome, but that means reading its report, not re-running its work.** The
   entire point of Phase 5-7 in the subagent is that its checks run at the cheap rate, in a
   near-empty context — re-running `diff`, `verify-book.cjs`, or any curl/node check yourself
   after it reports back spends those same tokens again at Opus rates, in your now-200K+-token
   context, which is the single most expensive place in the run to do it (confirmed happening in
   the 2026-07-27 run: the main session re-ran the whole prod verification tail after the
   subagent had already passed it). Trust a clean report. Only re-touch something yourself if the
   subagent's report says a check **failed or was skipped** — then fix that specific thing, not
   the whole tail. If it hits a missing credential, report that single blocker per the
   ship-to-live rule above. Keep the fair-play audit (every ending's ≥2 clues actually present)
   with **yourself** — that needs the endings in context.

5. **Record it.** Compose these **before** spawning the ship agent in step 4 and pass them in its
   brief; verify they landed when it reports back. All three are cheap and keep every tracker
   current:
   - **Move the queue row:** delete it from `docs/book-ideas.md` and **append** it to the "Built"
     table in `docs/book-ideas-archive.md` with status `✅ built`, the build date, and final `bookId`.
   - **Append a fingerprint row** to [`docs/book-registry.md`](../../../docs/book-registry.md) — the
     single distinctness source the next build reads. Fill setting · mystery type · detective method ·
     structure spine · length · audience · tags. **Structural and spoiler-light only** (no codes,
     culprits, or sentinel/special identities). This is what stops the registry going stale.
   - **Append a row** to
     [`docs/detective-gender-tally.md`](../../../docs/detective-gender-tally.md) — bookId,
     detective name, gender, and (if notable) why that gender was picked, e.g. "leaning male, tally
     running female-heavy" or "period role, historically male." Keeps the soft gender-balance nudge
     in `create_new_book.md` Phase 0.5 accurate for the next build.

6. **Save a slim memory.** Add a **short pointer** memory file (a few lines: title, bookId, one-line
   premise, "see `docs/book-registry.md` row N for the fingerprint") plus a one-line entry in
   `MEMORY.md`. Don't write the old ~40-line full record — the registry row + the gitignored design
   docs hold the detail now; the memory just makes the book discoverable across sessions.

7. **Refill the queue when it runs out — big batch, infrequently.** After building, count the
   remaining `⬜ queued` rows in `docs/book-ideas.md`. Only when the queue is **empty** (the row
   you just built was the last `⬜ queued` one) add a **fresh batch of 25–50 new ideas** under a
   new `## Batch N — drafted <date>` heading, following the constraints below. Prefer one large,
   infrequent refill (≈25 ideas at a time) over frequent small top-ups — a big review every ~25
   days, not a handful every few days.
   - Read **both** `docs/book-ideas.md` (current queue) **and** `docs/book-ideas-archive.md`
     (built history) first, so no new idea is an exact duplicate of anything queued or built.
   - Then **tell the user the new ideas are ready to review** (quick summary). Do **not** silently
     continue building from the fresh batch — the user reviews first.
   - If any `⬜ queued` rows still remain, do nothing here.

## Constraints for any new batch you generate

(Same rules the queue header states — keep them true for every idea you add.)

1. Each story is **10–60 min** of reading.
2. Weight heavily toward short — most ideas should be **10–25 min**. A full 60-min story is rare:
   include only about **1 in 25**, so a ~25-idea batch gets **one** flagship at most (and none if
   the queue + archive already hold a recent 60-min one).
3. **Shuffle the lengths — never ascending.** Build order is top-to-bottom, so the batch must be
   ordered so consecutive queue lengths bounce around (short → longer → short, e.g. 10 · 20 · 12 ·
   32 · 14 …), **not** a steady climb. Do **not** write the batch sorted by length — interleave it
   so no run of 3+ rows keeps getting longer, and the 60-min flagship (if any) sits mid-batch, not
   at the end. Match the look of the current Batch 1 ordering.
4. **Variety, not uniqueness.** Aim for a broad spread of settings/eras, but recurring genres are
   welcome — a reader who likes a given flavor (romance, cozy, period whodunit, kid-friendly)
   should find a few matches. Just don't let a batch cluster on one gimmick (not everything in
   space or the Jurassic), and don't clone a shipped book wholesale. Light overlap is fine. Skim
   the shipped-book memories (`MEMORY.md`) so you know what already exists.
5. Deliberately spread the **crime type** (death/murder · kid-friendly · theft/loss ·
   no-crime/misunderstanding) **and reader appeal** — keep a recurring romance lane (kept to
   kissing/dating/holding hands per `CLAUDE.md` content boundaries), plus cozy, period, and
   kid-friendly. Don't let any one type or flavor dominate a batch.

Use the existing Batch 1 table format: columns `# · Status · Working title · Setting / era ·
Premise · Type · Length · Audience · Candidate tags`, every new row starting `⬜ queued`.
Number new rows from **one past the highest `#` ever used across both files** (the queue has gaps
once built rows move to the archive — don't reuse a number).

## Notes

- One book per invocation unless the user explicitly asks for more.
- **Temp files: write them outside the repo, and delete them when done.** Long registry/archive
  rows are awkward to append through the shell, so a build often writes a throwaway helper (a
  `.cjs` that splices a row in, a `.tmp` holding a phrase-ownership line). Put those in the
  session scratchpad / OS temp dir — **never** under `scripts/`, `docs/`, or anywhere else in the
  working tree. If one does land in the repo, `rm` it in the same turn as its last use; a leftover
  `scripts/.tmp-*.cjs` or `docs/.*.tmp` is a build defect, not harmless residue (two of them sat
  in the tree for days before 2026-08-13). Before your final report, run `git status --short` and
  clear anything the build created that isn't book data.
- **Turn discipline is the main cost lever.** A build session runs at 200K–270K tokens of context,
  re-sent on every turn, so roughly 60% of a run's cost is context re-reads — not the prose. Two
  habits matter more than anything else: batch your edits instead of making many small ones, and
  **don't re-read files you've already read** (especially other books' `Content/`, which
  `create_new_book.md` already forbids). Writing is cheap; looping is not.
- **Model split:** the writing phases run on Opus (the session model); Phases 5–7 run on Sonnet in
  the step-4 subagent. Don't spawn extra subagents beyond that one — each cold start re-reads the
  playbooks and gives back most of the saving.
- **Tooling breakage: work around it, then say so.** If a build script fails for a reason that
  isn't about this book (an upstream API changing its schema, a flag that no longer works), take
  the cheapest workaround that still ships the book to the same standard, and then **call it out
  under a `NOTES / BLOCKERS` heading in your final reply** — name the script, the exact error, and
  the workaround you used. That report is what gets the script fixed once; a workaround you only
  remember in-session becomes a flag every future build has to rediscover. Don't stop the build to
  fix tooling, and don't quietly lower a check to get past it.
- The queue file and all book content are gitignored — editing them is **not** a site-code
  change and needs no redeploy. Don't commit the queue or book data.
- If no row is `⬜ queued` and you can't find the file, tell the user the backlog is missing
  rather than inventing a book on the spot.
