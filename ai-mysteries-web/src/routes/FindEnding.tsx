import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchRandomCode } from "../lib/api";
import "../styles/find-ending.css";

// /therealending always resolves straight to a weighted-random ending.
// Entering a specific code lives on the landing page (/).
export default function FindEnding() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    fetchRandomCode()
      .then((code) => active && navigate(`/therealending/${code}`, { replace: true }))
      .catch(() => active && navigate("/", { replace: true }));
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="find-ending">
      <p className="find-ending-message">Revealing your ending&hellip;</p>
    </main>
  );
}
