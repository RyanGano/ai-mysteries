import { endings, type Ending } from "../content/endings/index";
import { normalizeCode } from "./code";

// Selection categories, ordered most-common to least-common. An ending's
// category is derived from its `culprits` array (see categoryOf below).
type Category = "single" | "two" | "three" | "four" | "all" | "sam";

// Category weights. Must be monotonically decreasing per the design and sum to
// 100. If you add a category or change the balance, keep both invariants.
const CATEGORY_WEIGHTS: Record<Category, number> = {
  single: 45,
  two: 25,
  three: 14,
  four: 8,
  all: 5,
  sam: 3,
};

function categoryOf(ending: Ending): Category {
  if (ending.culprits.length === 1 && ending.culprits[0] === "SAM") return "sam";
  switch (ending.culprits.length) {
    case 1:
      return "single";
    case 2:
      return "two";
    case 3:
      return "three";
    case 4:
      return "four";
    default:
      return "all"; // all five suspects
  }
}

// Stable key identifying a specific combination of culprits within a category.
function comboKey(ending: Ending): string {
  return [...ending.culprits].sort().join(" & ");
}

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

function pickWeighted<T>(items: T[], weightOf: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// Odds of the rare "super special" ending (the detective herself) on any given
// visit to /therealending. Rolled before the normal selection below.
const SPECIAL_ODDS = 1 / 1000;

// Selection:
//   Stage 0 — a 1-in-1000 roll for the "super special" ending. It lives outside
//             the culprit categories and is never reachable any other way.
//   Stage 1 — pick a category by weight (single > two > three > four > all > sam).
//   Stage 2 — pick a specific culprit combination uniformly within the category.
//   Stage 3 — pick uniformly among that combination's registered endings.
// Picking the combo before the ending keeps each combination equally likely
// regardless of how many endings it happens to have.
export function pickWeightedRandomCode(): string {
  // Stage 0 — the super special ending. On the other 999-in-1000 we fall
  // through to the normal weighted path below.
  const special = endings.find((e) => e.special);
  if (special && Math.random() < SPECIAL_ODDS) return special.code;

  // category -> comboKey -> codes
  const byCategory = new Map<Category, Map<string, string[]>>();
  for (const e of endings) {
    if (e.special) continue; // never reachable via category weighting
    const cat = categoryOf(e);
    if (!byCategory.has(cat)) byCategory.set(cat, new Map());
    const combos = byCategory.get(cat)!;
    const key = comboKey(e);
    if (!combos.has(key)) combos.set(key, []);
    combos.get(key)!.push(e.code);
  }

  const categories = Array.from(byCategory.keys());
  const chosenCat = pickWeighted(categories, (c) => CATEGORY_WEIGHTS[c]);

  const combos = Array.from(byCategory.get(chosenCat)!.values());
  const chosenCombo = combos[Math.floor(Math.random() * combos.length)];

  return chosenCombo[Math.floor(Math.random() * chosenCombo.length)];
}
