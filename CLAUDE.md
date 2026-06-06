# CLAUDE.md — Within Tolerance Book Site

## Commands

```
npm run dev       # start dev server (localhost:5173)
npm run build     # tsc + vite build → dist/
npm run preview   # preview the dist/ build locally
npm run lint      # eslint check
npx tsc -b        # type-check only (no emit)
```

## Project purpose

Marketing + payoff site for the novel **Within Tolerance**. The book ends unresolved — the
final printed line is `www.therealending.com`. This site delivers the real, varied endings.

## How the ending mechanic works

- `/therealending` — picks a random code from the registered endings, redirects (replace).
- `/therealending/:code` — permanent page. Always shows the same ending for that code.
- Codes are 4-char uppercase. `O/0` and `I/1/L` are interchangeable on input (normalized).
- Deep links work via SPA fallback in `staticwebapp.config.json`.

## How to add an ending

1. Write `src/content/endings/<slug>.md` in the book's voice (see style guide below).
2. Every ending must open with these exact two paragraphs:
   ```
   No one asked why they were there this time.
   The meeting had been called without an agenda, without a subject line, without the small procedural courtesies that usually softened bad news. That alone told them this wasn't another reconstruction.
   ```
3. Add an entry to `src/content/endings/index.ts`:
   ```ts
   import myEnding from "./my-ending.md?raw";
   // add to the endings array:
   { code: "XXXX", culprit: "Name", title: "Chapter 17 — The Real Ending", body: myEnding }
   ```
   The `title` is always `"Chapter 17 — The Real Ending"` for every ending — it must never
   vary or hint at the culprit.
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
