import { useParams, useNavigate } from "react-router-dom";
import { lookupEnding, pickWeightedRandomCode } from "../lib/endings";
import { normalizeCode } from "../lib/code";
import Prose from "../components/Prose";
import "../styles/ending.css";

export default function Ending() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const ending = lookupEnding(code);

  if (!ending) {
    return (
      <main className="ending ending--notfound">
        <p className="ending-notfound-text">
          That code didn&rsquo;t match any ending. Maybe the letters shifted in transit.
        </p>
        <button
          className="cta-button"
          onClick={() => {
            const random = pickWeightedRandomCode();
            navigate(`/therealending/${random}`, { replace: true });
          }}
        >
          Reveal a random ending &rarr;
        </button>
      </main>
    );
  }

  const canonical = normalizeCode(ending.code);

  return (
    <main className="ending">
      <header className="ending-header">
        <p className="ending-code">
          Your ending: <span>{canonical}</span>
        </p>
        <h1 className="ending-title">{ending.title}</h1>
      </header>
      <article className="ending-body">
        <Prose>{ending.body}</Prose>
      </article>
    </main>
  );
}
