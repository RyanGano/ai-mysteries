import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRandomEnding } from "../lib/api";
import { getSeen } from "../lib/seen-endings";
import Loading from "../components/Loading";
import EndingsExhausted from "../components/EndingsExhausted";

// /:bookId/ending always resolves straight to a weighted-random ending.
// Entering a specific code lives on the landing page (/).
export default function FindEnding() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    document.title = "AI Mysteries";
  }, []);

  useEffect(() => {
    if (!bookId) return;
    let active = true;
    fetchRandomEnding(bookId, getSeen(bookId))
      .then((res) => {
        if (!active) return;
        if ("exhausted" in res) setExhausted(true);
        else navigate(`/${bookId}/ending/${res.code}`, { replace: true });
      })
      .catch(() => active && navigate("/", { replace: true }));
    return () => {
      active = false;
    };
  }, [bookId, navigate]);

  return exhausted ? <EndingsExhausted bookId={bookId} /> : <Loading variant="ending" />;
}
