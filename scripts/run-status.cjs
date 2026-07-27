// What is the book build doing right now?
//
//   node scripts/run-status.cjs              # newest session for this project
//   node scripts/run-status.cjs --session <id>
//   node scripts/run-status.cjs --watch      # re-print every 30s until it finishes
//
// A headless run (the nightly cron) writes its transcript but nothing else you can watch, so a
// long-running build looks identical to a hung one. This reads the transcript and answers the three
// questions that actually matter: is it alive, how far has it got, and what has it cost.
//
// Idle time is called out separately because on a laptop it dominates: a 3 a.m. run spends most of
// its wall-clock in connected standby, which looks like a stall but consumes nothing. Elapsed time
// is a bad progress signal here; turns and phase are the real ones.

const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "ai-mysteries-api", "Content");

// Claude Code stores transcripts per project, keyed by the cwd with separators flattened.
function projectDir() {
  const slug = ROOT.replace(/:/g, "").replace(/[\\/]/g, "-").toLowerCase();
  const base = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(base)) return null;
  const exact = path.join(base, slug);
  if (fs.existsSync(exact)) return exact;
  // Fall back to a case-insensitive / near match rather than failing on a path-shape difference.
  const hit = fs.readdirSync(base).find((d) => d.toLowerCase() === slug || d.toLowerCase().endsWith(path.basename(ROOT).toLowerCase()));
  return hit ? path.join(base, hit) : null;
}

const RATES = { fable: [10, 50], opus: [5, 25], sonnet: [3, 15], haiku: [1, 5] };
const rateFor = (model) => {
  for (const [k, v] of Object.entries(RATES)) if (model.includes(k)) return v;
  return null;
};

function readSession(file) {
  const events = [];
  const perModel = new Map();
  const tools = new Map();
  let turns = 0;
  let bookId = null;

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = d.timestamp ? new Date(d.timestamp) : null;
    const m = d.message || {};
    const u = m.usage;

    if (u) {
      turns++;
      const model = String(m.model || "");
      const r = rateFor(model);
      if (r) {
        const cur = perModel.get(model) || { cost: 0, out: 0, turns: 0 };
        cur.cost +=
          ((u.input_tokens || 0) * r[0] +
            (u.output_tokens || 0) * r[1] +
            (u.cache_read_input_tokens || 0) * r[0] * 0.1 +
            (u.cache_creation_input_tokens || 0) * r[0] * 1.25) /
          1e6;
        cur.out += u.output_tokens || 0;
        cur.turns++;
        perModel.set(model, cur);
      }
    }

    if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b && b.type === "tool_use") {
          tools.set(b.name, (tools.get(b.name) || 0) + 1);
          const target = String(b.input?.file_path || b.input?.command || "");
          if (!bookId) {
            const hit = target.replace(/\\/g, "/").match(/Content\/([a-z0-9-]+)\//i);
            if (hit) bookId = hit[1];
          }
          if (ts) events.push({ ts, name: b.name, target: target.replace(/\s+/g, " ").slice(0, 88) });
        }
      }
    }
  }
  return { events, perModel, tools, turns, bookId };
}

// Infer the phase from what exists on disk plus what the agent last touched. Cheaper and more
// honest than trying to parse intent out of the prose.
function inferPhase(bookId, tools, events) {
  if (!bookId) return "Phase 0 — interpreting the brief / rolling axes";
  const dir = path.join(CONTENT, bookId);
  const has = (p) => fs.existsSync(path.join(dir, p));
  const count = (p) => (fs.existsSync(path.join(dir, p)) ? fs.readdirSync(path.join(dir, p)).length : 0);

  const recent = events.slice(-12).map((e) => `${e.name} ${e.target}`).join(" ").toLowerCase();
  if (recent.includes("verify-book") && recent.includes("--api http")) return "Phase 7 — confirming live on prod";
  if (recent.includes("seed") || recent.includes("az storage")) return "Phase 7 — shipping (cover upload / seed)";
  if (recent.includes("verify-book") || recent.includes("book-stats")) return "Phase 6 — verifying locally";
  if (recent.includes("xrefs")) return "Phase 5 — cross-references";
  if (!has("meta.json")) return "Phase 1 — designing the dossier";
  if (count("book") === 0) return "Phase 2/3 — meta + starting the manuscript";
  if (count("endings") === 0) return `Phase 3 — writing the manuscript (${count("book")} chapters so far)`;
  if (!has("clues.json")) return `Phase 4 — writing the endings (${count("endings")} written)`;
  return "Phase 5+ — xrefs generated, verifying / shipping";
}

function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function report() {
  const dir = projectDir();
  if (!dir) {
    console.error("run-status: no Claude Code project directory found for this repo.");
    process.exit(2);
  }
  const argv = process.argv.slice(2);
  const si = argv.indexOf("--session");
  const wanted = si !== -1 ? argv[si + 1] : null;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl") && (!wanted || f.startsWith(wanted)))
    .map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) {
    console.error(`run-status: no transcripts in ${dir}${wanted ? ` matching "${wanted}"` : ""}`);
    process.exit(2);
  }

  const { p, f } = files[0];
  const { events, perModel, tools, turns, bookId } = readSession(p);
  if (!events.length) {
    console.log(`session ${f.slice(0, 8)} — no tool activity recorded yet`);
    return false;
  }

  const start = events[0].ts;
  const last = events[events.length - 1].ts;
  const sinceLast = Date.now() - last.getTime();

  // Idle gaps: on a laptop these are standby, not a stall. Separating them stops a healthy
  // overnight run from looking hung.
  let idle = 0;
  for (let i = 1; i < events.length; i++) {
    const g = events[i].ts - events[i - 1].ts;
    if (g > 4 * 60 * 1000) idle += g;
  }
  const elapsed = last - start;

  const totalCost = [...perModel.values()].reduce((a, b) => a + b.cost, 0);
  const split = [...perModel.entries()]
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([m, v]) => `${m.replace("claude-", "")} $${v.cost.toFixed(2)}`)
    .join(" + ");

  const live = sinceLast < 5 * 60 * 1000;
  console.log(`session   ${f.replace(".jsonl", "")}`);
  console.log(`book      ${bookId || "(not chosen yet)"}`);
  console.log(`phase     ${inferPhase(bookId, tools, events)}`);
  console.log(`status    ${live ? "ACTIVE" : "IDLE"} — last activity ${fmtDur(sinceLast)} ago`);
  console.log(`elapsed   ${fmtDur(elapsed)}  (working ~${fmtDur(elapsed - idle)}, idle/standby ${fmtDur(idle)})`);
  console.log(`turns     ${turns}   tools: ${[...tools.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`cost      ~$${totalCost.toFixed(2)}${perModel.size > 1 ? `  (${split})` : ""}`);
  console.log(`\nlast 8 actions:`);
  for (const e of events.slice(-8)) {
    console.log(`  ${e.ts.toTimeString().slice(0, 8)}  ${e.name.padEnd(11)} ${e.target}`);
  }

  // Finished when the ship phase has confirmed prod, or the queue row is no longer in progress.
  const queue = path.join(ROOT, "docs", "book-ideas.md");
  if (fs.existsSync(queue)) {
    const inProgress = fs.readFileSync(queue, "utf8").split("\n").filter((l) => l.includes("in progress"));
    const rows = inProgress.filter((l) => /^\|/.test(l));
    console.log(`\nqueue     ${rows.length ? rows[0].split("|")[3]?.trim() + " — still marked in progress" : "no row in progress (build finished or not started)"}`);
    return rows.length > 0;
  }
  return true;
}

const watch = process.argv.includes("--watch");
if (!watch) {
  report();
} else {
  const tick = () => {
    console.clear();
    console.log(new Date().toTimeString().slice(0, 8) + "  (--watch, Ctrl-C to stop)\n");
    let running = true;
    try {
      running = report();
    } catch (err) {
      console.error(err.message);
    }
    if (running) setTimeout(tick, 30000);
    else console.log("\nrun appears finished.");
  };
  tick();
}
