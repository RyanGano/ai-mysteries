// Generator for the cross-reference ("spot the clue") data.
//
// Source of truth: docs/EndingClueMap.md (gitignored spoiler artifact). Two of its
// sections drive two committed artifacts under ai-mysteries-api/Content/within-tolerance/:
//
//   * Clue Library                       -> clues.json        (clueId -> { chapter, quote })
//   * Marker placement (annotated …)     -> xref-markers.json (endingCode -> { slug, markers })
//
// Run with:  node scripts/gen-xrefs.cjs   (from the repo root)
//
// The .md doc is never committed (see source_materials / docs policy in CLAUDE.md), so this
// script only runs locally where the doc is present. The generated .json files ARE committed
// and loaded at runtime by the .NET API.
//
// See docs/cross_reference.md for the design and the matching contract this implements.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SNIPPET_LEN = 40; // chars of body kept before each marker, for drift detection at runtime
const DOC = path.join(ROOT, "docs", "EndingClueMap.md");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content", "within-tolerance");
const ENDINGS_DIR = path.join(CONTENT, "endings");
const BOOK_DIR = path.join(CONTENT, "book");

function readBody(dir, slug) {
  const p = path.join(dir, `${slug}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

// --- Section slicing ---------------------------------------------------------

function sliceSection(lines, startRe, stopRe) {
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (!inside) {
      if (startRe.test(line)) inside = true;
      continue;
    }
    if (stopRe && stopRe.test(line)) break;
    out.push(line);
  }
  return out;
}

// --- Clue Library ------------------------------------------------------------
// Expected shape (illustrative placeholders, not real data):
// ### Chapter N — <Suspect> — `/read/chapter-N`
// - **CN-EXAMPLE** — “…verbatim quote…”
// - **CN-OTHER** *(added crumb)* — “…”

function parseClueLibrary(lines) {
  const section = sliceSection(lines, /^## Clue Library\s*$/, /^#{1,2} (?!#)/);
  const clues = {};
  let chapterSlug = null;
  let chapterTitle = null;

  const headingRe = /^### (.+?) — `(\/read\/[^`]+)`\s*$/;
  const bulletRe = /^- \*\*([A-Z0-9-]+)\*\*(?:\s*\*\([^)]*\)\*)?\s*— (.+)$/;

  for (const line of section) {
    const h = line.match(headingRe);
    if (h) {
      chapterTitle = h[1].trim();
      chapterSlug = h[2].replace("/read/", "");
      continue;
    }
    const b = line.match(bulletRe);
    if (b && chapterSlug) {
      const id = b[1];
      const raw = b[2];
      const a = raw.indexOf("“"); // “
      const z = raw.lastIndexOf("”"); // ”
      const quote = a !== -1 && z !== -1 ? raw.slice(a + 1, z) : raw.trim();
      clues[id] = { id, chapterSlug, chapterTitle, quote };
    }
  }
  return clues;
}

// --- Marker placement --------------------------------------------------------
// Expected shape (illustrative placeholders, not real data):
// - **XXXX** `some-ending-slug` — "excerpt [CN-EXAMPLE]" … "excerpt [CN-OTHER]"
//
// Anchor for each [CLUE-ID] = the contiguous verbatim run immediately before the marker,
// bounded by the nearest preceding `…` elision or the excerpt's quote boundary. Endings use
// straight quotes; inner double quotes inside an excerpt are escaped as \".

function parseMarkerSegments(rest) {
  const out = [];
  const segRe = /"((?:[^"\\]|\\.)*)"/g; // a wrapper-quoted excerpt, honoring \" escapes
  let sm;
  while ((sm = segRe.exec(rest))) {
    const seg = sm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const markerRe = /\[([A-Z0-9-]+)\]/g;
    let boundary = 0;
    let mm;
    while ((mm = markerRe.exec(seg))) {
      let pre = seg.slice(boundary, mm.index);
      const lastEll = pre.lastIndexOf("…"); // …
      if (lastEll !== -1) pre = pre.slice(lastEll + 1);
      const anchor = pre.trim();
      if (anchor) out.push({ anchor, clueId: mm[1] });
      boundary = markerRe.lastIndex;
    }
  }
  return out;
}

const QUOTE_EDGE = /^[\s'"“”‘’]+|[\s'"“”‘’]+$/g;
const TRAIL_QUOTE = /['"“”‘’]/;

// Locate where the glyph should be inserted for `anchor` within `body`.
// The annotated excerpts in EndingClueMap.md are near-verbatim but wrap reveal phrases in
// speech quotes whose placement doesn't always line up with the ending's punctuation, so we
// try progressively looser candidates. Returns the insertion index (end of match), or -1.
function locate(anchor, body) {
  const trimmed = anchor.trim();
  const stripped = trimmed.replace(QUOTE_EDGE, "");
  const candidates = [
    trimmed,
    trimmed.replace(/['"“”‘’]+$/, "").trim(), // drop doc's trailing speech quote
    trimmed.replace(/^['"“”‘’]+/, "").trim(), // drop doc's leading speech quote
    stripped, // drop both
  ];
  // Tier 1/2: exact substring of a full candidate, preferring a unique match.
  let firstHit = -1;
  for (const c of candidates) {
    if (!c) continue;
    const i = body.indexOf(c);
    if (i === -1) continue;
    if (firstHit === -1) firstHit = i + c.length;
    if (body.indexOf(c, i + 1) === -1) return advancePastQuotes(body, i + c.length);
  }
  if (firstHit !== -1) return advancePastQuotes(body, firstHit);

  // Tier 3: the excerpt was paraphrased mid-phrase. Fall back to the last whole sentence of
  // the stripped anchor that still appears in the body (places the glyph at the reveal's end).
  const sentences = stripped.split(/(?<=[.?!"”’])\s+/).filter(Boolean);
  for (let n = sentences.length; n >= 1; n--) {
    const tail = sentences.slice(sentences.length - n).join(" ");
    const i = body.indexOf(tail);
    if (i !== -1) return advancePastQuotes(body, i + tail.length);
  }
  // Tier 4: longest word-suffix of the stripped anchor that appears in the body.
  const words = stripped.split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length - 1; start++) {
    const suffix = words.slice(start).join(" ");
    const i = body.indexOf(suffix);
    if (i !== -1) return advancePastQuotes(body, i + suffix.length);
  }
  return -1;
}

function advancePastQuotes(body, end) {
  while (end < body.length && TRAIL_QUOTE.test(body[end])) end++;
  return end;
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

// Resolve a Library quote to the verbatim chapter paragraph(s) it covers. A quote may join
// non-contiguous lines with a " … " elision, and a single fragment may itself span several
// dialogue paragraphs (separated by \n\n in the manuscript but by spaces in the doc), so we
// match on whitespace-normalized text and map back to the real paragraphs that overlap.
function resolvePassages(body, quote) {
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const normParas = paras.map(norm);
  const full = normParas.join(" ");
  const offsets = [];
  let pos = 0;
  for (const np of normParas) {
    offsets.push([pos, pos + np.length]);
    pos += np.length + 1; // +1 for the join space
  }

  // Strip the speech quotes the doc wraps fragments in (their placement doesn't always match
  // the manuscript's punctuation — the phrase is often mid-paragraph there).
  const fragments = quote
    .split(/\s+…\s+/)
    .map((f) => f.replace(QUOTE_EDGE, "").trim())
    .filter(Boolean);
  const chosen = new Set();
  const missing = [];
  for (const frag of fragments) {
    const nf = norm(frag);
    const i = full.indexOf(nf);
    if (i === -1) {
      missing.push(frag);
      continue;
    }
    const lo = i;
    const hi = i + nf.length;
    offsets.forEach((o, idx) => {
      if (o[0] < hi && o[1] > lo) chosen.add(idx);
    });
  }
  const passages = [...chosen].sort((a, b) => a - b).map((idx) => paras[idx]);
  return { passages, fragments, missing };
}

function parseMarkerPlacement(lines, warnings) {
  const section = sliceSection(lines, /^## Marker placement/, null);
  const byCode = {};
  const bulletRe = /^- \*\*([A-Z0-9]{4})\*\* `([^`]+)`(.*)$/;

  for (const line of section) {
    const m = line.match(bulletRe);
    if (!m) continue;
    const [, code, slug, rest] = m;
    const body = readBody(ENDINGS_DIR, slug);
    if (body == null) {
      warnings.push(`Marker placement: no ending file for ${code} (${slug}.md)`);
      continue;
    }
    const segs = parseMarkerSegments(rest);
    const markers = [];
    const seen = new Set();
    for (const { anchor, clueId } of segs) {
      const index = locate(anchor, body);
      if (index === -1) {
        warnings.push(`${code} (${slug}): could not place ${clueId}; excerpt drifted from prose:\n    "${anchor}"`);
        continue;
      }
      const key = `${clueId}@${index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const snippet = body.slice(Math.max(0, index - SNIPPET_LEN), index);
      markers.push({ clueId, index, snippet });
    }
    markers.sort((a, b) => a.index - b.index);
    if (markers.length) byCode[code] = { slug, markers };
  }
  return byCode;
}

// --- Emit --------------------------------------------------------------------

function emit() {
  const raw = fs.readFileSync(DOC, "utf8");
  const lines = raw.split(/\r?\n/);
  const warnings = [];

  const allClues = parseClueLibrary(lines);
  const byCode = parseMarkerPlacement(lines, warnings);

  // Only ship clues actually referenced by a marker.
  const used = new Set();
  for (const code of Object.keys(byCode)) {
    for (const mk of byCode[code].markers) used.add(mk.clueId);
  }

  const clues = {};
  for (const id of [...used].sort()) {
    const c = allClues[id];
    if (!c) {
      warnings.push(`Marker references unknown clue id "${id}" (not in Clue Library)`);
      continue;
    }
    const body = readBody(BOOK_DIR, c.chapterSlug);
    if (body == null) {
      warnings.push(`Clue ${id}: no chapter file ${c.chapterSlug}.md`);
      continue;
    }
    const { passages, fragments, missing } = resolvePassages(body, c.quote);
    for (const frag of missing) {
      warnings.push(`Clue ${id}: fragment not found in ${c.chapterSlug}.md (manuscript drift?):\n    "${frag}"`);
    }
    clues[id] = {
      chapterSlug: c.chapterSlug,
      chapterTitle: c.chapterTitle,
      passages,
      fragments,
    };
  }

  // Emit plain JSON consumed by the .NET API at runtime.
  //   clues.json        — keyed by clue id; { chapterSlug, chapterTitle, passages[], fragments[] }
  //   xref-markers.json — keyed by canonical ending code; { slug, markers[] }
  fs.writeFileSync(path.join(CONTENT, "clues.json"), JSON.stringify(clues, null, 2) + "\n");
  fs.writeFileSync(path.join(CONTENT, "xref-markers.json"), JSON.stringify(byCode, null, 2) + "\n");

  const markerCount = Object.values(byCode).reduce((n, e) => n + e.markers.length, 0);
  console.log(
    `Wrote clues.json (${Object.keys(clues).length} clues) and xref-markers.json ` +
      `(${Object.keys(byCode).length} endings, ${markerCount} markers).`
  );
  if (warnings.length) {
    console.warn(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }
}

emit();
