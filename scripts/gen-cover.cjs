// Generate a book cover via Cloudflare Workers AI (free tier) and write it as the
// house-style 2:3 .webp into ai-mysteries-web/public/covers/<bookId>.webp.
//
//   node scripts/gen-cover.cjs <bookId> [--model flux|sdxl] [--seed N] [--steps N]
//
// Reads the prompt from the "## Prompt" blockquote of docs/<bookId>/CoverPrompt.md.
// Credentials come from env (CF_ACCOUNT_ID, CF_API_TOKEN) or a gitignored .env at the
// repo root. Workers AI text-to-image is free within a daily quota — no per-image cost.
//
// FLUX (@cf/black-forest-labs/flux-1-schnell) gives the best photographic quality but
// returns a square image (base64 JSON); we crop it to 2:3. SDXL
// (@cf/stabilityai/stable-diffusion-xl-base-1.0) honours width/height natively (binary
// PNG) so it needs no crop. Default is flux. Run sharp to land on exactly 1024x1536 webp.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const W = 1024;
const H = 1536; // 2:3 portrait, the house-style cover size

const MODELS = {
  flux: "@cf/black-forest-labs/flux-1-schnell",
  sdxl: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
};

function loadDotEnv() {
  const p = path.join(ROOT, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv) {
  const a = { model: "flux", seed: undefined, steps: undefined };
  a.bookId = argv[0];
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === "--model") a.model = argv[++i];
    else if (argv[i] === "--seed") a.seed = Number(argv[++i]);
    else if (argv[i] === "--steps") a.steps = Number(argv[++i]);
  }
  return a;
}

// Pull the prompt text out of the "## Prompt" blockquote in CoverPrompt.md.
function readPrompt(bookId) {
  const p = path.join(ROOT, "docs", bookId, "CoverPrompt.md");
  if (!fs.existsSync(p)) throw new Error(`No prompt file: ${p}`);
  const md = fs.readFileSync(p, "utf8");
  const sec = md.split(/^##\s+Prompt\s*$/m)[1];
  if (!sec) throw new Error(`No "## Prompt" section in ${p}`);
  const lines = [];
  for (const line of sec.split(/\r?\n/)) {
    if (/^##\s/.test(line)) break; // next heading ends the section
    const m = line.match(/^>\s?(.*)$/);
    if (m) lines.push(m[1]);
  }
  const prompt = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!prompt) throw new Error(`Empty prompt blockquote in ${p}`);
  return prompt;
}

async function callWorkersAi(model, prompt, { seed, steps }) {
  const acct = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!acct || !token) throw new Error("Set CF_ACCOUNT_ID and CF_API_TOKEN (env or .env).");
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;
  const body = { prompt, width: W, height: H };
  if (model === MODELS.flux) body.steps = steps ?? 8; // schnell: 1..8
  else body.num_steps = steps ?? 20;
  if (seed !== undefined) body.seed = seed;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) throw new Error(`Workers AI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  if (ct.includes("application/json")) {
    // FLUX: { result: { image: "<base64>" }, success }
    const j = await res.json();
    if (!j.success) throw new Error(`Workers AI error: ${JSON.stringify(j.errors || j)}`);
    return Buffer.from(j.result.image, "base64");
  }
  // SDXL: raw binary image bytes
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (!args.bookId) {
    console.error("Usage: node scripts/gen-cover.cjs <bookId> [--model flux|sdxl] [--seed N] [--steps N]");
    process.exit(1);
  }
  const model = MODELS[args.model];
  if (!model) throw new Error(`Unknown model "${args.model}" (use flux or sdxl)`);

  const prompt = readPrompt(args.bookId);
  console.log(`Model: ${model}`);
  console.log(`Prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}`);

  const raw = await callWorkersAi(model, prompt, args);

  // Land on exactly 1024x1536 webp (cover-crop centers the subject if the source is square).
  const sharp = require("sharp");
  const outDir = path.join(ROOT, "ai-mysteries-web", "public", "covers");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${args.bookId}.webp`);
  const meta = await sharp(raw).metadata();
  await sharp(raw)
    .resize(W, H, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(out);
  const size = fs.statSync(out).size;
  console.log(`Source ${meta.width}x${meta.height} ${meta.format} → ${out}`);
  console.log(`Wrote ${W}x${H} webp, ${(size / 1024).toFixed(0)} KB`);
  console.log(`Next: upload to blob + re-seed (see put_book_in_site.md §4), or preview locally.`);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
