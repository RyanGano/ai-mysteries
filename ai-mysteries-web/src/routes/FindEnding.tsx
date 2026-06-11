import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRandomCode } from "../lib/api";
import "../styles/find-ending.css";

// /:bookId/ending always resolves straight to a weighted-random ending.
// Entering a specific code lives on the landing page (/).
export default function FindEnding() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "AI Mysteries";
  }, []);

  useEffect(() => {
    if (!bookId) return;
    let active = true;
    fetchRandomCode(bookId)
      .then((code) => active && navigate(`/${bookId}/ending/${code}`, { replace: true }))
      .catch(() => active && navigate("/", { replace: true }));
    return () => {
      active = false;
    };
  }, [bookId, navigate]);

  return (
    <main className="find-ending">
      <p className="find-ending-message">Revealing your ending&hellip;</p>
    </main>
  );
}
