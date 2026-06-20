// Browser text-to-speech helpers for the read-aloud feature. Pure utilities only — the orchestration
// (which chapter/ending to read next, play/stop state) lives in lib/read-aloud-context.tsx.

export const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

// Strip Markdown down to spoken prose: drop syntax, keep the words. The chapter/ending bodies are
// the same Markdown the reader renders, so this mirrors what the eye sees minus the formatting.
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ATX headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s*[-*+]\s+/gm, "") // bullet lists
    .replace(/^\s*\d+\.\s+/gm, "") // ordered lists
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm, " ") // horizontal rules
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italic
    .replace(/\|/g, " ") // table pipes
    .replace(/\{\{xref:[^}]*\}\}/g, " "); // any stray cross-reference token
}

// Split one paragraph into speakable chunks at sentence boundaries, capped in length. Short
// utterances sidestep the long-utterance cut-off some speech engines hit, and let a speed change
// take effect within a sentence or two.
function chunkParagraph(paragraph: string): string[] {
  const MAX = 240;
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) ?? [paragraph];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const t = s.trim();
    if (!t) continue;
    if (cur && (cur + " " + t).length > MAX) {
      out.push(cur);
      cur = t;
    } else {
      cur = cur ? `${cur} ${t}` : t;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Turn a Markdown body into an ordered list of utterance strings.
export function markdownToSpeech(md: string): string[] {
  const text = stripMarkdown(md);
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(chunkParagraph);
}

// Voices may not be ready on first call (Chrome loads them async). Resolve once they are, with a
// short fallback so we never hang.
export function getVoicesAsync(): Promise<SpeechSynthesisVoice[]> {
  if (!SPEECH_SUPPORTED) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const ready = synth.getVoices();
  if (ready.length) return Promise.resolve(ready);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    window.setTimeout(finish, 1200);
  });
}

// Voice names that reliably signal a gender across Windows, macOS/iOS, and Chrome's bundled voices.
const FEMALE_NAMES = [
  "female",
  "zira",
  "samantha",
  "susan",
  "victoria",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "serena",
  "allison",
  "ava",
  "joanna",
  "kate",
  "hazel",
  "catherine",
  "linda",
  "heather",
  "eva",
  "google uk english female",
];
const MALE_NAMES = [
  "male",
  "david",
  "daniel",
  "mark",
  "alex",
  "fred",
  "oliver",
  "arthur",
  "george",
  "james",
  "aaron",
  "rishi",
  "google uk english male",
];

// Best-effort pick of an English voice matching the protagonist's gender. Returns null when nothing
// matches (the browser then uses its default voice) — "if possible", per the feature spec.
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  gender: string
): SpeechSynthesisVoice | null {
  const g = gender.trim().toLowerCase();
  if (g !== "male" && g !== "female") return null;

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  if (!pool.length) return null;

  const want = g === "female" ? FEMALE_NAMES : MALE_NAMES;
  const avoid = g === "female" ? "male" : "female";

  const match = pool.find((v) => {
    const name = v.name.toLowerCase();
    // Guard against "...Male" matching the female "...female" substring, and vice versa.
    if (name.includes(avoid) && !name.includes(want[0])) return false;
    return want.some((w) => name.includes(w));
  });
  return match ?? null;
}
