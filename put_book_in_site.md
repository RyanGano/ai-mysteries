# Plan: Put the book on the site

Goal: serve the full novel **Within Tolerance** from the site itself, with a
landing-page "Start reading" CTA, a slide-out Table of Contents drawer, per-chapter
Previous/Next navigation, and an end-of-book payoff that routes the reader to a
real ending.

## Status: implemented

All steps below are done. This file is kept as a record / handoff.

## Content extraction

- Source: `source_materials/Within_Tolerance_Clean.docx` (gitignored, local-only).
- One-off generator: `scripts/gen-book.cjs`.
  - Unzips the `.docx`, parses `word/document.xml` paragraph-by-paragraph.
  - Headings (`Prologue`, `Chapter N — Title`, `Epilogue`) are detected on the
    **plain** run text; chapter headings are bold in the manuscript, so detection
    must ignore the bold markers.
  - Body paragraphs preserve italic (`*`) and bold (`**`) runs as markdown. Bold
    is meaningful in Chapter 14 (the `T — 15` … `T — 0` countdown); italics appear
    twice (`Optimized for what?`, `Did they know what they were doing?`).
  - The book's final printed line, `www.therealending.com`, is stripped from the
    Epilogue — the reader supplies its own closing CTA instead.
  - Output: committed `src/content/book/<slug>.md` (one per chapter) + an
    `index.ts` registry. Slugs: `prologue`, `chapter-1` … `chapter-15`, `epilogue`.
- Re-run with `node scripts/gen-book.cjs` if the manuscript changes (needs the
  local `.docx`). The `.docx` is never committed (see `source_materials/` policy).

## Code

- `src/content/book/index.ts` — generated `chapters: Chapter[]` (`{ slug, title, body }`),
  in reading order.
- `src/lib/book.ts` — `chapters`, `firstChapterSlug`, `getChapter(slug)`,
  `getChapterNav(slug)` (resolves chapter + prev/next + isFirst/isLast).
- `src/components/TableOfContents.tsx` — left-sliding drawer. Lists every chapter;
  selecting one navigates and closes the drawer. Closes on overlay click and Escape.
- `src/routes/Read.tsx` — the reader. Top bar with a **Contents** button (opens the
  drawer) and a home link. Chapter title + `<Prose>` body (same renderer/look as
  endings). Prev/Next links. On the last chapter (Epilogue), a payoff block with a
  CTA to `/therealending` (weighted-random ending).
- `src/routes/Landing.tsx` — adds a primary **Start reading the book** CTA
  (`/read`) alongside the existing "Reveal your ending" CTA (now ghost-styled).
- `src/App.tsx` — routes: `/read` → redirect to first chapter; `/read/:slug` → `Read`.
- Styles: `src/styles/read.css` (reader + drawer), additions to `landing.css`
  (`.landing-ctas`, `.cta-button--primary`, `.cta-button--ghost`).

## Routes

```
/                -> landing (intro, cover, Start reading + Reveal ending CTAs)
/read            -> redirect to /read/prologue
/read/:slug      -> chapter page (drawer + Prev/Next; Epilogue shows the payoff CTA)
/therealending   -> existing weighted-random ending picker
```

## Notes / not in scope

- The site remains `noindex` globally (`staticwebapp.config.json`). If the book
  should be discoverable for marketing/SEO, that header would need revisiting —
  but it also covers the endings, so leave as-is unless asked.
- Scene breaks in the manuscript are standalone `—` paragraphs; they render as-is.
