// Distinctness Contract dice-roller — proposes candidate axis combinations for a new book.
//
//   node scripts/pick-axes.cjs --audience adult --type lost
//   node scripts/pick-axes.cjs --audience kid --setting "1890s canal barge" --count 3
//   node scripts/pick-axes.cjs --seed 42                      # reproducible
//   node scripts/pick-axes.cjs --list                         # the menus and how crowded each is
//
// Why a script instead of judgement: the crowded axes (detective method, structure spine) are
// exactly where a language model mode-seeks. Left to pick freely it reaches for the same few
// shapes, which is how four cozies ended up as one template find-replaced and had to be de-cloned.
// Sampling doesn't have a favourite. It also makes the >=3-axis gate deterministic instead of an
// honour check.
//
// What this does NOT decide: the setting (the queue premise owns that), the story itself, or
// whether a combination is any good for THIS premise. It proposes; the author disposes. If all the
// candidates are wrong for the premise, re-run — the whole search is local and costs nothing.
//
// The scoring is deliberately transparent: every number printed can be traced to a rule below.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REGISTRY = path.join(ROOT, "docs", "book-registry.md");

// --- The menus -------------------------------------------------------------
// `match` classifies the registry's free-prose columns into these canonical buckets so crowding can
// be counted. Two rules make this reliable enough to score against:
//
//   1. FIRST MATCH WINS, so menu order is precedence: specific buckets are listed before generic
//      ones. Without this, "reads numbers/accounts" and "reads the bedding as tracks" both also
//      match the generic written-record pattern and every count inflates.
//   2. The generic buckets require a concrete noun, not the bare verb. "Reads" is the house idiom
//      for deduction ("reads the lights", "reads ripeness", "reads bodies") and matches almost
//      every row on its own.
//
// Classification stays best-effort — a row matching nothing simply doesn't vote, and `--list`
// prints the coverage so you can see how much of the registry was actually understood.

// Precedence: specific shapes before the broad ones ("lost" and "death" would otherwise absorb most
// of the catalog and flatten the crowding signal).
const MYSTERY_TYPES = [
  { id: "never-gone", label: "a thing that was never gone", match: /never (gone|lost|stolen|missing)|no real crime|was never/i },
  { id: "not-who-we-think", label: "the victim or subject isn't who we think", match: /isn'?t who|not who we think/i },
  { id: "two-crimes", label: "two crimes tangled together", match: /two crimes|tangled/i },
  { id: "sabotage-that-wasnt", label: "sabotage that turns out not to be", match: /sabotage/i },
  { id: "kindness-misread", label: "a kindness misread", match: /kindness|misread as|a kindness/i },
  { id: "strange-behaviour", label: "a person is behaving strangely", match: /behaving strangely|acting odd/i },
  { id: "swapped", label: "a thing is swapped for another", match: /\bswap|substitut|forger|\bfake\b/i },
  { id: "impossible", label: "an impossible event", match: /impossible|locked[- ]room|sealed/i },
  { id: "damaged", label: "a thing is damaged or changed", match: /damaged|wrecked|ruined|scratched|spoiled|\bchanged\b/i },
  { id: "vanished-person", label: "a person vanishes", match: /vanish|disappear/i },
  { id: "theft", label: "a genuine theft", match: /stolen|theft|lifted|robbery|\bcheating\b/i },
  { id: "lost", label: "a thing is lost", match: /\blost\b|\bmissing\b|\bgone\b/i },
  { id: "death-contested", label: "a death whose cause is contested", match: /\bdeaths?\b|\bdies\b|\bdead\b|murder|drops dead/i },
];

// Phase 0.5 flags two methods. "reads a written record" is over-used (~8 books); the retired
// "goes still and remembers" voice is banned outright and is not offered at all.
// Order matters — see rule 1 above. Distinctive methods first; the over-used written-record bucket
// is last and needs an actual document noun (not the metaphorical "reads the water as a ledger").
const METHODS = [
  { id: "skeptic", label: "a skeptic out to debunk it", match: /\bskeptic|debunk/i },
  { id: "fooled-first", label: "is fooled first, then realizes", match: /fooled/i },
  { id: "sets-trap", label: "sets a trap to flush the culprit", match: /\btraps?\b/i },
  { id: "from-absence", label: "reconstructs from what is absent (the dog that didn't bark)", match: /\babsent\b|what'?s missing|didn'?t bark|inventory of absences/i },
  { id: "re-enacts", label: "re-enacts or re-times the event physically", match: /re-?enact|re-?tim(e|es|ing)|re-?walk|walks the day backward/i },
  { id: "backward-from-impossible", label: "works backward from the one impossible detail", match: /backward|impossible detail/i },
  { id: "reads-numbers", label: "reads numbers and accounts (not prose)", match: /numbers\s*\/\s*accounts|\bnumbers\b|\baccounts\b|arithmetic|reconciles/i },
  { id: "senses", label: "deduces from the senses (taste, smell, sound, temperature)", match: /\bsenses\b|\bsmell|\btaste|by ear|audio forensic|\btemperature\b|super-?taster/i },
  { id: "catches-lie-live", label: "catches a lie in real time", match: /catch(es)? (a |the )?lie|small lie|giving the right/i },
  { id: "talks-into-contradiction", label: "talks people into contradicting themselves", match: /talks? (people|them)|contradict|interrogat|into a slip/i },
  { id: "maps-or-draws", label: "maps or draws the scene to reconstruct it", match: /\bdraws?\b|\bmaps?\b|cross-?bearing|geometry of|dead reckoning/i },
  { id: "follows-money", label: "follows the money and the incentives", match: /\bmoney\b|incentive/i },
  { id: "domain-expert", label: "the domain expert who sees what others miss", match: /domain expert|specialist|appraiser|stratigrapher|viticultur|brine-?taster|the object itself|whose whole craft/i },
  // Over-used (Phase 0.5 puts it at ~8 books). Requires a real document, and only reached when no
  // more specific method matched.
  {
    id: "reads-record",
    label: "reasons from a written record or list",
    match: /\b(records?|ledgers?|logbook|manifest|register|rule-?list|prompt book|written [a-z-]*\s?(list|record|rules?))\b/i,
    overused: true,
  },
];

// Precedence again: the over-used spotlight spine is last so a row describing something more
// specific isn't miscounted into it.
const SPINES = [
  { id: "reverse-chronology", label: "reverse chronology — open at the reveal, walk it back", match: /reverse chronolog|walk(s)? it back|backward hour by hour/i },
  { id: "interleaved", label: "two interleaved timelines (then / now)", match: /interleav|then\s*\/\s*now|two timelines|now\s*\/\s*then/i },
  { id: "frame-story", label: "a frame story — someone recounting it afterwards", match: /frame story|recount/i },
  { id: "detective-is-suspect", label: "the detective is also a suspect", match: /also a suspect|detective is a suspect|himself the easiest man to blame/i },
  { id: "rotating-pov", label: "rotating POV — each chapter one suspect's account", match: /rotating|each suspect'?s account|rotating-accounts/i },
  { id: "inventory", label: "an inventory — a chapter per item, room, or clue", match: /inventory|chapter per|room by room/i },
  { id: "real-time", label: "real time — one room, one hour, one scene", match: /real[- ]time|single scene|one room, one hour/i },
  { id: "leisurely", label: "a leisurely unspool with no clock", match: /leisurely|no clock/i },
  // Over-used (~10+ books) — selectable but penalised so it stops being the default.
  { id: "spotlight-per-suspect", label: "one spotlight per suspect → finale", match: /spotlight|per suspect|per claimant|per helper|per link|suspect-per-chapter/i, overused: true },
];

const RESOLUTIONS = [
  { id: "accident", label: "an accident with a real consequence" },
  { id: "deliberate", label: "a deliberate act with a motive" },
  { id: "never-gone", label: "a misunderstanding — it was never gone" },
  { id: "reversal", label: "a reversal that re-colors an earlier scene" },
  { id: "self-inflicted", label: "self-inflicted — the subject did it to themselves" },
  { id: "system-to-blame", label: "the system or institution is to blame, no single villain" },
  { id: "collective", label: "collective guilt — everyone a little responsible" },
  { id: "sympathetic", label: "a sympathetic or justified culprit" },
];

// Register hints, tagged with the audiences they suit — a child's-eye voice is a bad suggestion for
// an adult locked-room, and a dry procedural is a bad one for a nine-year-old.
const REGISTERS = [
  { text: "wry and warm, close third", for: ["adult", "all", "kid"] },
  { text: "plain and unhurried, almost documentary", for: ["adult", "all"] },
  { text: "brisk and clipped, present tense", for: ["adult", "all"] },
  { text: "formal period diction, lightly ironic", for: ["adult"] },
  { text: "a child's-eye voice, short sentences, big feelings", for: ["kid", "all"] },
  { text: "confiding first person, talking to the reader", for: ["adult", "all", "kid"] },
  { text: "lyrical and slow, weather and light doing the work", for: ["adult"] },
  { text: "procedural and dry, warmth leaking through the cracks", for: ["adult"] },
  { text: "breathless and eager, a narrator who can't wait to tell you", for: ["kid", "all"] },
];

// Audience fit. Not hard bans (except where the content rules already forbid it) — a penalty plus a
// printed reason, so a good premise can still override.
const AUDIENCE_PENALTY = {
  kid: {
    types: { "death-contested": [-100, "kid-friendly books have no death (CLAUDE.md)"] },
    methods: {
      "follows-money": [-25, "financial motive is abstract for young readers"],
      "reads-numbers": [-25, "accounts and arithmetic are a hard sell at this age"],
    },
    resolutions: {
      "system-to-blame": [-20, "institutional blame is abstract; keep a person or a mishap at the centre"],
      deliberate: [-5, "fine, but keep the motive small and forgivable"],
    },
  },
  all: {
    types: { "death-contested": [-40, "an all-ages book usually avoids a death"] },
    methods: {},
    resolutions: {},
  },
  adult: { types: {}, methods: {}, resolutions: {} },
};

// --- Registry ---------------------------------------------------------------

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    throw new Error(`no registry at ${path.relative(ROOT, REGISTRY)} — it's gitignored; this must run in a working copy that has it`);
  }
  const lines = fs.readFileSync(REGISTRY, "utf8").split(/\r?\n/);
  const rows = [];
  let inShipped = false;
  for (const line of lines) {
    if (line.startsWith("##")) {
      inShipped = /shipped books/i.test(line);
      continue;
    }
    if (!inShipped || !line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(line.trim())) continue; // separator
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 8 || cells[0] === "#" || !/^\d+$/.test(cells[0])) continue;
    rows.push({
      n: Number(cells[0]),
      bookId: cells[1],
      setting: cells[2],
      type: cells[3],
      method: cells[4],
      spine: cells[5],
      length: cells[6],
      audience: cells[7],
      tags: cells[8] || "",
    });
  }
  if (!rows.length) throw new Error("parsed 0 shipped-book rows — has the registry table format changed?");
  return rows;
}

// First match wins (menu order is precedence), so each row lands in at most one bucket per axis.
// Returns [] when nothing matched, which keeps an unclassifiable row from voting.
function classify(text, menu) {
  const hit = menu.find((m) => m.match && m.match.test(text));
  return hit ? [hit.id] : [];
}

function crowding(rows) {
  const counts = { type: new Map(), method: new Map(), spine: new Map() };
  const perRow = [];
  const unclassified = { type: [], method: [], spine: [] };
  for (const r of rows) {
    const t = classify(r.type, MYSTERY_TYPES);
    const m = classify(r.method, METHODS);
    const s = classify(r.spine, SPINES);
    if (!t.length) unclassified.type.push(r.bookId);
    if (!m.length) unclassified.method.push(r.bookId);
    if (!s.length) unclassified.spine.push(r.bookId);
    perRow.push({ ...r, types: t, methods: m, spines: s });
    for (const [key, ids] of [["type", t], ["method", m], ["spine", s]]) {
      for (const id of ids) counts[key].set(id, (counts[key].get(id) || 0) + 1);
    }
  }
  return { counts, perRow, unclassified };
}

// --- Scoring ----------------------------------------------------------------
// Rarity: an option used by few shipped books scores high. This is what pushes the catalog toward
// its unused corners instead of its favourites.
//
// Measured against the MOST-USED option on that axis, not the book count. Against 51 books every
// option looks rare (the busiest method is only 7 books) and every candidate scored 98-99, which
// tells you nothing. Against the axis leader the range actually spreads: unused = 100, as crowded
// as the current favourite = 0.
function rarityScore(id, counter) {
  const used = counter.get(id) || 0;
  const max = Math.max(1, ...counter.values());
  return Math.round(100 * (1 - Math.min(used, max) / max));
}

function scoreCandidate(cand, ctx) {
  const { counts, perRow, audience } = ctx;
  const total = perRow.length;
  const reasons = [];

  const rType = rarityScore(cand.type.id, counts.type);
  const rMethod = rarityScore(cand.method.id, counts.method);
  const rSpine = rarityScore(cand.spine.id, counts.spine);

  // The crowded axes carry more weight: that's where sameness actually shows.
  let score = rType * 0.25 + rMethod * 0.4 + rSpine * 0.35;

  if (cand.method.overused) {
    score -= 30;
    reasons.push("method is flagged over-used in Phase 0.5 (-30)");
  }
  if (cand.spine.overused) {
    score -= 30;
    reasons.push("spine is flagged over-used in Phase 0.5 (-30)");
  }

  // Nearest neighbours: how many axes does this share with each shipped book?
  let worst = 0;
  const neighbours = [];
  for (const row of perRow) {
    let shared = 0;
    const which = [];
    if (row.types.includes(cand.type.id)) (shared++, which.push("type"));
    if (row.methods.includes(cand.method.id)) (shared++, which.push("method"));
    if (row.spines.includes(cand.spine.id)) (shared++, which.push("spine"));
    if (shared >= 2) neighbours.push({ bookId: row.bookId, shared, which });
    worst = Math.max(worst, shared);
  }
  if (worst >= 3) {
    score -= 60;
    reasons.push("shares all three comparable axes with a shipped book (-60)");
  } else if (worst === 2) {
    score -= 12;
    reasons.push("shares two axes with a shipped book (-12)");
  }

  const pen = AUDIENCE_PENALTY[audience] || AUDIENCE_PENALTY.adult;
  for (const [bucket, key] of [["types", cand.type.id], ["methods", cand.method.id]]) {
    const hit = pen[bucket] && pen[bucket][key];
    if (hit) {
      score += hit[0];
      reasons.push(`${hit[1]} (${hit[0]})`);
    }
  }
  for (const r of cand.resolutions) {
    const hit = pen.resolutions && pen.resolutions[r.id];
    if (hit) {
      score += hit[0];
      reasons.push(`${hit[1]} (${hit[0]})`);
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    neighbours: neighbours.sort((a, b) => b.shared - a.shared).slice(0, 3),
    parts: { type: rType, method: rMethod, spine: rSpine },
  };
}

// --- Sampling ---------------------------------------------------------------
// Deterministic PRNG so --seed reproduces a run exactly.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function pickResolutions(rand, audience, count = 4) {
  // The contract wants the endings to span >=3 kinds. Pick 3-4, always including at least one with
  // teeth so the matrix can't collapse into "everyone harmlessly had it".
  //
  // Kinds the audience rules discourage are filtered out HERE rather than penalised after the
  // fact — docking a candidate for a resolution this function chose at random is scoring noise,
  // not signal about the candidate.
  const pen = (AUDIENCE_PENALTY[audience] || AUDIENCE_PENALTY.adult).resolutions || {};
  const allowed = RESOLUTIONS.filter((r) => !pen[r.id] || pen[r.id][0] > -20);
  const withTeeth = allowed.filter((r) =>
    ["accident", "deliberate", "reversal", "self-inflicted", "system-to-blame", "collective"].includes(r.id),
  );
  const seedPool = withTeeth.length ? withTeeth : allowed;
  const chosen = [seedPool[Math.floor(rand() * seedPool.length)]];
  const pool = allowed.filter((r) => r.id !== chosen[0].id);
  while (chosen.length < count && pool.length) {
    chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return chosen;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      flags[argv[i].slice(2)] = argv[i + 1] != null && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }

  const rows = loadRegistry();
  const { counts, perRow, unclassified } = crowding(rows);

  // The registry only stays honest if every shipped book has a row, and a skipped ship step is
  // silent otherwise (the-chess-club went 6 days unnoticed). This runs at the START of a build, so
  // it catches the previous build's omission at exactly the right moment.
  const contentDir = path.join(ROOT, "ai-mysteries-api", "Content");
  if (fs.existsSync(contentDir)) {
    const known = new Set(rows.map((r) => r.bookId));
    const missing = fs
      .readdirSync(contentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(contentDir, d.name, "meta.json")))
      .map((d) => d.name)
      .filter((id) => !known.has(id));
    if (missing.length) {
      console.log(`!! ${missing.length} shipped book(s) missing a registry row: ${missing.join(", ")}`);
      console.log("   Crowding counts below are understated until they're added. Add the row(s) first.\n");
    }
  }

  if (flags.list) {
    console.log(`Menus and how crowded each option is across ${rows.length} shipped books.\n`);
    for (const [name, menu, counter, missed] of [
      ["MYSTERY TYPE", MYSTERY_TYPES, counts.type, unclassified.type],
      ["DETECTIVE METHOD", METHODS, counts.method, unclassified.method],
      ["STRUCTURE SPINE", SPINES, counts.spine, unclassified.spine],
    ]) {
      console.log(`${name}`);
      for (const m of menu) {
        const n = counter.get(m.id) || 0;
        console.log(`  ${String(n).padStart(2)} books  ${m.id.padEnd(26)} ${m.label}${m.overused ? "   [OVER-USED]" : ""}`);
      }
      const covered = rows.length - missed.length;
      console.log(
        `  classified ${covered}/${rows.length}` +
          (missed.length ? `  — unmatched: ${missed.join(", ")}` : "") +
          "\n",
      );
    }
    console.log("RESOLUTION KINDS (the endings must span >=3)");
    for (const r of RESOLUTIONS) console.log(`          ${r.id.padEnd(26)} ${r.label}`);
    console.log("\nBanned outright and not offered: the retired \"goes still and remembers\" detective voice.");
    return;
  }

  const audience = String(flags.audience || "adult").toLowerCase();
  if (!["kid", "all", "adult"].includes(audience)) {
    console.error(`--audience must be kid, all, or adult (got "${audience}")`);
    process.exit(2);
  }
  const count = Math.min(Number(flags.count) || 3, 6);
  const seed = Number(flags.seed) || (Date.now() & 0xffffffff);
  const rand = rng(seed);

  // The premise may fix the mystery type; if so, honour it and randomise only the rest.
  let types = MYSTERY_TYPES;
  if (typeof flags.type === "string") {
    const wanted = flags.type.toLowerCase();
    types = MYSTERY_TYPES.filter((t) => t.id === wanted || t.id.includes(wanted));
    if (!types.length) {
      console.error(`--type "${flags.type}" matched nothing. Options: ${MYSTERY_TYPES.map((t) => t.id).join(", ")}`);
      process.exit(2);
    }
  }

  // The whole space is ~1,500 combinations, so score all of them rather than sampling and retrying.
  // This is why a re-roll is free: the search already happened.
  const ctx = { counts, perRow, audience };
  const scored = [];
  for (const type of types) {
    for (const method of METHODS) {
      for (const spine of SPINES) {
        const cand = { type, method, spine, resolutions: [] };
        const res = scoreCandidate({ ...cand, resolutions: [] }, ctx);
        scored.push({ ...cand, ...res });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);

  // Weighted-random among the strong candidates, not simply the top N — otherwise every book with
  // the same brief gets the same answer, which is the mode-seeking this is meant to prevent.
  const viable = scored.filter((c) => c.score >= 45);
  const pool = (viable.length >= count * 4 ? viable : scored.slice(0, Math.max(count * 6, 24))).slice(0, 60);
  const registers = REGISTERS.filter((r) => r.for.includes(audience));
  const typePinned = typeof flags.type === "string";

  // Candidates must differ from each other or the choice is fake. But insisting on all three axes
  // differing can exhaust a narrow pool and return two candidates instead of three, so relax the
  // requirement in stages: distinct type+method+spine, then method+spine, then method alone.
  function select(strictness) {
    const remaining = pool.slice();
    const picked = [];
    const used = { type: new Set(), method: new Set(), spine: new Set() };
    let guard = 0;
    while (picked.length < count && remaining.length && guard++ < 500) {
      const weights = remaining.map((c) => Math.pow(c.score, 3));
      const totalW = weights.reduce((a, b) => a + b, 0);
      let r = rand() * totalW;
      let idx = 0;
      while (idx < remaining.length - 1 && (r -= weights[idx]) > 0) idx++;
      const pick = remaining[idx];
      const clash =
        used.method.has(pick.method.id) ||
        (strictness >= 1 && used.spine.has(pick.spine.id)) ||
        (strictness >= 2 && !typePinned && used.type.has(pick.type.id));
      if (clash) {
        remaining.splice(idx, 1);
        continue;
      }
      used.type.add(pick.type.id);
      used.method.add(pick.method.id);
      used.spine.add(pick.spine.id);
      picked.push(pick);
      remaining.splice(idx, 1);
    }
    return picked;
  }

  let selected = [];
  for (const strictness of [2, 1, 0]) {
    selected = select(strictness);
    if (selected.length >= count) break;
  }

  const chosen = selected.map((pick) => {
    const withExtras = {
      ...pick,
      resolutions: pickResolutions(rand, audience),
      register: registers[Math.floor(rand() * registers.length)].text,
    };
    return { ...withExtras, ...scoreCandidate(withExtras, ctx) };
  });

  // --- Report --------------------------------------------------------------
  console.log(`pick-axes — ${chosen.length} candidate${chosen.length === 1 ? "" : "s"} for ${audience === "adult" ? "an adult" : audience === "kid" ? "a kid-friendly" : "an all-ages"} book`);
  console.log(`  registry: ${rows.length} shipped books   seed: ${seed}${flags.setting ? `   setting: ${flags.setting}` : ""}`);
  console.log(`  (re-run for a different draw; --seed ${seed} reproduces this one)\n`);

  chosen.forEach((c, i) => {
    const band = c.score >= 75 ? "strong" : c.score >= 55 ? "workable" : "weak";
    console.log(`${"=".repeat(74)}`);
    console.log(`CANDIDATE ${i + 1}   confidence ${c.score}/100  (${band})`);
    console.log(`${"=".repeat(74)}`);
    console.log(`  mystery type   ${c.type.label}`);
    console.log(`  method         ${c.method.label}`);
    console.log(`  spine          ${c.spine.label}`);
    console.log(`  ending spread  ${c.resolutions.map((r) => r.label).join("\n                 ")}`);
      console.log(`  register hint  ${c.register}`);
    console.log(`  rarity         type ${c.parts.type} · method ${c.parts.method} · spine ${c.parts.spine}  (100 = unused)`);
    if (c.neighbours.length) {
      console.log(`  closest books  ${c.neighbours.map((n) => `${n.bookId} (shares ${n.which.join("+")})`).join(", ")}`);
    } else {
      console.log("  closest books  none share 2+ comparable axes");
    }
    if (c.reasons.length) console.log(`  adjustments    ${c.reasons.join("; ")}`);
    console.log("");
  });

  const best = chosen.length ? Math.max(...chosen.map((c) => c.score)) : 0;
  console.log("-".repeat(74));
  if (best < 55) {
    // Report the reason that actually dominated rather than guessing — most often it's a single
    // rule firing on every candidate (e.g. asking for a death in a kid-friendly book).
    const tally = new Map();
    for (const c of chosen) for (const r of c.reasons) tally.set(r, (tally.get(r) || 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log("ALL CANDIDATES ARE WEAK — the constraints are boxed in.");
    if (top) console.log(`  dominant reason: ${top[0]}  (hit ${top[1]}/${chosen.length} candidates)`);
    console.log("  Re-running is free but won't help if the reason above is structural: relax or drop");
    console.log("  --type, reconsider --audience, or take this as a signal to re-cut the premise.");
  } else {
    console.log("Pick the candidate that fits the premise best — a high score is not permission to");
    console.log("force a bad fit. Re-running costs nothing, so re-roll rather than settle.");
  }
  console.log("The setting axis is yours (the premise owns it) and voice/opening must be fresh per");
  console.log("Phase 0.5 — a candidate only covers type, method, spine, and the ending spread.");
}

try {
  main();
} catch (err) {
  console.error(`pick-axes: ${err.message}`);
  process.exit(2);
}
