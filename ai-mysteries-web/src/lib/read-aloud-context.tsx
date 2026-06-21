// Read-aloud orchestration. Lives above the routes (mounted in App) so the browser speech keeps
// going while the reader auto-advances from chapter to chapter and finally into a random ending —
// component routes unmount as the page follows along, but this provider and the speech do not.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchChapterNav, fetchEnding, fetchRandomCode, fetchBookMeta } from "./api";
import { SPEECH_SUPPORTED, markdownToSpeech, getVoicesAsync, pickVoice } from "./tts";

// Generic, book-agnostic chrome (like the button verbs) — never book-specific copy.
const SPECIAL_ANNOUNCE = "You got the special ending!";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const RATE_KEY = "readAloudRate";

type Status = "idle" | "playing" | "paused";

interface ReadAloud {
  supported: boolean;
  status: Status;
  rate: number;
  setRate: (rate: number) => void;
  playChapter: (bookId: string, slug: string) => void;
  playEnding: (bookId: string, code: string) => void;
  pause: () => void;
  resume: () => void;
  // Re-speak the previous sentence of the current chapter/ending. Bounded to the active run — it
  // never crosses back into a prior chapter — so `canSkipBack` is false on the first sentence.
  skipBack: () => void;
  canSkipBack: boolean;
  stop: () => void;
  // Subscribe to the sentence currently being spoken (null when nothing is). The callback fires
  // imperatively so a page can scroll/highlight without re-rendering on every sentence. Returns an
  // unsubscribe fn; the callback is also invoked once on subscribe with the current value.
  subscribeReading: (cb: (text: string | null) => void) => () => void;
}

const ReadAloudContext = createContext<ReadAloud | null>(null);

function loadRate(): number {
  const stored = Number(localStorage.getItem(RATE_KEY));
  return (SPEEDS as readonly number[]).includes(stored) ? stored : 1;
}

export function ReadAloudProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRateState] = useState<number>(() => (SPEECH_SUPPORTED ? loadRate() : 1));
  // True once we're past the first sentence of the current chapter/ending, so the skip-back control
  // can be disabled at the start of a run (going further back would mean a previous chapter).
  const [canSkipBack, setCanSkipBack] = useState(false);

  // A monotonically increasing token. Every play() bumps it; stop() bumps it. Async steps capture
  // the token they started under and bail the moment it no longer matches, so a stale fetch or an
  // utterance's onend can't resume a cancelled or superseded session.
  const genRef = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  // The chunk list currently being spoken and our position in it, plus the live utterance and a
  // handle to re-enter the speak loop — all in refs so the pause/resume/skip-back controls can act
  // on the in-flight session without tearing down and rebuilding it.
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakRef = useRef<(() => void) | null>(null);

  // Chrome leaves speech wedged if you cancel() while paused; resume() first so cancel() takes hold.
  const hardCancel = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
  }, []);

  // The sentence currently being spoken, plus the set of follow-along listeners. Kept in refs and
  // pushed imperatively so broadcasting each sentence doesn't re-render the provider's consumers.
  const currentRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<(text: string | null) => void>());
  const notify = useCallback((text: string | null) => {
    currentRef.current = text;
    listenersRef.current.forEach((cb) => cb(text));
  }, []);

  const subscribeReading = useCallback((cb: (text: string | null) => void) => {
    listenersRef.current.add(cb);
    cb(currentRef.current);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const isCurrent = (gen: number) => gen === genRef.current;

  const finish = useCallback(
    (gen: number) => {
      if (gen === genRef.current) {
        notify(null);
        setStatus("idle");
      }
    },
    [notify]
  );

  // Speak an ordered list of chunks, one utterance at a time, resolving when the list drains or the
  // session is superseded. The position lives in `chunkIndexRef` (not a closure) so skip-back can
  // rewind it and re-enter the loop via `speakRef`. Reads the live rate per utterance so a speed
  // change applies promptly.
  const speakChunks = useCallback(
    (gen: number, chunks: string[], voice: SpeechSynthesisVoice | null) =>
      new Promise<void>((resolve) => {
        chunksRef.current = chunks;
        chunkIndexRef.current = 0;
        const speak = () => {
          if (!isCurrent(gen) || chunkIndexRef.current >= chunks.length) {
            utteranceRef.current = null;
            speakRef.current = null;
            setCanSkipBack(false);
            resolve();
            return;
          }
          const idx = chunkIndexRef.current;
          setCanSkipBack(idx > 0);
          const text = chunks[idx];
          notify(text);
          const u = new SpeechSynthesisUtterance(text);
          if (voice) u.voice = voice;
          u.rate = rateRef.current;
          utteranceRef.current = u;
          // Advance to the next chunk — but only when this is still the live utterance. A skip-back
          // or stop swaps `utteranceRef` and cancels, so the cancelled utterance's onend is a no-op.
          const advance = () => {
            if (u !== utteranceRef.current) return;
            if (!isCurrent(gen)) {
              resolve();
              return;
            }
            chunkIndexRef.current += 1;
            speak();
          };
          u.onend = advance;
          u.onerror = advance;
          window.speechSynthesis.speak(u);
        };
        speakRef.current = speak;
        speak();
      }),
    [notify]
  );

  // Read one ending aloud, announcing the special ending first (same spirit as the on-screen reveal).
  const readEnding = useCallback(
    async (gen: number, bookId: string, code: string, voice: SpeechSynthesisVoice | null) => {
      const ending = await fetchEnding(bookId, code);
      if (!isCurrent(gen) || !ending) return;
      const chunks = markdownToSpeech(`${ending.title}. ${ending.body}`);
      if (ending.special) chunks.unshift(SPECIAL_ANNOUNCE);
      await speakChunks(gen, chunks, voice);
    },
    [speakChunks]
  );

  // Read from a chapter to the end of the book, then reveal + read a random ending. Navigates the
  // page to each chapter (and the ending) so the view follows the voice.
  const runFromChapter = useCallback(
    async (gen: number, bookId: string, startSlug: string, voice: SpeechSynthesisVoice | null) => {
      let slug = startSlug;
      let first = true;
      while (isCurrent(gen)) {
        // We're already on the first chapter (the reader pressed play there); navigate for the rest.
        if (!first) navigate(`/${bookId}/${slug}`);
        first = false;
        const nav = await fetchChapterNav(bookId, slug);
        if (!isCurrent(gen)) return;
        if (!nav) break;
        await speakChunks(
          gen,
          markdownToSpeech(`${nav.chapter.title}. ${nav.chapter.body}`),
          voice
        );
        if (!isCurrent(gen)) return;
        if (nav.next) {
          slug = nav.next.slug;
          continue;
        }
        // End of the book — pick, show, and read a random ending.
        const code = await fetchRandomCode(bookId);
        if (!isCurrent(gen)) return;
        navigate(`/${bookId}/ending/${code}`);
        await readEnding(gen, bookId, code, voice);
        break;
      }
      finish(gen);
    },
    [navigate, speakChunks, readEnding, finish]
  );

  // Resolve the voice that matches this book's protagonist gender (null → browser default).
  const prepareVoice = useCallback(async (bookId: string) => {
    const [voices, meta] = await Promise.all([getVoicesAsync(), fetchBookMeta(bookId)]);
    return pickVoice(voices, meta?.narrationGender ?? "");
  }, []);

  const begin = useCallback(() => {
    if (!SPEECH_SUPPORTED) return -1;
    const gen = ++genRef.current;
    hardCancel();
    setCanSkipBack(false);
    setStatus("playing");
    return gen;
  }, [hardCancel]);

  const playChapter = useCallback(
    (bookId: string, slug: string) => {
      const gen = begin();
      if (gen < 0) return;
      prepareVoice(bookId).then((voice) => {
        if (isCurrent(gen)) runFromChapter(gen, bookId, slug, voice);
      });
    },
    [begin, prepareVoice, runFromChapter]
  );

  const playEnding = useCallback(
    (bookId: string, code: string) => {
      const gen = begin();
      if (gen < 0) return;
      prepareVoice(bookId).then(async (voice) => {
        if (!isCurrent(gen)) return;
        await readEnding(gen, bookId, code, voice);
        finish(gen);
      });
    },
    [begin, prepareVoice, readEnding, finish]
  );

  const pause = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.resume();
    setStatus("playing");
  }, []);

  // Rewind one sentence within the current run and re-speak from there. Bounded to the active chunk
  // list, so it never re-enters a previous chapter (the button is disabled at the first sentence).
  const skipBack = useCallback(() => {
    if (chunkIndexRef.current <= 0 || !speakRef.current) return;
    chunkIndexRef.current -= 1;
    utteranceRef.current = null; // make the in-flight utterance's onend a no-op before we cancel
    hardCancel(); // also clears any paused state, so the rewound sentence plays
    setStatus("playing");
    speakRef.current();
  }, [hardCancel]);

  const stop = useCallback(() => {
    genRef.current++;
    utteranceRef.current = null;
    speakRef.current = null;
    hardCancel();
    setCanSkipBack(false);
    notify(null);
    setStatus("idle");
  }, [notify, hardCancel]);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    localStorage.setItem(RATE_KEY, String(r));
  }, []);

  // Belt-and-braces: cancel any in-flight speech if the whole app unmounts (e.g. HMR in dev).
  useEffect(
    () => () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    },
    []
  );

  return (
    <ReadAloudContext.Provider
      value={{
        supported: SPEECH_SUPPORTED,
        status,
        rate,
        setRate,
        playChapter,
        playEnding,
        pause,
        resume,
        skipBack,
        canSkipBack,
        stop,
        subscribeReading,
      }}
    >
      {children}
    </ReadAloudContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReadAloud(): ReadAloud {
  const ctx = useContext(ReadAloudContext);
  if (!ctx) throw new Error("useReadAloud must be used within ReadAloudProvider");
  return ctx;
}
