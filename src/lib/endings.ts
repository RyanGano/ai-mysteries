import { endings, type Ending } from "../content/endings/index";
import { normalizeCode } from "./code";

// Weights for culprit groups. Any culprit not listed here gets DEFAULT_INDIVIDUAL_WEIGHT.
// Current totals: SAM 5% + "All of the team" 10% + 5 individuals × 17% = 100%.
// If you add a new individual suspect, adjust these weights so they still sum to 100.
const CULPRIT_WEIGHTS: Record<string, number> = {
  SAM: 5,
  "All of the team": 10,
};
const DEFAULT_INDIVIDUAL_WEIGHT = 17;

function buildLookupMap(): Map<string, Ending> {
  const map = new Map<string, Ending>();
  for (const ending of endings) {
    const key = normalizeCode(ending.code);
    if (map.has(key)) {
      throw new Error(`Duplicate normalized code "${key}" — check content/endings/index.ts`);
    }
    map.set(key, ending);
  }
  return map;
}

export const endingMap: Map<string, Ending> = buildLookupMap();

export function lookupEnding(rawCode: string): Ending | undefined {
  return endingMap.get(normalizeCode(rawCode));
}

export function allCodes(): string[] {
  return endings.map((e) => e.code);
}

// Two-stage weighted selection:
//   Stage 1 — pick a culprit group by weight (see CULPRIT_WEIGHTS above).
//   Stage 2 — pick uniformly among that culprit's registered endings.
export function pickWeightedRandomCode(): string {
  const groups = new Map<string, string[]>();
  for (const e of endings) {
    if (!groups.has(e.culprit)) groups.set(e.culprit, []);
    groups.get(e.culprit)!.push(e.code);
  }

  const culprits = Array.from(groups.keys());
  const weights = culprits.map((c) => CULPRIT_WEIGHTS[c] ?? DEFAULT_INDIVIDUAL_WEIGHT);
  const total = weights.reduce((a, b) => a + b, 0);

  let r = Math.random() * total;
  let chosen = culprits[culprits.length - 1];
  for (let i = 0; i < culprits.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      chosen = culprits[i];
      break;
    }
  }

  const group = groups.get(chosen)!;
  return group[Math.floor(Math.random() * group.length)];
}
