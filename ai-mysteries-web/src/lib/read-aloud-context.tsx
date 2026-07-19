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

// Media Session API — the difference between "reads a sentence then stops when the screen locks"
// and "plays the whole book with the phone in your pocket". Declaring an active media session with
// metadata tells the OS/browser this tab is a real background-audio player: it keeps the audio
// pipeline alive (so the chunk-to-chunk `ended` handlers keep firing while locked) and surfaces
// lock-screen / notification transport controls. Site chrome only — the artist string is the site
// brand, the title is the book's own title (book data, fetched per book), never anything else.
const MEDIA_SESSION = typeof navigator !== "undefined" && "mediaSession" in navigator;
const MEDIA_ARTIST = "AI Mysteries";

function setMediaPlayback(state: MediaSessionPlaybackState) {
  if (MEDIA_SESSION) navigator.mediaSession.playbackState = state;
}

function setMediaTitle(title: string) {
  if (!MEDIA_SESSION || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: MEDIA_ARTIST });
}

// A tiny silent WAV, played once inside the user's click so mobile browsers "unlock" the reused
// audio elements — later programmatic src swaps + play() calls then work with the screen locked.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAA==";

type Status = "idle" | "preparing" | "playing" | "paused";

// The whole-book reader downloads every chunk up front and stitches them into ONE continuous MP3
// played through a single element (see playBook). Azure synthesizes CBR at this bitrate, so a
// chunk's play-time is just its byte length over the bitrate — enough to drive the follow-along
// highlight off the single file's timeline without decoding anything.
const AUDIO_BITRATE_BPS = 96_000;

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

  // Which engine the transport controls should talk to for the current track. "audio" = the
  // per-chunk element player (single chapter/ending); "file" = the whole-book single continuous MP3;
  // "speech" = the browser voice fallback.
  const modeRef = useRef<"speech" | "audio" | "file">("speech");
  // Whole-book single-file playback: the object URL of the stitched MP3 (revoked on stop) and the
  // start time (seconds) of each chunk within it, used to drive the follow-along highlight.
  const fileUrlRef = useRef<string | null>(null);
  const fileOffsetsRef = useRef<number[]>([]);
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
      el.ontimeupdate = null;
      el.pause();
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
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
        setMediaPlayback("none");
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

  // Core audio engine: play a flat, already-resolved sequence of chunks ({ spoken text, chunk URL })
  // through a SINGLE reused <audio> element, advancing to the next chunk from inside the previous
  // chunk's `ended` handler. This is the key to screen-off playback: a locked phone keeps only the
  // one element that's actively sounding alive, and permits a fresh play() only as a continuation on
  // that same element from inside a media event. The old design broke this two ways — it alternated
  // between two elements (every other sentence tried to start on the *idle* one) and it drove
  // chapter boundaries with fresh play() calls off promise resolutions; the OS silently blocks both
  // in the background, so the reader heard a sentence or two after locking and then stalled.
  // A flat sequence lets the whole book (all chapters + the ending) play as one unbroken run with
  // every hop — sentence-to-sentence and chapter-to-chapter — happening inside `ended`. The second
  // element only ever preloads/warms the next chunk's blob (and triggers its synthesis on a cache
  // miss); it is never played, so it holds no audio focus and can't steal the OS media session.
  // Resolves when the sequence drains; rejects (with chunkIndexRef at the failed position) to
  // request the speech fallback.
  const playAudioSequence = useCallback(
    (gen: number, seq: { text: string; url: string }[]) =>
      new Promise<void>((resolve, reject) => {
        const els = audioElsRef.current;
        if (!els || seq.length === 0) {
          reject(new Error("no audio"));
          return;
        }
        modeRef.current = "audio";
        chunksRef.current = seq.map((c) => c.text);
        chunkIndexRef.current = 0;
        const el = els[0]; // the one sounding element, for the whole run
        const warm = els[1]; // preload-only; never played

        const applyRate = (element: HTMLAudioElement) => {
          // Loading a new src resets playbackRate to defaultPlaybackRate, so pin both.
          element.defaultPlaybackRate = rateRef.current;
          element.playbackRate = rateRef.current;
        };

        const step = () => {
          if (!isCurrent(gen) || chunkIndexRef.current >= seq.length) {
            stopAudioElements();
            speakRef.current = null;
            setCanSkipBack(false);
            resolve();
            return;
          }
          const idx = chunkIndexRef.current;
          setCanSkipBack(idx > 0);
          notify(seq[idx].text);

          const url = seq[idx].url;
          const token = {};
          playTokenRef.current = token;
          currentElRef.current = el;
          const live = () => playTokenRef.current === token && isCurrent(gen);

          el.onended = () => {
            if (!live()) return;
            chunkIndexRef.current += 1;
            step(); // start the next chunk synchronously inside `ended` → allowed while locked
          };
          // One delayed retry per chunk (a cold chunk can hit a transient synthesis 503); after
          // that, hand the rest of the run to the browser voice rather than stalling.
          let retried = false;
          const onError = () => {
            if (!live()) return;
            if (!retried) {
              retried = true;
              window.setTimeout(() => {
                if (!live()) return;
                el.src = url;
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

          // Fresh src on the same element each chunk (every chunk URL differs), then play.
          el.src = url;
          applyRate(el);
          el.play().catch(() => {
            if (live()) onError();
          });

          // Warm the next chunk's blob/synthesis on the idle element — a download only. It is never
          // played, so it holds no audio focus and can't disrupt background playback of `el`.
          if (idx + 1 < seq.length) {
            const nextUrl = seq[idx + 1].url;
            if (warm.dataset.src !== nextUrl) {
              warm.onended = null;
              warm.onerror = null;
              warm.dataset.src = nextUrl;
              warm.preload = "auto";
              warm.src = nextUrl;
            }
          }
        };

        speakRef.current = step;
        step();
      }),
    [notify, stopAudioElements]
  );

  // One track (a single chapter or ending) as an audio sequence.
  const playAudioChunks = useCallback(
    (gen: number, track: PlayTrack) => {
      const audio = track.audio;
      if (!audio) return Promise.reject(new Error("no audio"));
      const seq = track.chunks.map((text, i) => ({
        text,
        url: audioChunkUrl(audio.bookId, audio.hash, i),
      }));
      return playAudioSequence(gen, seq);
    },
    [playAudioSequence]
  );

  // Whole-book screen-off playback. Chunked playback (swapping an element's src per sentence) is
  // inherently fragile once the phone locks — every src swap is a moment the browser can decide the
  // audio "stopped" and suspend the tab. So here we download every chunk of every chapter (+ the
  // ending) up front, stitch them into ONE continuous MP3, and play it through a single element with
  // a single play() and zero JS hops for the entire book — the one shape a locked browser keeps
  // alive. `chunkUrls` is the flat, in-order list of chunk URLs; `texts` the matching spoken text
  // (for the follow-along highlight). Resolves when the book finishes; rejects (before playback
  // starts) to fall back to per-item speech. `onProgress` reports fetch progress 0..1.
  const playBook = useCallback(
    async (
      gen: number,
      chunkUrls: string[],
      texts: string[],
      onProgress?: (done: number, total: number) => void
    ) => {
      const els = audioElsRef.current;
      if (!els || chunkUrls.length === 0) throw new Error("no audio");
      const el = els[0];

      // Fetch every chunk's bytes, in order, with a little concurrency. A cold chunk is synthesized
      // on first fetch, so a whole-book build can be slow the very first time it's listened to (after
      // that they're cached blobs and it's quick) — and during a cold build the free-tier API can
      // rate-limit (429) or briefly fail a slow synthesis (5xx). Those are transient, so we RETRY
      // with backoff rather than aborting the whole book (which would drop the reader to the robot
      // voice). Only a genuine 4xx (other than 429) or exhausting the retries gives up.
      const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
      const fetchChunkBytes = async (url: string): Promise<ArrayBuffer> => {
        const MAX_ATTEMPTS = 8;
        let backoff = 700;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (!isCurrent(gen)) throw new Error("cancelled");
          let resp: Response;
          try {
            resp = await fetch(url);
          } catch (err) {
            // Network error — transient; retry unless we've run out of attempts.
            if (attempt === MAX_ATTEMPTS) throw err;
            await sleep(backoff);
            backoff = Math.min(backoff * 2, 8000);
            continue;
          }
          if (resp.ok) return await resp.arrayBuffer();
          // A 4xx that isn't 429 won't fix itself — fail fast (don't burn the retry budget).
          if (resp.status !== 429 && resp.status < 500) throw new Error(`chunk ${resp.status}`);
          // 429 / 5xx: rate-limited or a slow cold synthesis — wait and retry.
          if (attempt === MAX_ATTEMPTS) throw new Error(`chunk ${resp.status}`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 8000);
        }
        throw new Error("chunk fetch exhausted");
      };

      const buffers = new Array<ArrayBuffer>(chunkUrls.length);
      let done = 0;
      let cursor = 0;
      const worker = async () => {
        for (;;) {
          const i = cursor++;
          if (i >= chunkUrls.length) return;
          if (!isCurrent(gen)) throw new Error("cancelled");
          buffers[i] = await fetchChunkBytes(chunkUrls[i]);
          onProgress?.(++done, chunkUrls.length);
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      if (!isCurrent(gen)) throw new Error("cancelled");

      // Per-chunk start times from byte length at the known CBR bitrate, and one stitched blob.
      const offsets = new Array<number>(chunkUrls.length);
      let t = 0;
      for (let i = 0; i < buffers.length; i++) {
        offsets[i] = t;
        t += (buffers[i].byteLength * 8) / AUDIO_BITRATE_BPS;
      }
      const blobUrl = URL.createObjectURL(new Blob(buffers, { type: "audio/mpeg" }));
      fileUrlRef.current = blobUrl;
      modeRef.current = "file";
      chunksRef.current = texts;
      fileOffsetsRef.current = offsets;
      chunkIndexRef.current = 0;
      currentElRef.current = el;

      await new Promise<void>((resolve, reject) => {
        const token = {};
        playTokenRef.current = token;
        const live = () => playTokenRef.current === token && isCurrent(gen);
        let shown = -1;

        // Drive the follow-along highlight off the single file's playback position.
        el.ontimeupdate = () => {
          if (!live()) return;
          const ct = el.currentTime;
          let i = chunkIndexRef.current;
          while (i + 1 < offsets.length && ct >= offsets[i + 1]) i++;
          while (i > 0 && ct < offsets[i]) i--;
          chunkIndexRef.current = i;
          if (i !== shown) {
            shown = i;
            setCanSkipBack(i > 0);
            notify(texts[i]);
          }
        };
        el.onended = () => {
          if (!live()) return;
          resolve();
        };
        el.onerror = () => {
          if (!live()) return;
          reject(new Error("book playback failed"));
        };
        // Skip-back seeks to the previous chunk's start on the same continuous file.
        speakRef.current = () => {
          const to = fileOffsetsRef.current[chunkIndexRef.current] ?? 0;
          try {
            el.currentTime = to;
          } catch {
            /* not seekable yet */
          }
          notify(texts[chunkIndexRef.current] ?? null);
          el.play().catch(() => {
            /* resume handled elsewhere */
          });
        };

        el.src = blobUrl;
        el.defaultPlaybackRate = rateRef.current;
        el.playbackRate = rateRef.current;
        try {
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
        el.play()
          .then(() => {
            // Sound is actually rolling now — leave the "preparing" state.
            if (live()) {
              setStatus("playing");
              setMediaPlayback("playing");
            }
          })
          .catch(() => {
            if (live()) reject(new Error("book play() rejected"));
          });
      });
    },
    [notify]
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
    // Always resolve the book meta (even without speech support) so the media-session title names
    // the actual book on the lock screen; the voice pick only matters for the speech fallback.
    const meta = await fetchBookMeta(bookId).catch(() => null);
    if (meta?.title) setMediaTitle(meta.title);
    if (!SPEECH_SUPPORTED) return null;
    const voices = await getVoicesAsync();
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
      if (!audioElsRef.current) {
        const make = () => {
          const a = new Audio();
          a.preload = "auto";
          // iOS: play inline, don't hijack to a fullscreen player.
          a.setAttribute("playsinline", "");
          // Attach to the document. A detached `new Audio()` is treated as throwaway media and gets
          // suspended when the tab backgrounds / the screen locks (audio cut off mid-word); an
          // in-document media element gets real background-audio treatment and binds to the OS media
          // session. It has no controls, so it renders nothing — pin it to zero size just in case.
          a.style.position = "fixed";
          a.style.width = "0";
          a.style.height = "0";
          a.style.opacity = "0";
          a.style.pointerEvents = "none";
          document.body.appendChild(a);
          return a;
        };
        audioElsRef.current = [make(), make()];
      }
      for (const el of audioElsRef.current) {
        el.src = SILENT_WAV;
        delete el.dataset.src;
        el.play().catch(() => {
          /* unlock is best-effort */
        });
      }
    }
    // Activate the OS media session inside the gesture with a placeholder title; prepareVoice
    // refines it to the actual book title once the meta loads.
    setMediaTitle(MEDIA_ARTIST);
    setCanSkipBack(false);
    setStatus("playing");
    setMediaPlayback("playing");
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

        // Best case for screen-off listening: every item has server audio, so download the ENTIRE
        // book (all chapters + the ending) and stitch it into ONE continuous MP3 played through a
        // single element — a single play(), zero JS hops, which is the one playback shape a locked
        // phone reliably keeps alive. Chunked/streamed playback stalled the moment the screen
        // locked. (The special ending's manifest already carries the spoken announce as its own
        // first chunk, so no client-side unshift is needed on the audio path.)
        if (audioElsRef.current && manifests.every((m) => m)) {
          const seq = manifests.flatMap((m) =>
            m!.chunks.map((text, i) => ({ text, url: audioChunkUrl(bookId, m!.hash, i) }))
          );
          // Downloading + stitching happens before any sound — surface it as a "preparing" state.
          setStatus("preparing");
          try {
            await playBook(
              gen,
              seq.map((c) => c.url),
              seq.map((c) => c.text)
            );
            finish(gen);
            return;
          } catch {
            if (!isCurrent(gen)) return;
            // Couldn't build/play the single file — fall back to the browser voice for the whole run.
            setStatus("playing");
            setMediaPlayback("playing");
            await speakChunks(
              gen,
              seq.map((c) => c.text),
              voice
            );
            finish(gen);
            return;
          }
        }

        // Mixed (a book without full server audio): play item by item, speaking where a manifest is
        // missing. This path degrades to the continuous browser-speech read the page was built for.
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
    [begin, prepareVoice, playBook, speakChunks, playTrack, finish]
  );

  const pause = useCallback(() => {
    if (modeRef.current === "speech") {
      if (SPEECH_SUPPORTED) window.speechSynthesis.pause();
    } else {
      currentElRef.current?.pause();
    }
    setStatus("paused");
    setMediaPlayback("paused");
  }, []);

  const resume = useCallback(() => {
    if (modeRef.current === "speech") {
      if (SPEECH_SUPPORTED) window.speechSynthesis.resume();
    } else {
      currentElRef.current?.play().catch(() => {
        /* the chunk's onerror handles a dead resume */
      });
    }
    setStatus("playing");
    setMediaPlayback("playing");
  }, []);

  // Rewind one sentence within the current run and re-play from there. Bounded to the active chunk
  // list, so it never re-enters a previous chapter (the button is disabled at the first sentence).
  const skipBack = useCallback(() => {
    if (chunkIndexRef.current <= 0 || !speakRef.current) return;
    chunkIndexRef.current -= 1;
    if (modeRef.current === "file") {
      // Single continuous file: just seek back to the previous chunk's start; the element keeps
      // playing (no token/handler juggling), so background playback is never interrupted.
      speakRef.current();
      setStatus("playing");
      return;
    }
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
    setMediaPlayback("none");
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

  // Wire the OS lock-screen / notification transport controls to our engine-agnostic transport, so
  // the play/pause/previous/stop buttons the media session shows actually drive playback. Registered
  // once; the handlers close over the stable useCallbacks.
  useEffect(() => {
    if (!MEDIA_SESSION) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => resume()],
      ["pause", () => pause()],
      ["previoustrack", () => skipBack()],
      ["stop", () => stop()],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* browser doesn't support this action — skip it */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [resume, pause, skipBack, stop]);

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
