// One-off generator for src/content/endings/index.ts.
// Produces a deterministic, collision-free 4-char code for every ending while
// preserving the permanent codes of the original seven. Run with:
//   node scripts/gen-endings-index.cjs
// The committed artifact is index.ts; this script is just how it was built and
// can be re-run if endings are added (it never changes an already-assigned code).

const fs = require("fs");
const path = require("path");

const ENDINGS_DIR = path.join(__dirname, "..", "src", "content", "endings");

// Canonical culprit names.
const V = "Elias Varga";
const R = "Marcus Rourke";
const S = "Priya Shah";
const P = "Jonah Pike";
const C = "Renée Calder";
const ALL = [V, R, S, P, C];
const SAM = ["SAM"];

// Permanent codes for the original seven — these MUST never change (live permalinks).
const FIXED = {
  "varga-variance": "7BXK",
  "sam-all-rooms": "Q4NM",
  "rourke-maintenance": "P8WR",
  "shah-known-risk": "H3TG",
  "pike-second-check": "F6MZ",
  "calder-stop-work": "K9VC",
  "all-distributed": "B2XS",
};

// Manifest: [slug, culprits]. Order here is the order in the generated array.
const manifest = [
  ["varga-variance", [V]],
  ["sam-all-rooms", SAM],
  ["rourke-maintenance", [R]],
  ["shah-known-risk", [S]],
  ["pike-second-check", [P]],
  ["calder-stop-work", [C]],
  ["all-distributed", ALL],

  // Varga singles
  ["varga-02-timeskew", [V]],
  ["varga-03-constant", [V]],
  ["varga-04-patent", [V]],
  ["varga-05-simulation", [V]],
  ["varga-06-mapping", [V]],
  ["varga-07-recal", [V]],
  ["varga-08-margin", [V]],
  ["varga-09-model", [V]],
  ["varga-10-vindication", [V]],

  // Rourke singles
  ["rourke-02-camera", [R]],
  ["rourke-03-relay", [R]],
  ["rourke-04-secret", [R]],
  ["rourke-05-alert", [R]],
  ["rourke-06-badge", [R]],
  ["rourke-07-rounds", [R]],
  ["rourke-08-coverup", [R]],
  ["rourke-09-zone", [R]],
  ["rourke-10-visitor", [R]],

  // Shah singles
  ["shah-02-sidedeal", [S]],
  ["shah-03-override", [S]],
  ["shah-04-summary", [S]],
  ["shah-05-succession", [S]],
  ["shah-06-mustrun", [S]],
  ["shah-07-reframe", [S]],
  ["shah-08-window", [S]],
  ["shah-09-nearmiss", [S]],
  ["shah-10-aftermath", [S]],

  // Pike singles
  ["pike-02-jumper", [P]],
  ["pike-03-mesh", [P]],
  ["pike-04-sensor", [P]],
  ["pike-05-checklist", [P]],
  ["pike-06-pastfault", [P]],
  ["pike-07-toldme", [P]],
  ["pike-08-reused", [P]],
  ["pike-09-torque", [P]],
  ["pike-10-saidnothing", [P]],

  // Calder singles
  ["calder-02-shutdown", [C]],
  ["calder-03-suppressed", [C]],
  ["calder-04-dossier", [C]],
  ["calder-05-selective", [C]],
  ["calder-06-nearmiss", [C]],
  ["calder-07-greatergood", [C]],
  ["calder-08-cya", [C]],
  ["calder-09-threshold", [C]],
  ["calder-10-toolate", [C]],

  // All of the team
  ["all-02-coverup", ALL],
  ["all-03-coordination", ALL],
  ["all-04-reasons", ALL],
  ["all-05-chain", ALL],
  ["all-06-noone", ALL],
  ["all-07-system", ALL],
  ["all-08-silence", ALL],
  ["all-09-report", ALL],
  ["all-10-decision", ALL],

  // SAM
  ["sam-02-hierarchy", SAM],
  ["sam-03-voice", SAM],
  ["sam-04-defensible", SAM],
  ["sam-05-omission", SAM],
  ["sam-06-source", SAM],
  ["sam-07-confirmed", SAM],
  ["sam-08-witness", SAM],
  ["sam-09-reasonable", SAM],
  ["sam-10-liability", SAM],

  // Pairs
  ["pair-VR-1", [V, R]],
  ["pair-VR-2", [V, R]],
  ["pair-VS-1", [V, S]],
  ["pair-VS-2", [V, S]],
  ["pair-VP-1", [V, P]],
  ["pair-VP-2", [V, P]],
  ["pair-VC-1", [V, C]],
  ["pair-VC-2", [V, C]],
  ["pair-RS-1", [R, S]],
  ["pair-RS-2", [R, S]],
  ["pair-RP-1", [R, P]],
  ["pair-RP-2", [R, P]],
  ["pair-RC-1", [R, C]],
  ["pair-RC-2", [R, C]],
  ["pair-SP-1", [S, P]],
  ["pair-SP-2", [S, P]],
  ["pair-SC-1", [S, C]],
  ["pair-SC-2", [S, C]],
  ["pair-PC-1", [P, C]],
  ["pair-PC-2", [P, C]],

  // Triples
  ["tri-VRS-1", [V, R, S]],
  ["tri-VRS-2", [V, R, S]],
  ["tri-VRP-1", [V, R, P]],
  ["tri-VRP-2", [V, R, P]],
  ["tri-VRC-1", [V, R, C]],
  ["tri-VRC-2", [V, R, C]],
  ["tri-VSP-1", [V, S, P]],
  ["tri-VSP-2", [V, S, P]],
  ["tri-VSC-1", [V, S, C]],
  ["tri-VSC-2", [V, S, C]],
  ["tri-VPC-1", [V, P, C]],
  ["tri-VPC-2", [V, P, C]],
  ["tri-RSP-1", [R, S, P]],
  ["tri-RSP-2", [R, S, P]],
  ["tri-RSC-1", [R, S, C]],
  ["tri-RSC-2", [R, S, C]],
  ["tri-RPC-1", [R, P, C]],
  ["tri-RPC-2", [R, P, C]],
  ["tri-SPC-1", [S, P, C]],
  ["tri-SPC-2", [S, P, C]],

  // Quads
  ["quad-VRSP", [V, R, S, P]],
  ["quad-VRSC", [V, R, S, C]],
  ["quad-VRPC", [V, R, P, C]],
  ["quad-VSPC", [V, S, P, C]],
  ["quad-RSPC", [R, S, P, C]],
];

// Code charset: uppercase letters and digits, excluding any character that
// normalizeCode() rewrites (0,1,L → O,I) plus the targets O,I, so generated
// codes are already canonical and cannot collide via normalization.
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function codeFor(slug, salt) {
  let h = hash(slug + (salt ? ":" + salt : ""));
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CHARSET[h % CHARSET.length];
    h = Math.floor(h / CHARSET.length) || hash(out + slug);
  }
  return out;
}

// Verify every manifest slug has a file, and every file is in the manifest.
const slugs = new Set(manifest.map((m) => m[0]));
const filesOnDisk = fs
  .readdirSync(ENDINGS_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));
const missingFiles = [...slugs].filter((s) => !filesOnDisk.includes(s));
const unlisted = filesOnDisk.filter((f) => !slugs.has(f));
if (missingFiles.length) throw new Error("Manifest slugs with no .md file: " + missingFiles.join(", "));
if (unlisted.length) throw new Error("Files not in manifest: " + unlisted.join(", "));

// Assign codes. Fixed codes first (reserved), then deterministic for the rest.
const used = new Set(Object.values(FIXED));
const assigned = {};
for (const [slug] of manifest) {
  if (FIXED[slug]) {
    assigned[slug] = FIXED[slug];
  }
}
for (const [slug] of manifest) {
  if (assigned[slug]) continue;
  let salt = 0;
  let code = codeFor(slug, salt);
  while (used.has(code)) {
    salt++;
    code = codeFor(slug, salt);
  }
  used.add(code);
  assigned[slug] = code;
}

// camelCase a slug into a valid JS identifier for the import binding.
function ident(slug) {
  return slug.replace(/[-_]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
}

const imports = manifest
  .map(([slug]) => `import ${ident(slug)} from "./${slug}.md?raw";`)
  .join("\n");

const entries = manifest
  .map(([slug, culprits]) => {
    const culpritList = culprits.map((c) => JSON.stringify(c)).join(", ");
    return `  {
    code: "${assigned[slug]}",
    culprits: [${culpritList}],
    title: "Chapter 17 — The Real Ending",
    body: ${ident(slug)},
  },`;
  })
  .join("\n");

const out = `${imports}

export interface Ending {
  code: string;
  // The people responsible. Category for weighted selection is derived from
  // this: 1 = single, 2/3/4 = combinations, 5 = all of the team, ["SAM"] = SAM.
  culprits: string[];
  title: string;
  body: string;
}

export const endings: Ending[] = [
${entries}
];
`;

fs.writeFileSync(path.join(ENDINGS_DIR, "index.ts"), out);
console.log(`Wrote index.ts with ${manifest.length} endings.`);
