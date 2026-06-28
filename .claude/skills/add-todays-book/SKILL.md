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

3. **Build it live.** Treat the row's premise + length + audience + candidate tags as the brief,
   then follow [`create_new_book.md`](../../../create_new_book.md) **all the way through** —
   design the mystery, write the manuscript + weighted endings, plant clues, wire
   cross-references, verify, generate + upload the cover, seed Cosmos, and confirm it's serving
   from the prod API. Honor every standing rule:
   - **Distinctness:** read **only** [`docs/book-registry.md`](../../../docs/book-registry.md) for
     the 3-of-5-axis check (`create_new_book.md` Phase 0.5) — don't re-read other books' memories or
     `Content/` to "learn the pattern." The registry is the current, compact source.
   - **Ship to live by default** — don't stop at local files or localhost (per `CLAUDE.md`
     "Adding a book" and the user's standing preference). Only stop short if the user said
     "just draft it" or a ship step needs a credential you lack — then report the one blocker.
   - **Tags:** reuse a canonical tag from the `CLAUDE.md` table whenever it fits; only add a new
     one if nothing matches (then update that table + this skill's awareness of it). The row's
     "candidate tags" are a hint, not a mandate — finalize them from the actual story.
   - **Length / audience:** hit the row's target reading time and audience. Kid-friendly rows get
     the easy-reading treatment (simple names, plain words) per `CLAUDE.md` and `create_new_book.md`
     Phase 0.
   - **Voice:** default to the author's house voice (warm, plain-spoken, short-punch rhythm,
     everyday analogies, humane narrator) as the connective texture — see *Voice* in `CLAUDE.md`
     and `.claude/skills/write-in-my-voice/`. This is baseline *feel*, not sameness: still vary
     each book's opening register per the Distinctness Contract. Deviate only if the genre truly
     calls for a different voice. Optionally grade a chapter/ending with **check-my-voice** (~80%+).
   - **Content boundaries:** no sexual content, any book (per `CLAUDE.md`).
   - **Spoiler rules:** all book data + design docs stay in gitignored locations; nothing
     committed names codes, culprits, or clue maps.
   - **Final report:** end your reply with a one-row summary table (see `create_new_book.md`
     → *Final report*):

     | Title | Read Time | Tags | SpecialEnding |
     |---|---|---|---|
     | <book title> | <displayed reading time> | <final tags> | <`selection.specialEnding`, or `0`/none> |

4. **Record it.** When the book is verified live, do all three (cheap, keeps every tracker current):
   - **Move the queue row:** delete it from `docs/book-ideas.md` and **append** it to the "Built"
     table in `docs/book-ideas-archive.md` with status `✅ built`, the build date, and final `bookId`.
   - **Append a fingerprint row** to [`docs/book-registry.md`](../../../docs/book-registry.md) — the
     single distinctness source the next build reads. Fill setting · mystery type · detective method ·
     structure spine · length · audience · tags. **Structural and spoiler-light only** (no codes,
     culprits, or sentinel/special identities). This is what stops the registry going stale.

5. **Save a slim memory.** Add a **short pointer** memory file (a few lines: title, bookId, one-line
   premise, "see `docs/book-registry.md` row N for the fingerprint") plus a one-line entry in
   `MEMORY.md`. Don't write the old ~40-line full record — the registry row + the gitignored design
   docs hold the detail now; the memory just makes the book discoverable across sessions.

6. **Refill the queue when it runs out — big batch, infrequently.** After building, count the
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
- The queue file and all book content are gitignored — editing them is **not** a site-code
  change and needs no redeploy. Don't commit the queue or book data.
- If no row is `⬜ queued` and you can't find the file, tell the user the backlog is missing
  rather than inventing a book on the spot.
