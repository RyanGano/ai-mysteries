import { endings, type Ending } from "../content/endings/index";
import { normalizeCode } from "./code";

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
