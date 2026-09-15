// Catalog census — sorts every shipped book along a set of "lenses" (who solves it, what goes wrong,
// era, setting, method, story shape, motives, …) and measures where the catalog is clustering.
//
//   node scripts/census.cjs                      # text report: crowded / thin / unused buckets per lens
//   node scripts/census.cjs --check              # only list books that still need classifying (exit 1 if any)
//   node scripts/census.cjs --dossier <bookId>   # compact design-doc digest for classifying one book
//   node scripts/census.cjs --html <file>        # render the interactive census page to <file>
//   node scripts/census.cjs --json               # the metrics as JSON
//
// The classifications are judgement, so they live in data, not here: docs/catalog-census.json
// (gitignored — several lenses describe how endings resolve, which is spoiler territory). This script
// is book-blind: lens names, bucket ids and labels all come from that file, so adding a brand-new
// bucket or a brand-new lens is a data edit, never a code edit.
// Procedure: .claude/skills/catalog-census/SKILL.md.
//
// Data shape (docs/catalog-census.json):
//   { "updated": "YYYY-MM-DD",
//     "lenses": [ { "key", "name", "question", "multi"?: bool,
//                   "computed"?: { "from": "words", "cuts": [3000, 5000, 8000] },   // bucket i = below cut i
//                   "only"?: { "lens": "<key>", "in": ["<bucket id>", …] },          // lens applies to a subset
//                   "buckets": [ { "id", "label", "def"? } ] } ],
//     "books": { "<bookId>": { "<lens key>": "<bucket id>" | ["<id>", …] | "-" } } }
// "-" means "not recorded" (e.g. the detective's age is never stated) and simply doesn't vote.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");
const DATA = path.join(ROOT, "docs", "catalog-census.json");
const REGISTRY = path.join(ROOT, "docs", "book-registry.md");
const RECENT = 20; // "last N shipped" window for drift

const rd = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
};
const clip = (s, n) => s.replace(/\s+/g, " ").trim().slice(0, n);
const pct = (x) => `${Math.round(x * 100)}%`;

// --- Loading -----------------------------------------------------------------

function loadCatalog() {
  if (!fs.existsSync(CONTENT)) throw new Error("no ai-mysteries-api/Content — run this in a working copy with book data");
  return fs
    .readdirSync(CONTENT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT, d.name, "meta.json")))
    .map((d) => {
      const meta = JSON.parse(rd(path.join(CONTENT, d.name, "meta.json")));
      let endings = [];
      try {
        endings = JSON.parse(rd(path.join(CONTENT, d.name, "endings.json")));
      } catch {}
      return {
        id: d.name,
        title: meta.title || d.name,
        published: meta.published || "",
        words: meta.wordCount || 0,
        endings: endings.length,
        tags: meta.tags || [],
      };
    });
}

function loadData() {
  if (!fs.existsSync(DATA)) throw new Error(`no ${path.relative(ROOT, DATA)} — it's gitignored; create it per the catalog-census skill`);
  const data = JSON.parse(rd(DATA));
  if (!Array.isArray(data.lenses) || !data.books) throw new Error("catalog-census.json needs `lenses` (array) and `books` (object)");
  return data;
}

// --- Classification helpers --------------------------------------------------

function valueOf(lens, row) {
  if (lens.computed) {
    const x = row[lens.computed.from];
    if (typeof x !== "number") return [];
    const i = lens.computed.cuts.findIndex((c) => x < c);
    return [lens.buckets[i === -1 ? lens.buckets.length - 1 : i].id];
  }
  const v = row.census[lens.key];
  if (v == null || v === "-") return [];
  return Array.isArray(v) ? v.filter((x) => x !== "-") : [v];
}

function inScope(lens, row) {
  if (!lens.only) return true;
  const v = row.census[lens.only.lens];
  return lens.only.in.includes(v);
}

function validate(data, catalog) {
  const problems = [];
  const known = new Set(catalog.map((b) => b.id));
  const unclassified = catalog.filter((b) => !data.books[b.id]).map((b) => b.id);
  const stale = Object.keys(data.books).filter((id) => !known.has(id));
  for (const [id, entry] of Object.entries(data.books)) {
    for (const lens of data.lenses) {
      if (lens.computed) continue;
      const ids = new Set(lens.buckets.map((b) => b.id));
      const v = entry[lens.key];
      if (v === undefined) {
        problems.push(`${id}: no value for lens "${lens.key}" (use "-" if it genuinely can't be recorded)`);
        continue;
      }
      for (const x of Array.isArray(v) ? v : [v]) {
        if (x !== "-" && !ids.has(x)) problems.push(`${id}: "${x}" is not a bucket of lens "${lens.key}" — add the bucket to the lens first`);
      }
    }
  }
  return { unclassified, stale, problems };
}

// --- Metrics -------------------------------------------------------------------
// Every threshold is relative to how many buckets a lens has, so a 2-bucket lens and an 11-bucket lens
// are judged fairly. With K buckets a perfectly even catalog puts 1/K of books in each (m/K for a
// multi-value lens where a book carries m values on average).
//   crowded  share >= min(1.8 x even, even + 15 pts), and at least 3 books
//   thin     1..max(1, 30% of an even share) books
//   unused   0 books — a bucket someone defined but no book has tried yet
// "evenness" is the effective number of buckets (1 / sum of squared shares) divided by K: 1.0 is a
// perfectly flat spread, and anything under ~0.6 means a few buckets are carrying the lens.

function lensStats(lens, rows) {
  const scoped = rows.filter((r) => inScope(lens, r));
  const recorded = scoped.map((r) => ({ r, v: valueOf(lens, r) })).filter((x) => x.v.length);
  const n = recorded.length;
  const K = lens.buckets.length;
  const counts = Object.fromEntries(lens.buckets.map((b) => [b.id, 0]));
  let selections = 0;
  for (const { v } of recorded) for (const id of v) (counts[id] = (counts[id] || 0) + 1), selections++;
  const m = n ? selections / n : 1;
  const even = m / K;
  const crowdedAt = Math.min(1.8 * even, even + 0.15);
  const thinMax = Math.max(1, Math.floor(0.3 * n * even));
  const sumSq = selections ? Object.values(counts).reduce((s, c) => s + (c / selections) ** 2, 0) : 1;
  const evenness = selections ? 1 / sumSq / K : 0;

  const recent = recorded.slice().sort((a, b) => (b.r.published || "").localeCompare(a.r.published || "")).slice(0, RECENT);
  const buckets = lens.buckets
    .map((b) => {
      const count = counts[b.id] || 0;
      const share = n ? count / n : 0;
      const recentShare = recent.length ? recent.filter((x) => x.v.includes(b.id)).length / recent.length : 0;
      const state = count === 0 ? "unused" : share >= crowdedAt && count >= 3 ? "crowded" : count <= thinMax ? "thin" : "ok";
      return { id: b.id, label: b.label, def: b.def || "", count, share, recentShare, state, books: recorded.filter((x) => x.v.includes(b.id)).map((x) => x.r.id) };
    })
    .sort((a, b) => b.count - a.count);
  return { key: lens.key, name: lens.name, question: lens.question || "", multi: !!lens.multi, scope: scoped.length, n, K, even, crowdedAt, thinMax, evenness, buckets };
}

// How "default" each book is: the mean share of the buckets it sits in, across single-value lenses.
// A book scoring high is the catalog's centre of gravity — the shape a new book slides toward by habit.
function typicality(stats, rows) {
  const single = stats.filter((s) => !s.multi);
  return rows
    .map((r) => {
      let sum = 0,
        k = 0;
      for (const s of single) {
        const b = s.buckets.find((x) => x.books.includes(r.id));
        if (b) (sum += b.share), k++;
      }
      return { id: r.id, title: r.title, score: k ? sum / k : 0 };
    })
    .sort((a, b) => b.score - a.score);
}

function build() {
  const data = loadData();
  const catalog = loadCatalog();
  const check = validate(data, catalog);
  const rows = catalog.filter((b) => data.books[b.id]).map((b) => ({ ...b, census: data.books[b.id] }));
  const stats = data.lenses.map((l) => lensStats(l, rows));
  return { data, catalog, check, rows, stats, typical: typicality(stats, rows) };
}

// --- Dossier -------------------------------------------------------------------
// Everything needed to classify one book, without reading its manuscript: its registry row, the
// detective/victim sections of the character bible, the ending matrix table (culprits · resolution ·
// mechanism), and the first lines of chapter one.

function sections(md) {
  const out = [];
  const re = /^##+ (.+)$/gm;
  let m, last = null;
  while ((m = re.exec(md))) {
    if (last) last.body = md.slice(last.end, m.index);
    last = { h: m[1], end: re.lastIndex };
    out.push(last);
  }
  if (last) last.body = md.slice(last.end);
  return out;
}

function dossier(id) {
  const docs = path.join(ROOT, "docs", id);
  const out = [];
  const meta = JSON.parse(rd(path.join(CONTENT, id, "meta.json")) || "null");
  if (!meta) throw new Error(`no Content/${id}/meta.json`);
  let endings = [];
  try {
    endings = JSON.parse(rd(path.join(CONTENT, id, "endings.json")));
  } catch {}
  out.push(`# ${meta.title} (${id}) — ${meta.wordCount} words · ${endings.length} endings · published ${meta.published} · tags: ${(meta.tags || []).join(", ")}`);
  const reg = rd(REGISTRY).split(/\r?\n/).find((l) => l.includes(`| ${id} |`));
  if (reg) out.push(`\nREGISTRY: ${clip(reg, 1800)}`);

  const cb = rd(path.join(docs, "CharacterBible.md"));
  const outline = rd(path.join(docs, "Outline.md")) + rd(path.join(docs, "Design.md"));
  const secs = sections(cb);
  const det = secs.find((s) => /detective|sleuth|narrator|investigator/i.test(s.h));
  const vic = secs.find((s) => /victim|the dead|missing|subject/i.test(s.h));
  if (det) out.push(`\nDETECTIVE: ${det.h} :: ${clip(det.body, 500)}`);
  else {
    const i = outline.search(/^#+.*(detective|sleuth)|\*\*detective/im);
    out.push(`\nDETECTIVE (outline): ${i < 0 ? "not found — check Outline.md" : clip(outline.slice(i, i + 500), 500)}`);
  }
  if (vic) out.push(`VICTIM/SUBJECT: ${vic.h} :: ${clip(vic.body, 400)}`);

  const em = rd(path.join(docs, "EndingMatrix.md")) || rd(path.join(docs, "Design.md"));
  let hdr = null;
  const tableRows = [];
  for (const l of em.split(/\r?\n/).filter((x) => x.startsWith("|"))) {
    const cells = l.split("|").slice(1, -1).map((c) => c.trim());
    if (!hdr && cells.some((c) => /culprit/i.test(c))) {
      hdr = cells;
      continue;
    }
    if (hdr && cells.length >= hdr.length - 1 && !/^:?-+:?$/.test(cells[0])) tableRows.push(cells);
  }
  if (hdr) {
    const ci = hdr.findIndex((c) => /culprit/i.test(c));
    const ri = hdr.findIndex((c) => /resolution|kind/i.test(c));
    const mi = hdr.findIndex((c) => /mechanism|what|motive|summary|one line/i.test(c));
    out.push("\nENDINGS (culprits | resolution | mechanism):");
    for (const r of tableRows) out.push(`  ${clip(r[ci] || "", 50)} | ${clip(r[ri] || "", 60)} | ${clip(r[mi] || "", 160)}`);
  } else {
    out.push("\nENDINGS: no matrix table found — culprit sets from endings.json:");
    out.push("  " + endings.map((e) => e.culprits.join(" + ") + (e.special ? " (special)" : "")).join(" | "));
  }

  try {
    const chapters = JSON.parse(rd(path.join(CONTENT, id, "book.json")));
    const first = rd(path.join(CONTENT, id, "book", `${chapters[0].slug}.md`)).replace(/^#.*\n/, "");
    out.push(`\nCHAPTER 1 OPENS: ${clip(first, 400)}`);
  } catch {}
  return out.join("\n");
}

// --- Report --------------------------------------------------------------------

function report(b) {
  const { data, check, rows, stats, typical } = b;
  const L = [];
  L.push(`CATALOG CENSUS — ${rows.length} classified books · ${stats.length} lenses · data updated ${data.updated || "?"}`);
  if (check.unclassified.length) L.push(`!! ${check.unclassified.length} shipped book(s) not classified yet: ${check.unclassified.join(", ")}\n   → node scripts/census.cjs --dossier <bookId>, then add them to docs/catalog-census.json`);
  if (check.stale.length) L.push(`!! in the census but not in Content/: ${check.stale.join(", ")}`);
  for (const p of check.problems) L.push(`!! ${p}`);
  L.push("");

  for (const s of stats) {
    const scope = s.scope !== rows.length ? ` of ${s.scope} in scope` : "";
    L.push(`${s.name.toUpperCase()}  — ${s.n} recorded${scope} · ${s.K} buckets · evenness ${s.evenness.toFixed(2)}${s.multi ? " · multi-value" : ""}`);
    for (const x of s.buckets) {
      const flag = { crowded: "CROWDED", thin: "thin   ", unused: "UNUSED ", ok: "       " }[x.state];
      const drift = x.state === "crowded" || x.state === "thin" ? `   last ${RECENT}: ${pct(x.recentShare)}` : "";
      L.push(`  ${flag}  ${x.label.padEnd(44).slice(0, 44)} ${String(x.count).padStart(3)}  ${pct(x.share).padStart(4)}${drift}`);
    }
    L.push(`  (crowded at ≥ ${pct(s.crowdedAt)}; thin at ≤ ${s.thinMax} book${s.thinMax === 1 ? "" : "s"})\n`);
  }

  L.push("LENSES FROM MOST LOPSIDED TO MOST EVEN");
  for (const s of stats.slice().sort((a, b) => a.evenness - b.evenness)) {
    const top = s.buckets[0];
    L.push(`  ${s.evenness.toFixed(2)}  ${s.name.padEnd(34)} top: ${top.label} (${pct(top.share)})`);
  }
  L.push("\nTHE DEFAULT BOOK — the biggest bucket on every single-value lens:");
  for (const s of stats.filter((x) => !x.multi)) L.push(`  ${s.name.padEnd(34)} ${s.buckets[0].label}`);
  L.push("\nMOST TYPICAL SHIPPED BOOKS (mean share of the buckets they sit in):");
  for (const t of typical.slice(0, 8)) L.push(`  ${t.score.toFixed(2)}  ${t.title}`);
  return L.join("\n");
}

// --- HTML --------------------------------------------------------------------------

function html(b) {
  const payload = {
    updated: b.data.updated || "",
    books: b.rows.map((r) => ({ id: r.id, title: r.title, words: r.words, endings: r.endings, census: r.census })),
    stats: b.stats.map((s) => ({ ...s, buckets: s.buckets })),
    typical: b.typical.slice(0, 6),
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<title>The Casebook Census</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--ground:#EDF0F1;--panel:#F8FAFA;--ink:#17212B;--ink-2:#4A5763;--ink-3:#6F7B86;--rule:#D3D9DD;--bar:#35607F;--bar-soft:#C7D6E0;--tag:#E2A300;--tag-ink:#2A1F00;--hot:#A8461B;--hot-soft:#F3DDD2;--cool:#2F6E62;--cool-soft:#D5EAE4;--focus:#1F6FB2;
--display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;--body:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#11171D;--panel:#18212A;--ink:#E4EAEE;--ink-2:#A9B5BF;--ink-3:#8491A0;--rule:#2A3641;--bar:#7FAACB;--bar-soft:#2C4256;--tag:#F0B72F;--tag-ink:#1C1400;--hot:#F09A6E;--hot-soft:#4A2A1C;--cool:#7CCFBC;--cool-soft:#1D3B35;--focus:#8CC2F0}}
:root[data-theme="dark"]{--ground:#11171D;--panel:#18212A;--ink:#E4EAEE;--ink-2:#A9B5BF;--ink-3:#8491A0;--rule:#2A3641;--bar:#7FAACB;--bar-soft:#2C4256;--tag:#F0B72F;--tag-ink:#1C1400;--hot:#F09A6E;--hot-soft:#4A2A1C;--cool:#7CCFBC;--cool-soft:#1D3B35;--focus:#8CC2F0}
*{box-sizing:border-box}
body{background:var(--ground);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5;margin:0;padding-inline:clamp(16px,4vw,48px);padding-block:32px 64px}
.wrap{max-width:1240px;margin:0 auto}
header{display:grid;gap:14px;border-bottom:2px solid var(--ink);padding-bottom:20px;margin-bottom:22px}
.stamp{font-family:var(--mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)}
h1{font-family:var(--display);font-weight:800;font-size:clamp(34px,5.4vw,60px);line-height:.95;margin:0;letter-spacing:-.02em;text-wrap:balance}
.lede{max-width:70ch;color:var(--ink-2);margin:0}
.facts{display:flex;flex-wrap:wrap;gap:8px 28px;font-family:var(--mono);font-size:13px;color:var(--ink-2)}
.facts b{font-weight:500;color:var(--ink);font-size:15px}
.tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:22px}
.tools label{font-size:13px;color:var(--ink-2)}
select,button{font:inherit;color:var(--ink)}
select{background:var(--panel);border:1px solid var(--rule);border-radius:4px;padding:7px 10px;max-width:100%}
.clear{background:none;border:1px solid var(--rule);border-radius:4px;padding:6px 10px;cursor:pointer}
.legend{display:flex;flex-wrap:wrap;gap:10px;font-size:12.5px;color:var(--ink-2)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}
@media (max-width:420px){.grid{grid-template-columns:1fr}}
.lens{background:var(--panel);border:1px solid var(--rule);border-radius:6px;padding:16px 16px 12px}
.lens h2{font-family:var(--display);font-weight:600;font-size:19px;margin:0;line-height:1.15}
.lens p.q{margin:2px 0 12px;font-size:13px;color:var(--ink-3)}
.even{font-family:var(--mono)}
.rows{display:grid;gap:3px}
.row{display:grid;grid-template-columns:minmax(0,1fr) 110px 30px;gap:10px;align-items:center;width:100%;text-align:left;background:none;border:0;border-radius:4px;padding:4px 6px;cursor:pointer}
.row:hover{background:color-mix(in srgb,var(--bar-soft) 45%,transparent)}
.row:focus-visible,select:focus-visible,.clear:focus-visible,.chip:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.row .lab{font-size:13.5px;line-height:1.25}
.track{height:10px;position:relative}
.fill{position:absolute;left:0;top:0;bottom:0;background:var(--bar);border-radius:0 4px 4px 0;min-width:2px}
.row .n{font-family:var(--mono);font-size:13px;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.pill{display:inline-block;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;border-radius:3px;padding:0 5px;margin-left:6px;vertical-align:1px}
.pill.crowded{background:var(--hot-soft);color:var(--hot)}
.pill.thin{background:var(--cool-soft);color:var(--cool)}
.row.crowded .fill{background:var(--hot)}
.row.mine{background:color-mix(in srgb,var(--tag) 24%,transparent)}
.row.mine .lab::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--tag);margin-right:6px;vertical-align:1px}
.row[aria-expanded="true"]{background:color-mix(in srgb,var(--bar-soft) 70%,transparent)}
.books{display:flex;flex-wrap:wrap;gap:5px;padding:8px 6px 10px}
.def{flex-basis:100%;font-size:12px;color:var(--ink-3);margin:0 0 2px}
.chip{font-size:12px;border:1px solid var(--rule);background:var(--ground);border-radius:3px;padding:2px 7px;cursor:pointer;color:var(--ink)}
.chip.sel{background:var(--tag);color:var(--tag-ink);border-color:var(--tag)}
.unused{font-size:12px;color:var(--ink-3);margin:10px 6px 0}
.unused b{font-weight:500;color:var(--cool)}
footer{margin-top:34px;border-top:1px solid var(--rule);padding-top:14px;font-size:13px;color:var(--ink-3);max-width:80ch}
</style>
<div class="wrap">
<header>
  <div class="stamp">AI Mysteries · catalog census · private — contains ending spoilers</div>
  <h1>The Casebook Census</h1>
  <p class="lede">Every shipped book, sorted many ways. Each panel is one lens with its buckets largest first. <b>Crowded</b> buckets hold far more than an even share; <b>thin</b> ones barely register; buckets no book has tried are listed under each panel. Click a bucket for its books, or trace one book through every panel.</p>
  <div class="facts" id="facts"></div>
</header>
<div class="tools">
  <label for="pick">Trace one book</label>
  <select id="pick"><option value="">— choose a book —</option></select>
  <button class="clear" id="clear" type="button">Clear</button>
  <span class="legend"><span><span class="pill crowded">crowded</span> steer away</span><span><span class="pill thin">thin</span> room to grow</span><span>evenness 1.00 = a flat spread</span></span>
</div>
<div class="grid" id="grid"></div>
<footer>Built by <code>node scripts/census.cjs --html</code> from <code>docs/catalog-census.json</code> (classifications) and each book's <code>meta.json</code> / <code>endings.json</code>. Crowded = at least min(1.8× an even share, an even share + 15 points); thin = at most 30% of an even share. Multi-value lenses count a book once in every bucket it uses. The steering that follows from this page lives in <code>docs/catalog-steering.md</code>.</footer>
</div>
<script>
const D=${json};
const $=s=>document.querySelector(s);let picked="",open={};
const mins=w=>Math.max(1,Math.round(w/250));
const words=D.books.reduce((s,b)=>s+b.words,0), sorted=D.books.map(b=>b.words).sort((a,b)=>a-b);
$("#facts").innerHTML=[["Books",D.books.length],["Endings",D.books.reduce((s,b)=>s+b.endings,0)],["Words",words.toLocaleString()],["Median read",mins(sorted[Math.floor(sorted.length/2)])+" min"],["Lenses",D.stats.length],["Updated",D.updated]].map(([k,v])=>"<span>"+k+" <b>"+v+"</b></span>").join("");
const pick=$("#pick");D.books.slice().sort((a,b)=>a.title.replace(/^The /,"").localeCompare(b.title.replace(/^The /,""))).forEach(b=>pick.insertAdjacentHTML("beforeend",'<option value="'+b.id+'">'+b.title.replace(/</g,"&lt;")+"</option>"));
const byId=Object.fromEntries(D.books.map(b=>[b.id,b]));
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function render(){
 const grid=$("#grid");grid.innerHTML="";
 for(const s of D.stats){
  const used=s.buckets.filter(b=>b.count), max=used.length?used[0].count:1;
  const sec=el("section","lens");
  sec.append(el("h2",null,s.name));
  const q=el("p","q");q.innerHTML=(s.question?s.question.replace(/</g,"&lt;")+" · ":"")+s.n+" books · "+used.length+"/"+s.K+" buckets used · evenness <span class=even>"+s.evenness.toFixed(2)+"</span>";sec.append(q);
  const rows=el("div","rows");sec.append(rows);
  used.forEach(g=>{
   const mine=picked&&g.books.includes(picked), isOpen=open[s.key]===g.id;
   const btn=el("button","row"+(g.state==="crowded"?" crowded":"")+(mine?" mine":""));btn.type="button";
   btn.setAttribute("aria-expanded",isOpen);
   btn.title=g.count+" of "+s.n+" ("+Math.round(g.share*100)+"%) · last 20 shipped: "+Math.round(g.recentShare*100)+"%";
   const lab=el("span","lab",g.label);if(g.state==="crowded"||g.state==="thin")lab.append(el("span","pill "+g.state,g.state));
   const track=el("span","track"),fill=el("span","fill");fill.style.width=(g.count/max*100)+"%";track.append(fill);
   btn.append(lab,track,el("span","n",g.count));
   btn.onclick=()=>{open[s.key]=isOpen?null:g.id;render()};
   rows.append(btn);
   if(isOpen){const d=el("div","books");if(g.def)d.append(el("p","def",g.def));
    g.books.map(id=>byId[id]).forEach(b=>{const c=el("button","chip"+(b.id===picked?" sel":""),b.title);c.type="button";c.title=mins(b.words)+" min · "+b.endings+" endings";c.onclick=()=>{picked=b.id;pick.value=b.id;render()};d.append(c)});
    rows.append(d);}
  });
  const none=s.buckets.filter(b=>!b.count);
  if(none.length){const u=el("p","unused");u.innerHTML="<b>Never tried:</b> "+none.map(b=>b.label.replace(/</g,"&lt;")).join(" · ");sec.append(u)}
  grid.append(sec);
 }
}
pick.onchange=()=>{picked=pick.value;render()};
$("#clear").onclick=()=>{picked="";pick.value="";open={};render()};
render();
</script>
`;
}

// --- CLI ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true;
  };

  const d = flag("dossier");
  if (d) {
    if (d === true) throw new Error("--dossier needs a bookId");
    console.log(dossier(d));
    return;
  }

  const b = build();
  if (flag("check")) {
    const { unclassified, stale, problems } = b.check;
    if (!unclassified.length && !stale.length && !problems.length) console.log(`census OK — all ${b.catalog.length} shipped books classified on ${b.stats.length} lenses`);
    if (unclassified.length) console.log(`needs classifying (${unclassified.length}): ${unclassified.join(", ")}`);
    if (stale.length) console.log(`in the census but not shipped: ${stale.join(", ")}`);
    problems.forEach((p) => console.log(p));
    process.exit(unclassified.length || problems.length ? 1 : 0);
  }
  const out = flag("html");
  if (out) {
    if (out === true) throw new Error("--html needs an output path (write it outside the repo, e.g. the session scratchpad)");
    fs.writeFileSync(out, html(b));
    console.log(`wrote ${out} — ${b.rows.length} books, ${b.stats.length} lenses`);
    return;
  }
  if (flag("json")) {
    console.log(JSON.stringify({ updated: b.data.updated, check: b.check, stats: b.stats.map(({ buckets, ...s }) => ({ ...s, buckets: buckets.map(({ books, ...x }) => x) })), typical: b.typical.slice(0, 10) }, null, 2));
    return;
  }
  console.log(report(b));
}

try {
  main();
} catch (err) {
  console.error(`census: ${err.message}`);
  process.exit(2);
}
