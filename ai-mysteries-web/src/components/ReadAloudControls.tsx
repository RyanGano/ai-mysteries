import { useReadAloud, SPEEDS } from "../lib/read-aloud-context";
import "../styles/read-aloud.css";

// Play/Stop + speed control for the browser read-aloud. Rendered on the chapter reader and the
// ending page; `onPlay` decides what that page starts reading (a chapter run, or a single ending).
export default function ReadAloudControls({ onPlay }: { onPlay: () => void }) {
  const { supported, status, rate, setRate, stop } = useReadAloud();
  if (!supported) return null;

  const playing = status === "playing";
  return (
    <div className="ra-controls">
      <button
        type="button"
        className="ra-button"
        onClick={playing ? stop : onPlay}
        aria-pressed={playing}
        aria-label={playing ? "Stop read aloud" : "Read aloud"}
      >
        <span className="ra-icon" aria-hidden="true">
          {playing ? "■" : "▶"}
        </span>
        {playing ? "Stop" : "Listen"}
      </button>
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
