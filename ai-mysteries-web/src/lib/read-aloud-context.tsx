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

type Status = "idle" | "playing";

interface ReadAloud {
  supported: boolean;
  status: Status;
  rate: number;
  setRate: (rate: number) => void;
  playChapter: (bookId: string, slug: string) => void;
  playEnding: (bookId: string, code: string) => void;
  stop: () => void;
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

  // A monotonically increasing token. Every play() bumps it; stop() bumps it. Async steps capture
  // the token they started under and bail the moment it no longer matches, so a stale fetch or an
  // utterance's onend can't resume a cancelled or superseded session.
  const genRef = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  const isCurrent = (gen: number) => gen === genRef.current;

  const finish = useCallback((gen: number) => {
    if (gen === genRef.current) setStatus("idle");
  }, []);

  // Speak an ordered list of chunks, one utterance at a time, resolving when the list drains or the
  // session is superseded. Reads the live rate per utterance so a speed change applies promptly.
  const speakChunks = useCallback(
    (gen: number, chunks: string[], voice: SpeechSynthesisVoice | null) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const next = () => {
          if (!isCurrent(gen) || i >= chunks.length) {
            resolve();
            return;
          }
          const u = new SpeechSynthesisUtterance(chunks[i++]);
          if (voice) u.voice = voice;
          u.rate = rateRef.current;
          u.onend = () => (isCurrent(gen) ? next() : resolve());
          u.onerror = () => (isCurrent(gen) ? next() : resolve());
          window.speechSynthesis.speak(u);
        };
        next();
      }),
    []
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
    window.speechSynthesis.cancel();
    setStatus("playing");
    return gen;
  }, []);

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

  const stop = useCallback(() => {
    genRef.current++;
    if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
    setStatus("idle");
  }, []);

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
      value={{ supported: SPEECH_SUPPORTED, status, rate, setRate, playChapter, playEnding, stop }}
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
