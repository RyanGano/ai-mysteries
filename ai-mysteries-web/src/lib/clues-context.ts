import { createContext } from "react";
import type { Clue } from "./types";

// The clues referenced by the currently rendered ending, keyed by clue id. Provided by Prose
// and read by each XrefMarker glyph, so the marker never needs a global clue index.
export const CluesContext = createContext<Record<string, Clue>>({});
