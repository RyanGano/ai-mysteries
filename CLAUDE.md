# CLAUDE.md — Within Tolerance Book Site

## Commands

```
npm run dev       # start dev server (localhost:5173)
npm run build     # prettier check + eslint check + tsc + vite build → dist/
npm run lint      # eslint --fix + prettier --write (auto-fix in place)
npm run preview   # preview the dist/ build locally
npx tsc -b        # type-check only (no emit)
```

## Project purpose

Marketing + payoff site for the novel **Within Tolerance**. The book ends unresolved — the
final printed line is `www.therealending.com`. This site delivers the real, varied endings.

## How the ending mechanic works

- `/therealending` — picks a weighted-random code from the registered endings, redirects (replace).
- `/therealending/:code` — permanent page. Always shows the same ending for that code.
- Codes are 4-char uppercase. `O/0` and `I/1/L` are interchangeable on input (normalized).
- Deep links work via SPA fallback in `staticwebapp.config.json`.

### Weighted random selection

Each ending names a set of culprits via `culprits: string[]`. The **category** is derived
from that set's size (`["SAM"]` is the special SAM category). Random selection is
three-stage (see `src/lib/endings.ts`):

1. **Pick a category by weight** (most → least common):

   | Category               | `culprits` size | Weight |
   |------------------------|-----------------|--------|
   | Single person          | 1               | 45%    |
   | Two people             | 2               | 25%    |
   | Three people           | 3               | 14%    |
   | Four people            | 4               | 8%     |
   | All of the team        | 5               | 5%     |
   | SAM                    | `["SAM"]`       | 3%     |

2. **Pick a culprit combination uniformly** within the category (e.g. one of the 10 pairs).
3. **Pick uniformly** among that combination's registered endings.

Picking the combo before the ending keeps every combination equally likely regardless of how
many endings it has. `CATEGORY_WEIGHTS` in `src/lib/endings.ts` must stay monotonically
decreasing and sum to 100. To add a new suspect, the combinatorics change — revisit the
weights, but the size-derived categories keep working automatically.

### "Reveal another ending" exclusion rule

When a reader clicks **Reveal another ending**, the next pick excludes any ending that shares
the same culprit combination as the one currently displayed. For example, if you're reading a
Rourke-solo ending you won't see another Rourke-solo; if you're reading a Rourke+Shah pair
you won't see another Rourke+Shah ending. Endings that merely _include_ one of those people
in a different combination are still eligible.

This is enforced by `pickWeightedRandomCode(excludeComboKey?)` in `src/lib/endings.ts` — the
combo key is the sorted culprit names joined by ` & `. It applies automatically to every
ending, including newly added ones. No extra steps needed when authoring an ending.

## How to add an ending

1. Write `src/content/endings/<slug>.md` in the book's voice (see style guide below).
2. Every ending must open with these exact two paragraphs:
   ```
   No one asked why they were there this time.
   The meeting had been called without an agenda, without a subject line, without the small procedural courtesies that usually softened bad news. That alone told them this wasn't another reconstruction.
   ```
3. Add an entry to `src/content/endings/index.ts` (or add the slug to
   `scripts/gen-endings-index.cjs` and re-run it, which assigns a code and preserves all
   existing ones):
   ```ts
   import myEnding from "./my-ending.md?raw";
   // add to the endings array (culprits drives the selection category):
   { code: "XXXX", culprits: ["Name"], title: "Chapter 17 — The Real Ending", body: myEnding }
   ```
   `culprits` lists everyone responsible — one name for a single, several for a combination,
   all five for "all of the team", or `["SAM"]` for SAM. The `title` is always
   `"Chapter 17 — The Real Ending"` — it must never vary or hint at the culprit(s).
4. Use a unique canonical 4-char code. Canonical = uppercase, `O` not `0`, `I` not `1`/`L`.
   **Do not let the code hint at the culprit** — use unrelated letters/digits (e.g. `7BXK`, `Q4NM`).
5. Run `npm run build` — the uniqueness guard in `src/lib/endings.ts` catches collisions.

## Voice and style guide

`docs/EndingStyleGuide.md` is the full reference — local-only, not committed (see `docs/` in
`.gitignore`). Key rules:
- Third-person past tense, restrained/literary register
- Em-dashes, short sentences for weight, long ones for accumulation
- Recurring motifs: _within tolerance_, _acceptable loss_, _the system made a decision_
- No confession scenes, no explicit verdicts, no new characters
- Every ending opens with the mandatory two-paragraph header (see step 2 above)

## Character reference

`source_materials/Battery_Lab_Mystery_Character_Bible.docx` — local-only, never committed.
Contains full character details for all suspects. Use it when writing new endings.

## Spoiler rules

- **Never** build a public index of endings or codes.
- The site is `noindex` via `staticwebapp.config.json` global headers and `public/robots.txt`.
- Do not log or display which code a user landed on in any analytics or public-facing context.

## Deployment (Azure Static Web Apps)

- Hosting: Azure Static Web Apps (Free tier).
- The `staticwebapp.config.json` handles SPA fallback and `noindex` headers.
- Build output is `dist/`. App location is `/`.
- Azure GitHub Actions workflow auto-deploys on push to `main`.
- Domain to configure: `therealending.com` (printed in the book — register this first).

## source_materials/ policy

`source_materials/` is in `.gitignore` and **must never be committed**. It contains the
manuscript, cover art, character bible, and final-scene art — local reference only.
