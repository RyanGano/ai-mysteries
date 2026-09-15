---
name: catalog-census
description: Census the shipped catalog and steer future books into new or lesser-used territory. Use when the user says "run the census", "catalog census", "where are the books clustering", "rebalance the catalog", "what haven't we written yet", or before drafting a new idea batch (add-todays-book step 7). Classifies every shipped book on many lenses, measures crowding, then updates the steering doc, the Distinctness rules, pick-axes flags and the idea queue.
---

# Catalog census

The Distinctness Contract stops a new book from cloning *one* shipped book. It can't see the slower
failure: a hundred individually-distinct books that all sit in the same few buckets — present day,
United States, a detective who works where it happens. This skill measures that and steers against it.

It runs in three steps. Run all three unless the user asks for only one.

1. **Build** — classify every shipped book on every lens; render the census page.
2. **Analyze** — find where the catalog is crowded, thin, or has never been, *including territory no
   lens names yet*.
3. **Steer** — rewrite the steering doc, and push its conclusions into the rules and plans that
   future builds actually read.

## Files

| File | Committed? | Role |
|---|---|---|
| `scripts/census.cjs` | yes | Book-blind engine: metrics, report, `--check`, `--dossier`, `--html` |
| `docs/catalog-census.json` | **no** (gitignored) | Lens definitions + one classification per book. Judgement lives here |
| `docs/catalog-steering.md` | **no** | The current "avoid / seek / quotas" steering, dated |
| `create_new_book.md` Phase 0.5 | yes | Generic rule: every build reads the steering doc |
| `scripts/pick-axes.cjs` | yes | `overused` flags + menu options mirror the census |
| `docs/book-ideas.md` | **no** | The queue — re-steered against the census |
| `.claude/skills/add-todays-book/SKILL.md` | yes | Queue refills run this skill first |

The census page is a **private Artifact** titled *The Casebook Census*. Several lenses describe how
endings resolve, so it is spoiler-bearing: never commit the rendered HTML or the JSON, and never
paste book-level classifications into a committed file. Counts per bucket are fine in committed
files; book titles paired with twists, culprits or sentinel identities are not.

## Step 1 — Build

```
node scripts/census.cjs --check
```

Lists shipped books with no classification, classifications for books that no longer ship, and any
value that isn't a defined bucket. Exit 0 means the data is complete, so skip to rendering.

For each unclassified book:

```
node scripts/census.cjs --dossier <bookId>
```

It prints the registry row, the detective and victim sections of the character bible, every ending's
culprits · resolution · mechanism, and the chapter-one opening. That is enough to classify every lens.
**Don't read the manuscript or the endings' prose** — the dossier exists so a census costs a few turns,
not a re-read of the catalog.

Add the book to `books` in `docs/catalog-census.json` with a value for **every** lens:

- One bucket id per single-value lens; an array for a `multi` lens (list each motive that drives at
  least one ending, not just the headline one).
- `"-"` only when the fact genuinely isn't in the book (the detective's age is never stated). It
  doesn't vote. Don't use it to dodge a hard call.
- Computed lenses (length) and scoped lenses (cause of death applies only to death books) fill
  themselves — out-of-scope books still take `"-"`.
- **When nothing fits, make a new bucket.** Add it to the lens's `buckets` with an `id`, a `label` and
  a one-line `def`, then use it. A new bucket is *preferred* over shoehorning — a bad fit hides exactly
  the variety this skill exists to find. The engine is book-blind, so this is a data edit only.
- File a book that fits two buckets under its primary one, consistently.

Batch the JSON edits (one write for several books), then render and publish:

```
node scripts/census.cjs --html <session scratchpad>/casebook-census.html
```

Publish that file as an Artifact. If *The Casebook Census* already exists, update it in place — find
its URL with the Artifact `list` action and pass it as `url` — rather than creating a second page.
Write the HTML **outside the repo**.

## Step 2 — Analyze

```
node scripts/census.cjs
```

For each lens the report prints every bucket's count, share, and a state; `last 20` is the share among
the 20 most recently shipped books in that bucket. Thresholds scale with the number of buckets, so
a 3-bucket lens and an 11-bucket lens are judged fairly:

- **CROWDED** — at least `min(1.8 × an even share, even + 15 points)`, and 3+ books.
- **thin** — at most 30% of an even share.
- **UNUSED** — a defined bucket no book has tried.
- **evenness** — effective number of buckets ÷ buckets (1.00 is flat; under ~0.6 means a few buckets
  carry the lens). The summary ranks lenses from most lopsided to most even.
- **The default book** — the biggest bucket on every lens: the shape a new book slides toward by habit.
  **Most typical books** are the shipped ones closest to it.

Read it with these rules:

1. **Crowded and heating** (the last-20 share is at or above the overall share) → an **Avoid** target.
   This is the only state that earns a new rule.
2. **Crowded but cooling** (last-20 share well below overall) → the catalog is already correcting.
   Record it as *cooling*, and **don't** add a rule — over-steering just builds the next cluster.
3. **Thin or unused** → a **Seek** target, if it's compatible with the site's rules (content
   boundaries, kid books have no death, and so on).
4. **A lopsided lens** (evenness under ~0.6) matters more than one crowded bucket on an even lens.
5. **A bucket holding more than about a quarter of a lens is probably too broad.** Before flagging
   it, ask whether it's really two or three things. If so, split it into new buckets and re-file
   those books.

**Then look past the buckets.** The lenses only see what someone thought to name. Spend one pass
asking what the catalog has *never* done, and add the answers to the data as new buckets with zero
books, so they show up as *Never tried* on the page and as Seek targets. Prompts:

- **Map:** which continents, countries, climates and languages are absent?
- **Time:** eras, seasons, holidays, times of day.
- **Worlds:** professions, subcultures, institutions and ways of living no book has entered — digital
  life, government, military, faith communities, the very rich, the very poor.
- **Cast:** the detective's age, relation to the case, class, disability; an ensemble; a villain's POV.
- **Crime and harm:** kinds with no book (kidnapping, blackmail, arson, espionage, direct violence —
  within `CLAUDE.md`'s content rules).
- **Motives** outside the current list (a cause or conscience, fear, pride).
- **Shape:** structures (told in documents, a second-person frame, a single unbroken chapter) and
  tones (comic, bleak, eerie).

Whole **new lenses** are welcome too — narration person, season, a romance thread, victim profile.
When you add one, back-fill every shipped book (the dossier makes this cheap) or leave the lens out;
a half-filled lens reads as crowding that isn't there. Don't add unused buckets to a `multi` lens
unless you've checked the shipped books really never use them.

## Step 3 — Steer

Everything below is driven by the Step 2 findings. Change only what the data supports.

**3a. Rewrite `docs/catalog-steering.md`** (gitignored). Keep this structure so builds can scan it:

```
# Catalog steering — <date>
Census: <artifact URL> · <N> books · <K> lenses
## Headline            — two or three sentences: where the catalog is clustering
## Avoid               — crowded + heating: lens · bucket · share · last-20 share
## Cooling             — crowded but already correcting (no rule; watch)
## Seek                — thin / unused / new buckets, grouped by lens
## Per-build rule      — the gate a single new design must pass (see below)
## Quotas for the next idea batch — counts out of a 25-idea batch
## Queue re-steer log  — which queued rows changed, and why
## Lenses to add next census
```

- **Per-build rule** (default, adjust only with reason): a new design may sit in **at most two Avoid
  buckets**, and must land in **at least two Seek buckets**. If the premise truly forces more Avoid
  buckets, the premise wins, but the build's final report says so.
- **Quotas** turn Seek into numbers for the next refill: for example, at least 8 of 25 set outside
  the dominant country, at most 12 in the dominant era, and at least 1 in a *never-tried* bucket on
  each of three lenses. Quotas must stay compatible with the queue's standing constraints (lengths
  10–60 min and shuffled, the romance lane, the spread of crime types).

**3b. Update the rules that builds read.**

- `create_new_book.md` Phase 0.5: keep the *Catalog steering* subsection pointing at the steering
  doc and the per-build rule. Refresh any stale crowding counts in the six-axes text (for example,
  which detective methods are over-used). Generic counts only — no book titles.
- `scripts/pick-axes.cjs`: set `overused: true` on menu options whose census bucket is crowded and
  heating, and remove the flag when a bucket has cooled. Add new menu options (with a `match` regex
  for the registry prose) for Seek buckets the menus lack. Then run
  `node scripts/pick-axes.cjs --list` to confirm it parses and classifies.

**3c. Re-steer the plans.**

- **The queue** (`docs/book-ideas.md`): place each `⬜ queued` idea on the lenses its premise fixes —
  setting, era, country, audience, length, type. An idea sitting in **three or more Avoid buckets**
  gets re-cut toward Seek buckets, usually by relocating it in place or time while keeping the hook.
  Keep each idea's number, length and position, so the shuffled-length order survives. Never touch a
  `🛠 in progress` row. Log every change in the steering doc and add a one-line note under the batch.
- **The refill procedure**: `add-todays-book` step 7 runs this skill before drafting a batch, and
  drafts against the quotas. Keep that hook intact.

**3d. Ship the committed changes.** `scripts/`, `create_new_book.md` and `.claude/skills/` are
committed. Check `git status --short` shows no book data (`docs/` and `Content/` are gitignored), then
commit and push to `main`. Leave no temp helper in the working tree.

**3e. Report to the user:** the page link, the 3–5 findings that matter most (lopsided lenses and
heating clusters first), the new buckets or lenses you added, what the rules now say, and every
queued idea you re-cut.

## Notes

- **Cadence:** every queue refill, which is roughly every 25 books, or whenever the user asks. A
  census after every single book is noise.
- **Stability:** bucket ids are forever. Rename a label freely, but don't reuse an id for a
  different meaning. When you split a bucket, give the parts new ids and re-file those books.
- **Honesty over tidiness:** if a classification is a judgement call, make it and move on. The
  census is for steering, not a ledger. But fix a misfile when you spot one; a cluster made of
  misfiles is a false alarm.
