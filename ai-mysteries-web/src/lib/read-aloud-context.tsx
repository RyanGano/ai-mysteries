// Read-aloud orchestration. Lives above the routes (mounted in App) so playback keeps going
// while the reader auto-advances from chapter to chapter and finally into a random ending —
// component routes unmount as the page follows along, but this provider and the audio do not.
//
// Two playback engines share one chunk-list machine (position, skip-back, follow-along notify):
// the preferred one streams neural-voice MP3 chunks synthesized server-side (fetched via the
// audio manifest endpoints and played through a pair of reused <audio> elements — one playing,
// one prefetching the next chunk); when a book has no server audio, or a chunk errors out, it
// falls back to the browser's built-in speechSynthesis exactly as before.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchChapterNav,
  fetchEnding,
  fetchRandomEnding,
  fetchBookMeta,
  fetchChapterAudio,
  fetchEndingAudio,
  audioChunkUrl,
} from "./api";
import { getSeen } from "./seen-endings";
import { SPEECH_SUPPORTED, markdownToSpeech, getVoicesAsync, pickVoice } from "./tts";

// Generic, book-agnostic chrome (like the button verbs) — never book-specific copy. The server
// audio manifest for a special ending includes this same announce as its first chunk.
export const SPECIAL_ANNOUNCE = "You got the special ending!";

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const RATE_KEY = "readAloudRate";

// <audio> playback of the server-synthesized chunks. Effectively universal, but feature-check
// anyway so `supported` stays honest.
const AUDIO_SUPPORTED = typeof window !== "undefined" && "Audio" in window;

// A tiny silent WAV, played once inside the user's click so mobile browsers "unlock" the reused
// audio elements — later programmatic src swaps + play() calls then work with the screen locked.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAA==";

type Status = "idle" | "playing" | "paused";

// What one continuous read is made of: the chunk texts (always present — they drive the
// follow-along highlight and the speech fallback), plus the server audio address when available.
interface PlayTrack {
  chunks: string[];
  audio?: { bookId: string; hash: string };
}

// One entry of a caller-assembled listen-through (the whole-book reader): where the audio
// manifest lives, and the raw text to speak if it doesn't.
export interface PlayItem {
  kind: "chapter" | "ending";
  key: string; // chapter slug or ending code
  text: string; // markdown, chunked client-side only on fallback
  special?: boolean;
}

interface ReadAloud {
  supported: boolean;
  status: Status;
  rate: number;
  setRate: (rate: number) => void;
  playChapter: (bookId: string, slug: string) => void;
  playEnding: (bookId: string, code: string) => void;
  // Read a caller-assembled list of chapters + an ending straight through — all manifests are
  // resolved up front, so chapter boundaries need no page navigation. Used by the whole-book
  // reader, which has already rendered everything on one page before calling this.
  playList: (bookId: string, items: PlayItem[]) => void;
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
  const supported = AUDIO_SUPPORTED || SPEECH_SUPPORTED;
  const [status, setStatus] = useState<Status>("idle");
  const [rate, setRateState] = useState<number>(() => (supported ? loadRate() : 1));
  // True once we're past the first sentence of the current chapter/ending, so the skip-back control
  // can be disabled at the start of a run (going further back would mean a previous chapter).
  const [canSkipBack, setCanSkipBack] = useState(false);

  // A monotonically increasing token. Every play() bumps it; stop() bumps it. Async steps capture
  // the token they started under and bail the moment it no longer matches, so a stale fetch or a
  // finished chunk's callback can't resume a cancelled or superseded session.
  const genRef = useRef(0);
  const rateRef = useRef(rate);
  rateRef.current = rate;

  // The chunk list currently playing and our position in it, plus handles to the live utterance /
  // audio element and a way to re-enter the play loop — all in refs so the pause/resume/skip-back
  // controls can act on the in-flight session without tearing down and rebuilding it.
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakRef = useRef<(() => void) | null>(null);

  // Which engine the transport controls should talk to for the current track.
  const modeRef = useRef<"speech" | "audio">("speech");
  // The reused audio element pair (created + unlocked inside the user's gesture) and the one
  // currently playing. `playTokenRef` marks the live chunk, so a superseded chunk's ended/error
  // handlers become no-ops (the audio twin of the utteranceRef identity check).
  const audioElsRef = useRef<HTMLAudioElement[] | null>(null);
  const currentElRef = useRef<HTMLAudioElement | null>(null);
  const playTokenRef = useRef<object | null>(null);

  // Chrome leaves speech wedged if you cancel() while paused; resume() first so cancel() takes hold.
  const hardCancel = useCallback(() => {
    if (!SPEECH_SUPPORTED) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
  }, []);

  const stopAudioElements = useCallback(() => {
    playTokenRef.current = null;
    currentElRef.current = null;
    for (const el of audioElsRef.current ?? []) {
      el.onended = null;
      el.onerror = null;
      el.pause();
    }
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

  // Speak an ordered list of chunks with the browser voice, one utterance at a time, resolving
  // when the list drains or the session is superseded. The position lives in `chunkIndexRef` (not
  // a closure) so skip-back can rewind it and re-enter the loop via `speakRef`. Reads the live
  // rate per utterance so a speed change applies promptly. `startAt` lets the audio engine hand
  // over mid-track after an error without repeating what was already heard.
  const speakChunks = useCallback(
    (gen: number, chunks: string[], voice: SpeechSynthesisVoice | null, startAt = 0) =>
      new Promise<void>((resolve) => {
        if (!SPEECH_SUPPORTED) {
          resolve();
          return;
        }
        modeRef.current = "speech";
        chunksRef.current = chunks;
        chunkIndexRef.current = startAt;
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

  // Play a track's server-synthesized chunks through the reused element pair: the current chunk
  // plays on one element while the next preloads on the other (which also lets the API synthesize
  // it ahead of time on a cache miss). Resolves when the track drains; rejects to request the
  // speech fallback (chunkIndexRef then holds where to pick up).
  const playAudioChunks = useCallback(
    (gen: number, track: PlayTrack) =>
      new Promise<void>((resolve, reject) => {
        const els = audioElsRef.current;
        const audio = track.audio;
        if (!els || !audio) {
          reject(new Error("no audio"));
          return;
        }
        modeRef.current = "audio";
        chunksRef.current = track.chunks;
        chunkIndexRef.current = 0;
        const urlOf = (i: number) => audioChunkUrl(audio.bookId, audio.hash, i);

        const step = () => {
          if (!isCurrent(gen) || chunkIndexRef.current >= track.chunks.length) {
            stopAudioElements();
            speakRef.current = null;
            setCanSkipBack(false);
            resolve();
            return;
          }
          const idx = chunkIndexRef.current;
          setCanSkipBack(idx > 0);
          notify(track.chunks[idx]);

          const el = els[idx % 2];
          const other = els[(idx + 1) % 2];
          const url = urlOf(idx);
          const token = {};
          playTokenRef.current = token;
          currentElRef.current?.pause();
          currentElRef.current = el;
          const live = () => playTokenRef.current === token && isCurrent(gen);

          el.onended = () => {
            if (!live()) return;
            chunkIndexRef.current += 1;
            step();
          };
          // One delayed retry per chunk (a cold chunk can hit a transient synthesis 503); after
          // that, hand the rest of the track to the browser voice rather than stalling.
          let retried = false;
          const onError = () => {
            if (!live()) return;
            if (!retried) {
              retried = true;
              window.setTimeout(() => {
                if (!live()) return;
                el.src = url;
                el.dataset.src = url;
                applyRate(el);
                el.play().catch(() => {
                  if (live()) onError();
                });
              }, 1500);
              return;
            }
            stopAudioElements();
            reject(new Error("audio chunk failed"));
          };
          el.onerror = onError;

          if (el.dataset.src !== url) {
            el.dataset.src = url;
            el.src = url;
          }
          applyRate(el);
          if (el.dataset.src === url && el.currentTime > 0) {
            try {
              el.currentTime = 0;
            } catch {
              /* not seekable yet — it plays from the start anyway */
            }
          }
          el.play().catch(() => {
            if (live()) onError();
          });

          // Preload the next chunk on the idle element (this is also what triggers its synthesis
          // ahead of playback on a cache miss).
          if (idx + 1 < track.chunks.length) {
            const nextUrl = urlOf(idx + 1);
            if (other.dataset.src !== nextUrl) {
              other.onended = null;
              other.onerror = null;
              other.dataset.src = nextUrl;
              other.preload = "auto";
              other.src = nextUrl;
            }
          }
        };

        const applyRate = (el: HTMLAudioElement) => {
          // Loading a new src resets playbackRate to defaultPlaybackRate, so pin both.
          el.defaultPlaybackRate = rateRef.current;
          el.playbackRate = rateRef.current;
        };

        speakRef.current = step;
        step();
      }),
    [notify, stopAudioElements]
  );

  // Play one track: neural audio when the manifest gave us an address, the browser voice
  // otherwise — and if audio dies mid-track, continue from that sentence with the browser voice.
  const playTrack = useCallback(
    async (gen: number, track: PlayTrack, voice: SpeechSynthesisVoice | null) => {
      if (track.audio && audioElsRef.current) {
        try {
          await playAudioChunks(gen, track);
          return;
        } catch {
          if (!isCurrent(gen)) return;
        }
        await speakChunks(gen, track.chunks, voice, chunkIndexRef.current);
        return;
      }
      await speakChunks(gen, track.chunks, voice);
    },
    [playAudioChunks, speakChunks]
  );

  // Resolve a chapter into a playable track: prefer the server audio manifest, fall back to
  // client-side chunking of the text we already have.
  const chapterTrack = useCallback(
    async (bookId: string, slug: string, title: string, body: string): Promise<PlayTrack> => {
      const manifest = await fetchChapterAudio(bookId, slug).catch(() => null);
      if (manifest) return { chunks: manifest.chunks, audio: { bookId, hash: manifest.hash } };
      // Paragraph break after the title so it chunks on its own — merged with the first sentence
      // it would contain heading text no <p> matches, killing the opening follow-along highlight.
      return { chunks: markdownToSpeech(`${title}.\n\n${body}`) };
    },
    []
  );

  // Read one ending aloud, announcing the special ending first (same spirit as the on-screen
  // reveal — the server manifest already includes the announce as its first chunk).
  const readEnding = useCallback(
    async (gen: number, bookId: string, code: string, voice: SpeechSynthesisVoice | null) => {
      const [ending, manifest] = await Promise.all([
        fetchEnding(bookId, code),
        fetchEndingAudio(bookId, code).catch(() => null),
      ]);
      if (!isCurrent(gen) || !ending) return;
      let track: PlayTrack;
      if (manifest) {
        track = { chunks: manifest.chunks, audio: { bookId, hash: manifest.hash } };
      } else {
        const chunks = markdownToSpeech(`${ending.title}.\n\n${ending.body}`);
        if (ending.special) chunks.unshift(SPECIAL_ANNOUNCE);
        track = { chunks };
      }
      await playTrack(gen, track, voice);
    },
    [playTrack]
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
        const track = await chapterTrack(bookId, slug, nav.chapter.title, nav.chapter.body);
        if (!isCurrent(gen)) return;
        await playTrack(gen, track, voice);
        if (!isCurrent(gen)) return;
        if (nav.next) {
          slug = nav.next.slug;
          continue;
        }
        // End of the book — pick, show, and read a random ending. If the reader has already seen
        // every ending this session, there's nothing new to read, so just finish.
        const res = await fetchRandomEnding(bookId, getSeen(bookId));
        if (!isCurrent(gen)) return;
        if ("exhausted" in res) break;
        navigate(`/${bookId}/ending/${res.code}`);
        await readEnding(gen, bookId, res.code, voice);
        break;
      }
      finish(gen);
    },
    [navigate, chapterTrack, playTrack, readEnding, finish]
  );

  // Resolve the browser voice that matches this book's protagonist gender (null → browser
  // default). Only the speech fallback uses it — server audio picks its voice server-side from
  // the same narrationGender.
  const prepareVoice = useCallback(async (bookId: string) => {
    if (!SPEECH_SUPPORTED) return null;
    const [voices, meta] = await Promise.all([getVoicesAsync(), fetchBookMeta(bookId)]);
    return pickVoice(voices, meta?.narrationGender ?? "");
  }, []);

  const begin = useCallback(() => {
    if (!supported) return -1;
    const gen = ++genRef.current;
    hardCancel();
    stopAudioElements();
    // Create + unlock the audio element pair inside the user's gesture, so later programmatic
    // plays (next chunks, next chapters) are allowed even once the screen locks.
    if (AUDIO_SUPPORTED) {
      audioElsRef.current ??= [new Audio(), new Audio()];
      for (const el of audioElsRef.current) {
        el.src = SILENT_WAV;
        delete el.dataset.src;
        el.play().catch(() => {
          /* unlock is best-effort */
        });
      }
    }
    setCanSkipBack(false);
    setStatus("playing");
    return gen;
  }, [supported, hardCancel, stopAudioElements]);

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

  // Play a caller-assembled list (whole book + ending) straight through. Every manifest is
  // resolved up front so chapter boundaries don't wait on the network; on books without server
  // audio this degrades to the continuous speech read the whole-book page was built for.
  const playList = useCallback(
    (bookId: string, items: PlayItem[]) => {
      const gen = begin();
      if (gen < 0) return;
      prepareVoice(bookId).then(async (voice) => {
        if (!isCurrent(gen)) return;
        const manifests = await Promise.all(
          items.map((item) =>
            (item.kind === "chapter"
              ? fetchChapterAudio(bookId, item.key)
              : fetchEndingAudio(bookId, item.key)
            ).catch(() => null)
          )
        );
        if (!isCurrent(gen)) return;
        for (let i = 0; i < items.length; i++) {
          if (!isCurrent(gen)) break;
          const manifest = manifests[i];
          let track: PlayTrack;
          if (manifest) {
            track = { chunks: manifest.chunks, audio: { bookId, hash: manifest.hash } };
          } else {
            const chunks = markdownToSpeech(items[i].text);
            if (items[i].special) chunks.unshift(SPECIAL_ANNOUNCE);
            track = { chunks };
          }
          await playTrack(gen, track, voice);
        }
        finish(gen);
      });
    },
    [begin, prepareVoice, playTrack, finish]
  );

  const pause = useCallback(() => {
    if (modeRef.current === "audio") currentElRef.current?.pause();
    else if (SPEECH_SUPPORTED) window.speechSynthesis.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (modeRef.current === "audio")
      currentElRef.current?.play().catch(() => {
        /* the chunk's onerror handles a dead resume */
      });
    else if (SPEECH_SUPPORTED) window.speechSynthesis.resume();
    setStatus("playing");
  }, []);

  // Rewind one sentence within the current run and re-play from there. Bounded to the active chunk
  // list, so it never re-enters a previous chapter (the button is disabled at the first sentence).
  const skipBack = useCallback(() => {
    if (chunkIndexRef.current <= 0 || !speakRef.current) return;
    chunkIndexRef.current -= 1;
    if (modeRef.current === "audio") {
      playTokenRef.current = null; // make the in-flight chunk's handlers no-ops
      currentElRef.current?.pause();
    } else {
      utteranceRef.current = null; // make the in-flight utterance's onend a no-op before we cancel
      hardCancel(); // also clears any paused state, so the rewound sentence plays
    }
    setStatus("playing");
    speakRef.current();
  }, [hardCancel]);

  const stop = useCallback(() => {
    genRef.current++;
    utteranceRef.current = null;
    speakRef.current = null;
    stopAudioElements();
    hardCancel();
    setCanSkipBack(false);
    notify(null);
    setStatus("idle");
  }, [notify, hardCancel, stopAudioElements]);

  const setRate = useCallback((r: number) => {
    rateRef.current = r;
    setRateState(r);
    localStorage.setItem(RATE_KEY, String(r));
    // Speech reads the rate per utterance; audio applies it to the live elements immediately.
    for (const el of audioElsRef.current ?? []) {
      el.defaultPlaybackRate = r;
      el.playbackRate = r;
    }
  }, []);

  // Belt-and-braces: halt any in-flight playback if the whole app unmounts (e.g. HMR in dev).
  useEffect(
    () => () => {
      if (SPEECH_SUPPORTED) window.speechSynthesis.cancel();
      for (const el of audioElsRef.current ?? []) el.pause();
    },
    []
  );

  return (
    <ReadAloudContext.Provider
      value={{
        supported,
        status,
        rate,
        setRate,
        playChapter,
        playEnding,
        playList,
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
