import { useReadAloud, SPEEDS } from "../lib/read-aloud-context";
import "../styles/read-aloud.css";

// Play/Stop + Pause/Resume + Skip-back + speed control for the browser read-aloud. Rendered on the
// chapter reader and the ending page; `onPlay` decides what that page starts reading (a chapter
// run, or a single ending). Pause and Skip back only appear once a session is under way.
export default function ReadAloudControls({ onPlay }: { onPlay: () => void }) {
  const { supported, status, rate, setRate, stop, pause, resume, skipBack, canSkipBack } =
    useReadAloud();
  if (!supported) return null;

  const active = status === "playing" || status === "paused";
  const paused = status === "paused";
  return (
    <div className="ra-controls">
      <button
        type="button"
        className="ra-button"
        onClick={active ? stop : onPlay}
        aria-pressed={active}
        aria-label={active ? "Stop read aloud" : "Read aloud"}
      >
        <span className="ra-icon" aria-hidden="true">
          {active ? "■" : "▶"}
        </span>
        {active ? "Stop" : "Listen"}
      </button>
      {active && (
        <>
          <button
            type="button"
            className="ra-button"
            onClick={skipBack}
            disabled={!canSkipBack}
            aria-label="Skip back one sentence"
          >
            <span className="ra-icon" aria-hidden="true">
              ⏮
            </span>
            Back
          </button>
          <button
            type="button"
            className="ra-button"
            onClick={paused ? resume : pause}
            aria-pressed={paused}
            aria-label={paused ? "Resume read aloud" : "Pause read aloud"}
          >
            <span className="ra-icon" aria-hidden="true">
              {paused ? "▶" : "❚❚"}
            </span>
            {paused ? "Resume" : "Pause"}
          </button>
        </>
      )}
      <label className="ra-speed">
        <span className="ra-speed-label">Speed</span>
        <select
          className="ra-speed-select"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="Reading speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
