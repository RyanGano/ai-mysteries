import { createContext } from "react";
import type { GlossaryEntry } from "./types";

// Definitions for the glossary underlines in the current prose body, keyed by canonical term
// (the `data-term` the remark-glossary plugin stamps on each <gloss> element). Supplied by
// Prose; read by GlossaryTerm to resolve its popover content.
export const GlossaryContext = createContext<Record<string, GlossaryEntry>>({});
